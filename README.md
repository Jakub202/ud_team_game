# Andbasadøren

A co-op browser game for the team. The crew sails the ship *Andbasadøren* (a rubber duck in a bicorne hat as the figurehead). Each person learns **one station**. During the voyage, crew members get **seasick** one at a time. Someone else has to take over their station, and the sick person can only *explain* how it works.

It's built around Espen's point about substitutions: what happens when the only person who knows how to do something is away?

See [DESIGN.md](DESIGN.md) for the game design and the rules of every station.

## Running locally

```bash
npm install
npm run dev          # game server on :3000 + Vite on http://localhost:5180
```

Open http://localhost:5180 on the "TV" and choose **Create a new voyage**. On each laptop, open the same address (use your LAN IP, e.g. `http://192.168.x.x:5180`) and join with the 4-letter code.

No crew handy? Press **Add test bot** in the lobby. Bots play their stations, get seasick and cover for others.

```bash
npm test             # rule checks + a simulated bot voyage
npm run typecheck
npm run build        # → dist/client (static) + dist/server.js (single file, no node_modules needed)
npm start            # serves the build on :3000
```

## How a session runs

1. **Main screen** (TV/projector): *Create a new voyage*. It shows the ship code, the station assignments and the settings. The main screen is also the captain's control panel: start, pause, end and settings.
2. **Laptops**: open the URL, type your name and the code.
3. **Training** (default 3 min): everyone practises *only their own station*, with the rules shown. Optionally they write a handover note.
4. **Voyage** (~12–15 min at default settings): tasks pop up. Every finished task is an oar stroke that moves the ship. Missed tasks let water in. Every 3 minutes someone gets seasick for 60 seconds, and another crew member takes over their station(s).
5. **Debrief**: arrival or sinking, and how fast tasks went at your own station compared to while covering, plus discussion prompts.

Remote people on Teams just join from their laptop. Their screen also shows the ship, and they talk over the call. Everyone in the room uses their own voice.

All settings are adjustable in the lobby and live during the voyage (⚙ on the main screen): seasickness interval and duration, storms, distance, task pace, time per task, training time, handover notes, whether the ship can sink, and which stations are in play.

## Deploying to UpCloud

The server is one Node process (HTTP + WebSocket on the same port). It keeps game rooms in memory, so restarting it ends any running voyage.

1. Create a server in the UpCloud console: the smallest plan (1 CPU / 1 GB) is plenty, Ubuntu 24.04, with your SSH key.
2. Install Docker and copy the project over:
   ```bash
   ssh root@<server-ip> 'curl -fsSL https://get.docker.com | sh'
   rsync -av --exclude node_modules --exclude dist --exclude shots ./ root@<server-ip>:/opt/andbasadoren/
   ```
3. Start it:
   ```bash
   ssh root@<server-ip>
   cd /opt/andbasadoren
   docker compose up -d --build        # → http://<server-ip>
   ```
4. **HTTPS (optional)**: point a DNS name at the server, then
   ```bash
   printf 'DOMAIN=andbasadoren.example.com\nGAME_PORT=3000\n' > .env   # GAME_PORT frees port 80 for Caddy
   docker compose --profile https up -d --build                       # Caddy fetches a Let's Encrypt certificate
   ```

Updating later: `rsync` again, then `docker compose up -d --build`.

Health check: `GET /healthz`.

## Project layout

```
src/shared/            types, settings, and the rules of all six stations (used by server, bots and tests)
src/server/            authoritative game server: rooms, phases, sickness/substitution, storms, bots, stats
src/client/scene/      Three.js: ocean shader, the ship, crew figures, weather
src/client/minigames/  the six station minigames (SVG)
src/client/ui/         main screen, crew laptop view, HUD, debrief
scripts/               dev runner, self-test, Playwright screenshot scripts
```
