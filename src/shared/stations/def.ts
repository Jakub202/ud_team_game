import type { Rng } from '../rng';
import type { Ctx, StationId } from '../types';

export interface StepResult<S> {
  kind: 'progress' | 'done' | 'wrong';
  prog: S;
  /** Explanation of the mistake. Only shown during training. */
  hint?: string;
}

export interface StationDef<P = any, S = any, A = any> {
  id: StationId;
  name: string;
  /** Short label for the task alert, e.g. "Buoy ahead!" */
  alert: string;
  /** One-line description shown everywhere (does NOT reveal the rules). */
  blurb: string;
  /** Training card lines. `**text**` renders bold. */
  rules: string[];
  /** Multiplier on the base task time limit. */
  timeMul: number;
  /** Water added to the hold when a task at this station fails. */
  failWater: number;
  generate(rng: Rng, ctx: Ctx): P;
  initProg(params: P): S;
  step(params: P, prog: S, answer: A, ctx: Ctx): StepResult<S>;
  /** Answers that complete the task — used by bots and tests. */
  solve(params: P, ctx: Ctx): A[];
}

export function sameMultiset(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].sort();
  const y = [...b].sort();
  return x.every((v, i) => v === y[i]);
}
