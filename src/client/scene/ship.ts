import * as THREE from 'three';
import type { StationId } from '../../shared/types';

export const SHIP_LENGTH = 12;
export const DECK_Y = 0.8;

const flat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0, ...extra });

export const MAT = {
  wood: flat('#8a5a35'),
  woodDark: flat('#5b3920'),
  deck: flat('#b0804f'),
  navy: flat('#23436e'),
  gold: flat('#e8b730', { roughness: 0.5, metalness: 0.2 }),
  duck: flat('#ffcc33', { roughness: 0.6 }),
  beak: flat('#ff8a2a'),
  black: flat('#1b2430'),
  white: flat('#f4f1ea'),
  iron: flat('#3b3f45', { roughness: 0.6, metalness: 0.4 }),
  red: flat('#b8412f'),
  green: flat('#3f8f4f'),
  brass: flat('#d4a44a', { roughness: 0.4, metalness: 0.5 }),
};

/** Hull half-width at a z position along the ship. Bow at -6, stern at +6. */
export function hullHalfWidth(z: number): number {
  const u = THREE.MathUtils.clamp((z + SHIP_LENGTH / 2) / SHIP_LENGTH, 0, 1);
  return Math.max(0.05, 1.9 * Math.pow(Math.sin(Math.PI * u), 0.6));
}
function hullTop(z: number): number {
  const u = (z + SHIP_LENGTH / 2) / SHIP_LENGTH;
  return 1.2 + 0.9 * Math.pow(2 * u - 1, 4);
}
function hullBottom(z: number): number {
  const u = (z + SHIP_LENGTH / 2) / SHIP_LENGTH;
  return -0.1 - 0.9 * Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.5);
}

function buildHull(): THREE.Mesh {
  const sections = 17;
  const rings: THREE.Vector3[][] = [];
  for (let i = 0; i < sections; i++) {
    const z = -SHIP_LENGTH / 2 + (SHIP_LENGTH * i) / (sections - 1);
    const w = hullHalfWidth(z);
    const top = hullTop(z);
    const bot = hullBottom(z);
    const hgt = top - bot;
    const half = [
      [w, top],
      [w * 0.99, top - hgt * 0.18],
      [w * 0.95, top - hgt * 0.42],
      [w * 0.8, top - hgt * 0.7],
      [w * 0.45, bot + hgt * 0.07],
      [0, bot],
    ];
    const ring = [
      ...half.map(([x, y]) => new THREE.Vector3(-x, y, z)),
      ...half.slice(0, -1).reverse().map(([x, y]) => new THREE.Vector3(x, y, z)),
    ];
    rings.push(ring);
  }
  // band colour per quad row, from the gunwale down to the keel and back up
  const bandColors = ['#e8b730', '#23436e', '#23436e', '#2b4f80', '#9c3b2b'].map((c) => new THREE.Color(c));
  const n = rings[0].length;
  const pos: number[] = [];
  const col: number[] = [];
  const pushTri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let k = 0; k < 3; k++) col.push(color.r, color.g, color.b);
  };
  for (let i = 0; i < sections - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const band = j < n / 2 ? j : n - 2 - j;
      const color = bandColors[Math.min(band, bandColors.length - 1)];
      const a = rings[i][j];
      const b = rings[i + 1][j];
      const c = rings[i + 1][j + 1];
      const d = rings[i][j + 1];
      pushTri(a, b, c, color);
      pushTri(a, c, d, color);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  return mesh;
}

