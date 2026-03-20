# Architecture Overview

**Voxely** – eine sichere, Echtzeit-Voice/Video/Chat-Plattform mit minimalistischem UI.

---

## High-Level-Architektur

```
┌──────────────────────┐         ┌──────────────────────┐
│      Frontend        │◄───────►│      Backend         │
│   (Next.js App)      │  REST   │   (Express API)      │
│   Port 3000          │  + WS   │   Port 4000          │
└──────────┬───────────┘         └──────────┬───────────┘
           │                                │
           │  WebRTC (Audio/Video)          │  SQL
           ▼                                ▼
┌──────────────────────┐         ┌──────────────────────┐
│   LiveKit Server     │         │    PostgreSQL         │
│   Port 7880          │         │    Port 5432          │
└──────────────────────┘         └──────────────────────┘
                                            │
                                 ┌──────────┴───────────┐
                                 │       Redis          │
                                 │    Port 6379         │
                                 └──────────────────────┘
```

---

## Tech Stack

### Frontend

| Technologie | Version | Zweck |
|---|---|---|
| **Next.js** | 16 | React-Framework mit App Router, SSR und datei-basiertem Routing |
| **React** | 19 | UI-Komponentenbibliothek |
| **TypeScript** | 5 | Typsicherheit |
| **Tailwind CSS** | 4 | Utility-first CSS für Styling (minimalistisches Design mit Custom-Tokens in `globals.css`) |
| **Zustand** | 5 | Globaler State-Management (Auth, Friends, Tutorial-Progress) |
| **Framer Motion** | 12 | Physik-basierte Animationen für Mascot-Bubbles und UI-Übergänge |
| **LiveKit React** | 2.9 | Fertige React-Komponenten für Video/Audio (Grid, ControlBar, ParticipantTile) |
| **livekit-client** | 2.17 | WebRTC-Client-Bibliothek für LiveKit |
| **Socket.IO Client** | 4.8 | Echtzeit-Chat-Verbindung zum Backend |
| **Lucide React** | 0.575 | Icon-Bibliothek (Star, AlertCircle, Link2, etc.) |
| **clsx + tailwind-merge** | – | Bedingte CSS-Klassen-Zusammenführung |

### Backend

| Technologie | Version | Zweck |
|---|---|---|
| **Node.js + Express** | 5 | REST-API-Server |
| **TypeScript** | 5 | Typsicherheit |
| **Socket.IO** | 4.8 | WebSocket-Server für Echtzeit-Chat |
| **Prisma** | 6.19 | ORM für PostgreSQL (Schema-Definitionen, Migrationen, Typen) |
| **PostgreSQL** | – | Relationale Datenbank (Benutzer, Räume, Chat-Nachrichten) |
| **Redis** | 5.11 | JWT-Blacklisting (Token-Widerruf nach Logout) |
| **jsonwebtoken** | 9 | JWT-Erstellung und -Verifikation (7 Tage Gültigkeit) |
| **bcryptjs** | 3 | Passwort-Hashing |
| **livekit-server-sdk** | 2.15 | LiveKit-Token-Generierung (serverseitig) |
| **Helmet** | 8 | HTTP-Security-Header |
| **express-rate-limit** | 8 | Brute-Force-Schutz auf Auth-Endpoints |
| **sanitize-html** | 2.17 | XSS-Schutz für Chat-Nachrichten |
| **cookie-parser** | 1.4 | httpOnly-Cookie-Verarbeitung |
| **cors** | 2.8 | Origin-Whitelist für CORS |

### Infrastruktur

| Dienst | Zweck |
|---|---|
| **LiveKit Server** | Open-Source WebRTC SFU (Selective Forwarding Unit) für Audio/Video-Streams |
| **PostgreSQL** | Persistente Datenspeicherung |
| **Redis** | In-Memory-Store für Token-Blacklisting (optional, graceful degradation) |

---

## Projektstruktur

