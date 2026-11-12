import { BOOL_SETTINGS, NUM_SETTINGS, STORM_LABELS } from '../../shared/settings';
import { STATIONS } from '../../shared/stations';
import { STATION_IDS, type Debrief, type Settings, type Snapshot, type StatLine } from '../../shared/types';
import { PLAYER_COLORS } from '../scene/ship-scene';
import { clear, fmtTime, h } from './dom';
import { DUCK_LOGO, ICONS, STATION_ICONS } from './icons';

export const WAYPOINTS = ['Brygga', 'Skjærgården', 'Storhavet', 'Fyrlykta', 'Andedammen'];

export function brand(): HTMLElement {
  return h('div.brand', { html: DUCK_LOGO }, h('span.brand-name', 'Andbasadøren'));
}

// ───────────── route progress ─────────────
export class RouteBar {
  el: HTMLElement;
  private fill = h('div.route-fill');
  private ship = h('div.route-ship', { html: DUCK_LOGO });
  private left = h('span.route-left');
  constructor() {
    this.el = h(
      'div.route',
      h(
        'div.route-track',
        this.fill,
        WAYPOINTS.map((name, i) =>
          h('div.route-wp', { style: { left: `${(i / (WAYPOINTS.length - 1)) * 100}%` } }, h('i'), h('span', name)),
        ),
        this.ship,
      ),
      this.left,
    );
  }
  update(s: Snapshot) {
    const k = Math.min(1, s.ship.progress / s.ship.distance);
    this.fill.style.width = `${k * 100}%`;
    this.ship.style.left = `${k * 100}%`;
    const left = Math.max(0, Math.ceil(s.ship.distance - s.ship.progress));
    this.left.textContent = s.phase === 'voyage' || s.phase === 'debrief' ? `${left} nm to go` : `${s.ship.distance} nm voyage`;
  }
}

// ───────────── meters ─────────────
export class Meters {
  el: HTMLElement;
  private water = h('div.meter-fill');
  private strength = h('div.meter-fill');
  private waterBox: HTMLElement;
  private strBox: HTMLElement;
  private wind = h('span.chip');
  private weather = h('span.chip');
  constructor() {
    this.waterBox = h('div.meter.water', { title: 'Water in the hold. At 100% the ship sinks.' }, h('span.meter-icon', { html: ICONS.water }), h('div.meter-bar', this.water), h('span.meter-label', 'Water'));
    this.strBox = h('div.meter.strength', { title: 'Crew strength from the galley. Strong crews row further per task.' }, h('span.meter-icon', { html: ICONS.strength }), h('div.meter-bar', this.strength), h('span.meter-label', 'Strength'));
    this.el = h('div.meters', this.waterBox, this.strBox, this.wind, this.weather);
  }
  update(s: Snapshot) {
    this.water.style.width = `${s.ship.water}%`;
    this.waterBox.classList.toggle('danger', s.ship.water > 70);
    this.strength.style.width = `${s.ship.strength}%`;
    this.strBox.classList.toggle('danger', s.ship.strength < 30);
    this.strBox.style.display = s.settings.enabledStations.includes('galley') ? '' : 'none';
    this.wind.innerHTML = `${ICONS.wind}<span>Wind ${s.ship.wind}</span>`;
    this.weather.className = `chip ${s.ship.storm ? 'storm' : ''}`;
    this.weather.innerHTML = s.ship.storm ? `${ICONS.storm}<span>Storm</span>` : `${ICONS.sun}<span>Calm</span>`;
  }
}