function buildDeck(): THREE.Group {
  const shape = new THREE.Shape();
  const steps = 24;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const z = -SHIP_LENGTH / 2 + 0.4 + ((SHIP_LENGTH - 0.8) * i) / steps;
    pts.push(new THREE.Vector2(hullHalfWidth(z) * 0.93, z));
  }
  shape.moveTo(pts[0].x, pts[0].y);
  pts.forEach((p) => shape.lineTo(p.x, p.y));
  [...pts].reverse().forEach((p) => shape.lineTo(-p.x, p.y));
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, MAT.deck);
  mesh.position.y = DECK_Y;
  // plank lines
  const lines = new THREE.Group();
  for (let x = -1.6; x <= 1.6; x += 0.4) {
    const len = SHIP_LENGTH * 0.8;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, len), MAT.woodDark);
    plank.position.set(x, DECK_Y + 0.006, 0);
    plank.scale.z = Math.max(0.1, 1 - Math.abs(x) / 2.2);
    lines.add(plank);
  }
  const g = new THREE.Group();
  g.add(mesh, lines);
  return g;
}

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;
  draw(c);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function drawDuck(c: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  c.save();
  c.translate(cx, cy);
  c.scale(s, s);
  c.fillStyle = '#ffcc33';
  c.beginPath();
  c.ellipse(-10, 18, 46, 30, 0, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.moveTo(-52, 10);
  c.quadraticCurveTo(-70, -8, -60, -14);
  c.quadraticCurveTo(-50, 4, -34, 4);
  c.fill();
  c.beginPath();
  c.arc(20, -22, 24, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#ff8a2a';
  c.beginPath();
  c.moveTo(40, -24);
  c.quadraticCurveTo(62, -26, 66, -18);
  c.quadraticCurveTo(56, -10, 40, -12);
  c.fill();
  c.fillStyle = '#1b2430';
  c.beginPath();
  c.arc(27, -28, 4.5, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#e0a91c';
  c.lineWidth = 5;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(-34, 20);
  c.quadraticCurveTo(-12, 38, 12, 22);
  c.stroke();
  c.restore();
}

export interface SailSide {
  mesh: THREE.Mesh;
  base: Float32Array;
  /** +1 for the side facing the stern, -1 for the side facing the bow (rotated half a turn). */
  sign: number;
}

function buildSail(): { group: THREE.Group; sides: SailSide[] } {
  const tex = canvasTexture(512, 512, (c) => {
    c.fillStyle = '#f1e6cf';
    c.fillRect(0, 0, 512, 512);
    c.strokeStyle = 'rgba(120,90,50,0.18)';
    c.lineWidth = 3;
    for (let x = 64; x < 512; x += 64) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, 512);
      c.stroke();
    }
    c.fillStyle = '#23436e';
    c.fillRect(0, 0, 512, 26);
    c.fillStyle = '#e8b730';
    c.fillRect(0, 26, 512, 8);
    c.beginPath();
    c.fillStyle = 'rgba(35,67,110,0.12)';
    c.arc(256, 236, 150, 0, Math.PI * 2);
    c.fill();
    drawDuck(c, 256, 236, 2.2);
    c.fillStyle = '#23436e';
    c.font = 'bold 50px Georgia, serif';
    c.textAlign = 'center';
    c.fillText('ANDBASADØREN', 256, 470);
  });
  // Two single-sided sheets back to back, so the duck and the name read correctly from both sides.
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, flatShading: true });
  const group = new THREE.Group();
  const sides: SailSide[] = [1, -1].map((sign) => {
    const geo = new THREE.PlaneGeometry(5.6, 5.0, 14, 10);
    const mesh = new THREE.Mesh(geo, mat);
    if (sign === -1) mesh.rotation.y = Math.PI;
    group.add(mesh);
    return { mesh, base: Float32Array.from(geo.attributes.position.array as Float32Array), sign };
  });
  return { group, sides };
}

function buildFigurehead(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 9), MAT.duck);
  body.scale.set(0.85, 0.7, 1.2);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 6), MAT.duck);
  tail.position.set(0, 0.35, 0.85);
  tail.rotation.x = -0.9;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 9), MAT.duck);
  head.position.set(0, 0.75, -0.6);
  const beak = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), MAT.beak);
  beak.scale.set(1, 0.45, 1.6);
  beak.position.set(0, 0.66, -1.05);
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), MAT.black);
  eyeL.position.set(-0.24, 0.88, -0.92);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.24;
  // A little ambassador's bicorne hat.
  const hat = new THREE.Group();
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.22, 10), MAT.navy);
  const brim = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), MAT.navy);
  brim.scale.set(1.15, 0.5, 0.55);
  brim.position.y = 0.05;
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.035, 5, 14), MAT.gold);
  band.rotation.x = Math.PI / 2;
  band.position.y = -0.06;
  hat.add(crown, brim, band);
  hat.position.set(0, 1.16, -0.55);
  hat.rotation.z = 0.12;
  g.add(body, tail, head, beak, eyeL, eyeR, hat);
  return g;
}

function buildWheel(): THREE.Group {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.18), MAT.woodDark);
  post.position.y = 0.45;
  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 6, 18), MAT.wood);
  wheel.add(rim);
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 5), MAT.wood);
    spoke.rotation.z = (i * Math.PI) / 4;
    wheel.add(spoke);
  }
  wheel.position.set(0, 1.0, -0.12);
  wheel.name = 'wheel';
  g.add(post, wheel);
  return g;
}

function buildStove(): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.7), MAT.iron);
  box.position.y = 0.3;
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.2, 8), MAT.iron);
  pipe.position.set(0.2, 1.1, 0.15);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.25, 10), MAT.black);
  pot.position.set(-0.15, 0.72, -0.05);
  g.add(box, pipe, pot);
  return g;
}

