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
const QUEUE_FILE = path.join(__dirname, 'download-queue.json');

// Sistema de fila de episódios para downloads
const episodeQueue = {
    episodes: [], // Lista de episódios a baixar
    currentAnime: null, // Informações do anime atual
    lastUpdate: null
};

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

// Carregar fila de episódios se existir
if (fs.existsSync(QUEUE_FILE)) {
    try {
        const savedQueue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
        episodeQueue.episodes = savedQueue.episodes || [];
        episodeQueue.currentAnime = savedQueue.currentAnime || null;
        episodeQueue.lastUpdate = savedQueue.lastUpdate;
        console.log(`Fila de episódios carregada: ${episodeQueue.episodes.length} episódios pendentes.`);
        
        if (episodeQueue.currentAnime) {
            console.log(`Download pendente: ${episodeQueue.currentAnime.displayName}`);
        }
    } catch (error) {
        console.log(`Erro ao ler arquivo de fila. Criando uma nova.`);
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

// Função para salvar a fila de episódios
function saveEpisodeQueue() {
    try {
        episodeQueue.lastUpdate = new Date().toISOString();
        fs.writeFileSync(QUEUE_FILE, JSON.stringify(episodeQueue, null, 2));
    } catch (error) {
        console.error('Erro ao salvar fila de episódios:', error);
    }
}

// Função para adicionar episódios à fila
function addEpisodesToQueue(animeInfo, episodes, animeEntry) {
    episodeQueue.currentAnime = {
        name: animeEntry.name,
        displayName: animeEntry.displayName || animeEntry.name.replace(/-/g, ' '),
        quality: animeEntry.quality,
        url: animeInfo.url,
        title: animeInfo.title,
        startEpisode: animeEntry.startEpisode
    };
    
    episodeQueue.episodes = episodes.map(ep => ({
        number: extractEpisodeNumber(ep.title, ep.url),
        title: ep.title,
        url: ep.url,
        animeName: animeEntry.name
    }));
    
    saveEpisodeQueue();
    console.log(`Adicionados ${episodes.length} episódios à fila de download.`);
}

// Função para remover episódio da fila após download bem-sucedido
function removeEpisodeFromQueue(episodeNumber) {
    episodeQueue.episodes = episodeQueue.episodes.filter(ep => ep.number !== episodeNumber);
    saveEpisodeQueue();
}

// Função para limpar a fila após concluir um anime
function clearQueue() {
    episodeQueue.episodes = [];
    episodeQueue.currentAnime = null;
    saveEpisodeQueue();
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
    console.log('\nPrograma interrompido.');
    
    // Limpar a fila quando o processo for cancelado
    // (para que não tente retomar na próxima execução)
    console.log('Limpando fila de downloads...');
    clearQueue();
    
    // Limpar o status atual
    if (downloadStatus.current) {
        downloadStatus.current.status = 'cancelled';
        downloadStatus.current.endTime = new Date().toISOString();
    }
    saveDownloadStatus();
    
    console.log('Download cancelado. Encerrando programa.');
    process.exit(0);
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
        // Verificar se há uma fila de episódios pendente para retomar
        if (episodeQueue.episodes.length > 0 && episodeQueue.currentAnime) {
            console.log('\n╔════════════════════════════════════════════════════════╗');
            console.log('║    FILA DE DOWNLOAD PENDENTE ENCONTRADA!               ║');
            console.log('╚════════════════════════════════════════════════════════╝');
            console.log(`\nAnime: ${episodeQueue.currentAnime.displayName}`);
            console.log(`Episódios pendentes: ${episodeQueue.episodes.length}`);
            console.log(`Qualidade: ${episodeQueue.currentAnime.quality}`);
            console.log('\nRetomando download...\n');
            
            // Retomar download da fila
            await resumeQueuedDownload();
            
            // Limpar a fila após concluir
            clearQueue();
            
            console.log('\nFila de download concluída!');
            console.log('Processando próximos animes da lista...\n');
        }
        
        // Ler o arquivo de lista de animes
        console.log(`Lendo lista de animes de: ${ANIME_LIST_FILE}`);
        const animeListContent = fs.readFileSync(ANIME_LIST_FILE, 'utf8');
        
        // Verificar se há filtro de anime único ou lista de animes
        const singleAnimeFilter = process.env.DOWNLOAD_SINGLE_ANIME;
        const animeFilterList = process.env.DOWNLOAD_ANIME_FILTER ? process.env.DOWNLOAD_ANIME_FILTER.split('||') : null;
        
        // Extrair informações dos animes do arquivo
        let animeEntries = animeListContent
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
            .map(line => {
                // Formatos possíveis:
                // NOVO: id | título | qualidade | episódio | "URL do anime" | "imageUrl"
                // ANTIGO: título | qualidade | episódio | "URL ou título original"
                let parts = line.split('|').map(part => part.trim());
                
                let name, originalName, quality, startEpisode, animeUrl;
                
                // Detectar se é o novo formato (primeiro campo é numérico)
                if (parts.length > 1 && /^\d+$/.test(parts[0])) {
                    // Novo formato: id | título | qualidade | episódio | "URL" | "imageUrl"
                    name = parts[1]; // Título está no segundo campo
                    quality = parts[2]?.toUpperCase() === 'SD' ? 'SD' : 
                              parts[2]?.toUpperCase() === 'HD' ? 'HD' : 
                              CONFIG.defaultQuality;
                    startEpisode = parts[3] ? parseInt(parts[3]) : CONFIG.startFromEpisode;
                    animeUrl = parts[4] ? parts[4].replace(/^"|"$/g, '') : '';
                    originalName = name;
                    console.log(`[DEBUG] Anime lido: ${name}, startEpisode: ${startEpisode} (parts[3]: "${parts[3]}")`);
                } else {
                    // Formato antigo: título | qualidade | episódio | "URL ou título original"
                    name = parts[0];
                    originalName = name;
                    quality = parts[1]?.toUpperCase() === 'SD' ? 'SD' : 
                              parts[1]?.toUpperCase() === 'HD' ? 'HD' : 
                              CONFIG.defaultQuality;
                    startEpisode = parts[2] ? parseInt(parts[2]) : CONFIG.startFromEpisode;
                    animeUrl = '';
                    
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
                }
                
                return {
                    name: name, // Nome normalizado para pesquisa e criação de pasta
                    displayName: originalName, // Nome original para exibição
                    quality: quality,
                    startEpisode: startEpisode,
                    animeUrl: animeUrl // URL direta para o anime, se disponível
                };
            });
        
        // Aplicar filtros se existirem
        if (singleAnimeFilter) {
            console.log(`Filtro de anime único detectado: ${singleAnimeFilter}`);
            animeEntries = animeEntries.filter(entry => entry.name === singleAnimeFilter);
        } else if (animeFilterList) {
            console.log(`Filtro de múltiplos animes detectado: ${animeFilterList.length} animes`);
            animeEntries = animeEntries.filter(entry => animeFilterList.includes(entry.name));
        }
        
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

// Função para normalizar nomes de animes para pesquisa (mesma do server.js)
function normalizeAnimeNameForSearch(name) {
    return name
        .trim()
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s-]/g, '') 
        .replace(/\s+/g, '-')     
        .replace(/-+$/, '');      
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
        
        // Se temos uma URL direta, usá-la em vez de buscar
        if (animeEntry.animeUrl) {
            console.log(`Usando URL fornecida: ${animeEntry.animeUrl}`);
            // Normalizar URLs que apontam para um episódio único -> tentar converter para a página da série
            try {
                const providedUrl = animeEntry.animeUrl;
                let normalizedUrl = providedUrl;

                // Se a URL JÁ termina em "-todos-os-episodios", não normalizar novamente
                if (providedUrl.toLowerCase().includes('-todos-os-episodios')) {
                    console.log(`URL já aponta para página de séries, usando diretamente.`);
                    normalizedUrl = providedUrl;
                } else {
                    // Se é uma URL do tipo /animes/<slug>/<num> ou termina com /<num>, converter para /animes/<slug>-todos-os-episodios
                    const m = providedUrl.match(/^(https?:\/\/[^\/]+\/animes\/)([^\/]+)(?:\/(?:episodio\/)?(\d+))?\/?$/i);
                    if (m) {
                        const base = m[1];
                        const slug = m[2];
                        // Construir a URL da página de todos os episódios
                        normalizedUrl = `${base}${slug}-todos-os-episodios`;
                        console.log(`Normalizando URL de episódio -> página da série: ${normalizedUrl}`);
                    }
                }

                animeInfo = {
                    title: displayName,
                    url: normalizedUrl
                };
            } catch (err) {
                console.log(`Erro ao normalizar URL fornecida: ${err.message}. Usando a URL original.`);
                animeInfo = { title: displayName, url: animeEntry.animeUrl };
            }
        } else {
            // Buscar informações do anime usando o nome normalizado
            animeInfo = await findAnime(searchName);
        }
        
        if (!animeInfo) {
            console.log('Anime não encontrado. Verifique o nome e tente novamente.');
            updateProgress(animeEntry.name, 'error', 0, 'Anime não encontrado');
            return;
        }
        
        console.log(`\nAnime encontrado: ${animeInfo.title}`);
        console.log(`URL: ${animeInfo.url}\n`);
        
        // Criar pasta para o anime (verificar se já existe uma pasta similar antes de criar)
        // Remover porções como "Episódio X" do título que possam vir na fonte
        let folderBase = (animeInfo.title || displayName || animeEntry.name || '').replace(/Episódio\s*\d+/i, '').trim();
        folderBase = folderBase.replace(/\s+/g, ' ').trim();

        // Gerar possíveis variações de nome de pasta (sanitizadas)
        const candidates = [
            sanitize(folderBase),
            sanitize(folderBase.replace(/-/g, ' ')),
            sanitize((animeEntry.name || '').replace(/-/g, ' ')),
            sanitize(animeEntry.name || '')
        ].filter(Boolean);

        // Procurar primeiro candidato que já exista
        let animeFolderName = null;
        for (const c of candidates) {
            const p = path.join(DOWNLOAD_FOLDER, c);
            if (fs.existsSync(p)) {
                animeFolderName = c;
                break;
            }
        }

        // Se não encontrou, usar o primeiro candidato e criar a pasta
        if (!animeFolderName) {
            animeFolderName = candidates[0] || sanitize(folderBase || 'anime');
            const animeFolder = path.join(DOWNLOAD_FOLDER, animeFolderName);
            if (!fs.existsSync(animeFolder)) {
                fs.mkdirSync(animeFolder, { recursive: true });
                console.log(`Pasta criada para o anime: ${animeFolderName}`);
            }
        }

        const animeFolder = path.join(DOWNLOAD_FOLDER, animeFolderName);
        
        // Criar arquivo de log para este anime
        const logFile = path.join(animeFolder, '_download_log.txt');
        const logStream = fs.createWriteStream(logFile, {flags: 'a'});
        let logEntry = `\n[${new Date().toISOString()}] Iniciando download de: ${animeInfo.title} (${animeInfo.url})\n`;
        logEntry += `Qualidade: ${animeEntry.quality}, Começando do episódio: ${animeEntry.startEpisode}\n`;
        logStream.write(logEntry);
        
        // Buscar episódios
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
        console.log(`[DEBUG] Filtrando episódios. startEpisode configurado: ${animeEntry.startEpisode}`);
        const filteredEpisodes = episodes.filter(ep => {
            const episodeNumber = extractEpisodeNumber(ep.title, ep.url);
            const shouldInclude = episodeNumber >= animeEntry.startEpisode;
            console.log(`[DEBUG] Episódio ${episodeNumber}: ${shouldInclude ? 'INCLUIR' : 'PULAR'} (título: ${ep.title})`);
            return shouldInclude;
        });
        
        console.log(`Episódios a baixar: ${filteredEpisodes.length} (a partir do ${animeEntry.startEpisode})\n`);
        logStream.write(`Episódios a baixar: ${filteredEpisodes.length} (a partir do ${animeEntry.startEpisode})\n`);
        
        // Adicionar episódios à fila
        addEpisodesToQueue(animeInfo, filteredEpisodes, animeEntry);
        
        updateProgress(animeEntry.name, 'downloading', 10, null, {
            totalEpisodes: filteredEpisodes.length,
            currentEpisode: 0
        });
        
        // Download de cada episódio usando a fila
        await downloadEpisodesFromQueue(animeFolder, animeFolderName, animeEntry, logStream);
        
        const completeMessage = `\nDownload de "${animeInfo.title}" concluído!\n`;
        console.log(completeMessage);
        logStream.write(completeMessage);
        logStream.end();
        
        // Limpar a fila após concluir
        clearQueue();
        
        updateProgress(animeEntry.name, 'completed', 100);
        
    } catch (error) {
        console.error('Erro ao processar anime:', error);
        updateProgress(animeEntry.name, 'error', 0, `Erro ao processar anime: ${error.message}`);
    }
}

