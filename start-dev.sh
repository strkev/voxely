#!/bin/bash
LAN_IP=$(ipconfig getifaddr en0 || echo "localhost")
echo "📍 Aktuelle LAN-IP: $LAN_IP"
echo "🔄 Synchronisiere .env Dateien mit LAN-IP..."

# Frontend environment overwrite
echo "NEXT_PUBLIC_API_URL=http://$LAN_IP:4000" > frontend/.env.local
echo "NEXT_PUBLIC_LIVEKIT_URL=ws://$LAN_IP:7880" >> frontend/.env.local

# Replace the specific LIVEKIT_WS_URL in the backend .env
sed -i '' "s|LIVEKIT_WS_URL=.*|LIVEKIT_WS_URL=\"ws://$LAN_IP:7880\"|" backend/.env
# Replace ALLOWED_ORIGINS to include recent LAN IP
sed -i '' "s|ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=\"http://localhost:3000,http://$LAN_IP:3000\"|" backend/.env

echo "🚀 Starte Dev-Environment..."
echo "🐳 Starte Docker Container..."
docker start dc-postgres dc-redis 2>/dev/null

echo "📂 Backend wird in neuem Terminal gestartet..."
osascript -e 'tell app "Terminal" to do script "cd '$(pwd)'/backend && npm run dev"'

echo "📂 Frontend wird in neuem Terminal gestartet..."
osascript -e 'tell app "Terminal" to do script "cd '$(pwd)'/frontend && npm run dev"'

echo "📂 LiveKit Server wird in neuem Terminal gestartet..."
LK_KEY=$(grep '^LIVEKIT_API_KEY=' backend/.env | cut -d '=' -f2 | tr -d '"' | tr -d "'")
LK_SECRET=$(grep '^LIVEKIT_API_SECRET=' backend/.env | cut -d '=' -f2 | tr -d '"' | tr -d "'")
osascript -e "tell app \"Terminal\" to do script \"export LIVEKIT_KEYS=\\\"$LK_KEY: $LK_SECRET\\\" && livekit-server --dev\""

echo ""
echo "✅ Alle Services wurden mit IP $LAN_IP konfiguriert!"
echo "-------------------------------------------------------"
echo "🌐 Frontend: http://localhost:3000   (oder http://$LAN_IP:3000)"
echo "🔌 Backend:  http://$LAN_IP:4000"
echo "📞 LiveKit:  http://$LAN_IP:7880"
echo "-------------------------------------------------------"
