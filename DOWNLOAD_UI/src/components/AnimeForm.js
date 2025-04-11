import React, { useState } from 'react';

const AnimeForm = ({ onSubmit, initialData = {} }) => {
  const [formData, setFormData] = useState({
    title: initialData.title || '',
    episodes: initialData.episodes || '',
    genre: initialData.genre || '',
    imageUrl: initialData.imageUrl || '',
    animeUrl: initialData.animeUrl || '', // New field for anime URL
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="title">Title</label>
        <input
          type="text"
          className="form-control"
          id="title"
          name="title"
          value={formData.title}
          onChange={handleChange}
        />
      </div>

      <div className="form-group">
        <label htmlFor="episodes">Episodes</label>
        <input
          type="number"
          className="form-control"
          id="episodes"
          name="episodes"
          value={formData.episodes}
          onChange={handleChange}
        />
      </div>

      <div className="form-group">
        <label htmlFor="genre">Genre</label>
        <input
          type="text"
          className="form-control"
          id="genre"
          name="genre"
          value={formData.genre}
          onChange={handleChange}
        />
      </div>

      <div className="form-group">
        <label htmlFor="imageUrl">Image URL</label>
        <input
          type="url"
          className="form-control"
          id="imageUrl"
          name="imageUrl"
          value={formData.imageUrl}
          onChange={handleChange}
        />
      </div>

      <div className="form-group">
        <label htmlFor="animeUrl">URL do Anime (ex: https://animefire.plus/animes/...)</label>
        <input
          type="url"
          className="form-control"
          id="animeUrl"
          name="animeUrl"
          value={formData.animeUrl}
          onChange={handleChange}
          placeholder="https://animefire.plus/animes/nome-do-anime-todos-os-episodios"
        />
      </div>

      <button type="submit" className="btn btn-primary">Submit</button>
    </form>
  );
};

export default AnimeForm;