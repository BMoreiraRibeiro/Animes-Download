// API URLs
const API_URL = '/api';
const ANIMES_URL = `${API_URL}/animes`;
const CONFIG_URL = `${API_URL}/config`;
const DOWNLOAD_STATUS_URL = `${API_URL}/download-status`;
const DOWNLOAD_FOLDER_URL = `${API_URL}/download-folder`;
const DIRECTORIES_URL = `${API_URL}/directories`;

// DOM Elements
const homeView = document.getElementById('home-view');
const settingsView = document.getElementById('settings-view');
const statusView = document.getElementById('status-view');
const homeLink = document.getElementById('home-link');
const settingsLink = document.getElementById('settings-link');
const statusLink = document.getElementById('status-link');
const downloadFolderInput = document.getElementById('download-folder');
const browseFolderBtn = document.getElementById('browse-folder-btn');
const saveFolderBtn = document.getElementById('save-folder-btn');
const animeList = document.getElementById('anime-list');
const addAnimeBtn = document.getElementById('add-anime-btn');
const downloadAllBtn = document.getElementById('download-all-btn');
const settingsForm = document.getElementById('settings-form');
const defaultQualitySelect = document.getElementById('default-quality');
const startEpisodeInput = document.getElementById('start-episode');

// Modal elements
const animeModal = new bootstrap.Modal(document.getElementById('anime-modal'));
const animeForm = document.getElementById('anime-form');
const animeModalTitle = document.getElementById('anime-modal-title');
const animeIdInput = document.getElementById('anime-id');
const animeTitleInput = document.getElementById('anime-title');
const animeQualitySelect = document.getElementById('anime-quality');
const animeStartEpisodeInput = document.getElementById('anime-start-episode');
const animeUrlInput = document.getElementById('anime-url'); // Add reference to the URL input field
const saveAnimeBtn = document.getElementById('save-anime-btn');

const episodesModal = new bootstrap.Modal(document.getElementById('episodes-modal'));
const episodesModalTitle = document.getElementById('episodes-modal-title');
const episodesList = document.getElementById('episodes-list');

// Status view elements
const currentDownloadCard = document.getElementById('current-download-card');
const currentAnimeTitle = document.getElementById('current-anime-title');
const currentProgress = document.getElementById('current-progress');
const currentAnimeDetails = document.getElementById('current-anime-details');
const queueCard = document.getElementById('queue-card');
const queueList = document.getElementById('queue-list');
const completedCard = document.getElementById('completed-card');
const completedList = document.getElementById('completed-list');
const noDownloadsAlert = document.getElementById('no-downloads-alert');

// Folder browser modal
const folderBrowserModal = new bootstrap.Modal(document.getElementById('folder-browser-modal'));
const folderList = document.getElementById('folder-list');
const folderBreadcrumb = document.getElementById('folder-breadcrumb');
const selectFolderBtn = document.getElementById('select-folder-btn');

// State
let animes = [];
let config = {};
let isEditing = false;
let currentPath = "";
let statusRefreshInterval = null;

// Navigation
homeLink.addEventListener('click', (e) => {
    e.preventDefault();
    homeView.style.display = 'block';
    settingsView.style.display = 'none';
    statusView.style.display = 'none';
    homeLink.classList.add('active');
    settingsLink.classList.remove('active');
    statusLink.classList.remove('active');
});

settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    homeView.style.display = 'none';
    settingsView.style.display = 'block';
    statusView.style.display = 'none';
    homeLink.classList.remove('active');
    settingsLink.classList.add('active');
    statusLink.classList.remove('active');
    loadConfig();
    loadDownloadFolder();
});

statusLink.addEventListener('click', (e) => {
    e.preventDefault();
    homeView.style.display = 'none';
    settingsView.style.display = 'none';
    statusView.style.display = 'block';
    homeLink.classList.remove('active');
    settingsLink.classList.remove('active');
    statusLink.classList.add('active');
    
    // Carregar status inicial
    loadDownloadStatus();
    
    // Configurar atualização periódica
    if (statusRefreshInterval) {
        clearInterval(statusRefreshInterval);
    }
    statusRefreshInterval = setInterval(loadDownloadStatus, 5000); // Atualizar a cada 5 segundos
});

