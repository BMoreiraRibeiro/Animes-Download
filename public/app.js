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

// State
let animes = [];
let config = {};
let isEditing = false;
let currentPath = "";
let homeRefreshInterval = null;

// Navigation
homeLink.addEventListener('click', (e) => {
    e.preventDefault();
    homeView.style.display = 'block';
    settingsView.style.display = 'none';
    homeLink.classList.add('active');
    settingsLink.classList.remove('active');
    
    // Carregar status inicial para a tela principal
    loadDownloadStatus();
    
    // Configurar atualização periódica para a tela principal
    if (homeRefreshInterval) {
        clearInterval(homeRefreshInterval);
    }
    homeRefreshInterval = setInterval(loadDownloadStatus, 3000); // Atualizar a cada 3 segundos
});

settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    homeView.style.display = 'none';
    settingsView.style.display = 'block';
    homeLink.classList.remove('active');
    settingsLink.classList.add('active');
    loadConfig();
    loadDownloadFolder();
    
    // Parar atualização periódica da tela principal
    if (homeRefreshInterval) {
        clearInterval(homeRefreshInterval);
        homeRefreshInterval = null;
    }
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
        // Verificar se o anime tem uma URL direta registrada
        const anime = animes.find(a => a.title === animeTitle);
        let requestUrl = `${API_URL}/search-image?title=${encodeURIComponent(animeTitle)}`;
        
        // SEMPRE incluir URL direta na requisição se disponível
        if (anime && anime.animeUrl) {
            requestUrl += `&url=${encodeURIComponent(anime.animeUrl)}`;
            console.log(`Usando URL direta para buscar imagem do anime: ${anime.animeUrl}`);
        } else {
            console.log(`Aviso: Nenhuma URL direta disponível para o anime "${animeTitle}"`);
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
        downloadFolderInput.value = data.folder;
    } catch (error) {
        console.error('Error loading download folder:', error);
        showAlert('Erro ao carregar pasta de download', 'danger');
    }
}

