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
const selectAllBtn = document.getElementById('select-all-btn');
const archiveSelectedBtn = document.getElementById('archive-selected-btn');
const archiveLink = document.getElementById('archive-link');
const backToHomeBtn = document.getElementById('back-to-home-btn');
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

// Download modal elements (confirm settings before starting)
const downloadModal = new bootstrap.Modal(document.getElementById('download-modal'));
const downloadAnimeIdInput = document.getElementById('download-anime-id');
const downloadAnimeTitle = document.getElementById('download-anime-title');
const downloadQualitySelect = document.getElementById('download-quality');
const downloadStartEpisodeInput = document.getElementById('download-start-episode');
const confirmDownloadBtn = document.getElementById('confirm-download-btn');

// Progress modal elements
const progressModalEl = document.getElementById('download-progress-modal');
const progressModal = new bootstrap.Modal(progressModalEl);
const modalCurrentTitle = document.getElementById('modal-current-download-title');
const modalCurrentProgress = document.getElementById('modal-current-progress');
const modalCurrentDetails = document.getElementById('modal-current-details');
const modalQueueList = document.getElementById('modal-queue-list');

let modalStatusInterval = null;
let globalStatusInterval = null;

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

const archivedView = document.getElementById('archived-view');
const archivedList = document.getElementById('archived-list');
const cancelDownloadBtn = document.getElementById('cancel-download-btn');
const cancelDownloadStatusBtn = document.getElementById('cancel-download-status-btn');

// State
let animes = [];
let config = {};
let isEditing = false;
let currentPath = "";
let statusRefreshInterval = null;
// Selected anime titles (storage titles) for checkboxes
let selectedAnimes = new Set();
let currentDownloadingAnime = null; // Track the anime currently being downloaded

// ========== Toast Functions ==========
function showToast(message, type = 'info', title = 'Notificação') {
    const toastContainer = document.querySelector('.toast-container');
    
    // Criar um novo toast
    const toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'assertive');
    toastEl.setAttribute('aria-atomic', 'true');
    
    // Definir ícone e cor com base no tipo
    let icon = 'bi-info-circle-fill';
    let bgClass = 'bg-info';
    
    if (type === 'success') {
        icon = 'bi-check-circle-fill';
        bgClass = 'bg-success';
    } else if (type === 'error' || type === 'danger') {
        icon = 'bi-exclamation-triangle-fill';
        bgClass = 'bg-danger';
    } else if (type === 'warning') {
        icon = 'bi-exclamation-circle-fill';
        bgClass = 'bg-warning';
    }
    
    toastEl.innerHTML = `
        <div class="toast-header ${bgClass} text-white">
            <i class="${icon} me-2"></i>
            <strong class="me-auto">${title}</strong>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
        <div class="toast-body">${message}</div>
    `;
    
    toastContainer.appendChild(toastEl);
    
    const toast = new bootstrap.Toast(toastEl, { autohide: true, delay: 5000 });
    toast.show();
    
    // Remover do DOM após esconder
    toastEl.addEventListener('hidden.bs.toast', () => {
        toastEl.remove();
    });
}