// ───────────── crew roster ─────────────
export function crewList(s: Snapshot, gtNow: number, opts: { me?: string | null; kick?: (id: string) => void } = {}): HTMLElement {
  const list = h('ul.crew');
  s.players.forEach((p, idx) => {
    const color = PLAYER_COLORS[idx % PLAYER_COLORS.length];
    const status: (HTMLElement | null)[] = [];
    if (p.sick && p.sickUntil) status.push(h('span.tag.sick', { html: ICONS.sick }, `seasick ${fmtTime((p.sickUntil - gtNow) / 1000)}`));
    if (!p.connected) status.push(h('span.tag.away', 'offline'));
    if (p.covering.length) {
      const names = p.covering.map((id) => s.players.find((x) => x.id === id)?.name ?? '?').join(', ');
      status.push(h('span.tag.cover', { html: ICONS.swap }, `covering ${names}`));
    }
    if (s.phase === 'training') status.push(h('span.tag', p.ready ? '✓ ready' : `${p.practiced} practised`));
    const stations = (s.phase === 'voyage' ? p.controls : p.owns).map((id) => {
      const st = s.stations.find((x) => x.id === id);
      const task = st?.task;
      let urgent = false;
      if (task && task.deadline) urgent = (task.deadline - gtNow) / (task.deadline - task.createdAt) < 0.3;
      const borrowed = !p.owns.includes(id);
      return h(
        `span.st${task ? '.active' : ''}${urgent ? '.urgent' : ''}${borrowed ? '.borrowed' : ''}`,
        { title: STATIONS[id].name, html: STATION_ICONS[id] },
      );
    });
    list.append(
      h(
        `li${p.id === opts.me ? '.me' : ''}${p.sick ? '.is-sick' : ''}`,
        h('span.dot', { style: { background: color } }),
        h('span.who', h('span.name', p.name, p.bot ? h('span.bot', { html: ICONS.bot }) : null), h('span.status', status)),
        h('span.stations', stations),
        // pointerdown: the roster re-renders often, so a click (down + up) could land on a replaced node
        opts.kick ? h('button.icon-btn.kick', { title: `Remove ${p.name}`, html: ICONS.x, onpointerdown: () => opts.kick!(p.id) }) : null,
      ),
    );
  });
  if (s.players.length === 0) list.append(h('li.empty', 'Nobody aboard yet.'));
  return list;
}

// ───────────── event log ─────────────
export class EventLog {
  el = h('ul.log');
  push(text: string) {
    const li = h('li', text);
    this.el.prepend(li);
    while (this.el.children.length > 6) this.el.lastElementChild?.remove();
    setTimeout(() => li.classList.add('old'), 12000);
  }
  clear() {
    clear(this.el);
  }
}

// ───────────── settings ─────────────
export function settingsPanel(s: Settings, onPatch: (p: Partial<Settings>) => void): HTMLElement {
  const groups = new Map<string, HTMLElement>();
  const group = (name: string) => {
    let g = groups.get(name);
    if (!g) {
      g = h('fieldset.set-group', h('legend', name));
      groups.set(name, g);
    }
    return g;
  };
  for (const m of BOOL_SETTINGS) {
    const input = h('input', { type: 'checkbox', checked: s[m.key] }) as HTMLInputElement;
    input.addEventListener('change', () => onPatch({ [m.key]: input.checked }));
    group(m.group).append(h('label.set-row.toggle', input, h('span', m.label)));
  }
  for (const m of NUM_SETTINGS) {
    const val = h('output');
    const fmt = (v: number) => (m.key === 'stormStrength' ? STORM_LABELS[v] : `${m.step < 1 ? v.toFixed(1) : v}${m.unit ?? ''}`);
    val.textContent = fmt(s[m.key]);
    const input = h('input', { type: 'range', min: m.min, max: m.max, step: m.step, value: String(s[m.key]) }) as HTMLInputElement;
    let t = 0;
    input.addEventListener('input', () => {
      val.textContent = fmt(Number(input.value));
      clearTimeout(t);
      t = window.setTimeout(() => onPatch({ [m.key]: Number(input.value) }), 150);
    });
    group(m.group).append(h('label.set-row', h('span', m.label), input, val));
  }
  const stations = h('fieldset.set-group', h('legend', 'Stations in play'));
  for (const id of STATION_IDS) {
    const input = h('input', { type: 'checkbox', checked: s.enabledStations.includes(id) }) as HTMLInputElement;
    input.addEventListener('change', () => {
      const next = STATION_IDS.filter((x) => (x === id ? input.checked : s.enabledStations.includes(x)));
      if (next.length === 0) {
        input.checked = true;
        return;
      }
      onPatch({ enabledStations: next });
    });
    stations.append(h('label.set-row.toggle', input, h('span.st-inline', { html: STATION_ICONS[id] }), h('span', STATIONS[id].name)));
  }
  return h('div.settings', ...groups.values(), stations);
}

