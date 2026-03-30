#!/bin/bash
echo "🛑 Stoppe Dev-Environment..."
echo "🐳 Stoppe Docker Container..."
docker stop dc-postgres dc-redis 2>/dev/null

echo "🧹 Bereinige Prozesse..."
echo "   - Beende Projekt-spezifische Services (Next.js, LiveKit, ts-node-dev)..."

# Target processes that contain the project folder in their path
# This prevents killing unrelated node processes or the GitHub connection
pkill -f "discord-airbnb-clone/backend"
pkill -f "discord-airbnb-clone/frontend"
pkill -f "livekit-server"

# Specific fallback for ts-node-dev and next, but still restricted to this project
pkill -f "ts-node-dev.*discord-airbnb-clone"
pkill -f "next.*discord-airbnb-clone"

echo ""
echo "✅ Alle Services wurden gestoppt!"
echo "-------------------------------------------------------"
