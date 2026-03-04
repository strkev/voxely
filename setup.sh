#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
#  Voxely — Automated Server Setup
#  Run on a fresh Linux server to set up everything interactively.
#
#  Usage:
#    chmod +x setup.sh
#    ./setup.sh
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ── Helpers ───────────────────────────────────────────────────────────────────
info()    { echo -e "${BLUE}ℹ ${NC} $1"; }
success() { echo -e "${GREEN}✅${NC} $1"; }
warn()    { echo -e "${YELLOW}⚠️ ${NC} $1"; }
error()   { echo -e "${RED}❌${NC} $1"; }
header()  { echo -e "\n${BOLD}${CYAN}═══ $1 ═══${NC}\n"; }

prompt() {
    local var_name="$1"
    local prompt_text="$2"
    local default_value="${3:-}"
    local is_secret="${4:-false}"

    if [ -n "$default_value" ]; then
        prompt_text="${prompt_text} [${default_value}]"
    fi

    if [ "$is_secret" = "true" ]; then
        echo -en "${BOLD}${prompt_text}: ${NC}"
        read -rs value
        echo ""
    else
        echo -en "${BOLD}${prompt_text}: ${NC}"
        read -r value
    fi

    if [ -z "$value" ] && [ -n "$default_value" ]; then
        value="$default_value"
    fi

    eval "$var_name=\"$value\""
}

prompt_yn() {
    local prompt_text="$1"
    local default="${2:-y}"
    local yn_hint="Y/n"
    [ "$default" = "n" ] && yn_hint="y/N"

    echo -en "${BOLD}${prompt_text} [${yn_hint}]: ${NC}"
    read -r answer
    answer="${answer:-$default}"
    [[ "$answer" =~ ^[Yy] ]]
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}"
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║           Voxely — Server Setup                 ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "  This script will set up the complete application."
echo -e "  It will guide you through all configuration steps.\n"

# ══════════════════════════════════════════════════════════════════════════════
# 1. PREREQUISITE CHECKS & AUTO-INSTALLATION
# ══════════════════════════════════════════════════════════════════════════════
header "1/8 — Checking Prerequisites"

# ── Detect package manager ────────────────────────────────────────────────────
PKG_MANAGER=""
if command -v apt-get &>/dev/null; then
    PKG_MANAGER="apt"
elif command -v dnf &>/dev/null; then
    PKG_MANAGER="dnf"
elif command -v yum &>/dev/null; then
    PKG_MANAGER="yum"
fi

if [ -n "$PKG_MANAGER" ]; then
    info "Package manager detected: ${BOLD}${PKG_MANAGER}${NC}"
else
    warn "No supported package manager found (apt/dnf/yum) — automatic installation won't be available"
fi

install_pkg() {
    local pkg_name="$1"
    case "$PKG_MANAGER" in
        apt) sudo apt-get install -y "$pkg_name" ;;
        dnf) sudo dnf install -y "$pkg_name" ;;
        yum) sudo yum install -y "$pkg_name" ;;
    esac
}

# ── Git ───────────────────────────────────────────────────────────────────────
if command -v git &>/dev/null; then
    success "Git found: $(git --version)"
else
    warn "Git not found (recommended)"
    if [ -n "$PKG_MANAGER" ] && prompt_yn "Install Git now?"; then
        info "Installing Git..."
        [ "$PKG_MANAGER" = "apt" ] && sudo apt-get update -qq
        install_pkg git
        success "Git installed: $(git --version)"
    fi
fi

# ── Node.js & npm ─────────────────────────────────────────────────────────────
if command -v node &>/dev/null && command -v npm &>/dev/null; then
    success "Node.js found: $(node -v)"
    success "npm found: v$(npm -v)"
else
    if command -v node &>/dev/null; then
        success "Node.js found: $(node -v)"
    else
        error "Node.js not found"
    fi
    if command -v npm &>/dev/null; then
        success "npm found: v$(npm -v)"
    else
        error "npm not found"
    fi

    if [ -n "$PKG_MANAGER" ]; then
        echo ""
        if prompt_yn "Install Node.js 20.x (LTS) now?"; then
            info "Installing Node.js 20.x..."
            if [ "$PKG_MANAGER" = "apt" ]; then
                curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
                sudo apt-get install -y nodejs
            elif [ "$PKG_MANAGER" = "dnf" ]; then
                curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
                sudo dnf install -y nodejs
            elif [ "$PKG_MANAGER" = "yum" ]; then
                curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
                sudo yum install -y nodejs
            fi

            if command -v node &>/dev/null && command -v npm &>/dev/null; then
                success "Node.js installed: $(node -v)"
                success "npm installed: v$(npm -v)"
            else
                error "Node.js installation failed"
                exit 1
            fi
        else
            echo ""
            error "Node.js and npm are required. Cannot continue without them."
            exit 1
        fi
    else
        echo ""
        error "Node.js and npm are required but no package manager was detected."
        echo -e "  Install manually:"
        echo -e "    ${BOLD}curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -${NC}"
        echo -e "    ${BOLD}sudo apt-get install -y nodejs${NC}"
        exit 1
    fi
