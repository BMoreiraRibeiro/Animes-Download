// API URLs
const API_URL = '/api';
const ANIMES_URL = `${API_URL}/animes`;
const CONFIG_URL = `${API_URL}/config`;
const DOWNLOAD_STATUS_URL = `${API_URL}/download-status`;
const DOWNLOAD_FOLDER_URL = `${API_URL}/download-folder`;
const DIRECTORIES_URL = `${API_URL}/directories`;

// Logging function for consistent UI-side logging
function logUI(message) {
    console.log(`[UI] ${new Date().toISOString()} - ${message}`);
}

// DOM Elements
const homeView = document.getElementById('home-view');
const settingsView = document.getElementById('settings-view');
const homeLink = document.getElementById('home-link');
const settingsLink = document.getElementById('settings-link');
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
const currentPathDisplay = document.getElementById('current-path-display');
const goUpDirectoryBtn = document.getElementById('go-up-directory');
const drivesContainer = document.getElementById('drives-container');

// Main progress elements
const mainProgressCard = document.getElementById('main-progress-card');
const mainAnimeTitle = document.getElementById('main-anime-title');
const mainEpisodeInfo = document.getElementById('main-episode-info');
const mainProgress = document.getElementById('main-progress');
const mainAnimeDetails = document.getElementById('main-anime-details');

// Adicionar variáveis para os novos elementos
const cancelDownloadBtn = document.getElementById('cancel-download-btn');

// Adicionar referência ao modal de progresso de download
const downloadProgressModal = new bootstrap.Modal(document.getElementById('download-progress-modal'));
const popupAnimeTitle = document.getElementById('popup-anime-title');
const popupEpisodeInfo = document.getElementById('popup-episode-info');
const popupProgress = document.getElementById('popup-progress');
const popupAnimeDetails = document.getElementById('popup-anime-details');
const popupQueueList = document.getElementById('popup-queue-list');
const popupQueueCount = document.getElementById('popup-queue-count');
const popupCancelDownloadBtn = document.getElementById('popup-cancel-download-btn');

// Modal de confirmação de episódios
const confirmEpisodesModal = new bootstrap.Modal(document.getElementById('confirm-episodes-modal'));
const confirmAnimeTitle = document.getElementById('confirm-anime-title');
const confirmAnimeQuality = document.getElementById('confirm-anime-quality');
const confirmTotalEpisodes = document.getElementById('confirm-total-episodes');
const confirmDownloadedEpisodes = document.getElementById('confirm-downloaded-episodes');
const confirmEpisodesList = document.getElementById('confirm-episodes-list');
const confirmEpisodesCount = document.getElementById('confirm-episodes-count');
const confirmDownloadBtn = document.getElementById('confirm-download-btn');

// State
let animes = [];
let config = {};
let isEditing = false;
let currentPath = "";
let homeRefreshInterval = null;
let currentAnimeToDownload = null; // Para armazenar o anime atual para download após confirmação

// Add watched episodes variable
let watchedEpisodes = {};

// Navigation
homeLink.addEventListener('click', (e) => {
    e.preventDefault();
    switchToHomeView();
});

settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    switchToSettingsView();
});

// Add these helper functions to ensure view switching works correctly
function switchToHomeView() {
    logUI('Switching to home view');
    // Show home content (both featured animes and saved animes)
    homeView.style.display = 'block';
    
    // Make sure featured animes are visible in home view
    const featuredAnimesSection = document.getElementById('featured-animes');
    if (featuredAnimesSection) {
        featuredAnimesSection.style.display = 'block';
    }
    
    // Hide settings view
    settingsView.style.display = 'none';
    
    // Update nav active states
    homeLink.classList.add('active');
    settingsLink.classList.remove('active');
    
    // Load status and anime data for home view
    loadDownloadStatus();
    loadFeaturedAnimes();
    
    // Configure periodic updates for the main screen
    if (homeRefreshInterval) {
        clearInterval(homeRefreshInterval);
    }
    homeRefreshInterval = setInterval(loadDownloadStatus, 3000);
}

function switchToSettingsView() {
    logUI('Switching to settings view');
    // Hide home content
    homeView.style.display = 'none';
    
    // Hide featured animes section when in settings
    const featuredAnimesSection = document.getElementById('featured-animes');
    if (featuredAnimesSection) {
        featuredAnimesSection.style.display = 'none';
    }
    
    // Show settings view
    settingsView.style.display = 'block';
    
    // Update nav active states
    homeLink.classList.remove('active');
    settingsLink.classList.add('active');
    
    // Load settings data
    loadConfig();
    loadDownloadFolder();
    
    // Stop periodic updates
    if (homeRefreshInterval) {
        clearInterval(homeRefreshInterval);
        homeRefreshInterval = null;
    }
}

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
        
        renderAnimeList();
    } catch (error) {
        console.error('Error loading animes:', error);
        showAlert('Erro ao carregar animes', 'danger');
    }
}