// Função para criar modal de confirmação customizado
function showConfirmDialog(message, title = 'Confirmação') {
    return new Promise((resolve) => {
        // Criar modal dinamicamente
        const modalId = 'confirm-modal-' + Date.now();
        const modalHTML = `
            <div class="modal fade" id="${modalId}" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">${title}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p>${message}</p>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                            <button type="button" class="btn btn-primary confirm-btn">Confirmar</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const modalEl = document.getElementById(modalId);
        const modal = new bootstrap.Modal(modalEl);
        
        modalEl.querySelector('.confirm-btn').addEventListener('click', () => {
            modal.hide();
            resolve(true);
        });
        
        modalEl.addEventListener('hidden.bs.modal', () => {
            if (modalEl.classList.contains('show')) return;
            modalEl.remove();
            resolve(false);
        });
        
        modal.show();
    });
}

// ========== Cancel Download Function ==========
async function cancelDownload() {
    if (!currentDownloadingAnime) {
        showToast('Nenhum download em andamento para cancelar.', 'warning', 'Aviso');
        return;
    }
    
    const confirmed = await showConfirmDialog(
        `Tem certeza que deseja cancelar o download de "${currentDownloadingAnime.replace(/-/g, ' ')}"?`,
        'Cancelar Download'
    );
    
    if (!confirmed) return;
    
    try {
        const response = await fetch('/api/cancel-download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ animeTitle: currentDownloadingAnime })
        });
        
        if (response.ok) {
            const result = await response.json();
            showToast(result.message, 'success', 'Download Cancelado');
            currentDownloadingAnime = null;
        } else {
            const error = await response.json();
            showToast(error.message || 'Erro ao cancelar download', 'danger', 'Erro');
        }
    } catch (err) {
        console.error('Erro ao cancelar download:', err);
        showToast('Erro ao cancelar download', 'danger', 'Erro');
    }
}

// Navigation
homeLink.addEventListener('click', (e) => {
    e.preventDefault();
    homeView.style.display = 'block';
    settingsView.style.display = 'none';
    statusView.style.display = 'none';
    homeLink.classList.add('active');
    settingsLink.classList.remove('active');
    statusLink.classList.remove('active');
    archiveLink.classList.remove('active');
});

settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    homeView.style.display = 'none';
    settingsView.style.display = 'block';
    statusView.style.display = 'none';
    homeLink.classList.remove('active');
    settingsLink.classList.add('active');
    statusLink.classList.remove('active');
    archiveLink.classList.remove('active');
    loadConfig();
    loadDownloadFolder();
});

// Archive nav
archiveLink.addEventListener('click', (e) => {
    e.preventDefault();
    homeView.style.display = 'none';
    settingsView.style.display = 'none';
    statusView.style.display = 'none';
    archivedView.style.display = 'block';
    homeLink.classList.remove('active');
    settingsLink.classList.remove('active');
    statusLink.classList.remove('active');
    archiveLink.classList.add('active');

    loadArchived();
});

backToHomeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    archivedView.style.display = 'none';
    homeView.style.display = 'block';
    archiveLink.classList.remove('active');
    homeLink.classList.add('active');
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
        // Add cache-busting to ensure fresh data after archiving
        const response = await fetch(`${ANIMES_URL}?t=${Date.now()}`, {
            cache: 'no-store'
        });
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

// Load top10 / destaques from server
// Função genérica para carregar listas de animes
async function loadAnimeList(endpoint, listElementId, limit = 12) {
    const listElement = document.getElementById(listElementId);
    try {
        const response = await fetch(`${API_URL}/${endpoint}`);
        if (!response.ok) throw new Error(`Erro ao carregar ${endpoint}`);
        const items = await response.json();

        if (!Array.isArray(items) || items.length === 0) {
            listElement.innerHTML = `
                <div class="col-12"><div class="alert alert-info">Nenhum anime disponível.</div></div>
            `;
            return;
        }

        listElement.innerHTML = items.slice(0, limit).map((item, index) => {
            const title = item.displayTitle || item.title || '';
            const image = item.imageUrl ?
                `<div class="anime-card-img" style="background-image: url('${item.imageUrl}')">
                    <div class="anime-card-img-title">${title}</div>
                </div>` :
                `<div class="anime-card-img-placeholder"><div>${title}</div></div>`;

            const linkBtn = item.url ? `<a href="${item.url}" target="_blank" class="btn btn-sm btn-outline-primary">Ver</a>` : '';
            
            // Adicionar badge de ranking para Top 10
            const rankBadge = item.rank ? `<span class="badge bg-warning text-dark position-absolute" style="top: 5px; left: 5px; font-size: 1.1rem;">#${item.rank}</span>` : '';
            
            // Adicionar rating se disponível
            const ratingBadge = item.rating ? `<span class="badge bg-info position-absolute" style="top: 5px; right: 5px;">${item.rating}</span>` : '';

            return `
                <div class="col-6 col-md-4 col-lg-3 col-xl-2 mb-3">
                    <div class="card h-100 position-relative">
                        ${rankBadge}
                        ${ratingBadge}
                        ${image}
                        <div class="card-body p-2">
                            <h6 class="card-title mb-2 text-truncate" title="${title}">${title}</h6>
                            <div class="d-flex justify-content-between gap-1">
                                ${linkBtn}
                                <button class="btn btn-sm btn-success" data-action="add-featured" data-title="${title}" data-url="${item.url || ''}">Adicionar</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Hook add buttons
        listElement.querySelectorAll('[data-action="add-featured"]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const title = btn.getAttribute('data-title');
                const url = btn.getAttribute('data-url');
                if (!url) {
                    showToast('URL do anime não disponível', 'warning', 'Aviso');
                    return;
                }
                // Passar título e URL pré-preenchidos
                openAnimeModal(null, url, title);
            });
        });
    } catch (err) {
        console.error(`Erro ao carregar ${endpoint}:`, err);
        listElement.innerHTML = `
            <div class="col-12"><div class="alert alert-danger">Erro ao carregar lista: ${err.message}</div></div>
        `;
    }
}

async function loadTop10() {
    await loadAnimeList('top10', 'top10-list', 10);
}

async function loadFeatured() {
    await loadAnimeList('featured', 'featured-list', 12);
}

async function loadLatest() {
    await loadAnimeList('latest', 'latest-list', 12);
}

// Select all toggle
if (selectAllBtn) {
    selectAllBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const checkboxes = document.querySelectorAll('.anime-select-checkbox');
        const anyUnchecked = Array.from(checkboxes).some(cb => !cb.checked);
        checkboxes.forEach(cb => {
            cb.checked = anyUnchecked;
            const id = cb.dataset.id;
            if (anyUnchecked) selectedAnimes.add(id); else selectedAnimes.delete(id);
        });
        selectAllBtn.textContent = anyUnchecked ? 'Desmarcar Tudo' : 'Selecionar Tudo';
    });
}

// Archive selected
if (archiveSelectedBtn) {
    archiveSelectedBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        // Get the currently checked checkboxes (fresh from the DOM)
        const checked = Array.from(document.querySelectorAll('.anime-select-checkbox:checked'));
        // Extract ids from dataset
        const ids = checked.map(cb => cb.dataset.id).filter(Boolean);
        
        if (ids.length === 0) {
            showToast('Nenhum anime selecionado para arquivar.', 'warning', 'Atenção');
            return;
        }

        // Obter nomes dos animes selecionados a partir do array animes
        const animeNames = ids.map(id => {
            const anime = animes.find(a => a.id === id);
            if (anime) {
                return anime.displayTitle || anime.title.replace(/-/g, ' ');
            }
            // Fallback: tentar extrair do ID
            return id.replace('anime-', '').replace(/-/g, ' ');
        });
        
        const namesPreview = animeNames.slice(0, 3).join(', ') + (animeNames.length > 3 ? ` e mais ${animeNames.length - 3}` : '');
        const confirmed = await showConfirmDialog(
            `Deseja arquivar ${ids.length} anime(s)?<br><small class="text-muted">${namesPreview}</small>`,
            'Arquivar Animes'
        );
        
        if (!confirmed) return;

        try {
            const res = await fetch(`${API_URL}/animes/archive`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || 'Erro ao arquivar');
            }

            // limpar seleção dos arquivados
            ids.forEach(id => selectedAnimes.delete(id));
            await loadAnimes();
            showToast('Animes arquivados com sucesso!', 'success', 'Sucesso');
        } catch (error) {
            console.error('Error archiving selected:', error);
            showToast(`Erro ao arquivar: ${error.message}`, 'error', 'Erro');
        }
    });
}

// Archive single anime by title
async function archiveAnime(idOrTitle) {
    if (!idOrTitle) return;
    
    // Buscar o anime para obter o nome correto
    const anime = animes.find(a => a.id === idOrTitle || a.title === idOrTitle);
    const displayName = anime ? (anime.displayTitle || anime.title.replace(/-/g, ' ')) : idOrTitle.toString().replace(/-/g, ' ');
    
    const confirmed = await showConfirmDialog(
        `Deseja arquivar "${displayName}"?`,
        'Arquivar Anime'
    );
    
    if (!confirmed) return;

    try {
        // If id pattern 'anime-' is provided, send as ids; otherwise fall back to titles for compatibility
        if (idOrTitle.toString().startsWith('anime-')) {
            const ids = [idOrTitle.toString()];
            const res = await fetch(`${API_URL}/animes/archive`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || 'Erro ao arquivar');
            }
        } else {
            // backward-compatible: send title
            const res = await fetch(`${API_URL}/animes/archive`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: idOrTitle })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || 'Erro ao arquivar');
            }
        }

        await loadAnimes();
        showToast('Anime arquivado com sucesso!', 'success', 'Sucesso');
    } catch (error) {
        console.error('Error archiving anime:', error);
        showToast(`Erro ao arquivar: ${error.message}`, 'error', 'Erro');
    }
}

// Unarchive one or more animes (move back to downloads)
async function unarchiveAnimes(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return;
    try {
        const res = await fetch(`${API_URL}/animes/unarchive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || 'Erro ao desarquivar');
        }

        await loadArchived();
        await loadAnimes();
        showAlert('Animes desarquivados com sucesso!', 'success');
    } catch (error) {
        console.error('Error unarchiving:', error);
        showAlert(`Erro ao desarquivar: ${error.message}`, 'danger');
    }
}