fi

# ── Docker ────────────────────────────────────────────────────────────────────
if command -v docker &>/dev/null; then
    success "Docker found: $(docker --version | head -1)"
    DOCKER_AVAILABLE=true
else
    warn "Docker not found"
    DOCKER_AVAILABLE=false

    if [ -n "$PKG_MANAGER" ]; then
        if prompt_yn "Install Docker now?"; then
            info "Installing Docker via official install script..."
            curl -fsSL https://get.docker.com | sudo sh

            # Add current user to docker group so sudo isn't needed
            if getent group docker &>/dev/null; then
                sudo usermod -aG docker "$USER"
                info "Added user '${USER}' to the docker group"
                info "Note: You may need to log out and back in for group changes to take effect"
            fi

            if command -v docker &>/dev/null; then
                sudo systemctl enable docker
                sudo systemctl start docker
                success "Docker installed: $(docker --version | head -1)"
                DOCKER_AVAILABLE=true
            else
                error "Docker installation failed"
                warn "You can install it manually later: https://docs.docker.com/engine/install/"
            fi
        else
            info "Skipping Docker — you'll need to set up PostgreSQL, Redis, and LiveKit manually"
        fi
    else
        info "You can install Docker manually: https://docs.docker.com/engine/install/"
    fi
fi

# ══════════════════════════════════════════════════════════════════════════════
# 2. INFRASTRUCTURE (Docker Services)
# ══════════════════════════════════════════════════════════════════════════════
header "2/8 — Infrastructure Services"

SETUP_DOCKER_SERVICES=false
if [ "$DOCKER_AVAILABLE" = true ]; then
    if prompt_yn "Start PostgreSQL, Redis, and LiveKit via Docker?"; then
        SETUP_DOCKER_SERVICES=true
    fi
fi

if [ "$SETUP_DOCKER_SERVICES" = true ]; then
    # ── PostgreSQL ─────────────────────────────────────────────
    info "Setting up PostgreSQL..."
    prompt PG_USER     "PostgreSQL user"     "postgres"
    prompt PG_PASSWORD "PostgreSQL password"  "postgres" true
    prompt PG_DB       "PostgreSQL database"  "voxely"
    prompt PG_PORT     "PostgreSQL port"      "5432"

    if sudo docker ps -a --format '{{.Names}}' | grep -q '^dc-postgres$'; then
        warn "Container 'dc-postgres' already exists  — skipping creation"
        sudo docker start dc-postgres 2>/dev/null || true
    else
        sudo docker run -d --name dc-postgres \
            -e POSTGRES_USER="${PG_USER}" \
            -e POSTGRES_PASSWORD="${PG_PASSWORD}" \
            -e POSTGRES_DB="${PG_DB}" \
            -p "127.0.0.1:${PG_PORT}:5432" \
            -v dc-postgres-data:/var/lib/postgresql/data \
            --restart unless-stopped \
            postgres:16
        success "PostgreSQL started on port ${PG_PORT}"
    fi

    DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@localhost:${PG_PORT}/${PG_DB}?schema=public"

    # ── Redis ──────────────────────────────────────────────────
    info "Setting up Redis..."
    prompt REDIS_PORT "Redis port" "6379"

    if sudo docker ps -a --format '{{.Names}}' | grep -q '^dc-redis$'; then
        warn "Container 'dc-redis' already exists — skipping creation"
        sudo docker start dc-redis 2>/dev/null || true
    else
        sudo docker run -d --name dc-redis \
            -p "127.0.0.1:${REDIS_PORT}:6379" \
            --restart unless-stopped \
            redis:7-alpine
        success "Redis started on port ${REDIS_PORT}"
    fi

    REDIS_URL="redis://localhost:${REDIS_PORT}"

    # ── LiveKit ────────────────────────────────────────────────
    info "Setting up LiveKit..."
    prompt LK_API_KEY    "LiveKit API Key"    "devkey_$(openssl rand -hex 4)"
    prompt LK_API_SECRET "LiveKit API Secret" "$(openssl rand -hex 24)" true
    prompt LK_PORT       "LiveKit port"       "7880"

    if sudo docker ps -a --format '{{.Names}}' | grep -q '^dc-livekit$'; then
        warn "Container 'dc-livekit' already exists — skipping creation"
        sudo docker start dc-livekit 2>/dev/null || true
    else
        sudo docker run -d --name dc-livekit \
            -p "${LK_PORT}:7880" \
            -p 7881:7881 \
            -p 7882:7882/udp \
            -e "LIVEKIT_KEYS=${LK_API_KEY}: ${LK_API_SECRET}" \
            --restart unless-stopped \
            livekit/livekit-server \
            --dev
        success "LiveKit started on port ${LK_PORT}"
    fi

