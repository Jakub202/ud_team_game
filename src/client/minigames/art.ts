// Shared SVG artwork for the minigames.
import type { Flag } from '../../shared/stations/signals';
import type { Ingredient } from '../../shared/stations/galley';
import type { Sighting } from '../../shared/stations/lookout';

export const COLORS: Record<string, string> = {
  red: '#d9483b',
  green: '#3fa45a',
  yellow: '#f2c230',
  blue: '#3a7bd5',
  white: '#f4f4f0',
  brown: '#7b4a2a',
};

export function skyAndSea(id: string, horizon = 230, storm = false) {
  const skyTop = storm ? '#2e3a48' : '#6fa6d6';
  const skyBot = storm ? '#6b7884' : '#f3dcb6';
  const seaTop = storm ? '#3c5866' : '#4f9db3';
  const seaBot = storm ? '#1c2c35' : '#1f5675';
  return `
    <defs>
      <linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skyTop}"/><stop offset="1" stop-color="${skyBot}"/></linearGradient>
      <linearGradient id="${id}-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${seaTop}"/><stop offset="1" stop-color="${seaBot}"/></linearGradient>
    </defs>
    <rect x="-400" y="0" width="1600" height="${horizon}" fill="url(#${id}-sky)"/>
    <rect x="-400" y="${horizon}" width="1600" height="${500 - horizon}" fill="url(#${id}-sea)"/>
  `;
}

export function waveLines(y0: number, rows: number, color = 'rgba(255,255,255,0.25)') {
  let out = '';
  for (let r = 0; r < rows; r++) {
    const y = y0 + r * 28 + r * r * 3;
    const amp = 3 + r * 1.5;
    let d = `M -400 ${y}`;
    for (let x = -400; x <= 1200; x += 40) d += ` q 10 ${-amp} 20 0 t 20 0`;
    out += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${1.5 + r * 0.5}"/>`;
  }
  return out;
}

export function rainOverlay(id: string) {
  return `
    <defs>
      <pattern id="${id}-rain" width="40" height="60" patternUnits="userSpaceOnUse" patternTransform="rotate(12)">
        <line x1="10" y1="0" x2="10" y2="18" stroke="rgba(220,230,240,0.5)" stroke-width="1.6"/>
        <line x1="30" y1="30" x2="30" y2="46" stroke="rgba(220,230,240,0.4)" stroke-width="1.4"/>
      </pattern>
    </defs>
    <rect class="rain-anim" x="-100" y="-120" width="1000" height="700" fill="url(#${id}-rain)" pointer-events="none"/>
  `;
}

// ── Flags (drawn in a 60 × 40 box at the origin) ──
export function flagSvg(flag: Flag): string {
  switch (flag) {
    case 'cross':
      return `<rect width="60" height="40" fill="#2f5fa8"/><rect x="25" width="10" height="40" fill="#fff"/><rect y="15" width="60" height="10" fill="#fff"/>`;
    case 'stripes':
      return [0, 1, 2, 3, 4].map((i) => `<rect y="${i * 8}" width="60" height="8" fill="${i % 2 ? '#fff' : '#c83c3c'}"/>`).join('');
    case 'check': {
      let o = '';
      for (let x = 0; x < 4; x++) for (let y = 0; y < 3; y++) o += `<rect x="${x * 15}" y="${(y * 40) / 3}" width="15" height="${40 / 3 + 0.2}" fill="${(x + y) % 2 ? '#fff' : '#1b2430'}"/>`;
      return o;
    }
    case 'diagonal':
      return `<rect width="60" height="40" fill="#e8b730"/><path d="M60 0 L60 40 L0 40 Z" fill="#c83c3c"/>`;
    case 'circle':
      return `<rect width="60" height="40" fill="#f2c230"/><circle cx="30" cy="20" r="12" fill="#2f5fa8"/>`;
    case 'pennant':
      return `<path d="M0 0 L60 20 L0 40 Z" fill="#3fa45a"/><path d="M0 12 L24 20 L0 28 Z" fill="#fff"/>`;
    case 'duck':
      return `<rect width="60" height="40" fill="#fff"/>
        <ellipse cx="27" cy="26" rx="13" ry="8" fill="#ffcc33"/>
        <circle cx="37" cy="15" r="6.5" fill="#ffcc33"/>
        <path d="M42 14 l8 1.5 -8 3z" fill="#ff8a2a"/>
        <circle cx="38.5" cy="13.5" r="1.3" fill="#1b2430"/>`;
  }
}

export function flagOutline(flag: Flag): string {
  return flag === 'pennant'
    ? `<path d="M0 0 L60 20 L0 40 Z" fill="none" stroke="#1b2430" stroke-width="1.5"/>`
    : `<rect width="60" height="40" fill="none" stroke="#1b2430" stroke-width="1.5"/>`;
}

