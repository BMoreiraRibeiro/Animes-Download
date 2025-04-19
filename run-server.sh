#!/bin/bash
echo "Starting Anime Downloader Server with auto-restart..."

while true; do
  node server.js
  echo "Server stopped or crashed, restarting in 3 seconds..."
  sleep 3
done
