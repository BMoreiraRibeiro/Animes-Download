const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const https = require('https');
const sanitize = require('sanitize-filename');

// Configurações
let DOWNLOAD_FOLDER;
const ANIME_LIST_FILE = process.env.ANIME_LIST_FILE || path.join(__dirname, 'anime-list.txt');
const CONFIG_FILE = path.join(__dirname, 'config.json');
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
const STATUS_FILE = path.join(__dirname, 'download-status.json');

// Rastrear arquivos temporários que estão sendo baixados
const tempFiles = new Set();

// Rastrear status de downloads
const downloadStatus = {
    current: null, // Anime atual sendo baixado
    queue: [],  // Fila de animes aguardando download
    completed: [], // Animes já baixados
    progress: {}, // Progresso detalhado por anime
    lastUpdate: new Date().toISOString()
};

// Configurações padrão
const DEFAULT_CONFIG = {
    defaultQuality: 'HD', // Pode ser 'HD' ou 'SD'
    startFromEpisode: 1,  // Começar do episódio 1 por padrão
    downloadFolder: path.join(__dirname, 'downloads') // Pasta padrão para downloads
};

// Carregar configurações
let CONFIG = DEFAULT_CONFIG;
try {
    if (fs.existsSync(CONFIG_FILE)) {
        const configContent = fs.readFileSync(CONFIG_FILE, 'utf8');
        console.log(`Loading configuration from: ${CONFIG_FILE}`);
        
        if (configContent && configContent.trim() !== '') {
            CONFIG = { ...DEFAULT_CONFIG, ...JSON.parse(configContent) };
            console.log('Configuration loaded successfully');
        } else {
            console.log('Config file exists but is empty. Using default configuration');
        }
    } else {
        console.log('Config file not found. Creating with default values');
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
    }
    
    // Use the download folder from config or default
    DOWNLOAD_FOLDER = CONFIG.downloadFolder || DEFAULT_CONFIG.downloadFolder;
    console.log(`Download folder set to: ${DOWNLOAD_FOLDER}`);
    
    // Ensure the download folder exists
    if (!fs.existsSync(DOWNLOAD_FOLDER)) {
        fs.mkdirSync(DOWNLOAD_FOLDER, { recursive: true });
        console.log(`Created download folder: ${DOWNLOAD_FOLDER}`);
    }
} catch (error) {
    console.error(`Error loading configuration: ${error.message}`);
    console.log('Using default configuration due to error');
    DOWNLOAD_FOLDER = DEFAULT_CONFIG.downloadFolder;
    
    // Ensure the default download folder exists
    if (!fs.existsSync(DOWNLOAD_FOLDER)) {
        fs.mkdirSync(DOWNLOAD_FOLDER, { recursive: true });
        console.log(`Created default download folder: ${DOWNLOAD_FOLDER}`);
    }
}

// Garantir que a pasta de downloads existe
if (!fs.existsSync(DOWNLOAD_FOLDER)) {
    fs.mkdirSync(DOWNLOAD_FOLDER, { recursive: true });
    console.log(`Pasta de downloads criada: ${DOWNLOAD_FOLDER}`);
}

// Carregar status de downloads se existir
if (fs.existsSync(STATUS_FILE)) {
    try {
        const savedStatus = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
        downloadStatus.completed = savedStatus.completed || [];
        downloadStatus.lastUpdate = new Date().toISOString();
        console.log("Status de downloads carregado.");
    } catch (error) {
        console.log(`Erro ao ler arquivo de status. Criando um novo.`);
    }
}

// Função para salvar status dos downloads
function saveDownloadStatus() {
    try {
        downloadStatus.lastUpdate = new Date().toISOString();
        fs.writeFileSync(STATUS_FILE, JSON.stringify(downloadStatus, null, 2));
    } catch (error) {
        console.error('Erro ao salvar status dos downloads:', error);
    }
}

// Verificar se o arquivo de configuração existe, se não, criar um com configurações padrão
if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
    console.log(`Arquivo de configuração criado: ${CONFIG_FILE}`);
}

