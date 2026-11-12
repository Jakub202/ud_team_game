import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import type { GameEvent, Snapshot, StationId, Wind } from '../../shared/types';
import { createOcean, createSky, OCEAN_CELL, waveHeight, type OceanUniforms, type SkyUniforms } from './ocean';
import { buildShip, DECK_Y, MAT, poseOar, type ShipParts } from './ship';

export const PLAYER_COLORS = ['#d9534f', '#4a90d9', '#5cb85c', '#f0ad4e', '#9b59b6', '#1abc9c', '#e67e22', '#e84393', '#2c3e50', '#16a085', '#c0392b', '#8e44ad'];

const CALM = {
  top: new THREE.Color('#3d6fa8'),
  horizon: new THREE.Color('#f2d4a6'),
  deep: new THREE.Color('#1d4e6e'),
  shallow: new THREE.Color('#3f93a8'),
  fogDensity: 0.0055,
  light: 1,
};
const STORM = {
  top: new THREE.Color('#262f3b'),
  horizon: new THREE.Color('#5d6b78'),
  deep: new THREE.Color('#15252e'),
  shallow: new THREE.Color('#355260'),
  fogDensity: 0.011,
  light: 0.58,
};

const WIND_VEC: Record<Wind, THREE.Vector2> = {
  // direction the air moves (x, z); the ship heads towards -z ("north")
  N: new THREE.Vector2(0, 1),
  E: new THREE.Vector2(-1, 0),
  S: new THREE.Vector2(0, -1),
  W: new THREE.Vector2(1, 0),
};

interface Figure {
  id: string;
  group: THREE.Group;
  jacket: THREE.MeshStandardMaterial;
  baseColor: THREE.Color;
  label?: CSS2DObject;
  labelEl?: HTMLElement;
  target: THREE.Vector3;
  lean: number;
  hop: number;
  sickMix: number;
  sick: boolean;
  walkPhase: number;
}

interface Prop {
  obj: THREE.Object3D;
  radius: number;
}

export interface SceneOptions {
  labels: boolean;
  quality: 'high' | 'low';
}

