import type { RiggingParams, RiggingProg, RopeColor } from '../../shared/stations/rigging';
import type { Wind } from '../../shared/types';
import { sfx } from '../sfx';
import { COLORS } from './art';
import { $, mount, nextId, type MinigameFactory } from './types';

const WIND_ANGLE: Record<Wind, number> = { N: 0, E: 90, S: 180, W: 270 };

export function windVane(wind: Wind, cx: number, cy: number, r = 54) {
  const a = WIND_ANGLE[wind];
  return `
    <g transform="translate(${cx} ${cy})" class="vane">
      <circle r="${r}" fill="rgba(255,255,255,0.85)" stroke="#5b3920" stroke-width="4"/>
      <path d="M0 -14 L8 10 L0 5 L-8 10 Z" fill="#23436e" opacity="0.55"/>
      <g transform="rotate(${a})">
        <path d="M0 ${-r - 26} L0 ${-r + 30}" stroke="#d9483b" stroke-width="6" stroke-linecap="round"/>
        <path d="M-11 ${-r + 18} L0 ${-r + 36} L11 ${-r + 18} Z" fill="#d9483b"/>
        <path d="M-9 ${-r - 26} L0 ${-r - 16} L9 ${-r - 26}" stroke="#d9483b" stroke-width="4" fill="none"/>
      </g>
      ${['N', 'E', 'S', 'W'].map((d, i) => {
        const ang = (i * Math.PI) / 2;
        return `<text x="${Math.sin(ang) * (r - 14)}" y="${-Math.cos(ang) * (r - 14) + 6}" text-anchor="middle" class="vane-letter">${d}</text>`;
      }).join('')}
    </g>
    <text x="${cx}" y="${cy + r + 24}" text-anchor="middle" class="mg-caption">WIND</text>
  `;
}

export const riggingGame: MinigameFactory = (task, api) => {
  const p = task.params as RiggingParams;
  const id = nextId('rig');
  const n = p.ropes.length;
  const xs = p.ropes.map((_, i) => 150 + ((560 - 150) / Math.max(1, n - 1)) * i);

  const { root, svg, controls } = mount(`
    <svg viewBox="0 0 800 460" class="mg-art">
      <defs>
        <linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${task.ctx.storm ? '#3a4656' : '#7fb3dd'}"/><stop offset="1" stop-color="${task.ctx.storm ? '#6b7884' : '#e9dcc0'}"/></linearGradient>
      </defs>
      <rect width="800" height="460" fill="url(#${id}-sky)"/>
      <rect x="340" y="0" width="22" height="460" fill="#8a5a35"/>
      <rect x="120" y="22" width="460" height="14" rx="6" fill="#7a4b2a"/>
      <path class="sail" fill="#f1e6cf" stroke="#c9b48a" stroke-width="3"/>
      ${windVane(task.ctx.wind, 690, 110)}
      <rect x="100" y="250" width="500" height="26" rx="8" fill="#6b4226" stroke="#3f2614" stroke-width="3"/>
      <g class="ropes">
        ${p.ropes.map((c, i) => `
          <g class="rope" data-rope="${c}" data-i="${i}" transform="translate(${xs[i]} 0)">
            <path class="rope-hit" d="M0 40 L0 440" stroke="transparent" stroke-width="64"/>
            <path class="rope-line" fill="none" stroke="${COLORS[c]}" stroke-width="10" stroke-linecap="round" ${c === 'white' ? 'filter="drop-shadow(0 0 1px #333)"' : ''}/>
            <rect x="-16" y="256" width="32" height="14" rx="4" fill="#c9b48a"/>
            <g class="coil" opacity="0"><circle cy="412" r="26" fill="none" stroke="${COLORS[c]}" stroke-width="9"/><circle cy="412" r="12" fill="none" stroke="${COLORS[c]}" stroke-width="7"/></g>
            <text class="rope-key" y="452" text-anchor="middle">${i + 1}</text>
          </g>`).join('')}
      </g>
    </svg>
  `);
  root.classList.add('mg-rigging');

  let pulled: RopeColor[] = [...((task.prog as RiggingProg).pulled ?? [])];
  const sail = $(svg, '.sail');

  const render = () => {
    const k = pulled.length / n; // 0 = slack, 1 = full
    const bulge = -30 + 80 * k;
    const sway = (1 - k) * 18;
    sail.setAttribute(
      'd',
      `M130 36 L570 36 Q ${560 + sway} 130 540 230 Q 350 ${230 + bulge * 0.4} 160 230 Q ${140 - sway} 130 130 36 Z`,
    );
    sail.style.filter = k >= 1 ? 'drop-shadow(0 6px 10px rgba(0,0,0,0.25))' : '';
    svg.querySelectorAll<SVGGElement>('.rope').forEach((g) => {
      const color = g.dataset.rope as RopeColor;
      const done = pulled.includes(color);
      const line = g.querySelector('.rope-line')!;
      line.setAttribute('d', done ? 'M0 40 L0 262 L0 386' : 'M0 40 C 26 120, -26 190, 0 262 C 34 320, -30 380, 6 432');
      (g.querySelector('.coil') as SVGElement).setAttribute('opacity', done ? '1' : '0');
      g.classList.toggle('done', done);
    });
  };

  const pull = (color: RopeColor) => {
    if (pulled.includes(color)) return;
    pulled = [...pulled, color];
    sfx.click();
    render();
    api.send({ rope: color });
  };

  svg.querySelectorAll<SVGGElement>('.rope').forEach((g) => {
    g.addEventListener('click', () => pull(g.dataset.rope as RopeColor));
  });

  const hint = document.createElement('span');
  hint.className = 'mg-keys';
  hint.textContent = 'Click a rope to haul it in (or press 1–4)';
  controls.append(hint);
  render();

  return {
    el: root,
    update(t) {
      pulled = [...((t.prog as RiggingProg).pulled ?? [])];
      render();
    },
    onResult(kind) {
      if (kind === 'wrong') {
        sfx.splash();
        root.classList.remove('shake');
        void root.offsetWidth;
        root.classList.add('shake');
        pulled = [];
        render();
      }
    },
    key(e) {
      const i = Number(e.key) - 1;
      if (i >= 0 && i < n) {
        pull(p.ropes[i]);
        return true;
      }
      return false;
    },
    destroy() {},
  };
};
