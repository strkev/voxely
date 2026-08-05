#!/bin/bash
# ==============================================================================
# Automated NPM Security Audit & Production Auto-Fix Script
# ==============================================================================
# Suitable for cron execution on production server.
# Example Crontab entry (Runs weekly on Sunday at 03:00 AM):
# 0 3 * * 0 /bin/bash /path/to/discord-airbnb-clone/scripts/auto-security-fix.sh >> /var/log/npm-security-auto-fix.log 2>&1
# ==============================================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "=== Starting Production Automated Security Fix ==="
cd "$PROJECT_ROOT"

# 0. Sync clean Git state from origin/main to avoid conflict on future pulls
if [ -d ".git" ]; then
  log "Syncing clean main branch from Git remote..."
  git checkout . || true
  git pull origin main || true
fi

# 1. Frontend Production Vulnerability Fix
if [ -d "$PROJECT_ROOT/frontend" ]; then
  log "Checking Frontend dependencies..."
  cd "$PROJECT_ROOT/frontend"
  npm install --legacy-peer-deps || true
  npm audit fix --legacy-peer-deps || true
  log "Building Frontend..."
  npm run build
fi

# 2. Backend Production Vulnerability Fix
if [ -d "$PROJECT_ROOT/backend" ]; then
  log "Checking Backend dependencies..."
  cd "$PROJECT_ROOT/backend"
  npm install --legacy-peer-deps || true
  npm audit fix --legacy-peer-deps || true
  log "Generating Prisma Client & Building Backend..."
  npm run db:generate || true
  npm run build
fi

# 3. Reload Application Process (PM2 / Docker / Systemd)
cd "$PROJECT_ROOT"
log "Reloading application services..."
if command -v pm2 &> /dev/null; then
  pm2 reload all || pm2 restart all
elif [ -f "docker-compose.yml" ] && command -v docker &> /dev/null; then
  docker compose restart || true
elif systemctl is-active --quiet backend 2>/dev/null; then
  systemctl reload backend || systemctl restart backend
else
  log "Notice: Security updates compiled & built successfully. (No running PM2/Docker/systemctl found to restart)."
fi

log "=== Production Automated Security Fix Completed Successfully ==="
