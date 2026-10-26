// A two-cell incandescent flashlight, modelled part by part.
// Every part is built along its own +Y axis; the assembly lies along Y from the
// tail (y = 0) to the front of the head (y = LENGTH). One unit = 1 cm.
import * as THREE from 'three';
import { knurlTexture, batteryLabelTexture } from './textures.js';

export const LENGTH = 21.8;
const SEG = 72;

const std = (o) => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, ...o });
const MAT = {
  anodized: () => std({ color: 0xc94f1c, metalness: 0.78, roughness: 0.33 }),
  knurled: () => {
    const bump = knurlTexture();
    bump.repeat.set(30, 7);
    return std({ color: 0xb9461a, metalness: 0.78, roughness: 0.42, bumpMap: bump, bumpScale: 2.5 });
  },
  bareAlu: () => std({ color: 0xbfc3c9, metalness: 1, roughness: 0.3 }),
  chrome: () => std({ color: 0xf5f5f5, metalness: 1, roughness: 0.08 }),
  mirror: () => std({ color: 0xffffff, metalness: 1, roughness: 0.06, envMapIntensity: 2.2 }),
  rubber: () => std({ color: 0x1b1c1f, metalness: 0, roughness: 0.85 }),
  steel: () => std({ color: 0xd2d6db, metalness: 1, roughness: 0.25 }),
  brass: () => std({ color: 0xd4a84f, metalness: 1, roughness: 0.28 }),
  solder: () => std({ color: 0x9ea3a8, metalness: 1, roughness: 0.45 }),
  blackGlass: () => std({ color: 0x0c0c0d, metalness: 0, roughness: 0.15 }),
  tungsten: () => std({ color: 0x77706a, metalness: 1, roughness: 0.35 }),
  label: () => std({ map: batteryLabelTexture(), metalness: 0.25, roughness: 0.42, side: THREE.FrontSide }),
  glass: () => new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.02, transmission: 1, thickness: 0.12,
    ior: 1.5, specularIntensity: 1, envMapIntensity: 1.2,
  }),
};

function mesh(geometry, material) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function lathe(points, material) {
  return mesh(new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), SEG), material);
}

// Coil along Y. `squeeze` packs the turns tighter at both ends, like a real spring.
class Helix extends THREE.Curve {
  constructor(radius, y0, y1, turns, squeeze = 0) {
    super();
    Object.assign(this, { radius, y0, y1, turns, squeeze });
  }
  getPoint(t, target = new THREE.Vector3()) {
    const a = t * this.turns * Math.PI * 2;
    const f = t - (this.squeeze * Math.sin(2 * Math.PI * t)) / (2 * Math.PI);
    return target.set(Math.cos(a) * this.radius, this.y0 + (this.y1 - this.y0) * f, Math.sin(a) * this.radius);
  }
}

function helix(radius, y0, y1, turns, tube, material, squeeze = 0) {
  const curve = new Helix(radius, y0, y1, turns, squeeze);
  return mesh(new THREE.TubeGeometry(curve, Math.ceil(turns * 28), tube, 8, false), material);
}

function ring(radius, y, tube, material) {
  const m = mesh(new THREE.TorusGeometry(radius, tube, 12, SEG), material);
  m.rotation.x = Math.PI / 2;
  m.position.y = y;
  return m;
}

// Grip grooves cut into a lathe profile between y0 and y1.
function grooved(r, y0, y1, step, depth) {
  const pts = [];
  for (let y = y0; y + step <= y1 + 1e-6; y += step) {
    pts.push([r, y], [r - depth, y + step * 0.2], [r - depth, y + step * 0.45], [r, y + step * 0.65]);
  }
  return pts;
}

function tag(root, id) {
  root.traverse((o) => {
    if (o.isMesh && !o.userData.part) o.userData.part = id;
  });
  root.userData.part = id;
  root.name = id;
  return root;
}

function buildSpring() {
  const g = new THREE.Group();
  const steel = MAT.steel();
  g.add(helix(0.95, 0.42, 3.05, 7, 0.075, steel, 0.75));
  return tag(g, 'spring');
}

