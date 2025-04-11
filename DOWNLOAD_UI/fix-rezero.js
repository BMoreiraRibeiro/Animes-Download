/**
 * Script para corrigir referências para o Re:Zero
 */
const fs = require('fs');
const path = require('path');

const ANIME_LIST_FILE = path.join(__dirname, 'anime-list.txt');
const DOWNLOAD_FOLDER = path.join(__dirname, 'downloads');

function main() {
    try {
        // Ler a lista de animes
        if (!fs.existsSync(ANIME_LIST_FILE)) {
            console.log('Arquivo de lista de animes não encontrado.');
            return;
        }
        
        const content = fs.readFileSync(ANIME_LIST_FILE, 'utf8');
        const lines = content.split('\n');
        
        // Verificar se Re:Zero está na lista
        const hasReZeroWithColon = lines.some(line => {
            if (line.trim() && !line.startsWith('#')) {
                const parts = line.split('|');
                return parts[0].trim().toLowerCase().includes('re:zero');
            }
            return false;
        });
        
        const hasReZeroWithHyphen = lines.some(line => {
            if (line.trim() && !line.startsWith('#')) {
                const parts = line.split('|');
                return parts[0].trim().toLowerCase().includes('re-zero');
            }
            return false;
        });
        
        // Se ambas versões estão presentes, pergunte qual manter
        if (hasReZeroWithColon && hasReZeroWithHyphen) {
            console.log('Ambos formatos de Re:Zero encontrados na lista:');
            console.log('1. Re:Zero (com dois-pontos)');
            console.log('2. Re-Zero (com hífen)');
            console.log('Mantendo ambos para compatibilidade.');
            return;
        }
        
        // Verificar pastas
        const reZeroFolder = path.join(DOWNLOAD_FOLDER, 'Re:Zero kara Hajimeru Isekai Seikatsu 3rd Season');
        const reZeroHyphenFolder = path.join(DOWNLOAD_FOLDER, 're-zero-kara-hajimeru-isekai-seikatsu-3rd-season');
        
        const hasReZeroFolder = fs.existsSync(reZeroFolder);
        const hasReZeroHyphenFolder = fs.existsSync(reZeroHyphenFolder);
        
        // Se só tem a versão com dois-pontos na lista, adicionar versão com hífen
        if (hasReZeroWithColon && !hasReZeroWithHyphen) {
            // Tentar encontrar a linha com Re:Zero
            let quality = 'HD';
            let startEp = 1;
            
            for (const line of lines) {
                if (line.trim() && !line.startsWith('#')) {
                    const parts = line.split('|').map(p => p.trim());
                    if (parts[0].toLowerCase().includes('re:zero')) {
                        quality = parts[1] || 'HD';
                        startEp = parts[2] || 1;
                        break;
                    }
                }
            }
            
            // Adicionar versão com hífen
            console.log('Adicionando versão com hífen à lista');
            fs.appendFileSync(ANIME_LIST_FILE, `\nre-zero-kara-hajimeru-isekai-seikatsu-3rd-season | ${quality} | ${startEp}`);
        }
        
        // Se só tem a versão com hífen na lista, adicionar versão com dois-pontos
        if (!hasReZeroWithColon && hasReZeroWithHyphen) {
            // Tentar encontrar a linha com Re-Zero
            let quality = 'HD';
            let startEp = 1;
            
            for (const line of lines) {
                if (line.trim() && !line.startsWith('#')) {
                    const parts = line.split('|').map(p => p.trim());
                    if (parts[0].toLowerCase().includes('re-zero')) {
                        quality = parts[1] || 'HD';
                        startEp = parts[2] || 1;
                        break;
                    }
                }
            }
            
            // Adicionar versão com dois-pontos
            console.log('Adicionando versão com dois-pontos à lista');
            fs.appendFileSync(ANIME_LIST_FILE, `\nRe:Zero kara Hajimeru Isekai Seikatsu 3rd Season | ${quality} | ${startEp}`);
        }
        
        // Verificar se precisamos copiar arquivos entre pastas
        if (hasReZeroFolder && !hasReZeroHyphenFolder) {
            console.log('Criando link para a pasta com hífen');
            // No Windows, pode ser necessário privilégios administrativos para criar symlinks
            try {
                fs.mkdirSync(path.dirname(reZeroHyphenFolder), { recursive: true });
                fs.symlinkSync(reZeroFolder, reZeroHyphenFolder, 'junction');
                console.log(`Link criado de ${reZeroFolder} para ${reZeroHyphenFolder}`);
            } catch (error) {
                console.error('Erro ao criar link simbólico:', error.message);
                console.log('Sugestão: Execute o script como administrador');
            }
        } 
        else if (!hasReZeroFolder && hasReZeroHyphenFolder) {
            console.log('Criando link para a pasta com dois-pontos');
            try {
                fs.mkdirSync(path.dirname(reZeroFolder), { recursive: true });
                fs.symlinkSync(reZeroHyphenFolder, reZeroFolder, 'junction');
                console.log(`Link criado de ${reZeroHyphenFolder} para ${reZeroFolder}`);
            } catch (error) {
                console.error('Erro ao criar link simbólico:', error.message);
                console.log('Sugestão: Execute o script como administrador');
            }
        }
        
        console.log('Processo de correção concluído!');
    } catch (error) {
        console.error('Erro:', error);
    }
}

main();
