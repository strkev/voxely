# Voxely

Sichere, Echtzeit-Voice/Video/Chat-Plattform mit minimalistischem UI und PWA-Support.

> Detaillierte Architektur- und Tech-Stack-Dokumentation → [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## Features

- 🔒 **Sicherheit:** Ende-zu-Ende verschlüsselte Felder (Prisma Field Encryption), JWT-Blacklisting via Redis, XSS-Schutz.
- 📱 **PWA:** Installierbar als App auf Desktop und Mobile mit Offline-Caching.
- 🎙️ **Echtzeit-Kommunikation:** Hochwertige Video- und Audio-Streams via LiveKit (WebRTC).
- 💬 **Echtzeit-Chat:** Instant-Messaging mit Socket.IO.
- 🎨 **Modernes UI:** Minimalistisches Design mit Tailwind CSS 4 und Framer Motion Animationen.

---

## Voraussetzungen

Stelle sicher, dass folgende Dienste installiert und verfügbar sind:

| Dienst | Benötigte Version | Hinweis |
|---|---|---|
| **Node.js** | ≥ 18 (empf. 20+) | `node -v` zum Prüfen |
| **npm** | ≥ 9 | Kommt mit Node.js mit |
| **PostgreSQL** | ≥ 14 | Muss laufen (z.B. via Docker oder lokal) |
| **Redis** | ≥ 7 | Optional, aber empfohlen (JWT-Blacklisting) |
| **LiveKit Server** | ≥ 1.5 | Muss laufen für Video/Audio |

---

## 🚀 Automatisches Setup (empfohlen)

Für Linux-Server gibt es ein interaktives Setup-Script, das alles automatisch einrichtet:

```bash
chmod +x setup.sh
./setup.sh
```

Das Script macht folgendes:
- ✅ Prüft Voraussetzungen (Node.js, Docker)
- ✅ Startet PostgreSQL, Redis und LiveKit via Docker (optional)
- ✅ Fragt alle Konfigurationswerte interaktiv ab
- ✅ Generiert sichere Secrets automatisch (JWT, Admin, Prisma Encryption)
- ✅ Erstellt `.env`-Dateien (bestehende werden gesichert)
- ✅ Installiert Dependencies und baut beide Apps
- ✅ Richtet PM2 ein (optional, für Produktionsbetrieb)

> **Hinweis:** Bestehende `.env`-Dateien werden automatisch als `.env.backup.<timestamp>` gesichert.

---

## Schnellstart (Manuelle Einrichtung)

### 1. Repository klonen

```bash
git clone <repo-url-hier-einfuegen>
cd voxely
```

### 2. PostgreSQL starten

```bash
# Beispiel mit Docker:
docker run -d --name postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=voxely \
  -p 127.0.0.1:5432:5432 \
  -v voxely-postgres-data:/var/lib/postgresql/data \
  postgres:16
```

### 3. Redis starten (optional, empfohlen)

```bash
# Beispiel mit Docker:
docker run -d --name redis -p 127.0.0.1:6379:6379 redis:7-alpine
```

### 4. LiveKit Server starten

```bash
# Beispiel mit Docker:
docker run -d --name livekit \
  -p 7880:7880 \
  -p 7881:7881 \
  -p 7882:7882/udp \
  -e LIVEKIT_KEYS="mein_eigener_api_key_4455: mein_super_geheimes_livekit_passwort_das_lang_genug_ist_8923" \
  livekit/livekit-server \
  --dev
```

> Die `LIVEKIT_KEYS` müssen mit `LIVEKIT_API_KEY` und `LIVEKIT_API_SECRET` in der Backend-`.env` übereinstimmen!

### 5. Backend einrichten

```bash
cd backend
npm install
```

Erstelle/bearbeite die `.env`-Datei:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/voxely?schema=public"
JWT_SECRET="ein-sicherer-geheimschluessel-hier-aendern"
PORT=4000
LIVEKIT_API_KEY="mein_eigener_api_key_4455"
LIVEKIT_API_SECRET="mein_super_geheimes_livekit_passwort_das_lang_genug_ist_8923"
LIVEKIT_WS_URL="ws://localhost:7880"
ALLOWED_ORIGINS="http://localhost:3000"
INVITE_CODES="mein-invite-code"
ADMIN_SECRET="mein-admin-secret"
```

Datenbank synchronisieren und Server starten:

```bash
npx prisma generate     # Prisma-Client generieren
npx prisma db push      # Schema zur Datenbank pushen
npm run dev              # Server starten (Port 4000)
```

### 6. Frontend einrichten

```bash
cd ../frontend
npm install
```

Erstelle/bearbeite die `.env.local`-Datei:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
```

Frontend starten:

```bash
npm run dev              # Next.js Dev-Server (Port 3000)
```

### 7. App öffnen

Öffne [http://localhost:3000](http://localhost:3000) im Browser.

---

## Zugriff von anderen Geräten im LAN

Damit andere Geräte im gleichen Netzwerk (z.B. Handy, zweiter PC) auf die App zugreifen können:

1. **IP herausfinden** (macOS):
   ```bash
   ipconfig getifaddr en0
   ```

2. **Backend `.env`** anpassen – eigene IP zu `ALLOWED_ORIGINS` hinzufügen:
   ```env
   ALLOWED_ORIGINS="http://localhost:3000,http://DEINE-IP:3000"
   ```

3. **Frontend `.env.local`** anpassen:
   ```env
   NEXT_PUBLIC_API_URL=http://DEINE-IP:4000
   NEXT_PUBLIC_LIVEKIT_URL=ws://DEINE-IP:7880
   ```

4. **LiveKit** muss ebenfalls auf der richtigen IP erreichbar sein.

5. Von anderen Geräten: `http://DEINE-IP:3000` im Browser öffnen.

---

## Serverbetrieb (Produktion)

### ⚠️ Sicherheits-Checkliste

Bevor die App auf einem Server deployed wird, **müssen** folgende Punkte beachtet werden:

- [ ] **`JWT_SECRET` ändern** – Der Default-Wert ist unsicher. Verwende einen langen, zufälligen String (mind. 32 Zeichen).
- [ ] **`ADMIN_SECRET` ändern** – Eigenes, starkes Geheimnis setzen.
- [ ] **`INVITE_CODES` ändern** – Eigene Einladungscodes setzen oder entfernen für offene Registrierung.
- [ ] **`ALLOWED_ORIGINS` einschränken** – Nur die tatsächliche Domain des Frontends erlauben (z.B. `https://meine-domain.de`).
- [ ] **HTTPS aktivieren** – WebRTC (Kamera/Mikrofon) funktioniert nur über HTTPS oder localhost. Verwende einen Reverse-Proxy wie Nginx oder Caddy mit SSL-Zertifikat.
- [ ] **Redis bereitstellen** – Für JWT-Blacklisting (Logout-Absicherung) ist Redis erforderlich.
- [ ] **LiveKit über TLS** – In Produktion `wss://` statt `ws://` verwenden.
- [ ] **Firewall konfigurieren** – Nur benötigte Ports öffnen (22 SSH, 80 HTTP, 443 HTTPS, 7443 LiveKit WSS, 7882/udp LiveKit Media). **PostgreSQL (5432) und Redis (6379) dürfen NICHT von außen erreichbar sein!** Docker-Container immer mit `127.0.0.1:PORT:PORT` starten.

### Build für Produktion

```bash
# Backend
cd backend
npm run build            # Kompiliert TypeScript nach dist/
npm run start            # Startet den kompilierten Server

# Frontend
cd ../frontend
npm run build            # Erstellt optimierten Build
npm run start            # Startet Next.js Produktionsserver (Port 3000)
```

### Empfohlener Stack für Server

| Komponente | Empfehlung |
|---|---|
| **Reverse Proxy** | Nginx oder Caddy (SSL-Terminierung, Proxy zu Node/Next) |
| **SSL** | Let's Encrypt (kostenlos, automatisch mit Caddy) |
| **Process Manager** | PM2 oder systemd für den Backend-Prozess |
| **Datenbank** | Managed PostgreSQL (z.B. Supabase, Neon) oder selbst gehostet |
| **Redis** | Managed Redis oder selbst gehostet |
| **LiveKit** | [LiveKit Cloud](https://livekit.io/cloud) oder selbst gehostet |

### Beispiel: Nginx Reverse Proxy Config

```nginx
server {
    listen 443 ssl;
    server_name meine-domain.de;

    ssl_certificate     /etc/letsencrypt/live/meine-domain.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/meine-domain.de/privkey.pem;

    # Frontend (Next.js)
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }

    # Backend API + WebSocket
    location /api/ {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Socket.IO
    location /socket.io/ {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```

---

## Nützliche Befehle

```bash
# Prisma Studio (grafischer DB-Browser)
cd backend && npx prisma studio

# Admin: Alle Benutzer anzeigen
curl -H "x-admin-secret: DEIN_ADMIN_SECRET" http://localhost:4000/api/admin/users

# Health-Check
curl http://localhost:4000/health
```

---

## Lizenz

Privates Projekt.