// Buscar imagem para um anime
async function searchAnimeImage(animeTitle) {
    try {
        // Verificar se o anime tem uma URL direta registrada
        const anime = animes.find(a => a.title === animeTitle);
        let requestUrl = `${API_URL}/search-image?title=${encodeURIComponent(animeTitle)}`;
        
        // SEMPRE incluir URL direta na requisição se disponível
        if (anime && anime.animeUrl) {
            requestUrl += `&url=${encodeURIComponent(anime.animeUrl)}`;
            logUI(`Usando URL direta para buscar imagem do anime: ${anime.animeUrl}`);
        } else {
            logUI(`Aviso: Nenhuma URL direta disponível para o anime "${animeTitle}"`);
        }
        
        // Tentar obter uma imagem através da API
        const response = await fetch(requestUrl);
        
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
        logUI('Loaded download folder:', data);
        downloadFolderInput.value = data.folder;
    } catch (error) {
        console.error('Error loading download folder:', error);
        showAlert('Erro ao carregar pasta de download', 'danger');
    }
}

// Save download folder
async function saveDownloadFolder() {
    try {
        const folderPath = downloadFolderInput.value.trim();
        
        if (!folderPath) {
            showAlert('Por favor, selecione ou digite uma pasta válida', 'warning');
            return;
        }
        
        logUI('Saving download folder:', folderPath);
        
        // Verify path is valid
        const validateResponse = await fetch(`${DIRECTORIES_URL}/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: folderPath })
        });
        
        const validationResult = await validateResponse.json();
        
        if (!validationResult.valid && !validationResult.canCreate) {
            showAlert(`Caminho inválido: ${validationResult.error || 'pasta não pode ser criada'}`, 'danger');
            return;
        }
        
        // Ask for confirmation if folder doesn't exist
        if (!validationResult.valid && validationResult.canCreate) {
            if (!confirm(`A pasta "${folderPath}" não existe. Deseja criá-la?`)) {
                return;
            }
        }
        
        // Save folder - using POST method
        const saveResponse = await fetch(DOWNLOAD_FOLDER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder: folderPath })
        });
        
        if (!saveResponse.ok) {
            const errorData = await saveResponse.json();
            throw new Error(errorData.error || 'Erro ao salvar pasta de download');
        }
        
        const result = await saveResponse.json();
        logUI('Save result:', result);
        
        if (result.success) {
            showAlert('Pasta de downloads salva com sucesso!', 'success');
        }
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
        await loadDrives();
        await loadDirectories();
        folderBrowserModal.show();
    } catch (error) {
        console.error('Error opening folder browser:', error);
        showAlert('Erro ao abrir navegador de pastas', 'danger');
    }
}

// Carregar drives disponíveis
async function loadDrives() {
    try {
        const response = await fetch(`${DIRECTORIES_URL}/drives`);
        const drives = await response.json();
        
        drivesContainer.innerHTML = drives.map(drive => `
            <a href="#" class="list-group-item list-group-item-action drive-item" data-path="${drive.path}">
                <i class="bi bi-hdd-fill"></i> ${drive.name}
            </a>
        `).join('');
        
        // Adicionar eventos aos drives
        document.querySelectorAll('.drive-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const path = e.currentTarget.dataset.path;
                loadDirectories(path);
                
                // Remover classe active de todos os itens
                document.querySelectorAll('.drives-list .list-group-item').forEach(i => {
                    i.classList.remove('active');
                });
                
                // Adicionar classe active ao item clicado
                e.currentTarget.classList.add('active');
            });
        });
    } catch (error) {
        drivesContainer.innerHTML = `
            <div class="alert alert-danger">
                Erro ao carregar drives: ${error.message}
            </div>
        `;
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
        
        // Update path display
        currentPathDisplay.value = currentPath || "Selecione um drive...";
        
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

// Navegar para o diretório pai
function goUpDirectory() {
    if (!currentPath) return;
    
    // Separar o caminho usando / ou \
    const parts = currentPath.split(/[\/\\]/);
    
    // Remover o último diretório
    parts.pop();
    
    // Reconstruir o caminho
    const parentPath = parts.join('/');
    
    // Carregar o diretório pai
    loadDirectories(parentPath);
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

// Render anime list
async function renderAnimeList() {
    try {
        // Get animes from API
        const response = await fetch(ANIMES_URL);
        const data = await response.json();
        
        // Sort animes alphabetically by title
        data.sort((a, b) => {
            // Use displayTitle if available, otherwise use title
            const titleA = (a.displayTitle || a.title).toLowerCase();
            const titleB = (b.displayTitle || b.title).toLowerCase();
            return titleA.localeCompare(titleB);
        });
        
        animeList.innerHTML = '';
        
        if (data.length === 0) {
            animeList.innerHTML = '<div class="text-center mt-4"><p>Nenhum anime adicionado. Comece adicionando um anime!</p></div>';
            return;
        }

        // Create anime cards
        data.forEach(anime => {
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
                
            animeList.innerHTML += `
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
        });
        
        // Add event listeners
        document.querySelectorAll('[data-action]').forEach(button => {
            button.addEventListener('click', handleAnimeAction);
        });
    } catch (error) {
        console.error('Error rendering anime list:', error);
        showAlert('Erro ao carregar lista de animes', 'danger');
    }
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
    animeForm.reset();
    
    // Get hint elements
    const editModeHints = document.querySelectorAll('.edit-mode-hint');
    
    if (anime) {
        // When editing, fill in values
        animeIdInput.value = anime.id;
        animeTitleInput.value = anime.title;
        animeQualitySelect.value = anime.quality;
        animeStartEpisodeInput.value = anime.startEpisode;
        animeUrlInput.value = anime.animeUrl || '';
        
        // Disable title and URL fields when editing
        animeTitleInput.disabled = true;
        animeUrlInput.disabled = true;
        
        // Show hints when in edit mode
        editModeHints.forEach(hint => {
            hint.style.display = 'block';
        });
    } else {
        // When adding new, enable all fields
        animeTitleInput.disabled = false;
        animeUrlInput.disabled = false;
        
        // Hide hints when in add mode
        editModeHints.forEach(hint => {
            hint.style.display = 'none';
        });
    }
    
    animeModal.show();
}