function buildTailCap() {
  const g = new THREE.Group();
  const outer = [
    [0, 0], [1.56, 0], [1.74, 0.08], [1.8, 0.26],
    ...grooved(1.8, 0.45, 2.3, 0.36, 0.07),
    [1.8, 2.6], [1.74, 2.7], [1.5, 2.7], [1.5, 0.38], [0, 0.38],
  ];
  g.add(lathe(outer, MAT.anodized()));
  // contact plate the spring sits on
  const plate = mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.05, SEG), MAT.bareAlu());
  plate.position.y = 0.41;
  g.add(plate);
  const spring = buildSpring();
  g.add(spring);
  g.userData.spring = spring;
  return tag(g, 'tailcap');
}

function buildSwitch() {
  const g = new THREE.Group();
  const boss = mesh(new THREE.CylinderGeometry(0.72, 0.8, 0.22, 40), MAT.anodized());
  boss.position.y = 0.06;
  const collar = mesh(new THREE.CylinderGeometry(0.6, 0.62, 0.16, 40), MAT.chrome());
  collar.position.y = 0.24;
  const dome = mesh(new THREE.SphereGeometry(0.5, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), MAT.rubber());
  dome.scale.set(1, 0.62, 1);
  dome.position.y = 0.3;
  g.add(boss, collar, dome);
  return tag(g, 'switch');
}

function buildBody() {
  const g = new THREE.Group();
  const anod = MAT.anodized();
  const profile = [
    [1.3, 0.5], [1.44, 0.5], [1.44, 2.62], [1.6, 2.74],
    [1.6, 16.22], [1.44, 16.34], [1.44, 18.0], [1.3, 18.0], [1.3, 0.5],
  ];
  g.add(lathe(profile, anod));

  const grip = mesh(new THREE.CylinderGeometry(1.612, 1.612, 7.2, SEG, 1, true), MAT.knurled());
  grip.position.y = 8.3;
  g.add(grip);
  const grooveMat = std({ color: 0x5a2410, metalness: 0.7, roughness: 0.5 });
  g.add(ring(1.6, 4.55, 0.045, grooveMat), ring(1.6, 12.05, 0.045, grooveMat));

  const alu = MAT.bareAlu();
  g.add(helix(1.445, 0.6, 2.3, 9, 0.035, alu));
  g.add(helix(1.445, 16.55, 17.85, 7, 0.035, alu));
  const rubber = MAT.rubber();
  g.add(ring(1.47, 2.48, 0.07, rubber), ring(1.47, 16.45, 0.07, rubber));

  const sw = buildSwitch();
  sw.rotation.z = Math.PI / 2; // dome points along -X, which is "up" once the light lies flat
  sw.position.set(-1.56, 14.1, 0);
  g.add(sw);
  g.userData.switch = sw;
  return tag(g, 'body');
}

// Battery is centred on its own origin so it can be flipped end for end.
export const BATTERY_LENGTH = 6.84;
function buildBattery(id) {
  const g = new THREE.Group();
  const steel = MAT.steel();
  const side = mesh(new THREE.CylinderGeometry(1.22, 1.22, 6.3, SEG, 1, true), MAT.label());
  side.position.y = -0.05;
  g.add(side);
  g.add(lathe([[1.22, 3.1], [1.2, 3.19], [1.1, 3.22], [0.55, 3.22], [0.5, 3.2], [0, 3.2]], steel));
  const nub = mesh(new THREE.CylinderGeometry(0.42, 0.44, 0.22, 40), steel);
  nub.position.y = 3.31;
  g.add(nub);
  g.add(lathe([[0, -3.42], [1.08, -3.42], [1.19, -3.37], [1.22, -3.2]], steel));
  return tag(g, id);
}

