import type { Ctx } from '../types';
import type { StationDef } from './def';

export type Sighting = 'whale' | 'rock' | 'ship' | 'iceberg';
export const RINGS: Record<Sighting, number> = { whale: 1, rock: 2, ship: 3, iceberg: 4 };

export interface LookoutParams {
  object: Sighting;
  /** Position in the panorama (0..1). */
  x: number;
  y: number;
}
export interface LookoutAnswer {
  rings: number;
}

export const lookoutRings = (p: LookoutParams, ctx: Ctx) => RINGS[p.object] + (ctx.storm ? 1 : 0);

export const lookout: StationDef<LookoutParams, {}, LookoutAnswer> = {
  id: 'lookout',
  name: 'Lookout',
  alert: 'Something in the fog…',
  blurb: 'Spot things in the fog and warn the crew.',
  timeMul: 1,
  failWater: 6,
  rules: [
    'Something is out in the fog. Sweep the spyglass around (move the mouse) until you find it.',
    'Ring the bell once per warning: **whale 1** · **rock 2** · **ship 3** · **iceberg 4**.',
    'In a **storm**, ring **one extra time**.',
    'Then press **Report**.',
  ],
  generate(rng) {
    return {
      object: rng.pick<Sighting>(['whale', 'rock', 'ship', 'iceberg']),
      x: rng.range(0.08, 0.92),
      y: rng.range(0.35, 0.65),
    };
  },
  initProg: () => ({}),
  step(p, prog, a, ctx) {
    const want = lookoutRings(p, ctx);
    if (a && a.rings === want) return { kind: 'done', prog };
    return {
      kind: 'wrong',
      prog,
      hint: `It was a ${p.object}: ${RINGS[p.object]} ring${RINGS[p.object] > 1 ? 's' : ''}${ctx.storm ? ', plus 1 for the storm' : ''} = ${want}.`,
    };
  },
  solve: (p, ctx) => [{ rings: lookoutRings(p, ctx) }],
};
