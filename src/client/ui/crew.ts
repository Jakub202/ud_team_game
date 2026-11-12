import { STATIONS } from '../../shared/stations';
import type { GameEvent, Snapshot, StationId } from '../../shared/types';
import type { Net } from '../net';
import type { ShipScene } from '../scene/ship-scene';
import { isMuted, setMuted, sfx } from '../sfx';
import { clear, fmtTime, h, richText } from './dom';
import { brand, crewList, debriefView, EventLog, Meters, RouteBar } from './hud';
import { ICONS, STATION_ICONS } from './icons';
import { StationPanel } from './station-panel';

/** A crew member's laptop: the minigame in the middle, the ship and status around it. */
export function mountCrew(app: HTMLElement, net: Net, scene: ShipScene) {
  const route = new RouteBar();
  const meters = new Meters();
  const log = new EventLog();
  const nextSick = h('div.next-sick');
  const soundBtn = h('button.icon-btn', {
    title: 'Sound',
    html: isMuted() ? ICONS.mute : ICONS.sound,
    onclick: () => {
      setMuted(!isMuted());
      soundBtn.innerHTML = isMuted() ? ICONS.mute : ICONS.sound;
    },
  });
  const top = h('header.topbar', brand(), route.el, meters.el, nextSick, h('div.top-actions', soundBtn));

  const tabs = h('nav.tabs');
  const panelsEl = h('div.panels');
  const rules = h('aside.rules');
  const notice = h('div.crew-notice'); // lobby / waiting / debrief content
  const sickCard = h('div.sick-card');
  const trainingBar = h('div.training-bar');
  const work = h('div.work', rules, h('div.work-main', tabs, panelsEl));
  const main = h('main.crew-main', trainingBar, work, notice, sickCard);

  const shipWindow = h('div.ship-window');
  const roster = h('div.roster');
  const side = h('aside.crew-side', shipWindow, h('div.side-card', h('h3', 'Crew'), roster), log.el);
  const offline = h('div.offline', 'Reconnecting…');
  const root = h('div.crew', top, h('div.crew-grid', main, side), offline);
  clear(app);
  app.append(root);

  const panels = new Map<StationId, StationPanel>();
  let active: StationId | null = null;
  const taskStation = new Map<number, StationId>();
  const seenTasks = new Set<number>();
  let phase: Snapshot['phase'] | null = null;
  let rulesFor: string = '';
  let noticeKey = '';
  let wasSick = false;
  let wasCovering = '';

  const send = (taskId: number, answer: unknown) => net.send({ t: 'act', taskId, answer });

  // Keep the 3D ship framed in the right spot.
  const reframe = () => {
    const me = net.me;
    const s = net.state;
    if (me?.sick && s?.phase === 'voyage') {
      // Big ship beside the seasick card.
      const m = main.getBoundingClientRect();
      const c = sickCard.getBoundingClientRect();
      const x = c.width ? c.right + 16 : m.left;
      scene.setFocusRect({ x, y: m.top, w: m.right - x, h: m.height });
      return;
    }
    const target = s?.phase === 'lobby' ? main : shipWindow;
    const r = target.getBoundingClientRect();
    scene.setFocusRect({ x: r.left, y: r.top, w: r.width, h: r.height });
  };
  const ro = new ResizeObserver(reframe);
  ro.observe(shipWindow);
  ro.observe(main);

  function syncPanels(s: Snapshot, stations: StationId[]) {
    for (const [id, p] of panels) {
      if (!stations.includes(id)) {
        p.destroy();
        p.el.remove();
        panels.delete(id);
      }
    }
    for (const id of stations) {
      if (!panels.has(id)) {
        const p = new StationPanel(id, send);
        panels.set(id, p);
        panelsEl.append(p.el);
      }
    }
    const tasks = s.you?.tasks ?? [];
    for (const t of tasks) taskStation.set(t.id, t.station);
    for (const [id, p] of panels) {
      const task = tasks.find((t) => t.station === id) ?? null;
      if (task && !seenTasks.has(task.id)) {
        seenTasks.add(task.id);
        if (!task.practice) sfx.alert();
      }
      p.setTask(task);
      const owner = s.stations.find((x) => x.id === id)?.ownerId;
      const covering = s.phase === 'voyage' && owner && owner !== net.playerId;
      const ownerName = covering ? s.players.find((x) => x.id === owner)?.name ?? '?' : null;
      const note = covering ? s.you?.notes.find((n) => n.station === id)?.text ?? null : null;
      p.setCovering(ownerName, note);
    }
    // Pick the active tab: keep it if it still exists and has work, otherwise jump to a station with a task.
    if (!active || !panels.has(active)) active = stations[0] ?? null;
    const activePanel = active ? panels.get(active) : undefined;
    if (activePanel && !activePanel.hasTask) {
      const busy = stations.find((id) => panels.get(id)?.hasTask);
      if (busy) active = busy;
    }
    for (const [id, p] of panels) p.el.classList.toggle('active', id === active);

    clear(tabs);
    tabs.style.display = stations.length > 1 ? '' : 'none';
    for (const id of stations) {
      const st = s.stations.find((x) => x.id === id);
      const borrowed = s.phase === 'voyage' && st?.ownerId !== net.playerId;
      tabs.append(
        h(
          `button.tab${id === active ? '.on' : ''}${panels.get(id)?.hasTask ? '.busy' : ''}${borrowed ? '.borrowed' : ''}`,
          {
            onpointerdown: () => {
              active = id;
              update();
            },
          },
          h('span', { html: STATION_ICONS[id] }),
          STATIONS[id].name,
          borrowed ? h('small', 'covering') : null,
          panels.get(id)?.hasTask ? h('i.alert-dot') : null,
        ),
      );
    }
  }

  function renderRules(s: Snapshot) {
    if (s.phase !== 'training' || !active) {
      rules.style.display = 'none';
      rulesFor = '';
      return;
    }
    rules.style.display = '';
    const key = `${active}|${s.settings.handoverNotes}`;
    if (key === rulesFor) return;
    rulesFor = key;
    clear(rules);
    const def = STATIONS[active];
    const station = active;
    rules.append(
      h('div.rules-head', h('span.panel-icon', { html: STATION_ICONS[active] }), h('div', h('p.eyebrow', 'Your station'), h('h2', def.name))),
      h('p.muted', def.blurb),
      h('ol.rule-list', def.rules.map((r) => h('li', richText(r)))),
      h('p.rules-foot', 'Practise until it sticks. These rules won\'t be on screen once you set sail.'),
    );
    if (s.settings.handoverNotes) {
      const ta = h('textarea', {
        maxlength: 300,
        placeholder: 'Write a handover note for whoever has to cover for you…',
        value: s.you?.myNotes[station] ?? '',
      }) as HTMLTextAreaElement;
      let t = 0;
      ta.addEventListener('input', () => {
        clearTimeout(t);
        t = window.setTimeout(() => net.send({ t: 'note', station, text: ta.value }), 300);
      });
      rules.append(h('label.note-box', h('b', 'Handover note'), h('span.muted.small', 'Shown to your substitute when you get seasick.'), ta));
    }
  }

  function renderTrainingBar(s: Snapshot) {
    if (s.phase !== 'training') {
      trainingBar.style.display = 'none';
      return;
    }
    trainingBar.style.display = '';
    const me = net.me;
    const left = s.trainingEndsAt ? (s.trainingEndsAt - net.gt()) / 1000 : 0;
    clear(trainingBar);
    trainingBar.append(
      h('div', h('b', 'Training'), ` · ${fmtTime(left)} left · ${me?.practiced ?? 0} done`),
      h(
        `button.btn${me?.ready ? '.ghost' : '.primary'}`,
        { onpointerdown: () => net.send({ t: 'ready', ready: !me?.ready }) },
        me?.ready ? 'Not ready yet' : "I'm ready, let's sail",
      ),
    );
  }

  function renderNotice(s: Snapshot) {
    const me = net.me;
    let key = s.phase;
    if (s.phase === 'lobby') key += JSON.stringify([me?.owns, s.players.length]);
    if (s.phase === 'voyage' || s.phase === 'training') {
      notice.style.display = 'none';
      noticeKey = '';
      return;
    }
    notice.style.display = '';
    if (key === noticeKey) return;
    noticeKey = key;
    clear(notice);
    if (s.phase === 'lobby') {
      notice.append(
        h(
          'section.card.welcome',
          h('p.eyebrow', `Ship ${s.code}`),
          h('h1', `Welcome aboard, ${me?.name ?? 'sailor'}!`),
          me?.owns.length
            ? h(
                'div',
                h('p', me.owns.length > 1 ? 'Your stations:' : 'Your station:'),
                h(
                  'ul.my-stations',
                  me.owns.map((id) => h('li', h('span.st-inline', { html: STATION_ICONS[id] }), h('b', STATIONS[id].name), ' · ', STATIONS[id].blurb)),
                ),
              )
            : h('p', 'The captain will give you a station.'),
          h('p.muted', 'You learn the rules for your own station in training. Watch the main screen. The captain starts when everyone is aboard.'),
        ),
      );
    }
    if (s.phase === 'debrief' && s.debrief) {
      notice.append(h('section.card.debrief-card', debriefView(s, s.debrief, h('p.muted.center', 'The captain can start a new voyage from the main screen.'))));
    }
  }

  function renderSick(s: Snapshot) {
    const me = net.me;
    const sick = s.phase === 'voyage' && !!me?.sick;
    sickCard.classList.toggle('on', sick);
    work.style.visibility = sick ? 'hidden' : '';
    if (!sick || !me) return;
    const sickness = s.sickness;
    const sub = s.players.find((p) => p.id === sickness?.subId);
    const mine = s.stations.filter((st) => me.owns.includes(st.id));
    clear(sickCard);
    sickCard.append(
      h('div.sick-icon', { html: ICONS.sick }),
      h('h1', "You're seasick!"),
      h('p.sick-timer', fmtTime(((me.sickUntil ?? 0) - net.gt()) / 1000)),
      h(
        'p',
        sub
          ? h('span', h('b', sub.name), ` is running your ${mine.map((x) => STATIONS[x.id].name).join(' and ')}. You can't touch the controls, but you can talk them through it.`)
          : 'Nobody could take over your station.',
      ),
      h(
        'ul.sick-status',
        mine.map((st) => {
          const left = st.task?.deadline ? (st.task.deadline - net.gt()) / 1000 : null;
          return h(
            `li${st.task ? '.busy' : ''}`,
            h('span.st-inline', { html: STATION_ICONS[st.id] }),
            h('b', STATIONS[st.id].name),
            st.task ? ` · ${STATIONS[st.id].alert}${left !== null ? ` (${Math.ceil(left)}s left)` : ''}` : ' · all calm',
          );
        }),
      ),
      h('p.muted', 'Tip: ask them to describe exactly what they see.'),
    );
  }

  function update() {
    const s = net.state;
    if (!s) return;
    const me = net.me;
    route.update(s);
    meters.update(s);
    clear(roster);
    roster.append(crewList(s, net.gt(), { me: net.playerId }));
    root.dataset.phase = s.phase;
    root.classList.toggle('is-sick', s.phase === 'voyage' && !!me?.sick);
    top.classList.toggle('hide-meters', s.phase === 'lobby' || s.phase === 'training');

    const stations: StationId[] =
      s.phase === 'training' ? me?.owns ?? [] : s.phase === 'voyage' && !me?.sick ? me?.controls ?? [] : [];
    syncPanels(s, stations);
    work.style.display = s.phase === 'training' || s.phase === 'voyage' ? '' : 'none';
    if (s.phase === 'voyage' && stations.length === 0 && !me?.sick) {
      panelsEl.dataset.empty = 'true';
      if (!panelsEl.querySelector('.no-station')) panelsEl.append(h('div.no-station.idle', h('p.idle-title', 'No station right now.'), h('p.idle-sub', "Stand by. You'll be called in if someone gets seasick.")));
    } else panelsEl.querySelector('.no-station')?.remove();
    for (const p of panels.values()) p.tick(net.gt());
    renderRules(s);
    renderTrainingBar(s);
    renderNotice(s);
    renderSick(s);

    if (s.phase === 'voyage' && s.nextSickAt && s.settings.sicknessEnabled) {
      nextSick.innerHTML = `${ICONS.sick}<span>Seasickness in ${fmtTime((s.nextSickAt - net.gt()) / 1000)}</span>`;
      nextSick.style.display = '';
    } else nextSick.style.display = 'none';

    const sickNow = s.phase === 'voyage' && !!me?.sick;
    const coveringNow = me?.covering.join(',') ?? '';
    if (sickNow !== wasSick || phase !== s.phase) requestAnimationFrame(reframe);
    if (sickNow && !wasSick) sfx.sick();
    if (coveringNow && coveringNow !== wasCovering) sfx.alert();
    wasSick = sickNow;
    wasCovering = coveringNow;
    phase = s.phase;
  }

  const offs = [
    net.on('state', (s) => {
      scene.setSnapshot(s);
      update();
    }),
    net.on('event', (e: GameEvent) => {
      scene.onEvent(e);
      if (e.type === 'log') log.push(e.text);
      if (e.type === 'phase' && e.phase === 'voyage') log.clear();
    }),
    net.on('result', (r) => {
      const st = taskStation.get(r.taskId);
      const p = st ? panels.get(st) : undefined;
      p?.onResult(r.kind, r.hint);
    }),
    net.on('status', (ok) => offline.classList.toggle('on', !ok)),
  ];

  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (e.key === 'Tab' && panels.size > 1) {
      const ids = [...panels.keys()];
      active = ids[(ids.indexOf(active!) + 1) % ids.length];
      update();
      e.preventDefault();
      return;
    }
    const p = active ? panels.get(active) : undefined;
    if (p?.key(e)) e.preventDefault();
  };
  document.addEventListener('keydown', onKey);
  const timer = setInterval(update, 200);
  requestAnimationFrame(reframe);

  return () => {
    offs.forEach((f) => f());
    document.removeEventListener('keydown', onKey);
    clearInterval(timer);
    ro.disconnect();
    for (const p of panels.values()) p.destroy();
  };
}