// Configurar manipuladores de eventos para terminar graciosamente
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', (error) => {
    console.error('Erro não tratado:', error);
    cleanup();
});

// Função para limpeza quando o programa é interrompido
function cleanup() {
    console.log('\nPrograma interrompido. Limpando arquivos temporários...');
    
    // Remover todos os arquivos temporários
    for (const tempFile of tempFiles) {
        try {
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
                console.log(`Arquivo temporário removido: ${tempFile}`);
            }
        } catch (error) {
            console.error(`Erro ao remover arquivo temporário: ${error.message}`);
        }
    }
    
    // Salvar o status atual dos downloads
    saveDownloadStatus();
    
    console.log('Limpeza concluída. Encerrando programa.');
    process.exit(1);
}

// Função para verificar se o download foi cancelado
function checkIfCancelled() {
    const cancelSignalFile = path.join(__dirname, 'cancel-download.signal');
    if (fs.existsSync(cancelSignalFile)) {
        console.log('\nDownload cancellation requested. Terminating...');
        
        try {
            // Try to delete the signal file
            fs.unlinkSync(cancelSignalFile);
        } catch (err) {
            // Ignore errors when deleting signal file
        }
        
        // Update status before exiting
        if (downloadStatus.current) {
            downloadStatus.current.status = 'cancelled';
            downloadStatus.current.endTime = new Date().toISOString();
            downloadStatus.current.errorMessage = 'Download was cancelled by user';
            
            downloadStatus.completed.unshift({
                ...downloadStatus.current
            });
            
            downloadStatus.current = null;
            saveDownloadStatus();
        }
        
        process.exit(1);
        return true;
    }
    return false;
}

// Função para normalizar nomes de animes para pesquisa e armazenamento
function normalizeAnimeNameForSearch(name) {
    return name
        .trim()
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/,/g, '')          // Remove vírgulas explicitamente
        .replace(/[^\w\s-]/g, '')   // Remove outros caracteres especiais
        .replace(/\s+/g, '-')       // Substitui espaços por hífens
        .replace(/-+/g, '-')        // Substitui múltiplos hífens por um único
        .replace(/-+$/, '');        // Remove hífens extras no final
}

