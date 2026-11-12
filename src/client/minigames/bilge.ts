import type { BilgeParams, BilgeProg, ZoneColor } from '../../shared/stations/bilge';
import { sfx } from '../sfx';
import { COLORS } from './art';
import { $, button, mount, nextId, type MinigameFactory } from './types';

function sector(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1} Z`;
}

export const bilgeGame: MinigameFactory = (task, api) => {
  const p = task.params as BilgeParams;
  const id = nextId('bilge');
  const lantern = p.lantern === 'white' ? '#fffbe8' : COLORS[p.lantern];
  const GX = 420;
  const GY = 360;

  const { root, svg, controls } = mount(`
    <svg viewBox="0 0 800 460" class="mg-art">
      <defs>
        <radialGradient id="${id}-glow"><stop offset="0" stop-color="${lantern}" stop-opacity="0.9"/><stop offset="1" stop-color="${lantern}" stop-opacity="0"/></radialGradient>
        <clipPath id="${id}-hold"><rect x="40" y="60" width="210" height="360" rx="14"/></clipPath>
      </defs>
      <rect width="800" height="460" fill="#3b2617"/>
      ${Array.from({ length: 12 }, (_, i) => `<rect x="0" y="${i * 40}" width="800" height="38" fill="${i % 2 ? '#43301f' : '#3e2b1b'}"/>`).join('')}
      <g>
        <rect x="40" y="60" width="210" height="360" rx="14" fill="#24170d" stroke="#1a0f07" stroke-width="6"/>
        <g clip-path="url(#${id}-hold)">
          <g class="water">
            <rect x="20" y="0" width="260" height="460" fill="#2f6f8f" opacity="0.92"/>
            <path class="wave" d="M20 0 q 16 -10 32 0 t 32 0 t 32 0 t 32 0 t 32 0 t 32 0 t 32 0 t 32 0 V 20 H20 Z" fill="#4b93b3"/>
          </g>
        </g>
        ${[120, 200, 280, 360].map((y) => `<line x1="40" y1="${y}" x2="60" y2="${y}" stroke="#8a6a4a" stroke-width="3"/>`).join('')}
        <text x="145" y="445" text-anchor="middle" class="mg-caption light">HOLD</text>
      </g>
      <g transform="translate(${GX} 0)">
        <line x1="0" y1="0" x2="0" y2="40" stroke="#222" stroke-width="3"/>
        <circle cx="0" cy="82" r="80" fill="url(#${id}-glow)" class="lantern-glow"/>
        <path d="M-22 44 h44 l-6 10 v50 l6 10 h-44 l6 -10 v-50 z" fill="#2b2b2b"/>
        <rect x="-15" y="56" width="30" height="46" rx="4" fill="${lantern}" class="lantern-glass"/>
        <path d="M-15 56 h30 M-15 79 h30 M0 56 v46" stroke="#2b2b2b" stroke-width="2"/>
      </g>
      <g>
        <path d="${sector(GX, GY, 150, -92, 92)}" fill="#1b2430"/>
        ${p.zones.map((z, i) => `<path d="${sector(GX, GY, 138, -90 + i * 60, -30 + i * 60)}" fill="${COLORS[z]}" opacity="0.92"/>`).join('')}
        <path d="${sector(GX, GY, 70, -91, 91)}" fill="#1b2430"/>
        ${Array.from({ length: 13 }, (_, i) => {
          const a = ((-90 + i * 15) * Math.PI) / 180;
          return `<line x1="${GX + Math.sin(a) * 140}" y1="${GY - Math.cos(a) * 140}" x2="${GX + Math.sin(a) * 150}" y2="${GY - Math.cos(a) * 150}" stroke="#d4a44a" stroke-width="3"/>`;
        }).join('')}
        <line class="needle" x1="${GX}" y1="${GY}" x2="${GX}" y2="${GY - 145}" stroke="#f4f1ea" stroke-width="6" stroke-linecap="round"/>
        <circle cx="${GX}" cy="${GY}" r="14" fill="#d4a44a"/>
        <text x="${GX}" y="${GY + 50}" text-anchor="middle" class="mg-caption light">PRESSURE</text>
      </g>
      <g class="pump" transform="translate(660 250)">
        <rect x="-26" y="0" width="52" height="150" rx="8" fill="#d4a44a" stroke="#8a6a2a" stroke-width="4"/>
        <rect x="-34" y="140" width="68" height="20" rx="5" fill="#8a6a2a"/>
        <g class="lever"><rect x="-8" y="-150" width="16" height="160" rx="6" fill="#8a5a35"/><circle cy="-150" r="16" fill="#5b3920"/></g>
        <text y="190" text-anchor="middle" class="mg-caption light">PUMP</text>
      </g>
      <g class="valve" transform="translate(560 140)">
        <circle r="38" fill="none" stroke="#c83c3c" stroke-width="10"/>
        <path d="M-38 0 H38 M0 -38 V38" stroke="#c83c3c" stroke-width="8"/>
        <circle r="12" fill="#8a2a2a"/>
        <text y="64" text-anchor="middle" class="mg-caption light">DRAIN VALVE</text>
      </g>
    </svg>
  `);
  root.classList.add('mg-bilge');

  let good = (task.prog as BilgeProg).good ?? 0;
  let valveOpen = false;
  const water = $(svg, '.water');
  const needle = $(svg, '.needle');
  const lever = $(svg, '.lever');
  const valve = $(svg, '.valve');
  const t0 = performance.now();
  let needleAngle = -90;
  let raf = 0;
  let lastPump = 0;

  const level = () => (valveOpen ? 0 : p.lantern === 'white' ? 1 : 1 - good / p.pumps);
  let shownLevel = level();
  const loop = () => {
    const t = (performance.now() - t0) / 1000;
    // smooth back-and-forth sweep
    needleAngle = -90 + 180 * (0.5 - 0.5 * Math.cos(2 * Math.PI * p.speed * t));
    needle.setAttribute('transform', `rotate(${needleAngle} ${GX} ${GY})`);
    shownLevel += (level() - shownLevel) * 0.08;
    const y = 420 - 330 * Math.max(0.03, shownLevel);
    water.setAttribute('transform', `translate(${Math.sin(t * 2) * 10} ${y})`);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  const zoneNow = (): ZoneColor | null => {
    const i = Math.floor((needleAngle + 90) / 60);
    return p.zones[Math.max(0, Math.min(2, i))] ?? null;
  };

  const pump = () => {
    const now = performance.now();
    if (now - lastPump < 280) return;
    lastPump = now;
    sfx.pump();
    lever.classList.remove('pumping');
    void (lever as any).getBBox?.();
    lever.classList.add('pumping');
    api.send({ pump: zoneNow() });
  };
  const openValve = () => {
    sfx.click();
    valve.classList.add('turning');
    api.send({ valve: true });
  };
  $(svg, '.pump').addEventListener('click', pump);
  valve.addEventListener('click', openValve);

  const hint = document.createElement('span');
  hint.className = 'mg-keys';
  hint.textContent = 'Space = pump · V = drain valve';
  controls.append(hint, button('Pump', pump, 'primary'), button('Open drain valve', openValve, 'danger'));

  return {
    el: root,
    update(t) {
      good = (t.prog as BilgeProg).good ?? 0;
    },
    onResult(kind) {
      if (kind === 'wrong') {
        sfx.splash();
        valve.classList.remove('turning');
        root.classList.remove('shake');
        void root.offsetWidth;
        root.classList.add('shake');
      }
      if (kind === 'done' && p.lantern === 'white') valveOpen = true;
    },
    key(e) {
      if (e.key === ' ') return pump(), true;
      if (e.key === 'v') return openValve(), true;
      return false;
    },
    destroy() {
      cancelAnimationFrame(raf);
    },
  };
};
