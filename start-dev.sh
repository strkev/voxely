#!/bin/bash

# Voxely Start Script für macOS
# Dieses Script startet die Infrastruktur via Docker und die Dev-Server in neuen Terminal-Tabs.

# Projekt-Verzeichnis festlegen
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 Starte Voxely Development Environment..."

# 1. Prüfen ob Docker läuft
if ! docker info > /dev/null 2>&1; then
    echo "❌ Fehler: Docker läuft nicht. Bitte starte Docker Desktop zuerst."
    exit 1
fi

# 2. Infrastruktur (DBs, LiveKit) starten
echo "📦 Starte Datenbanken und LiveKit..."
docker-compose up -d

# 3. Warten bis Datenbank bereit ist & Schema synchronisieren
echo "⏳ Synchronisiere Datenbank-Schema..."
cd "$PROJECT_ROOT/backend"
# Kurze Wartezeit für Postgres Startup
npx prisma db push --accept-data-loss
npx prisma generate
cd "$PROJECT_ROOT"

# 4. Backend in neuem Tab starten
echo "🔌 Starte Backend in neuem Tab..."
osascript <<EOF
tell application "Terminal"
    activate
    do script "cd '$PROJECT_ROOT/backend' && echo '--- BACKEND LOGS ---' && npm run dev"
end tell
EOF

# 4. Frontend in neuem Tab starten
echo "🎨 Starte Frontend in neuem Tab..."
osascript <<EOF
tell application "Terminal"
    activate
    do script "cd '$PROJECT_ROOT/frontend' && echo '--- FRONTEND LOGS ---' && npm run dev"
end tell
EOF

echo ""
echo "✅ Alle Services werden gestartet!"
echo "-------------------------------------------------------"
echo "🌐 Frontend: http://localhost:3000"
echo "🔌 Backend:  http://localhost:4000"
echo "📞 LiveKit:  http://localhost:7880"
echo "-------------------------------------------------------"
echo "Hinweis: Zum Stoppen der Container kannst du 'docker-compose stop' nutzen."
echo "Die Terminal-Tabs kannst du einfach schließen."