// Função principal
async function main() {
    try {
        // Ler o arquivo de lista de animes (com verificação de existência)
        console.log(`Tentando ler lista de animes de: ${ANIME_LIST_FILE}`);
        
        // Verificar se o arquivo existe antes de tentar ler
        if (!fs.existsSync(ANIME_LIST_FILE)) {
            console.error(`Erro: Arquivo de lista de animes não encontrado: ${ANIME_LIST_FILE}`);
            console.log('Isso pode acontecer se o download foi cancelado e o arquivo temporário foi removido.');
            process.exit(1);
            return;
        }
        
        const animeListContent = fs.readFileSync(ANIME_LIST_FILE, 'utf8');
        
        if (!animeListContent || animeListContent.trim() === '') {
            console.error('Erro: Arquivo de lista de animes está vazio.');
            process.exit(1);
            return;
        }
        
        // Extrair informações dos animes do arquivo
        const animeEntries = animeListContent
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
            .map(line => {
                let parts = line.split('|').map(part => part.trim());
                const name = parts[0]; // Nome normalizado para armazenamento/pesquisa
                
                // Checar se temos o formato com nome original ou URL
                let originalName = name;
                let animeUrl = ''; // Novo campo para armazenar URL se disponível
                
                if (parts.length >= 4) {
                    const fourthPart = parts[3].replace(/^"(.+)"$/, '$1');
                    
                    // Verificar se é URL ou nome original
                    if (fourthPart.startsWith('http')) {
                        animeUrl = fourthPart;
                        console.log(`URL encontrada para ${name}: ${animeUrl}`);
                    } else {
                        originalName = fourthPart;
                    }
                }
                
                return {
                    name: name, // Nome normalizado para pesquisa e criação de pasta
                    displayName: originalName, // Nome original para exibição
                    quality: parts[1]?.toUpperCase() === 'SD' ? 'SD' : 
                            parts[1]?.toUpperCase() === 'HD' ? 'HD' : 
                            CONFIG.defaultQuality,
                    startEpisode: parts[2] ? parseInt(parts[2]) : CONFIG.startFromEpisode,
                    animeUrl: animeUrl // URL direta para o anime, se disponível
                };
            });
        
        if (animeEntries.length === 0) {
            console.log('Nenhum anime encontrado na lista. Por favor, adicione pelo menos um nome de anime.');
            process.exit(0);
        }
        
        console.log(`Encontrados ${animeEntries.length} animes na lista para download.`);
        console.log('Configurações atuais:');
        console.log(`- Qualidade padrão: ${CONFIG.defaultQuality}`);
        console.log(`- Episódio inicial padrão: ${CONFIG.startFromEpisode}`);
        console.log(`- Pasta de downloads: ${DOWNLOAD_FOLDER}`);
        
        // Inicializar fila vazia antes de processar animes
        downloadStatus.queue = [];
        
        console.log("\nVerificando episódios disponíveis para download...");
        
        // Verificar todos os animes e seus episódios antes de iniciar qualquer download
        for (const entry of animeEntries) {
            try {
                console.log(`\nVerificando anime: ${entry.displayName || entry.name}`);
                
                // Buscar informações do anime
                let animeInfo;
                if (entry.animeUrl) {
                    try {
                        const response = await axios.get(entry.animeUrl, {
                            headers: { 'User-Agent': USER_AGENT }
                        });
                        
                        if (response.status === 200) {
                            const $ = cheerio.load(response.data);
                            const title = $('h1.anime-title, h2.anime-title, .anime-title').first().text().trim() || entry.name;
                            
                            animeInfo = {
                                title: title,
                                url: entry.animeUrl
                            };
                        }
                    } catch (error) {
                        console.error(`Erro ao acessar URL do anime: ${error.message}`);
                    }
                } else {
                    const searchName = normalizeAnimeNameForSearch(entry.name);
                    animeInfo = await findAnime(searchName);
                }
                
                if (!animeInfo) {
                    console.log(`Anime não encontrado: ${entry.name}. Pulando...`);
                    continue;
                }
                
                // Criar pasta para o anime (para verificar arquivos existentes)
                const animeFolderName = sanitize(animeInfo.title.replace(/-/g, ' '));
                const animeFolder = path.join(DOWNLOAD_FOLDER, animeFolderName);
                
                // Buscar episódios
                const episodes = await getEpisodes(animeInfo.url);
                
                if (episodes.length === 0) {
                    console.log(`Nenhum episódio encontrado para ${animeInfo.title}. Pulando...`);
                    continue;
                }
                
                // Filtrar apenas episódios a partir do episódio inicial configurado
                const filteredEpisodes = episodes.filter(ep => {
                    const episodeNumber = extractEpisodeNumber(ep.title, ep.url);
                    return episodeNumber >= entry.startEpisode;
                });
                
                if (filteredEpisodes.length === 0) {
                    console.log(`Nenhum episódio a partir do ${entry.startEpisode} encontrado para ${animeInfo.title}. Pulando...`);
                    continue;
                }
                
                // Verificar episódios já baixados
                const episodesToDownload = [];
                
                for (const episode of filteredEpisodes) {
                    const episodeNumber = extractEpisodeNumber(episode.title, episode.url);
                    const fileName = `${animeFolderName} - Episódio ${episodeNumber}.mp4`;
                    const filePath = path.join(animeFolder, fileName);
                    
                    // Verificar se o arquivo já existe
                    if (fs.existsSync(filePath)) {
                        console.log(`Episódio ${episodeNumber} já existe. Pulando...`);
                    } else {
                        episodesToDownload.push({
                            number: episodeNumber,
                            title: episode.title,
                            url: episode.url
                        });
                    }
                }
                
                // Adicionar à fila apenas episódios que realmente serão baixados
                if (episodesToDownload.length > 0) {
                    console.log(`Adicionando ${episodesToDownload.length} episódios à fila para ${animeInfo.title}`);
                    
                    downloadStatus.queue.push({
                        name: entry.name,
                        displayName: animeInfo.title,
                        quality: entry.quality,
                        startEpisode: entry.startEpisode,
                        status: 'queued',
                        episodes: episodesToDownload,
                        totalEpisodes: episodesToDownload.length,
                        animeUrl: animeInfo.url
                    });
                } else {
                    console.log(`Todos os episódios já foram baixados para ${animeInfo.title}.`);
                }
            } catch (error) {
                console.error(`Erro ao verificar anime ${entry.name}: ${error.message}`);
            }
        }
        
        // Salvar a fila atualizada com os episódios realmente necessários
        saveDownloadStatus();
        
        // Verificar se há episódios para baixar
        if (downloadStatus.queue.length === 0) {
            console.log("\nNenhum episódio novo para baixar. Finalizando...");
            process.exit(0);
        }
        
        console.log(`\nTotal de animes na fila: ${downloadStatus.queue.length}`);
        
        // Aguardar confirmação do usuário para continuar (apenas se iniciado de forma interativa)
        // A confirmação é feita pelo front-end antes de iniciar o download
        console.log("\nAguardando processamento dos downloads...");
        
        // Processar cada anime da fila
        for (let i = 0; i < downloadStatus.queue.length; i++) {
            // Check for cancellation before processing each anime
            if (checkIfCancelled()) break;
            
            const queueItem = downloadStatus.queue[i];
            console.log(`\n[${i+1}/${downloadStatus.queue.length}] Processando: ${queueItem.displayName}`);
            
            // Atualizar status do download atual
            downloadStatus.current = {
                name: queueItem.name,
                displayName: queueItem.displayName,
                quality: queueItem.quality,
                startEpisode: queueItem.startEpisode,
                status: 'downloading',
                progress: 0,
                startTime: new Date().toISOString(),
                episodes: queueItem.episodes,
                animeUrl: queueItem.animeUrl
            };
            
            // Remover o item atual da fila
            downloadStatus.queue = downloadStatus.queue.filter(
                item => item.name !== queueItem.name
            );
            
            saveDownloadStatus();
            
            // Processar o anime atual usando as informações já verificadas
            await processAnimeFromQueue(queueItem);
            
            // Adicionar aos downloads concluídos
            downloadStatus.current.status = 'completed';
            downloadStatus.current.endTime = new Date().toISOString();
            downloadStatus.completed.push({ ...downloadStatus.current });
            downloadStatus.current = null;
            
            saveDownloadStatus();
        }
        
        console.log('\nTodos os animes da lista foram processados!');
        
    } catch (error) {
        console.error('Ocorreu um erro:', error);
        
        // Atualizar status em caso de erro
        if (downloadStatus.current) {
            downloadStatus.current.status = 'error';
            downloadStatus.current.errorMessage = error.message;
            saveDownloadStatus();
        }
    }
}

