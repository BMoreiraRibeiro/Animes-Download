import React from 'react';

const AnimeCard = ({ anime, onSelect }) => {
  const handleCardClick = () => {
    onSelect(anime);
  };

  return (
    <div className="anime-card" onClick={handleCardClick}>
      <img src={anime.image_url} alt={anime.title} />
      <div className="anime-info">
        <h3>{anime.title}</h3>
        <p>{anime.synopsis}</p>
      </div>
    </div>
  );
};

export default AnimeCard;