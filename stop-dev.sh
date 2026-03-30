#!/bin/bash
echo "🛑 Stoppe Dev-Environment..."
echo "🐳 Stoppe Docker Container..."
docker stop dc-postgres dc-redis 2>/dev/null

echo "🧹 Bereinige Prozesse..."
echo "   - Beende namentliche Services (Next.js, LiveKit, ts-node-dev)..."
pkill -f "next"
pkill -f "livekit-server"
pkill -f "ts-node-dev"
pkill -f "node"

echo ""
echo "✅ Alle Services wurden gestoppt!"
echo "-------------------------------------------------------"