// Função para processar cada anime da fila
async function processAnimeFromQueue(queueItem) {
    try {
        const animeFolderName = sanitize(queueItem.displayName.replace(/-/g, ' '));
        const animeFolder = path.join(DOWNLOAD_FOLDER, animeFolderName);
        
        if (!fs.existsSync(animeFolder)) {
            fs.mkdirSync(animeFolder, { recursive: true });
            console.log(`Pasta criada para o anime: ${animeFolderName}`);
        }
        
        const logFile = path.join(animeFolder, '_download_log.txt');
        const logStream = fs.createWriteStream(logFile, { flags: 'a' });
        let logEntry = `\n[${new Date().toISOString()}] Iniciando download de: ${queueItem.displayName} (${queueItem.animeUrl})\n`;
        logEntry += `Qualidade: ${queueItem.quality}, Começando do episódio: ${queueItem.startEpisode}\n`;
        logStream.write(logEntry);
        
        for (const [index, episode] of queueItem.episodes.entries()) {
            if (checkIfCancelled()) break;
            
            const episodeNumber = episode.number;
            const fileName = `${animeFolderName} - Episódio ${episodeNumber}.mp4`;
            const filePath = path.join(animeFolder, fileName);
            const tempFilePath = path.join(animeFolder, `${fileName}.temp`);
            
            if (fs.existsSync(filePath)) {
                const message = `[${index + 1}/${queueItem.episodes.length}] Episódio ${episodeNumber} já existe. Pulando...`;
                console.log(message);
                logStream.write(`${message}\n`);
                continue;
            }
            
            const startMessage = `[${index + 1}/${queueItem.episodes.length}] Baixando episódio ${episodeNumber} em qualidade ${queueItem.quality}...`;
            console.log(startMessage);
            logStream.write(`${startMessage}\n`);
            
            const downloadLinks = await getDownloadLinks(episode.url);
            
            if (downloadLinks.length === 0) {
                const noLinksMessage = `Nenhum link de download encontrado para o episódio ${episodeNumber}. Criando atalho para visualização online...`;
                console.log(noLinksMessage);
                logStream.write(`${noLinksMessage}\n`);
                
                const shortcutFileName = `${animeFolderName} - Episódio ${episodeNumber} (Assistir Online).url`;
                const shortcutFilePath = path.join(animeFolder, shortcutFileName);
                
                const shortcutContent = `[InternetShortcut]
URL=${episode.url}
IconIndex=0
`;
                
                try {
                    fs.writeFileSync(shortcutFilePath, shortcutContent);
                    const shortcutMessage = `✓ Criado atalho para assistir online: ${shortcutFileName}`;
                    console.log(shortcutMessage);
                    logStream.write(`${shortcutMessage}\n`);
                } catch (error) {
                    const shortcutErrorMessage = `✗ Erro ao criar atalho: ${error.message}`;
                    console.error(shortcutErrorMessage);
                    logStream.write(`${shortcutErrorMessage}\n`);
                }
                
                continue;
            }
            
            let selectedLink = null;
            
            for (const link of downloadLinks) {
                if (queueItem.quality === 'SD' && (link.quality.toUpperCase().includes('SD') || link.url.includes('/sd/'))) {
                    selectedLink = link;
                    break;
                }
                if (queueItem.quality === 'HD' && (link.quality.toUpperCase().includes('HD') || link.url.includes('/hd/'))) {
                    selectedLink = link;
                    break;
                }
            }
            
            if (!selectedLink) {
                console.log(`Qualidade ${queueItem.quality} não encontrada, usando qualidade disponível.`);
                selectedLink = downloadLinks[0];
            }
            
            console.log(`Link selecionado: ${selectedLink.quality} - ${selectedLink.url}`);
            
            try {
                tempFiles.add(tempFilePath);
                
                console.log(`Baixando ${selectedLink.quality}: ${selectedLink.url}`);
                await downloadFile(selectedLink.url, tempFilePath, queueItem.name);
                
                fs.renameSync(tempFilePath, filePath);
                
                tempFiles.delete(tempFilePath);
                
                const successMessage = `✓ Episódio ${episodeNumber} baixado com sucesso! [${selectedLink.quality}]`;
                console.log(successMessage);
                logStream.write(`${successMessage}\n`);
                
                const progressPercent = Math.round(((index + 1) / queueItem.episodes.length) * 100);
                updateProgress(queueItem.name, 'downloading', progressPercent, null, {
                    totalEpisodes: queueItem.episodes.length,
                    currentEpisode: index + 1,
                    episodeNumber: episodeNumber,
                    downloadPercent: 100
                });
                
            } catch (error) {
                const errorMessage = `✗ Erro ao baixar episódio ${episodeNumber}: ${error.message}`;
                console.error(errorMessage);
                logStream.write(`${errorMessage}\n`);
                
                updateProgress(queueItem.name, 'error_episode', 0, `Erro ao baixar episódio ${episodeNumber}: ${error.message}`, {
                    totalEpisodes: queueItem.episodes.length,
                    currentEpisode: index + 1,
                    episodeNumber: episodeNumber
                });
                
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                    tempFiles.delete(tempFilePath);
                }
                
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }
        }
        
        const completeMessage = `\nDownload de "${queueItem.displayName}" concluído!\n`;
        console.log(completeMessage);
        logStream.write(completeMessage);
        logStream.end();
        
        updateProgress(queueItem.name, 'completed', 100);
        
    } catch (error) {
        console.error('Erro ao processar anime:', error);
        updateProgress(queueItem.name, 'error', 0, `Erro ao processar anime: ${error.message}`);
    }
}

