const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { downloadAnime } = require('./download');
const { getAnimeList, getAnimeDetails } = require('./animeApi');
const { addAnimeToDb, getAnimeFromDb, updateAnimeInDb, deleteAnimeFromDb } = require('./db');

// Assuming there's a function to add anime to the database
function addAnimeToDb(animeData) {
  const animeToSave = {
    title: animeData.title,
    customName: animeData.customName || animeData.title,
    episodes: animeData.episodes,
    status: animeData.status,
    imageUrl: animeData.imageUrl,
    description: animeData.description,
  };

  // Save animeToSave to the database
  // ...existing code...
}

module.exports = {
  addAnimeToDb,
  getAnimeFromDb,
  updateAnimeInDb,
  deleteAnimeFromDb,
};