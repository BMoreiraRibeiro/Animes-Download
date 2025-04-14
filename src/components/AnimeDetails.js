import React from 'react';

const AnimeDetails = ({ anime }) => {
  return (
    <div className="anime-details">
      <h2>{anime.title}</h2>
      <p>{anime.description}</p>
      <p>Episodes: {anime.episodes}</p>
      <p>Score: {anime.score}</p>
      
      {anime.animeUrl && (
        <div className="anime-url">
          <h4>Link do Anime:</h4>
          <a href={anime.animeUrl} target="_blank" rel="noopener noreferrer">
            {anime.animeUrl}
          </a>
        </div>
      )}
      
    </div>
  );
};

export default AnimeDetails;