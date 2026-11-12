import type { StationId } from '../../shared/types';
import { bilgeGame } from './bilge';
import { galleyGame } from './galley';
import { helmGame } from './helm';
import { lookoutGame } from './lookout';
import { riggingGame } from './rigging';
import { signalsGame } from './signals';
import type { MinigameFactory } from './types';

export const MINIGAMES: Record<StationId, MinigameFactory> = {
  helm: helmGame,
  rigging: riggingGame,
  bilge: bilgeGame,
  signals: signalsGame,
  lookout: lookoutGame,
  galley: galleyGame,
};
export type { Minigame } from './types';
