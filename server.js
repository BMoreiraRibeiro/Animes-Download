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

// Constants
const ANIME_LIST_FILE = path.join(__dirname, 'anime-list.txt');
const CONFIG_FILE = path.join(__dirname, 'config.json');
const STATUS_FILE = path.join(__dirname, 'download-status.json');
const QUEUE_FILE = path.join(__dirname, 'download-queue.json');
const IMAGES_CACHE_FILE = path.join(__dirname, 'anime-images-cache.json');
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

// Adicione esta constante no início do arquivo com outros mapeamentos de constantes
const ANIME_ALIASES = {
    // Mapeia nomes alternativos para o mesmo anime
    "Re:Zero kara Hajimeru Isekai Seikatsu 3rd Season": "re-zero-kara-hajimeru-isekai-seikatsu-3rd-season",
    "re-zero-kara-hajimeru-isekai-seikatsu-3rd-season": "Re:Zero kara Hajimeru Isekai Seikatsu 3rd Season",
    // Adicionar caso especial para anime com ponto de interrogação
    "Saikyou no Ousama, Nidome no Jinsei wa Nani wo Suru?": "Saikyou no Ousama, Nidome no Jinsei wa Nani wo Suru",
    "Saikyou no Ousama, Nidome no Jinsei wa Nani wo Suru": "Saikyou no Ousama, Nidome no Jinsei wa Nani wo Suru?"
};

// Rastrear processos de download ativos
const activeDownloadProcesses = new Map(); // Map<animeTitle, childProcess>

// Função para limpar ficheiros temporários antigos
function cleanupTempFiles() {
    try {
        const files = fs.readdirSync(__dirname);
        const tempFiles = files.filter(f => f.startsWith('temp-') && f.endsWith('.txt'));
        
        tempFiles.forEach(file => {
            const filePath = path.join(__dirname, file);
            try {
                fs.unlinkSync(filePath);
                console.log(`Ficheiro temporário removido: ${file}`);
            } catch (err) {
                console.error(`Erro ao remover ${file}:`, err.message);
            }
        });
        
        if (tempFiles.length > 0) {
            console.log(`Limpeza concluída: ${tempFiles.length} ficheiro(s) temporário(s) removido(s)`);
        }
    } catch (err) {
        console.error('Erro durante limpeza de ficheiros temporários:', err.message);
    }
}

// Limpar ficheiros temporários ao iniciar
cleanupTempFiles();

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
const DOWNLOAD_FOLDER = config.downloadFolder || path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOAD_FOLDER)) {
    fs.mkdirSync(DOWNLOAD_FOLDER, { recursive: true });
}

