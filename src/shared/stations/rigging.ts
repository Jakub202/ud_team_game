import type { Ctx } from '../types';
import type { StationDef } from './def';

export type RopeColor = 'red' | 'yellow' | 'green' | 'blue' | 'white';
export const ROPE_ORDER: RopeColor[] = ['red', 'yellow', 'green', 'blue', 'white'];

export interface RiggingParams {
  /** Ropes left → right as they hang on the rail. */
  ropes: RopeColor[];
}
export interface RiggingProg {
  pulled: RopeColor[];
}
export interface RiggingAnswer {
  rope: RopeColor;
}

export const isCrosswind = (ctx: Ctx) => ctx.wind === 'E' || ctx.wind === 'W';

export function riggingOrder(p: RiggingParams, ctx: Ctx): RopeColor[] {
  const order = ROPE_ORDER.filter((c) => p.ropes.includes(c));
  return isCrosswind(ctx) ? order.reverse() : order;
}

export const rigging: StationDef<RiggingParams, RiggingProg, RiggingAnswer> = {
  id: 'rigging',
  name: 'Rigging',
  alert: 'Sail is luffing!',
  blurb: 'Trim the sail by hauling the ropes.',
  timeMul: 1,
  failWater: 5,
  rules: [
    'When the sail goes slack, haul in **every** rope, one at a time (click a rope to haul it).',
    'Always haul in this order: **red, yellow, green, blue, white**. Think of a traffic light going red to green, then the blue sea, then white clouds. Skip any colour that isn\'t there.',
    'Look at the **wind vane**. If the wind comes from the **side (east or west)**, haul in **reverse order**, white first.',
    'Wrong rope? The sail slips and you start over.',
  ],
  generate(rng) {
    const n = rng.chance(0.5) ? 3 : 4;
    return { ropes: rng.shuffle(ROPE_ORDER).slice(0, n) };
  },
  initProg: () => ({ pulled: [] }),
  step(p, prog, a, ctx) {
    const order = riggingOrder(p, ctx);
    const expected = order[prog.pulled.length];
    if (a && a.rope === expected) {
      const pulled = [...prog.pulled, a.rope];
      return { kind: pulled.length === order.length ? 'done' : 'progress', prog: { pulled } };
    }
    const dir = isCrosswind(ctx) ? 'Wind from the side, so reverse order' : 'Wind from ahead or behind, so normal order';
    return { kind: 'wrong', prog: { pulled: [] }, hint: `${dir}: ${order.join(' → ')}.` };
  },
  solve: (p, ctx) => riggingOrder(p, ctx).map((rope) => ({ rope })),
};