// Função para atualizar o progresso de download
function updateProgress(animeName, status, percent, error = null, details = {}) {
    if (downloadStatus.current && downloadStatus.current.name === animeName) {
        downloadStatus.current.status = status;
        downloadStatus.current.progress = percent;
        
        if (error) downloadStatus.current.errorMessage = error;
        if (details) downloadStatus.current.details = details;
        
        saveDownloadStatus();
    }
}

// Função para buscar o anime pelo nome
async function findAnime(animeName) {
    try {
        const searchTerm = animeName.trim()
                                  .toLowerCase()
                                  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                                  .replace(/[^\w\s-]/g, '')
                                  .replace(/\s+/g, '-');
        
        const searchUrl = `https://animefire.plus/pesquisar/${encodeURIComponent(searchTerm)}`;
        
        console.log(`Pesquisando em: ${searchUrl}`);
        
        const response = await axios.get(searchUrl, {
            headers: { 'User-Agent': USER_AGENT }
        });
        
        const $ = cheerio.load(response.data);
        
        const results = [];
        
        $('.minWDanime').each((index, element) => {
            const title = $(element).find('.text-block h3.animeTitle').text().trim();
            const url = $(element).find('a').attr('href');
            
            if (title && url) {
                results.push({ title, url });
            }
        });
        
        if (results.length === 0) {
            $('.card, .card-anime').each((index, element) => {
                const title = $(element).find('h3, .animeTitle, .title').text().trim();
                const url = $(element).find('a').attr('href');
                
                if (title && url) {
                    results.push({ title, url });
                }
            });
            
            if (results.length === 0) {
                $('a[href*="/animes/"]').each((index, element) => {
                    const url = $(element).attr('href');
                    const title = $(element).text().trim() || $(element).attr('title');
                    
                    if (title && url) {
                        results.push({ title, url });
                    }
                });
            }
        }
        
        if (results.length > 0) {
            const searchTerms = animeName.toLowerCase().split(/\s+/);
            
            results.sort((a, b) => {
                const relevanceA = calculateRelevance(a.title.toLowerCase(), searchTerms);
                const relevanceB = calculateRelevance(b.title.toLowerCase(), searchTerms);
                return relevanceB - relevanceA;
            });
            
            return results[0];
        }
        
        console.log('Pesquisa não encontrou resultados. Tentando URL direta...');
        
        const directUrl = `https://animefire.plus/animes/${searchTerm}-todos-os-episodios`;
        
        try {
            const directResponse = await axios.get(directUrl, {
                headers: { 'User-Agent': USER_AGENT }
            });
            
            if (directResponse.status === 200) {
                const $direct = cheerio.load(directResponse.data);
                const title = $direct('title').text().split('-')[0].trim() || animeName;
                
                return { title, url: directUrl };
            }
        } catch (error) {
            console.log('URL direta não funcionou');
        }
        
        return null;
    } catch (error) {
        console.error('Erro ao buscar anime:', error.message);
        return null;
    }
}

