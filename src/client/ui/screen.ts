import { STATIONS } from '../../shared/stations';
import type { GameEvent, Snapshot } from '../../shared/types';
import type { Net } from '../net';
import type { ShipScene } from '../scene/ship-scene';
import { isMuted, setMuted, sfx } from '../sfx';
import { clear, fmtTime, h } from './dom';
import { brand, crewList, debriefView, EventLog, Meters, RouteBar, settingsPanel } from './hud';
import { ICONS, STATION_ICONS } from './icons';

/** The shared main screen (TV / projector). Also the captain's controls. */
export function mountScreen(app: HTMLElement, net: Net, scene: ShipScene) {
  const route = new RouteBar();
  const meters = new Meters();
  const log = new EventLog();
  const nextSick = h('div.next-sick');
  const center = h('main.screen-center');
  const roster = h('div.roster');
  const banner = h('div.banner');
  const drawerBody = h('div.drawer-body');
  const drawer = h('aside.drawer', h('header', h('h2', 'Settings'), h('button.icon-btn', { html: ICONS.x, onclick: () => drawer.classList.remove('open') })), drawerBody);
  const pauseBtn = h('button.icon-btn', { title: 'Pause', html: ICONS.pause, onclick: () => net.send({ t: 'pause', paused: !net.state?.paused }) });
  const soundBtn = h('button.icon-btn', {
    title: 'Sound',
    html: isMuted() ? ICONS.mute : ICONS.sound,
    onclick: () => {
      setMuted(!isMuted());
      soundBtn.innerHTML = isMuted() ? ICONS.mute : ICONS.sound;
    },
  });
  const endBtn = h('button.icon-btn', {
    title: 'End voyage',
    html: ICONS.stop,
    onclick: () => {
      if (confirm('End the voyage now and go to the debrief?')) net.send({ t: 'end' });
    },
  });
  const gearBtn = h('button.icon-btn', {
    title: 'Settings',
    html: ICONS.gear,
    onclick: () => {
      renderDrawer(true);
      drawer.classList.toggle('open');
    },
  });
  const pausedOverlay = h('div.paused-overlay', h('div', 'Paused'));

  const top = h('header.topbar', brand(), route.el, meters.el, nextSick, h('div.top-actions', soundBtn, pauseBtn, endBtn, gearBtn));
  const root = h('div.screen', top, center, h('aside.screen-side', h('h3', 'Crew'), roster), log.el, banner, drawer, pausedOverlay);
  clear(app);
  app.append(root);
  scene.setFocusRect(null);

  let phase: Snapshot['phase'] | null = null;
  let lobbyKey = '';
  let settingsJson = '';
  let settingsEl: HTMLElement | null = null;
  let drawerJson = '';

  const patch = (p: object) => net.send({ t: 'settings', patch: p });

  function renderDrawer(force = false) {
    const s = net.state;
    if (!s) return;
    const j = JSON.stringify(s.settings);
    if (!force && (j === drawerJson || drawerBody.contains(document.activeElement))) return;
    drawerJson = j;
    clear(drawerBody);
    drawerBody.append(settingsPanel(s.settings, patch));
  }

  function renderLobby(s: Snapshot) {
    const key = JSON.stringify([s.players.map((p) => [p.id, p.name, p.connected, p.owns]), s.settings.enabledStations]);
    const sj = JSON.stringify(s.settings);
    const firstRender = phase !== 'lobby' || !center.querySelector('.lobby');
    if (firstRender) {
      clear(center);
      const url = `${location.origin}/#${s.code}`;
      settingsEl = h('div.lobby-settings');
      center.append(
        h(
          'div.lobby',
          h(
            'div.lobby-col',
          h(
            'section.card.join-card',
            h('p.eyebrow', 'Join the crew'),
            h('p', 'On your laptop, open'),
            h('p.join-url', location.host),
            h('p', 'and enter the ship code'),
            h('div.code', s.code.split('').map((c) => h('span', c))),
            h('p.muted.small', url),
          ),
          h(
            'div.lobby-start',
            h('button.btn.primary.big', { onclick: () => net.send({ t: 'start' }) }, 'Start training'),
            h('p.muted', 'Everyone learns their own station first. Then you set sail.'),
          ),
          ),
          h('section.card.assign-card', h('div.card-head', h('h2', 'Stations'), h('div.row', h('button.btn.ghost', { onclick: () => net.send({ t: 'autoAssign' }) }, 'Auto-assign'), h('button.btn.ghost', { title: 'Adds a computer crew member for testing', onclick: () => net.send({ t: 'addBot' }) }, h('span', { html: ICONS.bot }), 'Add test bot'))), h('div.assign')),
          h('section.card.settings-card', h('h2', 'Voyage settings'), settingsEl),
        ),
      );
      lobbyKey = '';
      settingsJson = '';
    }
    if (key !== lobbyKey) {
      lobbyKey = key;
      const assign = center.querySelector('.assign')!;
      clear(assign);
      for (const id of s.settings.enabledStations) {
        const owner = s.stations.find((st) => st.id === id)?.ownerId ?? '';
        const sel = h(
          'select',
          { onchange: (e: Event) => net.send({ t: 'assign', station: id, playerId: (e.target as HTMLSelectElement).value || null }) },
          h('option', { value: '' }, '— nobody —'),
          s.players.map((p) => h('option', { value: p.id, selected: p.id === owner }, p.name)),
        );
        assign.append(
          h('div.assign-row', h('span.st-inline', { html: STATION_ICONS[id] }), h('div', h('b', STATIONS[id].name), h('div.muted.small', STATIONS[id].blurb)), sel),
        );
      }
      const counts = s.players.map((p) => p.owns.length);
      if (s.players.length && Math.max(...counts) > 1) {
        assign.append(h('p.note', `With ${s.players.length} crew and ${s.settings.enabledStations.length} stations, some people run two stations.`));
      }
    }
    if (sj !== settingsJson && settingsEl && !settingsEl.contains(document.activeElement)) {
      settingsJson = sj;
      clear(settingsEl);
      settingsEl.append(settingsPanel(s.settings, patch));
    }
  }

  function renderTraining(s: Snapshot) {
    if (phase !== 'training') {
      clear(center);
      center.append(
        h(
          'section.card.training-card',
          h('p.eyebrow', 'Training'),
          h('h1', 'Learn your own station'),
          h('p', 'Each of you only learns your own station. Later, when someone gets seasick, the others will need them to explain it.'),
          h('div.big-timer'),
          h('div.ready-count'),
          h('button.btn.primary', { onclick: () => net.send({ t: 'start' }) }, 'Set sail now'),
        ),
      );
    }
    const left = s.trainingEndsAt ? (s.trainingEndsAt - net.gt()) / 1000 : 0;
    center.querySelector('.big-timer')!.textContent = fmtTime(left);
    const humans = s.players.filter((p) => !p.bot);
    center.querySelector('.ready-count')!.textContent = `${humans.filter((p) => p.ready).length} of ${humans.length} ready`;
  }

  function renderVoyage() {
    if (phase !== 'voyage') clear(center);
  }

  function renderDebrief(s: Snapshot) {
    if (phase === 'debrief' && center.querySelector('.debrief')) return;
    clear(center);
    if (!s.debrief) return;
    center.append(
      h(
        'section.card.debrief-card',
        debriefView(s, s.debrief, h('div.row.center', h('button.btn.primary.big', { onclick: () => net.send({ t: 'again' }) }, 'Back to the harbour'))),
      ),
    );
  }

  function updateBanner(s: Snapshot) {
    const sick = s.sickness;
    if (!sick || s.phase !== 'voyage') {
      banner.classList.remove('on');
      return;
    }
    const p = s.players.find((x) => x.id === sick.playerId);
    const sub = s.players.find((x) => x.id === sick.subId);
    const stations = sick.stations.map((x) => STATIONS[x].name).join(' & ');
    banner.classList.add('on');
    banner.innerHTML = '';
    banner.append(
      h('div.banner-icon', { html: ICONS.sick }),
      h(
        'div',
        h('div.banner-title', `${p?.name ?? '?'} is seasick!`),
        h('div.banner-sub', sub ? `${sub.name} takes over ${stations}. ${p?.name}, talk them through it!` : `Nobody is free to take over ${stations}!`),
      ),
      h('div.banner-timer', fmtTime((sick.until - net.gt()) / 1000)),
    );
  }

  function update() {
    const s = net.state;
    if (!s) return;
    route.update(s);
    meters.update(s);
    clear(roster);
    roster.append(crewList(s, net.gt(), { kick: (id) => confirm('Remove this crew member?') && net.send({ t: 'kick', playerId: id }) }));
    top.classList.toggle('hide-meters', s.phase === 'lobby');
    if (s.phase === 'lobby') renderLobby(s);
    if (s.phase === 'training') renderTraining(s);
    if (s.phase === 'voyage') renderVoyage();
    if (s.phase === 'debrief') renderDebrief(s);
    if (phase === 'voyage' && s.phase === 'debrief' && s.debrief?.result === 'arrived') sfx.fanfare();
    phase = s.phase;
    updateBanner(s);
    if (s.phase === 'voyage' && s.nextSickAt && s.settings.sicknessEnabled) {
      nextSick.innerHTML = `${ICONS.sick}<span>Seasickness in ${fmtTime((s.nextSickAt - net.gt()) / 1000)}</span>`;
      nextSick.style.display = '';
    } else nextSick.style.display = 'none';
    pauseBtn.innerHTML = s.paused ? ICONS.play : ICONS.pause;
    pauseBtn.style.display = endBtn.style.display = s.phase === 'voyage' || s.phase === 'training' ? '' : 'none';
    pausedOverlay.classList.toggle('on', s.paused);
    root.dataset.phase = s.phase;
    if (drawer.classList.contains('open')) renderDrawer();
  }

  const offState = net.on('state', (s) => {
    scene.setSnapshot(s);
    update();
  });
  const offEvent = net.on('event', (e: GameEvent) => {
    scene.onEvent(e);
    switch (e.type) {
      case 'log':
        log.push(e.text);
        break;
      case 'stroke':
        sfx.stroke();
        break;
      case 'sick':
        sfx.quack();
        setTimeout(() => sfx.sick(), 250);
        break;
      case 'fail':
        sfx.splash();
        break;
      case 'phase':
        if (e.phase === 'voyage') log.clear();
        break;
    }
  });
  scene.onLightning = () => sfx.thunder();
  const timer = setInterval(update, 250);

  return () => {
    offState();
    offEvent();
    clearInterval(timer);
    scene.onLightning = null;
  };
}
