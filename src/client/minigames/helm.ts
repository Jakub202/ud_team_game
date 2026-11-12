import type { HelmParams } from '../../shared/stations/helm';
import { sfx } from '../sfx';
import { COLORS, skyAndSea, waveLines } from './art';
import { $, button, mount, nextId, svgPoint, type MinigameFactory } from './types';

const LIMIT = 200;
const turnOf = (a: number) => (a < -120 ? -2 : a < -35 ? -1 : a <= 35 ? 0 : a <= 120 ? 1 : 2);
// Wheel angle → gauge angle (degrees, 0 = up). Sector edges land at ±17.5° and ±60°.
const gaugeAngle = (a: number) => {
  const s = Math.sign(a);
  const x = Math.abs(a);
  if (x <= 35) return s * (x / 35) * 17.5;
  if (x <= 120) return s * (17.5 + ((x - 35) / 85) * 42.5);
  return s * Math.min(90, 60 + ((x - 120) / 80) * 30);
};

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1} Z`;
}

export const helmGame: MinigameFactory = (task, api) => {
  const p = task.params as HelmParams;
  const id = nextId('helm');
  const lhX = p.x < 0.5 ? 640 : 160;
  const buoyX = p.x * 800;
  const color = COLORS[p.buoy];
  const stripes = p.stripes === 2 ? [-21, -3] : [-12];
  const sectors = [
    [-90, -60, '◀◀'],
    [-60, -17.5, '◀'],
    [-17.5, 17.5, '▲'],
    [17.5, 60, '▶'],
    [60, 90, '▶▶'],
  ] as const;

  const { root, svg, controls } = mount(`
    <svg viewBox="0 0 800 460" class="mg-art">
      <g class="helm-view">
        ${skyAndSea(id, 230, task.ctx.storm)}
        <g class="waves">${waveLines(250, 5)}</g>
        <g transform="translate(${lhX} 230)">
          <ellipse cx="0" cy="2" rx="70" ry="12" fill="#55704a"/>
          <rect x="-9" y="-62" width="18" height="62" fill="#f4f1ea"/>
          <rect x="-9" y="-44" width="18" height="10" fill="#c83c3c"/>
          <rect x="-9" y="-22" width="18" height="10" fill="#c83c3c"/>
          <rect x="-12" y="-74" width="24" height="12" fill="#333"/>
          <circle class="lamp ${p.lighthouse ? 'blink' : ''}" cx="0" cy="-68" r="7" fill="${p.lighthouse ? '#ffe680' : '#4a4a4a'}"/>
          ${p.lighthouse ? `<path class="beam blink" d="M0 -68 L ${lhX < 400 ? 140 : -140} -90 L ${lhX < 400 ? 140 : -140} -46 Z" fill="rgba(255,240,150,0.55)"/>` : ''}
        </g>
        <g class="buoy bob" transform="translate(${buoyX} 300)">
          <ellipse cx="0" cy="24" rx="34" ry="7" fill="rgba(0,0,0,0.25)"/>
          <path d="M-24 22 L-16 -30 L16 -30 L24 22 Z" fill="${color}" stroke="rgba(0,0,0,0.35)" stroke-width="2"/>
          ${stripes.map((y) => `<rect x="-20" y="${y}" width="40" height="10" fill="#fff"/>`).join('')}
          <rect x="-3" y="-52" width="6" height="22" fill="#333"/>
          <circle cx="0" cy="-56" r="8" fill="${color}" stroke="#333" stroke-width="2"/>
        </g>
      </g>
      <g class="dash">
        <path d="M0 360 Q400 330 800 360 L800 460 L0 460 Z" fill="#6b4226"/>
        <path d="M0 360 Q400 330 800 360" stroke="#3f2614" stroke-width="6" fill="none"/>
        <g transform="translate(150 440)">
          ${sectors.map(([a0, a1, lbl], i) => {
            const mid = ((a0 + a1) / 2) * (Math.PI / 180);
            return `<path data-sector="${i - 2}" d="${arc(0, 0, 92, a0, a1)}" class="sector"/>
              <text x="${Math.sin(mid) * 70}" y="${-Math.cos(mid) * 70 + 6}" text-anchor="middle" class="sector-label">${lbl}</text>`;
          }).join('')}
          <line class="needle" x1="0" y1="0" x2="0" y2="-84" stroke="#1b2430" stroke-width="5" stroke-linecap="round"/>
          <circle r="9" fill="#d4a44a"/>
        </g>
        <text x="150" y="335" text-anchor="middle" class="mg-caption">RUDDER</text>
        <g class="wheel" transform="translate(470 470)">
          <circle r="150" fill="none" stroke="#8a5a35" stroke-width="18"/>
          <circle r="138" fill="none" stroke="#5b3920" stroke-width="3"/>
          ${Array.from({ length: 8 }, (_, i) => `<g transform="rotate(${i * 45})"><rect x="-6" y="-190" width="12" height="190" rx="5" fill="#8a5a35"/><circle cy="-196" r="13" fill="#a8703f"/></g>`).join('')}
          <circle r="30" fill="#d4a44a" stroke="#5b3920" stroke-width="4"/>
          <rect x="-4" y="-160" width="8" height="24" fill="#e8b730"/>
        </g>
      </g>
    </svg>
  `);
  root.classList.add('mg-helm');

  let angle = 0;
  const wheel = $(svg, '.wheel');
  const needle = $(svg, '.needle');
  const view = $(svg, '.helm-view');
  const render = () => {
    wheel.setAttribute('transform', `translate(470 470) rotate(${angle})`);
    const g = gaugeAngle(angle);
    needle.setAttribute('transform', `rotate(${g})`);
    view.setAttribute('transform', `translate(${-angle * 0.25} 0) rotate(${angle * 0.015} 400 230)`);
    const t = turnOf(angle);
    svg.querySelectorAll('.sector').forEach((el) => el.classList.toggle('on', Number(el.getAttribute('data-sector')) === t));
  };
  const turn = (d: number) => {
    angle = Math.max(-LIMIT, Math.min(LIMIT, angle + d));
    render();
  };

  let dragging = false;
  let lastA = 0;
  const angleAt = (e: PointerEvent) => {
    const pt = svgPoint(svg, e);
    return (Math.atan2(pt.y - 470, pt.x - 470) * 180) / Math.PI;
  };
  wheel.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastA = angleAt(e as PointerEvent);
    (wheel as any).setPointerCapture?.((e as PointerEvent).pointerId);
  });
  wheel.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const a = angleAt(e as PointerEvent);
    let d = a - lastA;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    lastA = a;
    turn(d);
  });
  const stop = () => (dragging = false);
  wheel.addEventListener('pointerup', stop);
  wheel.addEventListener('pointercancel', stop);

  const submit = () => {
    sfx.click();
    api.send({ turn: turnOf(angle) });
  };
  controls.append(
    button('⟲ Port', () => turn(-30), 'ghost'),
    button('⟳ Starboard', () => turn(30), 'ghost'),
    button('Set course', submit, 'primary'),
  );
  const hint = document.createElement('span');
  hint.className = 'mg-keys';
  hint.textContent = 'Drag the wheel or use ← →, Enter to set course';
  controls.prepend(hint);
  render();

  return {
    el: root,
    update() {},
    onResult(kind) {
      if (kind === 'wrong') {
        root.classList.remove('shake');
        void root.offsetWidth;
        root.classList.add('shake');
      }
    },
    key(e) {
      if (e.key === 'ArrowLeft' || e.key === 'a') return turn(-12), true;
      if (e.key === 'ArrowRight' || e.key === 'd') return turn(12), true;
      if (e.key === 'Enter') return submit(), true;
      return false;
    },
    destroy() {},
  };
};