// Função para obter os episódios do anime
async function getEpisodes(animeUrl) {
    try {
        console.log(`Buscando episódios em: ${animeUrl}`);
        const response = await axios.get(animeUrl, {
            headers: { 'User-Agent': USER_AGENT }
        });
        
        const $ = cheerio.load(response.data);
        const episodes = [];
        
        $('.div_video_list a').each((index, element) => {
            const title = $(element).text().trim();
            const url = $(element).attr('href');
            
            if (url && !episodes.some(ep => ep.url === url)) {
                episodes.push({ title: title || `Episódio ${index + 1}`, url });
            }
        });
        
        if (episodes.length === 0) {
            $('.episodeItem, .episode-item, [class*="episode"]').each((index, element) => {
                const anchor = $(element).find('a');
                const title = anchor.text().trim() || $(element).text().trim();
                const url = anchor.attr('href');
                
                if (url && !episodes.some(ep => ep.url === url)) {
                    episodes.push({ title: title || `Episódio ${index + 1}`, url });
                }
            });
        }

        if (episodes.length === 0) {
            $('a[href*="/episodio/"]').each((index, element) => {
                const title = $(element).text().trim();
                const url = $(element).attr('href');
                
                if (url && !episodes.some(ep => ep.url === url)) {
                    episodes.push({ title: title || `Episódio ${index + 1}`, url });
                }
            });
        }
        
        episodes.sort((a, b) => {
            const numA = extractEpisodeNumber(a.title, a.url);
            const numB = extractEpisodeNumber(b.title, b.url);
            return numA - numB;
        });
        
        console.log(`Encontrados ${episodes.length} episódios.`);
        return episodes;
    } catch (error) {
        console.error('Erro ao obter episódios:', error.message);
        return [];
    }
}