// Save download folder
async function saveDownloadFolder() {
    try {
        // Obter o caminho do input, permitindo que o usuário tenha editado manualmente
        const folderPath = downloadFolderInput.value.trim();
        
        if (!folderPath) {
            showAlert('Por favor, selecione ou digite uma pasta válida', 'warning');
            return;
        }
        
        // Verificar se o caminho é válido antes de salvar
        const response = await fetch(`${DIRECTORIES_URL}/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: folderPath })
        });
        
        const result = await response.json();
        
        if (!result.valid) {
            // Se o caminho não existir mas puder ser criado
            if (result.canCreate) {
                if (confirm(`A pasta "${folderPath}" não existe. Deseja criá-la?`)) {
                    // Tentar criar a pasta
                    const createResponse = await fetch(`${DIRECTORIES_URL}/validate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            path: folderPath,
                            createIfNotExists: true
                        })
                    });
                    
                    const createResult = await createResponse.json();
                    
                    if (!createResult.valid) {
                        showAlert(`Erro ao criar pasta: ${createResult.error}`, 'danger');
                        return;
                    }
                    
                    // Pasta criada com sucesso, continuar com o salvamento
                } else {
                    // Usuário optou por não criar a pasta
                    return;
                }
            } else {
                // Erro diferente de "pasta não existe"
                showAlert(`Caminho inválido: ${result.error}`, 'danger');
                return;
            }
        }
        
        // Salvar o caminho validado
        const saveResponse = await fetch(CONFIG_URL + '/download-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder: folderPath })
        });
        
        if (!saveResponse.ok) {
            const error = await saveResponse.json();
            throw new Error(error.message || 'Erro ao salvar pasta de download');
        }
        
        showAlert('Pasta de downloads salva com sucesso!', 'success');
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
        
        // Dados verificados, continuar com o salvamento
        const method = isEditing ? 'PUT' : 'POST';
        const url = isEditing ? `${ANIMES_URL}/${animeId}` : ANIMES_URL;
        
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: animeTitle,
                quality: animeQuality,
                startEpisode: animeStartEpisode,
                animeUrl: animeUrl
            })
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
        console.log(`Iniciando download para: ${anime.title}`);
        
        if (!anime.animeUrl) {
            const confirmUrl = confirm("Este anime não tem URL definida. Recomendamos editar o anime e adicionar a URL antes de baixar. Deseja continuar mesmo assim?");
            if (!confirmUrl) {
                openAnimeModal(anime); // Abrir modal para editar
                return;
            }
        }
        
        const response = await fetch(`${ANIMES_URL}/${anime.id}/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: anime.title })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Erro ao iniciar download');
        }
        
        const result = await response.json();
        showAlert(`Download iniciado para "${anime.displayTitle || anime.title}"`, 'success');
        
        // Recarregar status imediatamente
        loadDownloadStatus();
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
            // Exibir barra de progresso apenas na tela principal
            mainProgressCard.style.display = 'block';
            
            // Substituir hífens por espaços no nome do anime sendo baixado
            const animeTitle = status.current.name.replace(/-/g, ' ');
            mainAnimeTitle.textContent = animeTitle;
            
            // Atualizar barra de progresso
            const progress = status.current.progress || 0;
            mainProgress.style.width = `${progress}%`;
            mainProgress.textContent = `${progress}%`;
            mainProgress.setAttribute('aria-valuenow', progress);
            
            // Detalhes específicos baseados no status
            let detailsText = `Status: ${formatStatusText(status.current.status)}`;
            
            if (status.current.details) {
                const details = status.current.details;
                
                if (details.totalEpisodes) {
                    detailsText += `, Progresso: ${details.currentEpisode || 0}/${details.totalEpisodes} episódios`;
                    
                    // Adicionar informação do episódio atual na tela principal
                    if (details.episodeNumber) {
                        mainEpisodeInfo.textContent = `Episódio: ${details.episodeNumber}`;
                    }
                    
                    // Adicionar informação de porcentagem de download do episódio atual
                    if (details.downloadPercent !== undefined) {
                        detailsText += `, Episódio atual: ${details.downloadPercent}%`;
                        
                        // Na tela principal, mostrar o progresso do episódio atual na barra
                        // para feedback visual mais responsivo
                        if (details.downloadPercent > 0) {
                            mainProgress.style.width = `${details.downloadPercent}%`;
                            mainProgress.textContent = `${details.downloadPercent}%`;
                            mainProgress.setAttribute('aria-valuenow', details.downloadPercent);
                        }
                    }
                }
            }
            
            mainAnimeDetails.textContent = detailsText;
            
            // Atualizar apenas informações relevantes para a interface principal
            updateDownloadQueue(status);
            
        } else {
            // Sem download em andamento, ocultar o card na tela principal
            mainProgressCard.style.display = 'none';
            
            // Atualizar apenas informações relevantes para a interface principal
            updateDownloadQueue(status);
        }
    } catch (error) {
        console.error('Error loading download status:', error);
    }
}

// Atualizar fila de downloads
function updateDownloadQueue(status) {
    // Exibir alerta se não houver downloads
    if ((!status.current) && (!status.queue || status.queue.length === 0)) {
        noDownloadsAlert.style.display = 'block';
    } else {
        noDownloadsAlert.style.display = 'none';
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

// Função para cancelar o download atual
async function cancelCurrentDownload() {
    if (!confirm('Tem certeza que deseja cancelar o download atual?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/cancel-download`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Erro ao cancelar download');
        }
        
        const result = await response.json();
        showAlert(result.message, 'info');
        
        // Atualizar o status imediatamente para refletir o cancelamento
        loadDownloadStatus();
    } catch (error) {
        console.error('Erro ao cancelar download:', error);
        showAlert(`Erro ao cancelar download: ${error.message}`, 'danger');
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    loadAnimes();
    loadConfig();
    loadDownloadStatus(); // Verificar status de download no carregamento inicial
    
    addAnimeBtn.addEventListener('click', () => openAnimeModal());
    downloadAllBtn.addEventListener('click', startDownloadAll);
    saveAnimeBtn.addEventListener('click', saveAnime);
    settingsForm.addEventListener('submit', saveSettings);
    
    browseFolderBtn.addEventListener('click', openFolderBrowser);
    saveFolderBtn.addEventListener('click', saveDownloadFolder);
    selectFolderBtn.addEventListener('click', selectFolder);
    goUpDirectoryBtn.addEventListener('click', goUpDirectory);
    
    cancelDownloadBtn.addEventListener('click', cancelCurrentDownload);
    
    // Configurar intervalo para verificar o status na tela principal
    homeRefreshInterval = setInterval(loadDownloadStatus, 3000);
});