else
    # ── Manual configuration ───────────────────────────────────
    info "Configuring connections to existing services..."

    prompt DATABASE_URL   "PostgreSQL connection URL" "postgresql://postgres:postgres@localhost:5432/voxely?schema=public"
    prompt REDIS_URL      "Redis URL (leave empty to disable)" "redis://localhost:6379"
    prompt LK_API_KEY     "LiveKit API Key" ""
    prompt LK_API_SECRET  "LiveKit API Secret" "" true
    prompt LK_PORT        "LiveKit server port" "7880"
fi

# ══════════════════════════════════════════════════════════════════════════════
# 3. APPLICATION CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════
header "3/8 — Application Configuration"

# Server IP / Domain
info "Determine the address other devices will use to reach this server."
info "This can be an IP (e.g. 192.168.1.100) or a domain (e.g. app.example.com)."
echo ""

DEFAULT_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
prompt SERVER_HOST "Server IP or domain" "${DEFAULT_IP}"

prompt BACKEND_PORT "Backend API port" "4000"

# Protocol
SETUP_NGINX=false
USE_LETSENCRYPT=false
SSL_CERT_PATH=""
SSL_KEY_PATH=""
LE_EMAIL=""

if prompt_yn "Is this a production setup with HTTPS/TLS?" "n"; then
    PROTO_HTTP="https"
    PROTO_WS="wss"
    FRONTEND_PORT="443"
    info "Using HTTPS/WSS"
    echo ""
    if prompt_yn "Configure Nginx reverse proxy with SSL automatically?"; then
        SETUP_NGINX=true
        echo ""
        echo -e "  ${BOLD}How do you want to provide the SSL certificate?${NC}"
        echo -e "    ${BOLD}1)${NC} Let's Encrypt (fully automatic — recommended)"
        echo -e "    ${BOLD}2)${NC} Manual (provide your own certificate files)"
        echo ""
        prompt SSL_CHOICE "Choose [1/2]" "1"

        if [ "$SSL_CHOICE" = "1" ]; then
            USE_LETSENCRYPT=true
            info "Let's Encrypt selected — certbot will handle everything"
            echo ""
            prompt LE_EMAIL "Email for Let's Encrypt notifications (required)" ""
            if [ -z "$LE_EMAIL" ]; then
                error "An email address is required for Let's Encrypt."
                exit 1
            fi
            # Cert paths will be set by certbot automatically
            SSL_CERT_PATH="/etc/letsencrypt/live/${SERVER_HOST}/fullchain.pem"
            SSL_KEY_PATH="/etc/letsencrypt/live/${SERVER_HOST}/privkey.pem"
        else
            echo ""
            info "Enter the paths to your SSL certificate and private key."
            info "These files must be present on this server."
            echo ""
            prompt SSL_CERT_PATH "Path to SSL certificate (fullchain.pem)" "/etc/ssl/certs/fullchain.pem"
            prompt SSL_KEY_PATH  "Path to SSL private key (privkey.pem)"   "/etc/ssl/private/privkey.pem"
            echo ""
            if [ -f "$SSL_CERT_PATH" ]; then
                success "Certificate found: ${SSL_CERT_PATH}"
            else
                warn "Certificate not found at ${SSL_CERT_PATH} — Nginx config will be created anyway"
            fi
            if [ -f "$SSL_KEY_PATH" ]; then
                success "Private key found: ${SSL_KEY_PATH}"
            else
                warn "Private key not found at ${SSL_KEY_PATH} — Nginx config will be created anyway"
            fi
        fi
    else
        info "Make sure your reverse proxy is configured manually"
    fi
else
    PROTO_HTTP="http"
    PROTO_WS="ws"
    prompt FRONTEND_PORT "Frontend port" "3000"
fi

# Construct URLs
if [ "$PROTO_HTTP" = "https" ] && [ "$FRONTEND_PORT" = "443" ]; then
    FRONTEND_URL="${PROTO_HTTP}://${SERVER_HOST}"
else
    FRONTEND_URL="${PROTO_HTTP}://${SERVER_HOST}:${FRONTEND_PORT}"
fi

if [ "$SETUP_NGINX" = true ]; then
    # With Nginx: frontend API calls go through the reverse proxy
    API_URL="${PROTO_HTTP}://${SERVER_HOST}"
    # LiveKit WSS proxied through Nginx on port 7443
    LK_PROXY_PORT="7443"
    LIVEKIT_WS_URL="${PROTO_WS}://${SERVER_HOST}:${LK_PROXY_PORT}"
