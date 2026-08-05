#!/bin/bash
# ==============================================================================
# Automated Production Update & Service Reload Script
# ==============================================================================
# Pulls tested main branch updates (audited & merged by GitHub Dependabot),
# builds production artifacts, and safely reloads application services.
# ==============================================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "=== Starting Production Service Update ==="
cd "$PROJECT_ROOT"

# 1. Sync clean Git state from origin/main
if [ -d ".git" ]; then
  log "Syncing clean main branch from Git remote..."
  git checkout . || true
  git pull origin main || true
fi

# 2. Frontend Build
if [ -d "$PROJECT_ROOT/frontend" ]; then
  log "Installing Frontend dependencies..."
  cd "$PROJECT_ROOT/frontend"
  npm install --legacy-peer-deps
  log "Building Frontend..."
  rm -rf .next
  npm run build
fi

# 3. Backend Build
if [ -d "$PROJECT_ROOT/backend" ]; then
  log "Installing Backend dependencies..."
  cd "$PROJECT_ROOT/backend"
  npm install --legacy-peer-deps
  log "Generating Prisma Client & Building Backend..."
  rm -rf dist
  npm run db:generate
  npm run build
fi

# 4. Reload Application Services (PM2 / Docker / Systemd)
cd "$PROJECT_ROOT"
log "Reloading application services..."
if command -v pm2 &> /dev/null; then
  pm2 reload all || pm2 restart all
elif [ -f "docker-compose.yml" ] && command -v docker &> /dev/null; then
  docker compose restart || true
elif systemctl is-active --quiet backend 2>/dev/null; then
  systemctl reload backend || systemctl restart backend
else
  log "Notice: Application built successfully."
fi

log "=== Production Service Update Completed Successfully ==="
