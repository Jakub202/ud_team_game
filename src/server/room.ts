import type { WebSocket } from 'ws';
import { makeRng } from '../shared/rng';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../shared/settings';
import { STATIONS } from '../shared/stations';
import {
  STATION_IDS,
  WINDS,
  type ClientMsg,
  type Ctx,
  type Debrief,
  type GameEvent,
  type HandoverStat,
  type Phase,
  type PlayerView,
  type ServerMsg,
  type Settings,
  type Snapshot,
  type StatLine,
  type StationId,
  type TaskView,
  type Wind,
} from '../shared/types';

const rng = makeRng();

/** A player counts as gone (and gets covered) after this long without a connection. */
const DISCONNECT_GRACE = 10_000;
const PRACTICE_RESPAWN = 1200;
const MAX_NOTE = 300;
const MAX_PLAYERS = 12;

export interface Conn {
  ws: WebSocket;
  role: 'screen' | 'player' | 'none';
  room?: Room;
  playerId?: string;
}

interface Player {
  id: string;
  token: string;
  name: string;
  bot: boolean;
  conns: Set<Conn>;
  disconnectedAt: number | null; // game time
  ready: boolean;
  practiced: number;
  sickStart: number | null;
  timesSick: number;
  timesCovered: number;
  notes: Partial<Record<StationId, string>>;
  joinOrder: number;
}

interface Task extends TaskView {
  botAt?: number;
  botWrong?: boolean;
}

interface TaskRecord {
  station: StationId;
  covered: boolean;
  ok: boolean;
  time: number; // seconds
  mistakes: number;
}

interface HandoverAcc extends Omit<HandoverStat, 'avgTime'> {
  times: number[];
  start: number;
}

