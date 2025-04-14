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
    CONFIG = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    DOWNLOAD_FOLDER = CONFIG.downloadFolder || DEFAULT_CONFIG.downloadFolder;
} catch (error) {
    console.log(`Erro ao ler arquivo de configuração. Usando configurações padrão.`);
    DOWNLOAD_FOLDER = DEFAULT_CONFIG.downloadFolder;
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
        // Ler o arquivo de lista de animes
        console.log(`Lendo lista de animes de: ${ANIME_LIST_FILE}`);
        const animeListContent = fs.readFileSync(ANIME_LIST_FILE, 'utf8');
        
        // Extrair informações dos animes do arquivo
        const animeEntries = animeListContent
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
            .map(line => {
                // Formatos possíveis:
                // 1. título | qualidade | episódio | "título original"
                // 2. título | qualidade | episódio | "URL do anime"
                // 3. título | qualidade | episódio
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
        
        // Adicionar animes à fila de downloads
        downloadStatus.queue = animeEntries.map(entry => ({
            name: entry.name,
            displayName: entry.name.replace(/-/g, ' '),
            quality: entry.quality,
            startEpisode: entry.startEpisode,
            status: 'queued'
        }));
        
        saveDownloadStatus();
        
        // Processar cada anime da lista
        for (const [index, animeEntry] of animeEntries.entries()) {
            console.log(`\n[${index + 1}/${animeEntries.length}] Processando: ${animeEntry.name.replace(/-/g, ' ')}`);
            console.log(`- Qualidade selecionada: ${animeEntry.quality}`);
            console.log(`- Começando do episódio: ${animeEntry.startEpisode}`);
            
            // Atualizar status do download atual
            downloadStatus.current = {
                name: animeEntry.name,
                displayName: animeEntry.name.replace(/-/g, ' '),
                quality: animeEntry.quality,
                startEpisode: animeEntry.startEpisode,
                status: 'downloading',
                progress: 0,
                startTime: new Date().toISOString()
            };
            
            // Remover da fila
            downloadStatus.queue = downloadStatus.queue.filter(
                item => item.name !== animeEntry.name
            );
            
            saveDownloadStatus();
            
            await processAnime(animeEntry);
            
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

// Função para processar cada anime
async function processAnime(animeEntry) {
    try {
        // Nome normalizado para busca (já deve estar normalizado no arquivo, mas para garantir...)
        const searchName = normalizeAnimeNameForSearch(animeEntry.name);
        // Nome para exibição (com espaços em vez de hífens)
        const displayName = animeEntry.name.replace(/-/g, ' ');
        
        console.log(`\nBuscando anime: ${displayName}...`);
        
        // Atualizar progresso
        updateProgress(animeEntry.name, 'searching', 0, null, { displayName });
        
        let animeInfo;
        
        // PRIORIDADE: Se temos uma URL direta, usá-la SEMPRE em vez de buscar por nome
        if (animeEntry.animeUrl) {
            console.log(`URL direta fornecida para o anime: ${animeEntry.animeUrl}`);
            console.log(`IMPORTANTE: Usando exclusivamente a URL fornecida para obter dados do anime`);
            
            try {
                const response = await axios.get(animeEntry.animeUrl, {
                    headers: { 'User-Agent': USER_AGENT }
                });
                
                if (response.status === 200) {
                    const $ = cheerio.load(response.data);
                    const title = $('h1.anime-title, h2.anime-title, .anime-title').first().text().trim() || animeEntry.name;
                    
                    animeInfo = {
                        title: title,
                        url: animeEntry.animeUrl
                    };
                    
                    console.log(`Informações do anime obtidas com sucesso a partir da URL fornecida`);
                } else {
                    console.error(`Erro ao acessar URL: código ${response.status}`);
                    updateProgress(animeEntry.name, 'error', 0, `Erro ao acessar URL: código ${response.status}`);
                    return;
                }
            } catch (error) {
                console.error(`Erro ao acessar URL do anime: ${error.message}`);
                updateProgress(animeEntry.name, 'error', 0, `Erro ao acessar URL: ${error.message}`);
                return;
            }
        } else {
            console.log(`AVISO: Nenhuma URL direta fornecida. Recomenda-se sempre fornecer a URL direta do anime.`);
            console.log(`Tentando buscar pelo nome: ${searchName} (método menos confiável)`);
            animeInfo = await findAnime(searchName);
        }
        
        if (!animeInfo) {
            console.log('Anime não encontrado. Verifique o nome e tente novamente.');
            updateProgress(animeEntry.name, 'error', 0, 'Anime não encontrado');
            return;
        }
        
        console.log(`\nAnime encontrado: ${animeInfo.title}`);
        console.log(`URL: ${animeInfo.url}\n`);
        
        // Criar pasta para o anime - substituindo hifens por espaços
        const animeFolderName = sanitize(animeInfo.title.replace(/-/g, ' '));
        
        const animeFolder = path.join(DOWNLOAD_FOLDER, animeFolderName);
        if (!fs.existsSync(animeFolder)) {
            fs.mkdirSync(animeFolder, { recursive: true });
            console.log(`Pasta criada para o anime: ${animeFolderName}`);
        }
        
        // Criar arquivo de log para este anime
        const logFile = path.join(animeFolder, '_download_log.txt');
        const logStream = fs.createWriteStream(logFile, {flags: 'a'});
        let logEntry = `\n[${new Date().toISOString()}] Iniciando download de: ${animeInfo.title} (${animeInfo.url})\n`;
        logEntry += `Qualidade: ${animeEntry.quality}, Começando do episódio: ${animeEntry.startEpisode}\n`;
        logStream.write(logEntry);
        
        // Buscar episódios diretamente da URL do anime
        console.log('Buscando episódios...');
        updateProgress(animeEntry.name, 'fetching_episodes', 5);
        const episodes = await getEpisodes(animeInfo.url);
        
        if (episodes.length === 0) {
            console.log('Nenhum episódio encontrado.');
            logStream.write('Nenhum episódio encontrado.\n');
            logStream.end();
            updateProgress(animeEntry.name, 'error', 0, 'Nenhum episódio encontrado');
            return;
        }
        
        console.log(`Total de episódios encontrados: ${episodes.length}\n`);
        logStream.write(`Total de episódios encontrados: ${episodes.length}\n`);
        
        // Filtrar episódios a partir do episódio inicial definido
        const filteredEpisodes = episodes.filter(ep => {
            const episodeNumber = extractEpisodeNumber(ep.title, ep.url);
            return episodeNumber >= animeEntry.startEpisode;
        });
        
        console.log(`Episódios a baixar: ${filteredEpisodes.length} (a partir do ${animeEntry.startEpisode})\n`);
        logStream.write(`Episódios a baixar: ${filteredEpisodes.length} (a partir do ${animeEntry.startEpisode})\n`);
        
        updateProgress(animeEntry.name, 'downloading', 10, null, {
            totalEpisodes: filteredEpisodes.length,
            currentEpisode: 0
        });
        
        // Download de cada episódio
        for (const [index, episode] of filteredEpisodes.entries()) {
            // Extrair o número do episódio do título ou da URL
            const episodeNumber = extractEpisodeNumber(episode.title, episode.url);
            
            // Atualizar progresso baseado no episódio atual
            const progressPercent = 10 + Math.round((index / filteredEpisodes.length) * 90);
            updateProgress(animeEntry.name, 'downloading_episode', progressPercent, null, {
                totalEpisodes: filteredEpisodes.length,
                currentEpisode: index + 1,
                episodeNumber: episodeNumber
            });
            
            // Formatar nome do arquivo - garantir consistência com o nome da pasta
            const fileName = `${animeFolderName} - Episódio ${episodeNumber}.mp4`;
            const filePath = path.join(animeFolder, fileName);
            const tempFilePath = path.join(animeFolder, `${fileName}.temp`);
            
            // Verificar se o arquivo já existe
            if (fs.existsSync(filePath)) {
                const message = `[${index+1}/${filteredEpisodes.length}] Episódio ${episodeNumber} já existe. Pulando...`;
                console.log(message);
                logStream.write(`${message}\n`);
                continue;
            }
            
            const startMessage = `[${index+1}/${filteredEpisodes.length}] Baixando episódio ${episodeNumber} em qualidade ${animeEntry.quality}...`;
            console.log(startMessage);
            logStream.write(`${startMessage}\n`);
            
            // Obter links de download
            const downloadLinks = await getDownloadLinks(episode.url);

            if (downloadLinks.length === 0) {
                const noLinksMessage = `Nenhum link de download encontrado para o episódio ${episodeNumber}. Criando atalho para visualização online...`;
                console.log(noLinksMessage);
                logStream.write(`${noLinksMessage}\n`);
                
                // Criar arquivo de atalho para assistir online com nome consistente
                const shortcutFileName = `${animeFolderName} - Episódio ${episodeNumber} (Assistir Online).url`;
                const shortcutFilePath = path.join(animeFolder, shortcutFileName);
                
                // Formato de arquivo .url para Windows
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
                        
            // Selecionar link de acordo com a qualidade escolhida
            let selectedLink = null;
            
            // Procurar link com a qualidade especificada
            for (const link of downloadLinks) {
                if (animeEntry.quality === 'SD' && (link.quality.toUpperCase().includes('SD') || link.url.includes('/sd/'))) {
                    selectedLink = link;
                    break;
                }
                if (animeEntry.quality === 'HD' && (link.quality.toUpperCase().includes('HD') || link.url.includes('/hd/'))) {
                    selectedLink = link;
                    break;
                }
            }
            
            // Se não encontrou link com a qualidade específica, usa o primeiro disponível
            if (!selectedLink) {
                console.log(`Qualidade ${animeEntry.quality} não encontrada, usando qualidade disponível.`);
                selectedLink = downloadLinks[0];
            }
            
            console.log(`Link selecionado: ${selectedLink.quality} - ${selectedLink.url}`);
            
            // Baixar o arquivo para um arquivo temporário primeiro
            try {
                // Adicionar arquivo temporário à lista de rastreamento
                tempFiles.add(tempFilePath);
                
                // Baixar para arquivo temporário
                await downloadFile(selectedLink.url, tempFilePath, animeEntry.name);
                
                // Verificar se o arquivo temporário foi baixado corretamente
                const fileStats = fs.statSync(tempFilePath);
                if (fileStats.size < 10240) { // Menos de 10KB - provavelmente erro
                    const fileContent = fs.readFileSync(tempFilePath, 'utf8');
                    if (fileContent.includes('error') || fileContent.includes('404') || fileContent.includes('não encontrado')) {
                        throw new Error('Arquivo baixado parece ser uma página de erro, não um vídeo válido');
                    }
                }
                
                // Mover arquivo temporário para o nome final
                fs.renameSync(tempFilePath, filePath);
                
                // Remover da lista de arquivos temporários
                tempFiles.delete(tempFilePath);
                
                const successMessage = `✓ Episódio ${episodeNumber} baixado com sucesso! [${selectedLink.quality}]`;
                console.log(successMessage);
                logStream.write(`${successMessage}\n`);
            } catch (error) {
                const errorMessage = `✗ Erro ao baixar episódio ${episodeNumber}: ${error.message}`;
                console.error(errorMessage);
                logStream.write(`${errorMessage}\n`);
                
                // Atualizar progresso com erro
                updateProgress(animeEntry.name, 'error_episode', progressPercent, `Erro ao baixar episódio ${episodeNumber}: ${error.message}`, {
                    totalEpisodes: filteredEpisodes.length,
                    currentEpisode: index + 1,
                    episodeNumber: episodeNumber
                });
                
                // Limpar arquivo temporário se existir
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                    tempFiles.delete(tempFilePath);
                }
                
                // Limpar arquivo final se existir (parcialmente)
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }
        }
        
        const completeMessage = `\nDownload de "${animeInfo.title}" concluído!\n`;
        console.log(completeMessage);
        logStream.write(completeMessage);
        logStream.end();
        
        updateProgress(animeEntry.name, 'completed', 100);
        
    } catch (error) {
        console.error('Erro ao processar anime:', error);
        updateProgress(animeEntry.name, 'error', 0, `Erro ao processar anime: ${error.message}`);
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
        // Formatar o nome para URL
        const searchTerm = animeName.trim()
                                  .toLowerCase()
                                  .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove acentos
                                  .replace(/[^\w\s-]/g, '')
                                  .replace(/\s+/g, '-');
        
        // Método 1: Tentar pesquisa no site
        const searchUrl = `https://animefire.plus/pesquisar/${encodeURIComponent(searchTerm)}`;
        
        console.log(`Pesquisando em: ${searchUrl}`);
        
        const response = await axios.get(searchUrl, {
            headers: { 'User-Agent': USER_AGENT }
        });
        
        const $ = cheerio.load(response.data);
        
        // Buscar resultados na página
        const results = [];
        
        // Tentar com o seletor específico .minWDanime
        $('.minWDanime').each((index, element) => {
            const title = $(element).find('.text-block h3.animeTitle').text().trim();
            const url = $(element).find('a').attr('href');
            
            if (title && url) {
                results.push({ title, url });
            }
        });
        
        // Se não encontrou nada, tentar seletores alternativos
        if (results.length === 0) {
            // Tentar cards de anime genéricos
            $('.card, .card-anime').each((index, element) => {
                const title = $(element).find('h3, .animeTitle, .title').text().trim();
                const url = $(element).find('a').attr('href');
                
                if (title && url) {
                    results.push({ title, url });
                }
            });
            
            // Último recurso: links que parecem ser de animes
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
        
        // Se encontrou resultados, retorna o mais relevante
        if (results.length > 0) {
            // Classificar por relevância (comparando com o nome do anime)
            const searchTerms = animeName.toLowerCase().split(/\s+/);
            
            results.sort((a, b) => {
                const relevanceA = calculateRelevance(a.title.toLowerCase(), searchTerms);
                const relevanceB = calculateRelevance(b.title.toLowerCase(), searchTerms);
                return relevanceB - relevanceA;
            });
            
            return results[0];
        }
        
        // Método 2: Tentar URL direta se a pesquisa não encontrou resultados
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
        
        // Primeiro método: div_video_list (mais comum)
        $('.div_video_list a').each((index, element) => {
            const title = $(element).text().trim();
            const url = $(element).attr('href');
            
            if (url && !episodes.some(ep => ep.url === url)) {
                episodes.push({ title: title || `Episódio ${index + 1}`, url });
            }
        });
        
        // Segundo método: containers de episódios
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

        // Terceiro método: qualquer link que contenha '/episodio/'
        if (episodes.length === 0) {
            $('a[href*="/episodio/"]').each((index, element) => {
                const title = $(element).text().trim();
                const url = $(element).attr('href');
                
                if (url && !episodes.some(ep => ep.url === url)) {
                    episodes.push({ title: title || `Episódio ${index + 1}`, url });
                }
            });
        }
        
        // Ordenar episódios (ordem crescente)
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
        
        // Método 1: Verificar página do episódio por links diretos
        try {
            const response = await axios.get(episodeUrl, {
                headers: { 'User-Agent': USER_AGENT }
            });
            
            const $ = cheerio.load(response.data);
            
            // Buscar no HTML por URLs de MP4
            const html = response.data;
            const mp4UrlRegex = /https?:\/\/[^"'\s]+\.mp4/g;
            const matches = html.match(mp4UrlRegex);
            
            if (matches) {
                matches.forEach(url => {
                    // Verifique se é uma URL válida
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
        
        // Método 2: Tentar página de download específica
        if (downloadLinks.length === 0) {
            // Construir URL da página de download
            let downloadPageUrl = episodeUrl.replace('/episodio/', '/download/');
            
            // Se a substituição não funcionou, tenta construir manualmente
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
                
                // Buscar links de download de SD e HD
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
    
    // Mais pontos se o título começar com algum dos termos de busca
    for (const term of searchTerms) {
        if (title.startsWith(term)) {
            relevance += 10;
        }
        
        // Pontos adicionais para cada ocorrência de termos de busca
        const matches = title.split(term).length - 1;
        relevance += matches * 2;
    }
    
    return relevance;
}

// Função para extrair número do episódio
function extractEpisodeNumber(title, url) {
    // Tentar extrair da URL primeiro (geralmente mais confiável)
    if (url) {
        const urlParts = url.split('/');
        const lastPart = urlParts[urlParts.length - 1];
        if (!isNaN(lastPart)) {
            return parseInt(lastPart);
        }
    }
    
    // Tentar extrair do título
    if (title) {
        // Padrão comum: "Episódio X" ou "Ep X" ou apenas número
        const match = title.match(/(?:episódio|ep|episode)\s*(\d+)/i) || title.match(/(\d+)/);
        if (match && match[1]) {
            return parseInt(match[1]);
        }
    }
    
    // Se não conseguir extrair, retorna 0 (será tratado como especial ou prólogo)
    return 0;
}

// Função para fazer download de arquivo com relatório de progresso
function downloadFile(url, destination, animeName) {
    return new Promise((resolve, reject) => {
        // Verificar se a URL é válida
        if (!url || !url.startsWith('http')) {
            return reject(new Error('URL de download inválida'));
        }
        
        console.log(`Iniciando download de: ${url}`);
        console.log(`Destino: ${destination}`);
        
        // Adicionar arquivo à lista de arquivos temporários
        tempFiles.add(destination);
        
        // Criar fluxo de escrita para o arquivo
        const fileStream = fs.createWriteStream(destination);
        
        // Para armazenar a requisição atual
        let currentRequest = null;
        
        // Função para limpar recursos e rejeitar
        const cleanupAndReject = (error) => {
            fileStream.close();
            
            // Remover arquivo incompleto
            try {
                if (fs.existsSync(destination)) {
                    fs.unlinkSync(destination);
                }
            } catch (err) {
                console.error(`Erro ao remover arquivo incompleto: ${err.message}`);
            }
            
            // Remover da lista de arquivos temporários
            tempFiles.delete(destination);
            
            // Rejeitar a promise
            reject(error);
        };
        
        // Usar http ou https baseado na URL
        const httpModule = url.startsWith('https') ? https : require('http');
        
        // Fazer a requisição para baixar o arquivo
        try {
            currentRequest = httpModule.get(url, {
                headers: { 
                    'User-Agent': USER_AGENT,
                    'Referer': 'https://animefire.plus/'
                }
            }, (response) => {
                // Verificar se o status é de redirecionamento
                if (response.statusCode === 301 || response.statusCode === 302) {
                    fileStream.close();
                    tempFiles.delete(destination);
                    
                    // Se for redirecionamento, tentar a nova URL
                    console.log(`Redirecionamento para: ${response.headers.location}`);
                    return downloadFile(response.headers.location, destination, animeName)
                        .then(resolve)
                        .catch(reject);
                }
                
                // Verificar se o download está OK
                if (response.statusCode !== 200) {
                    return cleanupAndReject(new Error(`Código de status inválido: ${response.statusCode}`));
                }
                
                // Mostrar progresso do download
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
                            
                            // Atualizar o status de download com o progresso
                            if (downloadStatus.current && downloadStatus.current.name === animeName) {
                                if (downloadStatus.current.details && 
                                    downloadStatus.current.details.currentEpisode) {
                                    
                                    downloadStatus.current.details.downloadPercent = percent;
                                    saveDownloadStatus();
                                }
                            }
                        }
                    }
                });
                
                // Pipe da resposta para o arquivo
                response.pipe(fileStream);
                
                // Evento de conclusão
                fileStream.on('finish', () => {
                    fileStream.close();
                    tempFiles.delete(destination);
                    resolve();
                });
                
                fileStream.on('error', (err) => {
                    cleanupAndReject(err);
                });
            });
            
            // Tratar erros na requisição
            currentRequest.on('error', (err) => {
                cleanupAndReject(err);
            });
            
            // Definir timeout
            currentRequest.setTimeout(60000, () => {
                currentRequest.destroy();
                cleanupAndReject(new Error('Timeout na requisição de download'));
            });
        } catch (error) {
            cleanupAndReject(error);
        }
    });
}

// Executar o programa
main();