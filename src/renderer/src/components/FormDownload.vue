<template>
  <div>
    <div class="mb-3">
      <label for="custom-name" class="form-label">Nome personalizado</label>
      <input
        type="text"
        class="form-control"
        id="custom-name"
        v-model="customName"
        placeholder="Nome para salvar os arquivos"
        @blur="checkExistingFolder"
      />
      <small class="text-muted">
        Usado apenas localmente para salvar arquivos
      </small>
      <small v-if="folderExists" class="text-info">
        Pasta já existe com {{existingEpisodeCount}} episódio(s)
      </small>
    </div>
    
    <div class="mb-3">
      <label for="anime-url" class="form-label">URL do Anime</label>
      <input
        type="text"
        class="form-control"
        id="anime-url"
        v-model="animeUrl"
        placeholder="Cole o URL da página do anime"
      />
      <small class="text-muted">
        URL utilizada para buscar a imagem e dados do anime
      </small>
    </div>
    
    <!-- Add proper image handling -->
    <div v-if="anime && anime.image" class="mb-3">
      <img :src="getImageUrl(anime.image)" class="img-thumbnail" alt="Capa do anime" />
    </div>
    <div v-else class="mb-3">
      <div class="alert alert-warning">Imagem não encontrada</div>
    </div>
    
    <!-- Add button to fetch image from anime URL -->
    <div class="mb-3">
      <button 
        type="button" 
        class="btn btn-secondary"
        @click="fetchImageFromUrl(animeUrl)"
        :disabled="!animeUrl">
        Buscar imagem do anime
      </button>
    </div>
  </div>
</template>

<script>
import { ipcRenderer } from 'electron'

export default {
  data() {
    return {
      customName: '',
      animeUrl: '', // Add URL field for image fetching
      // Add proper image path handling
      imagePath: null,
      imageError: false,
      folderExists: false,
      existingEpisodeCount: 0,
      anime: null
    }
  },
  methods: {
    submitForm() {
      const animeData = {
        customName: this.customName || this.anime?.title || '',
        animeUrl: this.animeUrl, // URL direta para todas as operações online
        image: this.anime?.image || null
      };
      
      // Send to main process or handle as needed
    },
    
    // Check if folder with this name already exists
    async checkExistingFolder() {
      if (!this.customName) return;
      
      try {
        // Use IPC to check if folder exists in main process
        const result = await ipcRenderer.invoke('check-anime-folder', this.customName);
        this.folderExists = result.exists;
        this.existingEpisodeCount = result.episodeCount;
      } catch (error) {
        console.error('Error checking folder:', error);
        this.folderExists = false;
        this.existingEpisodeCount = 0;
      }
    },
    
    // Add method to handle image URLs properly
    getImageUrl(imageUrl) {
      if (!imageUrl) return '';
      
      // Check if it's an absolute URL
      if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        return imageUrl;
      }
      
      // Check if it's a relative path
      try {
        // For Electron, might need to use proper path resolution
        return new URL(imageUrl, window.location.origin).href;
      } catch (e) {
        console.error('Error loading image:', e);
        this.imageError = true;
        return '';
      }
    },
    
    // Handle image loading errors
    handleImageError() {
      this.imageError = true;
      console.error('Failed to load image');
    },
    
    // Use only the exact URL provided by the user
    async fetchImageFromUrl(url) {
      try {
        // Check if we have a URL
        if (!url) {
          console.error('No URL provided to fetch image');
          this.imageError = true;
          return;
        }
        
        console.log(`Fetching image from provided URL: ${url}`);
        
        // Usa apenas a URL direta fornecida para buscar a imagem
        const htmlContent = await ipcRenderer.invoke('fetch-anime-page', url);
        
        // Parse HTML to find image
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        
        // Find the image element directly by its attributes
        let imgElement = null;
        
        // Look for an image with specific attributes that match animefire's pattern
        const allImages = doc.querySelectorAll('img');
        for (const img of allImages) {
          const src = img.src || img.getAttribute('data-src') || '';
          // Check if it's likely an anime cover image
          if ((img.hasAttribute('ondragstart') && img.hasAttribute('oncontextmenu')) || 
              src.includes('/img/animes/') || 
              (img.alt && img.alt.toLowerCase().includes('episódios'))) {
            imgElement = img;
            break;
          }
        }
        
        if (imgElement) {
          // Get the src attribute or data-src if src is not available
          const imageSrc = imgElement.src || imgElement.getAttribute('data-src');
          if (imageSrc) {
            // Found the image, update the anime's image property
            if (!this.anime) this.anime = {};
            this.anime.image = imageSrc;
            this.imageError = false;
            console.log(`Found image: ${imageSrc}`);
          } else {
            console.error('Image found but no src attribute');
            this.imageError = true;
          }
        } else {
          console.error('Image element not found in the provided URL');
          this.imageError = true;
        }
      } catch (error) {
        console.error('Error fetching image from URL:', error);
        this.imageError = true;
      }
    }
  }
}
</script>

<style scoped>
.img-thumbnail {
  max-height: 200px;
  max-width: 100%;
}
</style>