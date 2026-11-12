import type { Ctx } from '../types';
import { sameMultiset, type StationDef } from './def';

export type Ingredient = 'fish' | 'potato' | 'milk' | 'oats' | 'butter' | 'sausage' | 'carrot' | 'onion';
export const PANTRY: Ingredient[] = ['fish', 'potato', 'milk', 'oats', 'butter', 'sausage', 'carrot', 'onion'];

export type Dish = 'fishsoup' | 'porridge' | 'stew';
export const DISH_NAMES: Record<Dish, string> = {
  fishsoup: 'Fish soup',
  porridge: 'Porridge',
  stew: 'Sailor\'s stew',
};
export const RECIPES: Record<Dish, Ingredient[]> = {
  fishsoup: ['fish', 'potato', 'milk'],
  porridge: ['oats', 'milk', 'butter'],
  stew: ['sausage', 'potato', 'carrot'],
};
export const STIRS_NEEDED = 3;

export interface GalleyParams {
  dish: Dish;
}
export interface GalleyAnswer {
  ingredients: Ingredient[];
  heat: 'low' | 'high';
  stirs: number;
}

export const galleyHeat = (ctx: Ctx) => (ctx.storm ? 'high' : 'low');

export const galley: StationDef<GalleyParams, {}, GalleyAnswer> = {
  id: 'galley',
  name: 'Galley',
  alert: 'The crew is hungry!',
  blurb: 'Cook for the rowers to keep their strength up.',
  timeMul: 1.3,
  failWater: 4,
  rules: [
    'The order is pinned on the wall. Put **exactly** the right ingredients in the pot, nothing extra:',
    '**Fish soup** = fish + potato + milk. **Porridge** = oats + milk + butter. **Sailor\'s stew** = sausage + potato + carrot.',
    'Stove on **LOW**. In a **storm** the crew needs it hot, so put it on **HIGH**.',
    'Stir the pot **three full circles** (drag around the pot), then ring the **dinner bell**.',
  ],
  generate(rng) {
    return { dish: rng.pick<Dish>(['fishsoup', 'porridge', 'stew']) };
  },
  initProg: () => ({}),
  step(p, prog, a, ctx) {
    const recipe = RECIPES[p.dish];
    const problems: string[] = [];
    if (!a || !Array.isArray(a.ingredients) || !sameMultiset(a.ingredients, recipe)) {
      problems.push(`${DISH_NAMES[p.dish]} is ${recipe.join(' + ')}.`);
    }
    if (!a || a.heat !== galleyHeat(ctx)) {
      problems.push(ctx.storm ? 'Storm: stove on HIGH.' : 'No storm: stove on LOW.');
    }
    if (!a || !(a.stirs >= STIRS_NEEDED)) problems.push('Stir three full circles before ringing the bell.');
    if (problems.length === 0) return { kind: 'done', prog };
    return { kind: 'wrong', prog, hint: problems.join(' ') };
  },
  solve: (p, ctx) => [{ ingredients: [...RECIPES[p.dish]], heat: galleyHeat(ctx), stirs: STIRS_NEEDED }],
};
