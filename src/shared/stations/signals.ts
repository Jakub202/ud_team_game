import type { StationDef } from './def';

export type Flag = 'cross' | 'stripes' | 'check' | 'diagonal' | 'circle' | 'pennant' | 'duck';
export const INCOMING_FLAGS: Flag[] = ['cross', 'stripes', 'check', 'diagonal', 'circle', 'pennant'];
export const LOCKER_FLAGS: Flag[] = ['cross', 'stripes', 'check', 'diagonal', 'circle', 'pennant', 'duck'];
export const FLAG_NAMES: Record<Flag, string> = {
  cross: 'blue cross',
  stripes: 'red stripes',
  check: 'checkered',
  diagonal: 'diagonal',
  circle: 'circle',
  pennant: 'green pennant',
  duck: 'duck flag',
};

export type HullColor = 'red' | 'blue' | 'green' | 'brown';

export interface SignalsParams {
  hull: HullColor;
  /** Incoming flags, top → bottom. */
  flags: Flag[];
  fromLeft: boolean;
}
export type SignalsAnswer = { reply: Flag[] } | { horn: true };

export function signalsReply(p: SignalsParams): Flag[] {
  return [...p.flags].reverse().map((f) => (f === 'check' ? 'duck' : f));
}

export const signals: StationDef<SignalsParams, {}, SignalsAnswer> = {
  id: 'signals',
  name: 'Signals',
  alert: 'Ship hailing us!',
  blurb: 'Answer passing ships with signal flags.',
  timeMul: 1.15,
  failWater: 5,
  rules: [
    'A passing ship hoists **three flags**. Answer by hoisting three flags of your own (click flags to fill the slots top to bottom), then press **Hoist**.',
    'Answer with the same flags in **reverse order**: their bottom flag goes on top.',
    'Never hoist the **checkered** flag. Use the **duck flag** in its place.',
    '**Red hull = pirates!** Don\'t answer at all. Sound the **foghorn**.',
  ],
  generate(rng) {
    const hull = rng.chance(0.2) ? 'red' : rng.pick<HullColor>(['blue', 'green', 'brown']);
    const flags = rng.shuffle(INCOMING_FLAGS).slice(0, 3);
    // Make the checkered flag show up often enough to matter.
    if (!flags.includes('check') && rng.chance(0.4)) flags[rng.int(0, 2)] = 'check';
    return { hull, flags, fromLeft: rng.chance(0.5) };
  },
  initProg: () => ({}),
  step(p, prog, a) {
    if (p.hull === 'red') {
      if (a && 'horn' in a) return { kind: 'done', prog };
      return { kind: 'wrong', prog, hint: 'Red hull means pirates: no flags, sound the foghorn.' };
    }
    const want = signalsReply(p);
    if (a && 'reply' in a && Array.isArray(a.reply) && a.reply.length === 3 && a.reply.every((f, i) => f === want[i])) {
      return { kind: 'done', prog };
    }
    if (a && 'horn' in a) return { kind: 'wrong', prog, hint: 'The foghorn is only for pirates (red hull). Answer with flags.' };
    return { kind: 'wrong', prog, hint: `Reverse order, with the duck flag for checkered: ${want.map((f) => FLAG_NAMES[f]).join(', ')} (top to bottom).` };
  },
  solve: (p) => (p.hull === 'red' ? [{ horn: true }] : [{ reply: signalsReply(p) }]),
};
