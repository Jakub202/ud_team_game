import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';
import '@fontsource/pirata-one/400.css';
import './style.css';
import type { ClientMsg } from '../shared/types';
import { loadSession, Net, saveSession, type Session } from './net';
import { ShipScene } from './scene/ship-scene';
import { unlockAudio } from './sfx';
import { mountCrew } from './ui/crew';
import { clear, h } from './ui/dom';
import { brand } from './ui/hud';
import { ICONS } from './ui/icons';
import { mountScreen } from './ui/screen';

const app = document.getElementById('app')!;
const sceneEl = document.getElementById('scene')!;
let scene: ShipScene | null = null;
let net: Net | null = null;
let unmount: (() => void) | null = null;

document.addEventListener('pointerdown', unlockAudio, { once: false });
document.addEventListener('keydown', unlockAudio, { once: false });

function ensureScene(labels: boolean) {
  if (scene && (scene as any).opts.labels === labels) return scene;
  scene?.dispose();
  scene = new ShipScene(sceneEl, { labels, quality: labels ? 'high' : 'low' });
  return scene;
}

function teardown() {
  unmount?.();
  unmount = null;
  net?.close();
  net = null;
}

function connect(intent: ClientMsg, session: Session | null) {
  teardown();
  const n = new Net(intent, session);
  net = n;
  const isScreen = intent.t === 'create' || intent.t === 'watch';
  const sc = ensureScene(isScreen);
  clear(app);
  app.append(h('div.loading', 'Boarding…'));
  let mounted = false;
  n.on('welcome', (w) => {
    if (mounted) return;
    mounted = true;
    if (w.role === 'screen') {
      history.replaceState(null, '', `#/screen/${w.code}`);
      unmount = mountScreen(app, n, sc);
    } else {
      history.replaceState(null, '', `#${w.code}`);
      unmount = mountCrew(app, n, sc);
    }
  });
  n.on('error', (msg, fatal) => {
    if (!fatal) return;
    teardown();
    saveSession(null);
    landing(msg);
  });
}

function landing(error?: string) {
  teardown();
  const sc = ensureScene(false);
  sc.setFocusRect(null);
  const hash = location.hash.replace(/^#\/?/, '');
  const codeFromUrl = /^[A-Za-z]{4}$/.test(hash) ? hash.toUpperCase() : '';
  let savedName = '';
  try {
    savedName = localStorage.getItem('andbasadoren.name') ?? '';
  } catch {
    /* ignore */
  }
  const name = h('input', { placeholder: 'Your name', maxlength: 20, value: savedName, autocomplete: 'nickname' }) as HTMLInputElement;
  const code = h('input.code-input', { placeholder: 'CODE', maxlength: 4, value: codeFromUrl, autocapitalize: 'characters' }) as HTMLInputElement;
  code.addEventListener('input', () => (code.value = code.value.toUpperCase().replace(/[^A-Z]/g, '')));
  const watchCode = h('input.code-input.small', { placeholder: 'CODE', maxlength: 4 }) as HTMLInputElement;
  watchCode.addEventListener('input', () => (watchCode.value = watchCode.value.toUpperCase().replace(/[^A-Z]/g, '')));
  const err = h('p.error', error ?? '');

  const join = (e?: Event) => {
    e?.preventDefault();
    const n = name.value.trim();
    const c = code.value.trim();
    if (!n) return (err.textContent = 'Please enter your name.'), name.focus();
    if (c.length !== 4) return (err.textContent = 'The ship code has 4 letters. It is on the main screen.'), code.focus();
    try {
      localStorage.setItem('andbasadoren.name', n);
    } catch {
      /* ignore */
    }
    connect({ t: 'join', code: c, name: n }, null);
  };

  clear(app);
  app.append(
    h(
      'div.landing',
      h('div.landing-hero', brand(), h('p.tagline', 'A co-op voyage where someone always gets seasick, and the rest of the crew has to take over.')),
      h(
        'div.landing-cards',
        h(
          'form.card.join-form',
          { onsubmit: join },
          h('p.eyebrow', 'Crew'),
          h('h2', 'Join a voyage'),
          h('label', h('span', 'Name'), name),
          h('label', h('span', 'Ship code'), code),
          err,
          h('button.btn.primary.big', { type: 'submit' }, 'Come aboard'),
        ),
        h(
          'div.card.host-card',
          h('p.eyebrow', 'Main screen'),
          h('h2', 'Host on the big screen'),
          h('p.muted', 'Open this on the TV or projector. It shows the ship, the ship code and the captain\'s controls.'),
          h('button.btn.secondary.big', { onclick: () => connect({ t: 'create' }, null) }, 'Create a new voyage'),
          h(
            'div.watch-row',
            h('span.muted.small', 'Or show a voyage that already exists:'),
            watchCode,
            h('button.btn.ghost', { onclick: () => watchCode.value.length === 4 && connect({ t: 'watch', code: watchCode.value }, null) }, 'Show'),
          ),
        ),
      ),
      h('p.landing-foot.muted.small', { html: `${ICONS.sound} Turn the sound on for the main screen. Crew laptops only play their own station's sounds.` }),
    ),
  );
  (codeFromUrl ? name : savedName ? code : name).focus();
}

// Boot: resume a session in this tab after a refresh, follow a #/screen/CODE link, or show the landing page.
const session = loadSession();
const hash = location.hash.replace(/^#\/?/, '');
const screenMatch = hash.match(/^screen\/([A-Za-z]{4})$/);
if (session?.role === 'player' && session.code) {
  connect({ t: 'join', code: session.code, name: session.name ?? '', token: session.token }, session);
} else if (session?.role === 'screen' && session.code) {
  connect({ t: 'watch', code: session.code }, session);
} else if (screenMatch) {
  connect({ t: 'watch', code: screenMatch[1].toUpperCase() }, null);
} else {
  landing();
}
