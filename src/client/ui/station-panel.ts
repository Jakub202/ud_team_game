import { STATIONS } from '../../shared/stations';
import type { StationId, TaskView, Wind } from '../../shared/types';
import { MINIGAMES, type Minigame } from '../minigames';
import { sfx } from '../sfx';
import { clear, h } from './dom';
import { ICONS, STATION_ICONS } from './icons';

const WIND_NAME: Record<Wind, string> = { N: 'north', E: 'east', S: 'south', W: 'west' };
const WIND_ARROW: Record<Wind, string> = { N: '↓', E: '←', S: '↑', W: '→' };

/** One station's panel: header, timer, and the minigame (or an idle view). */
export class StationPanel {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private chips: HTMLElement;
  private timer: HTMLElement;
  private timerFill: HTMLElement;
  private hint: HTMLElement;
  private flashEl: HTMLElement;
  private coverEl: HTMLElement;
  private task: TaskView | null = null;
  private game: Minigame | null = null;
  private flashTimer = 0;

  constructor(readonly station: StationId, private send: (taskId: number, answer: unknown) => void) {
    const def = STATIONS[station];
    this.chips = h('div.chips');
    this.timerFill = h('div.timer-fill');
    this.timer = h('div.timer', this.timerFill);
    this.hint = h('div.panel-hint');
    this.flashEl = h('div.panel-flash');
    this.coverEl = h('div.cover-banner');
    this.body = h('div.panel-body');
    this.el = h(
      'section.station-panel',
      { 'data-station': station },
      h('header.panel-head', h('span.panel-icon', { html: STATION_ICONS[station] }), h('h2', def.name), this.chips),
      this.timer,
      this.coverEl,
      this.body,
      this.hint,
      this.flashEl,
    );
    this.showIdle();
  }

  setCovering(ownerName: string | null, note: string | null) {
    clear(this.coverEl);
    this.coverEl.classList.toggle('on', !!ownerName);
    if (!ownerName) return;
    this.coverEl.append(h('div.cover-title', { html: `${ICONS.swap}` }, h('span', `You're covering for ${ownerName}. Ask them how this station works!`)));
    if (note) this.coverEl.append(h('div.cover-note', h('b', `${ownerName}'s handover note: `), note));
  }

  setTask(task: TaskView | null) {
    if (task && this.task && task.id === this.task.id) {
      // Only forward real progress changes, so optimistic UI isn't reset by a stale snapshot.
      const changed = JSON.stringify(task.prog) !== JSON.stringify(this.task.prog);
      const ctxChanged = task.ctx.wind !== this.task.ctx.wind || task.ctx.storm !== this.task.ctx.storm;
      this.task = task;
      if (ctxChanged) {
        this.renderChips(task);
        this.el.classList.remove('ctx-flash');
        void this.el.offsetWidth;
        this.el.classList.add('ctx-flash');
      }
      if (changed) this.game?.update(task);
      return;
    }
    this.game?.destroy();
    this.game = null;
    this.task = task;
    clear(this.body);
    this.hint.textContent = '';
    this.hint.classList.remove('on');
    if (!task) {
      this.showIdle();
      return;
    }
    this.renderChips(task);
    this.game = MINIGAMES[task.station](task, { send: (a) => this.send(task.id, a) });
    this.body.append(h('div.task-alert', STATIONS[task.station].alert), this.game.el);
  }

  private renderChips(task: TaskView) {
    clear(this.chips);
    this.chips.append(
      h('span.chip', { html: ICONS.wind }, h('span', `Wind from the ${WIND_NAME[task.ctx.wind]} ${WIND_ARROW[task.ctx.wind]}`)),
      task.ctx.storm ? h('span.chip.storm', { html: ICONS.storm }, h('span', 'Storm')) : h('span.chip', { html: ICONS.sun }, h('span', 'Calm')),
    );
    if (task.practice) this.chips.append(h('span.chip.practice', 'Practice'));
  }

  private showIdle() {
    clear(this.chips);
    const def = STATIONS[this.station];
    this.body.append(
      h(
        'div.idle',
        h('div.idle-icon', { html: STATION_ICONS[this.station] }),
        h('p.idle-title', `All calm at the ${def.name.toLowerCase()}.`),
        h('p.idle-sub', def.blurb),
      ),
    );
    this.timer.style.visibility = 'hidden';
  }

  onResult(kind: 'progress' | 'done' | 'wrong' | 'expired', hint?: string) {
    this.game?.onResult?.(kind);
    if (kind === 'wrong') {
      sfx.wrong();
      if (hint) {
        this.hint.textContent = hint;
        this.hint.classList.add('on');
      } else this.flash('wrong', 'Not quite…');
    }
    if (kind === 'done') {
      sfx.done();
      this.hint.classList.remove('on');
      this.flash('done', this.task?.practice ? 'Correct!' : 'Stroke!');
    }
    if (kind === 'expired') {
      sfx.wrong();
      this.flash('expired', 'Too late, water is coming in!');
    }
  }

  private flash(kind: string, text: string) {
    this.flashEl.className = `panel-flash on ${kind}`;
    this.flashEl.textContent = text;
    clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => (this.flashEl.className = 'panel-flash'), 1100);
  }

  tick(gtNow: number) {
    const t = this.task;
    if (!t || t.deadline === null) {
      this.timer.style.visibility = 'hidden';
      return;
    }
    this.timer.style.visibility = 'visible';
    const total = t.deadline - t.createdAt;
    const left = Math.max(0, t.deadline - gtNow);
    const k = total > 0 ? left / total : 0;
    this.timerFill.style.transform = `scaleX(${k})`;
    this.timer.classList.toggle('low', k < 0.3);
  }

  key(e: KeyboardEvent): boolean {
    return this.game?.key?.(e) ?? false;
  }

  get hasTask() {
    return !!this.task;
  }

  destroy() {
    this.game?.destroy();
    clearTimeout(this.flashTimer);
  }
}