// Permanently delete archived folders
async function deleteArchived(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return;
    try {
        const res = await fetch(`${API_URL}/animes/archive-delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || 'Erro ao apagar arquivados');
        }

        await loadArchived();
        showAlert('Arquivos arquivados apagados com sucesso!', 'success');
    } catch (error) {
        console.error('Error deleting archived:', error);
        showAlert(`Erro ao apagar arquivados: ${error.message}`, 'danger');
    }
}

// Load archived list
async function loadArchived() {
    try {
        const res = await fetch(`${API_URL}/animes/archived`);
        const archived = await res.json();

        if (!Array.isArray(archived) || archived.length === 0) {
            archivedList.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-info">Nenhum anime arquivado.</div>
                </div>
            `;
            return;
        }

        archivedList.innerHTML = archived.map(anime => {
            const animeTitle = anime.displayTitle || anime.title.replace(/-/g, ' ');
            const imageSection = anime.imageUrl ?
                `<div class="anime-card-img" style="background-image: url('${anime.imageUrl}')">
                    <div class="anime-card-img-title">${animeTitle}</div>
                </div>` :
                `<div class="anime-card-img-placeholder"><div>${animeTitle}</div></div>`;

            return `
                <div class="col-md-6 col-lg-4 mb-4" data-anime-id="${anime.id}" data-anime-title="${anime.title}">
                    <div class="card anime-card">
                        ${imageSection}
                        <div class="card-body">
                            <h5>${animeTitle}</h5>
                            <p>${(anime.episodes || []).length} eps</p>
                        </div>
                        <div class="card-footer">
                                            <div class="btn-group btn-group-sm" role="group">
                                                <button class="btn btn-outline-primary" data-action="view-episodes" data-id="${anime.id}">Episódios</button>
                                                <button class="btn btn-outline-info" data-action="open-folder" data-id="${anime.id}" data-title="${anime.title}">Abrir Pasta</button>
                                                <button class="btn btn-outline-success" data-action="unarchive" data-id="${anime.id}" data-title="${anime.title}">Desarquivar</button>
                                                <button class="btn btn-outline-danger" data-action="delete-archived" data-id="${anime.id}" data-title="${anime.title}">Apagar</button>
                                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Hook action handlers for archived items (view episodes, open folder, unarchive, delete)
        archivedList.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const action = e.currentTarget.dataset.action;
                    const title = e.currentTarget.dataset.title;
                    const id = e.currentTarget.dataset.id;

                    // Find the archived object from the previously fetched array
                    const anime = archived.find(a => a.id === id || a.title === title);

                    switch (action) {
                        case 'view-episodes':
                            if (anime) viewAnimeEpisodes(anime);
                            break;
                        case 'open-folder':
                            if (!anime) {
                                showAlert('Erro: anime arquivado não encontrado', 'danger');
                                return;
                            }
                            // Request server to open archived folder
                            try {
                                // Use displayTitle ou title sem hífens como nome da pasta
                                const folderName = anime.displayTitle || anime.title.replace(/-/g, ' ');
                                
                                const response = await fetch(`${ANIMES_URL}/${anime.id}/open-folder`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ 
                                        title: anime.title, 
                                        safeFolderName: folderName, 
                                        archived: true 
                                    })
                                });

                                if (!response.ok) {
                                    const err = await response.json();
                                    throw new Error(err.message || 'Erro ao abrir pasta arquivada');
                                }

                                const result = await response.json();
                                if (result.message) showAlert(result.message, 'info');
                            } catch (err) {
                                console.error('Error opening archived folder:', err);
                                showAlert(`Erro ao abrir pasta arquivada: ${err.message}`, 'danger');
                            }
                            break;
                        case 'unarchive':
                            if (!id) return;
                            const animeName = anime ? (anime.displayTitle || anime.title.replace(/-/g, ' ')) : (title ? title.replace(/-/g, ' ') : id);
                            const confirmUnarchive = await showConfirmDialog(
                                `Deseja desarquivar "${animeName}"?`,
                                'Desarquivar Anime'
                            );
                            if (!confirmUnarchive) return;
                            await unarchiveAnimes([id]);
                            break;
                        case 'delete-archived':
                            if (!id) return;
                            const animeNameDel = anime ? (anime.displayTitle || anime.title.replace(/-/g, ' ')) : (title ? title.replace(/-/g, ' ') : id);
                            const confirmDelete = await showConfirmDialog(
                                `Deseja apagar permanentemente os ficheiros arquivados de "${animeNameDel}"?<br><br><strong class="text-danger">Esta operação é irreversível!</strong>`,
                                'Apagar Permanentemente'
                            );
                            if (!confirmDelete) return;
                            await deleteArchived([id]);
                            break;
                    }
                });
        });
    } catch (error) {
        console.error('Error loading archived:', error);
        archivedList.innerHTML = `<div class="col-12"><div class="alert alert-danger">Erro ao carregar arquivados</div></div>`;
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
            <div class="col-md-6 col-lg-4 mb-4" data-anime-id="${anime.id}" data-anime-title="${anime.title}">
                <div class="card anime-card">
                    ${imageSection}
                    <span class="badge bg-info badge-episodes">${anime.episodes?.length || 0} eps</span>
                    <span class="badge bg-primary quality-badge">${anime.quality}</span>
                    
                    <div class="card-body">
                        <div class="d-flex justify-content-end mb-2">
                                <div class="form-check">
                                <input class="form-check-input anime-select-checkbox" type="checkbox" value="" id="chk-${anime.id}" data-id="${anime.id}" data-title="${anime.title}" ${selectedAnimes.has(anime.id)? 'checked' : '' }>
                            </div>
                        </div>
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
                                <button class="btn btn-sm btn-warning" data-action="archive" data-id="${anime.id}" data-title="${anime.title}">
                                    <i class="bi bi-archive"></i> Arquivar
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

    // Add change handlers for checkboxes
    document.querySelectorAll('.anime-select-checkbox').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const cb = e.currentTarget;
            const id = cb.dataset.id;
            if (!id) return;
            if (cb.checked) selectedAnimes.add(id);
            else selectedAnimes.delete(id);
        });
    });
}

// Handle anime actions (edit, delete, download)
function handleAnimeAction(event) {
    const button = event.currentTarget;
    const action = button.dataset.action;
    const animeId = button.dataset.id;
    const anime = animes.find(a => a.id === animeId);
    
    switch (action) {
        case 'edit':
            if (!anime) { showAlert('Anime não encontrado para editar', 'warning'); return; }
            openAnimeModal(anime);
            break;
        case 'delete':
            if (!anime) { showAlert('Anime não encontrado para apagar', 'warning'); return; }
            confirmDeleteAnime(anime);
            break;
        case 'download':
            if (!anime) { showAlert('Anime não encontrado para download', 'warning'); return; }
            openDownloadModal(anime);
            break;
        case 'view-episodes':
            if (!anime) { showAlert('Anime não encontrado para ver episódios', 'warning'); return; }
            viewAnimeEpisodes(anime);
            break;
        case 'open-folder':
            if (!anime) {
                // For archived items or buttons that pass title instead of id, try to build a minimal object
                const title = button.dataset.title;
                if (!title) { showAlert('Anime não encontrado para abrir pasta', 'warning'); return; }
                openAnimeFolder({ id: null, title });
                return;
            }
            openAnimeFolder(anime);
            break;
        case 'archive':
                // Allow archive via button dataset.id or from anime object
                const arcId = button.dataset.id || (anime && anime.id);
                if (!arcId) { showAlert('ID do anime não encontrado para arquivar', 'warning'); return; }
                archiveAnime(arcId);
            break;
    }
}

// Open download modal and populate with anime info
function openDownloadModal(anime) {
    if (!anime) return;
    downloadAnimeIdInput.value = anime.id;
    downloadAnimeTitle.textContent = anime.displayTitle || anime.title.replace(/-/g, ' ');
    downloadQualitySelect.value = anime.quality || config.defaultQuality || 'HD';
    downloadStartEpisodeInput.value = anime.startEpisode || config.startFromEpisode || 1;
    downloadModal.show();
}

// When user confirms download settings
confirmDownloadBtn.addEventListener('click', async () => {
    const animeId = downloadAnimeIdInput.value;
    if (!animeId) return;

    const anime = animes.find(a => a.id === animeId);
    if (!anime) return;

    const quality = downloadQualitySelect.value;
    const startEpisode = parseInt(downloadStartEpisodeInput.value, 10) || 1;

    try {
        const res = await fetch(`${ANIMES_URL}/${animeId}/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: anime.title, quality, startEpisode })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || 'Erro ao iniciar download');
        }

        downloadModal.hide();
        showAlert('Download iniciado com as configurações selecionadas', 'success');

        // Abrir modal de progresso e iniciar polling do status
        openProgressModal();
    } catch (error) {
        console.error('Error starting download with settings:', error);
        showAlert(`Erro ao iniciar download: ${error.message}`, 'danger');
    }
});