// Load animes
async function loadAnimes() {
    try {
        const response = await fetch(ANIMES_URL);
        animes = await response.json();
        
        // Carregar imagens para cada anime
        for (const anime of animes) {
            if (!anime.imageUrl) {
                anime.imageUrl = await searchAnimeImage(anime.title);
            }
        }
        
        renderAnimes();
    } catch (error) {
        console.error('Error loading animes:', error);
        showAlert('Erro ao carregar animes', 'danger');
    }
}

// Buscar imagem para um anime
async function searchAnimeImage(animeTitle) {
    try {
        // Caso especial para Re:Zero
        if (animeTitle.toLowerCase().includes('re:zero') || 
            animeTitle.toLowerCase().includes('re-zero')) {
            return 'https://animefire.plus/img/animes/re-zero-kara-hajimeru-isekai-seikatsu-3rd-season-large.webp';
        }
        
        // Tentar obter uma imagem através da API
        const response = await fetch(`${API_URL}/search-image?title=${encodeURIComponent(animeTitle)}`);
        
        if (response.ok) {
            const data = await response.json();
            return data.imageUrl || '';
        }
    } catch (error) {
        console.error('Error searching anime image:', error);
    }
    
    // Em caso de falha, retornar string vazia
    return '';
}

// Load config
async function loadConfig() {
    try {
        const response = await fetch(CONFIG_URL);
        config = await response.json();
        defaultQualitySelect.value = config.defaultQuality || 'HD';
        startEpisodeInput.value = config.startFromEpisode || 1;
    } catch (error) {
        console.error('Error loading config:', error);
        showAlert('Erro ao carregar configurações', 'danger');
    }
}

// Load download folder
async function loadDownloadFolder() {
    try {
        const response = await fetch(DOWNLOAD_FOLDER_URL);
        const data = await response.json();
        downloadFolderInput.value = data.folder;
    } catch (error) {
        console.error('Error loading download folder:', error);
        showAlert('Erro ao carregar pasta de download', 'danger');
    }
}

// Save download folder
async function saveDownloadFolder() {
    try {
        const folder = downloadFolderInput.value;
        
        if (!folder) {
            showAlert('Por favor, selecione uma pasta de download', 'warning');
            return;
        }
        
        const response = await fetch(DOWNLOAD_FOLDER_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Error saving download folder');
        }
        
        showAlert('Pasta de download salva com sucesso!', 'success');
    } catch (error) {
        console.error('Error saving download folder:', error);
        showAlert(`Erro ao salvar pasta de download: ${error.message}`, 'danger');
    }
}

// Open folder browser
async function openFolderBrowser() {
    try {
        // Reset path to start browsing
        currentPath = "";
        await loadDirectories();
        folderBrowserModal.show();
    } catch (error) {
        console.error('Error opening folder browser:', error);
        showAlert('Erro ao abrir navegador de pastas', 'danger');
    }
}

// Load directories for folder browser
async function loadDirectories(basePath = null) {
    try {
        let url = DIRECTORIES_URL;
        if (basePath) {
            url += `?basePath=${encodeURIComponent(basePath)}`;
        }
        
        const response = await fetch(url);
        const directories = await response.json();
        
        // Update current path
        currentPath = basePath || "";
        
        // Update breadcrumb
        updateBreadcrumb();
        
        // Update folder list
        folderList.innerHTML = directories.map(dir => `
            <a href="#" class="list-group-item list-group-item-action folder-item" data-path="${dir.path}">
                <i class="bi bi-folder"></i> ${dir.name}
            </a>
        `).join('');
        
        // Add click events to folder items
        document.querySelectorAll('.folder-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const path = e.currentTarget.dataset.path;
                loadDirectories(path);
            });
        });
    } catch (error) {
        console.error('Error loading directories:', error);
        folderList.innerHTML = `
            <div class="alert alert-danger">
                Erro ao carregar diretórios: ${error.message}
            </div>
        `;
    }
}