// Função para baixar episódios da fila
async function downloadEpisodesFromQueue(animeFolder, animeFolderName, animeEntry, logStream) {
    const totalEpisodes = episodeQueue.episodes.length;
    let currentIndex = 0;
    
    while (episodeQueue.episodes.length > 0) {
        const episode = episodeQueue.episodes[0]; // Pegar o primeiro da fila
        currentIndex++;
        
        const episodeNumber = episode.number;
        
        // Atualizar progresso baseado no episódio atual
        const progressPercent = 10 + Math.round((currentIndex / totalEpisodes) * 90);
        updateProgress(animeEntry.name, 'downloading_episode', progressPercent, null, {
            totalEpisodes: totalEpisodes,
            currentEpisode: currentIndex,
            episodeNumber: episodeNumber
        });
        
        // Formatar nome do arquivo
        const fileName = `${animeFolderName} - Episódio ${episodeNumber}.mp4`;
        const filePath = path.join(animeFolder, fileName);
        const tempFilePath = path.join(animeFolder, `${fileName}.temp`);
        
        // Verificar se o arquivo já existe
        if (fs.existsSync(filePath)) {
            const message = `[${currentIndex}/${totalEpisodes}] Episódio ${episodeNumber} já existe. Pulando...`;
            console.log(message);
            logStream.write(`${message}\n`);
            
            // Remover da fila
            removeEpisodeFromQueue(episodeNumber);
            continue;
        }
        
        const startMessage = `[${currentIndex}/${totalEpisodes}] Baixando episódio ${episodeNumber} em qualidade ${animeEntry.quality}...`;
        console.log(startMessage);
        logStream.write(`${startMessage}\n`);
        
        // Obter links de download
        const downloadLinks = await getDownloadLinks(episode.url);

        if (downloadLinks.length === 0) {
            const noLinksMessage = `Nenhum link de download encontrado para o episódio ${episodeNumber}. Criando atalho para visualização online...`;
            console.log(noLinksMessage);
            logStream.write(`${noLinksMessage}\n`);
            
            // Criar arquivo de atalho para assistir online
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
            
            // Remover da fila
            removeEpisodeFromQueue(episodeNumber);
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
        
        // Baixar o arquivo
        try {
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
            
            const successMessage = `✓ Episódio ${episodeNumber} baixado com sucesso! [${selectedLink.quality}]`;
            console.log(successMessage);
            logStream.write(`${successMessage}\n`);
            
            // Remover da fila após download bem-sucedido
            removeEpisodeFromQueue(episodeNumber);
            
        } catch (error) {
            const errorMessage = `✗ Erro ao baixar episódio ${episodeNumber}: ${error.message}`;
            console.error(errorMessage);
            logStream.write(`${errorMessage}\n`);
            
            // Atualizar progresso com erro
            updateProgress(animeEntry.name, 'error_episode', progressPercent, `Erro ao baixar episódio ${episodeNumber}: ${error.message}`, {
                totalEpisodes: totalEpisodes,
                currentEpisode: currentIndex,
                episodeNumber: episodeNumber
            });
            
            // Limpar arquivo temporário se existir
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }
            
            // Limpar arquivo final se existir (parcialmente)
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            
            // Remover da fila mesmo em caso de erro para evitar loop infinito
            removeEpisodeFromQueue(episodeNumber);
        }
    }
}

