import type { StationDef } from './def';

export type BuoyColor = 'red' | 'green' | 'yellow';
export interface HelmParams {
  buoy: BuoyColor;
  stripes: 1 | 2;
  lighthouse: boolean;
  /** Purely cosmetic: where on the horizon the buoy bobs (0..1). */
  x: number;
}
export interface HelmAnswer {
  /** -2 hard port … 0 straight … +2 hard starboard */
  turn: number;
}

export const TURN_LABELS: Record<string, string> = {
  '-2': 'hard left',
  '-1': 'left',
  '0': 'straight ahead',
  '1': 'right',
  '2': 'hard right',
};

export function helmSolution(p: HelmParams): number {
  if (p.buoy === 'yellow') return 0;
  let turn = p.buoy === 'red' ? 1 : -1;
  if (p.stripes === 2) turn *= 2;
  if (p.lighthouse) turn = -turn;
  return turn;
}

export const helm: StationDef<HelmParams, {}, HelmAnswer> = {
  id: 'helm',
  name: 'Helm',
  alert: 'Buoy ahead!',
  blurb: 'Steer the ship past the buoys.',
  timeMul: 0.9,
  failWater: 10,
  rules: [
    'When a buoy shows up ahead, turn the wheel, then press **Set course**.',
    '**Red** buoy: turn **right**. **Green** buoy: turn **left**.',
    'Buoy with **two white stripes**: turn **hard**, all the way to the end.',
    '**Yellow** buoy: hold **straight ahead**, whatever else is going on.',
    'Is the **lighthouse blinking** on the horizon? Then **flip it**: left becomes right, right becomes left.',
  ],
  generate(rng) {
    const buoy = rng.pick<BuoyColor>(['red', 'red', 'green', 'green', 'yellow']);
    return {
      buoy,
      stripes: rng.chance(0.45) ? 2 : 1,
      lighthouse: rng.chance(0.4),
      x: rng.range(0.3, 0.7),
    };
  },
  initProg: () => ({}),
  step(p, prog, a) {
    const want = helmSolution(p);
    if (a && a.turn === want) return { kind: 'done', prog };
    const why: string[] = [];
    if (p.buoy === 'yellow') why.push('Yellow buoy: always straight ahead.');
    else {
      why.push(`${p.buoy === 'red' ? 'Red: right' : 'Green: left'}${p.stripes === 2 ? ', two stripes: hard' : ''}.`);
      if (p.lighthouse) why.push('Lighthouse blinking: flip it.');
    }
    return { kind: 'wrong', prog, hint: `Should be ${TURN_LABELS[String(want)]}. ${why.join(' ')}` };
  },
  solve: (p) => [{ turn: helmSolution(p) }],
};