// Open progress modal and start polling /api/download-status to update UI
function openProgressModal() {
    // Immediately fetch and render once
    fetchAndRenderDownloadStatus();
    progressModal.show();

    // Clear any existing interval
    if (modalStatusInterval) {
        clearInterval(modalStatusInterval);
        modalStatusInterval = null;
    }

    // Poll every 2s
    modalStatusInterval = setInterval(fetchAndRenderDownloadStatus, 2000);

    // Ensure a global polling is running to keep UI in sync even when modal closed
    startGlobalStatusPolling();
}

// Start a lightweight global polling to keep UI progress in sync even when modal is closed
function startGlobalStatusPolling() {
    if (globalStatusInterval) return;
    // Poll every 3 seconds
    globalStatusInterval = setInterval(async () => {
        try {
            const res = await fetch(DOWNLOAD_STATUS_URL);
            if (!res.ok) return;
            const status = await res.json();
            // Update main status area (reuse renderer) without showing modal
            renderDownloadStatusInModal(status);
        } catch (err) {
            // ignore polling errors
        }
    }, 3000);
}

// Stop global polling (call on unload if desired)
function stopGlobalStatusPolling() {
    if (globalStatusInterval) {
        clearInterval(globalStatusInterval);
        globalStatusInterval = null;
    }
}

