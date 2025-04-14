const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { downloadAnime } = require('./downloadAnime');
const axios = require('axios'); // Make sure axios is installed

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadFile('index.html');
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

function createDownloadHandler() {
  ipcMain.on('download-anime', async (event, animeData) => {
    const downloadPath = app.getPath('downloads');
    const animeTitle = animeData.customName || animeData.title;
    const sanitizedTitle = sanitizeFilename(animeTitle);
    const animeFolder = path.join(downloadPath, sanitizedTitle);

    if (!fs.existsSync(animeFolder)) {
      fs.mkdirSync(animeFolder);
    }

    for (const episode of animeData.episodes) {
      const episodeNumber = String(episode.number).padStart(2, '0');
      const filename = `${sanitizedTitle} - ${episodeNumber}.mp4`;
      const filePath = path.join(animeFolder, filename);

      await downloadAnime(episode.url, filePath);
    }

    event.reply('download-complete', animeData);
  });
}

// Add IPC handlers for anime folder operations
ipcMain.handle('check-anime-folder', async (event, animeName) => {
  try {
    // Get download path from settings or use default
    const downloadPath = getDownloadPath();
    
    // Sanitize the folder name
    const sanitizedName = sanitizeFilename(animeName);
    
    // Check if folder exists
    const folderPath = path.join(downloadPath, sanitizedName);
    const exists = fs.existsSync(folderPath);
    
    let episodeCount = 0;
    if (exists) {
      // Count episodes (MP4 files) in the folder
      const files = fs.readdirSync(folderPath);
      episodeCount = files.filter(file => file.toLowerCase().endsWith('.mp4')).length;
    }
    
    return { exists, episodeCount, folderPath };
  } catch (error) {
    console.error('Error checking anime folder:', error);
    return { exists: false, episodeCount: 0, folderPath: null };
  }
});

// Add IPC handler to fetch anime page HTML (avoids CORS issues)
ipcMain.handle('fetch-anime-page', async (event, url) => {
  try {
    console.log(`Main process fetching URL: ${url}`);
    
    // Make sure the URL is valid
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      throw new Error('Invalid URL format');
    }
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://animefire.plus/'
      },
      timeout: 15000,  // 15 second timeout
      maxRedirects: 5  // Allow up to 5 redirects
    });
    
    console.log(`Successfully fetched page: ${url}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching anime page: ${error.message}`);
    throw new Error(`Failed to fetch anime page: ${error.message}`);
  }
});

// Helper function to sanitize filenames
function sanitizeFilename(name) {
  return name.replace(/[/\\?%*:|"<>]/g, '-').trim();
}

// Helper function to get download path from settings
function getDownloadPath() {
  // Implement this based on your app's settings
  // For example, return from electron-store or a default path
  return path.join(app.getPath('downloads'), 'Animes');
}

app.on('ready', createDownloadHandler);