else
    API_URL="${PROTO_HTTP}://${SERVER_HOST}:${BACKEND_PORT}"
    LIVEKIT_WS_URL="${PROTO_WS}://${SERVER_HOST}:${LK_PORT}"
fi

# Also allow localhost for CORS
ALLOWED_ORIGINS="${FRONTEND_URL},http://localhost:3000"

# Security secrets
echo ""
info "Security configuration — secrets will be hidden while typing."
echo ""

DEFAULT_JWT=$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64)
prompt JWT_SECRET    "JWT Secret (auto-generated if empty)" "${DEFAULT_JWT}" true

DEFAULT_ADMIN=$(openssl rand -hex 16 2>/dev/null || head -c 16 /dev/urandom | xxd -p)
prompt ADMIN_SECRET  "Admin API Secret" "${DEFAULT_ADMIN}" true

prompt INVITE_CODES  "Invite codes for registration (comma-separated, empty = open registration)" ""

# ══════════════════════════════════════════════════════════════════════════════
# 4. WRITE .env FILES
# ══════════════════════════════════════════════════════════════════════════════
header "4/8 — Writing Configuration Files"

# ── Backend .env ───────────────────────────────────────────────────────────────
BACKEND_ENV="${SCRIPT_DIR}/backend/.env"

if [ -f "$BACKEND_ENV" ]; then
    cp "$BACKEND_ENV" "${BACKEND_ENV}.backup.$(date +%s)"
    warn "Existing backend/.env backed up"
fi

cat > "$BACKEND_ENV" << ENVEOF
# ── Database ──────────────────────────────────────
DATABASE_URL="${DATABASE_URL}"

# ── Authentication ────────────────────────────────
JWT_SECRET="${JWT_SECRET}"

# ── Server ────────────────────────────────────────
PORT=${BACKEND_PORT}

# ── LiveKit ───────────────────────────────────────
LIVEKIT_API_KEY="${LK_API_KEY}"
LIVEKIT_API_SECRET="${LK_API_SECRET}"
LIVEKIT_WS_URL="${LIVEKIT_WS_URL}"

# ── CORS ──────────────────────────────────────────
ALLOWED_ORIGINS="${ALLOWED_ORIGINS}"

# ── Registration ──────────────────────────────────
INVITE_CODES="${INVITE_CODES}"

# ── Admin ─────────────────────────────────────────
ADMIN_SECRET="${ADMIN_SECRET}"

# ── Redis ─────────────────────────────────────────
REDIS_URL="${REDIS_URL}"
ENVEOF

success "Created backend/.env"

# ── Frontend .env.local ────────────────────────────────────────────────────────
FRONTEND_ENV="${SCRIPT_DIR}/frontend/.env.local"

if [ -f "$FRONTEND_ENV" ]; then
    cp "$FRONTEND_ENV" "${FRONTEND_ENV}.backup.$(date +%s)"
    warn "Existing frontend/.env.local backed up"
fi

cat > "$FRONTEND_ENV" << ENVEOF
# Backend API URL
NEXT_PUBLIC_API_URL=${API_URL}

# LiveKit server URL
NEXT_PUBLIC_LIVEKIT_URL=${LIVEKIT_WS_URL}
ENVEOF

success "Created frontend/.env.local"

# ══════════════════════════════════════════════════════════════════════════════
# 5. INSTALL DEPENDENCIES & BUILD
# ══════════════════════════════════════════════════════════════════════════════
header "5/8 — Installing Dependencies & Building"

# ── Backend ────────────────────────────────────────────────────────────────────
info "Installing backend dependencies..."
cd "${SCRIPT_DIR}/backend"
npm install --production=false
success "Backend dependencies installed"

info "Generating Prisma client..."
npx prisma generate
success "Prisma client generated"

# Wait for PostgreSQL to be ready
if [ "$SETUP_DOCKER_SERVICES" = true ]; then
    info "Waiting for PostgreSQL to be ready..."
    for i in $(seq 1 30); do
        if sudo docker exec dc-postgres pg_isready -U "${PG_USER}" &>/dev/null; then
            break
        fi
        sleep 1
    done
fi

info "Pushing database schema..."
npx prisma db push --accept-data-loss
success "Database schema synchronized"

info "Building backend..."
npm run build
success "Backend built"

# ── Frontend ───────────────────────────────────────────────────────────────────
info "Installing frontend dependencies..."
cd "${SCRIPT_DIR}/frontend"
npm install
success "Frontend dependencies installed"

info "Building frontend (this may take a minute)..."
npm run build
success "Frontend built"