// Update breadcrumb in folder browser
function updateBreadcrumb() {
    if (!currentPath) {
        folderBreadcrumb.innerHTML = `
            <li class="breadcrumb-item active">Início</li>
        `;
        return;
    }
    
    const parts = currentPath.split(/[\/\\]/);
    let pathSoFar = "";
    
    const breadcrumbItems = [`<li class="breadcrumb-item"><a href="#" data-path="">Início</a></li>`];
    
    for (let i = 0; i < parts.length; i++) {
        if (!parts[i]) continue;
        
        pathSoFar += (pathSoFar ? "/" : "") + parts[i];
        
        if (i === parts.length - 1) {
            breadcrumbItems.push(`<li class="breadcrumb-item active">${parts[i]}</li>`);
        } else {
            breadcrumbItems.push(`<li class="breadcrumb-item"><a href="#" data-path="${pathSoFar}">${parts[i]}</a></li>`);
        }
    }
    
    folderBreadcrumb.innerHTML = breadcrumbItems.join('');
    
    // Add click events to breadcrumb links
    document.querySelectorAll('#folder-breadcrumb a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const path = e.currentTarget.dataset.path;
            loadDirectories(path);
        });
    });
}

// Select folder
function selectFolder() {
    if (currentPath) {
        downloadFolderInput.value = currentPath;
        folderBrowserModal.hide();
    } else {
        showAlert('Por favor, selecione uma pasta', 'warning');
    }
}

// Render animes
function renderAnimes() {
    if (animes.length === 0) {
        animeList.innerHTML = `
            <div class="col-12">
                <div class="alert alert-info">
                    Nenhum anime na lista. Adicione seu primeiro anime clicando no botão acima.
                </div>
            </div>
        `;
        return;
    }
    
    animeList.innerHTML = animes.map(anime => {
        // Usar displayTitle (sem hífens) para exibição
        const animeTitle = anime.displayTitle || anime.title.replace(/-/g, ' ');
        
        // Caso especial para Re:Zero
        if ((anime.title.toLowerCase().includes('re:zero') || 
             anime.title.toLowerCase().includes('re-zero')) && 
            !anime.imageUrl) {
            // Imagem hardcoded para Re:Zero
            anime.imageUrl = 'https://animefire.plus/img/animes/re-zero-kara-hajimeru-isekai-seikatsu-3rd-season-large.webp';
        }
        
        // Determinar como exibir o anime (com imagem ou placeholder)
        const imageSection = anime.imageUrl ? 
            `<div class="anime-card-img" style="background-image: url('${anime.imageUrl}')">
                <div class="anime-card-img-title">${animeTitle}</div>
            </div>` :
            `<div class="anime-card-img-placeholder">
                <div>${animeTitle}</div>
            </div>`;
        
        // Add URL link if available
        const urlLink = anime.animeUrl ? 
            `<a href="${anime.animeUrl}" target="_blank" class="btn btn-sm btn-outline-primary mb-2" title="Abrir no AnimeFirePlus">
                <i class="bi bi-link-45deg"></i> Ver Online
            </a>` : '';
            
        return `
            <div class="col-md-6 col-lg-4 mb-4" data-anime-id="${anime.id}">
                <div class="card anime-card">
                    ${imageSection}
                    <span class="badge bg-info badge-episodes">${anime.episodes?.length || 0} eps</span>
                    <span class="badge bg-primary quality-badge">${anime.quality}</span>
                    
                    <div class="card-body">
                        <p class="card-text">
                            <span class="badge bg-secondary">Desde ep. ${anime.startEpisode}</span>
                        </p>
                        ${urlLink}
                    </div>
                    <div class="card-footer">
                        <div class="d-flex flex-wrap gap-1 justify-content-between">
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-primary" data-action="view-episodes" data-id="${anime.id}">
                                    <i class="bi bi-eye"></i> Episódios
                                </button>
                                <button class="btn btn-outline-secondary" data-action="edit" data-id="${anime.id}">
                                    <i class="bi bi-pencil"></i> Editar
                                </button>
                                <button class="btn btn-outline-danger" data-action="delete" data-id="${anime.id}">
                                    <i class="bi bi-trash"></i> Excluir
                                </button>
                            </div>
                            <div>
                                <button class="btn btn-sm btn-info" data-action="open-folder" data-id="${anime.id}">
                                    <i class="bi bi-folder"></i> Abrir Pasta
                                </button>
                                <button class="btn btn-sm btn-success" data-action="download" data-id="${anime.id}">
                                    <i class="bi bi-download"></i> Download
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Add event listeners
    document.querySelectorAll('[data-action]').forEach(button => {
        button.addEventListener('click', handleAnimeAction);
    });
}

// Handle anime actions (edit, delete, download)
function handleAnimeAction(event) {
    const button = event.currentTarget;
    const action = button.dataset.action;
    const animeId = button.dataset.id;
    const anime = animes.find(a => a.id === animeId);
    
    if (!anime) return;
    
    switch (action) {
        case 'edit':
            openAnimeModal(anime);
            break;
        case 'delete':
            confirmDeleteAnime(anime);
            break;
        case 'download':
            startAnimeDownload(anime);
            break;
        case 'view-episodes':
            viewAnimeEpisodes(anime);
            break;
        case 'open-folder':
            openAnimeFolder(anime);
            break;
    }
}

// Open anime modal for add/edit
function openAnimeModal(anime = null) {
    isEditing = !!anime;
    animeModalTitle.textContent = isEditing ? 'Editar Anime' : 'Adicionar Anime';
    
    if (isEditing) {
        animeIdInput.value = anime.id;
        // Usar displayTitle (sem hífens) para exibição no campo de edição
        animeTitleInput.value = anime.displayTitle || anime.title.replace(/-/g, ' ');
        animeQualitySelect.value = anime.quality;
        animeStartEpisodeInput.value = anime.startEpisode;
        animeUrlInput.value = anime.animeUrl || ''; // Set URL if it exists
    } else {
        animeForm.reset();
        animeIdInput.value = '';
        // Set default values from config
        animeQualitySelect.value = config.defaultQuality || 'HD';
        animeStartEpisodeInput.value = config.startFromEpisode || 1;
        animeUrlInput.value = ''; // Clear URL field
    }
    
    animeModal.show();
}

// Save anime
async function saveAnime() {
    // Ao salvar, transforma espaços em hífens para armazenamento (URL-friendly)
    const displayTitle = animeTitleInput.value.trim();
    const storageTitle = displayTitle.replace(/\s+/g, '-');
    
    const animeData = {
        title: storageTitle,
        displayTitle: displayTitle,
        quality: animeQualitySelect.value,
        startEpisode: parseInt(animeStartEpisodeInput.value, 10),
        animeUrl: animeUrlInput.value.trim() // Include anime URL in the data
    };
    
    if (!animeData.title) {
        alert('Por favor, informe o nome do anime');
        return;
    }
    
    try {
        let response;
        
        if (isEditing) {
            const animeId = animeIdInput.value;
            response = await fetch(`${ANIMES_URL}/${animeId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(animeData)
            });
        } else {
            response = await fetch(ANIMES_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(animeData)
            });
        }
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Error saving anime');
        }
        
        animeModal.hide();
        await loadAnimes();
        showAlert(isEditing ? 'Anime atualizado com sucesso!' : 'Anime adicionado com sucesso!', 'success');
    } catch (error) {
        console.error('Error saving anime:', error);
        showAlert(`Erro ao salvar anime: ${error.message}`, 'danger');
    }
}

