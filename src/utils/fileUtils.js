const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

/**
 * Safely opens a folder in the file explorer
 * @param {string} folderPath - Path to the folder to open
 * @returns {Promise<void>}
 */
const openFolder = async (folderPath) => {
  try {
    // Create the folder if it doesn't exist
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
      console.log(`Created folder: ${folderPath}`);
    }
    
    // On Windows, use the 'explorer' command to open the folder
    return new Promise((resolve, reject) => {
      exec(`explorer "${folderPath}"`, (error) => {
        if (error) {
          console.error(`Failed to open folder: ${error.message}`);
          
          // Try opening the parent folder instead as a fallback
          const parentFolder = path.dirname(folderPath);
          console.log(`Attempting to open parent folder: ${parentFolder}`);
          
          exec(`explorer "${parentFolder}"`, (parentError) => {
            if (parentError) {
              reject(new Error(`Failed to open parent folder: ${parentError.message}`));
            } else {
              resolve();
            }
          });
        } else {
          resolve();
        }
      });
    });
  } catch (error) {
    console.error(`Error in openFolder: ${error.message}`);
    throw error;
  }
};

/**
 * Creates a safe folder name by removing invalid characters and limiting length
 * @param {string} name - Original folder name
 * @returns {string} Safe folder name
 */
const createSafeFolderName = (name) => {
  // Substituir hifens por espaços
  let safeName = name.replace(/-/g, ' ');
  
  // Remove invalid characters for Windows folders
  safeName = safeName.replace(/[<>:"/\\|?*]/g, '');
  
  // Limit length to 50 characters to avoid path length issues
  if (safeName.length > 50) {
    safeName = safeName.substring(0, 47) + '...';
  }
  
  return safeName;
};

module.exports = {
  openFolder,
  createSafeFolderName
};