# ══════════════════════════════════════════════════════════════════════════════
# 6. NGINX & SSL CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════
if [ "$SETUP_NGINX" = true ]; then
    header "6/8 — Nginx & SSL Configuration"

    # Install Nginx if not present
    if ! command -v nginx &>/dev/null; then
        info "Installing Nginx..."
        sudo apt-get update -qq
        sudo apt-get install -y nginx
        success "Nginx installed"
    else
        success "Nginx found: $(nginx -v 2>&1)"
    fi

    NGINX_CONF="/etc/nginx/sites-available/voxely"

    if [ "$USE_LETSENCRYPT" = true ]; then
        # ── Let's Encrypt flow ────────────────────────────────────────────────
        # 1. Install certbot + nginx plugin
        info "Installing certbot..."
        if [ "$PKG_MANAGER" = "apt" ]; then
            sudo apt-get update -qq
            sudo apt-get install -y certbot python3-certbot-nginx
        elif [ "$PKG_MANAGER" = "dnf" ]; then
            sudo dnf install -y certbot python3-certbot-nginx
        elif [ "$PKG_MANAGER" = "yum" ]; then
            sudo yum install -y certbot python3-certbot-nginx
        fi
        success "certbot installed"

        # 2. Write initial HTTP-only Nginx config (certbot needs this to verify the domain)
        info "Writing initial HTTP Nginx config for certbot verification..."

        sudo tee "$NGINX_CONF" > /dev/null <<NGINXEOF
# ── Voxely — Nginx Reverse Proxy (initial HTTP config for certbot) ────────
# Generated by setup.sh on $(date)
# certbot will automatically add SSL configuration to this file.