```
voxely/
├── frontend/                     # Next.js App
│   ├── src/
│   │   ├── app/                  # App Router Seiten
│   │   │   ├── page.tsx          # Landing Page
│   │   │   ├── login/            # Login-Seite
│   │   │   ├── register/         # Registrierung (mit Invite-Code)
│   │   │   ├── dashboard/        # Dashboard (Raum erstellen / beitreten)
│   │   │   ├── room/[roomId]/    # Video-/Audio-/Chat-Raum
│   │   │   ├── settings/         # Account-Einstellungen
│   │   │   └── globals.css       # Design-Tokens (Tailwind Custom Properties)
│   │   ├── components/
│   │   │   ├── settings/          # Modularisierte Einstellungen (Tabs & Modale)
│   │   │   │   ├── AudioVideoTab.tsx # Audio-/Video-Konfiguration & LiveKit-Integration
│   │   │   │   ├── ProfileTab.tsx    # Benutzerprofil (Name, Avatar-Farbe)
│   │   │   │   ├── AccountTab.tsx    # Konto-Optionen & Abmeldung
│   │   │   │   ├── QualityTab.tsx    # Video-Qualitätseinstellungen
│   │   │   │   └── ...               # Weitere Tabs (Sounds, Interface, etc.)
│   │   │   ├── SettingsModal.tsx   # Haupt-Container für Einstellungen (Tab-Hosting)
│   │   │   ├── AuthProvider.tsx    # Session-Wiederherstellung beim App-Start
│   │   │   ├── ChatSidebar.tsx     # Chat-Sidebar mit Echtzeit-Nachrichten
│   │   │   ├── voxy.tsx            # Mascot-Komponente mit Portals & Framer Motion
│   │   │   ├── TutorialSpotlight.tsx # Overlay mit Spotlight-Loch für die geführte Tour
│   │   │   └── ui/                # Wiederverwendbare UI-Komponenten (Button, Input, Header)
│   │   ├── hooks/
│   │   │   ├── useChatSocket.ts   # Socket.IO Chat-Hook
│   │   │   └── useRoomSounds.ts   # Join/Leave Sound-Effekte
│   │   ├── store/
│   │   │   ├── useAuthStore.ts    # Zustand Auth-Store
│   │   │   ├── useFriendsStore.ts # Globaler Friends- & Sidebar-State
│   │   │   └── useTutorialStore.ts # Tutorial-Schritte und Fortschritt
│   │   └── lib/
│   │       └── utils.ts           # Hilfsfunktionen (cn, clsx)
│   └── .env.local                 # Frontend-Umgebungsvariablen
│
├── backend/                       # Express API
│   ├── src/
│   │   ├── index.ts               # Server-Entry (Express + Socket.IO + Chat-Logik)
│   │   ├── routes/
│   │   │   ├── auth.ts            # /api/auth/* (Login, Register, Logout, Me, Delete)
│   │   │   ├── livekit.ts         # /api/livekit/token (LiveKit-Token-Generierung)
│   │   │   └── admin.ts           # /api/admin/users (Admin-Endpoint)
│   │   ├── controllers/
│   │   │   ├── auth.ts            # Auth-Business-Logik
│   │   │   └── livekit.ts         # LiveKit-Controller
│   │   ├── middleware/
│   │   │   └── authenticate.ts    # JWT-Middleware (Header + Cookie, Blacklist-Check)
│   │   ├── services/
│   │   │   ├── auth.ts            # JWT generieren, verifizieren, blacklisten
│   │   │   ├── livekit.ts         # LiveKit AccessToken-Erstellung
│   │   │   └── redis.ts           # Redis-Client (init, getRedis)
│   │   └── types/
│   │       └── express.d.ts       # TypeScript-Erweiterung für req.user
│   ├── prisma/
│   │   └── schema.prisma          # Datenbank-Schema (User, Room, ChatMessage)
│   └── .env                       # Backend-Umgebungsvariablen
│
└── ARCHITECTURE.md                # ← Diese Datei
```

---

## Datenbank-Schema (Prisma)

```
┌────────────┐       ┌────────────┐       ┌────────────────┐
│    User     │──1:N──│    Room     │       │  ChatMessage   │
├────────────┤       ├────────────┤       ├────────────────┤
│ id (UUID)  │       │ id (UUID)  │       │ id (UUID)      │
│ email      │       │ name       │       │ roomId         │
│ passwordHash│      │ slug       │       │ userId → User  │
│ name       │       │ createdById│       │ userName       │
│ avatarUrl? │       │ createdBy  │       │ text           │
│ createdAt  │       │ createdAt  │       │ createdAt      │
│ updatedAt  │       │ updatedAt  │       └────────────────┘
└────────────┘       └────────────┘
```

---

## Authentifizierung & Sicherheit

### Auth-Flow

