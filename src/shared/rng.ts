export interface Rng {
  next(): number; // [0, 1)
  int(min: number, max: number): number; // inclusive
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  chance(p: number): boolean;
  range(min: number, max: number): number;
}

export function makeRng(source: () => number = Math.random): Rng {
  const rng: Rng = {
    next: source,
    int: (min, max) => Math.floor(source() * (max - min + 1)) + min,
    pick: (items) => items[Math.floor(source() * items.length)],
    shuffle: (items) => {
      const a = items.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(source() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    chance: (p) => source() < p,
    range: (min, max) => min + source() * (max - min),
  };
  return rng;
}

/** Deterministic PRNG for tests. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return makeRng(() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
}
