import type { ClientMsg, GameEvent, ServerMsg, Snapshot } from '../shared/types';

export interface Session {
  role: 'screen' | 'player';
  code: string;
  name?: string;
  token?: string;
}

type Handlers = {
  state: (s: Snapshot) => void;
  event: (e: GameEvent) => void;
  result: (r: Extract<ServerMsg, { t: 'result' }>) => void;
  error: (msg: string, fatal: boolean) => void;
  welcome: (w: Extract<ServerMsg, { t: 'welcome' }>) => void;
  status: (connected: boolean) => void;
};

const SESSION_KEY = 'andbasadoren.session';

export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function saveSession(s: Session | null) {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export class Net {
  state: Snapshot | null = null;
  playerId: string | null = null;
  connected = false;
  private ws: WebSocket | null = null;
  private handlers: { [K in keyof Handlers]: Handlers[K][] } = {
    state: [], event: [], result: [], error: [], welcome: [], status: [],
  };
  private receivedAt = 0;
  private closedByUs = false;
  private retry = 0;

  constructor(private intent: ClientMsg, private session: Session | null) {
    this.open();
  }

  on<K extends keyof Handlers>(k: K, fn: Handlers[K]) {
    this.handlers[k].push(fn);
    return () => {
      this.handlers[k] = this.handlers[k].filter((f) => f !== fn) as any;
    };
  }

  private emit<K extends keyof Handlers>(k: K, ...args: Parameters<Handlers[K]>) {
    for (const fn of this.handlers[k]) (fn as any)(...args);
  }

  private open() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.connected = true;
      this.emit('status', true);
      ws.send(JSON.stringify(this.intent));
    };
    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      switch (msg.t) {
        case 'welcome': {
          if (msg.playerId) this.playerId = msg.playerId;
          // From now on, reconnecting means re-joining the same room.
          const s: Session =
            msg.role === 'screen'
              ? { role: 'screen', code: msg.code }
              : { role: 'player', code: msg.code, name: (this.intent as any).name, token: msg.token };
          this.session = s;
          saveSession(s);
          this.intent = msg.role === 'screen' ? { t: 'watch', code: msg.code } : { t: 'join', code: msg.code, name: s.name || '', token: s.token };
          this.emit('welcome', msg);
          break;
        }
        case 'state':
          this.state = msg.s;
          this.receivedAt = performance.now();
          this.emit('state', msg.s);
          break;
        case 'event':
          this.emit('event', msg.e);
          break;
        case 'result':
          this.emit('result', msg);
          break;
        case 'error':
          if (msg.fatal) {
            this.closedByUs = true;
            saveSession(null);
            ws.close();
          }
          this.emit('error', msg.msg, !!msg.fatal);
          break;
      }
    };
    ws.onclose = () => {
      this.connected = false;
      this.emit('status', false);
      if (this.closedByUs) return;
      this.retry++;
      setTimeout(() => this.open(), Math.min(5000, 400 * this.retry));
    };
  }

  send(msg: ClientMsg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close() {
    this.closedByUs = true;
    this.ws?.close();
  }

  /** Current game time, extrapolated from the last snapshot. */
  gt(): number {
    const s = this.state;
    if (!s) return 0;
    const running = !s.paused && (s.phase === 'training' || s.phase === 'voyage');
    return running ? s.gt + (performance.now() - this.receivedAt) : s.gt;
  }

  get me() {
    return this.state?.players.find((p) => p.id === this.playerId) ?? null;
  }
}