// Confirm delete anime
function confirmDeleteAnime(anime) {
    // Usar displayTitle (sem hífens) para exibição
    const animeTitle = anime.displayTitle || anime.title.replace(/-/g, ' ');
    if (confirm(`Tem certeza que deseja excluir "${animeTitle}" da lista?`)) {
        deleteAnime(anime);
    }
}

// Delete anime
async function deleteAnime(anime) {
    try {
        const response = await fetch(`${ANIMES_URL}/${anime.id}?title=${encodeURIComponent(anime.title)}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Error deleting anime');
        }
        
        await loadAnimes();
        showAlert('Anime removido com sucesso!', 'success');
    } catch (error) {
        console.error('Error deleting anime:', error);
        showAlert(`Erro ao excluir anime: ${error.message}`, 'danger');
    }
}

// Start anime download
async function startAnimeDownload(anime) {
    try {
        const response = await fetch(`${ANIMES_URL}/${anime.id}/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: anime.title })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Error starting download');
        }
        
        showAlert(`Download iniciado para "${anime.title}"`, 'success');
    } catch (error) {
        console.error('Error starting download:', error);
        showAlert(`Erro ao iniciar download: ${error.message}`, 'danger');
    }
}

// View anime episodes
function viewAnimeEpisodes(anime) {
    // Usar displayTitle (sem hífens) para exibição
    const animeTitle = anime.displayTitle || anime.title.replace(/-/g, ' ');
    episodesModalTitle.textContent = `Episódios de ${animeTitle}`;
    
    if (!anime.episodes || anime.episodes.length === 0) {
        episodesList.innerHTML = `
            <div class="alert alert-info">
                Nenhum episódio baixado ainda. Inicie o download para ver os episódios.
            </div>
        `;
    } else {
        episodesList.innerHTML = anime.episodes
            .sort((a, b) => a.number - b.number)
            .map(episode => `
                <div class="list-group-item episode-item">
                    <span class="episode-number">Episódio ${episode.number}</span>
                    <span class="badge ${episode.isUrl ? 'bg-warning' : 'bg-success'}">
                        ${episode.isUrl ? 'Link Online' : 'Baixado'}
                    </span>
                </div>
            `).join('');
    }
    
    episodesModal.show();
}

