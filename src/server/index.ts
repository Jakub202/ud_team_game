import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import type { ClientMsg } from '../shared/types';
import { Room, type Conn } from './room';

const PORT = Number(process.env.PORT) || 3000;
const here = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = resolve(process.env.STATIC_DIR || join(here, 'client'));
const hasStatic = existsSync(join(STATIC_DIR, 'index.html'));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', 'http://x');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(`ok ${rooms.size} rooms`);
    return;
  }
  if (!hasStatic) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Client not built. In development open the Vite server at http://localhost:5173');
    return;
  }
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(STATIC_DIR, path);
  if (!file.startsWith(STATIC_DIR)) file = join(STATIC_DIR, 'index.html');
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(STATIC_DIR, 'index.html');
  const ext = extname(file);
  const immutable = file.includes(`${STATIC_DIR}/assets/`);
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  res.end(readFileSync(file));
}

const rooms = new Map<string, Room>();
const server = createServer(serveStatic);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

wss.on('connection', (ws) => {
  const conn: Conn = { ws, role: 'none' };
  let alive = true;
  ws.on('pong', () => (alive = true));
  const hb = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    ws.ping();
  }, 15_000);

  ws.on('message', (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'ping') {
      ws.send(JSON.stringify({ t: 'pong', at: msg.at }));
      return;
    }
    if (conn.role === 'none') {
      if (msg.t === 'create') {
        const room = new Room(new Set(rooms.keys()));
        rooms.set(room.code, room);
        room.addScreen(conn);
        console.log(`[room ${room.code}] created`);
      } else if (msg.t === 'watch' || msg.t === 'join') {
        const room = rooms.get(String(msg.code || '').toUpperCase().trim());
        if (!room) {
          ws.send(JSON.stringify({ t: 'error', msg: 'No ship with that code. Check the main screen.', fatal: true }));
          return;
        }
        if (msg.t === 'watch') room.addScreen(conn);
        else {
          const err = room.joinPlayer(conn, String(msg.name || ''), msg.token);
          if (err) ws.send(JSON.stringify({ t: 'error', msg: err, fatal: true }));
        }
      }
      return;
    }
    conn.room?.handle(conn, msg);
  });

  ws.on('close', () => {
    clearInterval(hb);
    conn.room?.leave(conn);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.connectionCount === 0 && now - room.lastActivity > 45 * 60_000) {
      rooms.delete(code);
      console.log(`[room ${code}] closed (idle)`);
      continue;
    }
    try {
      room.tick();
    } catch (err) {
      console.error(`[room ${code}] tick failed`, err);
    }
  }
}, 100);

server.listen(PORT, () => {
  console.log(`Andbasadøren server listening on :${PORT}${hasStatic ? '' : ' (no client build found; API only)'}`);
});
