// A general assembly-guide player. It knows nothing about bookshelves: it reads a product
// file (parts with sizes and final positions, plus ordered steps) and builds the 3D scene,
// the parts pile, and the step-by-step animation from that alone.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { birchTexture, plankTexture } from './textures.js';

const $ = (id) => document.getElementById(id);
const V3 = THREE.Vector3;
const Q = THREE.Quaternion;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);
const PRODUCT_URL = `products/${(params.get('product') || 'bookshelf').replace(/[^a-z0-9-]/gi, '')}.json`;

const canvas = $('scene');
const viewport = $('viewport');

// ---------- renderer & scene ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (err) {
  $('loading').textContent = 'Your browser could not start 3D graphics (WebGL). Try another browser or device.';
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(35, 1, 2, 6000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = THREE.MathUtils.degToRad(86);
controls.minDistance = 20;
controls.maxDistance = 1500;
controls.screenSpacePanning = true;

const key = new THREE.DirectionalLight(0xfff3e6, 2.2);
key.position.set(-120, 220, 160);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -340, right: 340, top: 340, bottom: -340, near: 10, far: 1200 });
key.shadow.camera.updateProjectionMatrix();
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.3;
key.shadow.radius = 4;
const fill = new THREE.DirectionalLight(0xd6e4ff, 0.5);
fill.position.set(200, 80, 120);
scene.add(key, fill);

// Room: plank floor and a painted wall.
{
  const floorTex = plankTexture();
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(16, 16); // each tile is about 1.8 m of floorboards
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(3000, 3000),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.6 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 110),
    new THREE.MeshStandardMaterial({ color: 0x6f7f8a, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(20, 0, 10);
  rug.receiveShadow = true;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(3000, 400), new THREE.MeshStandardMaterial({ color: 0xe9e6e1, roughness: 0.95 }));
  wall.position.set(0, 200, -90);
  wall.receiveShadow = true;
  scene.add(floor, rug, wall);
}

// ---------- materials ----------
function makeMaterials() {
  return {
    birch: new THREE.MeshStandardMaterial({ map: birchTexture(), roughness: 0.6 }),
    hardboard: new THREE.MeshStandardMaterial({ color: 0x8c6a48, roughness: 0.92 }),
    dowel: new THREE.MeshStandardMaterial({ color: 0xe0c08a, roughness: 0.7 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xd3d7dc, metalness: 0.75, roughness: 0.38 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xd2aa55, metalness: 1, roughness: 0.3 }),
    cardboard: new THREE.MeshStandardMaterial({ color: 0xc49a6c, roughness: 0.95 }),
    blackbrown: new THREE.MeshStandardMaterial({ map: birchTexture(), color: 0x4a3a32, roughness: 0.5 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f1ee, roughness: 0.55 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.6 }),
    felt: new THREE.MeshStandardMaterial({ color: 0xb9b4aa, roughness: 1 }),
  };
}
const MATS = makeMaterials();

// ---------- building parts from the product file ----------
const UP = new V3(0, 1, 0);
const DOWN = new V3(0, -1, 0);

function shadowed(m) {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Every part is built at its own origin. Boards and dowels are centred; headed parts
// (screws, nails) have the head at the origin and the shaft pointing down local -Y.
function buildPart(p) {
  const mat = MATS[p.material] || MATS.birch;
  const g = new THREE.Group();
  if (p.shape === 'board') {
    const [x, y, z] = p.size;
    const r = Math.min(0.15, Math.min(x, y, z) / 2.2);
    g.add(shadowed(new THREE.Mesh(new RoundedBoxGeometry(x, y, z, 2, r), mat.clone())));
  } else if (p.shape === 'dowel' || p.shape === 'pin') {
    const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(p.radius, p.radius, p.length, 20), mat.clone()));
    g.add(m);
  } else if (p.shape === 'knob') {
    // A mushroom knob: the stem end (+y) meets the face it's fitted to, the round head is outside.
    const L = p.length;
    const R = p.radius;
    const stem = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.42, R * 0.55, L * 0.5, 24), mat.clone()));
    stem.position.y = L / 4;
    const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(R, 32, 16), stem.material));
    head.scale.y = (L * 0.5) / (2 * R);
    head.position.y = -L / 4;
    g.add(stem, head);
  } else if (p.shape === 'screw' || p.shape === 'nail') {
    const headR = p.shape === 'screw' ? p.radius * 2.1 : p.radius * 3;
    const headH = p.shape === 'screw' ? 0.22 : 0.08;
    const head = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(headR, headR * 0.92, headH, 24), mat.clone()));
    head.position.y = -headH / 2;
    const shaft = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(p.radius, p.radius * 0.4, p.length, 16), head.material));
    shaft.position.y = -headH - p.length / 2;
    g.add(head, shaft);
    if (p.shape === 'screw') {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(headR * 1.6, 0.05, 0.08), new THREE.MeshStandardMaterial({ color: 0x333333 }));
      slot.position.y = 0.005;
      g.add(slot);
    }
  }
  g.traverse((o) => {
    if (o.isMesh) o.userData.part = p.id;
  });
  return g;
}

// Final orientation: boards are modelled in place; hardware turns to face its insertion direction.
function assembledQuat(p) {
  if (!p.dir) return new Q();
  const dir = new V3(...p.dir).normalize();
  return new Q().setFromUnitVectors(p.shape === 'screw' || p.shape === 'nail' ? DOWN : UP, dir);
}

function partExtent(p) {
  if (p.shape === 'board') return new V3(...p.size);
  return new V3(p.radius * 2, p.length, p.radius * 2);
}

// ---------- pre-drilled holes ----------
// Flat-pack boards come drilled, and the holes are how you match parts. Wherever a dowel, stud,
// screw or cam lock goes into a board, that board gets a hole on that face, so a board lying in
// the pile already shows where its hardware goes and which way. Worked out from the parts'
// positions, not authored. Nails make their own holes, so they're left out.
const holeMat = new THREE.MeshStandardMaterial({
  color: 0x231d19, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});
const AXES = ['x', 'y', 'z'];

function drillHoles() {
  const boards = product.parts.filter((p) => p.shape === 'board');
  const discs = {}; // board id -> hole geometries, in the board's own frame
  const zAxis = new V3(0, 0, 1);
  for (const h of product.parts) {
    if (!['dowel', 'pin', 'screw'].includes(h.shape)) continue;
    const dir = new V3(...h.dir).normalize();
    const start = new V3(...h.pos);
    if (h.shape !== 'screw') start.addScaledVector(dir, -h.length / 2); // centred parts
    const radius = h.shape === 'screw' ? h.radius * 1.4 : h.radius * 1.12;
    for (const b of boards) {
      // Where the part's axis enters and leaves the board's box (boards sit square in the product).
      const c = new V3(...b.pos);
      const half = new V3(...b.size).multiplyScalar(0.5);
      let tIn = -Infinity;
      let tOut = Infinity;
      let nIn = null;
      let nOut = null;
      let misses = false;
      for (const a of AXES) {
        const o = start[a] - c[a];
        const d = dir[a];
        if (Math.abs(d) < 1e-6) {
          if (Math.abs(o) > half[a] - 0.01) misses = true;
          continue;
        }
        const sign = d > 0 ? 1 : -1;
        const enter = (-sign * half[a] - o) / d;
        const leave = (sign * half[a] - o) / d;
        if (enter > tIn) {
          tIn = enter;
          nIn = new V3().setComponent(AXES.indexOf(a), -sign);
        }
        if (leave < tOut) {
          tOut = leave;
          nOut = new V3().setComponent(AXES.indexOf(a), sign);
        }
      }
      if (misses || Math.min(tOut, h.length) - Math.max(tIn, 0) < 0.15) continue;
      for (const [t, n] of [[tIn, nIn], [tOut, nOut]]) {
        if (t < -0.05 || t > h.length + 0.05) continue; // that face is beyond the part's ends
        const geo = new THREE.CircleGeometry(radius, 20);
        const at = start.clone().addScaledVector(dir, t).sub(c).addScaledVector(n, 0.015);
        geo.applyMatrix4(new THREE.Matrix4().compose(at, new Q().setFromUnitVectors(zAxis, n), new V3(1, 1, 1)));
        (discs[b.id] ||= []).push(geo);
      }
    }
  }
  for (const [id, list] of Object.entries(discs)) {
    const m = new THREE.Mesh(mergeGeometries(list), holeMat);
    m.raycast = () => {}; // taps go to the board itself
    objects[id].add(m);
    for (const g of list) g.dispose();
  }
}