// Folder to hold archived anime folders
const ARCHIVE_FOLDER = path.join(DOWNLOAD_FOLDER, 'Arquivados');
if (!fs.existsSync(ARCHIVE_FOLDER)) {
    fs.mkdirSync(ARCHIVE_FOLDER, { recursive: true });
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

// Helper: read anime list into objects, assign persistent numeric ids when missing
function readAnimeList() {
    const content = fs.existsSync(ANIME_LIST_FILE) ? fs.readFileSync(ANIME_LIST_FILE, 'utf8') : '';
    const lines = content.split('\n');
    const entries = [];
    const usedIds = new Set();
    const rawLines = [];

    for (const line of lines) {
        rawLines.push(line);
        if (!line.trim() || line.trim().startsWith('#')) continue;
        const parts = line.split('|').map(p => p.trim());
        let id = null;
        let title = '';
        let quality = 'HD';
        let startEpisode = 1;
        let animeUrl = '';
        let imageUrl = '';

        if (parts.length > 0 && /^\d+$/.test(parts[0])) {
            // new format: id | title | quality | startEpisode | "animeUrl" | "imageUrl"
            id = parseInt(parts[0], 10);
            title = parts[1] || '';
            quality = parts[2] || 'HD';
            startEpisode = parseInt(parts[3] || '1', 10);
            if (parts[4]) animeUrl = parts[4].replace(/^"|"$/g, '');
            if (parts[5]) imageUrl = parts[5].replace(/^"|"$/g, '');
        } else {
            // old format: title | quality | startEpisode | "animeUrl"
            title = parts[0] || '';
            quality = parts[1] || 'HD';
            startEpisode = parseInt(parts[2] || '1', 10);
            if (parts[3]) animeUrl = parts[3].replace(/^"|"$/g, '');
            // imageUrl not present in old format
        }

        entries.push({ id, title, quality, startEpisode, animeUrl, imageUrl });
        if (id !== null) usedIds.add(id);
    }

    // Assign ids for entries missing them
    let changed = false;
    function nextAvailableId() {
        for (let i = 0; i <= 9999; i++) {
            if (!usedIds.has(i)) return i;
        }
        return null;
    }

    for (const entry of entries) {
        if (entry.id === null || entry.id === undefined) {
            const nid = nextAvailableId();
            if (nid === null) throw new Error('No available IDs left');
            entry.id = nid;
            usedIds.add(nid);
            changed = true;
        }
    }

    // If we assigned new ids, persist the file in new format
    if (changed) {
        writeAnimeList(entries);
    }

    return entries;
}

// Normalize an anime link to the series "-todos-os-episodios" page
function normalizeToSeriesUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
        let u = String(rawUrl).trim();
        if (!u) return '';
        // remove query and fragment
        u = u.split('#')[0].split('?')[0];
        // remove trailing slashes
        u = u.replace(/\/+$/, '');

        // Try to capture the base up to the slug after /animes/
        const m = u.match(/(https?:\/\/[^\/]+\/animes\/)([^\/\?#]+)/i);
        if (m) {
            const base = m[1];
            let slug = m[2];
            
            // Se já tem "-todos-os-episodios", retorna apenas limpando duplicações
            if (slug.includes('-todos-os-episodios')) {
                // Remove duplicações como "-todos-os-todos-os-episodios"
                slug = slug.replace(/(-todos-os-episodios)+/g, '-todos-os-episodios');
                // Limpa hífens duplicados
                slug = slug.replace(/--+/g, '-');
                return `${base}${slug}`;
            }
            
            // Remove episode markers like '-episodio', '-episodios' and anything after
            slug = slug.split(/-?episod/i)[0];
            // Trim trailing hyphens
            slug = slug.replace(/-+$/, '');
            if (!slug) return `${base}todos-os-episodios`;
            let series = `${base}${slug}-todos-os-episodios`;
            // Avoid duplicated hyphens
            series = series.replace(/--+/g, '-');
            return series;
        }

        // Fallback: if URL contains '/episodio' take part before it and append
        const idx = u.toLowerCase().indexOf('/episodio');
        if (idx !== -1) {
            const prefix = u.substring(0, idx);
            let series = `${prefix}-todos-os-episodios`;
            series = series.replace(/--+/g, '-');
            return series;
        }

        // If none of the patterns match, return original cleaned URL
        return u;
    } catch (err) {
        console.error('Error normalizing URL:', err);
        return rawUrl;
    }
}

function writeAnimeList(entries) {
    // Header
    const header = '# Add your anime list here\n# Format: id | Title | Quality | Starting Episode | "animeUrl" | "imageUrl"\n';
    const lines = [header.trim()];
    for (const e of entries) {
        const animeUrl = e.animeUrl ? ` | "${e.animeUrl.replace(/"/g, '')}"` : ' | ""';
        const imageUrl = e.imageUrl ? ` | "${e.imageUrl.replace(/"/g, '')}"` : ' | ""';
        lines.push(`${e.id} | ${e.title} | ${e.quality || 'HD'} | ${e.startEpisode || 1}${animeUrl}${imageUrl}`);
    }
    fs.writeFileSync(ANIME_LIST_FILE, lines.join('\n'));
}

// On startup, normalize any existing animeUrl entries in anime-list.txt
try {
    const existing = readAnimeList();
    let migrated = false;
    for (const e of existing) {
        const orig = e.animeUrl || '';
        const norm = normalizeToSeriesUrl(orig);
        if ((orig || '') !== (norm || '')) {
            e.animeUrl = norm;
            migrated = true;
        }
    }
    if (migrated) {
        console.log('Normalizing stored anime URLs to series pages...');
        writeAnimeList(existing);
    }
} catch (err) {
    console.error('Error normalizing stored anime URLs on startup:', err);
}

// API Routes
// Get anime list (excluindo arquivados)
app.get('/api/animes', (req, res) => {
    try {
        // Use readAnimeList to get entries with persistent ids
        const list = readAnimeList();

        const animes = list.map(entry => {
            const title = entry.title;
            const displayTitle = title.replace(/-/g, ' ');
            return {
                id: `anime-${entry.id}`,
                title: title,
                displayTitle: displayTitle,
                quality: entry.quality || 'HD',
                startEpisode: parseInt(entry.startEpisode || '1', 10),
                animeUrl: entry.animeUrl || '',
                imageUrl: entry.imageUrl || animeImagesCache[title] || '',
                _internalId: entry.id
            };
        });

        // Check for downloaded episodes and filter out archived animes
        const nonArchivedAnimes = [];
        
        animes.forEach(anime => {
            anime.episodes = [];
            anime.isArchived = false;
            
            // Lista de possíveis nomes de pasta para este anime
            const folderNames = [anime.title]; // Nome original (armazenado)

            // Adicionar variações comuns para corresponder às pastas no sistema de arquivos
            try {
                // versão com espaços
                const withSpaces = anime.title.replace(/-/g, ' ').trim();
                if (withSpaces && !folderNames.includes(withSpaces)) folderNames.push(withSpaces);

                // versões sanitizadas (removendo caracteres inválidos e trimming)
                const sanitized1 = sanitize(anime.title);
                if (sanitized1 && !folderNames.includes(sanitized1)) folderNames.push(sanitized1);

                const sanitized2 = sanitize(withSpaces);
                if (sanitized2 && !folderNames.includes(sanitized2)) folderNames.push(sanitized2);
            } catch (err) {
                // ignore sanitization errors
            }
            
            // Adicionar aliases se existirem
            if (ANIME_ALIASES[anime.title]) {
                folderNames.push(ANIME_ALIASES[anime.title]);
            }
            
            // Se o título contém Re:Zero, adicione variações específicas
            if (anime.title.toLowerCase().includes('re:zero') ||
                anime.title.toLowerCase().includes('re-zero')) {
                folderNames.push('Re:Zero kara Hajimeru Isekai Seikatsu 3rd Season');
                folderNames.push('re-zero-kara-hajimeru-isekai-seikatsu-3rd-season');
                folderNames.push(sanitize('Re:Zero kara Hajimeru Isekai Seikatsu 3rd Season'));
            }
            
            // Primeiro verificar se está arquivado
            for (const folderName of folderNames) {
                const archivedFolder = path.join(ARCHIVE_FOLDER, folderName);
                if (fs.existsSync(archivedFolder)) {
                    anime.isArchived = true;
                    console.log(`[API /animes] Anime arquivado detectado: ${anime.title} (pasta: ${folderName})`);
                    break;
                }
            }
            
            // Se está arquivado, não adicionar à lista principal
            if (anime.isArchived) {
                return; // Skip this anime
            }
            
            // Verificar cada pasta possível para episódios baixados
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
            
            // Adicionar à lista de não arquivados
            nonArchivedAnimes.push(anime);
        });

        console.log(`[API /animes] Total: ${animes.length}, Arquivados: ${animes.length - nonArchivedAnimes.length}, Retornando: ${nonArchivedAnimes.length}`);
        res.json(nonArchivedAnimes);
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
        const { title, displayTitle, quality = 'HD', startEpisode = 1, animeUrl = '', imageUrl = '' } = req.body;

        if (!title) {
            return res.status(400).json({ error: 'Anime title is required' });
        }

        // Read existing list and assign a new numeric id
        const entries = readAnimeList();
        const used = new Set(entries.map(e => e.id));
        let newId = null;
        for (let i = 0; i <= 9999; i++) {
            if (!used.has(i)) { newId = i; break; }
        }
        if (newId === null) return res.status(500).json({ error: 'No available ID slots' });

        const normalizedUrl = normalizeToSeriesUrl(animeUrl || '');
        const newEntry = {
            id: newId,
            title: title,
            quality: quality,
            startEpisode: startEpisode,
            animeUrl: normalizedUrl || '',
            imageUrl: imageUrl || ''
        };

        entries.push(newEntry);
        writeAnimeList(entries);

        // Update image cache asynchronously
        if (!imageUrl) {
            searchAnimeImage(title).then(found => {
                if (found) {
                    animeImagesCache[title] = found;
                    saveImageCache();
                    // update file entry with imageUrl
                    const updated = readAnimeList();
                    const e = updated.find(x => x.id === newId);
                    if (e) { e.imageUrl = found; writeAnimeList(updated); }
                }
            });
        } else {
            animeImagesCache[title] = imageUrl;
            saveImageCache();
        }

        res.json({
            id: `anime-${newId}`,
            title,
            displayTitle: displayTitle || title.replace(/-/g, ' '),
            quality,
            startEpisode,
            animeUrl: newEntry.animeUrl,
            imageUrl: newEntry.imageUrl,
            episodes: []
        });
    } catch (error) {
        console.error('Error adding anime:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update anime
app.put('/api/animes/:id', (req, res) => {
    try {
        const { title, displayTitle, quality, startEpisode, animeUrl, imageUrl } = req.body;
        const animeIdParam = req.params.id; // expected form: anime-<num>
        const idNum = typeof animeIdParam === 'string' && animeIdParam.startsWith('anime-') ? parseInt(animeIdParam.replace('anime-', ''), 10) : parseInt(animeIdParam, 10);

        const entries = readAnimeList();
        const entry = entries.find(e => e.id === idNum);
        if (!entry) return res.status(404).json({ error: 'Anime not found' });

        // Update allowed fields
        if (title) entry.title = title;
        if (quality) entry.quality = quality;
        if (startEpisode) entry.startEpisode = startEpisode;
    if (animeUrl !== undefined) entry.animeUrl = normalizeToSeriesUrl(animeUrl);
        if (imageUrl !== undefined) entry.imageUrl = imageUrl;

        writeAnimeList(entries);

        // Update image cache
        if (entry.imageUrl) {
            animeImagesCache[entry.title] = entry.imageUrl;
            saveImageCache();
        }

        res.json({
            id: `anime-${entry.id}`,
            title: entry.title,
            displayTitle: displayTitle || entry.title.replace(/-/g, ' '),
            quality: entry.quality,
            startEpisode: entry.startEpisode,
            animeUrl: entry.animeUrl,
            imageUrl: entry.imageUrl || animeImagesCache[entry.title] || ''
        });
    } catch (error) {
        console.error('Error updating anime:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete anime
app.delete('/api/animes/:id', (req, res) => {
    try {
        const { title } = req.query;
        const deleteFiles = req.query.deleteFiles === '1' || req.query.deleteFiles === 'true';
        const animeIdParam = req.params.id; // expected anime-<num>
        const idNum = typeof animeIdParam === 'string' && animeIdParam.startsWith('anime-') ? parseInt(animeIdParam.replace('anime-', ''), 10) : parseInt(animeIdParam, 10);
        
        if (!title) {
            return res.status(400).json({ error: 'Anime title is required' });
        }
        
        // Read entries
        const entries = readAnimeList();
        const idx = entries.findIndex(e => e.id === idNum || (title && e.title === title));
        if (idx === -1) return res.status(404).json({ error: 'Anime not found' });

        const removed = entries.splice(idx, 1)[0];
        writeAnimeList(entries);

        // Remove from image cache (optional)
        if (animeImagesCache[removed.title]) {
            delete animeImagesCache[removed.title];
            saveImageCache();
        }

        // If requested, also delete files/folder from downloads
        if (deleteFiles) {
            try {
                const titleToRemove = removed.title;
                const safeName = sanitize(titleToRemove);
                const candidates = [safeName, titleToRemove, titleToRemove.replace(/-/g, ' ').trim(), sanitize(titleToRemove.replace(/-/g, ' ').trim())].filter(Boolean);
                for (const cand of candidates) {
                    const p = path.join(DOWNLOAD_FOLDER, cand);
                    if (fs.existsSync(p) && fs.lstatSync(p).isDirectory()) {
                        fs.rmSync(p, { recursive: true, force: true });
                        break;
                    }
                }
            } catch (err) {
                console.error('Error deleting files for anime:', err);
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting anime:', error);
        res.status(500).json({ error: error.message });
    }
});

// Archive one or more animes
app.post('/api/animes/archive', (req, res) => {
    try {
        // Accept either titles (backwards compatibility) or ids (preferred)
        let titles = [];
        if (Array.isArray(req.body.ids) && req.body.ids.length > 0) {
            // Map ids (anime-<index>) to titles by reading ANIME_LIST_FILE
            const ids = req.body.ids;
            const content = fs.existsSync(ANIME_LIST_FILE) ? fs.readFileSync(ANIME_LIST_FILE, 'utf8') : '';
            const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
            for (const id of ids) {
                if (typeof id === 'string' && id.startsWith('anime-')) {
                    const idx = parseInt(id.replace('anime-', ''), 10);
                    if (!isNaN(idx) && idx >= 0 && idx < lines.length) {
                        const parts = lines[idx].split('|').map(p => p.trim());
                        // parts[0] is the numeric ID, parts[1] is the actual title
                        const title = parts.length > 1 ? parts[1] : parts[0];
                        titles.push(title);
                        console.log(`Mapping ID "${id}" (index ${idx}) → title "${title}"`);
                    }
                } else if (typeof id === 'string') {
                    // if it's not anime- format, treat as title
                    titles.push(id);
                }
            }
        } else if (Array.isArray(req.body.titles)) {
            titles = req.body.titles;
        } else if (req.body.title) {
            titles = [req.body.title];
        } else {
            return res.status(400).json({ error: 'title(s) or id(s) is required' });
        }

        // Read current list and preserve image URLs for archived animes
        // NOTE: When archiving, we DON'T remove from anime-list.txt
        // Only when permanently deleting we remove from the list
        const content = fs.existsSync(ANIME_LIST_FILE) ? fs.readFileSync(ANIME_LIST_FILE, 'utf8') : '';
        const lines = content.split('\n');
        const imagesToPreserve = {}; // Store image URLs for archived animes

        // Preserve image URLs without removing from list
        for (const line of lines) {
            if (line.trim() && !line.startsWith('#')) {
                const parts = line.split('|').map(p => p.trim());
                // parts[0] is numeric ID, parts[1] is title
                const title = parts.length > 1 ? parts[1] : parts[0];
                if (titles.includes(title)) {
                    // Preserve the image URL (parts[5] in format: id | title | quality | ep | url | imageUrl)
                    const imageUrl = parts.length > 5 ? parts[5].replace(/^"|"$/g, '') : '';
                    if (imageUrl) {
                        imagesToPreserve[title] = imageUrl;
                        console.log(`Preserving image for "${title}": ${imageUrl}`);
                    }
                }
            }
        }

        // Don't modify anime-list.txt when archiving
        // The list stays intact so downloads can continue working

        const results = [];

        for (const title of titles) {
            const safeName = sanitize(title);
            // Build candidate folder names to try to find the real folder on disk
            const candidates = [];
            try {
                candidates.push(safeName);
                const withSpaces = title.replace(/-/g, ' ').trim();
                if (withSpaces && !candidates.includes(withSpaces)) candidates.push(withSpaces);
                const sanitizedSpaces = sanitize(withSpaces);
                if (sanitizedSpaces && !candidates.includes(sanitizedSpaces)) candidates.push(sanitizedSpaces);
                const raw = title;
                if (raw && !candidates.includes(raw)) candidates.push(raw);
            } catch (err) {
                candidates.push(safeName);
            }

            // Determine source folder by checking candidates
            let srcFolder = null;
            let chosenName = null;
            for (const c of candidates) {
                const p = path.join(DOWNLOAD_FOLDER, c);
                if (fs.existsSync(p) && fs.lstatSync(p).isDirectory()) {
                    srcFolder = p;
                    chosenName = c;
                    console.log(`✓ Found folder for "${title}": ${p}`);
                    break;
                }
            }

            // Destination folder name uses the sanitized safeName
            const destFolder = path.join(ARCHIVE_FOLDER, safeName);

            try {
                // If user requested deletion of files during archive, delete instead of moving
                if (req.body.deleteFiles) {
                    if (srcFolder && fs.existsSync(srcFolder)) {
                        fs.rmSync(srcFolder, { recursive: true, force: true });
                        results.push({ title, archived: true, deletedFiles: true, removedFrom: chosenName });
                    } else {
                        console.warn(`⚠ Folder not found for deletion: "${title}" - tried:`, candidates);
                        results.push({ title, archived: false, error: 'Pasta não encontrada', candidates });
                    }
                    continue;
                }

                if (srcFolder && fs.existsSync(srcFolder)) {
                    // Ensure dest parent exists
                    if (!fs.existsSync(ARCHIVE_FOLDER)) {
                        console.log(`Creating archive folder: ${ARCHIVE_FOLDER}`);
                        fs.mkdirSync(ARCHIVE_FOLDER, { recursive: true });
                    }

                    // If destination exists, try to create a unique name
                    let finalDest = destFolder;
                    let counter = 1;
                    while (fs.existsSync(finalDest)) {
                        finalDest = path.join(ARCHIVE_FOLDER, `${safeName}-${counter}`);
                        counter++;
                    }

                    // Perform move
                    console.log(`Moving: ${srcFolder} → ${finalDest}`);
                    fs.renameSync(srcFolder, finalDest);
                    
                    // Preserve image URL in cache with multiple key variations
                    const imageUrl = imagesToPreserve[title] || animeImagesCache[title];
                    if (imageUrl) {
                        // Save with multiple possible folder name variations
                        const finalFolderName = path.basename(finalDest);
                        animeImagesCache[finalFolderName] = imageUrl;
                        animeImagesCache[safeName] = imageUrl;
                        animeImagesCache[title] = imageUrl;
                        // Save the cache to disk
                        fs.writeFileSync(IMAGES_CACHE_FILE, JSON.stringify(animeImagesCache, null, 2));
                        console.log(`✓ Saved image URL for archived anime: ${title}`);
                    }
                    
                    results.push({ title, archived: true, path: finalDest, movedFrom: chosenName });
                } else {
                    // Folder not found - just remove from list without creating empty archive folder
                    console.warn(`⚠ Folder not found for archiving: "${title}" - tried:`, candidates);
                    results.push({ title, archived: false, error: 'Pasta não encontrada no sistema de arquivos', candidates });
                }
            } catch (err) {
                console.error(`Error archiving ${title}:`, err);
                results.push({ title, archived: false, error: err.message });
            }
        }

        res.json({ success: true, results });
    } catch (error) {
        console.error('Error archiving animes:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get archived animes by scanning the archive folder
app.get('/api/animes/archived', (req, res) => {
    try {
        if (!fs.existsSync(ARCHIVE_FOLDER)) return res.json([]);

        const entries = fs.readdirSync(ARCHIVE_FOLDER, { withFileTypes: true });
        const archived = [];

        let index = 0;
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const folderName = entry.name;
                const animeFolder = path.join(ARCHIVE_FOLDER, folderName);
                const files = fs.readdirSync(animeFolder);

                const episodeFiles = files.filter(file => file.endsWith('.mp4') || (file.endsWith('.url') && file.includes('Episódio')));

                const episodes = episodeFiles.map(file => {
                    const match = file.match(/Episódio\s*(\d+)/i);
                    const number = match && match[1] ? parseInt(match[1], 10) : null;
                    return {
                        file,
                        number,
                        isUrl: file.endsWith('.url')
                    };
                });

                // Try to find cached image for this archived folder
                let imageUrl = '';
                try {
                    // Direct key
                    if (animeImagesCache[folderName]) imageUrl = animeImagesCache[folderName];
                    // sanitized key
                    const sanitized = sanitize(folderName);
                    if (!imageUrl && animeImagesCache[sanitized]) imageUrl = animeImagesCache[sanitized];
                    // with spaces
                    const withSpaces = folderName.replace(/-/g, ' ').trim();
                    if (!imageUrl && animeImagesCache[withSpaces]) imageUrl = animeImagesCache[withSpaces];
                    const sanitizedSpaces = sanitize(withSpaces);
                    if (!imageUrl && animeImagesCache[sanitizedSpaces]) imageUrl = animeImagesCache[sanitizedSpaces];
                } catch (err) {
                    // ignore
                }

                // Try to get a better display name by checking variations
                let displayTitle = folderName;
                
                // If folder name doesn't look like a proper title (too short, just numbers, etc.)
                // try to find it in the image cache keys which might have the original title
                if (folderName.length < 3 || /^\d+$/.test(folderName)) {
                    // Search through image cache to find a matching key
                    for (const key in animeImagesCache) {
                        if (animeImagesCache[key] === imageUrl && imageUrl) {
                            // Found a key with the same image URL, likely the original title
                            displayTitle = key;
                            break;
                        }
                    }
                }
                
                archived.push({
                    id: `arch-${index}`,
                    title: folderName,
                    displayTitle: displayTitle.replace(/-/g, ' '),
                    imageUrl: imageUrl || '',
                    episodes: episodes
                });
                
                index++;
            }
        }

        res.json(archived);
    } catch (error) {
        console.error('Error listing archived animes:', error);
        res.status(500).json({ error: error.message });
    }
});

// Permanently delete archived folders (remove from archive)
app.post('/api/animes/archive-delete', (req, res) => {
    try {
        // Accept ids (arch-<index>) or titles for backwards compatibility
        let folderNames = [];
        
        if (Array.isArray(req.body.ids) && req.body.ids.length > 0) {
            // Get list of archived folders to map IDs
            const archivedFolders = [];
            if (fs.existsSync(ARCHIVE_FOLDER)) {
                const entries = fs.readdirSync(ARCHIVE_FOLDER, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory()) {
                        archivedFolders.push(entry.name);
                    }
                }
            }
            
            for (const id of req.body.ids) {
                if (typeof id === 'string' && id.startsWith('arch-')) {
                    // Extract index from arch-<index>
                    const idx = parseInt(id.replace('arch-', ''), 10);
                    if (!isNaN(idx) && idx >= 0 && idx < archivedFolders.length) {
                        folderNames.push(archivedFolders[idx]);
                    }
                } else if (typeof id === 'string') {
                    folderNames.push(id);
                }
            }
        } else if (Array.isArray(req.body.titles)) {
            folderNames = req.body.titles;
        } else if (req.body.title) {
            folderNames = [req.body.title];
        } else {
            return res.status(400).json({ error: 'title(s) or id(s) is required' });
        }

        const results = [];

        for (const folderName of folderNames) {
            const folderPath = path.join(ARCHIVE_FOLDER, folderName);
            try {
                if (fs.existsSync(folderPath) && fs.lstatSync(folderPath).isDirectory()) {
                    fs.rmSync(folderPath, { recursive: true, force: true });
                    
                    // Remove from anime-list.txt when permanently deleting
                    removeFromAnimeList(folderName);
                    
                    results.push({ title: folderName, deleted: true, path: folderPath });
                } else {
                    // Try sanitized version
                    const safeName = sanitize(folderName);
                    const altPath = path.join(ARCHIVE_FOLDER, safeName);
                    if (fs.existsSync(altPath) && fs.lstatSync(altPath).isDirectory()) {
                        fs.rmSync(altPath, { recursive: true, force: true });
                        
                        // Remove from anime-list.txt when permanently deleting
                        removeFromAnimeList(safeName);
                        
                        results.push({ title: folderName, deleted: true, path: altPath });
                    } else {
                        results.push({ title: folderName, deleted: false, error: 'folder not found' });
                    }
                }
            } catch (err) {
                console.error(`Error deleting archived ${folderName}:`, err);
                results.push({ title: folderName, deleted: false, error: err.message });
            }
        }

        res.json({ success: true, results });
    } catch (error) {
        console.error('Error deleting archived folders:', error);
        res.status(500).json({ error: error.message });
    }
});

// Unarchive one or more animes: move folder back to downloads and re-add to anime list
app.post('/api/animes/unarchive', (req, res) => {
    try {
        // Accept archived ids (ids) or titles for backwards compatibility
        let folderNames = [];
        
        if (Array.isArray(req.body.ids) && req.body.ids.length > 0) {
            // Get list of archived folders to map IDs
            const archivedFolders = [];
            if (fs.existsSync(ARCHIVE_FOLDER)) {
                const entries = fs.readdirSync(ARCHIVE_FOLDER, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory()) {
                        archivedFolders.push(entry.name);
                    }
                }
            }
            
            for (const id of req.body.ids) {
                if (typeof id === 'string' && id.startsWith('arch-')) {
                    // Extract index from arch-<index>
                    const idx = parseInt(id.replace('arch-', ''), 10);
                    if (!isNaN(idx) && idx >= 0 && idx < archivedFolders.length) {
                        folderNames.push(archivedFolders[idx]);
                    }
                } else if (typeof id === 'string') {
                    // If provided a raw folder name or title
                    folderNames.push(id);
                }
            }
        } else if (Array.isArray(req.body.titles)) {
            folderNames = req.body.titles;
        } else if (req.body.title) {
            folderNames = [req.body.title];
        } else {
            return res.status(400).json({ error: 'title(s) or id(s) is required' });
        }

        const results = [];

        for (const folderName of folderNames) {
            const safeName = sanitize(folderName);
            const src = path.join(ARCHIVE_FOLDER, folderName);
            
            // Verificar se a pasta existe
            let srcFolder = null;
            if (fs.existsSync(src) && fs.lstatSync(src).isDirectory()) {
                srcFolder = src;
            } else {
                // Try sanitized version
                const altSrc = path.join(ARCHIVE_FOLDER, safeName);
                if (fs.existsSync(altSrc) && fs.lstatSync(altSrc).isDirectory()) {
                    srcFolder = altSrc;
                }
            }

            if (!srcFolder) {
                results.push({ title: folderName, unarchived: false, error: 'source folder not found' });
                continue;
            }

            // Target destination - usar o nome da pasta original
            const destBase = path.join(DOWNLOAD_FOLDER, folderName);
            let finalDest = destBase;
            let counter = 1;
            while (fs.existsSync(finalDest)) {
                finalDest = path.join(DOWNLOAD_FOLDER, `${folderName}-${counter}`);
                counter++;
            }

            try {
                fs.renameSync(srcFolder, finalDest);

                // Re-add to anime-list if not present
                const existingEntries = readAnimeList();
                
                // Usar o nome da pasta (que pode ter espaços) para adicionar à lista
                const titleForList = folderName.replace(/\s+/g, '-');
                
                // Verificar se já existe
                const exists = existingEntries.some(e => e.title === titleForList);
                
                if (!exists) {
                    // Try to retrieve imageUrl from cache
                    let imageUrl = animeImagesCache[folderName] || animeImagesCache[titleForList] || '';
                    
                    // Gerar novo ID
                    const usedIds = new Set(existingEntries.map(e => e.id).filter(id => id !== null));
                    let newId = 0;
                    while (usedIds.has(newId)) newId++;
                    
                    // Adicionar nova entrada
                    existingEntries.push({
                        id: newId,
                        title: titleForList,
                        quality: 'HD',
                        startEpisode: 1,
                        animeUrl: '',
                        imageUrl: imageUrl
                    });
                    
                    writeAnimeList(existingEntries);
                    console.log(`[UNARCHIVE] Re-adicionado à lista: ${titleForList} (ID: ${newId})`);
                }

                results.push({ title: folderName, unarchived: true, path: finalDest });
            } catch (err) {
                console.error(`Error unarchiving ${folderName}:`, err);
                results.push({ title: folderName, unarchived: false, error: err.message });
            }
        }

        res.json({ success: true, results });
    } catch (error) {
        console.error('Error unarchiving animes:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper function to check if an anime is legendado (subtitled)
async function checkAnimeIsLegendado(animeTitle) {
    try {
        // Format the name for URL
        const searchTerm = animeTitle.trim()
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-');
        
    // Direct URL to anime page (remove trailing hyphens to avoid double '--')
    const cleanSearchTerm = searchTerm.replace(/-+$/g, '');
    const animeUrl = `https://animefire.plus/animes/${cleanSearchTerm}-todos-os-episodios`;
        console.log(`Checking audio type for anime: ${animeUrl}`);
        
        // Fetch the anime page
        const response = await axios.get(animeUrl, {
            headers: { 'User-Agent': USER_AGENT }
        });
        
        const $ = cheerio.load(response.data);
        
        // Check if title contains "Dublado" - if so, reject immediately
        const pageTitle = $('h1.anime-title, h2.anime-title, .anime-title').text().trim();
        if (pageTitle.includes('(Dublado)')) {
            console.log(`Rejecting anime "${animeTitle}" - title contains "Dublado" tag`);
            return false;
        }
        
        // Look for the audio info element
        let isLegendado = false;
        $('.animeInfo').each((index, element) => {
            const text = $(element).text().trim();
            if (text.includes('Áudio:') && text.includes('Legendado')) {
                isLegendado = true;
                return false; // break the loop
            }
        });
        
        console.log(`Anime "${animeTitle}" is ${isLegendado ? 'Legendado' : 'NOT Legendado'}`);
        return isLegendado;
    } catch (error) {
        console.error(`Error checking if anime is legendado: ${error.message}`);
        // Default to true in case of error to not block downloads
        return true;
    }
}

// Download a single anime
app.post('/api/animes/:id/download', async (req, res) => {
    try {
        const animeIdParam = req.params.id; // expected form: anime-<num>
        const idNum = typeof animeIdParam === 'string' && animeIdParam.startsWith('anime-') 
            ? parseInt(animeIdParam.replace('anime-', ''), 10) 
            : parseInt(animeIdParam, 10);
        
        // Read anime list by ID
        const entries = readAnimeList();
        const entry = entries.find(e => e.id === idNum);
        
        if (!entry) {
            return res.status(404).json({ error: 'Anime not found' });
        }
        
        const title = entry.title;
        
        // Check if anime is legendado before downloading
        const isLegendado = await checkAnimeIsLegendado(title);
        if (!isLegendado) {
            return res.status(400).json({ 
                error: 'Este anime não está disponível legendado (apenas dublado)',
                isLegendado: false 
            });
        }
        
        // Atualizar o anime no anime-list.txt com configurações do request (se fornecidas)
        const finalQuality = req.body.quality || entry.quality || 'HD';
        const finalStart = req.body.startEpisode || entry.startEpisode || 1;
        
        // Se houve mudanças, atualizar no arquivo
        if (finalQuality !== entry.quality || finalStart !== entry.startEpisode) {
            entry.quality = finalQuality;
            entry.startEpisode = finalStart;
            
            const entries = readAnimeList();
            const index = entries.findIndex(e => e.id === idNum);
            if (index !== -1) {
                entries[index] = entry;
                writeAnimeList(entries);
            }
        }
        
        // Spawn downloader process - ele vai ler do anime-list.txt diretamente
        // Passa o título como variável de ambiente para baixar apenas esse anime
        const downloaderScript = path.join(__dirname, 'anime-downloader.js');
        const nodeExe = process.execPath || 'node';
        const animeProcess = spawn(nodeExe, [downloaderScript], {
            env: {
                ...process.env,
                DOWNLOAD_SINGLE_ANIME: title  // Variável para indicar download de anime específico
            },
            detached: true
        });
        
        // Adicionar processo à lista de downloads ativos
        activeDownloadProcesses.set(title, animeProcess);
        console.log(`[DOWNLOAD] Processo iniciado para "${title}" (PID: ${animeProcess.pid})`);
        console.log(`[DOWNLOAD] Downloads ativos:`, Array.from(activeDownloadProcesses.keys()));
        
        animeProcess.stdout.on('data', (data) => {
            console.log(`[${title}]: ${data}`);
        });
        
        animeProcess.stderr.on('data', (data) => {
            console.error(`[${title}] Error: ${data}`);
        });
        
        animeProcess.on('close', (code) => {
            console.log(`Download process for ${title} exited with code ${code}`);
            // Remover da lista de processos ativos
            activeDownloadProcesses.delete(title);
        });
        
        // Don't wait for process to finish
        animeProcess.unref();
        
        res.json({ success: true, message: 'Download started', animeId: `anime-${idNum}`, title });
    } catch (error) {
        console.error('Error starting download:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start downloading all animes
app.post('/api/download-all', async (req, res) => {
    try {
        // Read anime list from database
        const entries = readAnimeList();
        
        if (entries.length === 0) {
            return res.status(404).json({ 
                error: 'Nenhum anime encontrado na lista'
            });
        }
        
        const animeList = [];
        const skippedAnimes = [];
        
        // Check each anime if it's legendado
        for (const entry of entries) {
            const title = entry.title;
            
            // Check if anime is legendado
            const isLegendado = await checkAnimeIsLegendado(title);
            if (isLegendado) {
                animeList.push(entry);
            } else {
                skippedAnimes.push(entry.displayTitle || title);
                console.log(`Skipping "${entry.displayTitle || title}" - not available with subtitles`);
            }
        }
        
        if (animeList.length === 0) {
            return res.status(404).json({ 
                error: 'Nenhum anime legendado encontrado para download',
                skippedAnimes
            });
        }
        
        // Spawn downloader process - ele vai processar apenas animes legendados
        // Passamos lista de títulos para filtrar via variável de ambiente
        const animeTitles = animeList.map(e => e.title).join('||');
        
        const downloaderScript = path.join(__dirname, 'anime-downloader.js');
        const nodeExe = process.execPath || 'node';
        const animeProcess = spawn(nodeExe, [downloaderScript], {
            env: {
                ...process.env,
                DOWNLOAD_ANIME_FILTER: animeTitles  // Lista de animes para baixar
            },
            detached: true
        });
        
        // Adicionar processo à lista de downloads ativos com chave especial
        activeDownloadProcesses.set('__download-all__', animeProcess);
        
        animeProcess.stdout.on('data', (data) => {
            console.log(`[Download All]: ${data}`);
        });
        
        animeProcess.stderr.on('data', (data) => {
            console.error(`[Download All Error]: ${data}`);
        });
        
        animeProcess.on('close', (code) => {
            console.log(`Download all process exited with code ${code}`);
            // Remover da lista de processos ativos
            activeDownloadProcesses.delete('__download-all__');
        });
        
        // Don't wait for process to finish
        animeProcess.unref();
        
        res.json({ success: true, message: 'Download of subtitled animes started', count: animeList.length });
    } catch (error) {
        console.error('Error starting download of all animes:', error);
        res.status(500).json({ error: error.message });
    }
});

// Cancel download endpoint
app.post('/api/cancel-download', (req, res) => {
    try {
        const { animeTitle } = req.body;
        
        // Log para debug
        console.log(`[CANCEL] Tentando cancelar: "${animeTitle}"`);
        console.log(`[CANCEL] Downloads ativos:`, Array.from(activeDownloadProcesses.keys()));
        
        // Se não especificar título, cancela todos
        if (!animeTitle || animeTitle === 'all') {
            let canceledCount = 0;
            for (const [title, process] of activeDownloadProcesses.entries()) {
                try {
                    // No Windows, usar taskkill para matar o processo e seus filhos
                    if (process.pid) {
                        if (process.platform === 'win32') {
                            spawn('taskkill', ['/pid', process.pid, '/f', '/t']);
                        } else {
                            process.kill('SIGTERM');
                        }
                        canceledCount++;
                    }
                } catch (err) {
                    console.error(`Erro ao cancelar processo ${title}:`, err);
                }
            }
            activeDownloadProcesses.clear();
            
            // Limpar a fila de downloads do status
            try {
                const statusPath = path.join(__dirname, 'download-status.json');
                if (fs.existsSync(statusPath)) {
                    const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
                    status.current = null;
                    status.queue = [];
                    status.episodeQueue = { episodes: [], currentAnime: null };
                    fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
                    console.log(`[CANCEL ALL] Fila de downloads limpa`);
                }
                
                // Limpar também o arquivo download-queue.json
                const queuePath = path.join(__dirname, 'download-queue.json');
                if (fs.existsSync(queuePath)) {
                    fs.writeFileSync(queuePath, JSON.stringify({ episodes: [], currentAnime: null, lastUpdate: new Date().toISOString() }, null, 2));
                    console.log(`[CANCEL ALL] Arquivo download-queue.json limpo`);
                }
            } catch (statusErr) {
                console.error('[CANCEL ALL] Erro ao limpar fila:', statusErr);
            }
            
            return res.json({ 
                success: true, 
                message: `${canceledCount} download(s) cancelado(s)`,
                count: canceledCount
            });
        }
        
        // Cancelar download específico - buscar por correspondência exata primeiro
        let process = activeDownloadProcesses.get(animeTitle);
        let foundKey = animeTitle;
        
        // Se não encontrar, tentar buscar case-insensitive
        if (!process) {
            const keys = Array.from(activeDownloadProcesses.keys());
            foundKey = keys.find(key => key.toLowerCase() === animeTitle.toLowerCase());
            if (foundKey) {
                process = activeDownloadProcesses.get(foundKey);
            }
        }
        
        if (!process) {
            console.log(`[CANCEL] Download não encontrado para "${animeTitle}"`);
            return res.status(404).json({ 
                success: false, 
                message: 'Nenhum download ativo encontrado para este anime' 
            });
        }
        
        try {
            if (process.pid) {
                console.log(`[CANCEL] Cancelando processo PID ${process.pid} para "${foundKey}"`);
                if (process.platform === 'win32') {
                    spawn('taskkill', ['/pid', process.pid, '/f', '/t']);
                } else {
                    process.kill('SIGTERM');
                }
            }
            activeDownloadProcesses.delete(foundKey);
            
            // Limpar a fila de downloads do status
            try {
                const statusPath = path.join(__dirname, 'download-status.json');
                if (fs.existsSync(statusPath)) {
                    const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
                    
                    // Limpar current, queue e episodeQueue
                    status.current = null;
                    status.queue = [];
                    status.episodeQueue = { episodes: [], currentAnime: null };
                    
                    fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
                    console.log(`[CANCEL] Fila de downloads limpa`);
                }
                
                // Limpar também o arquivo download-queue.json
                const queuePath = path.join(__dirname, 'download-queue.json');
                if (fs.existsSync(queuePath)) {
                    fs.writeFileSync(queuePath, JSON.stringify({ episodes: [], currentAnime: null, lastUpdate: new Date().toISOString() }, null, 2));
                    console.log(`[CANCEL] Arquivo download-queue.json limpo`);
                }
            } catch (statusErr) {
                console.error('[CANCEL] Erro ao limpar fila:', statusErr);
            }
            
            console.log(`[CANCEL] Download cancelado com sucesso: "${foundKey}"`);
            res.json({ 
                success: true, 
                message: `Download de "${foundKey}" cancelado com sucesso` 
            });
        } catch (err) {
            console.error('Erro ao cancelar download:', err);
            res.status(500).json({ 
                success: false, 
                message: `Erro ao cancelar download: ${err.message}` 
            });
        }
    } catch (error) {
        console.error('Error in cancel-download endpoint:', error);
        res.status(500).json({ error: error.message });
    }
});

// Search image API endpoint
app.get('/api/search-image', async (req, res) => {
    try {
        const { title } = req.query;
        
        if (!title) {
            return res.status(400).json({ error: 'Anime title is required' });
        }
        
        // Check cache first
        if (animeImagesCache[title]) {
            return res.json({ imageUrl: animeImagesCache[title] });
        }
        
        // Caso especial para Re:Zero
        if (title.toLowerCase().includes('re:zero') || 
            title.toLowerCase().includes('re-zero')) {
            const imageUrl = 'https://animefire.plus/img/animes/re-zero-kara-hajimeru-isekai-seikatsu-3rd-season-large.webp';
            animeImagesCache[title] = imageUrl;
            saveImageCache();
            return res.json({ imageUrl });
        }
        
        // Verificar se existe um alias para este anime
        if (ANIME_ALIASES[title]) {
            // Verificar no cache o alias
            if (animeImagesCache[ANIME_ALIASES[title]]) {
                animeImagesCache[title] = animeImagesCache[ANIME_ALIASES[title]];
                saveImageCache();
                return res.json({ imageUrl: animeImagesCache[title] });
            }
        }
        
        const imageUrl = await searchAnimeImage(title);
        
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

// Top10 / Destaques endpoint (scrapes animefire.plus homepage)
app.get('/api/top10', async (req, res) => {
    try {
        const response = await axios.get('https://animefire.plus', {
            headers: { 'User-Agent': USER_AGENT }
        });

        const $ = cheerio.load(response.data);
        const items = [];
        const seen = new Set();

        // Buscar elementos com text-blockTopTen (Top 10 ranking)
        $('.text-blockTopTen').each((i, el) => {
            if (items.length >= 10) return;
            
            const element = $(el);
            const rank = element.find('.numbTopTen').text().trim();
            
            // Subir até o article ou containerAnimes
            const container = element.closest('.containerAnimes, article, .divArticleLancamentos');
            
            const title = container.find('.animeTitle').text().trim() || 
                         container.attr('title')?.replace(' - Todos os Episódios', '').trim() || '';
            
            const img = container.find('img').attr('src') || 
                       container.find('img').attr('data-src') || '';
            
            const link = container.find('a').first().attr('href') || '';
            const fullLink = link.startsWith('http') ? link : (link ? `https://animefire.plus${link}` : '');
            
            const rating = container.find('.horaUltimosEps').text().trim() || 'N/A';
            
            if (title && !seen.has(title)) {
                seen.add(title);
                items.push({ 
                    title, 
                    imageUrl: img, 
                    url: fullLink,
                    rank: parseInt(rank) || i + 1,
                    rating
                });
            }
        });

        res.json(items.slice(0, 10));
    } catch (error) {
        console.error('Error fetching top10:', error.message || error);
        res.status(500).json({ error: error.message });
    }
});

// API para buscar últimos animes adicionados (12 itens)
app.get('/api/latest', async (req, res) => {
    try {
        const response = await axios.get('https://animefire.plus', {
            headers: { 'User-Agent': USER_AGENT }
        });

        const $ = cheerio.load(response.data);
        const items = [];
        const seen = new Set();

        // Buscar especificamente do carousel de últimos adicionados
        $('.owl-carousel-l_dia .divArticleLancamentos').each((i, el) => {
            if (items.length >= 12) return;
            
            const element = $(el);
            
            // Ignorar clones do owl carousel
            const parent = element.closest('.owl-item');
            if (parent.hasClass('cloned')) return;
            
            const title = element.find('.animeTitle').text().trim() || 
                         element.attr('title')?.replace(' - Todos os Episódios', '').trim() || '';
            
            if (!title || seen.has(title)) return;
            
            const img = element.find('img').attr('src') || 
                       element.find('img').attr('data-src') || '';
            
            const link = element.find('a').first().attr('href') || '';
            const fullLink = link.startsWith('http') ? link : (link ? `https://animefire.plus${link}` : '');
            
            const rating = element.find('.horaUltimosEps').text().trim() || 'N/A';
            
            seen.add(title);
            items.push({ 
                title, 
                imageUrl: img, 
                url: fullLink,
                rating
            });
        });

        res.json(items.slice(0, 12));
    } catch (error) {
        console.error('Error fetching latest:', error.message || error);
        res.status(500).json({ error: error.message });
    }
});

// API para buscar animes em lançamento (legendados - 12 itens)
app.get('/api/featured', async (req, res) => {
    try {
        const response = await axios.get('https://animefire.plus', {
            headers: { 'User-Agent': USER_AGENT }
        });

        const $ = cheerio.load(response.data);
        const items = [];
        const seen = new Set();

        // Buscar animes do carrossel (mesmo método que funciona no top10)
        $('.divArticleLancamentos').each((i, el) => {
            if (items.length >= 12) return;
            
            const element = $(el);
            
            const title = element.find('.animeTitle').text().trim() || 
                         element.attr('title')?.replace(' - Todos os Episódios', '').trim() || '';
            
            if (!title || seen.has(title)) return;
            
            const img = element.find('img').attr('src') || 
                       element.find('img').attr('data-src') || '';
            
            const link = element.find('a').first().attr('href') || '';
            const fullLink = link.startsWith('http') ? link : (link ? `https://animefire.plus${link}` : '');
            
            const rating = element.find('.horaUltimosEps').text().trim() || 'N/A';
            const ageRating = element.find('.text-blockCapaAnimeTagsDL span').text().trim() || '';
            
            seen.add(title);
            items.push({ 
                title, 
                imageUrl: img, 
                url: fullLink,
                rating,
                ageRating
            });
        });

        res.json(items.slice(0, 12));
    } catch (error) {
        console.error('Error fetching featured:', error.message || error);
        res.status(500).json({ error: error.message });
    }
});

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
    const cleanSearchTerm = searchTerm.replace(/-+$/g, '');
    const directUrl = `https://animefire.plus/animes/${cleanSearchTerm}-todos-os-episodios`;
        
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
                const imgSrc = img.attr('src') || img.attr('data-src');
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
        let status = {
            current: null,
            queue: [],
            completed: [],
            lastUpdate: new Date().toISOString()
        };
        
        // Ler status de downloads (animes na fila para processar)
        if (fs.existsSync(STATUS_FILE)) {
            const downloadStatus = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
            status.current = downloadStatus.current;
            status.queue = downloadStatus.queue || [];
            status.completed = downloadStatus.completed || [];
        }
        
        // Ler fila de episódios (episódios pendentes do anime atual)
        if (fs.existsSync(QUEUE_FILE)) {
            const episodeQueue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
            
            // Se há episódios na fila, adicionar informação da fila de episódios
            if (episodeQueue.episodes && episodeQueue.episodes.length > 0) {
                status.episodeQueue = {
                    currentAnime: episodeQueue.currentAnime,
                    episodes: episodeQueue.episodes,
                    totalEpisodes: episodeQueue.episodes.length
                };
            }
        }
        
        res.json(status);
    } catch (error) {
        console.error('Error reading download status:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para obter a pasta de download
app.get('/api/download-folder', (req, res) => {
    try {
        res.json({ folder: DOWNLOAD_FOLDER });
    } catch (error) {
        console.error('Error getting download folder:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para alterar a pasta de download
app.put('/api/download-folder', (req, res) => {
    try {
        const { folder } = req.body;
        
        if (!folder) {
            return res.status(400).json({ error: 'Folder path is required' });
        }
        
        // Verificar se a pasta existe, se não, tentar criar
        if (!fs.existsSync(folder)) {
            try {
                fs.mkdirSync(folder, { recursive: true });
            } catch (error) {
                return res.status(400).json({ error: `Could not create folder: ${error.message}` });
            }
        }
        
        // Atualizar configuração
        config.downloadFolder = folder;
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        
        res.json({ folder });
    } catch (error) {
        console.error('Error updating download folder:', error);
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

// Função auxiliar para sanitizar nomes de arquivo de maneira consistente
// Helper function to remove anime from anime-list.txt
function removeFromAnimeList(titleToRemove) {
    try {
        if (!fs.existsSync(ANIME_LIST_FILE)) {
            console.log(`anime-list.txt não existe, nada a remover`);
            return;
        }

        const content = fs.readFileSync(ANIME_LIST_FILE, 'utf8');
        const lines = content.split('\n');
        
        // Filter out the line with the matching title
        const remaining = lines.filter(line => {
            if (line.trim() && !line.startsWith('#')) {
                const parts = line.split('|').map(p => p.trim());
                // parts[0] is numeric ID, parts[1] is title
                const title = parts.length > 1 ? parts[1] : parts[0];
                
                // Check if title matches (with or without hyphens/spaces)
                const normalizedTitle = title.replace(/[-\s]/g, '').toLowerCase();
                const normalizedToRemove = titleToRemove.replace(/[-\s]/g, '').toLowerCase();
                
                return normalizedTitle !== normalizedToRemove;
            }
            return true; // Keep comments and empty lines
        });

        fs.writeFileSync(ANIME_LIST_FILE, remaining.join('\n'));
        console.log(`✓ Removido "${titleToRemove}" da lista de animes`);
    } catch (error) {
        console.error(`Erro ao remover "${titleToRemove}" da lista:`, error);
    }
}

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

// Add this utility function to safely open folders (keep this)
function safeOpenFolder(folderPath, res) {
    // Create the folder if it doesn't exist
    if (!fs.existsSync(folderPath)) {
        try {
            fs.mkdirSync(folderPath, { recursive: true });
            console.log(`Created folder: ${folderPath}`);
        } catch (error) {
            console.error(`Error creating folder: ${error.message}`);
            return res.status(500).json({ message: `Error creating folder: ${error.message}` });
        }
    }
    
    // Try to open the folder
    exec(`explorer "${folderPath}"`, (error) => {
        if (error) {
            console.error(`Failed to open folder: ${error.message}`);
            
            // Try opening the parent folder instead
            const parentFolder = path.dirname(folderPath);
            console.log(`Attempting to open parent folder: ${parentFolder}`);
            
            exec(`explorer "${parentFolder}"`, (parentError) => {
                if (parentError) {
                    return res.status(500).json({ 
                        message: `Failed to open folder. Path may be too long or folder doesn't exist.`
                    });
                } else {
                    return res.json({ 
                        message: `Opened parent folder because the anime folder path was too long.`,
                        openedParent: true
                    });
                }
            });
        } else {
            return res.json({ message: `Folder opened successfully.` });
        }
    });
}

// Update your endpoint that handles opening folders (keep this)
// Replace the existing endpoint with this implementation
app.post('/api/animes/:id/open-folder', (req, res) => {
    try {
        const animeId = req.params.id;
        const { title, originalTitle, safeFolderName, archived } = req.body;

        if (!title) {
            return res.status(400).json({ message: 'Anime title is required' });
        }

        // Determinar o nome da pasta
        let folderName;
        
        if (archived) {
            // Para arquivados, o safeFolderName já vem como o nome real da pasta
            folderName = safeFolderName || title;
        } else {
            // Para não arquivados, usar safeFolderName ou criar um
            folderName = safeFolderName || createSafeFolderName(originalTitle || title.replace(/-/g, ' '));
        }

        // If archived flag is true, open from ARCHIVE_FOLDER
        const folderPath = archived ? path.join(ARCHIVE_FOLDER, folderName) : path.join(DOWNLOAD_FOLDER, folderName);

        // Use the safe function to handle folder opening
        safeOpenFolder(folderPath, res);

    } catch (error) {
        console.error('Error in open-folder endpoint:', error);
        res.status(500).json({ message: error.message });
    }
});

// Add utility function for safe folder names
function createSafeFolderName(name) {
    // Remove invalid characters for Windows folders
    let safeName = name.replace(/[<>:"/\\|?*]/g, '');
    
    // Limit length to avoid path length issues
    if (safeName.length > 50) {
        safeName = safeName.substring(0, 47) + '...';
    }
    
    return safeName;
}

// Global error handlers
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Open your browser at http://localhost:${PORT}`);
});
