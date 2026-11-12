// Self-test: every station's solution passes its own rules, and a bot-crewed voyage plays out end to end.
import { seeded } from '../src/shared/rng';
import { STATIONS } from '../src/shared/stations';
import { STATION_IDS, WINDS, type Ctx, type ServerMsg } from '../src/shared/types';
import { Room, type Conn } from '../src/server/room';

let failures = 0;
const check = (cond: boolean, msg: string) => {
  if (!cond) {
    failures++;
    console.error('  ✗', msg);
  }
};

// 1. Rules: generate → solve → step must finish with 'done'; a garbage answer must be 'wrong'.
console.log('Rules');
for (const id of STATION_IDS) {
  const def = STATIONS[id];
  const rng = seeded(42);
  let wrongSeen = 0;
  for (let i = 0; i < 500; i++) {
    const ctx: Ctx = { wind: rng.pick(WINDS), storm: rng.chance(0.5) };
    const params = def.generate(rng, ctx);
    let prog = def.initProg(params);
    const steps = def.solve(params, ctx);
    let last = '';
    for (const [j, a] of steps.entries()) {
      const r = def.step(params, prog, a, ctx);
      prog = r.prog;
      last = r.kind;
      if (j < steps.length - 1) check(r.kind === 'progress', `${id}: intermediate step should be progress, got ${r.kind}`);
    }
    check(last === 'done', `${id}: solution did not finish (${JSON.stringify(params)} ${JSON.stringify(ctx)})`);
    const bad = def.step(params, def.initProg(params), { nonsense: true }, ctx);
    if (bad.kind === 'wrong') wrongSeen++;
    check(bad.kind === 'wrong' && !!bad.hint, `${id}: nonsense answer should be wrong with a hint`);
  }
  console.log(`  ${id.padEnd(8)} ok (500 cases, ${wrongSeen} rejected nonsense)`);
}

// 2. Simulated voyage with bots and a fake clock.
console.log('Voyage simulation');
let clock = 1_000_000;
const realNow = Date.now;
Date.now = () => clock;

const sent: ServerMsg[] = [];
const fakeWs = (sink: ServerMsg[]) => ({ readyState: 1, send: (s: string) => sink.push(JSON.parse(s)) }) as any;
const screen: Conn = { ws: fakeWs(sent), role: 'none' };
const room = new Room(new Set());
room.addScreen(screen);
for (let i = 0; i < 5; i++) room.handle(screen, { t: 'addBot' });
room.handle(screen, { t: 'settings', patch: { trainingDuration: 30, distance: 120, sicknessInterval: 90, sicknessDuration: 40, firstSicknessAt: 40, stormInterval: 120 } });

const advance = (ms: number) => {
  for (let t = 0; t < ms; t += 100) {
    clock += 100;
    room.tick();
  }
};

room.handle(screen, { t: 'start' }); // → training
check(room.phase === 'training', 'should be in training');
advance(31_000);
check(room.phase === 'voyage', 'training should end into voyage');

let sickEvents = 0;
let recovered = 0;
let storms = 0;
let strokes = 0;
let coveredStrokes = 0;
const seenEvents = sent.length;
advance(25 * 60_000);
for (const m of sent.slice(seenEvents)) {
  if (m.t !== 'event') continue;
  if (m.e.type === 'sick') sickEvents++;
  if (m.e.type === 'recovered') recovered++;
  if (m.e.type === 'storm' && m.e.on) storms++;
  if (m.e.type === 'stroke') {
    strokes++;
    if (m.e.covered) coveredStrokes++;
  }
}
const lastState = [...sent].reverse().find((m) => m.t === 'state') as Extract<ServerMsg, { t: 'state' }>;
const d = lastState.s.debrief;
console.log(`  phase=${room.phase} result=${d?.result} duration=${d?.duration.toFixed(0)}s strokes=${strokes} covered=${coveredStrokes}`);
console.log(`  sick=${sickEvents} recovered=${recovered} storms=${storms} water=${lastState.s.ship.water.toFixed(1)}`);
console.log(`  owner avg ${d?.owner.avgTime?.toFixed(1)}s (${d?.owner.done} done / ${d?.owner.failed} failed), cover avg ${d?.cover.avgTime?.toFixed(1)}s (${d?.cover.done} / ${d?.cover.failed})`);
for (const h of d?.handovers ?? []) console.log(`  handover ${h.sickName} → ${h.subName}: ${h.done} done, ${h.failed} failed`);
check(room.phase === 'debrief', 'voyage should end');
check(sickEvents >= 1 && recovered >= 1, 'sickness should happen and end');
check(coveredStrokes > 0, 'substitutes should complete tasks');
check(!!d && d.handovers.length === sickEvents, 'each sickness should have a handover record');

room.handle(screen, { t: 'again' });
check(room.phase === 'lobby', 'play again returns to lobby');

Date.now = realNow;
if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll good ✔');
