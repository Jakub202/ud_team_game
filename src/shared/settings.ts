import { STATION_IDS, type Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  sicknessEnabled: true,
  sicknessInterval: 180,
  sicknessDuration: 60,
  firstSicknessAt: 120,
  stormsEnabled: true,
  stormInterval: 240,
  stormDuration: 40,
  stormStrength: 1,
  distance: 200,
  taskPace: 1,
  taskTime: 40,
  trainingDuration: 180,
  handoverNotes: false,
  sinking: true,
  enabledStations: [...STATION_IDS],
};

export type NumericKey = {
  [K in keyof Settings]: Settings[K] extends number ? K : never;
}[keyof Settings];
export type BoolKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

export interface NumMeta {
  key: NumericKey;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  group: string;
}
export interface BoolMeta {
  key: BoolKey;
  label: string;
  group: string;
}

export const NUM_SETTINGS: NumMeta[] = [
  { key: 'sicknessInterval', label: 'Seasickness every', min: 60, max: 600, step: 15, unit: 's', group: 'Seasickness' },
  { key: 'sicknessDuration', label: 'Sick for', min: 20, max: 180, step: 5, unit: 's', group: 'Seasickness' },
  { key: 'firstSicknessAt', label: 'First sickness after', min: 20, max: 600, step: 10, unit: 's', group: 'Seasickness' },
  { key: 'stormInterval', label: 'Storm every', min: 60, max: 900, step: 15, unit: 's', group: 'Weather' },
  { key: 'stormDuration', label: 'Storm lasts', min: 15, max: 120, step: 5, unit: 's', group: 'Weather' },
  { key: 'stormStrength', label: 'Storm strength', min: 1, max: 3, step: 1, group: 'Weather' },
  { key: 'distance', label: 'Voyage distance', min: 30, max: 500, step: 10, unit: 'nm', group: 'Voyage' },
  { key: 'taskPace', label: 'Task pace', min: 0.5, max: 2, step: 0.1, unit: '×', group: 'Voyage' },
  { key: 'taskTime', label: 'Time per task', min: 15, max: 120, step: 5, unit: 's', group: 'Voyage' },
  { key: 'trainingDuration', label: 'Training time', min: 30, max: 600, step: 15, unit: 's', group: 'Voyage' },
];

export const BOOL_SETTINGS: BoolMeta[] = [
  { key: 'sicknessEnabled', label: 'Seasickness on', group: 'Seasickness' },
  { key: 'handoverNotes', label: 'Handover notes', group: 'Seasickness' },
  { key: 'stormsEnabled', label: 'Storms on', group: 'Weather' },
  { key: 'sinking', label: 'Ship can sink', group: 'Voyage' },
];

export function sanitizeSettings(base: Settings, patch: Partial<Settings>): Settings {
  const next: Settings = { ...base };
  for (const m of NUM_SETTINGS) {
    const v = patch[m.key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      next[m.key] = Math.min(m.max, Math.max(m.min, v));
    }
  }
  for (const m of BOOL_SETTINGS) {
    const v = patch[m.key];
    if (typeof v === 'boolean') next[m.key] = v;
  }
  if (Array.isArray(patch.enabledStations)) {
    const list = STATION_IDS.filter((id) => patch.enabledStations!.includes(id));
    if (list.length > 0) next.enabledStations = list;
  }
  return next;
}

export const STORM_LABELS = ['', 'Mild', 'Moderate', 'Rough'];