// Close modal cleanup: clear polling
progressModalEl.addEventListener('hidden.bs.modal', () => {
    if (modalStatusInterval) {
        clearInterval(modalStatusInterval);
        modalStatusInterval = null;
    }
    // Keep global polling running (do not stop it here)
});

async function fetchAndRenderDownloadStatus() {
    try {
        const res = await fetch(DOWNLOAD_STATUS_URL);
        if (!res.ok) throw new Error('Erro ao obter status');
        const status = await res.json();
        renderDownloadStatusInModal(status);
    } catch (err) {
        console.error('Error fetching download status for modal:', err);
    }
}

function renderDownloadStatusInModal(status) {
    if (!status) return;

    // Verificar se não há downloads em andamento nem na fila
    const noCurrentDownload = !status.current;
    const noQueue = (!status.queue || status.queue.length === 0);
    const noEpisodeQueue = (!status.episodeQueue || !status.episodeQueue.episodes || status.episodeQueue.episodes.length === 0);
    
    // Se não há nada em download e nenhuma fila, fechar o modal
    if (noCurrentDownload && noQueue && noEpisodeQueue) {
        // Verificar se o modal está aberto
        if (progressModalEl.classList.contains('show')) {
            console.log('Todos os downloads concluídos. Fechando modal...');
            progressModal.hide();
            
            // Parar o intervalo de atualização do modal
            if (modalStatusInterval) {
                clearInterval(modalStatusInterval);
                modalStatusInterval = null;
            }
            
            // Recarregar a lista de animes para atualizar o status
            loadAnimes();
            
            return;
        }
    }

    // Current
    if (status.current) {
        const cur = status.current;
        const name = (cur.name || '').replace(/-/g, ' ');
        currentDownloadingAnime = cur.name; // Track the anime being downloaded
        modalCurrentTitle.textContent = name;

        // Prefer episode-level download percent if available for more granular UI
        const episodePercent = cur.details && cur.details.downloadPercent != null ? cur.details.downloadPercent : null;
        const overallPercent = cur.progress != null ? cur.progress : 0;

        const displayPercent = episodePercent != null ? episodePercent : overallPercent;
        modalCurrentProgress.style.width = `${displayPercent}%`;
        modalCurrentProgress.textContent = `${displayPercent}%`;

        // Also update main status bar if present on the page to keep UI in sync
        try {
            currentDownloadCard.style.display = 'block';
            currentAnimeTitle.textContent = name;
            const mainPercent = overallPercent;
            currentProgress.style.width = `${mainPercent}%`;
            currentProgress.textContent = `${mainPercent}%`;
            currentProgress.setAttribute('aria-valuenow', mainPercent);
        } catch (err) {
            // ignore if elements not on page
        }

        // details
        let detailsText = `Status: ${formatStatusText(cur.status)}`;
        if (cur.details) {
            const d = cur.details;
            if (d.totalEpisodes) {
                detailsText += ` | Ep ${d.currentEpisode || 0}/${d.totalEpisodes}`;
                if (d.episodeNumber) detailsText += ` (nº ${d.episodeNumber})`;
            }
            if (d.downloadPercent) {
                detailsText += ` | Ep progresso: ${d.downloadPercent}%`;
            }
        }

        modalCurrentDetails.textContent = detailsText;
    } else {
        modalCurrentTitle.textContent = 'Nenhum download em andamento';
        modalCurrentProgress.style.width = `0%`;
        modalCurrentProgress.textContent = `0%`;
        modalCurrentDetails.textContent = 'Aguardando...';
    }

    // Queue
    if (status.queue && status.queue.length > 0) {
        modalQueueList.innerHTML = status.queue.map(item => {
            const title = (item.name || item.title || '').replace(/-/g, ' ');
            const badge = item.quality ? `<span class="badge bg-secondary ms-2">${item.quality}</span>` : '';
            const extra = item.startEpisode ? `<small class="text-muted ms-2">desde ep. ${item.startEpisode}</small>` : '';
            return `<li class="list-group-item d-flex justify-content-between align-items-center">${title}${badge}${extra}</li>`;
        }).join('');
    } else if (status.episodeQueue && status.episodeQueue.episodes && status.episodeQueue.episodes.length > 0) {
        // Mostrar fila de episódios do anime atual
        const eq = status.episodeQueue;
        const animeTitle = eq.currentAnime ? eq.currentAnime.displayName || eq.currentAnime.name : 'Anime';
        const quality = eq.currentAnime ? eq.currentAnime.quality : '';
        
        const header = `<li class="list-group-item bg-light">
            <strong>${animeTitle}</strong>
            ${quality ? `<span class="badge bg-secondary ms-2">${quality}</span>` : ''}
            <small class="text-muted ms-2">(${eq.totalEpisodes} episódios na fila)</small>
        </li>`;
        
        const episodeItems = eq.episodes.slice(0, 5).map(ep => {
            return `<li class="list-group-item ps-4">
                <i class="bi bi-film me-2"></i>Episódio ${ep.number}
                <small class="text-muted ms-2">${ep.title || ''}</small>
            </li>`;
        }).join('');
        
        const moreText = eq.episodes.length > 5 
            ? `<li class="list-group-item text-muted ps-4"><small>... e mais ${eq.episodes.length - 5} episódios</small></li>` 
            : '';
        
        modalQueueList.innerHTML = header + episodeItems + moreText;
    } else {
        modalQueueList.innerHTML = `<li class="list-group-item">Nenhuma fila</li>`;
    }
}