// Função para retomar download da fila salva
async function resumeQueuedDownload() {
    if (!episodeQueue.currentAnime) {
        console.log('Nenhum anime na fila para retomar.');
        return;
    }
    
    const animeEntry = episodeQueue.currentAnime;
    
    // Verificar se a pasta do anime existe, se não, criar
    const candidates = [
        sanitize(animeEntry.displayName),
        sanitize(animeEntry.name.replace(/-/g, ' ')),
        sanitize(animeEntry.name)
    ].filter(Boolean);

    let animeFolderName = null;
    for (const c of candidates) {
        const p = path.join(DOWNLOAD_FOLDER, c);
        if (fs.existsSync(p)) {
            animeFolderName = c;
            break;
        }
    }

    if (!animeFolderName) {
        animeFolderName = candidates[0] || sanitize(animeEntry.displayName || 'anime');
        const animeFolder = path.join(DOWNLOAD_FOLDER, animeFolderName);
        if (!fs.existsSync(animeFolder)) {
            fs.mkdirSync(animeFolder, { recursive: true });
            console.log(`Pasta criada para o anime: ${animeFolderName}`);
        }
    }

    const animeFolder = path.join(DOWNLOAD_FOLDER, animeFolderName);
    
    // Criar/abrir arquivo de log
    const logFile = path.join(animeFolder, '_download_log.txt');
    const logStream = fs.createWriteStream(logFile, {flags: 'a'});
    logStream.write(`\n[${new Date().toISOString()}] Retomando download de: ${animeEntry.displayName}\n`);
    
    // Atualizar status
    downloadStatus.current = {
        name: animeEntry.name,
        displayName: animeEntry.displayName,
        quality: animeEntry.quality,
        startEpisode: animeEntry.startEpisode,
        status: 'downloading',
        progress: 0,
        startTime: new Date().toISOString()
    };
    
    saveDownloadStatus();
    
    // Baixar episódios da fila
    await downloadEpisodesFromQueue(animeFolder, animeFolderName, animeEntry, logStream);
    
    const completeMessage = `\nDownload retomado de "${animeEntry.displayName}" concluído!\n`;
    console.log(completeMessage);
    logStream.write(completeMessage);
    logStream.end();
    
    updateProgress(animeEntry.name, 'completed', 100);
    
    // Adicionar aos downloads concluídos
    downloadStatus.current.status = 'completed';
    downloadStatus.current.endTime = new Date().toISOString();
    downloadStatus.completed.push({ ...downloadStatus.current });
    downloadStatus.current = null;
    
    saveDownloadStatus();
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
        
    // Evitar hifens duplicados antes de acrescentar o sufixo
    const cleanSearchTerm = searchTerm.replace(/-+$/g, '');
    const directUrl = `https://animefire.plus/animes/${cleanSearchTerm}-todos-os-episodios`;
        
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
        const response = await axios.get(animeUrl, {
            headers: { 'User-Agent': USER_AGENT }
        });
        
        const $ = cheerio.load(response.data);
        const episodes = [];
        
        // Tentar diversos seletores para encontrar os episódios
        // 1. Seletor original
        $('.div_video_list a').each((index, element) => {
            const title = $(element).text().trim();
            const url = $(element).attr('href');
            
            if (url) {
                episodes.push({ title: title || `Episódio ${index + 1}`, url });
            }
        });
        
        // 2. Seletor alternativo se o primeiro não funcionar
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
        
        return episodes;
    } catch (error) {
        console.error('Erro ao obter episódios:', error.message);
        return [];
    }
}

