import type { StationDef } from './def';

export type ZoneColor = 'red' | 'green' | 'yellow';
export type LanternColor = ZoneColor | 'white';

export interface BilgeParams {
  lantern: LanternColor;
  /** Gauge zones left → right. */
  zones: ZoneColor[];
  /** Good pumps needed to empty the hold. */
  pumps: number;
  /** Needle sweep speed (cycles per second). */
  speed: number;
}
export interface BilgeProg {
  good: number;
}
export type BilgeAnswer = { pump: ZoneColor | null } | { valve: true };

export const bilge: StationDef<BilgeParams, BilgeProg, BilgeAnswer> = {
  id: 'bilge',
  name: 'Bilge pump',
  alert: 'Water in the hold!',
  blurb: 'Pump the water out of the hold.',
  timeMul: 1,
  failWater: 8,
  rules: [
    'When water comes into the hold, look at the **lantern** above the pump.',
    'Pump (click the handle or press **space**) only while the needle is in the zone that is the **same colour as the lantern**. Keep going until the hold is empty.',
    '**White lantern**: **don\'t pump!** Open the **drain valve** instead.',
    'Pumping in the wrong zone lets water back in.',
  ],
  generate(rng, ctx) {
    const lantern = rng.chance(0.2) ? 'white' : rng.pick<ZoneColor>(['red', 'green', 'yellow']);
    return {
      lantern,
      zones: rng.shuffle<ZoneColor>(['red', 'green', 'yellow']),
      pumps: ctx.storm ? 6 : 4,
      speed: rng.range(0.35, 0.55),
    };
  },
  initProg: () => ({ good: 0 }),
  step(p, prog, a) {
    if (p.lantern === 'white') {
      if (a && 'valve' in a) return { kind: 'done', prog };
      return { kind: 'wrong', prog, hint: 'White lantern: don\'t pump, open the drain valve.' };
    }
    if (a && 'pump' in a && a.pump === p.lantern) {
      const good = prog.good + 1;
      return { kind: good >= p.pumps ? 'done' : 'progress', prog: { good } };
    }
    if (a && 'valve' in a) {
      return { kind: 'wrong', prog, hint: 'The valve is only for a white lantern. Pump in the zone that matches the lantern.' };
    }
    return {
      kind: 'wrong',
      prog: { good: Math.max(0, prog.good - 1) },
      hint: `Lantern is ${p.lantern}, so only pump while the needle is in the ${p.lantern} zone.`,
    };
  },
  solve(p) {
    if (p.lantern === 'white') return [{ valve: true }];
    return Array.from({ length: p.pumps }, () => ({ pump: p.lantern as ZoneColor }));
  },
};
