export const STATION_IDS = ['helm', 'rigging', 'bilge', 'signals', 'lookout', 'galley'] as const;
export type StationId = (typeof STATION_IDS)[number];

export type Wind = 'N' | 'E' | 'S' | 'W';
export const WINDS: Wind[] = ['N', 'E', 'S', 'W'];

/** World conditions a task was created under. Rules may depend on these. */
export interface Ctx {
  wind: Wind;
  storm: boolean;
}

export type Phase = 'lobby' | 'training' | 'voyage' | 'debrief';

export interface Settings {
  sicknessEnabled: boolean;
  /** Seconds between the start of one sickness and the start of the next. */
  sicknessInterval: number;
  /** Seconds a crew member stays seasick. */
  sicknessDuration: number;
  /** Seconds into the voyage before the first sickness. */
  firstSicknessAt: number;
  stormsEnabled: boolean;
  stormInterval: number;
  stormDuration: number;
  /** 1 = mild, 2 = moderate, 3 = rough */
  stormStrength: number;
  /** Nautical miles to the destination. Each completed task rows roughly one mile. */
  distance: number;
  /** Multiplier on how often tasks appear. */
  taskPace: number;
  /** Base seconds to finish a task before it fails. */
  taskTime: number;
  trainingDuration: number;
  handoverNotes: boolean;
  sinking: boolean;
  enabledStations: StationId[];
}

export interface PlayerView {
  id: string;
  name: string;
  connected: boolean;
  bot: boolean;
  sick: boolean;
  sickUntil: number | null;
  owns: StationId[];
  controls: StationId[];
  /** Player id this player is currently covering for. */
  covering: string[];
  ready: boolean;
  practiced: number;
}

export interface StationView {
  id: StationId;
  ownerId: string | null;
  controllerId: string | null;
  task: { id: number; createdAt: number; deadline: number | null } | null;
}

export interface ShipView {
  progress: number;
  distance: number;
  water: number; // 0..100, sinks at 100
  strength: number; // 0..100 crew strength (galley)
  wind: Wind;
  storm: boolean;
}

export interface TaskView {
  id: number;
  station: StationId;
  params: any;
  prog: any;
  ctx: Ctx;
  createdAt: number;
  deadline: number | null;
  mistakes: number;
  practice: boolean;
}

export interface StatLine {
  done: number;
  failed: number;
  mistakes: number;
  avgTime: number | null; // seconds
}

export interface HandoverStat {
  sickId: string;
  sickName: string;
  subId: string | null;
  subName: string;
  stations: StationId[];
  done: number;
  failed: number;
  mistakes: number;
  avgTime: number | null;
}

export interface Debrief {
  result: 'arrived' | 'sunk' | 'ended';
  duration: number; // seconds
  progress: number;
  distance: number;
  owner: StatLine;
  cover: StatLine;
  stations: { id: StationId; owner: StatLine; cover: StatLine }[];
  handovers: HandoverStat[];
}

export interface Sickness {
  playerId: string;
  subId: string | null;
  stations: StationId[];
  until: number;
}

export interface Snapshot {
  code: string;
  phase: Phase;
  paused: boolean;
  gt: number; // game time in ms (only advances when not paused)
  settings: Settings;
  players: PlayerView[];
  stations: StationView[];
  ship: ShipView;
  trainingEndsAt: number | null;
  voyageStartedAt: number | null;
  nextSickAt: number | null;
  stormEndsAt: number | null;
  sickness: Sickness | null;
  debrief: Debrief | null;
  screens: number;
  you: YouView | null;
}

export interface YouView {
  id: string;
  tasks: TaskView[];
  /** Handover notes from the owners of stations you are covering. */
  notes: { station: StationId; from: string; text: string }[];
  myNotes: Partial<Record<StationId, string>>;
}

export type GameEvent =
  | { type: 'stroke'; station: StationId; by: string; covered: boolean }
  | { type: 'fail'; station: StationId; reason: 'expired' }
  | { type: 'sick'; playerId: string; subId: string | null; stations: StationId[] }
  | { type: 'recovered'; playerId: string }
  | { type: 'storm'; on: boolean }
  | { type: 'wind'; wind: Wind }
  | { type: 'phase'; phase: Phase }
  | { type: 'log'; text: string };

export type ClientMsg =
  | { t: 'create' }
  | { t: 'watch'; code: string }
  | { t: 'join'; code: string; name: string; token?: string }
  | { t: 'settings'; patch: Partial<Settings> }
  | { t: 'assign'; station: StationId; playerId: string | null }
  | { t: 'autoAssign' }
  | { t: 'start' }
  | { t: 'pause'; paused: boolean }
  | { t: 'end' }
  | { t: 'again' }
  | { t: 'addBot' }
  | { t: 'kick'; playerId: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'note'; station: StationId; text: string }
  | { t: 'act'; taskId: number; answer: any }
  | { t: 'ping'; at: number };

export type ServerMsg =
  | { t: 'welcome'; role: 'screen' | 'player'; code: string; playerId?: string; token?: string }
  | { t: 'state'; s: Snapshot }
  | { t: 'event'; e: GameEvent }
  | { t: 'result'; taskId: number; kind: 'progress' | 'done' | 'wrong' | 'expired'; hint?: string }
  | { t: 'error'; msg: string; fatal?: boolean }
  | { t: 'pong'; at: number };