// Add this validation function
function validateAnimeTitle(title) {
    const invalidChars = /[?:<>|\\/*"]/;
    return !invalidChars.test(title);
}

// Save anime
async function saveAnime() {
    try {
        const animeId = animeIdInput.value;
        const animeTitle = animeTitleInput.value.trim();
        const animeQuality = animeQualitySelect.value;
        const animeStartEpisode = parseInt(animeStartEpisodeInput.value) || 1;
        const animeUrl = animeUrlInput.value.trim();
        
        if (!animeTitle) {
            showAlert('Por favor, insira um título para o anime', 'warning');
            return;
        }
        
        // Validate the anime title before saving
        if (!validateAnimeTitle(animeTitle)) {
            showAlert('O título do anime não pode conter os caracteres: ? : < > | \\ / * " ', 'danger');
            return;
        }
        
        // Only check for duplicates when adding new anime, not when editing
        if (!isEditing) {
            // Verificar se o nome ou URL já existem no arquivo anime-list.txt
            const checkResponse = await fetch('/api/check-anime-duplicate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: animeTitle, url: animeUrl })
            });
            
            const checkResult = await checkResponse.json();
            
            if (checkResult.duplicate) {
                let message = 'Este anime já existe na lista: ';
                if (checkResult.duplicateType === 'title') {
                    message += `nome "${animeTitle}" já está cadastrado.`;
                } else if (checkResult.duplicateType === 'url') {
                    message += `URL já está cadastrada para "${checkResult.existingTitle}".`;
                }
                showAlert(message, 'warning');
                return;
            }
        }
        
        // Dados verificados, continuar com o salvamento
        const method = isEditing ? 'PUT' : 'POST';
        const url = isEditing ? `${ANIMES_URL}/${animeId}` : ANIMES_URL;
        
        // When editing, we only update quality and startEpisode
        const requestBody = isEditing ? {
            title: animeTitle, // Keep the same title
            quality: animeQuality,
            startEpisode: animeStartEpisode
            // URL is intentionally omitted to keep the existing one
        } : {
            title: animeTitle,
            quality: animeQuality,
            startEpisode: animeStartEpisode,
            animeUrl: animeUrl
        };
        
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Error saving anime');
        }
        
        // Atualiza a lista de animes
        await loadAnimes();
        animeModal.hide();
        
        // Mensagem de feedback
        showAlert(
            isEditing ? 'Anime atualizado com sucesso!' : 'Anime adicionado com sucesso!',
            'success'
        );
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
        console.log(`[FRONTEND] 🔍 Verificando episódios disponíveis para: ${anime.title}`);
        
        if (!anime.animeUrl) {
            console.log('[FRONTEND] ⚠️ Anime sem URL definida, solicitando confirmação do usuário');
            const confirmUrl = confirm("Este anime não tem URL definida. Recomendamos editar o anime e adicionar a URL antes de baixar. Deseja continuar mesmo assim?");
            if (!confirmUrl) {
                console.log('[FRONTEND] 🛑 Usuário optou por editar o anime em vez de continuar sem URL');
                openAnimeModal(anime); // Abrir modal para editar
                return;
            }
            console.log('[FRONTEND] ✓ Usuário optou por continuar sem URL definida');
        }
        
        // Salvar referência ao anime atual para ser usado após confirmação
        currentAnimeToDownload = anime;
        console.log('[FRONTEND] 📋 Preparando modal de confirmação de episódios');
        
        // Mostrar estado de carregamento no modal de confirmação
        confirmAnimeTitle.textContent = anime.displayTitle || anime.title;
        confirmAnimeQuality.textContent = anime.quality;
        confirmTotalEpisodes.textContent = "Carregando...";
        confirmDownloadedEpisodes.textContent = "Verificando...";
        confirmEpisodesList.innerHTML = `
            <li class="list-group-item text-center">
                <div class="spinner-border spinner-border-sm text-primary me-2" role="status">
                    <span class="visually-hidden">Carregando...</span>
                </div>
                Verificando episódios disponíveis...
            </li>
        `;
        confirmEpisodesCount.textContent = "0";
        
        // Mostrar modal de confirmação
        confirmEpisodesModal.show();
        console.log('[FRONTEND] 🔄 Solicitando informações sobre episódios ao servidor');
        
        // Buscar informações sobre episódios disponíveis e já baixados
        const response = await fetch(`${ANIMES_URL}/${anime.id}/check-episodes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: anime.title })
        });
        
        if (!response.ok) {
            const error = await response.json();
            console.log(`[FRONTEND] ❌ Erro ao verificar episódios: ${error.message || 'Erro desconhecido'}`);
            throw new Error(error.message || 'Erro ao verificar episódios');
        }
        
        const episodeData = await response.json();
        console.log('[FRONTEND] ✅ Dados de episódios recebidos:', episodeData);
        
        // Atualizar informações no modal
        confirmAnimeTitle.textContent = episodeData.animeTitle || anime.displayTitle || anime.title;
        confirmAnimeQuality.textContent = episodeData.quality || anime.quality;
        confirmTotalEpisodes.textContent = episodeData.totalEpisodes || 0;
        
        // Mostrar episódios já baixados
        if (episodeData.downloadedEpisodes && episodeData.downloadedEpisodes.length > 0) {
            console.log(`[FRONTEND] 📊 Episódios já baixados: ${episodeData.downloadedEpisodes.join(', ')}`);
            confirmDownloadedEpisodes.textContent = `Episódios já baixados: ${episodeData.downloadedEpisodes.join(', ')}`;
        } else {
            console.log('[FRONTEND] 📊 Nenhum episódio baixado anteriormente');
            confirmDownloadedEpisodes.textContent = "Nenhum episódio baixado ainda.";
        }
        
        // Mostrar lista de episódios a serem baixados
        if (episodeData.episodesToDownload && episodeData.episodesToDownload.length > 0) {
            console.log(`[FRONTEND] 📋 ${episodeData.episodesToDownload.length} episódios para baixar`);
            confirmEpisodesCount.textContent = episodeData.episodesToDownload.length;
            
            // Ordenar episódios por número
            episodeData.episodesToDownload.sort((a, b) => a.number - b.number);
            
            confirmEpisodesList.innerHTML = episodeData.episodesToDownload.map(episode => `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span>Episódio ${episode.number}</span>
                    <span class="badge bg-success">Novo</span>
                </li>
            `).join('');
            
            // Se não houver episódios para baixar, desabilitar botão de confirmação
            confirmDownloadBtn.disabled = episodeData.episodesToDownload.length === 0;
        } else {
            console.log('[FRONTEND] 📋 Nenhum episódio novo para baixar');
            confirmEpisodesCount.textContent = "0";
            confirmEpisodesList.innerHTML = `
                <li class="list-group-item text-center">
                    <i class="bi bi-check-circle-fill text-success me-2"></i>
                    Todos os episódios já foram baixados
                </li>
            `;
            confirmDownloadBtn.disabled = true;
        }
    } catch (error) {
        console.error(`[FRONTEND] ❌ Erro ao verificar episódios: ${error.message}`);
        confirmEpisodesModal.hide();
        showAlert(`Erro ao verificar episódios: ${error.message}`, 'danger');
    }
}

// Function to execute download after confirmation
async function executeDownloadAfterConfirmation() {
    try {
        // Verificar se temos um anime para baixar
        if (!currentAnimeToDownload) {
            console.error('[FRONTEND] ❌ Tentativa de download sem anime selecionado');
            showAlert('Erro: Nenhum anime selecionado para download', 'danger');
            confirmEpisodesModal.hide();
            return;
        }
        
        // Fechar o modal de confirmação
        confirmEpisodesModal.hide();
        
        console.log(`[FRONTEND] 🚀 Iniciando download para: ${currentAnimeToDownload.title}`);
        
        // Iniciar o download real
        const response = await fetch(`${ANIMES_URL}/${currentAnimeToDownload.id}/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: currentAnimeToDownload.title })
        });
        
        if (!response.ok) {
            const error = await response.json();
            console.error(`[FRONTEND] ❌ Erro ao iniciar download: ${error.message || 'Erro desconhecido'}`);
            throw new Error(error.message || 'Erro ao iniciar download');
        }
        
        const result = await response.json();
        console.log(`[FRONTEND] ✅ Download iniciado com sucesso: ${JSON.stringify(result)}`);
        
        showAlert(`Download iniciado para "${currentAnimeToDownload.displayTitle || currentAnimeToDownload.title}"`, 'success');
        
        // Abrir o popup de progresso imediatamente
        downloadProgressModal.show();
        console.log('[FRONTEND] 📊 Popup de progresso de download aberto');
        
        // Set initial progress state
        popupAnimeTitle.textContent = currentAnimeToDownload.displayTitle || currentAnimeToDownload.title;
        popupEpisodeInfo.textContent = 'Preparando download...';
        popupProgress.style.width = '0%';
        popupProgress.textContent = '0%';
        
        // Recarregar status imediatamente
        console.log('[FRONTEND] 🔄 Carregando status inicial de download');
        loadDownloadStatus();
        
        // Limpar a referência ao anime atual
        currentAnimeToDownload = null;
    } catch (error) {
        console.error(`[FRONTEND] ❌ Erro ao iniciar download: ${error.message}`);
        showAlert(`Erro ao iniciar download: ${error.message}`, 'danger');
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
        
        // Show download progress modal
        downloadProgressModal.show();
        
        // Initialize progress display for download all
        popupAnimeTitle.textContent = 'Download de Todos os Animes';
        popupEpisodeInfo.textContent = 'Preparando downloads...';
        popupProgress.style.width = '0%';
        popupProgress.setAttribute('aria-valuenow', 0);
        popupProgress.textContent = '0%';
        popupAnimeDetails.textContent = 'Iniciando processo de download...';
        
        // Immediately load download status to show queue
        await loadDownloadStatus();
        
    } catch (error) {
        console.error('Error starting download all:', error);
        showAlert(`Erro ao iniciar downloads: ${error.message}`, 'danger');
    }
}

// View anime episodes
async function viewAnimeEpisodes(anime) {
    try {
        // Ensure watched episodes are loaded
        await loadWatchedEpisodes();
        
        episodesModalTitle.textContent = `Episódios: ${anime.displayTitle || anime.title}`;
        episodesList.innerHTML = '<div class="text-center py-3"><div class="spinner-border" role="status"><span class="visually-hidden">Carregando...</span></div></div>';
        
        episodesModal.show();
        
        if (!anime.episodes || anime.episodes.length === 0) {
            episodesList.innerHTML = `
                <div class="alert alert-info">
                    Nenhum episódio baixado ainda. Inicie o download para ver os episódios.
                </div>
            `;
            return;
        }
        
        // Check if this anime has watched episodes data
        const animeWatchedEpisodes = watchedEpisodes[anime.id] || [];
        
        episodesList.innerHTML = anime.episodes
            .sort((a, b) => a.number - b.number)
            .map(episode => {
                const isWatched = animeWatchedEpisodes.includes(episode.number.toString());
                const watchedBtnClass = isWatched ? 'btn-success' : 'btn-outline-success';
                const watchedBtnIcon = isWatched ? 'eye-fill' : 'eye';
                const watchedBtnText = isWatched ? 'Visto' : 'Marcar';
                
                return `
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                        <div>
                            <span class="fw-bold">Episódio ${episode.number}</span>
                            <small class="text-muted ms-2">${episode.title || ''}</small>
                        </div>
                        <div>
                            <button class="btn ${watchedBtnClass} btn-sm me-2 watch-btn" 
                                    data-anime-id="${anime.id}" 
                                    data-episode="${episode.number}">
                                <i class="bi bi-${watchedBtnIcon}"></i> ${watchedBtnText}
                            </button>
                            <a href="${episode.url}" target="_blank" class="btn btn-primary btn-sm">
                                <i class="bi bi-play-fill"></i> Assistir
                            </a>
                        </div>
                    </li>
                `;
            }).join('');
        
        // Add event listeners to watched buttons
        document.querySelectorAll('.watch-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const animeId = e.currentTarget.dataset.animeId;
                const episodeNumber = e.currentTarget.dataset.episode;
                toggleWatchedStatus(animeId, episodeNumber, e.currentTarget);
            });
        });
        
    } catch (error) {
        console.error('Error viewing episodes:', error);
        showAlert('Erro ao carregar episódios', 'danger');
    }
}

// Create safe folder name (max 50 characters)
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
                safeFolderName: safeFolderName
            })
        });
        
        const result = await response.json();
        
        if (!response.ok || result.success === false) {
            throw new Error(result.message || 'Error opening folder');
        }
        
        // Não mostrar alerta para operação bem-sucedida
        console.log('Pasta aberta com sucesso');
    } catch (error) {
        console.error('Error opening anime folder:', error);
        showAlert(`Erro ao abrir pasta: ${error.message}`, 'danger');
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
        
        // Ocultar a barra de progresso principal sempre
        mainProgressCard.style.display = 'none';
        
        // Verificar se existe um download ativo
        if (status.current && (status.current.status === 'downloading' || status.current.status === 'downloading_episode')) {
            // Atualizar o popup com as informações de download
            popupAnimeTitle.textContent = status.current.displayName || status.current.name;
            
            // Configurar detalhes do episódio
            let episodeText = 'Preparando...';
            if (status.current.details && status.current.details.currentEpisode && status.current.details.episodeNumber) {
                episodeText = `Episódio ${status.current.details.episodeNumber} de ${status.current.details.totalEpisodes}`;
            }
            popupEpisodeInfo.textContent = episodeText;
            
            // Atualizar progresso do episódio atual
            let episodeProgress = 0;
            
            // Check for progress in multiple possible locations
            if (status.current.progress) {
                // Primary progress location
                episodeProgress = status.current.progress;
            } else if (status.current.details && status.current.details.downloadPercent) {
                // Secondary location 
                episodeProgress = status.current.details.downloadPercent;
            }
            
            popupProgress.style.width = `${episodeProgress}%`;
            popupProgress.setAttribute('aria-valuenow', episodeProgress);
            popupProgress.textContent = `${Math.round(episodeProgress)}%`;
            
            // Atualizar detalhes
            const details = [];
            if (episodeProgress > 0) {
                details.push(`${Math.round(episodeProgress)}% completo`);
            }
            
            if (status.current.details && status.current.details.speed) {
                details.push(`${status.current.details.speed}`);
            }
            
            if (status.current.details && status.current.details.eta) {
                details.push(`ETA: ${status.current.details.eta}`);
            }
            
            popupAnimeDetails.textContent = details.join(' • ');
            
            // Mostrar o popup se ainda não estiver visível
            downloadProgressModal.show();
            
            // Atualizar a fila de downloads no popup
            updateDownloadQueuePopup(status);
        } else if (status.current && status.current.status === 'completed') {
            // If download just completed, show 100% before closing
            popupProgress.style.width = '100%';
            popupProgress.setAttribute('aria-valuenow', 100);
            popupProgress.textContent = '100%';
            
            // Add a small delay before hiding the modal when download completes
            setTimeout(() => {
                downloadProgressModal.hide();
            }, 1500);
            
            // Clear the current download after showing completion
            status.current = null;
        } else {
            // Hide modal if no active download
            downloadProgressModal.hide();
        }
        
    } catch (error) {
        console.error('Error loading download status:', error);
    }
}

// Função para atualizar a fila de downloads no popup
function updateDownloadQueuePopup(status) {
    if (!status || !status.queue) {
        popupQueueList.innerHTML = '<li class="list-group-item">Nenhum episódio na fila</li>';
        popupQueueCount.textContent = '0';
        return;
    }
    
    // Atualizar contagem de animes na fila
    popupQueueCount.textContent = status.queue.length;
    
    // Mostrar os animes em espera com detalhes dos episódios
    if (status.queue.length === 0) {
        popupQueueList.innerHTML = '<li class="list-group-item">Nenhum anime na fila</li>';
    } else {
        popupQueueList.innerHTML = status.queue.map(item => {
            const animeTitle = item.displayName || item.name || 'Desconhecido';
            let episodeInfo = '';
            
            // Verificar se há informações de episódios específicos
            if (item.episodes && Array.isArray(item.episodes)) {
                // Se há uma lista de episódios, exibir o primeiro e o último
                const totalEpisodes = item.episodes.length;
                
                if (totalEpisodes > 0) {
                    // Ordenar episódios por número
                    const sortedEpisodes = [...item.episodes].sort((a, b) => a.number - b.number);
                    const firstEpisode = sortedEpisodes[0]?.number || item.startEpisode || '?';
                    const lastEpisode = sortedEpisodes[totalEpisodes-1]?.number || firstEpisode;
                    
                    if (totalEpisodes === 1) {
                        episodeInfo = `Episódio ${firstEpisode}`;
                    } else if (totalEpisodes > 1) {
                        episodeInfo = `${totalEpisodes} episódios (${firstEpisode} a ${lastEpisode})`;
                    }
                } else {
                    episodeInfo = `A partir do episódio ${item.startEpisode || 1}`;
                }
            } else if (item.totalEpisodes) {
                // Se temos informação do total de episódios
                episodeInfo = `${item.totalEpisodes} episódios`;
            } else if (item.startEpisode) {
                // Se só temos episódio inicial
                episodeInfo = `A partir do episódio ${item.startEpisode}`;
            } else {
                episodeInfo = 'Todos os episódios';
            }
            
            // Adicionar informação de qualidade, se disponível
            if (item.quality) {
                episodeInfo += ` [${item.quality}]`;
            }
            
            return `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        <span class="fw-bold">${animeTitle}</span>
                        <br>
                        <small class="text-muted">${episodeInfo}</small>
                    </div>
                    <span class="badge bg-primary rounded-pill">Em espera</span>
                </li>
            `;
        }).join('');
    }
}

// Função para cancelar o download atual
async function cancelCurrentDownload() {
    try {
        // Primeiro, resetar o status e a percentagem
        const resetStatus = {
            status: 'idle',
            currentAnime: null,
            currentEpisode: null,
            progress: 0,
            queue: [],
            completed: [],
            lastUpdated: new Date().toISOString()
        };
        
        // Atualizar o status no servidor
        await fetch(`${DOWNLOAD_STATUS_URL}/reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(resetStatus)
        });
        
        // Agora parar o download
        const response = await fetch(`${API_URL}/cancel-download`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error('Falha ao cancelar download');
        }
        
        showAlert('Download cancelado com sucesso', 'info');
        
        // Fechar o modal de progresso
        downloadProgressModal.hide();
        
        // Atualizar UI para refletir o status
        loadDownloadStatus();
    } catch (error) {
        console.error('Erro ao cancelar download:', error);
        showAlert(`Erro ao cancelar download: ${error.message}`, 'danger');
    }
}

// Add a function to check server and reconnect
function checkServerAndReconnect(attempts = 1) {
    if (attempts > 20) { // Maximum 20 attempts (1 minute)
        showAlert('Não foi possível reconectar ao servidor. Por favor, recarregue a página.', 'danger');
        return;
    }
    
    // Try to fetch status to check if server is back
    fetch(`${API_URL}/status`, { method: 'GET' })
        .then(response => {
            if (response.ok) {
                showAlert('Servidor reiniciado com sucesso! Reconectado.', 'success');
                loadAnimes(); // Reload animes
                loadDownloadStatus(); // Reload download status
            } else {
                // Try again after 3 seconds
                setTimeout(() => checkServerAndReconnect(attempts + 1), 3000);
            }
        })
        .catch(() => {
            // Server not ready yet, try again
            setTimeout(() => checkServerAndReconnect(attempts + 1), 3000);
        });
}

// Load watched episodes
async function loadWatchedEpisodes() {
    try {
        const response = await fetch(`${API_URL}/watched-episodes`);
        watchedEpisodes = await response.json();
    } catch (error) {
        console.error('Error loading watched episodes:', error);
    }
}

// Toggle episode watched status
async function toggleWatchedStatus(animeId, episodeNumber, button) {
    try {
        const isWatched = button.classList.contains('btn-success');
        const method = isWatched ? 'DELETE' : 'POST';
        
        const response = await fetch(`${API_URL}/anime/${animeId}/episode/${episodeNumber}/watch`, {
            method: method
        });
        
        if (response.ok) {
            // Update button appearance
            if (isWatched) {
                button.classList.remove('btn-success');
                button.classList.add('btn-outline-success');
                button.innerHTML = '<i class="bi bi-eye"></i> Marcar';
                
                // Update local cache
                if (watchedEpisodes[animeId]) {
                    watchedEpisodes[animeId] = watchedEpisodes[animeId].filter(ep => ep !== episodeNumber);
                }
            } else {
                button.classList.remove('btn-outline-success');
                button.classList.add('btn-success');
                button.innerHTML = '<i class="bi bi-eye-fill"></i> Visto';
                
                // Update local cache
                if (!watchedEpisodes[animeId]) {
                    watchedEpisodes[animeId] = [];
                }
                if (!watchedEpisodes[animeId].includes(episodeNumber)) {
                    watchedEpisodes[animeId].push(episodeNumber);
                }
            }
        }
    } catch (error) {
        console.error('Error toggling watched status:', error);
        showAlert('Erro ao atualizar status do episódio', 'danger');
    }
}

// Fix the showAlert function to ensure alerts are visible
function showAlert(message, type = 'info') {
    console.log(`Showing alert: ${message} (${type})`); // Debug log
    
    // Get or create the alerts container
    let alertsContainer = document.getElementById('alerts-container');
    if (!alertsContainer) {
        alertsContainer = document.createElement('div');
        alertsContainer.id = 'alerts-container';
        alertsContainer.className = 'position-fixed top-0 start-50 translate-middle-x mt-3 z-index-9999';
        document.body.appendChild(alertsContainer);
    }
    
    // Create the alert element
    const alertElement = document.createElement('div');
    alertElement.className = `alert alert-${type} alert-dismissible fade show`;
    alertElement.setAttribute('role', 'alert');
    alertElement.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    // Add the alert to the container
    alertsContainer.appendChild(alertElement);
    
    // Force a layout reflow to ensure the transition works
    alertElement.offsetHeight;
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        try {
            if (alertElement && alertElement.parentNode) {
                // Try using Bootstrap's API if available
                if (typeof bootstrap !== 'undefined' && bootstrap.Alert) {
                    const bsAlert = new bootstrap.Alert(alertElement);
                    bsAlert.close();
                } else {
                    // Manual removal fallback
                    alertElement.classList.remove('show');
                    setTimeout(() => {
                        if (alertElement.parentNode) {
                            alertElement.parentNode.removeChild(alertElement);
                        }
                    }, 150);
                }
            }
        } catch (e) {
            console.error('Error dismissing alert:', e);
        }
    }, 5000);
}

// Add this function to load and display featured animes
async function loadFeaturedAnimes() {
    try {
        const response = await fetch('/api/featured-animes');
        if (!response.ok) {
            throw new Error('Failed to fetch featured animes');
        }
        
        const featuredAnimes = await response.json();
        const container = document.getElementById('featured-animes-container');
        
        if (!container) return;
        
        if (featuredAnimes.length === 0) {
            container.innerHTML = '<p class="text-center">Nenhum anime em destaque disponível no momento.</p>';
            return;
        }
        
        let html = '<div class="row">';
        
        featuredAnimes.forEach(anime => {
            const title = anime.title;
            const imageUrl = anime.imageUrl;
            const link = anime.link;
            const rating = anime.rating || 'N/A';
            const ageRating = anime.ageRating || '';
            
            const ageRatingBadge = ageRating ? 
                `<span class="badge ${ageRating === 'L' ? 'bg-success' : ageRating === 'A18' ? 'bg-dark' : 'bg-warning'} featured-age-rating">${ageRating}</span>` : '';
            
            html += `
                <div class="col-6 col-md-4 col-lg-3 mb-4">
                    <div class="card featured-anime-card" data-title="${title}" data-url="${link}">
                        <div class="featured-anime-img-container">
                            <img src="${imageUrl}" class="card-img-top featured-anime-img" alt="${title}">
                            ${ageRatingBadge}
                            <div class="featured-anime-overlay">
                                <h5 class="featured-anime-title">${title}</h5>
                                <div class="featured-anime-rating">
                                    <i class="bi bi-star-fill"></i> ${rating}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
        
        // Add event listeners to the cards
        document.querySelectorAll('.featured-anime-card').forEach(card => {
            card.addEventListener('click', showFeaturedAnimeOptions);
        });
    } catch (error) {
        console.error('Error loading featured animes:', error);
        document.getElementById('featured-animes-container').innerHTML = 
            '<div class="alert alert-danger">Erro ao carregar animes em destaque.</div>';
    }
}

// Function to show options when a featured anime card is clicked
function showFeaturedAnimeOptions(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const card = event.currentTarget;
    const title = card.dataset.title;
    const url = card.dataset.url;
    
    // Create and position the options menu
    const optionsMenu = document.createElement('div');
    optionsMenu.className = 'featured-anime-options-menu';
    optionsMenu.innerHTML = `
        <div class="card">
            <div class="card-header bg-primary text-white">
                <h5 class="mb-0">${title}</h5>
            </div>
            <div class="card-body">
                <div class="d-grid gap-2">
                    <button class="btn btn-outline-primary btn-open-link">
                        <i class="bi bi-box-arrow-up-right"></i> Abrir Link
                    </button>
                    <button class="btn btn-success btn-add-anime">
                        <i class="bi bi-plus-circle"></i> Adicionar Anime
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Position near the clicked card
    const rect = card.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;
    
    optionsMenu.style.position = 'absolute';
    optionsMenu.style.top = `${rect.top + scrollTop - 10}px`;
    optionsMenu.style.left = `${rect.left + scrollLeft + rect.width/2}px`;
    optionsMenu.style.transform = 'translateX(-50%)';
    optionsMenu.style.zIndex = '1050';
    
    // Add backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'featured-anime-backdrop';
    document.body.appendChild(backdrop);
    
    // Add menu to body
    document.body.appendChild(optionsMenu);
    
    // Add event listeners
    optionsMenu.querySelector('.btn-open-link').addEventListener('click', () => {
        window.open(url, '_blank');
        removeOptionsMenu();
    });
    
    optionsMenu.querySelector('.btn-add-anime').addEventListener('click', () => {
        // Pre-fill the anime add modal with details
        addFeaturedAnimeToList(title, url);
        removeOptionsMenu();
    });
    
    backdrop.addEventListener('click', removeOptionsMenu);
    
    // Function to remove the menu
    function removeOptionsMenu() {
        document.body.removeChild(optionsMenu);
        document.body.removeChild(backdrop);
    }
}

// Function to add a featured anime to the list
function addFeaturedAnimeToList(title, url) {
    // Open the add anime modal with pre-filled data
    isEditing = false;
    animeModalTitle.textContent = 'Adicionar Anime';
    animeForm.reset();
    
    // Format title: replace special characters and spaces with hyphens
    const formattedTitle = title
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');
    
    animeIdInput.value = '';
    animeTitleInput.value = formattedTitle;
    animeUrlInput.value = url;
    
    // Enable fields for new anime
    animeTitleInput.disabled = false;
    animeUrlInput.disabled = false;
    
    // Hide edit mode hints
    document.querySelectorAll('.edit-mode-hint').forEach(hint => {
        hint.style.display = 'none';
    });
    
    // Open the modal
    animeModal.show();
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    loadAnimes();
    loadConfig();
    loadDownloadStatus(); // Verificar status de download no carregamento inicial
    loadWatchedEpisodes();
    
    addAnimeBtn.addEventListener('click', () => openAnimeModal());
    downloadAllBtn.addEventListener('click', startDownloadAll);
    saveAnimeBtn.addEventListener('click', saveAnime);
    settingsForm.addEventListener('submit', saveSettings);
    
    browseFolderBtn.addEventListener('click', openFolderBrowser);
    saveFolderBtn.addEventListener('click', saveDownloadFolder);
    selectFolderBtn.addEventListener('click', selectFolder);
    goUpDirectoryBtn.addEventListener('click', goUpDirectory);
    
    cancelDownloadBtn.addEventListener('click', cancelCurrentDownload);
    
    // Adicionar evento para o botão de cancelar no popup
    popupCancelDownloadBtn.addEventListener('click', cancelCurrentDownload);
    
    // Adicionar evento para o botão de confirmar download
    confirmDownloadBtn.addEventListener('click', executeDownloadAfterConfirmation);
    
    // Add toggle functionality for featured animes section
    const toggleFeaturedBtn = document.getElementById('toggle-featured-animes');
    const featuredSection = document.getElementById('featured-animes');
    const toggleIcon = document.getElementById('toggle-icon');
    
    if (toggleFeaturedBtn) {
        toggleFeaturedBtn.addEventListener('click', () => {
            const isVisible = featuredSection.style.display !== 'none';
            featuredSection.style.display = isVisible ? 'none' : 'block';
            toggleIcon.className = isVisible ? 'bi bi-chevron-down' : 'bi bi-chevron-up';
            toggleFeaturedBtn.innerHTML = isVisible ? 
                '<i class="bi bi-chevron-down"></i> Mostrar' : 
                '<i class="bi bi-chevron-up"></i> Esconder';
        });
    }

    // Add real-time validation for the anime title input
    animeTitleInput.addEventListener('input', function() {
        const invalidChars = /[?:<>|\\/*"]/;
        const titleValue = this.value;
        
        if (invalidChars.test(titleValue)) {
            this.classList.add('is-invalid');
            
            // Find or create validation feedback element
            let feedbackElement = this.nextElementSibling;
            if (!feedbackElement || !feedbackElement.classList.contains('invalid-feedback')) {
                feedbackElement = document.createElement('div');
                feedbackElement.className = 'invalid-feedback';
                this.parentNode.insertBefore(feedbackElement, this.nextSibling);
            }
            
            feedbackElement.textContent = 'O título não pode conter os caracteres: ? : < > | \\ / * " ';
            
            // Disable the save button
            saveAnimeBtn.disabled = true;
        } else {
            this.classList.remove('is-invalid');
            
            // Find and remove validation feedback if it exists
            const feedbackElement = this.nextElementSibling;
            if (feedbackElement && feedbackElement.classList.contains('invalid-feedback')) {
                feedbackElement.remove();
            }
            
            // Enable the save button
            saveAnimeBtn.disabled = false;
        }
    });
    
    // Configurar intervalo para verificar o status na tela principal
    homeRefreshInterval = setInterval(loadDownloadStatus, 3000);
    
    // Load featured animes
    loadFeaturedAnimes();
    
    // Add event listener for featured animes navigation link
    const featuredAnimeNavLink = document.querySelector('.nav-featured');
    if (featuredAnimeNavLink) {
        featuredAnimeNavLink.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('featured-animes').scrollIntoView({
                behavior: 'smooth'
            });
        });
    }
    
    // Add additional initialization for settings link
    const settingsLinkEl = document.getElementById('settings-link');
    if (settingsLinkEl) {
        settingsLinkEl.addEventListener('click', (e) => {
            e.preventDefault();
            switchToSettingsView();
        });
    } else {
        console.error('Settings link element not found!');
    }
});