function buildPump(): THREE.Group {
  const g = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.8, 10), MAT.brass);
  barrel.position.y = 0.4;
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.9), MAT.woodDark);
  lever.position.set(0, 0.85, 0.25);
  lever.rotation.x = -0.4;
  lever.name = 'lever';
  const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.9), MAT.woodDark);
  hatch.position.set(0.0, 0.04, -0.7);
  g.add(barrel, lever, hatch);
  return g;
}

function buildFlagLocker(): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.5), MAT.wood);
  box.position.y = 0.22;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.6, 6), MAT.woodDark);
  pole.position.set(-0.2, 1.3, 0);
  g.add(box, pole);
  const colors = ['#2f5fa8', '#c83c3c', '#e8b730'];
  colors.forEach((c, i) => {
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide }));
    flag.position.set(-0.2, 2.4 - i * 0.4, 0.27);
    flag.rotation.y = Math.PI / 2;
    flag.name = 'flag';
    g.add(flag);
  });
  return g;
}

export interface Oar {
  pivot: THREE.Group;
  side: 1 | -1;
  phaseOffset: number;
}

export interface ShipParts {
  root: THREE.Group;
  body: THREE.Group;
  sails: SailSide[];
  pennant: THREE.Group;
  oars: Oar[];
  wheel: THREE.Object3D;
  lever: THREE.Object3D;
  flags: THREE.Object3D[];
  chimneyTop: THREE.Vector3;
  stationSpots: Record<StationId, THREE.Vector3>;
  stationMarkers: Record<StationId, THREE.Vector3>;
  railSpots: THREE.Vector3[];
}

