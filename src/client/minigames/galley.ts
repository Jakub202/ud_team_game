import { DISH_NAMES, PANTRY, type GalleyParams, type Ingredient } from '../../shared/stations/galley';
import { sfx } from '../sfx';
import { INGREDIENT_LABEL, ingredientSvg } from './art';
import { $, button, mount, svgPoint, type MinigameFactory } from './types';

const POT_X = 400;
const POT_Y = 300;
const POT_R = 92;

export const galleyGame: MinigameFactory = (task, api) => {
  const p = task.params as GalleyParams;

  const { root, svg, controls } = mount(`
    <svg viewBox="0 0 800 460" class="mg-art">
      <rect width="800" height="460" fill="#5a3a22"/>
      ${Array.from({ length: 10 }, (_, i) => `<rect x="${i * 80}" y="0" width="78" height="460" fill="${i % 2 ? '#5f3e25' : '#583820'}"/>`).join('')}
      <g class="order" transform="translate(30 26) rotate(-3)">
        <rect width="190" height="140" fill="#f6edd6" stroke="#cdbb92" stroke-width="2"/>
        <circle cx="95" cy="10" r="7" fill="#c83c3c"/>
        <text x="95" y="44" text-anchor="middle" class="order-title">CAPTAIN'S ORDER</text>
        <text x="95" y="90" text-anchor="middle" class="order-dish">${DISH_NAMES[p.dish]}</text>
        <path d="M30 108 h130" stroke="#cdbb92" stroke-width="2"/>
        <text x="95" y="128" text-anchor="middle" class="order-sub">for the whole crew</text>
      </g>
      <g class="shelf">
        <rect x="250" y="112" width="530" height="12" fill="#3f2614"/>
        <rect x="250" y="222" width="530" height="12" fill="#3f2614"/>
        ${PANTRY.map((ing, i) => {
          const col = i % 4;
          const row = Math.floor(i / 4);
          const x = 316 + col * 130;
          const y = 66 + row * 110;
          return `<g class="jar" data-ing="${ing}" transform="translate(${x} ${y})">
            <rect x="-56" y="-46" width="112" height="92" rx="10" fill="rgba(255,255,255,0.06)"/>
            ${ingredientSvg(ing)}
            <rect x="-38" y="30" width="76" height="17" rx="3" fill="#f6edd6"/>
            <text y="43" text-anchor="middle" class="jar-label">${INGREDIENT_LABEL[ing]}</text>
          </g>`;
        }).join('')}
      </g>
      <g class="stove">
        <rect x="250" y="340" width="300" height="120" rx="8" fill="#2f3237"/>
        <rect x="270" y="360" width="260" height="20" rx="4" fill="#1b1d21"/>
        <g class="knob" transform="translate(600 404)">
          <circle r="34" fill="#2f3237" stroke="#d4a44a" stroke-width="4"/>
          <rect class="knob-pointer" x="-5" y="-30" width="10" height="26" rx="4" fill="#d4a44a"/>
          <text x="-44" y="-30" text-anchor="middle" class="knob-label">LOW</text>
          <text x="44" y="-30" text-anchor="middle" class="knob-label">HIGH</text>
          <text y="56" text-anchor="middle" class="mg-caption light">STOVE</text>
        </g>
      </g>
      <g class="pot">
        <ellipse cx="${POT_X}" cy="${POT_Y + 40}" rx="${POT_R + 14}" ry="22" fill="#1b1d21"/>
        <path d="M${POT_X - POT_R - 8} ${POT_Y - 20} L${POT_X - POT_R + 4} ${POT_Y + 40} Q${POT_X} ${POT_Y + 64} ${POT_X + POT_R - 4} ${POT_Y + 40} L${POT_X + POT_R + 8} ${POT_Y - 20} Z" fill="#3b3f45"/>
        <ellipse cx="${POT_X}" cy="${POT_Y - 20}" rx="${POT_R + 8}" ry="26" fill="#5a5f66"/>
        <ellipse class="soup" cx="${POT_X}" cy="${POT_Y - 16}" rx="${POT_R - 4}" ry="19" fill="#c9b48a"/>
        <g class="swirl"><path d="M${POT_X - 40} ${POT_Y - 16} q 40 -14 80 0" stroke="rgba(255,255,255,0.35)" stroke-width="3" fill="none"/><path d="M${POT_X - 24} ${POT_Y - 10} q 24 8 48 0" stroke="rgba(255,255,255,0.25)" stroke-width="3" fill="none"/></g>
        <g class="contents"></g>
        <g class="spoon" pointer-events="none"><rect x="-5" y="-80" width="10" height="80" rx="4" fill="#a8703f"/><ellipse cy="2" rx="12" ry="7" fill="#a8703f"/></g>
        <g class="flames" transform="translate(${POT_X} 368)" pointer-events="none"></g>
        <circle class="pot-hit" cx="${POT_X}" cy="${POT_Y - 10}" r="${POT_R + 20}" fill="transparent"/>
        <text class="stir-count" x="${POT_X}" y="${POT_Y + 82}" text-anchor="middle"></text>
      </g>
      <g class="dinner-bell" transform="translate(720 320)">
        <rect x="-3" y="-80" width="6" height="50" fill="#3f2614"/>
        <path d="M-30 10 Q-30 -34 0 -36 Q30 -34 30 10 L36 18 L-36 18 Z" fill="#d4a44a" stroke="#8a6a2a" stroke-width="3"/>
        <circle cy="24" r="7" fill="#8a6a2a"/>
        <text y="56" text-anchor="middle" class="mg-caption light">SERVE</text>
      </g>
    </svg>
  `);
  root.classList.add('mg-galley');

  let pot: Ingredient[] = [];
  let heat: 'low' | 'high' = 'low';
  let stirAngle = 0;
  let stirring = false;
  let lastA = 0;
  const contents = $(svg, '.contents');
  const spoon = $(svg, '.spoon');
  const swirl = $(svg, '.swirl');
  const stirText = $(svg, '.stir-count');
  const flames = $(svg, '.flames');
  const knob = $(svg, '.knob-pointer');
  const soup = $(svg, '.soup');
  const stirs = () => Math.floor(Math.abs(stirAngle) / 360);

  const render = () => {
    contents.innerHTML = pot
      .map((ing, i) => {
        const a = (i / Math.max(1, pot.length)) * Math.PI * 2 + stirAngle * (Math.PI / 180) * 0.5;
        const x = POT_X + Math.cos(a) * 44;
        const y = POT_Y - 18 + Math.sin(a) * 9;
        return `<g transform="translate(${x} ${y}) scale(0.55)">${ingredientSvg(ing)}</g>`;
      })
      .join('');
    soup.setAttribute('fill', pot.length ? '#c79a5a' : '#8fa3a8');
    swirl.setAttribute('transform', `rotate(${stirAngle * 0.5} ${POT_X} ${POT_Y - 14})`);
    stirText.textContent = stirs() > 0 ? `stirred ×${stirs()}` : '';
    const big = heat === 'high';
    flames.innerHTML = Array.from({ length: 7 }, (_, i) => {
      const x = (i - 3) * 30;
      const h = big ? 26 + (i % 2) * 8 : 9 + (i % 2) * 3;
      return `<path class="flame" d="M${x - 8} 0 Q${x} ${-h * 1.4} ${x + 8} 0 Z" fill="${big ? '#ff7a1a' : '#4a8cff'}"/>`;
    }).join('');
    knob.setAttribute('transform', `rotate(${big ? 50 : -50})`);
  };

  const add = (ing: Ingredient) => {
    if (pot.length >= 6) return;
    sfx.splash();
    pot = [...pot, ing];
    render();
  };
  svg.querySelectorAll<SVGGElement>('.jar').forEach((g) => g.addEventListener('click', () => add(g.dataset.ing as Ingredient)));
  const toggleHeat = () => {
    sfx.click();
    heat = heat === 'low' ? 'high' : 'low';
    render();
    heatBtn.innerHTML = `Stove: ${heat.toUpperCase()}`;
  };
  $(svg, '.knob').addEventListener('click', toggleHeat);

  const angleAt = (e: PointerEvent) => {
    const pt = svgPoint(svg, e);
    return { a: (Math.atan2(pt.y - (POT_Y - 14), pt.x - POT_X) * 180) / Math.PI, pt };
  };
  const hit = $(svg, '.pot-hit');
  hit.addEventListener('pointerdown', (e) => {
    stirring = true;
    lastA = angleAt(e as PointerEvent).a;
    (hit as any).setPointerCapture?.((e as PointerEvent).pointerId);
  });
  hit.addEventListener('pointermove', (e) => {
    const { a, pt } = angleAt(e as PointerEvent);
    spoon.setAttribute('transform', `translate(${pt.x} ${Math.min(pt.y, POT_Y)})`);
    if (!stirring) return;
    let d = a - lastA;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    lastA = a;
    const before = stirs();
    stirAngle += d;
    if (stirs() > before) sfx.click();
    render();
  });
  const stop = () => (stirring = false);
  hit.addEventListener('pointerup', stop);
  hit.addEventListener('pointercancel', stop);
  hit.addEventListener('pointerleave', () => spoon.setAttribute('transform', 'translate(-200 -200)'));
  spoon.setAttribute('transform', 'translate(-200 -200)');

  const empty = () => {
    pot = [];
    stirAngle = 0;
    render();
  };
  const serve = () => {
    sfx.bell();
    $(svg, '.dinner-bell').classList.remove('ringing');
    void root.offsetWidth;
    $(svg, '.dinner-bell').classList.add('ringing');
    api.send({ ingredients: pot, heat, stirs: stirs() });
  };
  $(svg, '.dinner-bell').addEventListener('click', serve);

  const heatBtn = button('Stove: LOW', toggleHeat, 'ghost');
  const hint = document.createElement('span');
  hint.className = 'mg-keys';
  hint.textContent = 'Click ingredients · drag around the pot to stir';
  controls.append(hint, button('Empty pot', empty, 'ghost'), heatBtn, button('Ring dinner bell', serve, 'primary'));
  render();

  return {
    el: root,
    update() {},
    onResult(kind) {
      if (kind === 'wrong') {
        root.classList.remove('shake');
        void root.offsetWidth;
        root.classList.add('shake');
        empty();
      }
    },
    destroy() {},
  };
};