// Open anime modal for add/edit
function openAnimeModal(anime = null, prefilledUrl = null, prefilledTitle = null) {
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
        // Set prefilled values if provided
        animeUrlInput.value = prefilledUrl || '';
        animeTitleInput.value = prefilledTitle || '';
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
        showToast(
            isEditing ? 'Anime atualizado com sucesso!' : 'Anime adicionado com sucesso!',
            'success',
            'Sucesso'
        );
    } catch (error) {
        console.error('Error saving anime:', error);
        showToast(`Erro ao salvar anime: ${error.message}`, 'error', 'Erro');
    }
}

// Confirm delete anime
async function confirmDeleteAnime(anime) {
    // Usar displayTitle (sem hífens) para exibição
    const animeTitle = anime.displayTitle || anime.title.replace(/-/g, ' ');
    
    const confirmed = await showConfirmDialog(
        `Tem certeza que deseja excluir "${animeTitle}" da lista?`,
        'Excluir Anime'
    );
    
    if (!confirmed) return;

    // Perguntar se também deseja apagar os ficheiros da pasta
    const deleteFiles = await showConfirmDialog(
        'Deseja apagar os ficheiros desta pasta também?',
        'Apagar Ficheiros'
    );
    
    deleteAnime(anime, deleteFiles);
}

