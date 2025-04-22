const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const bodyParser = require('body-parser');
const axios = require('axios');
const cheerio = require('cheerio');
const sanitize = require('sanitize-filename'); // Importar módulo sanitize-filename

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Add route to serve dark theme CSS with proper cache headers
app.get('/dark-theme.css', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'public', 'dark-theme.css'));
});

// Constants
const ANIME_LIST_FILE = path.join(__dirname, 'anime-list.txt');
const CONFIG_FILE = path.join(__dirname, 'config.json');
const STATUS_FILE = path.join(__dirname, 'download-status.json');
const IMAGES_CACHE_FILE = path.join(__dirname, 'anime-images-cache.json');
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
const WATCHED_EPISODES_FILE = path.join(__dirname, 'watched-episodes.json');

// Helper function to get anime line from list
function getAnimeLineFromList(animeTitle) {
    try {
        if (!fs.existsSync(ANIME_LIST_FILE)) return null;
        
        const content = fs.readFileSync(ANIME_LIST_FILE, 'utf8');
        const lines = content.split('\n');
        
        // Find the exact line that matches the anime title
        const line = lines.find(line => {
            if (line.trim() && !line.startsWith('#')) {
                const parts = line.split('|');
                return parts[0].trim() === animeTitle;
            }
            return false;
        });
        
        return line || null;
    } catch (error) {
        console.error('Error getting anime line from list:', error);
        return null;
    }
}

// Adicione esta constante no início do arquivo com outros mapeamentos de constantes
const ANIME_ALIASES = {
    // Mapeia nomes alternativos para o mesmo anime
    "Re:Zero kara Hajimeru Isekai Seikatsu 3rd Season": "re-zero-kara-hajimeru-isekai-seikatsu-3rd-season",
    "re-zero-kara-hajimeru-isekai-seikatsu-3rd-season": "Re:Zero kara Hajimeru Isekai Seikatsu 3rd Season",
    // Adicionar caso especial para anime com ponto de interrogação
    "Saikyou no Ousama, Nidome no Jinsei wa Nani wo Suru?": "Saikyou no Ousama, Nidome no Jinsei wa Nani wo Suru",
    "Saikyou no Ousama, Nidome no Jinsei wa Nani wo Suru": "Saikyou no Ousama, Nidome no Jinsei wa Nani wo Suru?"
};

// Carregar configurações
let config = {};
try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
} catch (error) {
    console.error('Erro ao ler configurações:', error);
    config = {
        defaultQuality: 'HD',
        startFromEpisode: 1,
        downloadFolder: path.join(__dirname, 'downloads')
    };
    
    // Salvar configurações padrão
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Garantir que a pasta de downloads existe
let DOWNLOAD_FOLDER = config.downloadFolder || path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOAD_FOLDER)) {
    fs.mkdirSync(DOWNLOAD_FOLDER, { recursive: true });
}

// Ensure anime list exists
if (!fs.existsSync(ANIME_LIST_FILE)) {
    fs.writeFileSync(ANIME_LIST_FILE, '# Add your anime list here\n# Format: Anime Name | HD/SD | Starting Episode\n');
}

// Ensure images cache exists
let animeImagesCache = {};
if (fs.existsSync(IMAGES_CACHE_FILE)) {
    try {
        animeImagesCache = JSON.parse(fs.readFileSync(IMAGES_CACHE_FILE, 'utf8'));
    } catch (error) {
        console.error('Error reading images cache:', error);
    }
}

// Initialize watched episodes data
let watchedEpisodes = {};
try {
    if (fs.existsSync(WATCHED_EPISODES_FILE)) {
        watchedEpisodes = JSON.parse(fs.readFileSync(WATCHED_EPISODES_FILE, 'utf8'));
    }
} catch (error) {
    console.error('Error loading watched episodes:', error);
    watchedEpisodes = {};
}

// Save watched episodes
function saveWatchedEpisodes() {
    try {
        fs.writeFileSync(WATCHED_EPISODES_FILE, JSON.stringify(watchedEpisodes, null, 2));
    } catch (error) {
        console.error('Error saving watched episodes:', error);
    }
}

// Global variable to track active download processes
let activeDownloadProcesses = [];