// ───────────── debrief ─────────────
const fmtS = (v: number | null) => (v === null ? '–' : `${v.toFixed(1)} s`);

function statBlock(title: string, l: StatLine, cls: string, max: number) {
  const w = l.avgTime === null || max === 0 ? 0 : (l.avgTime / max) * 100;
  return h(
    `div.stat-block.${cls}`,
    h('div.stat-title', title),
    h('div.stat-bar', h('div', { style: { width: `${w}%` } })),
    h('div.stat-nums', h('b', fmtS(l.avgTime)), ` avg per task · ${l.done} done · ${l.failed} failed · ${l.mistakes} wrong answers`),
  );
}

export function debriefView(s: Snapshot, d: Debrief, actions: HTMLElement | null): HTMLElement {
  const title = d.result === 'arrived' ? 'Land ho! You made it to Andedammen' : d.result === 'sunk' ? 'Andbasadøren sank…' : 'Voyage ended';
  const max = Math.max(d.owner.avgTime ?? 0, d.cover.avgTime ?? 0);
  let headline = 'Nobody got seasick this time.';
  if (d.owner.avgTime && d.cover.avgTime) {
    const ratio = d.cover.avgTime / d.owner.avgTime;
    headline =
      ratio > 1.05
        ? `Tasks took ${ratio.toFixed(1)}× as long when someone was covering.`
        : 'Substitutes were as fast as the owners. That handover worked!';
  } else if (d.handovers.length > 0) {
    headline = 'Too few tasks to compare owners with substitutes.';
  }
  const name = (id: string | null) => s.players.find((p) => p.id === id)?.name ?? '?';
  return h(
    'div.debrief',
    h('h1', title),
    h(
      'p.debrief-sub',
      `${fmtTime(d.duration)} at sea · ${Math.floor(d.progress)} of ${d.distance} nm · ${d.owner.done + d.cover.done} tasks done · ${d.owner.failed + d.cover.failed} missed`,
    ),
    h('h2', headline),
    h('div.stat-compare', statBlock('At their own station', d.owner, 'owner', max), statBlock('Covering for a seasick crewmate', d.cover, 'cover', max)),
    h(
      'div.debrief-grid',
      h(
        'div',
        h('h3', 'Per station'),
        h(
          'table.stats',
          h('thead', h('tr', h('th', 'Station'), h('th', 'Owner'), h('th', 'Substitute'), h('th', 'Missed'))),
          h(
            'tbody',
            d.stations.map((st) =>
              h(
                'tr',
                h('td', h('span.st-inline', { html: STATION_ICONS[st.id] }), STATIONS[st.id].name),
                h('td', fmtS(st.owner.avgTime)),
                h('td', fmtS(st.cover.avgTime)),
                h('td', String(st.owner.failed + st.cover.failed)),
              ),
            ),
          ),
        ),
      ),
      h(
        'div',
        h('h3', 'Handovers'),
        d.handovers.length
          ? h(
              'ul.handovers',
              d.handovers.map((ho) =>
                h(
                  'li',
                  h('b', ho.sickName),
                  ' → ',
                  h('b', ho.subId ? name(ho.subId) : 'nobody'),
                  h('span.muted', ` (${ho.stations.map((x) => STATIONS[x].name).join(', ')})`),
                  h('div.muted', `${ho.done} done · ${ho.failed} missed · ${ho.mistakes} wrong · avg ${fmtS(ho.avgTime)}`),
                ),
              ),
            )
          : h('p.muted', 'No seasickness this voyage.'),
      ),
      h(
        'div.talk',
        h('h3', 'Talk about it'),
        h(
          'ul',
          h('li', 'Which handover went best? What did the explainer do?'),
          h('li', 'What did you wish you had known before you had to take over?'),
          h('li', 'Who on our team is the only one who knows how to do something?'),
          h('li', 'What would a good handover note have said?'),
        ),
      ),
    ),
    actions,
  );
}