// ---------- the parts pile: generated, not authored ----------
// Boards lie flat in piles beside the build, largest first, with metal runners in piles of their
// own. Hardware sits in a tray in front of the piles, a line or more per kind of part, in the
// order the steps use it. The floor in front of the build stays clear, so parts can be set out
// there to be worked on. Everything is sized from the product, so a dresser gets more room
// than a side table.
let PILE_X = 92; // left edge of the piles
let STAGE_Z = 40; // nearest row where parts are set out
let STAGE_W = 160; // widest a row of set-out parts gets before it wraps
const PILE_FRONT = 40;
const PILE_BACK = -80;
const PILE_HEIGHT = 22;
const TRAY = { x: 0, z: 0, w: 30, d: 22 };
const pileBox = new THREE.Box3();
const isSmall = (p) => p.shape === 'board' && Math.max(...p.size) < 6;
const absV = (v) => v.set(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z));

// Lay a box flat: smallest side up, longest side left to right.
function flatQuat(size) {
  const s = new V3(...size);
  const smallest = ['x', 'y', 'z'].reduce((m, d) => (s[d] < s[m] ? d : m), 'x');
  let q = new Q();
  if (smallest === 'x') q.setFromAxisAngle(new V3(0, 0, 1), Math.PI / 2);
  if (smallest === 'z') q.setFromAxisAngle(new V3(1, 0, 0), Math.PI / 2);
  let ext = absV(s.clone().applyQuaternion(q));
  if (ext.z > ext.x) {
    q = new Q().setFromAxisAngle(UP, Math.PI / 2).multiply(q);
    ext = new V3(ext.z, ext.y, ext.x);
  }
  return { q, ext };
}

