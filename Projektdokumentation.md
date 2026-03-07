# Projektdokumentation

Diese Dokumentation bietet einen Überblick über den Tech-Stack, die Architektur der Anwendung, die Sicherheitsmaßnahmen, die Datenstrukturen sowie nützliche Befehle für den Betrieb.

## 1. Tech-Stack

Die Applikation (ein Discord/Airbnb Klon) ist in ein Backend und ein Frontend unterteilt und nutzt moderne Web-Technologien:

**Backend:**
- **Laufzeitumgebung:** Node.js mit Express.js
- **Sprache:** TypeScript
- **Datenbank & ORM:** PostgreSQL mit Prisma ORM
- **Echtzeit-Kommunikation:** Socket.io (für Chat und Signalisierung)
- **Audio/Video Streaming:** LiveKit Server
- **Caching/In-Memory:** Redis

**Frontend:**
- **Framework:** Next.js (React 19)
- **Sprache:** TypeScript
- **Styling:** Tailwind CSS v4
- **State Management:** Zustand
- **Echtzeit & Medien:** LiveKit Components React & Socket.io-client
- **Icons:** Lucide React

## 2. Komponenten und Pages

Die Struktur des **Frontends** ist wie folgt aufgeteilt:

**Pages (im Ordner `src/app`):**
- `/login` & `/register`: Authentifizierungsseiten für Benutzerkontoerstellung und Login.
- `/dashboard`: Die Hauptansicht nach dem Login. Hier können Freunde verwaltet und Räume betreten oder erstellt werden.
- `/room`: Die Ansicht innerhalb eines Raumes. Hier findet die Sprach-/Videoübertragung über LiveKit statt sowie der Text-Chat.
- `/settings`: Globale App-Einstellungen (z.B. Profil bearbeiten).
- `/admin`: Ein Administrationsbereich.

**Wichtige Komponenten (im Ordner `src/components`):**
- `AuthProvider.tsx`: Verwaltet den globalen Authentifizierungsstatus (eingeloggt / nicht eingeloggt).
- `ThemeProvider.tsx`: Steuert das Design der Anwendung (Dark Mode / Light Mode).
- `ChatSidebar.tsx`: Die Seitenleiste für Textnachrichten innerhalb eines Raumes.
- `FriendsSidebar.tsx`: Die Seitenleiste im Dashboard zur Anzeige und Interaktion mit Freunden.
- `FriendRequestsModal.tsx`: Ein Pop-up zur Verwaltung von eingehenden und ausgehenden Freundschaftsanfragen.
- `UserSettingsModal.tsx`: Ein Modal-Fenster für allgemeine Benutzereinstellungen (oft aus dem Raum heraus bedienbar).
- `RoomInviteBanner.tsx`: Wird angezeigt, wenn man eine Einladung zu einem Raum erhält.

## 3. Sicherheitsmaßnahmen

- **Passwort-Verschlüsselung:** Passwörter werden vor dem Speichern mit dem **Bcrypt** Algorithmus gehasht (mit Salt). Es werden keine Passwörter im Klartext gespeichert.
- **Authentifizierung:** Erfolgt über **JSON Web Tokens (JWT)**.
- **Rate-Limiting:** Die Authentifizierungs-Endpunkte (Login/Registrierung) sind durch `express-rate-limit` geschützt, um Brute-Force-Angriffe zu verhindern (z.B. max. 5 Versuche in 5 Minuten).
- **HTTP Header-Sicherheit:** Im Backend wird **Helmet** eingesetzt, um verschiedene HTTP-Header aus Sicherheitszwecken richtig zu setzen.
- **Schutz vor Cross-Site Scripting (XSS):** Bibliotheken wie `sanitize-html` und `isomorphic-dompurify` bereinigen Benutzereingaben (z.B. Chatnachrichten), um bösartigen Code zu entfernen.
- **CORS:** Cross-Origin Resource Sharing ist so konfiguriert, dass nur Anfragen vom Frontend erlaubt sind.

## 4. Gespeicherte Daten (Datenbankschema)

Die Hauptentitäten, die in der PostgreSQL Datenbank (via Prisma) gespeichert werden:

- **User (Benutzer):** Speichert UUID, gehashtes Passwort, Anzeigename (eindeutig), Avatar-URL sowie Erstellungs- und Änderungsdatum.
- **Friendship (Freundschaften):** Speichert die Verknüpfung zweier User (wer ist mit wem befreundet).
- **FriendRequest (Freundschaftsanfragen):** Hält Anfragen von einem Sender zu einem Empfänger fest.
- **Room (Räume):** Speichert die erstellten Räume mit Name, einem eindeutigen Slug (URL-Pfad) und der ID des Erstellers.
- **ChatMessage (Chat-Nachrichten):** Speichert jede Textnachricht mit Referenz auf den Raum, den Absender (User ID & Name) und den Zeitstempel.

## 5. Nützliche Befehle

Die gesamte Anwendungsumgebung (`setup.sh`) verwendet PM2 und Docker:

**Docker (Infrastruktur: Datenbank, Redis, LiveKit):**
- Container ansehen: `docker ps -a`
- Datenbank starten: `docker start dc-postgres`
- Redis starten: `docker start dc-redis`
- LiveKit starten: `docker start dc-livekit`
- Logs ansehen: `docker logs <container-name> -f`

**PM2 (App-Prozesse: Frontend & Backend):**
*(Aus dem Stammverzeichnis ausführen)*
- Alle Prozesse starten: `pm2 start ecosystem.config.cjs`
- Status überprüfen: `pm2 status`
- Logs ansehen: `pm2 logs` oder spezifisch `pm2 logs dc-backend`
- Neustarten: `pm2 restart all`
- Stoppen: `pm2 stop all`
- Automatischen Start bei Server-Boot konfigurieren: `pm2 startup` und danach `pm2 save`

**Prisma (Datenbank-Updates):**
*(Im `/backend` Ordner ausführen)*
- Datenbankschema anwenden: `npx prisma db push`
- Prisma-Client neu generieren (nach Schema-Änderungen): `npx prisma generate`
- Datenbank grafisch ansehen/bearbeiten: `npx prisma studio`

**Bilder & Assets updaten:**
- Logo, Favicon oder andere Bilder können direkt im Ordner `frontend/public/` ausgetauscht werden. Bei der Serverversion muss danach der pm2 Prozess (z.B. `pm2 restart dc-frontend`) eventuell neu gestartet und ggfs. der Browsercache geleert werden. In Entwicklung (dev mode) sind Änderungen sofort sichtbar.