// ── Ingredients (drawn centred at the origin, ~60px) ──
export function ingredientSvg(i: Ingredient): string {
  switch (i) {
    case 'fish':
      return `<ellipse cx="-4" cy="0" rx="22" ry="11" fill="#7fa7c4"/><path d="M16 0 L30 -11 L30 11 Z" fill="#6a93b0"/><circle cx="-16" cy="-3" r="2.5" fill="#1b2430"/><path d="M-6 -8 q4 8 0 16" stroke="#5d849f" stroke-width="2" fill="none"/>`;
    case 'potato':
      return `<path d="M-20 -4 C-22 -16 2 -18 14 -12 C26 -6 24 10 10 14 C-6 18 -18 10 -20 -4 Z" fill="#b98b52"/><circle cx="-6" cy="-4" r="2" fill="#8a6435"/><circle cx="8" cy="4" r="2" fill="#8a6435"/><circle cx="2" cy="-9" r="1.6" fill="#8a6435"/>`;
    case 'milk':
      return `<path d="M-10 -22 h20 v8 l6 8 v28 h-32 v-28 l6 -8 z" fill="#f7f7f2" stroke="#9aa" stroke-width="1.5"/><rect x="-16" y="0" width="32" height="12" fill="#3a7bd5"/><rect x="-8" y="-27" width="16" height="6" fill="#3a7bd5"/>`;
    case 'oats':
      return `<path d="M-18 -10 Q-20 -24 -8 -22 L8 -22 Q20 -24 18 -10 L20 20 Q0 26 -20 20 Z" fill="#d9c08f" stroke="#a88b55" stroke-width="1.5"/><path d="M-10 -20 q10 6 20 0" stroke="#a88b55" stroke-width="2" fill="none"/><text x="0" y="10" text-anchor="middle" font-size="11" font-weight="800" fill="#7a5f2d">OATS</text>`;
    case 'butter':
      return `<path d="M-22 -2 L-10 -14 L24 -14 L12 -2 Z" fill="#fff1a6"/><rect x="-22" y="-2" width="34" height="16" fill="#f6dc6a"/><path d="M12 -2 L24 -14 L24 2 L12 14 Z" fill="#e6c74f"/>`;
    case 'sausage':
      return `<rect x="-24" y="-9" width="48" height="18" rx="9" fill="#b0563a"/><path d="M-14 -4 q4 3 8 0 M2 -4 q4 3 8 0" stroke="#d98a6a" stroke-width="2" fill="none"/>`;
    case 'carrot':
      return `<path d="M-6 -12 L6 -12 L1 24 Z" fill="#f08a24"/><path d="M0 -12 l-8 -12 M0 -12 l0 -14 M0 -12 l8 -12" stroke="#3fa45a" stroke-width="3" stroke-linecap="round"/><path d="M-3 -2 h4 M-2 6 h4" stroke="#c96a14" stroke-width="1.5"/>`;
    case 'onion':
      return `<path d="M0 -24 C4 -14 20 -10 20 4 C20 16 10 22 0 22 C-10 22 -20 16 -20 4 C-20 -10 -4 -14 0 -24 Z" fill="#c9a0c8"/><path d="M0 -20 C-4 -6 -4 10 0 22 M0 -20 C4 -6 4 10 0 22" stroke="#a77aa6" stroke-width="1.5" fill="none"/>`;
  }
}

// ── Lookout sightings (centred at the origin) ──
export function sightingSvg(s: Sighting): string {
  switch (s) {
    case 'whale':
      return `<path d="M-46 8 C-40 -18 20 -22 36 2 L44 -8 L48 -2 L42 6 L50 12 L40 12 C30 16 -30 18 -46 8 Z" fill="#3b4c5e"/><circle cx="-30" cy="0" r="2" fill="#dfe6ec"/>
        <path d="M-24 -14 q-3 -10 0 -18 M-20 -14 q3 -10 8 -14 M-28 -14 q-6 -8 -10 -12" stroke="#e8f2f8" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <path d="M-60 14 h120" stroke="rgba(255,255,255,0.7)" stroke-width="3"/>`;
    case 'rock':
      return `<path d="M-44 14 L-30 -8 L-18 -4 L-6 -26 L8 -12 L20 -18 L40 14 Z" fill="#6e7378"/><path d="M-6 -26 L8 -12 L-2 0 Z" fill="#8a8f94"/>
        <path d="M-54 14 q10 -6 20 0 t20 0 t20 0 t20 0 t20 0" stroke="#f2f6f8" stroke-width="3" fill="none"/>`;
    case 'ship':
      return `<path d="M-38 6 L38 6 L28 18 L-30 18 Z" fill="#5a3a22"/><path d="M-2 6 L-2 -40" stroke="#3a2614" stroke-width="3"/>
        <path d="M0 -38 Q22 -20 2 2 Z" fill="#efe6d2"/><path d="M-4 -34 Q-24 -16 -4 2 Z" fill="#e2d7bf"/>
        <path d="M-50 18 h100" stroke="rgba(255,255,255,0.7)" stroke-width="3"/>`;
    case 'iceberg':
      return `<path d="M-40 10 L-24 -18 L-12 -10 L0 -36 L14 -14 L26 -20 L42 10 Z" fill="#f2f8fc"/><path d="M0 -36 L14 -14 L4 -4 Z" fill="#cfe2ee"/><path d="M-24 -18 L-12 -10 L-20 0 Z" fill="#d8e8f2"/>
        <path d="M-34 10 L34 10 L20 28 L-20 28 Z" fill="rgba(190,225,240,0.55)"/>`;
  }
}

export const INGREDIENT_LABEL: Record<Ingredient, string> = {
  fish: 'Fish',
  potato: 'Potato',
  milk: 'Milk',
  oats: 'Oats',
  butter: 'Butter',
  sausage: 'Sausage',
  carrot: 'Carrot',
  onion: 'Onion',
};