// Create safe folder name (max 50 characters)
function createSafeFolderName(name) {
    // Remove invalid characters for Windows folders
    let safeName = name.replace(/[<>:"/\\|?*]/g, '');
    
    // Limit length to avoid path length issues
    if (safeName.length > 50) {
        safeName = safeName.substring(0, 47) + '...';
    }
    
    return safeName;
}

// Open anime folder
async function openAnimeFolder(anime) {
    try {
        // Get original title or display title for folder name
        const folderName = anime.originalTitle || anime.displayTitle || anime.title.replace(/-/g, ' ');
        // Create a safe version of the folder name for Windows
        const safeFolderName = createSafeFolderName(folderName);
        
        const response = await fetch(`${ANIMES_URL}/${anime.id}/open-folder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                title: anime.title,
                originalTitle: folderName,
                safeFolderName: safeFolderName // Send the safe folder name to server
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Error opening folder');
        }
        
        // Resposta pode incluir status ou mensagem
        const result = await response.json();
        if (result.message) {
            showAlert(result.message, 'info');
        }
    } catch (error) {
        console.error('Error opening anime folder:', error);
        showAlert(`Erro ao abrir pasta: ${error.message}`, 'danger');
    }
}

// Start download all
async function startDownloadAll() {
    if (!confirm('Deseja iniciar o download de todos os animes da lista?')) return;
    
    try {
        const response = await fetch(`${API_URL}/download-all`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Error starting download');
        }
        
        showAlert('Download de todos os animes iniciado!', 'success');
    } catch (error) {
        console.error('Error starting download all:', error);
        showAlert(`Erro ao iniciar downloads: ${error.message}`, 'danger');
    }
}

// Save settings
async function saveSettings(event) {
    event.preventDefault();
    
    const settingsData = {
        defaultQuality: defaultQualitySelect.value,
        startFromEpisode: parseInt(startEpisodeInput.value, 10)
    };
    
    try {
        const response = await fetch(CONFIG_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settingsData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Error saving settings');
        }
        
        config = settingsData;
        showAlert('Configurações salvas com sucesso!', 'success');
    } catch (error) {
        console.error('Error saving settings:', error);
        showAlert(`Erro ao salvar configurações: ${error.message}`, 'danger');
    }
}

// Load download status
async function loadDownloadStatus() {
    try {
        const response = await fetch(DOWNLOAD_STATUS_URL);
        const status = await response.json();
        
        // Verificar se há download em andamento
        if (status.current) {
            // Exibir card de download atual
            currentDownloadCard.style.display = 'block';
            // Substituir hífens por espaços no nome do anime sendo baixado
            currentAnimeTitle.textContent = status.current.name.replace(/-/g, ' ');
            
            // Atualizar barra de progresso
            const progress = status.current.progress || 0;
            currentProgress.style.width = `${progress}%`;
            currentProgress.textContent = `${progress}%`;
            currentProgress.setAttribute('aria-valuenow', progress);
            
            // Detalhes específicos baseados no status
            let detailsText = `Status: ${formatStatusText(status.current.status)}`;
            
            if (status.current.details) {
                const details = status.current.details;
                
                if (details.totalEpisodes) {
                    detailsText += ` | Episódio ${details.currentEpisode || 0}/${details.totalEpisodes}`;
                    
                    if (details.episodeNumber) {
                        detailsText += ` (Ep. ${details.episodeNumber})`;
                    }
                    
                    if (details.downloadPercent) {
                        detailsText += ` | Progresso do episódio: ${details.downloadPercent}%`;
                    }
                }
            }
            
            currentAnimeDetails.textContent = detailsText;
        } else {
            currentDownloadCard.style.display = 'none';
        }
        
        // Verificar fila
        if (status.queue && status.queue.length > 0) {
            queueCard.style.display = 'block';
            queueList.innerHTML = status.queue.map(anime => `
                <li class="list-group-item">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <strong>${anime.name.replace(/-/g, ' ')}</strong> 
                            <span class="badge bg-secondary">Qualidade: ${anime.quality}</span>
                            <span class="badge bg-info">Ep. inicial: ${anime.startEpisode}</span>
                        </div>
                        <span class="badge bg-warning">Na fila</span>
                    </div>
                </li>
            `).join('');
        } else {
            queueCard.style.display = 'none';
        }
        
        // Verificar downloads concluídos
        if (status.completed && status.completed.length > 0) {
            completedCard.style.display = 'block';
            completedList.innerHTML = status.completed.map(anime => {
                const startTime = new Date(anime.startTime);
                const endTime = anime.endTime ? new Date(anime.endTime) : null;
                
                let duration = "N/A";
                if (endTime) {
                    const durationMs = endTime - startTime;
                    const minutes = Math.floor(durationMs / (1000 * 60));
                    const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
                    duration = `${minutes}m ${seconds}s`;
                }
                
                return `
                    <li class="list-group-item">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <strong>${anime.name.replace(/-/g, ' ')}</strong>
                                <span class="badge bg-secondary">Qualidade: ${anime.quality}</span>
                                <small class="text-muted">Concluído em ${formatDate(anime.endTime || anime.startTime)}</small>
                                <small class="text-muted ml-2">Duração: ${duration}</small>
                            </div>
                            <span class="badge bg-success">Concluído</span>
                        </div>
                    </li>
                `;
            }).join('');
        } else {
            completedCard.style.display = 'none';
        }
        
        // Se não há downloads nem fila nem concluídos
        if (!status.current && (!status.queue || status.queue.length === 0) && (!status.completed || status.completed.length === 0)) {
            noDownloadsAlert.style.display = 'block';
        } else {
            noDownloadsAlert.style.display = 'none';
        }
        
    } catch (error) {
        console.error('Error loading download status:', error);
        showAlert('Erro ao carregar status dos downloads', 'danger');
    }
}

// Helper function to format status text
function formatStatusText(status) {
    const statusMap = {
        'searching': 'Procurando anime',
        'fetching_episodes': 'Buscando episódios',
        'downloading': 'Baixando',
        'downloading_episode': 'Baixando episódio',
        'completed': 'Concluído',
        'error': 'Erro',
        'error_episode': 'Erro no episódio',
        'queued': 'Na fila'
    };
    
    return statusMap[status] || status;
}

// Helper function to format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString();
}

// Show alert
function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    // Insert at the top of container
    const container = document.querySelector('.container');
    container.insertBefore(alertDiv, container.firstChild);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        alertDiv.classList.remove('show');
        setTimeout(() => alertDiv.remove(), 300);
    }, 5000);
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    loadAnimes();
    loadConfig();
    
    addAnimeBtn.addEventListener('click', () => openAnimeModal());
    downloadAllBtn.addEventListener('click', startDownloadAll);
    saveAnimeBtn.addEventListener('click', saveAnime);
    settingsForm.addEventListener('submit', saveSettings);
    
    browseFolderBtn.addEventListener('click', openFolderBrowser);
    saveFolderBtn.addEventListener('click', saveDownloadFolder);
    selectFolderBtn.addEventListener('click', selectFolder);
    
    // Unload interval when navigating away from status page
    homeLink.addEventListener('click', () => {
        if (statusRefreshInterval) {
            clearInterval(statusRefreshInterval);
            statusRefreshInterval = null;
        }
    });
    
    settingsLink.addEventListener('click', () => {
        if (statusRefreshInterval) {
            clearInterval(statusRefreshInterval);
            statusRefreshInterval = null;
        }
    });
});
