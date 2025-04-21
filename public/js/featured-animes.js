document.addEventListener('DOMContentLoaded', function() {
    // Get the container
    const featuredContainer = document.getElementById('featured-animes-container');
    if (!featuredContainer) return;
    
    // Loading state
    featuredContainer.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-light" role="status"><span class="visually-hidden">Carregando...</span></div></div>';
    
    // Fetch featured animes from API
    fetchFeaturedAnimes()
        .then(animes => {
            renderFeaturedAnimes(animes, featuredContainer);
        })
        .catch(error => {
            console.error('Error fetching featured animes:', error);
            featuredContainer.innerHTML = '<div class="alert alert-danger">Erro ao carregar animes em destaque. Por favor, tente novamente mais tarde.</div>';
        });
});

// Function to fetch animes from API
async function fetchFeaturedAnimes() {
    try {
        const response = await fetch('/api/featured-animes');
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching featured animes:', error);
        throw error;
    }
}

// Function to render animes to the container
function renderFeaturedAnimes(animes, container) {
    // Sort animes alphabetically by title
    const sortedAnimes = [...animes].sort((a, b) => 
        a.title.localeCompare(b.title, 'pt-BR')
    );
    
    // Create grid layout
    const row = document.createElement('div');
    row.className = 'row';
    
    // Clear container
    container.innerHTML = '';
    
    // Generate HTML for each anime
    sortedAnimes.forEach(anime => {
        const col = document.createElement('div');
        col.className = 'col-6 col-sm-4 col-md-3 col-lg-2 mb-4';
        
        // Determine age rating style
        let ageRatingStyle = '';
        let ageRatingText = '';
        
        if (anime.ageRating === 'A14') {
            ageRatingStyle = 'background-color:#e36722 !important';
            ageRatingText = 'A14';
        } else if (anime.ageRating === 'A18') {
            ageRatingStyle = 'background-color:#000 !important';
            ageRatingText = 'A18';
        } else if (anime.ageRating === 'L') {
            ageRatingStyle = 'background-color:#159415 !important';
            ageRatingText = 'L';
        }
        
        // Create anime card HTML - IMPORTANT: replaced <a href> with <div> to prevent direct navigation
        col.innerHTML = `
            <div class="divArticleLancamentos" title="${anime.title}" data-url="${anime.link}" data-title="${anime.title}">
                <article class="containerAnimes">
                    <div class="item featured-anime-item">
                        <img ondragstart="return false" oncontextmenu="return false" 
                            src="${anime.imageUrl}" class="img-fluid imgAnimes"
                            alt="${anime.title}" loading="lazy">
                        <div class="text-block">
                            <h3 class="animeTitle">${anime.title}</h3>
                        </div>
                        <div class="text-block1 text-center" style="top:5px !important;width:39px;height:25px !important;padding:2px 6px 0 6px !important;">
                            <span class="horaUltimosEps" style="width:100%">${anime.rating}</span>
                        </div>
                        ${anime.ageRating ? `
                        <div class="text-blockCapaAnimeTags text-blockCapaAnimeTagsDL" 
                            style="${ageRatingStyle};opacity:.8;padding:0 0px 0 1px !important;right:48px !important;top:5px !important;left:unset !important">
                            <span class="pr-1" style="width:29px;height:22px;padding:0px 3px 0 3px;font-size:14px;display:table;margin:1px;">${ageRatingText}</span>
                        </div>` : ''}
                    </div>
                </article>
            </div>
        `;
        
        row.appendChild(col);
    });
    
    container.appendChild(row);
    
    // Add click event listeners to all featured anime items
    document.querySelectorAll('.divArticleLancamentos').forEach(card => {
        card.style.cursor = 'pointer';
        card.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            // Call the showFeaturedAnimeOptions function if it exists in the global scope
            if (typeof showFeaturedAnimeOptions === 'function') {
                showFeaturedAnimeOptions(e);
            } else {
                // Fallback to show a simple confirm dialog if the function doesn't exist
                const title = this.getAttribute('data-title');
                const url = this.getAttribute('data-url');
                
                if (confirm(`Deseja adicionar "${title}" à sua lista ou abrir o link?`)) {
                    // Add anime logic would go here
                    console.log('Add anime:', title, url);
                } else {
                    window.open(url, '_blank');
                }
            }
        });
    });
}