export function buildShip(): ShipParts {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  body.add(buildHull());
  body.add(buildDeck());

  // Stem post rising at the bow, with the duck on top.
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.4, 6), MAT.wood);
  stem.position.set(0, 1.9, -6.0);
  stem.rotation.x = -0.35;
  body.add(stem);
  const duck = buildFigurehead();
  duck.position.set(0, 2.55, -6.35);
  duck.scale.setScalar(0.95);
  body.add(duck);

  // Stern post
  const stern = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.2, 6), MAT.wood);
  stern.position.set(0, 1.9, 6.0);
  stern.rotation.x = 0.35;
  body.add(stern);
  const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.32, 0.25), new THREE.MeshStandardMaterial({ color: '#ffd27a', emissive: '#ffb84a', emissiveIntensity: 0.8 }));
  lantern.position.set(0, 2.6, 6.2);
  body.add(lantern);

  // Name boards on both sides of the bow.
  const nameTex = canvasTexture(1024, 128, (c) => {
    c.clearRect(0, 0, 1024, 128);
    c.fillStyle = '#ffffff';
    c.font = 'bold 86px Georgia, serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('ANDBASADØREN', 512, 68);
  });
  const nameMat = new THREE.MeshBasicMaterial({ map: nameTex, transparent: true, depthWrite: false });
  for (const side of [1, -1]) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.42), nameMat);
    const z = -3.2;
    plate.position.set(side * (hullHalfWidth(z) + 0.04), 0.95, z);
    // Face outwards; the hull narrows towards the bow, so angle the board a little.
    plate.rotation.y = side === 1 ? Math.PI / 2 + 0.12 : -Math.PI / 2 - 0.12;
    body.add(plate);
  }

  // Mast, yard and sail
  const mastZ = -1.0;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 9.2, 8), MAT.wood);
  mast.position.set(0, DECK_Y + 4.6, mastZ);
  body.add(mast);
  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6.4, 6), MAT.wood);
  yard.rotation.z = Math.PI / 2;
  yard.position.set(0, 8.4, mastZ - 0.15);
  body.add(yard);
  const { group: sailGroup, sides: sails } = buildSail();
  sailGroup.position.set(0, 8.4 - 2.6, mastZ - 0.25);
  body.add(sailGroup);
  const crow = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.32, 0.4, 8, 1, true), new THREE.MeshStandardMaterial({ color: '#5b3920', side: THREE.DoubleSide, flatShading: true }));
  crow.position.set(0, 9.0, mastZ);
  body.add(crow);
  const pennant = new THREE.Group();
  const pennantMesh = new THREE.Mesh(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.25, 0), new THREE.Vector3(0, -0.25, 0), new THREE.Vector3(0, 0, 1.4)]),
    new THREE.MeshStandardMaterial({ color: '#ffcc33', side: THREE.DoubleSide }),
  );
  pennantMesh.geometry.computeVertexNormals();
  pennant.add(pennantMesh);
  pennant.position.set(0, DECK_Y + 9.3, mastZ);
  body.add(pennant);

  // Rigging lines (stays)
  const stayMat = new THREE.LineBasicMaterial({ color: '#3b2a1a' });
  const stays = [
    [new THREE.Vector3(0, 9.2, mastZ), new THREE.Vector3(0, 1.9, -5.8)],
    [new THREE.Vector3(0, 9.2, mastZ), new THREE.Vector3(0, 1.8, 5.8)],
    [new THREE.Vector3(0, 8.6, mastZ), new THREE.Vector3(1.75, 1.2, mastZ + 0.8)],
    [new THREE.Vector3(0, 8.6, mastZ), new THREE.Vector3(-1.75, 1.2, mastZ + 0.8)],
    [new THREE.Vector3(3.1, 8.4, mastZ - 0.15), new THREE.Vector3(1.4, 1.2, mastZ + 1.8)],
    [new THREE.Vector3(-3.1, 8.4, mastZ - 0.15), new THREE.Vector3(-1.4, 1.2, mastZ + 1.8)],
  ];
  for (const [a, b] of stays) body.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), stayMat));

  // Oars
  const oars: Oar[] = [];
  const oarGeo = new THREE.CylinderGeometry(0.045, 0.045, 4.6, 5);
  oarGeo.rotateZ(Math.PI / 2);
  oarGeo.translate(2.0, 0, 0);
  const bladeGeo = new THREE.BoxGeometry(0.9, 0.04, 0.32);
  bladeGeo.translate(4.2, 0, 0);
  [-3.6, -2.2, 0.4, 1.6, 3.0].forEach((z, i) => {
    for (const side of [1, -1] as const) {
      const pivot = new THREE.Group();
      const oar = new THREE.Mesh(oarGeo, MAT.wood);
      const blade = new THREE.Mesh(bladeGeo, MAT.navy);
      pivot.add(oar, blade);
      const w = hullHalfWidth(z);
      pivot.position.set(side * w, hullTop(z) - 0.1, z);
      pivot.scale.x = side;
      body.add(pivot);
      oars.push({ pivot, side, phaseOffset: i * 0.03 });
    }
  });

  // Station props
  const wheelProp = buildWheel();
  wheelProp.position.set(0, DECK_Y, 4.55);
  body.add(wheelProp);
  const stove = buildStove();
  stove.position.set(1.0, DECK_Y, 2.1);
  body.add(stove);
  const pump = buildPump();
  pump.position.set(-1.0, DECK_Y, 2.8);
  body.add(pump);
  const locker = buildFlagLocker();
  locker.position.set(-1.15, DECK_Y, 0.6);
  body.add(locker);
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.08, 5, 12), flat('#c9b48a'));
  coil.rotation.x = Math.PI / 2;
  coil.position.set(0.75, DECK_Y + 0.06, -0.2);
  body.add(coil);

  const v = (x: number, z: number, y = DECK_Y) => new THREE.Vector3(x, y, z);
  const stationSpots: Record<StationId, THREE.Vector3> = {
    helm: v(0, 5.05),
    rigging: v(0.75, -0.55),
    bilge: v(-0.95, 3.35),
    signals: v(-0.75, 1.2),
    lookout: v(0, -4.7),
    galley: v(0.95, 2.75),
  };
  const stationMarkers: Record<StationId, THREE.Vector3> = Object.fromEntries(
    Object.entries(stationSpots).map(([k, p]) => [k, p.clone().add(new THREE.Vector3(0, 2.3, 0))]),
  ) as any;
  const railSpots = [v(1.45, 1.4), v(-1.45, -0.6), v(1.4, -2.2), v(-1.4, 2.0)];

  return {
    root,
    body,
    sails,
    pennant,
    oars,
    wheel: wheelProp.getObjectByName('wheel')!,
    lever: pump.getObjectByName('lever')!,
    flags: locker.children.filter((c) => c.name === 'flag'),
    chimneyTop: new THREE.Vector3(1.2, DECK_Y + 1.75, 2.25),
    stationSpots,
    stationMarkers,
    railSpots,
  };
}

/** Sets an oar pose. `phase` in [0,1): 0 = catch, 0.5 = finish, back to catch during recovery. rest = blend to idle. */
export function poseOar(oar: Oar, phase: number, rest: number) {
  const inWater = phase < 0.5;
  const t = inWater ? phase / 0.5 : (phase - 0.5) / 0.5;
  const sweep = inWater ? THREE.MathUtils.lerp(-0.55, 0.45, easeInOut(t)) : THREE.MathUtils.lerp(0.45, -0.55, easeInOut(t));
  const dip = inWater ? 0.32 : 0.12 + 0.08 * Math.sin(Math.PI * t);
  const restSweep = 0.05;
  const restDip = 0.08;
  oar.pivot.rotation.y = THREE.MathUtils.lerp(sweep, restSweep, rest) * oar.side;
  oar.pivot.rotation.z = -THREE.MathUtils.lerp(dip, restDip, rest);
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