// Função para obter links de download de um episódio
async function getDownloadLinks(episodeUrl) {
    try {
        console.log(`Buscando links de download para: ${episodeUrl}`);
        const downloadLinks = [];
        
        try {
            const response = await axios.get(episodeUrl, {
                headers: { 'User-Agent': USER_AGENT }
            });
            
            const $ = cheerio.load(response.data);
            
            const html = response.data;
            const mp4UrlRegex = /https?:\/\/[^"'\s]+\.mp4/g;
            const matches = html.match(mp4UrlRegex);
            
            if (matches) {
                matches.forEach(url => {
                    if (url && url.startsWith('http')) {
                        downloadLinks.push({
                            url: url,
                            quality: url.toLowerCase().includes('hd') ? 'HD' : 
                                     url.toLowerCase().includes('sd') ? 'SD' : 'Desconhecida'
                        });
                    }
                });
                console.log(`Encontrados ${downloadLinks.length} links MP4 no código-fonte.`);
            }
        } catch (error) {
            console.error(`Erro ao buscar links na página do episódio: ${error.message}`);
        }
        
        if (downloadLinks.length === 0) {
            let downloadPageUrl = episodeUrl.replace('/episodio/', '/download/');
            
            if (downloadPageUrl === episodeUrl) {
                const urlParts = episodeUrl.split('/');
                const animeSlug = urlParts[urlParts.length - 2];
                const episodeNumber = urlParts[urlParts.length - 1];
                downloadPageUrl = `https://animefire.plus/download/${animeSlug}/${episodeNumber}`;
            }
            
            try {
                console.log(`Tentando página de download: ${downloadPageUrl}`);
                const downloadResponse = await axios.get(downloadPageUrl, {
                    headers: { 'User-Agent': USER_AGENT }
                });
                
                const $download = cheerio.load(downloadResponse.data);
                
                $download('a').each((index, element) => {
                    const url = $download(element).attr('href');
                    const text = $download(element).text().trim().toUpperCase();
                    
                    if (url && url.includes('.mp4')) {
                        let quality = 'Desconhecida';
                        if (text.includes('SD')) quality = 'SD';
                        else if (text.includes('HD')) quality = 'HD';
                        
                        downloadLinks.push({ url, quality });
                    }
                });
            } catch (error) {
                console.error(`Erro ao acessar página de download: ${error.message}`);
            }
        }
        
        return downloadLinks;
    } catch (error) {
        console.error('Erro ao obter links de download:', error.message);
        return [];
    }
}

// Função para calcular relevância de resultados de busca
function calculateRelevance(title, searchTerms) {
    let relevance = 0;
    
    for (const term of searchTerms) {
        if (title.startsWith(term)) {
            relevance += 10;
        }
        
        const matches = title.split(term).length - 1;
        relevance += matches * 2;
    }
    
    return relevance;
}

// Função para extrair número do episódio
function extractEpisodeNumber(title, url) {
    if (url) {
        const urlParts = url.split('/');
        const lastPart = urlParts[urlParts.length - 1];
        if (!isNaN(lastPart)) {
            return parseInt(lastPart);
        }
    }
    
    if (title) {
        const match = title.match(/(?:episódio|ep|episode)\s*(\d+)/i) || title.match(/(\d+)/);
        if (match && match[1]) {
            return parseInt(match[1]);
        }
    }
    
    return 0;
}

// Função para fazer download de arquivo com relatório de progresso
function downloadFile(url, destination, animeName) {
    return new Promise((resolve, reject) => {
        if (!url || !url.startsWith('http')) {
            return reject(new Error('URL de download inválida'));
        }
        
        console.log(`Iniciando download de: ${url}`);
        console.log(`Destino: ${destination}`);
        
        tempFiles.add(destination);
        
        const fileStream = fs.createWriteStream(destination);
        
        let currentRequest = null;
        
        const cleanupAndReject = (error) => {
            fileStream.close();
            
            try {
                if (fs.existsSync(destination)) {
                    fs.unlinkSync(destination);
                }
            } catch (err) {
                console.error(`Erro ao remover arquivo incompleto: ${err.message}`);
            }
            
            tempFiles.delete(destination);
            
            reject(error);
        };
        
        const httpModule = url.startsWith('https') ? https : require('http');
        
        try {
            currentRequest = httpModule.get(url, {
                headers: { 
                    'User-Agent': USER_AGENT,
                    'Referer': 'https://animefire.plus/'
                }
            }, (response) => {
                if (response.statusCode === 301 || response.statusCode === 302) {
                    fileStream.close();
                    tempFiles.delete(destination);
                    
                    console.log(`Redirecionamento para: ${response.headers.location}`);
                    return downloadFile(response.headers.location, destination, animeName)
                        .then(resolve)
                        .catch(reject);
                }
                
                if (response.statusCode !== 200) {
                    return cleanupAndReject(new Error(`Código de status inválido: ${response.statusCode}`));
                }
                
                const totalSize = parseInt(response.headers['content-length'], 10);
                let downloadedSize = 0;
                let lastLoggedPercent = 0;
                
                response.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    if (totalSize) {
                        const percent = Math.floor((downloadedSize / totalSize) * 100);
                        if (percent >= lastLoggedPercent + 5) {
                            console.log(`Progresso: ${percent}%`);
                            lastLoggedPercent = percent;
                            
                            if (downloadStatus.current && downloadStatus.current.name === animeName) {
                                if (downloadStatus.current.details) {
                                    if (!downloadStatus.current.details.downloadPercent) {
                                        downloadStatus.current.details.downloadPercent = 0;
                                    }
                                    downloadStatus.current.details.downloadPercent = percent;
                                }
                                downloadStatus.current.progress = percent;
                                saveDownloadStatus();
                            }
                            
                            if (checkIfCancelled()) {
                                cleanupAndReject(new Error('Download cancelled by user'));
                            }
                        }
                    }
                });
                
                response.pipe(fileStream);
                
                fileStream.on('finish', () => {
                    fileStream.close();
                    tempFiles.delete(destination);
                    if (downloadStatus.current && downloadStatus.current.name === animeName) {
                        if (downloadStatus.current.details) {
                            downloadStatus.current.details.downloadPercent = 100;
                        }
                        downloadStatus.current.progress = 100;
                        saveDownloadStatus();
                    }
                    resolve();
                });
                
                fileStream.on('error', (err) => {
                    cleanupAndReject(err);
                });
            });
            
            currentRequest.on('error', (err) => {
                cleanupAndReject(err);
            });
            
            currentRequest.setTimeout(60000, () => {
                currentRequest.destroy();
                cleanupAndReject(new Error('Timeout na requisição de download'));
            });
            
            const cancellationCheck = setInterval(() => {
                if (checkIfCancelled()) {
                    clearInterval(cancellationCheck);
                    currentRequest.abort();
                    cleanupAndReject(new Error('Download cancelled by user'));
                }
            }, 1000);
            
            currentRequest.on('close', () => {
                clearInterval(cancellationCheck);
            });
        } catch (error) {
            cleanupAndReject(error);
        }
    });
}

// Executar o programa
main();