server {
    listen 80;
    server_name ${SERVER_HOST};

    # Frontend (Next.js)
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Socket.IO
    location /socket.io/ {
        proxy_pass http://localhost:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
NGINXEOF

        # Enable site
        if [ -L "/etc/nginx/sites-enabled/voxely" ]; then
            sudo rm /etc/nginx/sites-enabled/voxely
        fi
        sudo ln -s "$NGINX_CONF" /etc/nginx/sites-enabled/voxely

        if [ -L "/etc/nginx/sites-enabled/default" ]; then
            sudo rm /etc/nginx/sites-enabled/default
            info "Removed default Nginx site to avoid conflicts"
        fi

        # Start Nginx with HTTP config
        if sudo nginx -t 2>&1; then
            sudo systemctl restart nginx
            success "Nginx running with HTTP config"
        else
            error "Nginx config test failed"
            exit 1
        fi

        # 3. Run certbot to obtain certificate and auto-configure Nginx for SSL
        echo ""
        info "Requesting Let's Encrypt certificate for ${BOLD}${SERVER_HOST}${NC}..."
        info "Make sure port 80 is open and the domain points to this server!"
        echo ""

        if sudo certbot --nginx \
            -d "${SERVER_HOST}" \
            --non-interactive \
            --agree-tos \
            --email "${LE_EMAIL}" \
            --redirect; then
            success "Let's Encrypt certificate obtained and Nginx configured for SSL!"

            # Update cert paths (certbot sets these, but we store them for reference)
            SSL_CERT_PATH="/etc/letsencrypt/live/${SERVER_HOST}/fullchain.pem"
            SSL_KEY_PATH="/etc/letsencrypt/live/${SERVER_HOST}/privkey.pem"
        else
            error "certbot failed to obtain certificate"
            warn "Common causes:"
            echo -e "    • Port 80 is not open in your firewall"
            echo -e "    • Domain ${BOLD}${SERVER_HOST}${NC} does not point to this server's IP"
            echo -e "    • Rate limit reached (try again later)"
            echo ""
            warn "You can retry manually: ${BOLD}sudo certbot --nginx -d ${SERVER_HOST}${NC}"
        fi

        # 4. Add LiveKit WSS proxy block (certbot doesn't know about this)
        #    We append a separate server block for LiveKit on port 7443
        info "Adding LiveKit WSS proxy configuration..."
        sudo tee -a "$NGINX_CONF" > /dev/null <<LKEOF

# LiveKit WebSocket (WSS on port ${LK_PROXY_PORT})
server {
    listen ${LK_PROXY_PORT} ssl;
    server_name ${SERVER_HOST};

    ssl_certificate     ${SSL_CERT_PATH};
    ssl_certificate_key ${SSL_KEY_PATH};

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://localhost:${LK_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
LKEOF

        # Reload Nginx with the LiveKit block
        if sudo nginx -t 2>&1; then
            sudo systemctl reload nginx
            success "Nginx reloaded with LiveKit WSS proxy"
        else
            warn "Nginx config test failed after adding LiveKit block — check ${NGINX_CONF}"
        fi

        # 5. Set up auto-renewal cron/timer
        info "Setting up automatic certificate renewal..."
        if sudo systemctl list-timers | grep -q certbot; then
            success "certbot renewal timer already active"
        else
            # Enable the certbot timer (installed by package)
            sudo systemctl enable --now certbot.timer 2>/dev/null || \
                (echo "0 3 * * * root certbot renew --quiet --post-hook 'systemctl reload nginx'" | sudo tee /etc/cron.d/certbot-renew > /dev/null && \
                success "Created cron job for certificate renewal (daily at 3 AM)")
        fi

    else
        # ── Manual certificate flow ───────────────────────────────────────────
        info "Writing Nginx config to ${NGINX_CONF}..."

        sudo tee "$NGINX_CONF" > /dev/null <<NGINXEOF
# ── Voxely — Nginx Reverse Proxy ──────────────────────────────────────────
# Generated by setup.sh on $(date)

# HTTP → HTTPS Redirect
server {
    listen 80;
    server_name ${SERVER_HOST};
    return 301 https://\$host\$request_uri;
}

# Main Application (HTTPS)
server {
    listen 443 ssl;
    server_name ${SERVER_HOST};

    ssl_certificate     ${SSL_CERT_PATH};
    ssl_certificate_key ${SSL_KEY_PATH};

    # SSL Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Frontend (Next.js)
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Socket.IO
    location /socket.io/ {
        proxy_pass http://localhost:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}

# LiveKit WebSocket (WSS on port 7443)
server {
    listen ${LK_PROXY_PORT} ssl;
    server_name ${SERVER_HOST};

    ssl_certificate     ${SSL_CERT_PATH};
    ssl_certificate_key ${SSL_KEY_PATH};

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://localhost:${LK_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
NGINXEOF

        success "Nginx config written"

        # Enable site
        if [ -L "/etc/nginx/sites-enabled/voxely" ]; then
            sudo rm /etc/nginx/sites-enabled/voxely
        fi
        sudo ln -s "$NGINX_CONF" /etc/nginx/sites-enabled/voxely

        # Remove default site if it exists
        if [ -L "/etc/nginx/sites-enabled/default" ]; then
            sudo rm /etc/nginx/sites-enabled/default
            info "Removed default Nginx site to avoid conflicts"
        fi

        # Test and restart
        if sudo nginx -t 2>&1; then
            sudo systemctl restart nginx
            success "Nginx configured and running"
        else
            error "Nginx config test failed — check your SSL certificate paths"
            warn "You can fix the config at ${NGINX_CONF} and run: sudo nginx -t && sudo systemctl restart nginx"
        fi
    fi

    echo ""
    warn "Make sure these ports are open in your firewall:"
    echo -e "    ${BOLD}80${NC}         — HTTP (required for Let's Encrypt renewal)"
    echo -e "    ${BOLD}443${NC}        — HTTPS (frontend + backend)"
    echo -e "    ${BOLD}${LK_PROXY_PORT}${NC}       — LiveKit WebSocket (WSS)"
    echo -e "    ${BOLD}7882/udp${NC}   — LiveKit media (must be open directly, not proxied)"
    echo ""
else
    if [ "$PROTO_HTTP" = "https" ]; then
        info "Skipping Nginx setup (manual configuration)"
    fi
fi

# ══════════════════════════════════════════════════════════════════════════════
# 7. FIREWALL CONFIGURATION (UFW)
# ══════════════════════════════════════════════════════════════════════════════
header "7/8 — Firewall Configuration"

SETUP_FIREWALL=false

if command -v ufw &>/dev/null; then
    info "UFW (Uncomplicated Firewall) detected"
    if prompt_yn "Configure firewall rules now?"; then
        SETUP_FIREWALL=true
    fi
else
    if [ -n "$PKG_MANAGER" ]; then
        if prompt_yn "Install and configure UFW firewall? (recommended for security)" "y"; then
            info "Installing UFW..."
            install_pkg ufw
            if command -v ufw &>/dev/null; then
                success "UFW installed"
                SETUP_FIREWALL=true
            else
                error "UFW installation failed"
            fi
        fi
    else
        warn "UFW not found and no package manager available — skipping firewall setup"
    fi
fi

if [ "$SETUP_FIREWALL" = true ]; then
    info "Configuring firewall rules..."
    echo ""

    # ── Default policies ──────────────────────────────────────
    sudo ufw default deny incoming
    sudo ufw default allow outgoing
    info "Default policy: deny incoming, allow outgoing"

    # ── SSH (always needed) ───────────────────────────────────
    sudo ufw allow 22/tcp comment 'SSH'
    success "Allowed: 22/tcp (SSH)"

    if [ "$SETUP_NGINX" = true ] || [ "$PROTO_HTTP" = "https" ]; then
        # ── HTTPS Production Setup ────────────────────────────
        sudo ufw allow 80/tcp comment 'HTTP (redirect + Lets Encrypt)'
        success "Allowed: 80/tcp (HTTP — redirect & Let's Encrypt renewal)"

        sudo ufw allow 443/tcp comment 'HTTPS (Frontend + Backend via Nginx)'
        success "Allowed: 443/tcp (HTTPS — frontend & backend)"

        if [ -n "${LK_PROXY_PORT:-}" ]; then
            sudo ufw allow "${LK_PROXY_PORT}/tcp" comment 'LiveKit WSS proxy'
            success "Allowed: ${LK_PROXY_PORT}/tcp (LiveKit WebSocket via Nginx)"
        fi
    else
        # ── HTTP Development / Simple Setup ───────────────────
        sudo ufw allow "${FRONTEND_PORT}/tcp" comment 'Frontend'
        success "Allowed: ${FRONTEND_PORT}/tcp (Frontend)"

        sudo ufw allow "${BACKEND_PORT}/tcp" comment 'Backend API'
        success "Allowed: ${BACKEND_PORT}/tcp (Backend API)"

        sudo ufw allow "${LK_PORT}/tcp" comment 'LiveKit WebSocket'
        success "Allowed: ${LK_PORT}/tcp (LiveKit WebSocket)"
    fi

    # ── LiveKit media (always needed, UDP) ────────────────────
    sudo ufw allow 7882/udp comment 'LiveKit media (WebRTC)'
    success "Allowed: 7882/udp (LiveKit media / WebRTC)"

    # ── Explicitly deny access to internal-only services ─────
    # These should only be reachable from localhost (Docker already binds to 127.0.0.1)
    if [ "$SETUP_DOCKER_SERVICES" = true ]; then
        sudo ufw deny "${PG_PORT}/tcp" comment 'PostgreSQL (internal only)'
        info "Denied:  ${PG_PORT}/tcp (PostgreSQL — internal only, bound to 127.0.0.1)"

        sudo ufw deny "${REDIS_PORT}/tcp" comment 'Redis (internal only)'
        info "Denied:  ${REDIS_PORT}/tcp (Redis — internal only, bound to 127.0.0.1)"
    fi

    echo ""

    # ── Enable UFW ────────────────────────────────────────────
    sudo ufw --force enable
    success "UFW firewall enabled"

    echo ""
    info "Current firewall status:"
    sudo ufw status verbose
    echo ""
else
    echo ""
    warn "Firewall was not configured. We recommend setting up firewall rules."
    if [ "$SETUP_NGINX" = true ] || [ "$PROTO_HTTP" = "https" ]; then
        echo -e "  Recommended rules for your HTTPS setup:"
        echo -e "    ${BOLD}sudo ufw allow 22/tcp${NC}            — SSH"
        echo -e "    ${BOLD}sudo ufw allow 80/tcp${NC}            — HTTP (Let's Encrypt)"
        echo -e "    ${BOLD}sudo ufw allow 443/tcp${NC}           — HTTPS"
        if [ -n "${LK_PROXY_PORT:-}" ]; then
            echo -e "    ${BOLD}sudo ufw allow ${LK_PROXY_PORT}/tcp${NC}          — LiveKit WSS"
        fi
        echo -e "    ${BOLD}sudo ufw allow 7882/udp${NC}          — LiveKit media"
        echo -e "    ${BOLD}sudo ufw deny ${PG_PORT:-5432}/tcp${NC}           — Block PostgreSQL"
        echo -e "    ${BOLD}sudo ufw deny ${REDIS_PORT:-6379}/tcp${NC}          — Block Redis"
        echo -e "    ${BOLD}sudo ufw default deny incoming${NC}"
        echo -e "    ${BOLD}sudo ufw default allow outgoing${NC}"
        echo -e "    ${BOLD}sudo ufw --force enable${NC}"
    else
        echo -e "  Recommended rules for your HTTP setup:"
        echo -e "    ${BOLD}sudo ufw allow 22/tcp${NC}            — SSH"
        echo -e "    ${BOLD}sudo ufw allow ${FRONTEND_PORT}/tcp${NC}          — Frontend"
        echo -e "    ${BOLD}sudo ufw allow ${BACKEND_PORT}/tcp${NC}          — Backend"
        echo -e "    ${BOLD}sudo ufw allow ${LK_PORT}/tcp${NC}          — LiveKit WS"
        echo -e "    ${BOLD}sudo ufw allow 7882/udp${NC}          — LiveKit media"
        echo -e "    ${BOLD}sudo ufw deny ${PG_PORT:-5432}/tcp${NC}           — Block PostgreSQL"
        echo -e "    ${BOLD}sudo ufw deny ${REDIS_PORT:-6379}/tcp${NC}          — Block Redis"
        echo -e "    ${BOLD}sudo ufw default deny incoming${NC}"
        echo -e "    ${BOLD}sudo ufw default allow outgoing${NC}"
        echo -e "    ${BOLD}sudo ufw --force enable${NC}"
    fi
    echo ""
fi

# ══════════════════════════════════════════════════════════════════════════════
# 8. START / PM2 SETUP
# ══════════════════════════════════════════════════════════════════════════════
header "8/8 — Starting the Application"

START_METHOD="manual"

if command -v pm2 &>/dev/null; then
    info "PM2 detected"
    if prompt_yn "Use PM2 to manage processes?"; then
        START_METHOD="pm2"
    fi
else
    if prompt_yn "Install PM2 (recommended process manager for production)?" "n"; then
        sudo npm install -g pm2
        START_METHOD="pm2"
        success "PM2 installed"
    fi
fi

cd "${SCRIPT_DIR}"

if [ "$START_METHOD" = "pm2" ]; then
    # Create PM2 ecosystem file
    cat > "${SCRIPT_DIR}/ecosystem.config.cjs" << 'PM2EOF'
module.exports = {
    apps: [
        {
            name: 'dc-backend',
            cwd: './backend',
            script: 'dist/index.js',
            env: {
                NODE_ENV: 'production',
            },
            instances: 1,
            autorestart: true,
            max_memory_restart: '512M',
        },
        {
            name: 'dc-frontend',
            cwd: './frontend',
            script: 'node_modules/.bin/next',
            args: 'start',
            env: {
                NODE_ENV: 'production',
            },
            instances: 1,
            autorestart: true,
            max_memory_restart: '512M',
        },
    ],
};
PM2EOF

    success "Created ecosystem.config.cjs"

    pm2 delete dc-backend dc-frontend 2>/dev/null || true
    pm2 start ecosystem.config.cjs
    pm2 save

    success "Application started with PM2"
    echo ""
    info "Useful PM2 commands:"
    echo -e "    ${BOLD}pm2 status${NC}           — Show process status"
    echo -e "    ${BOLD}pm2 logs${NC}             — Show logs (all processes)"
    echo -e "    ${BOLD}pm2 logs dc-backend${NC}  — Show backend logs"
    echo -e "    ${BOLD}pm2 restart all${NC}      — Restart all processes"
    echo -e "    ${BOLD}pm2 stop all${NC}         — Stop all processes"
    echo -e "    ${BOLD}pm2 startup${NC}          — Auto-start on boot"
    echo ""

else
    info "You can start the application manually:"
    echo ""
    echo -e "    ${BOLD}# Terminal 1 — Backend${NC}"
    echo -e "    cd ${SCRIPT_DIR}/backend"
    echo -e "    npm run start"
    echo ""
    echo -e "    ${BOLD}# Terminal 2 — Frontend${NC}"
    echo -e "    cd ${SCRIPT_DIR}/frontend"
    echo -e "    npm run start"
    echo ""

    if prompt_yn "Start both servers now in the background?"; then
        cd "${SCRIPT_DIR}/backend"
        nohup npm run start > "${SCRIPT_DIR}/backend.log" 2>&1 &
        BACKEND_PID=$!
        success "Backend started (PID: ${BACKEND_PID}, log: backend.log)"

        cd "${SCRIPT_DIR}/frontend"
        nohup npm run start > "${SCRIPT_DIR}/frontend.log" 2>&1 &
        FRONTEND_PID=$!
        success "Frontend started (PID: ${FRONTEND_PID}, log: frontend.log)"
    fi
fi

# ══════════════════════════════════════════════════════════════════════════════
# DONE
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${GREEN}"
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║            ✅ Setup Complete!                     ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "  ${BOLD}Frontend:${NC}  ${FRONTEND_URL}"
echo -e "  ${BOLD}Backend:${NC}   ${API_URL}"
echo -e "  ${BOLD}LiveKit:${NC}   ${LIVEKIT_WS_URL}"
echo -e "  ${BOLD}Health:${NC}    curl ${API_URL}/health"
echo ""

if [ "${PROTO_HTTP}" = "http" ]; then
    warn "You are using HTTP. For production, set up a reverse proxy with HTTPS!"
    echo -e "  See ${BOLD}README.md${NC} for an example Nginx configuration."
    echo ""
elif [ "$SETUP_NGINX" = true ]; then
    success "Nginx reverse proxy with SSL is active"
    echo -e "  ${BOLD}Nginx config:${NC}  ${NGINX_CONF}"
    echo ""
fi

if [ -n "${INVITE_CODES}" ]; then
    info "Registration requires invite code: ${BOLD}${INVITE_CODES}${NC}"
else
    warn "Open registration is enabled (no invite code required)"
fi

echo ""
success "Done! Open ${FRONTEND_URL} in your browser."
echo ""
