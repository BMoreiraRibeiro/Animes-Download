@echo off
echo Starting Anime Downloader Server with auto-restart...

:loop
node server.js
echo Server stopped or crashed, restarting in 3 seconds...
timeout /t 3 /nobreak > nul
goto loop
