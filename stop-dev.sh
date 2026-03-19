#!/bin/bash

# Voxely Stop Script
# Dieses Script stoppt die Infrastruktur (Docker Container).

echo "🛑 Stoppe Voxely Development Environment..."

# Datenbanken und LiveKit stoppen
docker-compose stop

echo "✅ Infrastruktur gestoppt."
echo "Hinweis: Die Terminal-Tabs für Frontend und Backend musst du händisch schließen."
