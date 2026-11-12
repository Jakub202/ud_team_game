import type { StationId } from '../types';
import type { StationDef } from './def';
import { helm } from './helm';
import { rigging } from './rigging';
import { bilge } from './bilge';
import { signals } from './signals';
import { lookout } from './lookout';
import { galley } from './galley';

export const STATIONS: Record<StationId, StationDef> = { helm, rigging, bilge, signals, lookout, galley };
export type { StationDef } from './def';
