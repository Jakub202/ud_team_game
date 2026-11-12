import type { LookoutParams } from '../../shared/stations/lookout';
import { sfx } from '../sfx';
import { rainOverlay, sightingSvg, skyAndSea, waveLines } from './art';
import { $, button, mount, nextId, svgPoint, type MinigameFactory } from './types';

const R = 92;

export const lookoutGame: MinigameFactory = (task, api) => {
  const p = task.params as LookoutParams;
  const id = nextId('look');
  const ox = p.x * 800;
  const oy = 200 + p.y * 140;
  const fog = task.ctx.storm ? '#7d8893' : '#d3d9de';

  const { root, svg, controls } = mount(`
    <svg viewBox="0 0 800 460" class="mg-art">
      <defs>
        <radialGradient id="${id}-hole">
          <stop offset="0.72" stop-color="#000"/>
          <stop offset="1" stop-color="#fff"/>
        </radialGradient>
        <mask id="${id}-mask" maskUnits="userSpaceOnUse" x="-50" y="-50" width="900" height="560">
          <rect x="-50" y="-50" width="900" height="560" fill="#fff"/>
          <circle class="hole" cx="400" cy="230" r="${R}" fill="url(#${id}-hole)"/>
        </mask>
      </defs>
      ${skyAndSea(id, 190, task.ctx.storm)}
      <g>${waveLines(210, 8, 'rgba(255,255,255,0.18)')}</g>
      <g transform="translate(${ox} ${oy})" class="sighting">${sightingSvg(p.object)}</g>
      <g class="decoys">
        ${[0.15, 0.4, 0.62, 0.88].map((x, i) => `<path d="M${x * 800 - 30} ${250 + i * 40} q 15 -10 30 0 t 30 0" stroke="rgba(255,255,255,0.5)" stroke-width="3" fill="none"/>`).join('')}
      </g>
      <g mask="url(#${id}-mask)" class="fog">
        <rect x="-50" y="-50" width="900" height="560" fill="${fog}" opacity="0.97"/>
        <g class="fog-swirl" opacity="0.6">
          ${Array.from({ length: 9 }, (_, i) => `<ellipse cx="${(i * 113) % 800}" cy="${120 + ((i * 71) % 260)}" rx="${120 + (i % 3) * 40}" ry="${30 + (i % 4) * 10}" fill="#fff" opacity="0.35"/>`).join('')}
        </g>
      </g>
      ${task.ctx.storm ? rainOverlay(id) : ''}
      <g class="spyglass" transform="translate(400 230)" pointer-events="none">
        <circle r="${R}" fill="none" stroke="#d4a44a" stroke-width="10"/>
        <circle r="${R + 7}" fill="none" stroke="#5b3920" stroke-width="4"/>
        <path d="M-14 0 H14 M0 -14 V14" stroke="rgba(27,36,48,0.6)" stroke-width="2"/>
      </g>
      <g class="bell" transform="translate(735 92)">
        <path d="M-26 20 Q-26 -26 0 -28 Q26 -26 26 20 L32 28 L-32 28 Z" fill="#d4a44a" stroke="#8a6a2a" stroke-width="3"/>
        <circle cy="34" r="7" fill="#8a6a2a"/>
        <rect x="-4" y="-40" width="8" height="14" fill="#5b3920"/>
      </g>
    </svg>
  `);
  root.classList.add('mg-lookout');

  const hole = $(svg, '.hole');
  const glass = $(svg, '.spyglass');
  const bell = $(svg, '.bell');
  let gx = 400;
  let gy = 230;
  const moveTo = (x: number, y: number) => {
    gx = Math.max(0, Math.min(800, x));
    gy = Math.max(0, Math.min(460, y));
    hole.setAttribute('cx', String(gx));
    hole.setAttribute('cy', String(gy));
    glass.setAttribute('transform', `translate(${gx} ${gy})`);
  };
  svg.addEventListener('pointermove', (e) => {
    const pt = svgPoint(svg, e);
    moveTo(pt.x, pt.y);
  });

  let rings = 0;
  const tally = document.createElement('span');
  tally.className = 'tally';
  const renderTally = () => {
    tally.innerHTML = `Rings: <b>${rings}</b>`;
  };
  const ring = () => {
    rings = Math.min(9, rings + 1);
    sfx.bell();
    bell.classList.remove('ringing');
    void root.offsetWidth;
    bell.classList.add('ringing');
    renderTally();
  };
  const reset = () => {
    rings = 0;
    renderTally();
  };
  const report = () => {
    if (rings === 0) return;
    sfx.click();
    api.send({ rings });
  };
  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    ring();
  });

  const hint = document.createElement('span');
  hint.className = 'mg-keys';
  hint.textContent = 'Move the mouse to look · B = ring · Enter = report';
  controls.append(hint, tally, button('Ring bell', ring, 'ghost'), button('Reset', reset, 'ghost'), button('Report', report, 'primary'));
  renderTally();

  return {
    el: root,
    update() {},
    onResult(kind) {
      if (kind === 'wrong') {
        root.classList.remove('shake');
        void root.offsetWidth;
        root.classList.add('shake');
        reset();
      }
    },
    key(e) {
      const step = 30;
      if (e.key === 'ArrowLeft') return moveTo(gx - step, gy), true;
      if (e.key === 'ArrowRight') return moveTo(gx + step, gy), true;
      if (e.key === 'ArrowUp') return moveTo(gx, gy - step), true;
      if (e.key === 'ArrowDown') return moveTo(gx, gy + step), true;
      if (e.key === 'b') return ring(), true;
      if (e.key === 'Enter') return report(), true;
      return false;
    },
    destroy() {},
  };
};
