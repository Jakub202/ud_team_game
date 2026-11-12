import type { StationId } from '../../shared/types';

const wrap = (body: string, vb = '0 0 24 24') =>
  `<svg class="icon" viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const STATION_ICONS: Record<StationId, string> = {
  helm: wrap(
    '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.8"/>' +
      [0, 45, 90, 135].map((a) => `<line x1="12" y1="2.5" x2="12" y2="21.5" transform="rotate(${a} 12 12)"/>`).join(''),
  ),
  rigging: wrap('<path d="M12 2v20"/><path d="M12 4c5 3 7 8 7 13H12"/><path d="M12 7c-3 2-5 6-5 10h5"/><path d="M4 21h16"/>'),
  bilge: wrap('<path d="M12 3c3.5 4.5 6 7.6 6 10.6A6 6 0 0 1 6 13.6C6 10.6 8.5 7.5 12 3z"/><path d="M9 14.5a3 3 0 0 0 3 3"/>'),
  signals: wrap('<path d="M5 22V3"/><path d="M5 4h12l-3 4 3 4H5"/>'),
  lookout: wrap('<path d="M3 15l12-7 2 3.5-12 7z"/><path d="M15 8l3-1.7 2 3.5-3 1.7"/><path d="M8 18l-2 4M10 17l2 5"/>'),
  galley: wrap('<path d="M4 10h16v3a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z"/><path d="M2 10h20"/><path d="M9 6c0-1 1-1.5 1-2.5M13 6c0-1 1-1.5 1-2.5"/>'),
};

export const ICONS = {
  gear: wrap('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  pause: wrap('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>'),
  play: wrap('<path d="M7 4l13 8-13 8z"/>'),
  stop: wrap('<rect x="5" y="5" width="14" height="14" rx="2"/>'),
  sound: wrap('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'),
  mute: wrap('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>'),
  sick: wrap('<circle cx="12" cy="12" r="9"/><path d="M8 10h.01M16 10h.01"/><path d="M8 16c1.2-1.2 2.6-1.2 4 0s2.8 1.2 4 0"/>'),
  swap: wrap('<path d="M4 8h13l-3-3M20 16H7l3 3"/>'),
  bot: wrap('<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01"/>'),
  x: wrap('<path d="M6 6l12 12M18 6L6 18"/>'),
  water: wrap('<path d="M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M2 20c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M12 3l3 5a3 3 0 1 1-6 0z"/>'),
  strength: wrap('<path d="M3 12h3M18 12h3M6 8v8M18 8v8M9 10v4h6v-4M9 12h6"/>'),
  storm: wrap('<path d="M17 16a4 4 0 0 0-1-7.9A6 6 0 0 0 4.3 10 3.5 3.5 0 0 0 6 16.9"/><path d="M12 13l-2 4h4l-2 4"/>'),
  sun: wrap('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  wind: wrap('<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h16a3 3 0 1 1-3 3"/><path d="M3 16h7"/>'),
  clock: wrap('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
};

export const DUCK_LOGO = `<svg class="duck-logo" viewBox="0 0 64 64" aria-hidden="true">
  <ellipse cx="28" cy="40" rx="22" ry="15" fill="#ffcc33"/>
  <path d="M8 36c-4-2-5-8-2-10 3 4 6 5 9 5z" fill="#ffcc33"/>
  <circle cx="40" cy="22" r="12" fill="#ffcc33"/>
  <path d="M50 21c5-1 10 0 12 2-2 3-7 4-12 3z" fill="#ff8a2a"/>
  <circle cx="43" cy="18" r="2.6" fill="#1b2430"/>
  <circle cx="43.8" cy="17.2" r="0.8" fill="#fff"/>
  <path d="M18 40c4 5 13 6 19 1" stroke="#e0a91c" stroke-width="2.4" fill="none" stroke-linecap="round"/>
</svg>`;