// API Routes
// Get anime list
app.get('/api/animes', (req, res) => {
    try {
        if (!fs.existsSync(ANIME_LIST_FILE)) {
            return res.json([]);
        }

        const content = fs.readFileSync(ANIME_LIST_FILE, 'utf8');
        const animes = content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
            .map((line, index) => {
                const parts = line.split('|').map(part => part.trim());
                const title = parts[0];
                
                // Adicionar displayTitle para exibição com espaços em vez de hífens
                const displayTitle = title.replace(/-/g, ' ');
                
                // Extract anime URL if available (format: "URL" in 4th position)
                let animeUrl = '';
                if (parts.length >= 4) {
                    // Remove quotes if present
                    animeUrl = parts[3].replace(/^"(.+)"$/, '$1');
                }
                
                // Add cached image if available
                const animeData = {
                    id: `anime-${index}`,
                    title: title,
                    displayTitle: displayTitle,
                    quality: parts[1] || 'HD',
                    startEpisode: parseInt(parts[2] || '1', 10),
                    animeUrl: animeUrl,
                    imageUrl: animeImagesCache[title] || '' // Use cached image if available
                };
                
                return animeData;
            });

        // Check for downloaded episodes
        animes.forEach(anime => {
            anime.episodes = [];
            
            // Lista de possíveis nomes de pasta para este anime
            const folderNames = [
                anime.title,                  // Nome original com hifens
                anime.title.replace(/-/g, ' ') // Nome sem hifens (novo formato)
            ]; 
            
            // Adicionar aliases se existirem
            if (ANIME_ALIASES[anime.title]) {
                folderNames.push(ANIME_ALIASES[anime.title]);
                // Também adicionar versão sem hifens do alias
                folderNames.push(ANIME_ALIASES[anime.title].replace(/-/g, ' '));
            }
            
            // Se o título contém Re:Zero, adicione variações específicas
            if (anime.title.toLowerCase().includes('re:zero') ||
                anime.title.toLowerCase().includes('re-zero')) {
                folderNames.push('Re:Zero kara Hajimeru Isekai Seikatsu 3rd Season');
                folderNames.push('re-zero-kara-hajimeru-isekai-seikatsu-3rd-season');
                folderNames.push(sanitize('Re:Zero kara Hajimeru Isekai Seikatsu 3rd Season'));
                // Adicionar versões sem hifens
                folderNames.push('Re:Zero kara Hajimeru Isekai Seikatsu 3rd Season'.replace(/-/g, ' '));
                folderNames.push('re-zero-kara-hajimeru-isekai-seikatsu-3rd-season'.replace(/-/g, ' '));
            }
            
            // Verificar cada pasta possível
            for (const folderName of folderNames) {
                const animeFolder = path.join(DOWNLOAD_FOLDER, folderName);
                
                if (fs.existsSync(animeFolder)) {
                    const files = fs.readdirSync(animeFolder);
                    
                    // Procurar por arquivos de episódios
                    const episodeFiles = files.filter(file => 
                        file.endsWith('.mp4') || 
                        (file.endsWith('.url') && file.includes('Episódio'))
                    );
                    
                    episodeFiles.forEach(file => {
                        const match = file.match(/Episódio\s*(\d+)/i);
                        if (match && match[1]) {
                            const epNumber = parseInt(match[1], 10);
                            
                            // Evitar duplicações
                            if (!anime.episodes.some(ep => ep.number === epNumber)) {
                                anime.episodes.push({
                                    number: epNumber,
                                    title: `Episódio ${epNumber}`,
                                    downloaded: true,
                                    isUrl: file.endsWith('.url'),
                                    filePath: path.join(animeFolder, file)
                                });
                            }
                        }
                    });
                }
            }
            
            // Ordenar episódios por número
            anime.episodes.sort((a, b) => a.number - b.number);
        });

        res.json(animes);
    } catch (error) {
        console.error('Error reading anime list:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get config
app.get('/api/config', (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        res.json(config);
    } catch (error) {
        console.error('Error reading config:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update config
app.put('/api/config', (req, res) => {
    try {
        const config = { ...req.body };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        res.json(config);
    } catch (error) {
        console.error('Error updating config:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add anime
app.post('/api/animes', (req, res) => {
    try {
        const { title, displayTitle, quality = 'HD', startEpisode = 1, animeUrl = '' } = req.body;
        
        if (!title) {
            return res.status(400).json({ error: 'Anime title is required' });
        }
        
        // Read existing content
        let content = fs.existsSync(ANIME_LIST_FILE) 
            ? fs.readFileSync(ANIME_LIST_FILE, 'utf8')
            : '';
        
        // IMPORTANTE: Armazenar a URL exata fornecida pelo usuário, se disponível
        let newEntry = `${title} | ${quality} | ${startEpisode}`;
        if (animeUrl) {
            newEntry += ` | "${animeUrl}"`;
            console.log(`Anime adicionado com URL direta: ${animeUrl}`);
        } else {
            console.log(`Anime adicionado sem URL direta. Apenas o nome será usado para busca (não recomendado).`);
        }
        
        // Add to file
        if (content && !content.endsWith('\n')) {
            content += '\n';
        }
        content += newEntry + '\n';
        
        fs.writeFileSync(ANIME_LIST_FILE, content);
        
        // Return success with id
        res.json({ 
            id: Date.now().toString(),
            title,
            displayTitle: displayTitle || title.replace(/-/g, ' '),
            quality,
            startEpisode,
            animeUrl
        });
    } catch (error) {
        console.error('Error adding anime:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update anime
app.put('/api/animes/:id', (req, res) => {
    try {
        const { title, displayTitle, quality, startEpisode } = req.body;
        // Note: animeUrl is intentionally not destructured as we're not updating it
        
        if (!title) {
            return res.status(400).json({ error: 'Anime title is required' });
        }
        
        // Read content
        const content = fs.readFileSync(ANIME_LIST_FILE, 'utf8');
        const lines = content.split('\n');
        
        // Find anime to update (by title since we don't store IDs in the file)
        const animeIndex = lines.findIndex(line => {
            if (line.trim() && !line.startsWith('#')) {
                const parts = line.split('|');
                return parts[0].trim() === title;
            }
            return false;
        });
        
        if (animeIndex !== -1) {
            // Get the existing line components
            const existingLine = lines[animeIndex];
            const parts = existingLine.split('|').map(part => part.trim());
            
            // Keep the existing title and URL if present, only update quality and startEpisode
            let updatedLine = `${parts[0]} | ${quality} | ${startEpisode}`;
            
            // If there's a URL part, preserve it exactly as it was
            if (parts.length >= 4) {
                updatedLine += ` | ${parts[3]}`;
            }
            
            lines[animeIndex] = updatedLine;
            
            // Write back to file
            fs.writeFileSync(ANIME_LIST_FILE, lines.join('\n'));
            
            // Preserve the URL that might be in cache
            const animeUrl = parts.length >= 4 ? parts[3].replace(/^"(.+)"$/, '$1') : '';
            
            res.json({
                id: req.params.id,
                title,
                displayTitle: displayTitle || title.replace(/-/g, ' '),
                quality,
                startEpisode,
                animeUrl: animeUrl,
                imageUrl: animeImagesCache[title] || ''
            });
        } else {
            res.status(404).json({ error: 'Anime not found' });
        }
    } catch (error) {
        console.error('Error updating anime:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete anime
app.delete('/api/animes/:id', (req, res) => {
    try {
        const { title } = req.query;
        
        if (!title) {
            return res.status(400).json({ error: 'Anime title is required' });
        }
        
        // Read content
        const content = fs.readFileSync(ANIME_LIST_FILE, 'utf8');
        const lines = content.split('\n');
        
        // Filter out the anime with matching title
        const newLines = lines.filter(line => {
            if (line.trim() && !line.startsWith('#')) {
                const parts = line.split('|');
                return parts[0].trim() !== title;
            }
            return true;
        });
        
        // Write back to file
        fs.writeFileSync(ANIME_LIST_FILE, newLines.join('\n'));
        
        // Remove from image cache (optional)
        if (animeImagesCache[title]) {
            delete animeImagesCache[title];
            saveImageCache();
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting anime:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper function to check if an anime is legendado (subtitled)
async function checkAnimeIsLegendado(animeTitle) {
    try {
        // IMPORTANTE: Se o anime já está registrado com URL, usar essa URL
        const animeEntry = getAnimeEntryFromList(animeTitle);
        let animeUrl;
        
        if (animeEntry && animeEntry.animeUrl) {
            console.log(`Usando URL registrada para verificação: ${animeEntry.animeUrl}`);
            animeUrl = animeEntry.animeUrl;
        } else {
            // Fallback para URL construída
            const searchTerm = animeTitle.trim()
                .toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^\w\s-]/g, '')
                .replace(/\s+/g, '-');
            
            animeUrl = `https://animefire.plus/animes/${searchTerm}-todos-os-episodios`;
            console.log(`Sem URL registrada. Usando URL construída: ${animeUrl}`);
        }
        
        // Fetch the anime page
        const response = await axios.get(animeUrl, {
            headers: { 
                'User-Agent': USER_AGENT,
                'Referer': 'https://animefire.plus/'
            }
        });
        
        const $ = cheerio.load(response.data);
        
        // Check if title contains "Dublado"
        const pageTitle = $('h1.anime-title, h2.anime-title, .anime-title').text().trim();
        if (pageTitle.includes('(Dublado)')) {
            console.log(`Rejeitando anime "${animeTitle}" - título contém "Dublado"`);
            return false;
        }
        
        // Look for audio info
        let isLegendado = false;
        
        // Check anime info section
        $('.animeInfo').each((index, element) => {
            const text = $(element).text().trim();
            if (text.includes('Áudio:') && text.includes('Legendado')) {
                isLegendado = true;
                return false; // break the loop
            }
        });
        
        // If no specific audio info found, check if page has "Dublado" tag anywhere
        if (!isLegendado) {
            // Assume it's legendado if no explicit "Dublado" mention is found
            isLegendado = !$('body').text().includes('(Dublado)');
        }
        
        console.log(`Anime "${animeTitle}" is ${isLegendado ? 'Legendado' : 'NOT Legendado'}`);
        return isLegendado;
    } catch (error) {
        console.error(`Error checking if anime is legendado: ${error.message}`);
        // Default to true in case of error to not block downloads
        return true;
    }
}

// Helper function to get anime from list with its URL
function getAnimeEntryFromList(animeTitle) {
    try {
        if (!fs.existsSync(ANIME_LIST_FILE)) return null;
        
        const content = fs.readFileSync(ANIME_LIST_FILE, 'utf8');
        const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
        
        for (const line of lines) {
            const parts = line.split('|').map(part => part.trim());
            const title = parts[0];
            
            if (title === animeTitle) {
                // Check if we have URL (format: "URL" in 4th position)
                let animeUrl = '';
                if (parts.length >= 4) {
                    const urlMatch = parts[3].match(/"([^"]+)"/);
                    if (urlMatch) animeUrl = urlMatch[1];
                }
                
                return {
                    title,
                    quality: parts[1] || 'HD',
                    startEpisode: parseInt(parts[2], 10) || 1,
                    animeUrl
                };
            }
        }
        
        return null;
    } catch (error) {
        console.error('Error reading anime entry:', error);
        return null;
    }
}

// Endpoint para verificar episódios antes de baixar
app.post('/api/animes/:id/check-episodes', async (req, res) => {
    try {
        const { title } = req.body;
        
        if (!title) {
            return res.status(400).json({ error: 'Anime title is required' });
        }
        
        console.log(`Verificando episódios para o anime: ${title}`);
        
        // Check if anime is legendado before downloading
        const isLegendado = await checkAnimeIsLegendado(title);
        if (!isLegendado) {
            return res.status(400).json({ 
                error: 'Este anime não está disponível legendado (apenas dublado)',
                isLegendado: false 
            });
        }
        
        // Get anime entry from list
        const animeEntry = getAnimeEntryFromList(title);
        if (!animeEntry) {
            return res.status(404).json({ error: 'Anime not found in list' });
        }
        
        // Get anime URL
        let animeUrl = '';
        if (animeEntry.animeUrl) {
            animeUrl = animeEntry.animeUrl;
        } else {
            // Format name for search
            const searchTerm = title.trim()
                .toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^\w\s-]/g, '')
                .replace(/\s+/g, '-');
            
            animeUrl = `https://animefire.plus/animes/${searchTerm}-todos-os-episodios`;
        }
        
        // Fetch episode list from anime URL
        const response = await axios.get(animeUrl, {
            headers: { 'User-Agent': USER_AGENT }
        });
        
        const $ = cheerio.load(response.data);
        const episodes = [];
        
        // Extract episodes - same logic as in anime-downloader.js
        // Method 1: div_video_list (most common)
        $('.div_video_list a').each((index, element) => {
            const title = $(element).text().trim();
            const url = $(element).attr('href');
            
            if (url && !episodes.some(ep => ep.url === url)) {
                episodes.push({ 
                    title: title || `Episódio ${index + 1}`, 
                    url,
                    number: extractEpisodeNumber(title, url)
                });
            }
        });
        
        // Method 2: episode containers
        if (episodes.length === 0) {
            $('.episodeItem, .episode-item, [class*="episode"]').each((index, element) => {
                const anchor = $(element).find('a');
                const title = anchor.text().trim() || $(element).text().trim();
                const url = anchor.attr('href');
                
                if (url && !episodes.some(ep => ep.url === url)) {
                    episodes.push({ 
                        title: title || `Episódio ${index + 1}`, 
                        url,
                        number: extractEpisodeNumber(title, url)
                    });
                }
            });
        }
        
        // Method 3: any link containing '/episodio/'
        if (episodes.length === 0) {
            $('a[href*="/episodio/"]').each((index, element) => {
                const title = $(element).text().trim();
                const url = $(element).attr('href');
                
                if (url && !episodes.some(ep => ep.url === url)) {
                    episodes.push({ 
                        title: title || `Episódio ${index + 1}`, 
                        url,
                        number: extractEpisodeNumber(title, url) 
                    });
                }
            });
        }
        
        // Sort episodes
        episodes.sort((a, b) => a.number - b.number);
        
        // Filter episodes from start episode
        const startEpisode = animeEntry.startEpisode || 1;
        const filteredEpisodes = episodes.filter(ep => ep.number >= startEpisode);
        
        // Check for already downloaded episodes
        const displayName = title.replace(/-/g, ' ');
        const folderNames = [title, displayName]; // Possible folder names
        
        // Add folder aliases if they exist
        if (ANIME_ALIASES[title]) {
            folderNames.push(ANIME_ALIASES[title]);
        }
        
        const downloadedEpisodes = [];
        
        for (const folderName of folderNames) {
            const animeFolder = path.join(DOWNLOAD_FOLDER, folderName);
            
            if (fs.existsSync(animeFolder)) {
                const files = fs.readdirSync(animeFolder);
                
                files.forEach(file => {
                    if (file.endsWith('.mp4')) {
                        const match = file.match(/Episódio\s*(\d+)/i);
                        if (match && match[1]) {
                            const epNumber = parseInt(match[1], 10);
                            if (!downloadedEpisodes.includes(epNumber)) {
                                downloadedEpisodes.push(epNumber);
                            }
                        }
                    }
                });
            }
        }
        
        // Mark downloaded episodes
        filteredEpisodes.forEach(episode => {
            episode.downloaded = downloadedEpisodes.includes(episode.number);
        });
        
        // Filter out episodes that need to be downloaded
        const episodesToDownload = filteredEpisodes.filter(ep => !ep.downloaded);
        
        res.json({
            animeTitle: displayName,
            quality: animeEntry.quality || 'HD',
            totalEpisodes: episodes.length,
            downloadedEpisodes: downloadedEpisodes.sort((a, b) => a - b),
            episodesToDownload: episodesToDownload
        });
    } catch (error) {
        console.error('Error checking episodes:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper function to extract episode number
function extractEpisodeNumber(title, url) {
    // Try to extract from title first (most reliable)
    let match = title && title.match(/Episódio\s*(\d+)/i);
    if (match && match[1]) {
        return parseInt(match[1], 10);
    }
    
    // Try to extract from URL if title didn't work
    if (url) {
        match = url.match(/\/(\d+)(?:\/|$)/);
        if (match && match[1]) {
            return parseInt(match[1], 10);
        }
    }
    
    // Default to 0 if we couldn't extract
    return 0;
}

// Atualizar status de download durante o processo
function updateDownloadStatus(anime, episode, episodeProgress, speed, eta, queue) {
    try {
        // Ler status atual
        let status = { completed: [] };
        if (fs.existsSync(STATUS_FILE)) {
            status = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
        }
        
        // Atualizar com informações do episódio atual
        status.status = 'downloading';
        status.currentAnime = anime;
        status.currentEpisode = {
            ...episode,
            progress: episodeProgress,  // Progresso específico do episódio
            speed: speed,
            eta: eta
        };
        
        // Manter a fila atualizada
        if (queue) {
            status.queue = queue;
        }
        
        status.lastUpdated = new Date().toISOString();
        
        // Salvar status atualizado
        fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
    } catch (error) {
        console.error('Error updating download status:', error);
    }
}

// Download a single anime
app.post('/api/animes/:id/download', async (req, res) => {
    try {
        const { title } = req.body;
        
        if (!title) {
            console.log('[SERVER] ❌ Requisição de download sem título do anime');
            return res.status(400).json({ error: 'Anime title is required' });
        }
        
        console.log(`[SERVER] 🚀 Iniciando download para o anime: ${title}`);
        
        // Check if anime is legendado before downloading
        if (title.includes('(Legendado)')) {
            console.log(`[SERVER] ⚠️ Tentativa de download de anime legendado: ${title}`);
            return res.status(400).json({ error: 'Animes legendados não são suportados por enquanto.' });
        }

        // Get anime entry from list
        const animeLine = getAnimeLineFromList(title);
        const animeEntry = getAnimeEntryFromList(title);
        
        if (!animeEntry) {
            console.log(`[SERVER] ❌ Anime não encontrado na lista: ${title}`);
            return res.status(404).json({ error: 'Anime not found in list' });
        }
        
        console.log(`[SERVER] ✓ Anime encontrado na lista: ${title}`);
        console.log(`[SERVER] 📝 Detalhes: URL=${animeEntry.animeUrl || 'N/A'}, Qualidade=${animeEntry.quality || 'N/A'}`);
        
        // Create a temp file with just this one anime
        const tempId = Date.now().toString();
        const tempAnimeListFile = path.join(__dirname, `temp-anime-list-${tempId}.txt`);
        
        // Check if we have the line from the anime list
        if (!animeLine) {
            const content = fs.readFileSync(ANIME_LIST_FILE, 'utf8');
            
            // Try to find by alias if direct search didn't work
            const aliasLine = content.split('\n').find(line => {
                if (line && !line.startsWith('#') && ANIME_ALIASES[title]) {
                    const parts = line.split('|');
                    return parts[0].trim() === ANIME_ALIASES[title];
                }
                return false;
            });
            
            if (!aliasLine) {
                console.log(`[SERVER] ❌ Linha do anime não encontrada para: ${title}`);
                return res.status(404).json({ error: 'Anime not found in list' });
            }
            
            // Create temp file with the alias line
            fs.writeFileSync(tempAnimeListFile, aliasLine);
        } else {
            // Create temp file with the found line
            fs.writeFileSync(tempAnimeListFile, animeLine);
        }
        
        console.log(`[SERVER] 📄 Arquivo temporário criado: ${tempAnimeListFile}`);
        
        // Clear any existing status before starting new download
        // This ensures we see the verification process in the UI
        const resetStatus = {
            status: 'verifying',
            current: {
                name: title,
                displayName: title.replace(/-/g, ' '),
                status: 'verifying',
                message: 'Verificando episódios disponíveis...',
                progress: 0
            },
            queue: [],
            completed: [],
            lastUpdated: new Date().toISOString()
        };
        fs.writeFileSync(STATUS_FILE, JSON.stringify(resetStatus, null, 2));
        console.log(`[SERVER] 📊 Status de download resetado para 'verifying'`);
        
        // Pre-fetch anime info to warm up connections and caches for long names
        try {
            console.log(`[SERVER] 🔄 Pré-carregando informações do anime: ${animeEntry.animeUrl || title}`);
            
            const animeUrl = animeEntry.animeUrl || `https://animefire.plus/animes/${title.trim().toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^\w\s-]/g, '')
                .replace(/\s+/g, '-')}-todos-os-episodios`;
                
            axios.get(animeUrl, {
                headers: { 'User-Agent': USER_AGENT },
                timeout: 30000
            }).then(() => {
                console.log(`[SERVER] ✓ Pré-carregamento bem-sucedido para: ${animeUrl}`);
            }).catch(err => {
                console.log(`[SERVER] ⚠️ Aviso: Pré-carregamento falhou, mas continuando: ${err.message}`);
            });
        } catch (preFetchError) {
            console.log(`[SERVER] ⚠️ Pré-carregamento falhou: ${preFetchError.message} - continuando mesmo assim`);
        }
        
        // Define a função para realizar a tentativa de download
        const attemptDownload = (attempt = 1) => {
            console.log(`[SERVER] 🔄 Tentativa ${attempt} para iniciar download: ${title}`);
            
            // Spawn downloader process with the temp file
            const animeProcess = spawn('node', ['anime-downloader.js'], {
                env: {...process.env, 
                    ANIME_LIST_FILE: tempAnimeListFile,
                    NODE_OPTIONS: '--max-http-header-size=16384', // Aumentar limite de headers HTTP
                    DOWNLOAD_ATTEMPT: attempt.toString()
                },
                detached: true
            });
            
            console.log(`[SERVER] 🚀 Processo de download iniciado (PID: ${animeProcess.pid})`);
            
            // Store reference to the process
            activeDownloadProcesses.push({
                pid: animeProcess.pid,
                title: title,
                tempFile: tempAnimeListFile,
                process: animeProcess,
                attempt: attempt
            });
            
            animeProcess.stdout.on('data', (data) => {
                console.log(`[SERVER-${title}]: ${data}`);
            });
            
            animeProcess.stderr.on('data', (data) => {
                console.error(`[SERVER-${title}-ERROR]: ${data}`);
            });
            
            animeProcess.on('close', (code) => {
                console.log(`[SERVER] ⏹️ Processo de download para ${title} finalizado com código ${code}`);
                
                // Se falhou na primeira tentativa para animes com nomes longos, tentar novamente
                if (code !== 0 && attempt === 1 && title.length > 50) {
                    console.log(`[SERVER] ⚠️ Falha na primeira tentativa para anime com nome longo (${title.length} caracteres). Tentando novamente...`);
                    
                    // Aguardar um momento antes de tentar novamente
                    setTimeout(() => {
                        attemptDownload(attempt + 1);
                    }, 3000);
                } else {
                    // Clean up temp file quando finalizar todas tentativas
                    try {
                        if (fs.existsSync(tempAnimeListFile)) {
                            fs.unlinkSync(tempAnimeListFile);
                            console.log(`[SERVER] 🗑️ Arquivo temporário removido: ${tempAnimeListFile}`);
                        }
                    } catch (err) {
                        console.error(`[SERVER] ❌ Erro ao remover arquivo temporário: ${err.message}`);
                    }
                }
            });
            
            // Don't wait for process to finish
            animeProcess.unref();
        };
        
        // Iniciar a primeira tentativa
        attemptDownload();
        console.log(`[SERVER] ✅ Download iniciado para ${title}, respondendo ao cliente`);
        
        res.json({ success: true, message: 'Download started' });
    } catch (error) {
        console.error(`[SERVER] ❌ Erro ao iniciar download: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Start downloading all animes
app.post('/api/download-all', async (req, res) => {
    try {
        // Read content
        const content = fs.readFileSync(ANIME_LIST_FILE, 'utf8');
        const lines = content.split('\n');
        const animeList = [];
        const skippedAnimes = []; // Track skipped animes to report to user
        
        // Extract anime titles and check if they're legendado
        for (const line of lines) {
            if (line.trim() && !line.startsWith('#')) {
                const parts = line.split('|');
                const title = parts[0].trim();
                
                // Check if anime is legendado
                const isLegendado = await checkAnimeIsLegendado(title);
                if (isLegendado) {
                    animeList.push(title);
                } else {
                    skippedAnimes.push(title);
                    console.log(`Skipping "${title}" - not available with subtitles`);
                }
            }
        }
        
        if (animeList.length === 0) {
            return res.status(404).json({ 
                error: 'No subtitled (legendado) animes found to download',
                skippedAnimes
            });
        }
        
        // Create a temporary filtered anime list file with only legendado animes
        const tempAnimeListFile = path.join(__dirname, `temp-legendado-${Date.now()}.txt`);
        const tempContent = lines.filter(line => {
            if (line.trim() && !line.startsWith('#')) {
                const parts = line.split('|');
                return animeList.includes(parts[0].trim());
            }
            return false;
        }).join('\n');
        
        fs.writeFileSync(tempAnimeListFile, tempContent);
        
        // Spawn downloader process with the filtered list
        const animeProcess = spawn('node', ['anime-downloader.js'], {
            env: {...process.env, ANIME_LIST_FILE: tempAnimeListFile},
            detached: true
        });
        
        // Store reference to the process
        activeDownloadProcesses.push({
            pid: animeProcess.pid,
            title: 'all-animes',
            tempFile: tempAnimeListFile,
            process: animeProcess
        });
        
        animeProcess.stdout.on('data', (data) => {
            console.log(`[Download]: ${data}`);
        });
        
        animeProcess.stderr.on('data', (data) => {
            console.error(`[Download Error]: ${data}`);
        });
        
        animeProcess.on('close', (code) => {
            console.log(`Download process exited with code ${code}`);
            // Clean up temp file
            if (fs.existsSync(tempAnimeListFile)) {
                fs.unlinkSync(tempAnimeListFile);
            }
        });
        
        // Don't wait for process to finish
        animeProcess.unref();
        
        res.json({ success: true, message: 'Download of subtitled animes started', count: animeList.length });
    } catch (error) {
        console.error('Error starting download of all animes:', error);
        res.status(500).json({ error: error.message });
    }
});

// Search image API endpoint
app.get('/api/search-image', async (req, res) => {
    try {
        const { title, url } = req.query;
        
        if (!title) {
            return res.status(400).json({ error: 'Anime title is required' });
        }
        
        // Check cache first
        if (animeImagesCache[title]) {
            return res.json({ imageUrl: animeImagesCache[title] });
        }
        
        // PRIORIDADE ABSOLUTA: Se uma URL direta foi fornecida, use apenas ela
        let imageUrl = '';
        
        if (url) {
            console.log(`Buscando imagem exclusivamente da URL direta fornecida: ${url}`);
            try {
                imageUrl = await getImageFromDirectUrl(url);
                
                if (imageUrl) {
                    console.log(`Imagem encontrada com sucesso a partir da URL direta!`);
                } else {
                    console.log(`Nenhuma imagem encontrada na URL direta fornecida.`);
                }
            } catch (error) {
                console.error(`Erro ao obter imagem da URL direta: ${error.message}`);
            }
        } else {
            console.log(`AVISO: Nenhuma URL direta fornecida para buscar imagem do anime "${title}"`);
            // Tentar obter a URL direta do anime da lista (se estiver salva)
            const animeEntry = getAnimeEntryFromList(title);
            if (animeEntry && animeEntry.animeUrl) {
                console.log(`Encontrada URL direta na lista para o anime "${title}": ${animeEntry.animeUrl}`);
                try {
                    imageUrl = await getImageFromDirectUrl(animeEntry.animeUrl);
                    
                    if (imageUrl) {
                        console.log(`Imagem encontrada com sucesso da URL salva na lista!`);
                    }
                } catch (error) {
                    console.error(`Erro ao obter imagem da URL salva: ${error.message}`);
                }
            }
        }
        
        // APENAS como último recurso, se não encontramos por URL, usar o método antigo baseado em nome
        if (!imageUrl) {
            console.log(`Nenhuma imagem encontrada via URL direta. Tentando método antigo por nome (não recomendado)`);
            imageUrl = await searchAnimeImage(title);
        }
        
        // Add to cache if found
        if (imageUrl) {
            animeImagesCache[title] = imageUrl;
            saveImageCache();
        }
        
        res.json({ imageUrl: imageUrl || '' });
    } catch (error) {
        console.error('Error searching anime image:', error);
        res.status(500).json({ error: error.message });
    }
});

// Nova função otimizada para obter imagem diretamente da URL do anime
async function getImageFromDirectUrl(url) {
    try {
        console.log(`Processando URL direta: ${url}`);
        const response = await axios.get(url, {
            headers: { 'User-Agent': USER_AGENT }
        });
        
        const $ = cheerio.load(response.data);
        
        // Estratégias para encontrar a imagem, ordenadas por prioridade
        let imageUrl = '';
        
        // 1. Imagens com classe transitioning_src (comum em animefire)
        $('img.transitioning_src').each((index, element) => {
            const src = $(element).attr('src') || $(element).attr('data-src');
            const alt = $(element).attr('alt') || '';
            
            // Ignorar versões dubladas
            if (alt.includes('(Dublado)')) {
                return true;
            }
                
            if (src && (src.includes('.webp') || src.includes('.jpg') || src.includes('.png'))) {
                imageUrl = src;
                return false; // break the each loop
            }
        });
        
        // 2. Imagens na pasta específica de animes
        if (!imageUrl) {
            $('img[src*="/img/animes/"], img[data-src*="/img/animes/"]').each((index, element) => {
                const src = $(element).attr('src') || $(element).attr('data-src');
                if (src) {
                    imageUrl = src;
                    return false;
                }
            });
        }
        
        // 3. Imagens com atributos específicos de capas de animes
        if (!imageUrl) {
            $('img[ondragstart][oncontextmenu], img[alt*="Episódios"], img[alt*="episódios"]').each((index, element) => {
                const src = $(element).attr('src') || $(element).attr('data-src');
                if (src) {
                    imageUrl = src;
                    return false;
                }
            });
        }
        
        // 4. Qualquer imagem grande que pareça ser capa
        if (!imageUrl) {
            $('img[src*="large"], img[src*="cover"], img[data-src*="large"], img[data-src*="cover"]').each((index, element) => {
                const src = $(element).attr('src') || $(element).attr('data-src');
                if (src) {
                    imageUrl = src;
                    return false;
                }
            });
        }
        
        console.log(imageUrl ? `Imagem encontrada na URL direta: ${imageUrl}` : 'Nenhuma imagem encontrada na URL direta');
        return imageUrl;
    } catch (error) {
        console.error(`Erro ao processar URL direta: ${error.message}`);
        return '';
    }
}

// Helper function to search for anime image
async function searchAnimeImage(animeTitle) {
    try {
        // Check cache first
        if (animeImagesCache[animeTitle]) {
            return animeImagesCache[animeTitle];
        }
        
        // Formatar o nome para URL
        const searchTerm = animeTitle.trim()
                            .toLowerCase()
                            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                            .replace(/[^\w\s-]/g, '')
                            .replace(/\s+/g, '-');
        
        // Primeiro método: tentar acessar diretamente a página do anime
        const directUrl = `https://animefire.plus/animes/${searchTerm}-todos-os-episodios`;
        
        try {
            console.log(`Buscando imagem na página direta: ${directUrl}`);
            const response = await axios.get(directUrl, {
                headers: { 'User-Agent': USER_AGENT }
            });
            
            const $ = cheerio.load(response.data);
            
            // Check if this is a dubbed anime page - if so, skip it
            const pageTitle = $('h1.anime-title, h2.anime-title, .anime-title').text().trim();
            if (pageTitle.includes('(Dublado)')) {
                console.log(`Skipping dubbed anime page for "${animeTitle}"`);
                return '';
            }
            
            // Buscar imagem na página do anime - usando o seletor específico como no exemplo fornecido
            let imageUrl = '';
            
            // Procurar por imagem com classe transitioning_src como no exemplo
            $('img.transitioning_src').each((index, element) => {
                const src = $(element).attr('src') || $(element).attr('data-src');
                const alt = $(element).attr('alt') || '';
                
                // Skip if alt text contains "Dublado"
                if (alt.includes('(Dublado)')) {
                    return true; // continue to next item
                }
                
                if (src && (src.includes('.webp') || src.includes('.jpg') || src.includes('.png'))) {
                    imageUrl = src;
                    return false; // break the each loop
                }
            });
            
            // Se não encontrou com o seletor específico, busca imagens gerais
            if (!imageUrl) {
                // Procurar imagens grandes que pareçam ser capas
                $('img[alt*="' + animeTitle + '"], img[alt*="Todos os Episódios"]').each((index, element) => {
                    const src = $(element).attr('src') || $(element).attr('data-src');
                    if (src && (src.includes('.webp') || src.includes('.jpg') || src.includes('.png'))) {
                        imageUrl = src;
                        return false;
                    }
                });
            }
            
            // Se ainda não encontrou, procurar qualquer imagem grande
            if (!imageUrl) {
                $('img[src*="large"], img[src*="cover"], img[data-src*="large"], img[data-src*="cover"]').each((index, element) => {
                    const src = $(element).attr('src') || $(element).attr('data-src');
                    if (src) {
                        imageUrl = src;
                        return false;
                    }
                });
            }
            
            if (imageUrl) {
                console.log(`Imagem encontrada: ${imageUrl}`);
                return imageUrl;
            }
        } catch (error) {
            console.log(`Erro ao acessar página direta: ${error.message}`);
        }
        
        // Segundo método: tentar buscar via pesquisa
        const searchUrl = `https://animefire.plus/pesquisar/${encodeURIComponent(searchTerm)}`;
        
        console.log(`Buscando imagem via pesquisa: ${searchUrl}`);
        const response = await axios.get(searchUrl, {
            headers: { 'User-Agent': USER_AGENT }
        });
        
        const $ = cheerio.load(response.data);
        
        // Try to find image in search results
        let imageUrl = '';
        
        // Procurar na estrutura de cards, mas pular os que têm "Dublado" no título ou no alt da imagem
        $('.minWDanime').each((index, element) => {
            const title = $(element).find('.text-block h3.animeTitle').text().trim();
            const img = $(element).find('img');
            const imgSrc = img.attr('src') || img.attr('data-src');
            const imgAlt = img.attr('alt') || '';
            
            // Skip if it's a dubbed anime (check both title and alt text)
            if (title.includes('(Dublado)') || imgAlt.includes('(Dublado)')) {
                return true; // continue to next item
            }
            
            if (title && imgSrc && title.toLowerCase().includes(animeTitle.toLowerCase())) {
                imageUrl = imgSrc;
                return false; // break the each loop
            }
        });
        
        // Try alternative selectors if not found
        if (!imageUrl) {
            $('.card, .card-anime').each((index, element) => {
                const title = $(element).find('h3, .animeTitle, .title').text().trim();
                const img = $(element).find('img');
                const imgSrc = img.attr('src') || $(element).attr('data-src');
                const imgAlt = img.attr('alt') || '';
                
                // Skip if it's a dubbed anime (check both title and alt)
                if (title.includes('(Dublado)') || imgAlt.includes('(Dublado)')) {
                    return true; // continue to next item
                }
                
                if (title && imgSrc && title.toLowerCase().includes(animeTitle.toLowerCase())) {
                    imageUrl = imgSrc;
                    return false;
                }
            });
        }
        
        console.log(imageUrl ? `Imagem encontrada: ${imageUrl}` : 'Nenhuma imagem encontrada');
        
        return imageUrl || '';
    } catch (error) {
        console.error(`Error finding image for ${animeTitle}:`, error.message);
        return '';
    }
}

// Function to save image cache
function saveImageCache() {
    try {
        fs.writeFileSync(IMAGES_CACHE_FILE, JSON.stringify(animeImagesCache, null, 2));
    } catch (error) {
        console.error('Error saving image cache:', error);
    }
}

// Endpoint para obter status dos downloads
app.get('/api/download-status', (req, res) => {
    try {
        if (fs.existsSync(STATUS_FILE)) {
            const status = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
            res.json(status);
        } else {
            res.json({
                current: null,
                queue: [],
                completed: [],
                lastUpdate: new Date().toISOString()
            });
        }
    } catch (error) {
        console.error('Error reading download status:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para obter a pasta de download
app.get('/api/download-folder', (req, res) => {
    try {
        res.json({ folder: config.downloadFolder || DOWNLOAD_FOLDER });
    } catch (error) {
        console.error('Error getting download folder:', error);
        res.status(500).json({ error: error.message });
    }
});

// Set download folder - standardize on POST method
app.post('/api/download-folder', (req, res) => {
    try {
        const { folder } = req.body;
        
        if (!folder) {
            return res.status(400).json({ error: 'No folder path provided' });
        }
        
        console.log(`Setting download folder to: ${folder}`);
        
        // Validate the path
        try {
            // Create folder if it doesn't exist
            if (!fs.existsSync(folder)) {
                fs.mkdirSync(folder, { recursive: true });
                console.log(`Created folder: ${folder}`);
            }
            
            // Update the global variable - now possible because we changed it to 'let'
            DOWNLOAD_FOLDER = folder;
            
            // Update config object
            config.downloadFolder = folder;
            
            // Save to config file
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
            console.log(`Config saved with download folder: ${folder}`);
            
            res.json({ success: true, folder });
        } catch (error) {
            console.error('Error setting download folder:', error);
            res.status(500).json({ error: error.message });
        }
    } catch (error) {
        console.error('Error processing download folder request:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para listar diretórios disponíveis
app.get('/api/directories', (req, res) => {
    try {
        // Se o usuário fornecer um caminho base, usamos ele. Senão, listamos drives (Windows) ou diretórios raiz (Linux/Mac)
        const { basePath } = req.query;
        
        // Se estamos no Windows (process.platform === 'win32')
        if (!basePath && process.platform === 'win32') {
            // No Windows, vamos listar os drives disponíveis
            const { execSync } = require('child_process');
            const drivesOutput = execSync('wmic logicaldisk get caption').toString();
            const drives = drivesOutput
                .split('\r\r\n')
                .filter(line => /^[A-Z]:/.test(line.trim()))
                .map(drive => ({ 
                    name: drive.trim(), 
                    path: drive.trim() + '\\',
                    isDirectory: true
                }));
                
            return res.json(drives);
        }
        
        // Para qualquer outro caso, listamos os diretórios do caminho fornecido
        const directoryPath = basePath || '/';
        const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
        
        const directories = entries
            .filter(entry => entry.isDirectory())
            .map(dir => ({
                name: dir.name,
                path: path.join(directoryPath, dir.name),
                isDirectory: true
            }));
            
        res.json(directories);
    } catch (error) {
        console.error('Error listing directories:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para obter drives (Windows específico)
app.get('/api/directories/drives', (req, res) => {
    try {
        const { execSync } = require('child_process');
        
        // Comando para listar drives no Windows usando wmic
        const stdout = execSync('wmic logicaldisk get caption, volumename', { encoding: 'utf-8' });
        
        // Processar a saída
        const drives = [];
        const lines = stdout.trim().split('\n').slice(1); // Pular a primeira linha (cabeçalho)
        
        lines.forEach(line => {
            if (line.trim()) {
                const parts = line.trim().split(/\s{2,}/);
                const drive = parts[0];
                const label = parts.length > 1 ? parts[1] : '';
                
                drives.push({
                    name: `${drive} ${label ? '(' + label + ')' : ''}`,
                    path: drive + '/'
                });
            }
        });
        
        res.json(drives);
    } catch (error) {
        console.error('Error getting drives:', error);
        res.status(500).json({ message: 'Error retrieving drives', error: error.message });
    }
});

// Endpoint para validar se um caminho existe e é acessível
app.post('/api/directories/validate', (req, res) => {
    try {
        const { path } = req.body;
        const { createIfNotExists } = req.body;
        
        if (!path) {
            return res.json({ valid: false, error: 'Caminho não fornecido' });
        }
        
        const fs = require('fs');
        const { dirname } = require('path');
        
        // Verificar se o caminho existe
        if (!fs.existsSync(path)) {
            // Se a opção createIfNotExists for true, tentamos criar o diretório
            if (createIfNotExists) {
                try {
                    // Verificar se o diretório pai existe
                    const parentDir = dirname(path);
                    if (!fs.existsSync(parentDir)) {
                        return res.json({ 
                            valid: false, 
                            error: 'O diretório pai não existe. Não é possível criar a pasta.' 
                        });
                    }
                    
                    // Criar o diretório
                    fs.mkdirSync(path, { recursive: true });
                    console.log(`Diretório criado: ${path}`);
                } catch (createError) {
                    return res.json({ 
                        valid: false, 
                        error: `Falha ao criar o diretório: ${createError.message}` 
                    });
                }
            } else {
                return res.json({ 
                    valid: false, 
                    error: 'Caminho não existe', 
                    canCreate: true 
                });
            }
        }
        
        // Verificar se é um diretório
        const stats = fs.statSync(path);
        if (!stats.isDirectory()) {
            return res.json({ valid: false, error: 'O caminho não é um diretório' });
        }
        
        // Verificar permissão de escrita testando a criação de um arquivo temporário
        try {
            const testFile = `${path}/.write_test_${Date.now()}`;
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
        } catch (error) {
            return res.json({ valid: false, error: 'Sem permissão de escrita neste diretório' });
        }
        
        // Tudo ok
        res.json({ valid: true });
    } catch (error) {
        console.error('Error validating directory:', error);
        res.json({ valid: false, error: error.message });
    }
});

// Função auxiliar para sanitizar nomes de arquivo de maneira consistente
function sanitizeFilename(filename) {
    // Use a mesma lógica do anime-downloader.js para sanitizar nomes
    const sanitize = require('sanitize-filename');
    return sanitize(filename);
}

// Função para sanitizar nomes de anime para o sistema de arquivos
function sanitizeAnimeNameForFileSystem(name) {
    if (!name) return '';
    
    // Remover caracteres problemáticos antes de usar sanitize
    // Especialmente remover o "?" no final, como mencionado
    let cleanedName = name
        .replace(/\?+$/g, '')      // Remove ? no final do nome
        .replace(/[?]/g, '')       // Remove todos os pontos de interrogação
        .replace(/:/g, '')         // Remove dois pontos
        .replace(/\./g, '')        // Remove pontos
        .replace(/[\\\/]/g, '-');  // Substitui barras por hifens
        
    return sanitize(cleanedName);
}

// Função para sanitizar nomes de anime para o sistema de arquivos
function createSafeFolderName(name) {
    // Substituir hifens por espaços
    let safeName = name.replace(/-/g, ' ');
    
    // Remove invalid characters for Windows folders
    safeName = safeName.replace(/[<>:"/\\|?*]/g, '');
    
    // Limit length to avoid path length issues
    if (safeName.length > 50) {
        safeName = safeName.substring(0, 47) + '...';
    }
    
    return safeName;
}

// Add this utility function to safely open folders (keep this)
function safeOpenFolder(folderPath, res) {
    // Verificar se a pasta existe, mas não criar se não existir
    if (!fs.existsSync(folderPath)) {
        console.log(`A pasta não existe: ${folderPath}`);
        return res.status(404).json({ 
            success: false,
            message: `A pasta do anime não existe. Realize o download antes de tentar abrir a pasta.`
        });
    }
    
    // Try to open the folder
    exec(`explorer "${folderPath}"`, () => {
        return res.status(200).json({ 
            success: true,
            message: `Pasta aberta com sucesso.`
        });
    });
}

// Update your endpoint that handles opening folders (keep this)
// Replace the existing endpoint with this implementation
app.post('/api/animes/:id/open-folder', (req, res) => {
    try {
        const animeId = req.params.id;
        const { title, originalTitle, safeFolderName } = req.body;
        
        if (!title) {
            return res.status(400).json({ message: 'Anime title is required' });
        }
        
        // Use the safe folder name if provided, otherwise create one
        const folderName = safeFolderName || createSafeFolderName(originalTitle || title.replace(/-/g, ' '));
        const folderPath = path.join(__dirname, 'downloads', folderName);
        
        // Use the safe function to handle folder opening
        safeOpenFolder(folderPath, res);
        
    } catch (error) {
        console.error('Error in open-folder endpoint:', error);
        res.status(500).json({ message: error.message });
    }
});

// Endpoint para cancelar download atual
app.post('/api/cancel-download', (req, res) => {
    try {
        console.log('Canceling current download process...');
        
        // Create a cancellation signal file that anime-downloader.js can check
        const cancelSignalFile = path.join(__dirname, 'cancel-download.signal');
        fs.writeFileSync(cancelSignalFile, new Date().toISOString());
        
        // Force kill all active download processes
        let killedProcesses = 0;
        
        activeDownloadProcesses.forEach(process => {
            try {
                // First try graceful termination
                if (process.process && !process.process.killed) {
                    process.process.kill();
                    killedProcesses++;
                    console.log(`Terminated process PID ${process.pid}`);
                }
                
                // Remove temp files
                if (process.tempFile && fs.existsSync(process.tempFile)) {
                    fs.unlinkSync(process.tempFile);
                    console.log(`Removed temp file: ${process.tempFile}`);
                }
            } catch (e) {
                console.error(`Error killing process ${process.pid}:`, e);
            }
        });
        
        // Use more aggressive killing as a backup strategy
        // This executes platform-specific forceful termination
        try {
            const { exec } = require('child_process');
            
            if (process.platform === 'win32') {
                exec('taskkill /F /IM node.exe /FI "WINDOWTITLE eq *anime-downloader*"', (err) => {
                    if (err) console.log('No additional processes found to terminate');
                });
            } else {
                exec('pkill -9 -f "node anime-downloader.js"', (err) => {
                    if (err) console.log('No additional processes found to terminate');
                });
            }
        } catch (e) {
            console.error('Error in forceful termination:', e);
        }
        
        // Reset active processes list
        activeDownloadProcesses = [];
        
        // Recursively find and delete all temp files
        const files = fs.readdirSync(__dirname);
        files.forEach(file => {
            if (file.startsWith('temp-') && file.endsWith('.txt')) {
                try {
                    fs.unlinkSync(path.join(__dirname, file));
                    console.log(`Removed temporary file: ${file}`);
                } catch (e) {
                    console.error(`Error deleting temp file ${file}:`, e);
                }
            }
        });
        
        // Update download status file
        if (fs.existsSync(STATUS_FILE)) {
            const status = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
            
            if (status.current) {
                // Mark current download as cancelled
                status.current.status = 'cancelled';
                status.current.endTime = new Date().toISOString();
                status.current.errorMessage = 'Download was cancelled by user';
                
                // Move to completed with cancelled status
                status.completed.unshift({
                    ...status.current
                });
                
                status.current = null;
                
                // Save updated status
                fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
            }
        }
        
        res.json({ 
            success: true, 
            message: `Download cancelled successfully. Terminated ${killedProcesses} processes.` 
        });
    } catch (error) {
        console.error('Error cancelling download:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create a force-kill endpoint that will restart the server
app.post('/api/cancel-download/force', (req, res) => {
    try {
        console.log('FORCE CANCELING all downloads by restarting server...');
        
        // First, try to clean up temp files before restarting
        const tempFiles = fs.readdirSync(__dirname)
            .filter(file => file.startsWith('temp-') && file.endsWith('.txt'));
            
        tempFiles.forEach(file => {
            try {
                fs.unlinkSync(path.join(__dirname, file));
                console.log(`Removed temporary file: ${file}`);
            } catch (e) {
                // Ignore errors
            }
        });
        
        // Update status file to mark all downloads as canceled
        if (fs.existsSync(STATUS_FILE)) {
            try {
                const status = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
                
                if (status.current) {
                    status.current.status = 'cancelled';
                    status.current.endTime = new Date().toISOString();
                    status.current.errorMessage = 'Download was force cancelled by user';
                    
                    // Move to completed with cancelled status
                    status.completed.unshift({...status.current});
                    status.current = null;
                }
                
                fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
            } catch (e) {
                // Ignore errors
            }
        }
        
        // Send response before shutdown
        res.json({ success: true, message: 'Forcing server restart to cancel downloads...' });
        
        // Use setTimeout to allow the response to be sent before killing
        setTimeout(() => {
            console.log('Terminating server to force cancel downloads');
            // This will terminate the server process, cutting all connections
            process.exit(0); // The process monitor/service should restart the server
        }, 100);
        
    } catch (error) {
        console.error('Error in force cancel:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para verificar duplicatas de animes
app.post('/api/check-anime-duplicate', (req, res) => {
    try {
        const { title, url } = req.body;
        
        if (!title && !url) {
            return res.status(400).json({ message: 'Título ou URL são necessários para verificação' });
        }
        
        // Ler o arquivo anime-list.txt
        const filePath = path.join(__dirname, 'anime-list.txt');
        
        if (!fs.existsSync(filePath)) {
            return res.json({ duplicate: false });
        }
        
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        
        // Analisar cada linha para verificar duplicatas
        for (const line of lines) {
            // Ignorar comentários e linhas vazias
            if (line.trim().startsWith('#') || !line.trim()) {
                continue;
            }
            
            const parts = line.split('|').map(part => part.trim());
            
            if (parts.length < 4) {
                continue;
            }
            
            const existingTitle = parts[0].trim();
            let existingUrl = parts[3].trim();
            
            // Remover aspas da URL, se houver
            if (existingUrl.startsWith('"') && existingUrl.endsWith('"')) {
                existingUrl = existingUrl.substring(1, existingUrl.length - 1);
            }
            
            // Verificar duplicata de título
            if (title && existingTitle.toLowerCase() === title.toLowerCase()) {
                return res.json({ 
                    duplicate: true, 
                    duplicateType: 'title', 
                    existingTitle: existingTitle
                });
            }
            
            // Verificar duplicata de URL
            if (url && existingUrl.toLowerCase() === url.toLowerCase()) {
                return res.json({ 
                    duplicate: true, 
                    duplicateType: 'url', 
                    existingTitle: existingTitle
                });
            }
        }
        
        // Nenhuma duplicata encontrada
        return res.json({ duplicate: false });
        
    } catch (error) {
        console.error('Error checking for duplicate anime:', error);
        res.status(500).json({ message: 'Erro ao verificar duplicatas', error: error.message });
    }
});

// Endpoint para resetar status de download
app.post('/api/download-status/reset', (req, res) => {
    try {
        const resetStatus = req.body;
        
        // Garantir que o status foi fornecido
        if (!resetStatus) {
            return res.status(400).json({ error: 'Reset status data is required' });
        }
        
        // Salvar no arquivo de status
        fs.writeFileSync(STATUS_FILE, JSON.stringify(resetStatus, null, 2));
        
        // Responder com sucesso
        res.json({ message: 'Download status reset successfully' });
    } catch (error) {
        console.error('Error resetting download status:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get watched episodes
app.get('/api/watched-episodes', (req, res) => {
    res.json(watchedEpisodes);
});

// Mark episode as watched
app.post('/api/anime/:animeId/episode/:episodeNumber/watch', (req, res) => {
    const { animeId, episodeNumber } = req.params;
    
    if (!watchedEpisodes[animeId]) {
        watchedEpisodes[animeId] = [];
    }
    
    if (!watchedEpisodes[animeId].includes(episodeNumber)) {
        watchedEpisodes[animeId].push(episodeNumber);
        saveWatchedEpisodes();
    }
    
    res.json({ success: true });
});

// Mark episode as unwatched
app.delete('/api/anime/:animeId/episode/:episodeNumber/watch', (req, res) => {
    const { animeId, episodeNumber } = req.params;
    
    if (watchedEpisodes[animeId]) {
        watchedEpisodes[animeId] = watchedEpisodes[animeId].filter(ep => ep !== episodeNumber);
        saveWatchedEpisodes();
    }
    
    res.json({ success: true });
});

// Simple status endpoint to check if server is running
app.get('/api/status', (req, res) => {
    res.json({ status: 'running', timestamp: new Date().toISOString() });
});

// Add this endpoint to your Express server
app.get('/api/featured-animes', async (req, res) => {
    try {
        console.log('Fetching featured animes from AnimeFirePlus...');
        const response = await axios.get('https://animefire.plus', {
            headers: { 'User-Agent': USER_AGENT }
        });
        const html = response.data;
        
        // Parse the HTML using cheerio
        const $ = cheerio.load(html);
        const animes = [];
        
        console.log('Parsing featured animes from owl carousel...');
        
        // Target specifically the owl carousel divArticleLancamentos items
        $('.owl-carousel .divArticleLancamentos').each((index, element) => {
            const $element = $(element);
            
            // Get title from the title attribute (exactly as shown in your example)
            const fullTitle = $element.attr('title') || '';
            const title = fullTitle.replace(' - Todos os Episódios', '');
            
            // Skip dubbed anime (containing "Dublado" in title)
            if (fullTitle.includes('(Dublado)') || title.includes('(Dublado)')) {
                console.log(`Skipping dubbed anime: ${title}`);
                return;
            }
            
            // Get link from the anchor tag
            const link = $element.find('a').attr('href') || '';
            
            // Get image from src or data-src (prioritize data-src as it's used for lazy loading)
            const imageUrl = $element.find('img').attr('data-src') || $element.find('img').attr('src') || '';
            
            // Get rating from horaUltimosEps span
            const rating = $element.find('.horaUltimosEps').text().trim();
            
            // Get age rating from the background color
            let ageRating = '';
            const ageElement = $element.find('.text-blockCapaAnimeTags');
            if (ageElement.length) {
                const bgColor = ageElement.attr('style') || '';
                
                if (bgColor.includes('#e36722')) {
                    ageRating = 'A14';
                } else if (bgColor.includes('#000')) {
                    ageRating = 'A18';
                } else if (bgColor.includes('#159415')) {
                    ageRating = 'L';
                }
            }
            
            // Skip items without essential data
            if (!title || !imageUrl) return;
            
            // Skip duplicates (if an anime with the same title already exists)
            const isDuplicate = animes.some(anime => anime.title === title);
            if (isDuplicate) return;
            
            animes.push({
                title,
                link,
                imageUrl,
                rating,
                ageRating
            });
        });
        
        console.log(`Found ${animes.length} unique subbed featured animes`);
        
        res.json(animes);
    } catch (error) {
        console.error('Error fetching featured animes:', error);
        res.status(500).json({ error: 'Failed to fetch featured animes' });
    }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Open your browser at http://localhost:${PORT}`);
});
