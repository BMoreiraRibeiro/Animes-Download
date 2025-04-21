const fs = require('fs');
const path = require('path');

console.log('Checking dependencies for AnimeDownloader UI...');

// Create a function to check if a module exists
function checkModule(moduleName) {
    try {
        require(moduleName);
        console.log(`✅ Module '${moduleName}' is installed and working`);
        return true;
    } catch (e) {
        console.error(`❌ Module '${moduleName}' is NOT installed or has errors: ${e.message}`);
        return false;
    }
}

// List of required modules for the featured animes functionality
const requiredModules = [
    'axios',
    'cheerio',
    'express',
    'cors',
    'body-parser',
    'path',
    'fs'
];

// Check each module
let allModulesOk = true;
for (const module of requiredModules) {
    if (!checkModule(module)) {
        allModulesOk = false;
    }
}

// Check if important files exist
const requiredFiles = [
    'server.js',
    'public/index.html',
    'public/app.js',
    'public/style.css',
    'public/dark-theme.css',
    'public/css/featured-animes.css'
];

console.log('\nChecking required files...');
for (const file of requiredFiles) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        console.log(`✅ File '${file}' exists`);
    } else {
        console.error(`❌ File '${file}' is missing`);
        allModulesOk = false;
    }
}

// Output summary
console.log('\nDependency check summary:');
if (allModulesOk) {
    console.log('All dependencies and files are present.');
} else {
    console.error('Some dependencies or files are missing. Please fix the issues above.');
}

// Check network connectivity
console.log('\nChecking network connectivity to AnimeFirePlus...');
const axios = require('axios');
axios.get('https://animefire.plus', { 
    timeout: 10000,
    headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
})
.then(response => {
    console.log(`✅ Connected to AnimeFirePlus successfully (Status: ${response.status})`);
})
.catch(error => {
    console.error('❌ Failed to connect to AnimeFirePlus:');
    if (error.response) {
        console.error(`  Status: ${error.response.status}`);
        console.error(`  Headers: ${JSON.stringify(error.response.headers)}`);
    } else if (error.request) {
        console.error('  No response received');
    } else {
        console.error(`  Error: ${error.message}`);
    }
});