function layOut(parts) {
  const poses = {};
  pileBox.makeEmpty();
  const area = (p) => { const s = [...p.size].sort((m, n) => n - m); return s[0] * s[1]; };
  const boards = parts.filter((p) => p.shape === 'board' && !isSmall(p));
  const wood = boards.filter((p) => p.material !== 'steel').sort((a, b) => area(b) - area(a));
  const metal = boards.filter((p) => p.material === 'steel').sort((a, b) => area(b) - area(a));

  // Piles fill a column from front to back, then start the next column further out.
  let colX = PILE_X;
  let colW = 0;
  let zCursor = PILE_FRONT;
  const startPile = (ext) => {
    if (zCursor - ext.z < PILE_BACK && zCursor < PILE_FRONT) {
      colX += colW + 8;
      colW = 0;
      zCursor = PILE_FRONT;
    }
    const pileAt = { x: colX + ext.x / 2, z: zCursor - ext.z / 2, h: 0 };
    zCursor -= ext.z + 6;
    colW = Math.max(colW, ext.x);
    return pileAt;
  };
  for (const list of [wood, metal]) {
    let cur = null;
    for (const p of list) {
      const { q, ext } = flatQuat(p.size);
      if (!cur || cur.h + ext.y > PILE_HEIGHT) cur = startPile(ext);
      const pos = new V3(cur.x, cur.h + ext.y / 2 + 0.02, cur.z);
      poses[p.id] = { pos, quat: q };
      cur.h += ext.y + 0.05;
      pileBox.expandByPoint(pos.clone().sub(ext.clone().multiplyScalar(0.5))).expandByPoint(pos.clone().add(ext.clone().multiplyScalar(0.5)));
    }
  }

  // Hardware, grouped by kind, in the order the steps first use it.
  const firstUse = {};
  product.steps.forEach((st, n) => st.parts.forEach((id) => (firstUse[id] ??= n)));
  const groups = new Map();
  for (const p of parts) {
    if (p.shape === 'board' && !isSmall(p)) continue;
    const k = `${p.label || ''}|${p.name}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  const ordered = [...groups.values()].sort((a, b) => (firstUse[a[0].id] ?? 0) - (firstUse[b[0].id] ?? 0));
  const lying = new Q().setFromAxisAngle(new V3(0, 0, 1), -Math.PI / 2); // local Y → +X
  const MAX_W = 64;
  const local = [];
  let trayW = 24;
  let z = 1.5;
  for (const list of ordered) {
    const p = list[0];
    const headed = p.shape === 'screw' || p.shape === 'nail';
    const headR = p.shape === 'screw' ? p.radius * 2.1 : p.radius * 3;
    const len = isSmall(p) ? p.size[0] : p.length + (headed ? 0.22 : 0);
    const deep = isSmall(p) ? p.size[2] : 2 * (headed ? headR : p.radius);
    const high = isSmall(p) ? p.size[1] / 2 : headed ? headR : p.radius;
    const pitch = len + 0.8;
    const perLine = Math.max(1, Math.floor((MAX_W - 3) / pitch));
    list.forEach((q, i) => {
      const line = Math.floor(i / perLine);
      const col = i % perLine;
      const pos = new V3(1.5 + col * pitch + len / 2, 0.9 + high, z + line * (deep + 0.8) + deep / 2);
      // Headed parts are built from the head, so shift them so the part is centred in its slot.
      if (headed) pos.x += p.length / 2;
      local.push([q.id, pos, isSmall(q) ? new Q() : lying.clone()]);
    });
    trayW = Math.max(trayW, Math.min(list.length, perLine) * pitch + 3);
    z += Math.ceil(list.length / perLine) * (deep + 0.8) + 0.6;
  }
  TRAY.w = trayW;
  TRAY.d = z + 1.5;
  TRAY.x = PILE_X + TRAY.w / 2;
  TRAY.z = PILE_FRONT + 8 + TRAY.d / 2;
  for (const [id, pos, quat] of local) {
    pos.x += TRAY.x - TRAY.w / 2;
    pos.z += TRAY.z - TRAY.d / 2;
    poses[id] = { pos, quat };
  }
  pileBox.expandByPoint(new V3(TRAY.x - TRAY.w / 2, 0, TRAY.z - TRAY.d / 2)).expandByPoint(new V3(TRAY.x + TRAY.w / 2, 3, TRAY.z + TRAY.d / 2));
  return poses;
}

function buildTray() {
  const g = new THREE.Group();
  const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(TRAY.w, 0.6, TRAY.d), MATS.cardboard));
  base.position.y = 0.3;
  g.add(base);
  for (const [w, d, x, z] of [[TRAY.w, 0.4, 0, TRAY.d / 2], [TRAY.w, 0.4, 0, -TRAY.d / 2], [0.4, TRAY.d, TRAY.w / 2, 0], [0.4, TRAY.d, -TRAY.w / 2, 0]]) {
    const wall = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, 2.4, d), MATS.cardboard));
    wall.position.set(x, 1.2, z);
    g.add(wall);
  }
  g.position.set(TRAY.x, 0, TRAY.z);
  return g;
}

// ---------- tweening ----------
const tweens = new Set();
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
let speed = 1; // short-lived speed-up when jumping between steps
let instant = false; // long jumps skip the animation altogether
let playback = 1; // the viewer's chosen speed: 1, 0.5 or 0.25
try { playback = Number(localStorage.getItem('guide:playback')) || 1; } catch { /* storage is optional */ }
function tween(duration, fn) {
  if (instant) {
    fn(1);
    return Promise.resolve();
  }
  const d = reduceMotion ? Math.min(duration, 0.12) : (duration * speed) / playback;
  return new Promise((resolve) => tweens.add({ t: 0, d, fn, resolve }));
}
function stepTweens(dt) {
  for (const tw of [...tweens]) {
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.d);
    tw.fn(k);
    if (k >= 1) {
      tweens.delete(tw);
      tw.resolve();
    }
  }
}
const wait = (s) => tween(s, () => {});

// Hammered parts go in with three taps instead of one smooth push.
const tapEase = (k) => {
  const taps = 3;
  const i = Math.min(taps - 1, Math.floor(k * taps));
  const f = k * taps - i;
  return (i + (f < 0.35 ? ease(f / 0.35) : 1)) / taps;
};

// ---------- app state ----------
// Positions in the product file describe the finished, upright product. Parts that have been
// fitted live inside `assembly`, which can start upside down and be flipped over, or be lifted
// and lowered onto another part, the way manuals do. A part with a `parent` is fitted to that
// part first, even while the parent is still lying in the pile, and then travels with it.
let product = null;
const objects = {};
const pile = {};
const finalM = {}; // upright pose of each part
const localM = {}; // pose inside the assembly group
const relM = {}; // pose relative to its parent part
const assembly = new THREE.Group();
scene.add(assembly);
const pivot = new V3(); // the middle of the finished product; the assembly turns about it

const X_AXIS = new V3(1, 0, 0);
const Z_AXIS = new V3(0, 0, 1);
const turnQ = (axis, degrees) => new Q().setFromAxisAngle(axis === 'z' ? Z_AXIS : X_AXIS, THREE.MathUtils.degToRad(degrees));

// How high the assembly's middle sits when it rests on the floor in a given orientation,
// counting only what's built by the time it's turned again (lying on its front, a dresser
// rests on its frame, not on drawer knobs that aren't fitted yet).
const rootOf = (id) => {
  let p = partById(id);
  while (p.parent) p = partById(p.parent);
  return p.id;
};
function restY(q, untilStep = Infinity) {
  let minY = Infinity;
  const corner = new V3();
  for (const p of product.parts) {
    if (!(stepOf[rootOf(p.id)] < untilStep)) continue;
    const rot = assembledQuat(p).premultiply(q);
    const half = partExtent(p).multiplyScalar(0.5);
    const centre = new V3(...p.pos).sub(pivot).applyQuaternion(q);
    // The lowest corner of the part's box, turned.
    let low = 0;
    for (const [axis, h] of [[new V3(1, 0, 0), half.x], [new V3(0, 1, 0), half.y], [new V3(0, 0, 1), half.z]]) {
      low -= Math.abs(corner.copy(axis).applyQuaternion(rot).y) * h;
    }
    minY = Math.min(minY, centre.y + low);
  }
  return minY === Infinity ? 0 : -minY;
}
// The first flip at or after step i: the assembly keeps its orientation until then.
const nextFlip = (i) => {
  const n = product.steps.findIndex((s, k) => k >= i && s.type === 'flip');
  return n < 0 ? product.steps.length : n;
};
let done = 0; // number of completed steps
let busy = false;
let ghosts = [];
const ghostMat = new THREE.MeshBasicMaterial({ color: 0x2f7bff, transparent: true, opacity: 0.3, depthTest: false, depthWrite: false });

const partById = (id) => product.parts.find((p) => p.id === id);
const canonicalAxis = (p) => (p.shape === 'screw' || p.shape === 'nail' ? DOWN : UP);
const holderOf = (p) => (p.parent ? objects[p.parent] : assembly);
const holderMatrix = (p) => (p.parent ? relM[p.id] : localM[p.id]);

// Where a part ends up in the world right now, given where its holder currently is.
function targetPose(p) {
  const h = holderOf(p);
  h.updateWorldMatrix(true, false);
  const pos = new V3();
  const quat = new Q();
  h.matrixWorld.clone().multiply(holderMatrix(p)).decompose(pos, quat, new V3());
  return { pos, quat };
}

// The turn that takes directions in the finished product to the world, for whatever holds
// this part right now (the assembly, or a part still being worked on on the floor).
function finalToWorld(p) {
  const h = holderOf(p);
  h.updateWorldMatrix(true, false);
  const q = new Q();
  h.matrixWorld.decompose(new V3(), q, new V3());
  if (p.parent) {
    const qParent = new Q();
    finalM[p.parent].decompose(new V3(), qParent, new V3());
    q.multiply(qParent.invert());
  }
  return q;
}

// `from` and `approach` are in the world as the viewer sees it, or with `local: true`, in the
// finished product's own frame (so "from behind the drawer" stays right however it's turned).
function approachOffset(step, p, t) {
  const v = step.approach?.[p.id] || step.from;
  if (v) return step.local ? new V3(...v).applyQuaternion(finalToWorld(p)) : new V3(...v);
  if (p.dir) return canonicalAxis(p).clone().applyQuaternion(t.quat).multiplyScalar(-(step.slide || 4));
  return new V3(0, 20, 0);
}

// ---------- setting parts out to work on ----------
// When a step fits hardware to a part that's still in the pile, that part first moves out onto
// the floor in front of the build, turned so the side being worked on faces up. A `turn` step
// turns parts that are set out (say, a drawer turned upside down to fit its runners).
const rest = {}; // where each unplaced part waits: its pile pose, or where it was set out
const staged = []; // stack of { step, kind, ids, prev, z0, z1 }, newest last
const isPlaced = (id) => objects[id].parent !== scene;
const GAP = 8;

// The box around a part and everything fitted to it so far, at a given orientation.
function footprint(id, quat) {
  const o = objects[id];
  const p0 = o.position.clone();
  const q0 = o.quaternion.clone();
  o.position.set(0, 0, 0);
  o.quaternion.copy(quat);
  o.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(o);
  o.position.copy(p0);
  o.quaternion.copy(q0);
  o.updateMatrixWorld(true);
  return box;
}

// Keep the long side left to right, so rows of set-out parts stay shallow.
function longwise(id, q) {
  const size = footprint(id, q).getSize(new V3());
  return size.z > size.x ? new Q().setFromAxisAngle(UP, Math.PI / 2).multiply(q) : q;
}

// Turn a part so the face pointing `up` in the finished product points up.
function faceUp(id, up) {
  const q = new Q();
  finalM[id].decompose(new V3(), q, new V3());
  return longwise(id, new Q().setFromUnitVectors(new V3(...up).normalize().applyQuaternion(q.invert()), UP));
}

function stagingQuat(parentId, children) {
  const parent = partById(parentId);
  // The product file can say which face should face up while it's worked on.
  if (parent.stageUp) return faceUp(parentId, parent.stageUp);
  const qParent = new Q();
  finalM[parentId].decompose(new V3(), qParent, new V3());
  const toParent = qParent.clone().invert();
  const avg = new V3();
  for (const c of children) avg.add(canonicalAxis(c).clone().applyQuaternion(assembledQuat(c)).applyQuaternion(toParent));
  // Hardware going in from one side: turn that side up. Mixed sides (both ends of a shelf): lie flat.
  const q = avg.length() > 0.5 ? new Q().setFromUnitVectors(avg.normalize(), DOWN) : pile[parentId].quat.clone();
  return longwise(parentId, q);
}

function moveTo(id, pose, duration = 1.1) {
  const o = objects[id];
  const p0 = o.position.clone();
  const q0 = o.quaternion.clone();
  return tween(duration, (k) => {
    const e = ease(k);
    o.position.lerpVectors(p0, pose.pos, e);
    o.position.y += Math.sin(Math.PI * e) * 18;
    o.quaternion.slerpQuaternions(q0, pose.quat, e);
  });
}

// The nearest band of floor in front of the build that's free for a block of set-out parts.
function freeZ(depth) {
  const taken = staged
    .filter((e) => e.ids.some((id) => !isPlaced(id) && rest[id] === e.poses[id]))
    .map((e) => [e.z0, e.z1])
    .sort((a, b) => a[0] - b[0]);
  let z = STAGE_Z;
  for (const [a, b] of taken) {
    if (z + depth + GAP <= a) break;
    z = Math.max(z, b + GAP);
  }
  return z;
}

// Move parts to a fresh spot on the floor, in rows, each at its own orientation.
async function setOut(step, kind, items) {
  const sized = items.map(({ id, quat }) => {
    const box = footprint(id, quat);
    return { id, quat, box, size: box.getSize(new V3()) };
  });
  const rows = [];
  let row = null;
  for (const it of sized) {
    if (!row || row.w + GAP + it.size.x > STAGE_W) {
      row = { items: [], w: -GAP, d: 0 };
      rows.push(row);
    }
    row.items.push(it);
    row.w += GAP + it.size.x;
    row.d = Math.max(row.d, it.size.z);
  }
  const depth = rows.reduce((d, r) => d + r.d, 0) + GAP * (rows.length - 1);
  const z0 = freeZ(depth);
  let z = z0;
  const prev = {};
  const poses = {};
  const moves = [];
  for (const r of rows) {
    let x = -r.w / 2;
    for (const it of r.items) {
      const c = it.box.getCenter(new V3());
      const pose = { pos: new V3(x + it.size.x / 2 - c.x, -it.box.min.y + 0.02, z + r.d / 2 - c.z), quat: it.quat };
      prev[it.id] = rest[it.id];
      rest[it.id] = poses[it.id] = pose;
      moves.push(moveTo(it.id, pose));
      x += it.size.x + GAP;
    }
    z += r.d + GAP;
  }
  staged.push({ step, kind, ids: sized.map((it) => it.id), prev, poses, z0, z1: z0 + depth });
  await Promise.all(moves);
}

// Undo the newest setOut, if it belongs to this step.
async function unstage(step, kind) {
  const entry = staged.at(-1);
  if (!entry || entry.step !== step || entry.kind !== kind) return;
  staged.pop();
  await Promise.all(entry.ids.filter((id) => !isPlaced(id)).map((id) => {
    rest[id] = entry.prev[id];
    return moveTo(id, rest[id], 0.9);
  }));
}

async function prepareStep(i) {
  const step = product.steps[i];
  if (!step || step.type || staged.some((s) => s.step === i && s.kind === 'prep')) return;
  const groups = new Map();
  for (const id of step.parts) {
    const p = partById(id);
    if (!p.parent || isPlaced(p.parent) || rest[p.parent] !== pile[p.parent]) continue;
    if (!groups.has(p.parent)) groups.set(p.parent, []);
    groups.get(p.parent).push(p);
  }
  if (!groups.size) return;
  await setOut(i, 'prep', [...groups].map(([id, kids]) => ({ id, quat: stagingQuat(id, kids) })));
}

const unprepareStep = (i) => unstage(i, 'prep');

// The orientation a `turn` step gives a set-out part: a named pose, or a face turned up.
function turnedQuat(id, pose, up) {
  if (up) return faceUp(id, up);
  const final = assembledQuat(partById(id));
  if (pose === 'upright') return final;
  if (pose === 'upsideDown') return new Q().setFromAxisAngle(Z_AXIS, Math.PI).multiply(final);
  return longwise(id, new Q().setFromAxisAngle(X_AXIS, Math.PI).multiply(rest[id].quat)); // 'over'
}

// Parts fitted to something on the floor can reach below it (legs on a side panel lying flat),
// and taking them off can leave it floating: settle each such piece back onto the floor.
function reseat(list) {
  const roots = new Set();
  for (const p of list) {
    let o = holderOf(p);
    while (o.parent && o.parent !== scene) o = o.parent;
    if (o !== assembly && o.userData.partId) roots.add(o.userData.partId);
  }
  return Promise.all([...roots].map((id) => {
    const o = objects[id];
    const dy = 0.02 - new THREE.Box3().setFromObject(o).min.y;
    if (Math.abs(dy) < 0.05) return null;
    if (rest[id] === pile[id]) rest[id] = { pos: pile[id].pos.clone(), quat: pile[id].quat };
    rest[id].pos.y += dy;
    const y0 = o.position.y;
    return tween(0.35, (k) => (o.position.y = y0 + dy * ease(k)));
  }));
}

// Hand the part to its holder and snap it to its exact pose there.
function settle(p) {
  const o = objects[p.id];
  holderOf(p).add(o);
  holderMatrix(p).decompose(o.position, o.quaternion, o.scale);
}

async function animatePart(step, p, t, forward) {
  const o = objects[p.id];
  const s = rest[p.id];
  if (!forward) scene.attach(o);
  const appr = t.pos.clone().add(approachOffset(step, p, t));
  const lift = p.shape === 'board' ? 22 : 10;
  const dirAxis = p.dir ? canonicalAxis(p).clone().applyQuaternion(t.quat) : null;
  const turns = (step.spin || 0) * Math.PI * 2;
  const insertEase = step.tool === 'Hammer' ? tapEase : ease;
  const _q = new Q();

  const travel = (k) => {
    const e = ease(k);
    o.position.lerpVectors(s.pos, appr, e);
    o.position.y += Math.sin(Math.PI * e) * lift;
    o.quaternion.slerpQuaternions(s.quat, t.quat, e);
  };
  const insert = (k) => {
    const e = insertEase(k);
    o.position.lerpVectors(appr, t.pos, e);
    o.quaternion.copy(t.quat);
    if (turns && dirAxis) o.quaternion.premultiply(_q.setFromAxisAngle(dirAxis, turns * (1 - e)));
  };
  const travelTime = p.shape === 'board' ? 1.1 : 0.8;
  const insertTime = step.spin ? 1.1 : step.tool === 'Hammer' ? 0.9 : 0.6;
  if (forward) {
    await tween(travelTime, travel);
    await tween(insertTime, insert);
  } else {
    await tween(insertTime * 0.6, (k) => insert(1 - k));
    await tween(travelTime * 0.8, (k) => travel(1 - k));
  }
}

// Turn the whole assembly (over, onto its side, upright), lifting it clear of the floor on the
// way round and setting it down on whatever is now its bottom.
async function flipAssembly(i, step, forward) {
  const angle = THREE.MathUtils.degToRad(step.angle ?? 180) * (forward ? 1 : -1);
  const axis = step.axis === 'z' ? Z_AXIS : X_AXIS;
  const q0 = assembly.quaternion.clone();
  const q1 = new Q().setFromAxisAngle(axis, angle).multiply(q0);
  const y0 = assembly.position.y;
  const y1 = restY(q1, forward ? nextFlip(i + 1) : i);
  const lift = step.lift ?? 30;
  const _q = new Q();
  await tween(1.8, (k) => {
    const e = ease(k);
    assembly.quaternion.copy(q0).premultiply(_q.setFromAxisAngle(axis, angle * e));
    assembly.position.y = y0 + (y1 - y0) * e + Math.sin(Math.PI * e) * lift;
  });
  assembly.quaternion.copy(q1);
  assembly.position.y = y1;
}

async function playStep(i, forward) {
  const step = product.steps[i];
  if (step.type === 'flip') return flipAssembly(i, step, forward);
  if (step.type === 'turn') {
    if (forward) return setOut(i, 'turn', step.turn.map((id) => ({ id, quat: turnedQuat(id, step.pose, step.up) })));
    return unstage(i, 'turn');
  }
  const list = step.parts.map(partById);
  // `lower`: lift what's built so far, bring the new part in underneath, then lower onto it.
  const lowerBy = step.lower || 0;
  const base = assembly.position.y;
  const raise = (k) => (assembly.position.y = base + lowerBy * k);
  const targets = list.map(targetPose); // measured with the assembly at rest
  if (forward) {
    if (lowerBy) await tween(0.6, (k) => raise(ease(k)));
    await Promise.all(list.map((p, n) => wait(n * 0.07).then(() => animatePart(step, p, targets[n], true))));
    if (lowerBy) await tween(0.9, (k) => raise(1 - ease(k)));
    list.forEach(settle);
    await reseat(list);
  } else {
    list.forEach((p) => scene.attach(objects[p.id]));
    if (lowerBy) await tween(0.6, (k) => raise(ease(k)));
    await Promise.all(list.map((p, n) => wait(n * 0.05).then(() => animatePart(step, p, targets[n], false))));
    if (lowerBy) await tween(0.6, (k) => raise(1 - ease(k)));
    await reseat(list);
  }
}

function clearGhosts() {
  for (const g of ghosts) g.removeFromParent();
  ghosts = [];
  markers = [];
}

// A soft ring on the spot where each piece of hardware goes in.
const markerMat = new THREE.MeshBasicMaterial({
  color: 0xff6a1a, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide,
  polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
});
let markers = [];

function showGhosts() {
  clearGhosts();
  const step = product.steps[done];
  if (!step || step.type) return;
  for (const id of step.parts) {
    const p = partById(id);
    const g = new THREE.Group();
    objects[id].traverse((o) => {
      if (!o.isMesh || o.userData.part !== id) return; // the part itself, not hardware already fitted to it
      const m = new THREE.Mesh(o.geometry, ghostMat);
      m.position.copy(o.position);
      m.quaternion.copy(o.quaternion);
      m.renderOrder = 10;
      m.raycast = () => {};
      g.add(m);
    });
    if (p.shape !== 'board') {
      const inner = Math.max(0.55, p.radius * 1.5);
      const ring = new THREE.Mesh(new THREE.RingGeometry(inner, inner + Math.max(0.35, p.radius * 0.7), 40), markerMat);
      ring.rotation.x = -Math.PI / 2; // face along the part's axis
      // Sit just outside the surface, on the side the part comes in from.
      const inward = p.shape === 'screw' || p.shape === 'nail' ? -1 : 1;
      ring.position.y = -inward * 0.06;
      ring.renderOrder = 11;
      ring.raycast = () => {};
      g.add(ring);
      markers.push(ring);
    }
    holderOf(p).add(g);
    holderMatrix(p).decompose(g.position, g.quaternion, g.scale);
    ghosts.push(g);
  }
}

// ---------- camera ----------
function viewDir(azimuthDeg, elevationDeg = 24) {
  const a = THREE.MathUtils.degToRad(azimuthDeg);
  const e = THREE.MathUtils.degToRad(elevationDeg);
  return new V3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
}

function animateCamera(pos, target, duration) {
  const p0 = camera.position.clone();
  const t0 = controls.target.clone();
  return tween(duration, (k) => {
    const e = ease(k);
    camera.position.lerpVectors(p0, pos, e);
    controls.target.lerpVectors(t0, target, e);
  });
}

function fit(box, azimuth, duration = 1, minRadius = 22) {
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const vf = THREE.MathUtils.degToRad(camera.fov) / 2;
  const hf = Math.atan(Math.tan(vf) * camera.aspect);
  const dist = (Math.max(minRadius, sphere.radius) / Math.sin(Math.min(vf, hf))) * 1.02;
  return animateCamera(sphere.center.clone().addScaledVector(viewDir(azimuth), dist), sphere.center, duration);
}

function stepBox(i) {
  const step = product.steps[i];
  const box = new THREE.Box3();
  for (const id of step.parts) {
    const p = partById(id);
    const t = targetPose(p);
    const ext = partExtent(p).applyQuaternion(t.quat);
    ext.set(Math.abs(ext.x), Math.abs(ext.y), Math.abs(ext.z)).multiplyScalar(0.5);
    box.expandByPoint(t.pos.clone().sub(ext)).expandByPoint(t.pos.clone().add(ext));
    box.expandByPoint(t.pos.clone().add(approachOffset(step, p, t)));
  }
  return box;
}

let assembledBox = new THREE.Box3();
function overviewBox() {
  return assembledBox.clone().union(pileBox);
}

// Steps that add a board show the whole piece so far; hardware steps zoom in on the joints.
function frameCurrent(duration = 1) {
  const step = product.steps[done];
  if (!step) return fit(assembledBox, 30, duration);
  if (step.type === 'flip') {
    const box = new THREE.Box3().setFromObject(assembly);
    box.max.y += step.lift ?? 30;
    return fit(box, step.view ?? 30, duration);
  }
  if (step.type === 'turn') {
    const box = new THREE.Box3();
    for (const id of step.turn) box.union(new THREE.Box3().setFromObject(objects[id]));
    box.max.y += 20;
    return fit(box, step.view ?? 30, duration);
  }
  const box = stepBox(done);
  // Hardware fitted to a part that's been set out: show the whole part, not just the joints.
  for (const id of step.parts) {
    const parent = partById(id).parent;
    if (parent && !isPlaced(parent)) box.union(new THREE.Box3().setFromObject(objects[parent]));
    // A part that was set out earlier is picked up from there, so keep it in view too.
    if (!isPlaced(id) && rest[id] !== pile[id]) box.union(new THREE.Box3().setFromObject(objects[id]));
  }
  const addsBoard = step.parts.some((id) => partById(id).shape === 'board');
  if (addsBoard && assembly.children.length) box.union(new THREE.Box3().setFromObject(assembly));
  if (step.lower) box.max.y += step.lower;
  return fit(box, step.view ?? 30, duration);
}

// ---------- step control ----------
async function next() {
  if (busy || done >= product.steps.length) return;
  dismissTip();
  busy = true;
  clearGhosts();
  render();
  await playStep(done, true);
  done++;
  await prepareStep(done);
  busy = false;
  showGhosts();
  render();
  frameCurrent(0.9);
}

async function back() {
  if (busy || done === 0) return;
  busy = true;
  clearGhosts();
  render();
  await unprepareStep(done); // leaving this step: anything it set out goes back to the pile
  done--;
  render();
  frameCurrent(0.7);
  await playStep(done, false);
  busy = false;
  showGhosts();
  render();
}

async function jumpTo(target) {
  if (busy || target === done) return;
  speed = 0.35;
  instant = Math.abs(target - done) > 2;
  try {
    while (done < target) await next();
    while (done > target) await back();
  } finally {
    instant = false;
    speed = 1;
  }
  frameCurrent(0.8);
}

// Replay the step just done: undo it quickly, then play it again at normal speed.
async function replay() {
  if (busy || done === 0) return;
  speed = 0.35;
  await back();
  speed = 1;
  await next();
}

let autoplay = false;
async function playAll() {
  autoplay = true;
  render();
  while (autoplay && done < product.steps.length) {
    await next();
    await wait(0.5);
  }
  autoplay = false;
  render();
}

function restart() {
  autoplay = false;
  jumpTo(0).then(() => fit(overviewBox(), 30, 1));
}

// ---------- UI ----------
const TOOL_ICON = {
  Hands: '<path d="M7 11V5.5a1.5 1.5 0 0 1 3 0V10m0-4.5v-1a1.5 1.5 0 0 1 3 0V10m0-4a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6h-.5A5.5 5.5 0 0 1 4 12.6L3.2 9.8a1.4 1.4 0 0 1 2.5-1.2L7 11" />',
  Hammer: '<path d="M13 7l4 4M4 20l9-9M11 5l3-3 6 6-3 3z" />',
  Screwdriver: '<path d="M4 20l6-6M10 14l2 2 7-7-2-2zM15 5l4 4" />',
  Wrench: '<path d="M14.5 5.5a4 4 0 0 0 4.9 4.9L10 19.8a1.8 1.8 0 0 1-2.6 0l-3.2-3.2a1.8 1.8 0 0 1 0-2.6l9.4-9.4a4 4 0 0 0 .9.9z" />',
};
const icon = (tool) => `<svg viewBox="0 0 24 24" aria-hidden="true">${TOOL_ICON[tool] || TOOL_ICON.Hands}</svg>`;

function needs(step) {
  const counts = new Map();
  for (const id of step.parts) {
    const p = product.parts.find((q) => q.id === id);
    const k = `${p.label || ''}|${p.name}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts].map(([k, n]) => {
    const [label, name] = k.split('|');
    return `<li>${label ? `<span class="letter">${label}</span>` : ''}${n} × ${name}</li>`;
  }).join('');
}