// Delete anime
async function deleteAnime(anime, deleteFiles = false) {
    try {
        const response = await fetch(`${ANIMES_URL}/${anime.id}?title=${encodeURIComponent(anime.title)}&deleteFiles=${deleteFiles ? '1' : '0'}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Error deleting anime');
        }
        
        await loadAnimes();
        showToast('Anime removido com sucesso!', 'success', 'Sucesso');
    } catch (error) {
        console.error('Error deleting anime:', error);
        showToast(`Erro ao excluir anime: ${error.message}`, 'error', 'Erro');
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
            showToast(result.message, 'info', 'Informação');
        }
    } catch (error) {
        console.error('Error opening anime folder:', error);
        showToast(`Erro ao abrir pasta: ${error.message}`, 'error', 'Erro');
    }
}

// Start download all
async function startDownloadAll() {
    const confirmed = await showConfirmDialog(
        'Deseja iniciar o download de todos os animes da lista?',
        'Baixar Todos'
    );
    
    if (!confirmed) return;
    
    try {
        const response = await fetch(`${API_URL}/download-all`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Error starting download');
        }
        
        const data = await response.json();
        
        showToast(`Download de ${data.count} anime(s) iniciado!`, 'success', 'Download Iniciado');
        
        // Abrir modal de progresso e iniciar polling do status
        openProgressModal();
        
    } catch (error) {
        console.error('Error starting download all:', error);
        showToast(`Erro ao iniciar downloads: ${error.message}`, 'error', 'Erro');
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
            // Armazenar o nome do anime sendo baixado
            currentDownloadingAnime = status.current.name;
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
            currentDownloadingAnime = null;
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
        } else if (status.episodeQueue && status.episodeQueue.episodes && status.episodeQueue.episodes.length > 0) {
            // Mostrar fila de episódios do anime atual
            queueCard.style.display = 'block';
            const eq = status.episodeQueue;
            const animeTitle = eq.currentAnime ? eq.currentAnime.displayName || eq.currentAnime.name : 'Anime';
            const quality = eq.currentAnime ? eq.currentAnime.quality : '';
            
            const header = `
                <li class="list-group-item bg-light">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <strong><i class="bi bi-collection-play me-2"></i>${animeTitle}</strong>
                            ${quality ? `<span class="badge bg-secondary ms-2">${quality}</span>` : ''}
                        </div>
                        <span class="badge bg-primary">${eq.totalEpisodes} episódios na fila</span>
                    </div>
                </li>`;
            
            const episodeItems = eq.episodes.slice(0, 10).map(ep => {
                return `
                    <li class="list-group-item ps-4">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <i class="bi bi-film me-2"></i>Episódio ${ep.number}
                                ${ep.title ? `<small class="text-muted ms-2">${ep.title}</small>` : ''}
                            </div>
                            <span class="badge bg-warning">Pendente</span>
                        </div>
                    </li>`;
            }).join('');
            
            const moreText = eq.episodes.length > 10 
                ? `<li class="list-group-item text-muted text-center"><small>... e mais ${eq.episodes.length - 10} episódios</small></li>` 
                : '';
            
            queueList.innerHTML = header + episodeItems + moreText;
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

// Show alert (legacy - now redirects to showToast)
function showAlert(message, type = 'info') {
    // Mapear tipos antigos para novos
    const typeMap = {
        'danger': 'error',
        'info': 'info',
        'success': 'success',
        'warning': 'warning'
    };
    
    const title = type === 'danger' || type === 'error' ? 'Erro' :
                  type === 'success' ? 'Sucesso' :
                  type === 'warning' ? 'Atenção' : 'Informação';
    
    showToast(message, typeMap[type] || type, title);
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Carregar lista de destaques por padrão
    loadFeatured();
    loadAnimes();
    loadConfig();
    
    // Event listeners para as abas - carregar conteúdo ao clicar
    const featuredTab = document.getElementById('featured-tab');
    const top10Tab = document.getElementById('top10-tab');
    const latestTab = document.getElementById('latest-tab');
    
    if (featuredTab) {
        featuredTab.addEventListener('shown.bs.tab', () => loadFeatured());
    }
    if (top10Tab) {
        top10Tab.addEventListener('shown.bs.tab', () => loadTop10());
    }
    if (latestTab) {
        latestTab.addEventListener('shown.bs.tab', () => loadLatest());
    }
    
    addAnimeBtn.addEventListener('click', () => openAnimeModal());
    downloadAllBtn.addEventListener('click', startDownloadAll);
    saveAnimeBtn.addEventListener('click', saveAnime);
    settingsForm.addEventListener('submit', saveSettings);
    
    browseFolderBtn.addEventListener('click', openFolderBrowser);
    saveFolderBtn.addEventListener('click', saveDownloadFolder);
    selectFolderBtn.addEventListener('click', selectFolder);
    
    // Cancel download buttons
    if (cancelDownloadBtn) {
        cancelDownloadBtn.addEventListener('click', cancelDownload);
    }
    if (cancelDownloadStatusBtn) {
        cancelDownloadStatusBtn.addEventListener('click', cancelDownload);
    }
    
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