1. **Registrierung/Login** → Backend erstellt JWT (7d Gültigkeit) mit einzigartiger `jti` (JWT-ID)
2. JWT wird als **httpOnly Cookie** (`auth_token`) gesetzt UND im Response-Body zurückgegeben
3. Frontend speichert Token **nur im Zustand-Memory** (nicht in localStorage)
4. Bei Seitenrefresh: `AuthProvider` ruft `GET /api/auth/me` auf (Cookie wird automatisch mitgesendet)
5. **Logout**: Token-JTI wird in Redis geblacklistet, Cookie wird gelöscht

### Sicherheitsmaßnahmen

| Maßnahme | Umsetzung |
|---|---|
| **Passwort-Hashing** | bcrypt mit automatischem Salt |
| **JWT-Blacklisting** | Redis-basiert, TTL = Rest-Gültigkeit des Tokens |
| **httpOnly Cookies** | Kein JavaScript-Zugriff auf Auth-Token |
| **CORS Whitelist** | Nur explizit erlaubte Origins (`ALLOWED_ORIGINS`) |
| **Rate Limiting** | 10 fehlgeschlagene Auth-Versuche / 15 Min pro IP |
| **Chat Rate Limiting** | 5 Nachrichten / 5 Sek pro User (in-memory) |
| **XSS-Schutz** | sanitize-html entfernt alle HTML-Tags aus Chat-Nachrichten |
| **Security Headers** | Helmet setzt CSP, HSTS, X-Frame-Options etc. |
| **Security Audits** | Regelmäßige automatisierte Checks auf Schwachstellen und Linting (`security-test.sh`) |
| **Dependency Hardening** | Next.js 16 Security-Patches (CSRF-Protections) & Socket.io-parser Fixes |
| **Invite Codes** | Registrierung nur mit gültigem Einladungscode |
| **Admin-Endpoint** | Timing-safe String-Vergleich für Admin-Secret |
| **Input-Validierung** | Room-IDs: Regex `^[a-zA-Z0-9_-]{1,100}$`, Chat: 500 Zeichen max |
| **HMR Security** | Eingeschränkte `allowedDevOrigins` in der Next-Config für Netzwerk-Entwicklung |
| **Graceful Degradation** | Server startet auch ohne Redis (mit Warnung) |

---

## Echtzeit-Kommunikation

### Video/Audio (LiveKit + WebRTC)

1. Benutzer öffnet `/room/[roomId]`
2. Frontend fordert LiveKit-Token vom Backend (`POST /api/livekit/token`)
3. Backend generiert signierten AccessToken mit Raum-Berechtigungen
4. Frontend verbindet sich direkt mit dem LiveKit-Server (WebRTC)
5. LiveKit routet Audio/Video-Streams zwischen Teilnehmern (SFU)

### Chat (Socket.IO)

1. Frontend verbindet sich per WebSocket mit JWT-Authentifizierung
2. Server verifiziert JWT (inkl. Blacklist-Check) beim Connection-Handshake
3. Client joined Raum-Channel (`chat:join`)
4. Server liefert die letzten 50 Nachrichten aus der Datenbank
5. Neue Nachrichten werden sanitized, in PostgreSQL persistiert und an alle Teilnehmer broadcastet

---

## Umgebungsvariablen

### Backend (`.env`)

| Variable | Beschreibung |
|---|---|
| `DATABASE_URL` | PostgreSQL-Connection-String |
| `JWT_SECRET` | Geheimschlüssel für JWT-Signierung (muss in Produktion geändert werden!) |
| `PORT` | API-Server Port (Standard: 4000) |
| `LIVEKIT_API_KEY` | LiveKit API-Schlüssel |
| `LIVEKIT_API_SECRET` | LiveKit API-Geheimnis |
| `LIVEKIT_WS_URL` | LiveKit WebSocket-URL |
| `ALLOWED_ORIGINS` | Komma-getrennte erlaubte Frontend-Origins |
| `INVITE_CODES` | Komma-getrennte Einladungscodes für Registrierung |
| `ADMIN_SECRET` | Geheimnis für Admin-API-Endpoints |
| `REDIS_URL` | Redis-Connection-String (Standard: `redis://localhost:6379`) |

### Frontend (`.env.local`)

| Variable | Beschreibung |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend-API URL (z.B. `http://localhost:4000`) |
| `NEXT_PUBLIC_LIVEKIT_URL` | LiveKit-Server-URL (z.B. `ws://localhost:7880`) |