function speedControl() {
  const opt = (v, label) => `<button type="button" data-speed="${v}" aria-pressed="${playback === v}">${label}</button>`;
  return `<div class="speed" role="group" aria-label="Playback speed"><span>Speed</span>${opt(1, '1×')}${opt(0.5, '½×')}${opt(0.25, '¼×')}</div>`;
}

// A small prompt in the 3D view after each step, so you don't have to look at the panel.
function renderPrompt() {
  const el = $('nextPrompt');
  const step = product.steps[done];
  const show = done > 0 && step && !busy && !autoplay;
  el.hidden = !show;
  if (show) $('nextTitle').textContent = step.title;
  $('firstTip').hidden = !(done === 0 && !busy && !tipSeen);
}

function render() {
  renderInfo();
  renderPrompt();
  const total = product.steps.length;
  const card = $('card');
  // One segment per step reads well up to a few dozen steps; past that, one continuous bar.
  const bar = total > 30
    ? `<span class="done" style="flex: ${done}"></span><span class="now" style="flex: ${done < total ? 1 : 0}"></span><span style="flex: ${Math.max(0, total - done - 1)}"></span>`
    : product.steps.map((s, n) => `<span class="${n < done ? 'done' : n === done ? 'now' : ''}"></span>`).join('');
  if (done >= total) {
    card.innerHTML = `
      <p class="eyebrow">Complete</p>
      <div class="steps-bar${total > 30 ? ' long' : ''}">${bar}</div>
      <h2>Built.</h2>
      <p>${product.parts.length} parts, ${total} steps. Drag to look it over from every side.</p>
      <div class="actions">
        <button type="button" class="btn" data-act="back" ${busy ? 'disabled' : ''}>Back a step</button>
        <button type="button" class="btn primary" data-act="restart" ${busy ? 'disabled' : ''}>Start over</button>
      </div>`;
  } else {
    const step = product.steps[done];
    card.innerHTML = `
      <p class="eyebrow">Step ${done + 1} of ${total}${step.manual ? ` · Manual step ${step.manual}` : ''}</p>
      <div class="steps-bar${total > 30 ? ' long' : ''}">${bar}</div>
      <h2>${step.title}</h2>
      <p>${step.text}</p>
      <div class="needs">
        <span class="tool">${icon(step.tool)}${step.tool || 'Hands'}</span>
        ${step.parts.length ? `<ul>${needs(step)}</ul>` : ''}
      </div>
      <div class="actions">
        <button type="button" class="btn" data-act="back" ${busy || done === 0 ? 'disabled' : ''}>Back</button>
        <button type="button" class="btn primary" data-act="next" ${busy ? 'disabled' : ''}>Do this step</button>
        <button type="button" class="btn ghost" data-act="${autoplay ? 'stop' : 'play'}" ${busy && !autoplay ? 'disabled' : ''}>${autoplay ? 'Pause' : 'Play all'}</button>
      </div>
      ${step.type ? '' : '<p class="reason">The blue outline shows where the parts go.</p>'}
      ${speedControl()}`;
  }
  $('stepList').innerHTML = product.steps.map((s, n) =>
    `<li><button type="button" class="step-row ${n < done ? 'done' : n === done ? 'now' : ''}" data-step="${n}" ${busy ? 'disabled' : ''}>
      <span class="num">${n + 1}</span><span class="t">${s.title}</span></button></li>`).join('');
}