// Função para obter links de download de um episódio
async function getDownloadLinks(episodeUrl) {
    try {
        console.log(`Obtendo links de download para: ${episodeUrl}`);
        
        const response = await axios.get(episodeUrl, {
            headers: { 'User-Agent': USER_AGENT }
        });
        
        const $ = cheerio.load(response.data);
        const downloadLinks = [];
        
        // Verificar se há um botão de download na própria página do episódio
        $('a[href*=".mp4"]').each((index, element) => {
            const el = $(element);
            const url = el.attr('href');
            const text = el.text().trim();
            
            if (url && url.includes('.mp4')) {
                downloadLinks.push({
                    url,
                    quality: text.includes('HD') ? 'HD' : 
                             text.includes('SD') ? 'SD' : 'Desconhecida'
                });
            }
        });
        
        // Se encontrou links diretos na página do episódio, retornar esses links
        if (downloadLinks.length > 0) {
            console.log(`Encontrados ${downloadLinks.length} links diretos na página do episódio.`);
            return downloadLinks;
        }
        
        // Construir URL da página de download
        let downloadPageUrl = episodeUrl.replace('/episodio/', '/download/');
        
        // Se a substituição não funcionou, tenta construir manualmente
        if (downloadPageUrl === episodeUrl) {
            const urlParts = episodeUrl.split('/');
            const animeSlug = urlParts[urlParts.length - 2];
            const episodeNumber = urlParts[urlParts.length - 1];
            downloadPageUrl = `https://animefire.plus/download/${animeSlug}/${episodeNumber}`;
        }
        
        console.log(`Página de download: ${downloadPageUrl}`);
        
        try {
            const downloadResponse = await axios.get(downloadPageUrl, {
                headers: { 'User-Agent': USER_AGENT }
            });
            
            const $download = cheerio.load(downloadResponse.data);
            
            // Procurar links de download com qualidades específicas
            
            // Procurar link SD
            $download('a').each((index, element) => {
                const el = $download(element);
                const url = el.attr('href') || el.attr('download');
                const text = el.text().trim();
                
                if (url && url.includes('.mp4') && text.includes('SD')) {
                    downloadLinks.push({
                        url,
                        quality: 'SD'
                    });
                }
            });
            
            // Procurar link HD
            $download('a').each((index, element) => {
                const el = $download(element);
                const url = el.attr('href') || el.attr('download');
                const text = el.text().trim();
                
                if (url && url.includes('.mp4') && text.includes('HD')) {
                    downloadLinks.push({
                        url,
                        quality: 'HD'
                    });
                }
            });
            
            // Se não encontrou links específicos, procura qualquer link mp4
            if (downloadLinks.length === 0) {
                $download('a').each((index, element) => {
                    const el = $download(element);
                    const url = el.attr('href') || el.attr('download');
                    const text = el.text().trim();
                    
                    if (url && url.includes('.mp4')) {
                        downloadLinks.push({
                            url,
                            quality: text || 'Desconhecida'
                        });
                    }
                });
            }
        } catch (error) {
            console.log(`Erro ao acessar página de download: ${error.message}. Tentando métodos alternativos.`);
        }
        
        // Método alternativo: tentar extrair URL do player
        if (downloadLinks.length === 0) {
            console.log("Tentando extrair URL do player de vídeo...");
            
            // Procurar por URLs de vídeo nos scripts da página
            const scripts = $('script').map((i, el) => $(el).html()).get();
            for (const script of scripts) {
                const mp4Matches = script.match(/https?:\/\/[^"'\s)]*\.mp4/g);
                if (mp4Matches) {
                    for (const url of mp4Matches) {
                        if (!downloadLinks.some(link => link.url === url)) {
                            downloadLinks.push({
                                url,
                                quality: url.includes('/hd/') ? 'HD' : url.includes('/sd/') ? 'SD' : 'Desconhecida'
                            });
                        }
                    }
                }
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
        
        // Criar fluxo de escrita para o arquivo
        const fileStream = fs.createWriteStream(destination);
        
        // Para armazenar a requisição atual para poder cancelá-la se necessário
        let currentRequest = null;
        
        // Função para limpar recursos e rejeitar
        const cleanupAndReject = (error) => {
            // Fechar o stream de arquivo
            fileStream.close();
            
            // Remover arquivo incompleto
            try {
                if (fs.existsSync(destination)) {
                    fs.unlinkSync(destination);
                }
            } catch (err) {
                console.error(`Erro ao remover arquivo incompleto: ${err.message}`);
            }
            
            // Rejeitar a promise
            reject(error);
        };
        
        // Fazer a requisição para baixar o arquivo
        try {
            currentRequest = https.get(url, {
                headers: { 'User-Agent': USER_AGENT }
            }, (response) => {
                // Verificar se o status é de redirecionamento
                if (response.statusCode === 301 || response.statusCode === 302) {
                    fileStream.close();
                    
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
                        if (percent >= lastLoggedPercent + 10) {
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
                
                // Eventos de conclusão e erro
                fileStream.on('finish', () => {
                    fileStream.close();
                    resolve();
                });
                
                fileStream.on('error', (err) => {
                    cleanupAndReject(err);
                });
                
                // Evento para caso a conexão seja encerrada antes de terminar
                response.on('close', () => {
                    if (downloadedSize < totalSize) {
                        cleanupAndReject(new Error('Conexão encerrada antes de terminar o download'));
                    }
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