function buildBulb() {
  const g = new THREE.Group();
  // brass screw base
  const thread = [[0.12, 0.0]];
  thread.push([0.3, 0.02], [0.36, 0.08]);
  for (let y = 0.1; y < 0.55; y += 0.11) thread.push([0.43, y + 0.03], [0.38, y + 0.08]);
  thread.push([0.4, 0.58], [0.34, 0.62]);
  g.add(lathe(thread, MAT.brass()));
  const insulator = mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.06, 32), MAT.blackGlass());
  insulator.position.y = 0.02;
  const tip = mesh(new THREE.SphereGeometry(0.11, 20, 10), MAT.solder());
  tip.scale.y = 0.5;
  tip.position.y = 0.0;
  g.add(insulator, tip);

  const glass = lathe([
    [0.33, 0.6], [0.4, 0.78], [0.45, 1.02], [0.45, 1.25], [0.38, 1.52],
    [0.25, 1.72], [0.1, 1.84], [0, 1.86],
  ], MAT.glass());
  glass.castShadow = false;
  g.add(glass);

  // filament: two support wires and a tungsten coil
  const wire = MAT.steel();
  for (const x of [-0.14, 0.14]) {
    const w = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.62, 8), wire);
    w.position.set(x, 0.92, 0);
    g.add(w);
  }
  const stem = mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.3, 16), std({ color: 0xe8e4da, roughness: 0.3, transparent: true, opacity: 0.7 }));
  stem.position.y = 0.7;
  g.add(stem);
  const coil = helix(0.035, -0.15, 0.15, 11, 0.009, MAT.tungsten());
  coil.rotation.z = Math.PI / 2;
  coil.position.y = 1.23;
  coil.name = 'filament';
  g.add(coil);
  g.userData.filament = coil;
  return tag(g, 'bulb');
}

function buildLens() {
  const g = new THREE.Group();
  const disc = mesh(new THREE.CylinderGeometry(2.41, 2.41, 0.12, SEG), MAT.glass());
  disc.castShadow = false;
  // Glass looks green-blue at its edge, which is what makes a clear lens visible.
  const edge = mesh(new THREE.CylinderGeometry(2.415, 2.415, 0.12, SEG, 1, true),
    std({ color: 0x8fc9bb, metalness: 0, roughness: 0.1, transparent: true, opacity: 0.75 }));
  g.add(disc, edge);
  return tag(g, 'lens');
}

function buildHead() {
  const g = new THREE.Group();
  const shell = [
    [1.48, 2.0], [1.48, 0], [1.78, 0], [1.84, 0.1],
    ...grooved(1.84, 0.3, 1.8, 0.3, 0.06),
    [1.84, 2.1], [2.0, 2.7], [2.32, 3.7], [2.5, 4.55], [2.56, 4.82],
  ];
  g.add(lathe(shell, MAT.anodized()));

  // parabolic reflector, mirror-polished
  const refl = [];
  const r0 = 0.5, r1 = 2.4, y0 = 1.75, y1 = 4.92;
  for (let i = 0; i <= 24; i++) {
    const r = r0 + (r1 - r0) * (i / 24);
    refl.push([r, y0 + ((r * r - r0 * r0) / (r1 * r1 - r0 * r0)) * (y1 - y0)]);
  }
  g.add(lathe(refl, MAT.mirror()));
  const floor = mesh(new THREE.RingGeometry(r0, 1.48, SEG), MAT.anodized());
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = y0;
  g.add(floor);

  // chrome bezel ring that clamps the lens
  g.add(lathe([
    [2.4, 4.86], [2.56, 4.8], [2.68, 4.9], [2.7, 5.34], [2.62, 5.45], [2.42, 5.45], [2.36, 5.24], [2.36, 5.2],
  ], MAT.chrome()));

  const lens = buildLens();
  lens.position.y = 5.12;
  g.add(lens);
  g.userData.lens = lens;
  return tag(g, 'head');
}

// Assembly offsets along the axis (tail = 0).
export const HOME_Y = {
  tailcap: 0,
  battery2: 3.0 + BATTERY_LENGTH / 2,
  battery1: 3.0 + BATTERY_LENGTH * 1.5,
  bulb: 3.0 + BATTERY_LENGTH * 2,
  head: 16.35,
};

export function buildFlashlight() {
  const root = new THREE.Group();
  root.name = 'flashlight';
  const body = buildBody();
  const tailcap = buildTailCap();
  const battery2 = buildBattery('battery2');
  const battery1 = buildBattery('battery1');
  const bulb = buildBulb();
  const head = buildHead();
  battery2.position.y = HOME_Y.battery2;
  battery1.position.y = HOME_Y.battery1;
  bulb.position.y = HOME_Y.bulb;
  head.position.y = HOME_Y.head;
  root.add(body, tailcap, battery2, battery1, bulb, head);
  return {
    root,
    objects: {
      body, tailcap, battery2, battery1, bulb, head,
      switch: body.userData.switch,
      spring: tailcap.userData.spring,
      lens: head.userData.lens,
    },
  };
}