$('card').addEventListener('click', (e) => {
  const sp = e.target.closest('[data-speed]')?.dataset.speed;
  if (sp) {
    playback = Number(sp);
    try { localStorage.setItem('guide:playback', sp); } catch { /* storage is optional */ }
    render();
    return;
  }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'next') next();
  if (act === 'back') back();
  if (act === 'restart') restart();
  if (act === 'play') playAll();
  if (act === 'stop') {
    autoplay = false;
    render();
  }
});
$('stepList').addEventListener('click', (e) => {
  const n = e.target.closest('[data-step]')?.dataset.step;
  if (n === undefined) return;
  // Tapping the step you just did plays it again; any other step jumps there.
  if (Number(n) === done - 1) replay();
  else jumpTo(Number(n));
});
$('nextBtn').addEventListener('click', () => next());
$('replayBtn').addEventListener('click', () => replay());

// 5. One-time tip for first-time visitors.
let tipSeen = false;
try { tipSeen = localStorage.getItem('guide:tipSeen') === '1'; } catch { /* storage is optional */ }
function dismissTip() {
  if (tipSeen) return;
  tipSeen = true;
  try { localStorage.setItem('guide:tipSeen', '1'); } catch { /* storage is optional */ }
  $('firstTip').hidden = true;
}
$('firstTip').addEventListener('click', dismissTip);

