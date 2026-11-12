import { LOCKER_FLAGS, type Flag, type SignalsParams } from '../../shared/stations/signals';
import { sfx } from '../sfx';
import { flagOutline, flagSvg, skyAndSea, waveLines } from './art';
import { $, button, mount, nextId, type MinigameFactory } from './types';

const HULL: Record<string, string> = { red: '#b8352a', blue: '#2f5fa8', green: '#2f7d4a', brown: '#6b4226' };

export const signalsGame: MinigameFactory = (task, api) => {
  const p = task.params as SignalsParams;
  const id = nextId('sig');
  const hull = HULL[p.hull] ?? '#6b4226';

  const { root, svg, controls } = mount(`
    <svg viewBox="0 0 800 460" class="mg-art">
      ${skyAndSea(id, 210, task.ctx.storm)}
      <g>${waveLines(232, 4)}</g>
      <g class="other-ship ${p.fromLeft ? 'from-left' : 'from-right'}">
        <g transform="translate(300 0)">
          <path d="M-150 196 L150 196 L118 246 L-124 246 Z" fill="${hull}" stroke="rgba(0,0,0,0.35)" stroke-width="3"/>
          <rect x="-150" y="190" width="300" height="10" fill="#3a2614"/>
          ${[-100, -60, -20, 20, 60, 100].map((x) => `<circle cx="${x}" cy="218" r="5" fill="#1b2430" opacity="0.6"/>`).join('')}
          <rect x="-6" y="34" width="12" height="160" fill="#5b3920"/>
          <path d="M-4 50 Q-70 110 -6 176 Z" fill="#efe6d2" stroke="#c9b48a" stroke-width="2"/>
          <line x1="6" y1="38" x2="6" y2="190" stroke="#2a1a0c" stroke-width="1.5"/>
          ${p.flags.map((f, i) => `<g transform="translate(8 ${44 + i * 48})" class="flag-wave">${flagSvg(f)}${flagOutline(f)}</g>`).join('')}
        </g>
      </g>
      <g class="our-mast" transform="translate(690 0)">
        <rect x="-7" y="20" width="14" height="300" fill="#8a5a35"/>
        <circle cy="18" r="10" fill="#d4a44a"/>
        ${[0, 1, 2].map((i) => `<g class="slot" data-slot="${i}" transform="translate(8 ${44 + i * 64})">
            <rect class="slot-bg" x="-2" y="-2" width="64" height="44" rx="3" fill="rgba(255,255,255,0.18)" stroke="#fff" stroke-width="2" stroke-dasharray="6 4"/>
            <g class="slot-flag"></g>
          </g>`).join('')}
        <text x="0" y="300" text-anchor="middle" class="mg-caption light">OUR MAST</text>
      </g>
      <g class="locker">
        <rect x="0" y="330" width="800" height="130" fill="#6b4226"/>
        <rect x="0" y="330" width="800" height="8" fill="#3f2614"/>
        ${LOCKER_FLAGS.map((f, i) => `<g class="locker-flag" data-flag="${f}" transform="translate(${40 + i * 104} 362)">
            <rect x="-10" y="-10" width="80" height="60" rx="8" fill="#4a2c17"/>
            ${flagSvg(f)}${flagOutline(f)}
          </g>`).join('')}
      </g>
    </svg>
  `);
  root.classList.add('mg-signals');

  let slots: (Flag | null)[] = [null, null, null];
  const renderSlots = () => {
    svg.querySelectorAll<SVGGElement>('.slot').forEach((g) => {
      const i = Number(g.dataset.slot);
      const f = slots[i];
      const holder = g.querySelector('.slot-flag')!;
      holder.innerHTML = f ? flagSvg(f) + flagOutline(f) : '';
      g.classList.toggle('filled', !!f);
    });
  };
  const add = (f: Flag) => {
    const i = slots.indexOf(null);
    if (i === -1) return;
    sfx.click();
    slots[i] = f;
    renderSlots();
  };
  svg.querySelectorAll<SVGGElement>('.locker-flag').forEach((g) => g.addEventListener('click', () => add(g.dataset.flag as Flag)));
  svg.querySelectorAll<SVGGElement>('.slot').forEach((g) =>
    g.addEventListener('click', () => {
      slots[Number(g.dataset.slot)] = null;
      renderSlots();
    }),
  );

  const hoist = () => {
    if (slots.includes(null)) {
      $(svg, '.our-mast').classList.remove('nudge');
      void root.offsetWidth;
      $(svg, '.our-mast').classList.add('nudge');
      return;
    }
    sfx.click();
    api.send({ reply: slots });
  };
  const horn = () => {
    sfx.horn();
    api.send({ horn: true });
  };
  const clearAll = () => {
    slots = [null, null, null];
    renderSlots();
  };

  const hint = document.createElement('span');
  hint.className = 'mg-keys';
  hint.textContent = 'Fill our mast from the top · click a slot to clear it';
  controls.append(hint, button('Clear', clearAll, 'ghost'), button('Sound foghorn', horn, 'danger'), button('Hoist flags', hoist, 'primary'));
  renderSlots();

  return {
    el: root,
    update() {},
    onResult(kind) {
      if (kind === 'wrong') {
        root.classList.remove('shake');
        void root.offsetWidth;
        root.classList.add('shake');
        clearAll();
      }
    },
    key(e) {
      if (e.key === 'Backspace') {
        const last = [2, 1, 0].find((i) => slots[i] !== null);
        if (last !== undefined) {
          slots[last] = null;
          renderSlots();
        }
        return true;
      }
      if (e.key === 'Enter') return hoist(), true;
      return false;
    },
    destroy() {},
  };
};
