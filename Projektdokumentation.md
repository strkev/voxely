# Voxely - Projektdokumentation

Diese Dokumentation bietet einen Überblick über den Tech-Stack, die Architektur der Anwendung, die Sicherheitsmaßnahmen, die Datenstrukturen sowie nützliche Befehle für den Betrieb von **Voxely**.

## 1. Tech-Stack

Voxely ist in ein Backend und ein Frontend unterteilt und nutzt modernste Web-Technologien für eine sichere und schnelle Kommunikation:

**Backend:**
- **Laufzeitumgebung:** Node.js mit Express.js 5
- **Sprache:** TypeScript 5
- **Datenbank & ORM:** PostgreSQL mit Prisma ORM (inkl. Field Encryption)
- **Echtzeit-Kommunikation:** Socket.io 4.8 (Chat)
- **Audio/Video Streaming:** LiveKit Server (WebRTC SFU)
- **Caching/In-Memory:** Redis (JWT-Blacklisting)

**Frontend:**
- **Framework:** Next.js 16 (React 19)
- **PWA:** Installierbar mit Service Worker und Offline-Support
- **Sprache:** TypeScript 5
- **Styling:** Tailwind CSS v4
- **State Management:** Zustand 5
- **Echtzeit & Medien:** LiveKit Components React & Socket.io-client
- **Icons:** Lucide React
- **Animationen:** Framer Motion

## 2. Komponenten und Pages

Die Struktur des **Frontends** ist wie folgt aufgeteilt:

**Pages (im Ordner `src/app`):**
- `/` (Landing): Einstiegspunkt der Anwendung.
- `/login` & `/register`: Authentifizierung mit Invite-Code-System.
- `/dashboard`: Zentrale Übersicht zur Freundesverwaltung und Raumerstellung.
- `/room/[roomId]`: Kern der App mit Video/Audio-Übertragung und Echtzeit-Chat.
- `/settings`: Benutzer- und App-Einstellungen.

**Kern-Komponenten:**
- `AuthProvider.tsx`: Sicherstellung der Session-Konsistenz.
- `ChatSidebar.tsx`: Echtzeit-Textnachrichten mit XSS-Schutz.
- `FriendsSidebar.tsx`: Management von Online-Status und Interaktionen.
- `sw.js` & `manifest.json`: Ermöglichen den PWA-Betrieb.

## 3. Sicherheitsmaßnahmen

- **Ende-zu-Ende Verschlüsselung:** Bestimmte Datenbankfelder werden mittels `prisma-field-encryption` serverseitig verschlüsselt.
- **Passwort-Sicherheit:** Hashing mit **Bcrypt** (Salted). Keine Klartext-Speicherung.
- **Authentifizierung:** **JWT (JSON Web Tokens)** mit sicherem Widerruf (Blacklisting) via Redis bei Logout.
- **Rate-Limiting:** Schutz vor Brute-Force auf Auth-Endpoints und Spam-Schutz im Chat.
- **Security Headers:** Einsatz von **Helmet** für CSP, HSTS und XSS-Schutz-Header.
- **Bereinigung:** Umfassender XSS-Schutz durch `sanitize-html` im Backend und `isomorphic-dompurify` im Frontend.

## 4. Datenmodell

Das System nutzt PostgreSQL zur permanenten Speicherung:

- **User:** Profile, Credentials und Metadaten.
- **Friendships & Requests:** Soziales Netzwerk der Nutzer.
- **Rooms:** Konfiguration und Metadaten der Kommunikationskanäle.
- **ChatMessages:** Persistierte Nachrichtenhistorie.

## 5. Betrieb & Verwaltung

Die Verwaltung erfolgt primär über das `setup.sh` Script oder manuell via PM2 und Docker:

**Dienste (Docker):**
- `voxely-postgres`: Relationale Datenbank.
- `voxely-redis`: Token-Management.
- `voxely-livekit`: Medien-Server.

**Anwendung (PM2):**
- `voxely-backend`: API & WebSocket Server.
- `voxely-frontend`: Next.js App.

---
*Voxely - Sicher. Minimalistisch. Echtzeit.*
