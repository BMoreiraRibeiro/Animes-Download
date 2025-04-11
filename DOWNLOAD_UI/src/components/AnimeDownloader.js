import React, { useState } from 'react';
import path from 'path';
import { openFolder, createSafeFolderName } from '../utils/fileUtils';

const AnimeDownloader = ({ animeName }) => {
  const [error, setError] = useState(null);

  const handleOpenFolder = async (animeName) => {
    try {
      const safeAnimeFolder = createSafeFolderName(animeName);
      const folderPath = path.join(__dirname, '..', '..', 'downloads', safeAnimeFolder);
      await openFolder(folderPath);
    } catch (error) {
      console.error('Failed to open anime folder:', error);
      setError(`Could not open the folder for ${animeName}. Path may be too long or contain invalid characters.`);
    }
  };

  return (
    <div>
      <button onClick={() => handleOpenFolder(animeName)}>Open Download Folder</button>
      {error && <p className="error">{error}</p>}
    </div>
  );
};

export default AnimeDownloader;