// 3. Swipe the step card left or right on touch screens. (Swiping the 3D view turns the camera.)
let swipe = null;
$('card').addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  swipe = { x: t.clientX, y: t.clientY };
}, { passive: true });
$('card').addEventListener('touchend', (e) => {
  if (!swipe) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - swipe.x;
  const dy = t.clientY - swipe.y;
  swipe = null;
  if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
  if (dx < 0) next();
  else back();
});
$('resetViewBtn').addEventListener('click', () => frameCurrent(0.8));
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') next();
  if (e.key === 'ArrowLeft') back();
});

// Labels show which pile parts the current step needs.
const labelEls = {};
const _p = new V3();
function updateLabels() {
  const step = busy ? null : product.steps[done];
  const wanted = new Set(step ? step.parts : []);
  const shown = new Set();
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  for (const id of Object.keys(labelEls)) labelEls[id].hidden = true;
  if (!step) return;
  for (const id of wanted) {
    const p = product.parts.find((q) => q.id === id);
    const key = p.label || p.id; // one label per kind of hardware; every unlabelled board gets its own
    if (shown.has(key) || id === picked) continue; // the info card already names a tapped part
    shown.add(key);
    let el = labelEls[key];
    if (!el) {
      el = document.createElement('span');
      el.className = 'part-label';
      $('labels').append(el);
      labelEls[key] = el;
    }
    el.textContent = p.label ? `${p.label} · ${p.name}` : p.name;
    _p.copy(objects[id].position);
    _p.y += 3;
    _p.project(camera);
    if (_p.z > 1) continue;
    el.hidden = false;
    el.style.transform = `translate(${(_p.x * 0.5 + 0.5) * w}px, ${(-_p.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
  }
}

// ---------- tap a part to see what it is ----------
const coarsePointer = matchMedia('(pointer: coarse)').matches;
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const _c = new V3();
let picked = null;
const stepOf = {}; // part id -> index of the step that fits it

function screenPoint(id, rect) {
  new THREE.Box3().setFromObject(objects[id]).getCenter(_c).project(camera);
  return { x: (_c.x * 0.5 + 0.5) * rect.width, y: (-_c.y * 0.5 + 0.5) * rect.height, behind: _c.z > 1 };
}

function pick(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  ndc.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(Object.values(objects), true).find((h) => h.object.userData.part);
  const hitId = hit?.object.userData.part ?? null;
  if (hitId && partById(hitId).shape !== 'board') return hitId;
  // Hardware is tiny, so a near miss still counts, and it wins over the board behind it.
  let best = null;
  let bestD = coarsePointer ? 30 : 16;
  for (const p of product.parts) {
    if (p.shape === 'board') continue;
    const sp = screenPoint(p.id, rect);
    const d = Math.hypot(sp.x - x, sp.y - y);
    if (!sp.behind && d < bestD) {
      bestD = d;
      best = p.id;
    }
  }
  return best || hitId;
}

function partStatus(id) {
  const n = stepOf[id];
  if (n < done) return `Fitted in step ${n + 1}`;
  if (n === done) return 'Needed for this step';
  if (!isPlaced(id) && rest[id] !== pile[id]) return `Set out, waiting for step ${n + 1}`;
  if (isPlaced(id)) return `Fitted to the ${partById(partById(id).parent).name.toLowerCase()}`;
  return 'Still in the box';
}

// A small line drawing of the finished product with one part filled in, like a manual's
// parts diagram. Drawn once per part into an image and cached.
const DIAGRAM_W = 460;
const DIAGRAM_H = 260;
const diagramCache = {};
let diagramTarget = null;

function diagramFor(id) {
  if (diagramCache[id]) return diagramCache[id];
  const pickedPart = partById(id);
  const focus = pickedPart.shape === 'board' ? id : pickedPart.parent; // hardware: show the board it goes into
  let shot = drawDiagram(product.parts, pickedPart, focus);
  // A part hidden inside the finished product (a drawer side) is drawn with just the piece it
  // belongs to (the drawer), so the highlight can be seen.
  const root = rootOf(id);
  if (focus && root !== focus && shot.warm < DIAGRAM_W * DIAGRAM_H * 0.004) {
    shot = drawDiagram(product.parts.filter((p) => rootOf(p.id) === root), pickedPart, focus);
  }
  return (diagramCache[id] = shot.url);
}

function drawDiagram(list, pickedPart, focus) {
  const cs = getComputedStyle(document.documentElement);
  const accent = new THREE.Color(cs.getPropertyValue('--accent').trim() || '#d9531c');
  const ink = new THREE.Color(cs.getPropertyValue('--ink-soft').trim() || '#5a636e');
  const paper = new THREE.Color(cs.getPropertyValue('--bg').trim() || '#eceff2');
  const mini = new THREE.Scene();
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-1, 2, 1.5);
  mini.add(new THREE.AmbientLight(0xffffff, 1.6), sun);
  const offset = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
  const plain = new THREE.MeshLambertMaterial({ color: paper.clone().lerp(new THREE.Color(0xffffff), 0.6), ...offset });
  const lit = new THREE.MeshLambertMaterial({ color: accent, ...offset });
  const line = new THREE.LineBasicMaterial({ color: ink });
  const geos = [];
  const box = new THREE.Box3();
  for (const p of list) {
    if (p.shape !== 'board') continue;
    const geo = new THREE.BoxGeometry(...p.size);
    const edges = new THREE.EdgesGeometry(geo);
    geos.push(geo, edges);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, p.id === focus ? lit : plain), new THREE.LineSegments(edges, line));
    finalM[p.id].decompose(g.position, g.quaternion, g.scale);
    mini.add(g);
    box.expandByObject(g);
  }
  if (pickedPart.shape !== 'board') {
    // Mark the spot where this piece of hardware goes.
    const r = Math.max(1.2, box.getSize(new V3()).length() / 32);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 12), new THREE.MeshBasicMaterial({ color: 0x15181c, depthTest: false, transparent: true, opacity: 0.85 }));
    dot.renderOrder = 5;
    dot.position.set(...pickedPart.pos);
    geos.push(dot.geometry);
    mini.add(dot);
  }
  const cam = new THREE.PerspectiveCamera(30, DIAGRAM_W / DIAGRAM_H, 1, 5000);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const vf = THREE.MathUtils.degToRad(15);
  const hf = Math.atan(Math.tan(vf) * cam.aspect);
  cam.position.copy(sphere.center).addScaledVector(viewDir(32, 26), (sphere.radius / Math.sin(Math.min(vf, hf))) * 0.74);
  cam.lookAt(sphere.center);
  diagramTarget ||= new THREE.WebGLRenderTarget(DIAGRAM_W, DIAGRAM_H, { samples: 4 });
  const prevTarget = renderer.getRenderTarget();
  const prevTone = renderer.toneMapping;
  const clear = new THREE.Color();
  renderer.getClearColor(clear);
  const clearAlpha = renderer.getClearAlpha();
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setRenderTarget(diagramTarget);
  renderer.setClearColor(paper, 1);
  renderer.clear();
  renderer.render(mini, cam);
  const px = new Uint8Array(DIAGRAM_W * DIAGRAM_H * 4);
  renderer.readRenderTargetPixels(diagramTarget, 0, 0, DIAGRAM_W, DIAGRAM_H, px);
  renderer.setRenderTarget(prevTarget);
  renderer.toneMapping = prevTone;
  renderer.setClearColor(clear, clearAlpha);
  for (const g of geos) g.dispose();
  // How much of the highlight made it into the picture: the accent is the only warm colour in it.
  let warm = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i] - px[i + 2] > 60) warm++;
  // Render targets come out upside down and in linear colour; flip and convert for the <img>.
  const c = document.createElement('canvas');
  c.width = DIAGRAM_W;
  c.height = DIAGRAM_H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(DIAGRAM_W, DIAGRAM_H);
  const toSrgb = (v) => {
    const l = v / 255;
    return Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055));
  };
  for (let y = 0; y < DIAGRAM_H; y++) {
    for (let x = 0; x < DIAGRAM_W * 4; x += 4) {
      const src = (DIAGRAM_H - 1 - y) * DIAGRAM_W * 4 + x;
      const dst = y * DIAGRAM_W * 4 + x;
      img.data[dst] = toSrgb(px[src]);
      img.data[dst + 1] = toSrgb(px[src + 1]);
      img.data[dst + 2] = toSrgb(px[src + 2]);
      img.data[dst + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { url: c.toDataURL(), warm };
}

const round = (n) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);

function partDetails(p) {
  const rows = [];
  if (p.shape === 'board') {
    const [a, b, c] = [...p.size].sort((m, n) => n - m);
    rows.push(['Size', `about ${round(a)} × ${round(b)} × ${round(c)} cm`]);
    const fitted = new Map();
    for (const q of product.parts) {
      if (q.parent !== p.id) continue;
      const k = `${q.label ? `${q.label} ` : ''}${q.name}`;
      fitted.set(k, (fitted.get(k) || 0) + 1);
    }
    if (fitted.size) rows.push(['Fitted to it', [...fitted].map(([k, n]) => `${n} × ${k}`).join(', ')]);
  } else {
    rows.push(['Size', `about ${round(p.length)} cm long`]);
    if (p.parent) rows.push(['Goes into', `the ${partById(p.parent).name.toLowerCase()}`]);
  }
  return rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
}

function renderInfo() {
  const el = $('partInfo');
  if (!picked) {
    el.hidden = true;
    return;
  }
  const p = partById(picked);
  const n = stepOf[picked];
  const same = product.parts.filter((q) => q.name === p.name && (q.label || '') === (p.label || '')).length;
  const hasDiagram = p.shape === 'board' || p.parent;
  el.innerHTML = `
    <button type="button" class="close" data-info="close" aria-label="Close">×</button>
    <p class="info-name">${p.label ? `<span class="letter">${p.label}</span>` : ''}${p.name}</p>
    <p class="info-meta">${same > 1 ? `1 of ${same} · ` : ''}${partStatus(picked)}</p>
    ${hasDiagram ? `<img class="info-diagram" src="${diagramFor(picked)}" width="${DIAGRAM_W / 2}" height="${DIAGRAM_H / 2}" alt="Where the ${p.name.toLowerCase()} goes in the finished ${product.name.toLowerCase()}, highlighted">` : ''}
    <dl class="info-details">${partDetails(p)}</dl>
    <p class="info-step">Used in step ${n + 1}: ${product.steps[n].title}</p>
    ${n !== done ? `<button type="button" class="btn small" data-info="go" ${busy ? 'disabled' : ''}>Go to step ${n + 1}</button>` : ''}`;
  el.hidden = false;
  placeInfo();
}

// Keep the card beside the part as the camera moves, inside the viewport.
function placeInfo() {
  if (!picked) return;
  const el = $('partInfo');
  const rect = canvas.getBoundingClientRect();
  const sp = screenPoint(picked, rect);
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let x = sp.x + 16;
  if (x + w > rect.width - 10) x = sp.x - w - 16;
  x = Math.max(10, Math.min(x, rect.width - w - 10));
  const y = Math.max(10, Math.min(sp.y - h / 2, rect.height - h - 10));
  el.style.transform = `translate(${x}px, ${y}px)`;
}

// An accent rim around the tapped part: a slightly larger copy drawn from the inside, so only
// its edge shows. Thicker and easier to see than 1px lines.
const outlineMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a, side: THREE.BackSide });
let outline = [];

function selectPart(id) {
  for (const l of outline) l.removeFromParent();
  outline = [];
  picked = id;
  if (id) {
    outlineMat.color.set(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d9531c');
    objects[id].traverse((m) => {
      if (!m.isMesh || m.userData.part !== id) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const size = m.geometry.boundingBox.getSize(new V3());
      const rim = partById(id).shape === 'board' ? 0.5 : 0.18; // cm of rim on each side
      const l = new THREE.Mesh(m.geometry, outlineMat);
      l.scale.set(1 + (2 * rim) / Math.max(size.x, 0.01), 1 + (2 * rim) / Math.max(size.y, 0.01), 1 + (2 * rim) / Math.max(size.z, 0.01));
      l.raycast = () => {};
      outline.push([m, l]);
    });
    outline = outline.map(([m, l]) => (m.add(l), l));
  }
  renderInfo();
}

let down = null;
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, t: performance.now() };
});
canvas.addEventListener('pointerup', (e) => {
  if (!down || !product) return;
  const tap = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && performance.now() - down.t < 500;
  down = null;
  if (tap) selectPart(pick(e.clientX, e.clientY));
});
let lastHover = 0;
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || e.buttons || !product) return;
  if (performance.now() - lastHover < 120) return;
  lastHover = performance.now();
  canvas.style.cursor = pick(e.clientX, e.clientY) ? 'pointer' : '';
});
$('partInfo').addEventListener('click', (e) => {
  const act = e.target.closest('[data-info]')?.dataset.info;
  if (act === 'close') selectPart(null);
  if (act === 'go') jumpTo(stepOf[picked]);
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') selectPart(null);
});

// Gentle pulse on the parts waiting in the pile for this step.
const PULSE = new THREE.Color(0x5c2a0a);
function updatePulse(t) {
  const step = busy ? null : product.steps[done];
  const wanted = new Set(step ? step.parts : []);
  const k = 0.5 + 0.5 * Math.sin(t * 4);
  for (const [id, o] of Object.entries(objects)) {
    o.traverse((m) => {
      if (!m.isMesh || m.userData.part !== id || !m.material.emissive) return;
      m.material.emissive.copy(PULSE).multiplyScalar(wanted.has(id) && id !== picked ? 0.4 + 0.6 * k : 0);
    });
  }
  ghostMat.opacity = 0.2 + 0.2 * k;
  markerMat.opacity = 0.45 + 0.45 * k;
  for (const m of markers) m.scale.setScalar(1 + 0.18 * k);
}

// ---------- theme, sizing, loop ----------
function applyTheme() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--scene').trim() || '#dfe3e8';
  scene.background = new THREE.Color(bg);
  scene.fog = new THREE.Fog(bg, 1400, 4000);
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
applyTheme();

function resize() {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport);

async function start() {
  try {
    const res = await fetch(PRODUCT_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    product = await res.json();
  } catch (err) {
    $('loading').textContent = `Couldn't load the product file (${PRODUCT_URL}). ${err.message}`;
    return;
  }
  $('productName').textContent = product.name;
  $('productSpec').textContent = product.spec;
  $('partCount').textContent = `${product.parts.length} parts · ${product.steps.length} steps`;
  if (product.source?.url) {
    // The manual this guide was built from, linked rather than copied.
    const link = document.createElement('a');
    link.href = product.source.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = `Based on: ${product.source.label || 'the original manual'} ↗`;
    $('productSource').replaceChildren(link);
    $('productSource').hidden = false;
  }

  product.steps.forEach((st, n) => st.parts.forEach((id) => (stepOf[id] = n)));
  for (const p of product.parts) {
    const q = assembledQuat(p);
    finalM[p.id] = new THREE.Matrix4().compose(new V3(...p.pos), q, new V3(1, 1, 1));
    const ext = absV(partExtent(p).applyQuaternion(q)).multiplyScalar(0.5);
    assembledBox.expandByPoint(new V3(...p.pos).sub(ext)).expandByPoint(new V3(...p.pos).add(ext));
  }
  // Leave room for the build in any orientation it's turned to: lying down, it's wider.
  const half = assembledBox.getSize(new V3()).multiplyScalar(0.5);
  const reach = Math.max(half.x, half.y, half.z);
  PILE_X = reach + 30;
  STAGE_Z = reach + 14;
  STAGE_W = Math.max(120, 2 * (PILE_X - 14));

  const poses = layOut(product.parts);
  for (const p of product.parts) {
    const o = buildPart(p);
    objects[p.id] = o;
    o.userData.partId = p.id;
    pile[p.id] = poses[p.id];
    rest[p.id] = pile[p.id];
    o.position.copy(pile[p.id].pos);
    o.quaternion.copy(pile[p.id].quat);
    scene.add(o);
  }
  // The assembly turns about its own middle and always rests on the floor.
  assembledBox.getCenter(pivot);
  const startQ = product.startPose ? turnQ(product.startPose.axis, product.startPose.angle ?? 180)
    : product.startFlipped ? turnQ(product.startFlipped, 180) : new Q();
  assembly.quaternion.copy(startQ);
  assembly.position.set(pivot.x, restY(startQ, nextFlip(0)), pivot.z);
  const toLocal = new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z);
  for (const p of product.parts) {
    localM[p.id] = toLocal.clone().multiply(finalM[p.id]);
    if (p.parent) relM[p.id] = finalM[p.parent].clone().invert().multiply(finalM[p.id]);
  }
  scene.add(buildTray());
  drillHoles();

  resize();
  const box = overviewBox();
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).addScaledVector(viewDir(30), sphere.radius * 3);
  fit(box, 30, reduceMotion ? 0.01 : 1.4);
  busy = true;
  render();

  const clock = new THREE.Clock();
  let first = true;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    stepTweens(dt);
    controls.update();
    updatePulse(clock.elapsedTime);
    updateLabels();
    placeInfo();
    renderer.render(scene, camera);
    if (first) {
      first = false;
      $('loading').hidden = true;
      window.__guideReady = true;
    }
  });

  // After the opening shot, set out whatever the first step works on.
  await wait(1.4);
  await prepareStep(0);
  busy = false;
  showGhosts();
  render();
  if (staged.length) frameCurrent(1);
}

start();

// Handy for debugging and automated checks.
window.guide = { next, back, jumpTo, playAll, replay, selectPart, screenPointOf: (id) => screenPoint(id, canvas.getBoundingClientRect()), isBusy: () => busy, done: () => done, camera, controls, objects };
