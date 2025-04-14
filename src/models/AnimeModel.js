import { generateId } from '../utils';

class AnimeModel {
  constructor(data = {}) {
    this.id = data.id || generateId();
    this.title = data.title || '';
    this.episodes = data.episodes || '';
    this.genre = data.genre || '';
    this.imageUrl = data.imageUrl || '';
    this.animeUrl = data.animeUrl || ''; // New field for anime URL
  }
}

export default AnimeModel;