export class ShipScene {
  readonly renderer: THREE.WebGLRenderer;
  private labelRenderer: CSS2DRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.5, 1400);
  private clock = new THREE.Clock();
  private ocean: { mesh: THREE.Mesh; uniforms: OceanUniforms };
  private sky: { mesh: THREE.Mesh; uniforms: SkyUniforms };
  private hemi = new THREE.HemisphereLight('#fff1dc', '#28506b', 1.25);
  private sun = new THREE.DirectionalLight('#ffe2b8', 1.9);
  private ship: ShipParts;
  private figures = new Map<string, Figure>();
  private markers = new Map<StationId, THREE.Sprite>();
  private props: Prop[] = [];
  private pier: THREE.Group;
  private island: THREE.Group;
  private rain: THREE.LineSegments;
  private rainPos: Float32Array;
  private wake: THREE.Points;
  private wakeData: { life: Float32Array; pos: Float32Array; col: Float32Array; next: number };
  private smoke: THREE.Mesh[] = [];

  private snap: Snapshot | null = null;
  private stormMix = 0;
  private flash = 0;
  private nextLightning = 6;
  private time = 0;
  private offset = 0;
  private speed = 0;
  private impulse = 0;
  private strokeT: number | null = null;
  private strokeQueue = 0;
  private oarRest = 1;
  private sinkT = 0;
  private orbitAngle = -0.9;
  private focusRect: { x: number; y: number; w: number; h: number } | null = null;
  private running = true;
  private islandZ = -400;
  private windAngle = 0;
  private wheelSpin = 0;
  private pumpT = 0;
  private disposed = false;

  onLightning: (() => void) | null = null;

  constructor(private container: HTMLElement, private opts: SceneOptions) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.quality === 'high' ? 1.75 : 1.25));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);
    if (opts.labels) {
      this.labelRenderer = new CSS2DRenderer();
      this.labelRenderer.domElement.className = 'scene-labels';
      container.appendChild(this.labelRenderer.domElement);
    }

    this.scene.background = CALM.horizon.clone();
    this.sky = createSky();
    this.scene.add(this.sky.mesh);
    this.ocean = createOcean();
    this.scene.add(this.ocean.mesh);
    this.sun.position.set(30, 40, -25);
    this.scene.add(this.hemi, this.sun);

    this.ship = buildShip();
    this.scene.add(this.ship.root);
    this.buildMarkers();
    this.buildSmoke();

    this.pier = this.buildPier();
    this.scene.add(this.pier);
    this.island = this.buildIsland();
    this.scene.add(this.island);
    this.spawnProps();

    // Rain
    const count = opts.quality === 'high' ? 1600 : 900;
    this.rainPos = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) this.resetDrop(i, true);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#b9c6d3', transparent: true, opacity: 0 }));
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);

    // Wake foam
    const wn = 260;
    this.wakeData = { life: new Float32Array(wn), pos: new Float32Array(wn * 3), col: new Float32Array(wn * 3), next: 0 };
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(this.wakeData.pos, 3));
    wg.setAttribute('color', new THREE.BufferAttribute(this.wakeData.col, 3));
    this.wake = new THREE.Points(
      wg,
      new THREE.PointsMaterial({ size: 0.9, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.wake.frustumCulled = false;
    this.scene.add(this.wake);

    this.resize();
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.renderer.setAnimationLoop(this.frame);
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.renderer.dispose();
    this.container.innerHTML = '';
  }

  private onVisibility = () => {
    this.running = !document.hidden;
    if (this.running) this.clock.getDelta();
  };

  /** Place the ship inside this screen rectangle (CSS px). Pass null for a full-screen orbiting camera. */
  setFocusRect(rect: { x: number; y: number; w: number; h: number } | null) {
    this.focusRect = rect;
    this.applyCamera(0);
  }

  private resize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.labelRenderer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  // ───────────────────────── state in ─────────────────────────

  setSnapshot(s: Snapshot) {
    const prev = this.snap;
    this.snap = s;
    if (prev && prev.phase !== s.phase && s.phase === 'lobby') {
      this.pier.position.set(7.4, 0, 0);
      this.sinkT = 0;
    }
    if (prev && prev.phase !== 'voyage' && s.phase === 'voyage') {
      this.pier.position.set(7.4, 0, 0);
    }
    this.syncFigures(s);
    this.windAngle = Math.atan2(WIND_VEC[s.ship.wind].x, WIND_VEC[s.ship.wind].y);
  }

  onEvent(e: GameEvent) {
    if (e.type === 'stroke') {
      this.strokeQueue = Math.min(3, this.strokeQueue + 1);
      this.impulse += 5;
      const f = this.figures.get(e.by);
      if (f) f.hop = 1;
      if (e.station === 'helm') this.wheelSpin = 1;
      if (e.station === 'bilge') this.pumpT = 1;
    }
  }

  // ───────────────────────── figures ─────────────────────────

  private makeFigure(id: string, name: string, colorIdx: number): Figure {
    const group = new THREE.Group();
    group.rotation.order = 'YXZ';
    const baseColor = new THREE.Color(PLAYER_COLORS[colorIdx % PLAYER_COLORS.length]);
    const jacket = new THREE.MeshStandardMaterial({ color: baseColor.clone(), flatShading: true, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.85, 8), jacket);
    body.position.y = 0.43;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshStandardMaterial({ color: '#e3c08d', flatShading: true }));
    head.position.y = 1.07;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.13, 10), MAT.navy);
    cap.position.y = 1.25;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 10), MAT.navy);
    brim.position.set(0, 1.19, -0.05);
    group.add(body, head, cap, brim);
    group.scale.setScalar(1.05);
    const f: Figure = {
      id,
      group,
      jacket,
      baseColor,
      target: new THREE.Vector3(0, DECK_Y, 0),
      lean: 0,
      hop: 0,
      sickMix: 0,
      sick: false,
      walkPhase: Math.random() * 6,
    };
    if (this.opts.labels) {
      const el = document.createElement('div');
      el.className = 'name-tag';
      el.textContent = name;
      el.style.setProperty('--c', PLAYER_COLORS[colorIdx % PLAYER_COLORS.length]);
      const label = new CSS2DObject(el);
      label.position.set(0, 1.75, 0);
      group.add(label);
      f.label = label;
      f.labelEl = el;
    }
    this.ship.body.add(group);
    return f;
  }

  private syncFigures(s: Snapshot) {
    const seen = new Set<string>();
    const spotUse = new Map<string, number>();
    s.players.forEach((p, idx) => {
      seen.add(p.id);
      let f = this.figures.get(p.id);
      if (!f) {
        f = this.makeFigure(p.id, p.name, idx);
        f.group.position.set((idx - 2) * 0.6, DECK_Y, 0.5);
        this.figures.set(p.id, f);
      }
      if (f.labelEl) {
        f.labelEl.textContent = p.sick ? `${p.name} 🤢` : p.name;
        f.labelEl.classList.toggle('sick', p.sick);
        f.labelEl.classList.toggle('away', !p.connected);
      }
      f.sick = p.sick;
      let spot: THREE.Vector3;
      if (p.sick) {
        spot = this.ship.railSpots[idx % this.ship.railSpots.length].clone();
      } else {
        const active = p.controls.find((id) => s.stations.find((st) => st.id === id)?.task);
        const st = active ?? p.controls[0] ?? p.owns[0];
        spot = st ? this.ship.stationSpots[st].clone() : new THREE.Vector3(-0.4 + (idx % 3) * 0.4, DECK_Y, -1.9);
      }
      const key = `${spot.x.toFixed(1)},${spot.z.toFixed(1)}`;
      const n = spotUse.get(key) ?? 0;
      spotUse.set(key, n + 1);
      if (n > 0) spot.add(new THREE.Vector3(n % 2 ? 0.45 : -0.45, 0, 0.3 * Math.ceil(n / 2)));
      f.target.copy(spot);
    });
    for (const [id, f] of this.figures) {
      if (!seen.has(id)) {
        if (f.label) f.group.remove(f.label);
        f.labelEl?.remove();
        this.ship.body.remove(f.group);
        this.figures.delete(id);
      }
    }
    for (const [st, m] of this.markers) {
      const v = s.stations.find((x) => x.id === st);
      m.visible = !!v?.task && s.phase !== 'lobby';
    }
  }

  private buildMarkers() {
    const tex = (() => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const c = cv.getContext('2d')!;
      c.fillStyle = '#ffcc33';
      c.strokeStyle = '#1b2430';
      c.lineWidth = 8;
      c.beginPath();
      c.arc(64, 60, 46, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.beginPath();
      c.moveTo(52, 102);
      c.lineTo(64, 124);
      c.lineTo(76, 102);
      c.fill();
      c.fillStyle = '#1b2430';
      c.font = 'bold 72px sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('!', 64, 64);
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    for (const [id, pos] of Object.entries(this.ship.stationMarkers) as [StationId, THREE.Vector3][]) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      sp.position.copy(pos);
      sp.scale.setScalar(0.75);
      sp.visible = false;
      sp.renderOrder = 10;
      this.ship.body.add(sp);
      this.markers.set(id, sp);
    }
  }

  private buildSmoke() {
    const mat = new THREE.MeshStandardMaterial({ color: '#d9d4cc', transparent: true, opacity: 0.6, flatShading: true });
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), mat.clone());
      m.userData.t = i / 6;
      this.smoke.push(m);
      this.ship.body.add(m);
    }
  }

  // ───────────────────────── world props ─────────────────────────

  private buildPier(): THREE.Group {
    const g = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 16), MAT.wood);
    deck.position.set(0, 1.0, 0);
    g.add(deck);
    for (let z = -7.5; z <= 7.5; z += 2.5) {
      for (const x of [-1.4, 1.4]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 3.2, 6), MAT.woodDark);
        post.position.set(x, -0.3, z);
        g.add(post);
      }
    }
    const shed = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2, 3), MAT.red);
    shed.position.set(0.1, 2.15, 4.5);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.1, 4), MAT.woodDark);
    roof.position.set(0.1, 3.7, 4.5);
    roof.rotation.y = Math.PI / 4;
    g.add(shed, roof);
    g.position.set(7.4, 0, 0);
    return g;
  }

  private buildIsland(): THREE.Group {
    const g = new THREE.Group();
    const land = new THREE.Mesh(new THREE.IcosahedronGeometry(30, 1), new THREE.MeshStandardMaterial({ color: '#5f8f4e', flatShading: true }));
    land.scale.set(1.3, 0.28, 0.8);
    land.position.y = -2;
    g.add(land);
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(10, 0), new THREE.MeshStandardMaterial({ color: '#8b8d8f', flatShading: true }));
    rock.position.set(-18, 2, -4);
    rock.scale.set(1, 0.9, 1);
    g.add(rock);
    // A giant duck statue welcomes the crew.
    const duck = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(4, 14, 10), MAT.duck);
    body.scale.set(1, 0.75, 1.25);
    const head = new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 10), MAT.duck);
    head.position.set(0, 4.3, 3);
    const beak = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), MAT.beak);
    beak.scale.set(1, 0.45, 1.6);
    beak.position.set(0, 3.8, 5.6);
    duck.add(body, head, beak);
    duck.position.set(6, 9, 0);
    g.add(duck);
    for (let i = 0; i < 5; i++) {
      const house = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 3), [MAT.red, MAT.white, MAT.duck][i % 3]);
      house.position.set(-8 + i * 5.5, 6.2, 9 + (i % 2) * 3);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.6, 4), MAT.woodDark);
      roof.rotation.y = Math.PI / 4;
      roof.position.set(house.position.x, 8.2, house.position.z);
      g.add(house, roof);
    }
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 9, 6), MAT.white);
    flagPole.position.set(14, 11, 4);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), new THREE.MeshStandardMaterial({ color: '#ffcc33', side: THREE.DoubleSide }));
    flag.position.set(15.5, 14.5, 4);
    g.add(flagPole, flag);
    g.position.set(-14, 0, -400);
    g.rotation.y = Math.PI;
    return g;
  }

  private spawnProps() {
    const rockMat = new THREE.MeshStandardMaterial({ color: '#7d8288', flatShading: true });
    const isleMat = new THREE.MeshStandardMaterial({ color: '#6f9a58', flatShading: true });
    for (let i = 0; i < 16; i++) {
      const g = new THREE.Group();
      const kind = i % 4;
      let radius = 3;
      if (kind === 0 || kind === 1) {
        const r = 1.5 + Math.random() * 3;
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
        rock.scale.y = 0.6 + Math.random() * 0.5;
        rock.rotation.set(Math.random(), Math.random() * 6, Math.random());
        g.add(rock);
        radius = r;
      } else if (kind === 2) {
        const r = 7 + Math.random() * 8;
        const isle = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), isleMat);
        isle.scale.set(1.4, 0.3, 1);
        isle.position.y = -1;
        g.add(isle);
        if (Math.random() < 0.6) {
          const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1, 6, 8), MAT.white);
          tower.position.set(0, r * 0.3 + 2.5, 0);
          const top = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1, 8), MAT.red);
          top.position.set(0, r * 0.3 + 6, 0);
          g.add(tower, top);
        }
        radius = r * 1.4;
      } else {
        const buoy = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.6, 8), Math.random() < 0.5 ? MAT.red : MAT.green);
        buoy.position.y = 0.4;
        g.add(buoy);
        radius = 0.6;
      }
      this.placeProp(g, radius, true);
      this.scene.add(g);
      this.props.push({ obj: g, radius });
    }
  }

  private placeProp(obj: THREE.Object3D, radius: number, initial: boolean) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const near = radius < 1 ? 9 + Math.random() * 10 : 22 + Math.random() * 90;
    obj.position.set(side * (near + radius), 0, initial ? -300 + Math.random() * 360 : -320 - Math.random() * 60);
  }

  private resetDrop(i: number, initial: boolean) {
    const x = (Math.random() - 0.5) * 70;
    const z = (Math.random() - 0.5) * 70;
    const y = initial ? Math.random() * 30 : 28 + Math.random() * 4;
    const a = i * 6;
    this.rainPos[a] = x;
    this.rainPos[a + 1] = y;
    this.rainPos[a + 2] = z;
    this.rainPos[a + 3] = x;
    this.rainPos[a + 4] = y - 1.1;
    this.rainPos[a + 5] = z;
  }

  // ───────────────────────── frame ─────────────────────────

  private frame = () => {
    if (!this.running || this.disposed) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    const s = this.snap;
    const phase = s?.phase ?? 'lobby';
    const paused = s?.paused ?? false;
    const strengthK = s ? [0, 0.7, 0.85, 1][s.settings.stormStrength] ?? 0.7 : 0.7;
    const stormTarget = s?.ship.storm && phase === 'voyage' ? strengthK : 0;
    this.stormMix += (stormTarget - this.stormMix) * Math.min(1, dt * 0.45);
    const storm = this.stormMix;

    // Environment colours
    const top = CALM.top.clone().lerp(STORM.top, storm);
    const horizon = CALM.horizon.clone().lerp(STORM.horizon, storm);
    const light = THREE.MathUtils.lerp(CALM.light, STORM.light, storm);
    this.flash = Math.max(0, this.flash - dt * 3.2);
    const flash = this.flash > 0.5 ? 0.75 : this.flash * 0.6;
    this.sky.uniforms.uTop.value.copy(top);
    this.sky.uniforms.uHorizon.value.copy(horizon);
    this.sky.uniforms.uSun.value = 1 - storm;
    this.sky.uniforms.uFlash.value = flash * 0.55;
    this.scene.background = horizon;
    const ou = this.ocean.uniforms;
    ou.uDeep.value.copy(CALM.deep).lerp(STORM.deep, storm);
    ou.uShallow.value.copy(CALM.shallow).lerp(STORM.shallow, storm);
    ou.uFogColor.value.copy(horizon);
    ou.uFogDensity.value = THREE.MathUtils.lerp(CALM.fogDensity, STORM.fogDensity, storm);
    ou.uLight.value = light + flash * 0.5;
    ou.uAmp.value = 1 + storm * 1.1;
    this.hemi.intensity = 1.25 * light + flash * 2;
    this.sun.intensity = 1.9 * (1 - storm * 0.75);

    // Lightning
    if (storm > 0.45 && !paused) {
      this.nextLightning -= dt;
      if (this.nextLightning <= 0) {
        this.flash = 1;
        this.nextLightning = (8 + Math.random() * 9) / Math.max(0.6, strengthK);
        setTimeout(() => this.onLightning?.(), 400 + Math.random() * 900);
      }
    }

    // Motion
    const voyage = phase === 'voyage' && !paused;
    const strokeAnim = voyage || phase === 'debrief';
    const baseSpeed = voyage ? 1.6 : 0;
    this.impulse *= Math.exp(-dt * 0.9);
    const targetSpeed = baseSpeed + (voyage ? this.impulse : 0);
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 2);
    if (!paused) {
      this.offset += this.speed * dt;
      ou.uTime.value += dt;
    }
    ou.uOffset.value = this.offset;
    const t = ou.uTime.value;
    const amp = ou.uAmp.value;

    // Ship rides the waves
    const hb = waveHeight(0, -5, t, amp, this.offset);
    const hs = waveHeight(0, 5, t, amp, this.offset);
    const hp = waveHeight(-2, 0, t, amp, this.offset);
    const hst = waveHeight(2, 0, t, amp, this.offset);
    const waterSink = s ? (s.ship.water / 100) * 0.45 : 0;
    const root = this.ship.root;
    if (phase === 'debrief' && s?.debrief?.result === 'sunk') this.sinkT = Math.min(1, this.sinkT + dt * 0.12);
    else this.sinkT = Math.max(0, this.sinkT - dt);
    root.position.y = (hb + hs + hp + hst) * 0.25 * 0.7 - 0.15 - waterSink - this.sinkT * 4.2;
    root.rotation.x = Math.atan2(hb - hs, 10) * 0.8 + this.sinkT * 0.35;
    root.rotation.z = Math.atan2(hst - hp, 4) * 0.6 + Math.sin(this.time * 0.7) * 0.03 * storm + this.sinkT * 0.25;

    // Oars
    if (strokeAnim && this.strokeT === null && this.strokeQueue > 0) {
      this.strokeQueue--;
      this.strokeT = 0;
    }
    if (this.strokeT !== null) {
      this.strokeT += dt / 0.95;
      if (this.strokeT >= 1) this.strokeT = this.strokeQueue > 0 && strokeAnim ? (this.strokeQueue--, 0) : null;
    }
    this.oarRest += ((this.strokeT !== null ? 0 : 1) - this.oarRest) * Math.min(1, dt * 6);
    const ph = this.strokeT ?? 0;
    for (const oar of this.ship.oars) poseOar(oar, Math.min(0.999, Math.max(0, ph - oar.phaseOffset)), this.oarRest);
    if (this.strokeT !== null && this.strokeT < 0.5 && Math.random() < 0.5) this.emitWake(true);

    // Sail billow & pennant
    const wind = s ? WIND_VEC[s.ship.wind] : WIND_VEC.S;
    const tail = Math.max(0, -wind.y); // wind pushing towards the bow
    const billow = (phase === 'lobby' ? 0.25 : 0.45 + 0.5 * tail + 0.2 * Math.abs(wind.x)) * (1 + storm * 0.3);
    for (const side of this.ship.sails) {
      const pos = side.mesh.geometry.attributes.position as THREE.BufferAttribute;
      const b = side.base;
      for (let i = 0; i < pos.count; i++) {
        const x = b[i * 3];
        const y = b[i * 3 + 1];
        const u = x / 2.8;
        const v = (y + 0.3) / 2.6;
        const flutter = Math.sin(this.time * (3 + storm * 4) + x * 1.3 + y * 0.8) * 0.06 * (1 + storm * 2);
        const bulge = billow * (1 - u * u) * (1 - Math.min(1, v * v) * 0.6) * 1.1 + flutter;
        pos.setZ(i, -bulge * side.sign);
      }
      pos.needsUpdate = true;
      side.mesh.geometry.computeVertexNormals();
    }
    const pen = this.ship.pennant;
    const desired = this.windAngle;
    let diff = desired - pen.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    pen.rotation.y += diff * Math.min(1, dt * 2);
    pen.rotation.z = Math.sin(this.time * 6) * 0.15;
    for (const [i, flag] of this.ship.flags.entries()) flag.rotation.x = Math.sin(this.time * 4 + i) * 0.2;

    // Station props
    this.wheelSpin = Math.max(0, this.wheelSpin - dt * 1.2);
    this.ship.wheel.rotation.z = Math.sin(this.time * 0.6) * 0.3 + Math.sin(this.wheelSpin * Math.PI) * 1.4;
    this.pumpT = Math.max(0, this.pumpT - dt * 1.4);
    this.ship.lever.rotation.x = -0.4 + Math.sin(this.pumpT * Math.PI * 4) * 0.5;
    for (const m of this.smoke) {
      m.userData.t = (m.userData.t + dt * 0.25) % 1;
      const k = m.userData.t;
      m.position.copy(this.ship.chimneyTop).add(new THREE.Vector3(k * 0.6, k * 2.2, k * 1.4));
      m.scale.setScalar(0.6 + k * 2.2);
      (m.material as THREE.MeshStandardMaterial).opacity = 0.55 * (1 - k);
    }
    for (const [st, m] of this.markers) {
      if (!m.visible) continue;
      const base = this.ship.stationMarkers[st];
      m.position.set(base.x, base.y + Math.sin(this.time * 4) * 0.12, base.z);
    }

    // Crew
    for (const f of this.figures.values()) {
      const g = f.group;
      const d = f.target.clone().sub(g.position);
      d.y = 0;
      const dist = d.length();
      if (dist > 0.05) {
        const step = Math.min(dist, dt * 2.4);
        g.position.addScaledVector(d.normalize(), step);
        f.walkPhase += dt * 12;
        g.rotation.y = Math.atan2(d.x, d.z) + Math.PI;
      } else if (!f.sick) {
        g.rotation.y += (0 - g.rotation.y) * Math.min(1, dt * 2);
      }
      f.hop = Math.max(0, f.hop - dt * 2.2);
      const walkBob = dist > 0.05 ? Math.abs(Math.sin(f.walkPhase)) * 0.08 : 0;
      g.position.y = DECK_Y + walkBob + Math.sin(f.hop * Math.PI) * 0.45;
      f.sickMix += ((f.sick ? 1 : 0) - f.sickMix) * Math.min(1, dt * 2);
      f.jacket.color.copy(f.baseColor).lerp(new THREE.Color('#8bc34a'), f.sickMix * 0.75);
      const leanTarget = f.sick && dist < 0.1 ? 0.55 + Math.sin(this.time * 3) * 0.12 : 0;
      f.lean += (leanTarget - f.lean) * Math.min(1, dt * 3);
      if (f.sick && dist < 0.1) {
        g.rotation.y = f.target.x > 0 ? -Math.PI / 2 : Math.PI / 2;
      }
      g.rotation.x = -f.lean * 0.6;
    }

    // World scrolls past the ship
    const move = paused ? 0 : this.speed * dt;
    for (const p of this.props) {
      p.obj.position.z += move;
      p.obj.position.y = p.radius < 1 ? waveHeight(p.obj.position.x, p.obj.position.z, t, amp, this.offset) * 0.8 : 0;
      if (p.obj.position.z > 90) this.placeProp(p.obj, p.radius, false);
    }
    if (phase === 'voyage') this.pier.position.z += move;
    this.pier.visible = this.pier.position.z < 120;
    if (s) {
      const remaining = Math.max(0, s.ship.distance - s.ship.progress);
      const targetZ = phase === 'debrief' && s.debrief?.result === 'arrived' ? -38 : -(remaining * 4 + 45);
      this.islandZ += (targetZ - this.islandZ) * Math.min(1, dt * 0.8);
      this.island.position.z = Math.max(-420, this.islandZ);
      this.island.visible = this.islandZ > -380 && phase !== 'lobby' && phase !== 'training';
    }

    this.updateRain(dt, storm, wind);
    this.updateWake(dt, move);
    this.applyCamera(dt);

    ou.uCamPos.value.copy(this.camera.position);
    // The ocean plane follows the camera in whole grid cells so the waves don't swim.
    this.ocean.mesh.position.set(
      Math.round(this.camera.position.x / OCEAN_CELL) * OCEAN_CELL,
      0,
      Math.round(this.camera.position.z / OCEAN_CELL) * OCEAN_CELL,
    );
    this.sky.mesh.position.copy(this.camera.position);

    this.renderer.render(this.scene, this.camera);
    this.labelRenderer?.render(this.scene, this.camera);
  };

  private updateRain(dt: number, storm: number, wind: THREE.Vector2) {
    const mat = this.rain.material as THREE.LineBasicMaterial;
    mat.opacity = storm * 0.5;
    this.rain.visible = storm > 0.02;
    if (!this.rain.visible) return;
    const p = this.rainPos;
    const n = p.length / 6;
    const fall = 34 * dt;
    const wx = wind.x * 6 * dt;
    const wz = wind.y * 6 * dt;
    for (let i = 0; i < n; i++) {
      const a = i * 6;
      p[a + 1] -= fall;
      p[a + 4] -= fall;
      p[a] += wx;
      p[a + 3] += wx * 0.9;
      p[a + 2] += wz;
      p[a + 5] += wz * 0.9;
      if (p[a + 4] < -1) this.resetDrop(i, false);
    }
    (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  private emitWake(oarSplash: boolean) {
    const w = this.wakeData;
    const i = w.next;
    w.next = (w.next + 1) % w.life.length;
    w.life[i] = 1;
    if (oarSplash) {
      const oar = this.ship.oars[Math.floor(Math.random() * this.ship.oars.length)];
      w.pos[i * 3] = oar.side * (5.6 + Math.random() * 0.6);
      w.pos[i * 3 + 2] = oar.pivot.position.z + (Math.random() - 0.5) * 1.5;
    } else {
      w.pos[i * 3] = (Math.random() - 0.5) * 1.4;
      w.pos[i * 3 + 2] = 6.2;
    }
    w.pos[i * 3 + 1] = 0.15;
  }

  private updateWake(dt: number, move: number) {
    const w = this.wakeData;
    if (this.speed > 0.4 && Math.random() < this.speed * dt * 6) this.emitWake(false);
    for (let i = 0; i < w.life.length; i++) {
      if (w.life[i] <= 0) {
        w.col[i * 3] = w.col[i * 3 + 1] = w.col[i * 3 + 2] = 0;
        continue;
      }
      w.life[i] -= dt * 0.45;
      w.pos[i * 3 + 2] += move;
      w.pos[i * 3] *= 1 + dt * 0.12;
      const k = Math.max(0, w.life[i]) * 0.7;
      w.col[i * 3] = k;
      w.col[i * 3 + 1] = k;
      w.col[i * 3 + 2] = k;
    }
    this.wake.geometry.attributes.position.needsUpdate = true;
    this.wake.geometry.attributes.color.needsUpdate = true;
  }

  private applyCamera(dt: number) {
    const cam = this.camera;
    const W = this.container.clientWidth || window.innerWidth;
    const H = this.container.clientHeight || window.innerHeight;
    const bob = Math.sin(this.time * 0.4) * 0.3;
    if (this.focusRect && this.focusRect.w > 20 && this.focusRect.h > 20) {
      const r = this.focusRect;
      const fov = THREE.MathUtils.degToRad(cam.fov);
      // World units that must fit across the rect (ship is ~13 long and ~11 tall, plus perspective margin).
      const fitW = (17 * H) / r.w;
      const fitH = (14 * H) / r.h;
      const D = (Math.max(fitW, fitH) / (2 * Math.tan(fov / 2))) * 1.08;
      const dir = new THREE.Vector3(0.82, 0.42, -0.5).normalize();
      const target = new THREE.Vector3(0, 3.6, -0.3);
      cam.position.copy(target).addScaledVector(dir, D);
      cam.position.y += bob;
      cam.lookAt(target);
      cam.setViewOffset(W, H, W / 2 - (r.x + r.w / 2), H / 2 - (r.y + r.h / 2), W, H);
    } else {
      this.orbitAngle += dt * 0.035;
      const R = W / H < 1.2 ? 34 : 27;
      cam.position.set(Math.sin(this.orbitAngle) * R, 10 + bob, Math.cos(this.orbitAngle) * R);
      cam.lookAt(0, 2.8, 0);
      if (cam.view) cam.clearViewOffset();
    }
    cam.updateProjectionMatrix();
  }
}

function dotTexture(): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}
