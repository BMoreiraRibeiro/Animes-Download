const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function createWindow () {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.webContents.openDevTools();
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

// Add a safe way to open folders from the renderer process
ipcMain.handle('open-folder', async (_, folderPath) => {
  const fs = require('fs');
  const { exec } = require('child_process');
  
  try {
    // Ensure the folder exists
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    
    return new Promise((resolve, reject) => {
      exec(`explorer "${folderPath}"`, (error) => {
        if (error) {
          // Try parent folder as fallback
          const path = require('path');
          const parentFolder = path.dirname(folderPath);
          
          exec(`explorer "${parentFolder}"`, (parentError) => {
            if (parentError) {
              reject(parentError);
            } else {
              resolve({ status: 'opened-parent', path: parentFolder });
            }
          });
        } else {
          resolve({ status: 'success', path: folderPath });
        }
      });
    });
  } catch (error) {
    console.error('Error opening folder:', error);
    throw error;
  }
});