function code4(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

function token(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

const BOT_NAMES = ['Kaptein Kvakk', 'Andrea', 'Rubber Ruth', 'Ole Ender', 'Dunhild', 'Quackson', 'Fjærlin', 'Nebbe'];

export class Room {
  readonly code: string;
  phase: Phase = 'lobby';
  settings: Settings = { ...DEFAULT_SETTINGS, enabledStations: [...DEFAULT_SETTINGS.enabledStations] };
  paused = false;
  gt = 0;
  private lastTick = Date.now();
  private lastBroadcast = 0;
  private dirty = true;
  lastActivity = Date.now();

  screens = new Set<Conn>();
  players = new Map<string, Player>();
  private joinCounter = 0;
  private manualAssign = false;

  owners: Record<StationId, string | null> = Object.fromEntries(STATION_IDS.map((s) => [s, null])) as any;
  private coverage = new Map<string, string | null>();
  private tasks = new Map<StationId, Task>();
  private nextSpawnAt: Partial<Record<StationId, number>> = {};
  private taskSeq = 1;

  // Ship
  private progress = 0;
  private water = 10;
  private strength = 80;
  private wind: Wind = 'N';
  private nextWindAt = 0;
  private storm = false;
  private lastStormStart: number | null = null;

  // Phase timing
  private trainingEndsAt: number | null = null;
  private voyageStartedAt: number | null = null;

  // Sickness
  private sickId: string | null = null;
  private lastSickStart: number | null = null;
  private lastRecoverAt: number | null = null;
  private handovers: HandoverAcc[] = [];

  private records: TaskRecord[] = [];
  private debrief: Debrief | null = null;

  constructor(existing: Set<string>) {
    let c = code4();
    while (existing.has(c)) c = code4();
    this.code = c;
  }

  // ───────────────────────────── connections ─────────────────────────────

  get connectionCount() {
    let n = this.screens.size;
    for (const p of this.players.values()) n += p.conns.size;
    return n;
  }

  addScreen(conn: Conn) {
    conn.role = 'screen';
    conn.room = this;
    this.screens.add(conn);
    this.send(conn, { t: 'welcome', role: 'screen', code: this.code });
    this.dirty = true;
  }

  joinPlayer(conn: Conn, name: string, tok?: string): string | null {
    name = (name || '').trim().slice(0, 20);
    let p = tok ? [...this.players.values()].find((x) => x.token === tok) : undefined;
    if (!p && name) {
      // Fall back to re-claiming a disconnected seat with the same name (e.g. a new browser tab).
      p = [...this.players.values()].find(
        (x) => !x.bot && x.conns.size === 0 && x.name.toLowerCase() === name.toLowerCase(),
      );
    }
    if (!p) {
      if (!name) return 'Please enter a name.';
      const humans = [...this.players.values()].filter((x) => !x.bot).length;
      if (humans >= MAX_PLAYERS) return 'This ship is full.';
      p = this.createPlayer(name, false);
    }
    conn.role = 'player';
    conn.room = this;
    conn.playerId = p.id;
    p.conns.add(conn);
    p.disconnectedAt = null;
    this.send(conn, { t: 'welcome', role: 'player', code: this.code, playerId: p.id, token: p.token });
    this.log(`${p.name} came aboard`);
    this.dirty = true;
    return null;
  }

  private createPlayer(name: string, bot: boolean): Player {
    const p: Player = {
      id: 'p' + token().slice(0, 8),
      token: token(),
      name,
      bot,
      conns: new Set(),
      disconnectedAt: null,
      ready: bot,
      practiced: 0,
      sickStart: null,
      timesSick: 0,
      timesCovered: 0,
      notes: {},
      joinOrder: this.joinCounter++,
    };
    this.players.set(p.id, p);
    if (this.phase === 'lobby' && !this.manualAssign) this.autoAssign();
    else if (this.phase === 'lobby') this.ensureAssignments();
    return p;
  }

  leave(conn: Conn) {
    if (conn.role === 'screen') this.screens.delete(conn);
    if (conn.role === 'player' && conn.playerId) {
      const p = this.players.get(conn.playerId);
      if (p) {
        p.conns.delete(conn);
        if (p.conns.size === 0) p.disconnectedAt = this.gt;
      }
    }
    this.lastActivity = Date.now();
    this.dirty = true;
  }

  // ───────────────────────────── messages ─────────────────────────────

  handle(conn: Conn, msg: ClientMsg) {
    this.lastActivity = Date.now();
    if (conn.role === 'screen') this.handleScreen(msg);
    if (conn.role === 'player' && conn.playerId) {
      const p = this.players.get(conn.playerId);
      if (p) this.handlePlayer(p, msg);
    }
  }

  private handleScreen(msg: ClientMsg) {
    switch (msg.t) {
      case 'settings': {
        this.settings = sanitizeSettings(this.settings, msg.patch || {});
        this.onStationsChanged();
        break;
      }
      case 'assign': {
        if (!STATION_IDS.includes(msg.station)) return;
        if (msg.playerId !== null && !this.players.has(msg.playerId)) return;
        this.owners[msg.station] = msg.playerId;
        this.manualAssign = true;
        break;
      }
      case 'autoAssign':
        this.manualAssign = false;
        this.autoAssign();
        break;
      case 'start':
        if (this.phase === 'lobby') this.startTraining();
        else if (this.phase === 'training') this.startVoyage();
        break;
      case 'pause':
        if (this.phase === 'training' || this.phase === 'voyage') this.paused = !!msg.paused;
        break;
      case 'end':
        if (this.phase === 'voyage') this.endVoyage('ended');
        else if (this.phase === 'training') this.toLobby();
        break;
      case 'again':
        this.toLobby();
        break;
      case 'addBot': {
        if (this.players.size >= MAX_PLAYERS) return;
        const used = new Set([...this.players.values()].map((p) => p.name));
        const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${this.players.size + 1}`;
        this.createPlayer(name, true);
        break;
      }
      case 'kick': {
        const p = this.players.get(msg.playerId);
        if (!p) return;
        for (const c of p.conns) this.send(c, { t: 'error', msg: 'You were removed from the ship.', fatal: true });
        this.players.delete(p.id);
        for (const s of STATION_IDS) if (this.owners[s] === p.id) this.owners[s] = null;
        this.coverage.delete(p.id);
        for (const [k, v] of this.coverage) if (v === p.id) this.coverage.set(k, null);
        if (this.sickId === p.id) this.sickId = null;
        if (this.phase === 'lobby' && !this.manualAssign) this.autoAssign();
        else this.ensureAssignments();
        break;
      }
    }
    this.dirty = true;
  }

  private handlePlayer(p: Player, msg: ClientMsg) {
    switch (msg.t) {
      case 'ready':
        p.ready = !!msg.ready;
        this.checkAllReady();
        break;
      case 'note':
        if (STATION_IDS.includes(msg.station) && typeof msg.text === 'string') {
          p.notes[msg.station] = msg.text.slice(0, MAX_NOTE);
        }
        break;
      case 'act':
        this.act(p, msg.taskId, msg.answer);
        break;
    }
    this.dirty = true;
  }

  // ───────────────────────────── assignments ─────────────────────────────

  private roster(): Player[] {
    return [...this.players.values()].sort((a, b) => a.joinOrder - b.joinOrder);
  }

  private ownedBy(pid: string): StationId[] {
    return this.settings.enabledStations.filter((s) => this.owners[s] === pid);
  }

  private autoAssign() {
    const players = this.roster();
    for (const s of STATION_IDS) this.owners[s] = null;
    if (players.length === 0) return;
    this.settings.enabledStations.forEach((s, i) => {
      this.owners[s] = players[i % players.length].id;
    });
  }

  /** Give every enabled station an owner without disturbing existing choices. */
  private ensureAssignments() {
    const players = this.roster();
    if (players.length === 0) return;
    for (const s of this.settings.enabledStations) {
      const o = this.owners[s];
      if (o && this.players.has(o)) continue;
      const best = players
        .slice()
        .sort((a, b) => this.ownedBy(a.id).length - this.ownedBy(b.id).length || Number(!!a.bot) - Number(!!b.bot))[0];
      this.owners[s] = best.id;
    }
  }

  private onStationsChanged() {
    if (this.phase === 'lobby') {
      if (!this.manualAssign) this.autoAssign();
      else this.ensureAssignments();
      return;
    }
    this.ensureAssignments();
    for (const s of STATION_IDS) {
      if (!this.settings.enabledStations.includes(s)) this.tasks.delete(s);
      else if (this.nextSpawnAt[s] === undefined) this.nextSpawnAt[s] = this.gt + 3000;
    }
  }

  private available(pid: string | null | undefined): boolean {
    if (!pid) return false;
    const p = this.players.get(pid);
    if (!p) return false;
    if (p.sickStart !== null) return false;
    if (p.bot || p.conns.size > 0) return true;
    return p.disconnectedAt !== null && this.gt - p.disconnectedAt < DISCONNECT_GRACE;
  }

  controllerOf(s: StationId): string | null {
    const owner = this.owners[s];
    if (!owner) return null;
    if (this.phase !== 'voyage') return owner;
    if (this.available(owner)) return owner;
    return this.coverage.get(owner) ?? null;
  }

  private controlCount(pid: string): number {
    return this.settings.enabledStations.filter((s) => this.controllerOf(s) === pid).length;
  }

  private updateCoverage() {
    const owners = new Set(this.settings.enabledStations.map((s) => this.owners[s]).filter(Boolean) as string[]);
    for (const k of [...this.coverage.keys()]) if (!owners.has(k) || this.available(k)) this.coverage.delete(k);
    for (const owner of owners) {
      if (this.available(owner)) continue;
      const cur = this.coverage.get(owner);
      if (cur && this.available(cur)) continue;
      const candidates = this.roster().filter((p) => p.id !== owner && this.available(p.id));
      if (candidates.length === 0) {
        this.coverage.set(owner, null);
        continue;
      }
      candidates.sort(
        (a, b) =>
          this.controlCount(a.id) - this.controlCount(b.id) ||
          a.timesCovered - b.timesCovered ||
          rng.next() - 0.5,
      );
      const sub = candidates[0];
      sub.timesCovered++;
      this.coverage.set(owner, sub.id);
      const ownerP = this.players.get(owner)!;
      if (ownerP.sickStart === null) {
        this.log(`${ownerP.name} has lost contact. ${sub.name} takes over`);
      }
    }
  }

  // ───────────────────────────── phases ─────────────────────────────

  private toLobby() {
    this.phase = 'lobby';
    this.paused = false;
    this.tasks.clear();
    this.coverage.clear();
    this.sickId = null;
    this.debrief = null;
    for (const p of this.players.values()) {
      p.sickStart = null;
      p.ready = p.bot;
      p.practiced = 0;
    }
    this.event({ type: 'phase', phase: 'lobby' });
  }

  private startTraining() {
    if (this.players.size === 0) return;
    this.ensureAssignments();
    this.phase = 'training';
    this.paused = false;
    this.tasks.clear();
    this.nextSpawnAt = {};
    this.trainingEndsAt = this.gt + this.settings.trainingDuration * 1000;
    for (const p of this.players.values()) {
      p.ready = p.bot;
      p.practiced = 0;
      p.sickStart = null;
    }
    for (const s of this.settings.enabledStations) this.nextSpawnAt[s] = this.gt + 300;
    this.event({ type: 'phase', phase: 'training' });
  }

  private checkAllReady() {
    if (this.phase !== 'training') return;
    const humans = [...this.players.values()].filter((p) => !p.bot && p.conns.size > 0);
    if (humans.length > 0 && humans.every((p) => p.ready)) this.startVoyage();
  }

  private startVoyage() {
    this.ensureAssignments();
    this.phase = 'voyage';
    this.paused = false;
    this.tasks.clear();
    this.coverage.clear();
    this.records = [];
    this.handovers = [];
    this.progress = 0;
    this.water = 10;
    this.strength = 80;
    this.wind = rng.pick(WINDS);
    this.nextWindAt = this.gt + rng.range(50, 80) * 1000;
    this.storm = false;
    this.lastStormStart = null;
    this.sickId = null;
    this.lastSickStart = null;
    this.lastRecoverAt = null;
    this.voyageStartedAt = this.gt;
    this.trainingEndsAt = null;
    for (const p of this.players.values()) {
      p.sickStart = null;
      p.timesSick = 0;
      p.timesCovered = 0;
    }
    this.nextSpawnAt = {};
    for (const s of this.settings.enabledStations) this.nextSpawnAt[s] = this.gt + rng.range(2, 7) * 1000;
    this.event({ type: 'phase', phase: 'voyage' });
  }

  private endVoyage(result: Debrief['result']) {
    if (this.sickId) this.recover();
    this.phase = 'debrief';
    this.paused = false;
    this.tasks.clear();
    this.debrief = this.computeDebrief(result);
    this.event({ type: 'phase', phase: 'debrief' });
  }

  // ───────────────────────────── tick ─────────────────────────────

  tick() {
    const now = Date.now();
    const dt = Math.min(1000, now - this.lastTick);
    this.lastTick = now;
    const running = (this.phase === 'training' || this.phase === 'voyage') && !this.paused;
    if (running) this.gt += dt;

    if (running && this.phase === 'training') this.trainingTick();
    if (running && this.phase === 'voyage') this.voyageTick(dt / 1000);

    if (this.dirty || now - this.lastBroadcast > 500) this.broadcast();
  }

  private trainingTick() {
    if (this.trainingEndsAt !== null && this.gt >= this.trainingEndsAt) {
      this.startVoyage();
      return;
    }
    for (const s of this.settings.enabledStations) {
      if (this.tasks.has(s)) continue;
      if ((this.nextSpawnAt[s] ?? 0) > this.gt) continue;
      if (!this.owners[s]) continue;
      // Practice tasks cycle through every variant of the rules, including storms and side winds.
      this.spawn(s, { wind: rng.pick(WINDS), storm: rng.chance(0.35) }, true);
    }
    this.botsAct();
  }

  private sicknessDue(): number | null {
    if (!this.settings.sicknessEnabled || this.voyageStartedAt === null) return null;
    let due =
      this.lastSickStart === null
        ? this.voyageStartedAt + this.settings.firstSicknessAt * 1000
        : this.lastSickStart + this.settings.sicknessInterval * 1000;
    if (this.lastRecoverAt !== null) due = Math.max(due, this.lastRecoverAt + 10_000);
    return due;
  }

  private stormDue(): number | null {
    if (!this.settings.stormsEnabled || this.voyageStartedAt === null) return null;
    return this.lastStormStart === null
      ? this.voyageStartedAt + this.settings.stormInterval * 600
      : this.lastStormStart + Math.max(this.settings.stormInterval, this.settings.stormDuration + 20) * 1000;
  }

  private voyageTick(sec: number) {
    const st = this.settings;
    const stormK = this.storm ? st.stormStrength : 0;

    // Wind (never mid-rigging, so the rope order can't flip under someone's hands)
    if (this.gt >= this.nextWindAt && !this.tasks.has('rigging')) {
      this.wind = rng.pick(WINDS.filter((w) => w !== this.wind));
      this.nextWindAt = this.gt + rng.range(60, 100) * 1000;
      this.event({ type: 'wind', wind: this.wind });
      this.log(`The wind shifts. Now blowing from the ${({ N: 'north', E: 'east', S: 'south', W: 'west' } as const)[this.wind]}`);
    }

    // Storms
    if (this.storm) {
      if (!st.stormsEnabled || this.gt >= (this.lastStormStart ?? 0) + st.stormDuration * 1000) {
        this.storm = false;
        this.event({ type: 'storm', on: false });
        this.log('The storm passes');
      }
    } else {
      const due = this.stormDue();
      if (due !== null && this.gt >= due) {
        this.storm = true;
        this.lastStormStart = this.gt;
        this.event({ type: 'storm', on: true });
        this.log('A storm rolls in!');
      }
    }

    // Seasickness
    if (this.sickId) {
      const p = this.players.get(this.sickId);
      if (!p || p.sickStart === null || this.gt >= p.sickStart + st.sicknessDuration * 1000 || !st.sicknessEnabled) {
        this.recover();
      }
    } else {
      const due = this.sicknessDue();
      if (due !== null && this.gt >= due) this.startSickness();
    }

    this.updateCoverage();

    // Tasks follow the live weather: what you see on screen is what the rules use.
    for (const task of this.tasks.values()) {
      if (task.ctx.wind !== this.wind || task.ctx.storm !== this.storm) task.ctx = { wind: this.wind, storm: this.storm };
    }
    for (const s of st.enabledStations) {
      const task = this.tasks.get(s);
      if (task) {
        if (task.deadline !== null && this.gt >= task.deadline) this.failTask(task);
        continue;
      }
      if (!this.owners[s]) continue;
      if ((this.nextSpawnAt[s] ?? 0) <= this.gt) this.spawn(s, { wind: this.wind, storm: this.storm }, false);
    }

    // Ship
    const hasBilge = st.enabledStations.includes('bilge');
    const hasGalley = st.enabledStations.includes('galley');
    if (hasBilge) this.water += (0.05 + 0.08 * stormK) * sec;
    this.water = Math.max(0, Math.min(100, this.water));
    if (hasGalley) this.strength = Math.max(0, this.strength - (0.09 + 0.03 * stormK) * sec);
    else this.strength = 80;

    if (this.water >= 100) {
      if (st.sinking) {
        this.log('The ship is going down…');
        this.endVoyage('sunk');
        return;
      }
      this.water = 99;
    }

    this.botsAct();
  }

  private startSickness() {
    const candidates = this.roster().filter((p) => this.available(p.id) && this.ownedBy(p.id).length > 0);
    const others = this.roster().filter((p) => this.available(p.id));
    if (candidates.length === 0 || others.length < 2) {
      // Nobody can be spared right now. Try again in a little while.
      this.lastSickStart = this.gt - this.settings.sicknessInterval * 1000 + 15_000;
      return;
    }
    const minSick = Math.min(...candidates.map((p) => p.timesSick));
    const pool = candidates.filter((p) => p.timesSick === minSick);
    const p = rng.pick(pool);
    p.sickStart = this.gt;
    p.timesSick++;
    this.sickId = p.id;
    this.lastSickStart = this.gt;
    this.updateCoverage();
    const subId = this.coverage.get(p.id) ?? null;
    const stations = this.ownedBy(p.id);
    const sub = subId ? this.players.get(subId) : undefined;
    this.handovers.push({
      sickId: p.id,
      sickName: p.name,
      subId,
      subName: sub?.name ?? 'nobody',
      stations,
      done: 0,
      failed: 0,
      mistakes: 0,
      times: [],
      start: this.gt,
    });
    this.event({ type: 'sick', playerId: p.id, subId, stations });
    const names = stations.map((s) => STATIONS[s].name).join(' & ');
    this.log(sub ? `${p.name} is seasick! ${sub.name} takes over ${names}` : `${p.name} is seasick!`);
  }

  private recover() {
    const p = this.sickId ? this.players.get(this.sickId) : undefined;
    this.sickId = null;
    this.lastRecoverAt = this.gt;
    if (p) {
      p.sickStart = null;
      this.event({ type: 'recovered', playerId: p.id });
      this.log(`${p.name} feels better and is back at work`);
    }
    this.updateCoverage();
  }

  // ───────────────────────────── tasks ─────────────────────────────

  private spawn(s: StationId, ctx: Ctx, practice: boolean) {
    const def = STATIONS[s];
    const params = def.generate(rng, ctx);
    const task: Task = {
      id: this.taskSeq++,
      station: s,
      params,
      prog: def.initProg(params),
      ctx,
      createdAt: this.gt,
      deadline: practice ? null : this.gt + this.settings.taskTime * def.timeMul * 1000,
      mistakes: 0,
      practice,
    };
    this.tasks.set(s, task);
    this.dirty = true;
  }

  private scheduleNext(s: StationId) {
    if (this.phase === 'training') {
      this.nextSpawnAt[s] = this.gt + PRACTICE_RESPAWN;
      return;
    }
    const owner = this.owners[s];
    const load = owner ? this.ownedBy(owner).length : 1;
    const loadK = 1 + 0.6 * Math.max(0, load - 1);
    const stormK = this.storm ? 0.85 : 1;
    const base = rng.range(5, 12);
    this.nextSpawnAt[s] = this.gt + ((base * loadK * stormK) / this.settings.taskPace) * 1000;
  }

  private act(p: Player, taskId: number, answer: any) {
    if (this.paused) return;
    if (this.phase !== 'voyage' && this.phase !== 'training') return;
    const task = [...this.tasks.values()].find((t) => t.id === taskId);
    if (!task) return;
    if (this.controllerOf(task.station) !== p.id) return;
    this.applyAnswer(p, task, answer);
  }

  private applyAnswer(p: Player, task: Task, answer: any) {
    const def = STATIONS[task.station];
    let res;
    try {
      res = def.step(task.params, task.prog, answer, task.ctx);
    } catch {
      return;
    }
    task.prog = res.prog;
    if (res.kind === 'wrong') {
      task.mistakes++;
      if (!task.practice) this.water = Math.min(100, this.water + 1);
      this.sendTo(p, { t: 'result', taskId: task.id, kind: 'wrong', hint: task.practice ? res.hint : undefined });
    } else if (res.kind === 'progress') {
      this.sendTo(p, { t: 'result', taskId: task.id, kind: 'progress' });
    } else {
      this.sendTo(p, { t: 'result', taskId: task.id, kind: 'done' });
      this.completeTask(task, p);
    }
    this.dirty = true;
  }

  private completeTask(task: Task, by: Player) {
    this.tasks.delete(task.station);
    this.scheduleNext(task.station);
    if (task.practice) {
      by.practiced++;
      return;
    }
    const owner = this.owners[task.station];
    const covered = owner !== by.id;
    const time = (this.gt - task.createdAt) / 1000;
    this.records.push({ station: task.station, covered, ok: true, time, mistakes: task.mistakes });
    this.trackHandover(owner, (h) => {
      h.done++;
      h.mistakes += task.mistakes;
      h.times.push(time);
    });

    const power = 0.7 + 0.5 * (this.strength / 100);
    this.progress += power;
    if (task.station === 'bilge') this.water = Math.max(0, this.water - 22);
    if (task.station === 'galley') this.strength = Math.min(100, this.strength + 30);
    this.event({ type: 'stroke', station: task.station, by: by.id, covered });

    if (this.progress >= this.settings.distance) {
      this.progress = this.settings.distance;
      this.log('Land ho! Andbasadøren has arrived!');
      this.endVoyage('arrived');
    }
  }

  private failTask(task: Task) {
    this.tasks.delete(task.station);
    this.scheduleNext(task.station);
    const owner = this.owners[task.station];
    const controller = this.controllerOf(task.station);
    const covered = controller !== owner;
    this.records.push({
      station: task.station,
      covered,
      ok: false,
      time: (this.gt - task.createdAt) / 1000,
      mistakes: task.mistakes,
    });
    this.trackHandover(owner, (h) => {
      h.failed++;
      h.mistakes += task.mistakes;
    });
    this.water = Math.min(100, this.water + STATIONS[task.station].failWater);
    const ctrl = controller ? this.players.get(controller) : undefined;
    if (ctrl) this.sendTo(ctrl, { t: 'result', taskId: task.id, kind: 'expired' });
    this.event({ type: 'fail', station: task.station, reason: 'expired' });
  }

  private trackHandover(owner: string | null, fn: (h: HandoverAcc) => void) {
    if (!owner || owner !== this.sickId) return;
    const h = this.handovers[this.handovers.length - 1];
    if (h && h.sickId === owner) fn(h);
  }

  // ───────────────────────────── bots ─────────────────────────────

  private botsAct() {
    for (const task of this.tasks.values()) {
      const ctrl = this.controllerOf(task.station);
      const p = ctrl ? this.players.get(ctrl) : undefined;
      if (!p || !p.bot) {
        delete task.botAt;
        continue;
      }
      if (task.botAt === undefined) {
        const covering = this.owners[task.station] !== p.id;
        task.botAt = this.gt + rng.range(3, 9) * (covering ? 1.7 : 1) * 1000;
        task.botWrong = rng.chance(covering ? 0.3 : 0.08);
        continue;
      }
      if (this.gt < task.botAt) continue;
      if (task.botWrong) {
        task.botWrong = false;
        task.botAt = this.gt + rng.range(2, 4) * 1000;
        this.applyAnswer(p, task, { wrong: true });
        continue;
      }
      // Replay the solution from wherever the task currently is.
      const def = STATIONS[task.station];
      const steps = def.solve(task.params, task.ctx);
      const startAt = task.station === 'rigging' ? task.prog.pulled.length : task.station === 'bilge' ? task.prog.good : 0;
      for (const step of steps.slice(startAt)) {
        if (!this.tasks.has(task.station) || this.tasks.get(task.station) !== task) break;
        this.applyAnswer(p, task, step);
      }
    }
  }

  // ───────────────────────────── output ─────────────────────────────

  private event(e: GameEvent) {
    const msg = JSON.stringify({ t: 'event', e } satisfies ServerMsg);
    for (const c of this.allConns()) c.ws.send(msg);
    this.dirty = true;
  }

  private log(text: string) {
    this.event({ type: 'log', text });
  }

  private *allConns(): Generator<Conn> {
    yield* this.screens;
    for (const p of this.players.values()) yield* p.conns;
  }

  send(conn: Conn, msg: ServerMsg) {
    if (conn.ws.readyState === 1) conn.ws.send(JSON.stringify(msg));
  }

  private sendTo(p: Player, msg: ServerMsg) {
    for (const c of p.conns) this.send(c, msg);
  }

  private snapshotBase(): Omit<Snapshot, 'you'> {
    const sick = this.sickId ? this.players.get(this.sickId) : undefined;
    const stations = this.settings.enabledStations.map((s) => {
      const t = this.tasks.get(s);
      return {
        id: s,
        ownerId: this.owners[s],
        controllerId: this.controllerOf(s),
        task: t ? { id: t.id, createdAt: t.createdAt, deadline: t.deadline } : null,
      };
    });
    const players: PlayerView[] = this.roster().map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.bot || p.conns.size > 0,
      bot: p.bot,
      sick: p.sickStart !== null,
      sickUntil: p.sickStart !== null ? p.sickStart + this.settings.sicknessDuration * 1000 : null,
      owns: this.ownedBy(p.id),
      controls: stations.filter((s) => s.controllerId === p.id).map((s) => s.id),
      covering: [...this.coverage.entries()].filter(([, sub]) => sub === p.id).map(([owner]) => owner),
      ready: p.ready,
      practiced: p.practiced,
    }));
    return {
      code: this.code,
      phase: this.phase,
      paused: this.paused,
      gt: this.gt,
      settings: this.settings,
      players,
      stations,
      ship: {
        progress: this.progress,
        distance: this.settings.distance,
        water: this.water,
        strength: this.strength,
        wind: this.wind,
        storm: this.storm,
      },
      trainingEndsAt: this.phase === 'training' ? this.trainingEndsAt : null,
      voyageStartedAt: this.voyageStartedAt,
      nextSickAt: this.phase === 'voyage' && !this.sickId ? this.sicknessDue() : null,
      stormEndsAt: this.storm && this.lastStormStart !== null ? this.lastStormStart + this.settings.stormDuration * 1000 : null,
      sickness:
        sick && sick.sickStart !== null
          ? {
              playerId: sick.id,
              subId: this.coverage.get(sick.id) ?? null,
              stations: this.ownedBy(sick.id),
              until: sick.sickStart + this.settings.sicknessDuration * 1000,
            }
          : null,
      debrief: this.debrief,
      screens: this.screens.size,
    };
  }

  private broadcast() {
    this.dirty = false;
    this.lastBroadcast = Date.now();
    const base = this.snapshotBase();
    const screenMsg = JSON.stringify({ t: 'state', s: { ...base, you: null } } satisfies ServerMsg);
    for (const c of this.screens) if (c.ws.readyState === 1) c.ws.send(screenMsg);
    for (const p of this.players.values()) {
      if (p.conns.size === 0) continue;
      const controlled = this.settings.enabledStations.filter((s) => this.controllerOf(s) === p.id);
      const tasks = controlled.map((s) => this.tasks.get(s)).filter(Boolean) as Task[];
      const notes = this.settings.handoverNotes
        ? controlled
            .filter((s) => this.owners[s] !== p.id)
            .map((s) => {
              const owner = this.players.get(this.owners[s]!);
              return { station: s, from: owner?.name ?? '?', text: owner?.notes[s] ?? '' };
            })
            .filter((n) => n.text.trim().length > 0)
        : [];
      const you = {
        id: p.id,
        tasks: tasks.map(({ botAt, botWrong, ...t }) => t),
        notes,
        myNotes: p.notes,
      };
      const msg = JSON.stringify({ t: 'state', s: { ...base, you } } satisfies ServerMsg);
      for (const c of p.conns) if (c.ws.readyState === 1) c.ws.send(msg);
    }
  }

  // ───────────────────────────── debrief ─────────────────────────────

  private computeDebrief(result: Debrief['result']): Debrief {
    const line = (recs: TaskRecord[]): StatLine => {
      const ok = recs.filter((r) => r.ok);
      return {
        done: ok.length,
        failed: recs.length - ok.length,
        mistakes: recs.reduce((a, r) => a + r.mistakes, 0),
        avgTime: ok.length ? ok.reduce((a, r) => a + r.time, 0) / ok.length : null,
      };
    };
    return {
      result,
      duration: this.voyageStartedAt !== null ? (this.gt - this.voyageStartedAt) / 1000 : 0,
      progress: this.progress,
      distance: this.settings.distance,
      owner: line(this.records.filter((r) => !r.covered)),
      cover: line(this.records.filter((r) => r.covered)),
      stations: this.settings.enabledStations.map((id) => ({
        id,
        owner: line(this.records.filter((r) => r.station === id && !r.covered)),
        cover: line(this.records.filter((r) => r.station === id && r.covered)),
      })),
      handovers: this.handovers.map(({ times, start, ...h }) => ({
        ...h,
        avgTime: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
      })),
    };
  }
}
