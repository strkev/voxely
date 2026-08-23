# Voxely

Sichere Echtzeit-Kommunikationsplattform für Audio, Video und Text mit integrierter Ende-zu-Ende-Verschlüsselung und Progressive-Web-App-Unterstützung (PWA).

Detaillierte Architektur- und Schnittstellendokumentation: [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## Funktionsübersicht

* **Sicherheit und Datenschutz:** Authentifizierung über JWT mit Redis-basiertem Token-Blacklisting beim Logout, Feldverschlüsselung auf Datenbankebene via Prisma Field Encryption, automatisches HTML-Sanitizing gegen XSS und API-Rate-Limiting.
* **Echtzeit-Medien:** Hochperformantes WebRTC-Streaming für Audio-, Video- und Bildschirmübertragung über LiveKit mit KI-gestützter Rauschunterdrückung (RNNoise) und virtuellen Hintergründen.
* **Echtzeit-Messaging:** Raumbezogene Chat-Kommunikation und Präsenzanzeige über Socket.IO.
* **Progressive Web App (PWA):** Vollständige Desktop- und Mobilgeräte-Installierbarkeit mit Offline-Caching über Service Worker.
* **Benutzerführung & Onboarding:** Integriertes interaktives Tutorial-System ("Voxy") zur geführten Vorstellung der Plattformfunktionen.
* **Moderne Benutzeroberfläche:** Responsives, minimalistisches Design auf Basis von Next.js, Tailwind CSS v4 und Framer Motion.

---

## Systemvoraussetzungen

| Komponente | Version | Zweck |
|---|---|---|
| **Node.js** | >= 20.x (LTS empfohlen) | Laufzeitumgebung für Frontend und Backend |
| **npm** | >= 10.x | Paketverwaltung |
| **PostgreSQL** | >= 14 | Relationale Datenbank für Benutzer, Räume und Nachrichten |
| **Redis** | >= 7 | In-Memory-Speicher für JWT-Blacklisting und Session-Invalidierung |
| **LiveKit Server** | >= 1.5 | WebRTC-SFU-Server für Audio- und Video-Streaming |

---

## Bereitstellung

### Option A: Automatisierte Einrichtung (Empfohlen)

Für Linux- und macOS-Umgebungen steht ein interaktives Einrichtungsskript zur Verfügung, welches Systemprüfungen, Containerbereitstellung, Secret-Generierung und Build-Prozesse bündelt:

```bash
chmod +x setup.sh
./setup.sh
```

Das Skript führt folgende Schritte automatisiert durch:
1. Validierung der installierten Werkzeuge (Node.js, Docker).
2. Optionale Bereitstellung von PostgreSQL, Redis und LiveKit über Docker.
3. Sichere Zufallsgenerierung aller kryptografischen Schlüssel (JWT, Admin-Secret, Field Encryption Key).
4. Erstellung der Konfigurationsdateien (`.env` und `.env.local`) inklusive automatischer Sicherung bestehender Dateien.
5. Installation aller Abhängigkeiten und Kompilierung von Frontend und Backend.
6. Optionale Einrichtung des PM2-Prozessmanagers für den Hintergrundbetrieb.

---

### Option B: Manuelle Einrichtung

#### 1. Repository klonen

```bash
git clone https://github.com/strkev/voxely.git
cd voxely
```

#### 2. Infrastruktur-Dienste starten

Beispielhafte Initialisierung via Docker:

```bash
# PostgreSQL
docker run -d --name voxely-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=voxely \
  -p 127.0.0.1:5432:5432 \
  -v voxely-postgres-data:/var/lib/postgresql/data \
  postgres:16

# Redis
docker run -d --name voxely-redis \
  -p 127.0.0.1:6379:6379 \
  redis:7-alpine

# LiveKit Server (Entwicklungsmodus)
docker run -d --name voxely-livekit \
  -p 7880:7880 \
  -p 7881:7881 \
  -p 7882:7882/udp \
  -e LIVEKIT_KEYS="voxely_dev_key: voxely_dev_secret_key_with_sufficient_entropy_12345" \
  livekit/livekit-server \
  --dev
```

#### 3. Backend konfigurieren und starten

```bash
cd backend
npm install
```

Erstellen Sie eine `.env`-Datei im Verzeichnis `backend/`:

*Für lokale Entwicklung (`localhost`):*
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/voxely?schema=public"
JWT_SECRET="ein-sicherer-mindestens-32-zeichen-langer-schluessel"
PORT=4000
LIVEKIT_API_KEY="voxely_dev_key"
LIVEKIT_API_SECRET="voxely_dev_secret_key_with_sufficient_entropy_12345"
LIVEKIT_WS_URL="ws://localhost:7880"
ALLOWED_ORIGINS="http://localhost:3000"
INVITE_CODES="standard-einladungscode"
ADMIN_SECRET="ein-sicheres-admin-passwort"
PRISMA_FIELD_ENCRYPTION_KEY="k3:ein-32-byte-base64-schluessel"
```

*Für Produktivbetrieb (Eigene Domain):*
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/voxely?schema=public"
JWT_SECRET="echter-kryptografisch-starker-zufallsschluessel"
PORT=4000
LIVEKIT_API_KEY="voxely_prod_key"
LIVEKIT_API_SECRET="voxely_prod_secret_mit_hoher_entropie"
LIVEKIT_WS_URL="ws://localhost:7880"
ALLOWED_ORIGINS="https://voxely.example.com"
INVITE_CODES="ihr-einladungscode"
ADMIN_SECRET="ein-sehr-sicheres-admin-passwort"
PRISMA_FIELD_ENCRYPTION_KEY="k3:ihr-32-byte-base64-schluessel"
```

Datenbankschema synchronisieren und Backend starten:

```bash
npm run db:generate     # Prisma Client generieren
npm run db:push         # Schema auf Datenbank anwenden

# Für Entwicklung:
npm run dev             # Backend-Dev-Server auf Port 4000

# Für Produktion:
npm run build && npm run start
```

#### 4. Frontend konfigurieren und starten

```bash
cd ../frontend
npm install
```

Erstellen Sie eine `.env.local`-Datei im Verzeichnis `frontend/`:

*Für lokale Entwicklung (`localhost`):*
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
```

*Für Produktivbetrieb (Eigene Domain mit HTTPS/WSS über Reverse Proxy):*
```env
NEXT_PUBLIC_API_URL=https://voxely.example.com
NEXT_PUBLIC_LIVEKIT_URL=wss://voxely.example.com
```

Frontend starten:

```bash
# Für Entwicklung:
npm run dev             # Next.js Dev-Server auf Port 3000

# Für Produktion:
npm run build           # Optimierten Produktions-Build erstellen
npm run start           # Produktions-Server starten
```

Die Anwendung ist anschließend erreichbar:
* Lokal unter [http://localhost:3000](http://localhost:3000)
* Im Produktivbetrieb unter Ihrer konfigurierten Domain (z. B. `https://voxely.example.com`)

---

## Konfigurationsreferenz

### Backend (`backend/.env`)

| Variable | Beschreibung | Pflicht |
|---|---|---|
| `DATABASE_URL` | PostgreSQL-Verbindungs-URI | Ja |
| `JWT_SECRET` | Kryptografischer Schlüssel zur Signierung von JSON Web Tokens | Ja |
| `PORT` | HTTP-Port des Express-Servers (Standard: `4000`) | Nein |
| `LIVEKIT_API_KEY` | API-Key zur Kommunikation mit dem LiveKit-Server | Ja |
| `LIVEKIT_API_SECRET` | Shared Secret zur Token-Generierung für LiveKit-Räume | Ja |
| `LIVEKIT_WS_URL` | WebSocket-Adresse des LiveKit-Servers | Ja |
| `ALLOWED_ORIGINS` | Kommagetrennte Liste erlaubter CORS-Ursprünge | Ja |
| `INVITE_CODES` | Kommagetrennte Liste gültiger Registrierungscodes | Nein |
| `ADMIN_SECRET` | Authentifizierungsschlüssel für administrative API-Endpunkte | Ja |
| `REDIS_URL` | Verbindungs-URI für Redis (Standard: `redis://localhost:6379`) | Nein |
| `PRISMA_FIELD_ENCRYPTION_KEY` | Schlüssel zur transparenten Verschlüsselung von Chat-Inhalten | Nein |

### Frontend (`frontend/.env.local`)

| Variable | Beschreibung | Pflicht |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | URL des Backend-API-Servers | Ja |
| `NEXT_PUBLIC_LIVEKIT_URL` | Öffentliche WebSocket-URL des LiveKit-Servers | Ja |

---

## Zugriff im lokalen Netzwerk (LAN)

Für den geräteübergreifenden Zugriff innerhalb des lokalen Netzwerks:

1. Lokale IP-Adresse des Host-Systems ermitteln (z. B. `192.168.1.100`).
2. In `backend/.env` den Parameter `ALLOWED_ORIGINS` erweitern:
   ```env
   ALLOWED_ORIGINS="http://localhost:3000,http://192.168.1.100:3000"
   ```
3. In `frontend/.env.local` die Host-IP hinterlegen:
   ```env
   NEXT_PUBLIC_API_URL=http://192.168.1.100:4000
   NEXT_PUBLIC_LIVEKIT_URL=ws://192.168.1.100:7880
   ```
4. Der Zugriff erfolgt netzwerkweit über `http://192.168.1.100:3000`.

> [!NOTE]
> WebRTC-Funktionen (Zugriff auf Kamera und Mikrofon) setzen in modernen Webbrowsern aus Sicherheitsgründen entweder eine `localhost`-Verbindung oder ein valides HTTPS-Zertifikat voraus.

---

## Produktionsbetrieb und Sicherheit

### Sicherheitsrichtlinien (Hardening)

Vor dem produktiven Einsatz sind folgende Sicherheitsmaßnahmen zwingend umzusetzen:

* **Geheimschlüssel erneuern:** Standardwerte für `JWT_SECRET`, `ADMIN_SECRET`, `LIVEKIT_API_SECRET` und `PRISMA_FIELD_ENCRYPTION_KEY` durch kryptografisch sichere Zufallswerte (mindestens 32 Bytes / 256 Bit Entropie) ersetzen.
* **CORS-Einschränkung:** `ALLOWED_ORIGINS` ausschließlich auf die produktive FQDN (z. B. `https://voxely.example.com`) beschränken.
* **Vollständige TLS-Terminierung:** HTTPS für Web- und API-Verkehr sowie WSS (`wss://`) für LiveKit und Socket.IO konfigurieren.
* **Netzwerkisolation:** Datenbankports (PostgreSQL 5432, Redis 6379) dürfen nicht öffentlich exponiert werden. Container und Dienste ausschließlich an `127.0.0.1` binden.
* **Firewall-Regeln:** Ausschließlich Port 80 (HTTP), Port 443 (HTTPS), Port 7443 (LiveKit TLS Signal) sowie Port 7882/udp (LiveKit WebRTC Media) extern freigeben.

### Produktions-Build

```bash
# Backend kompilieren und starten
cd backend
npm run build
npm run start

# Frontend kompilieren und starten
cd ../frontend
npm run build
npm run start
```

### Beispiel: Nginx Reverse-Proxy-Konfiguration

```nginx
server {
    listen 443 ssl http2;
    server_name voxely.example.com;

    ssl_certificate     /etc/letsencrypt/live/voxely.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/voxely.example.com/privkey.pem;

    # Frontend (Next.js)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend REST-API
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Socket.IO WebSocket
    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## Qualitätssicherung und Tests

```bash
# Umfassendes Sicherheits- und Qualitäts-Audit (Linting, TypeScript, Secret-Scans, Tests)
./security-test.sh

# Frontend-Tests ausführen (Vitest)
cd frontend && npm run test

# Frontend-Linter ausführen
cd frontend && npm run lint

# Backend-Tests ausführen
cd backend && npm run test

# Datenbank-Schema grafisch einsehen (Prisma Studio)
cd backend && npm run db:studio
```

---

## Lizenz

Proprietäres Projekt. Alle Rechte vorbehalten.
