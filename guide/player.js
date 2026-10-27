// A general assembly-guide player. It knows nothing about bookshelves: it reads a product
// file (parts with sizes and final positions, plus ordered steps) and builds the 3D scene,
// the parts pile, and the step-by-step animation from that alone.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
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

const camera = new THREE.PerspectiveCamera(35, 1, 2, 2000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = THREE.MathUtils.degToRad(86);
controls.minDistance = 20;
controls.maxDistance = 600;
controls.screenSpacePanning = true;

const key = new THREE.DirectionalLight(0xfff3e6, 2.2);
key.position.set(-120, 220, 160);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -170, right: 170, top: 170, bottom: -170, near: 10, far: 600 });
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
  floorTex.repeat.set(5, 5); // each tile is about 1.8 m of floorboards
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
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
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(900, 300), new THREE.MeshStandardMaterial({ color: 0xe9e6e1, roughness: 0.95 }));
  wall.position.set(0, 150, -90);
  wall.receiveShadow = true;
  scene.add(floor, rug, wall);
}

// ---------- materials ----------
function makeMaterials() {
  return {
    birch: new THREE.MeshStandardMaterial({ map: birchTexture(), roughness: 0.6 }),
    hardboard: new THREE.MeshStandardMaterial({ color: 0x8c6a48, roughness: 0.92 }),
    dowel: new THREE.MeshStandardMaterial({ color: 0xe0c08a, roughness: 0.7 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc9cdd2, metalness: 1, roughness: 0.3 }),
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

// ---------- the parts pile: generated, not authored ----------
// Boards lie flat, long edge front-to-back, stacked largest first. Hardware sits in a tray,
// one row per kind of part.
const PILE_X = 92;
const TRAY = { x: 44, z: 40, w: 30, d: 22 }; // depth grows with the number of hardware kinds

function layOut(parts) {
  const poses = {};
  const boards = parts.filter((p) => p.shape === 'board');
  boards.sort((a, b) => {
    const area = (p) => { const s = [...p.size].sort((m, n) => n - m); return s[0] * s[1]; };
    return area(b) - area(a);
  });
  let height = 0;
  for (const p of boards) {
    const size = new V3(...p.size);
    const dims = ['x', 'y', 'z'];
    const smallest = dims.reduce((m, d) => (size[d] < size[m] ? d : m), 'x');
    let q = new Q();
    if (smallest === 'x') q.setFromAxisAngle(new V3(0, 0, 1), Math.PI / 2);
    if (smallest === 'z') q.setFromAxisAngle(new V3(1, 0, 0), Math.PI / 2);
    let ext = size.clone().applyQuaternion(q);
    ext.set(Math.abs(ext.x), Math.abs(ext.y), Math.abs(ext.z));
    if (ext.x > ext.z) {
      q = new Q().setFromAxisAngle(UP, Math.PI / 2).multiply(q);
      ext = new V3(ext.z, ext.y, ext.x);
    }
    poses[p.id] = { pos: new V3(PILE_X, height + ext.y / 2 + 0.02, 4), quat: q };
    height += ext.y + 0.05;
  }

  const groups = new Map();
  for (const p of parts) {
    if (p.shape === 'board') continue;
    if (!groups.has(p.name)) groups.set(p.name, []);
    groups.get(p.name).push(p);
  }
  const lying = new Q().setFromAxisAngle(new V3(0, 0, 1), -Math.PI / 2); // local Y → +X
  let row = 0;
  const rows = groups.size;
  TRAY.d = Math.max(22, rows * 4);
  for (const [, list] of groups) {
    const z = TRAY.z - TRAY.d / 2 + (TRAY.d / (rows + 1)) * (row + 1);
    list.forEach((p, i) => {
      const span = TRAY.w - 6;
      const x = TRAY.x - span / 2 + (list.length === 1 ? span / 2 : (span / (list.length - 1)) * i);
      const r = p.shape === 'screw' || p.shape === 'nail' ? p.radius * 2.6 : p.radius;
      const pos = new V3(x, 0.9 + r, z);
      // Headed parts are built from the head, so shift them so the part is centred in its slot.
      if (p.shape === 'screw' || p.shape === 'nail') pos.x += p.length / 2;
      poses[p.id] = { pos, quat: lying.clone() };
    });
    row++;
  }
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
let speed = 1;
function tween(duration, fn) {
  const d = reduceMotion ? Math.min(duration, 0.12) : duration * speed;
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
const pivot = new V3();
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

function approachOffset(step, p, t) {
  if (step.approach?.[p.id]) return new V3(...step.approach[p.id]);
  if (step.from) return new V3(...step.from);
  if (p.dir) return canonicalAxis(p).clone().applyQuaternion(t.quat).multiplyScalar(-(step.slide || 4));
  return new V3(0, 20, 0);
}

// Hand the part to its holder and snap it to its exact pose there.
function settle(p) {
  const o = objects[p.id];
  holderOf(p).add(o);
  holderMatrix(p).decompose(o.position, o.quaternion, o.scale);
}

async function animatePart(step, p, t, forward) {
  const o = objects[p.id];
  const s = pile[p.id];
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

// Turn the whole assembly over, lifting it clear of the floor on the way round.
async function flipAssembly(step, forward) {
  const axis = step.axis === 'z' ? new V3(0, 0, 1) : new V3(1, 0, 0);
  const q0 = assembly.quaternion.clone();
  const sign = forward ? 1 : -1;
  const lift = step.lift ?? 30;
  const _q = new Q();
  await tween(1.8, (k) => {
    const e = ease(k);
    assembly.quaternion.copy(q0).premultiply(_q.setFromAxisAngle(axis, Math.PI * sign * e));
    assembly.position.y = pivot.y + Math.sin(Math.PI * e) * lift;
  });
  assembly.position.y = pivot.y;
}

async function playStep(i, forward) {
  const step = product.steps[i];
  if (step.type === 'flip') return flipAssembly(step, forward);
  const list = step.parts.map(partById);
  // `lower`: lift what's built so far, bring the new part in underneath, then lower onto it.
  const lowerBy = step.lower || 0;
  const raise = (k) => (assembly.position.y = pivot.y + lowerBy * k);
  const targets = list.map(targetPose); // measured with the assembly at rest
  if (forward) {
    if (lowerBy) await tween(0.6, (k) => raise(ease(k)));
    await Promise.all(list.map((p, n) => wait(n * 0.07).then(() => animatePart(step, p, targets[n], true))));
    if (lowerBy) await tween(0.9, (k) => raise(1 - ease(k)));
    list.forEach(settle);
  } else {
    list.forEach((p) => scene.attach(objects[p.id]));
    if (lowerBy) await tween(0.6, (k) => raise(ease(k)));
    await Promise.all(list.map((p, n) => wait(n * 0.05).then(() => animatePart(step, p, targets[n], false))));
    if (lowerBy) await tween(0.6, (k) => raise(1 - ease(k)));
  }
}

function clearGhosts() {
  for (const g of ghosts) g.removeFromParent();
  ghosts = [];
}

function showGhosts() {
  clearGhosts();
  const step = product.steps[done];
  if (!step || step.type === 'flip') return;
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
  return assembledBox.clone().expandByPoint(new V3(PILE_X + 30, 0, 50)).expandByPoint(new V3(PILE_X - 30, 10, -40));
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
  const box = stepBox(done);
  const addsBoard = step.parts.some((id) => partById(id).shape === 'board');
  if (addsBoard && assembly.children.length) box.union(new THREE.Box3().setFromObject(assembly));
  if (step.lower) box.max.y += step.lower;
  return fit(box, step.view ?? 30, duration);
}

// ---------- step control ----------
async function next() {
  if (busy || done >= product.steps.length) return;
  busy = true;
  clearGhosts();
  render();
  await playStep(done, true);
  done++;
  busy = false;
  showGhosts();
  render();
  frameCurrent(0.9);
}

async function back() {
  if (busy || done === 0) return;
  busy = true;
  clearGhosts();
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
  while (done < target) await next();
  while (done > target) await back();
  speed = 1;
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

function render() {
  const total = product.steps.length;
  const card = $('card');
  const bar = product.steps.map((s, n) => `<span class="${n < done ? 'done' : n === done ? 'now' : ''}"></span>`).join('');
  if (done >= total) {
    card.innerHTML = `
      <p class="eyebrow">Complete</p>
      <div class="steps-bar">${bar}</div>
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
      <div class="steps-bar">${bar}</div>
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
      ${step.type === 'flip' ? '' : '<p class="reason">The blue outline shows where the parts go.</p>'}`;
  }
  $('stepList').innerHTML = product.steps.map((s, n) =>
    `<li><button type="button" class="step-row ${n < done ? 'done' : n === done ? 'now' : ''}" data-step="${n}" ${busy ? 'disabled' : ''}>
      <span class="num">${n + 1}</span><span class="t">${s.title}</span></button></li>`).join('');
}

$('card').addEventListener('click', (e) => {
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
  if (n !== undefined) jumpTo(Number(n));
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
    if (shown.has(key)) continue;
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

// Gentle pulse on the parts waiting in the pile for this step.
const PULSE = new THREE.Color(0x5c2a0a);
function updatePulse(t) {
  const step = busy ? null : product.steps[done];
  const wanted = new Set(step ? step.parts : []);
  const k = 0.5 + 0.5 * Math.sin(t * 4);
  for (const [id, o] of Object.entries(objects)) {
    o.traverse((m) => {
      if (m.isMesh && m.userData.part === id && m.material.emissive) m.material.emissive.copy(PULSE).multiplyScalar(wanted.has(id) ? 0.4 + 0.6 * k : 0);
    });
  }
  ghostMat.opacity = 0.2 + 0.2 * k;
}

// ---------- theme, sizing, loop ----------
function applyTheme() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--scene').trim() || '#dfe3e8';
  scene.background = new THREE.Color(bg);
  scene.fog = new THREE.Fog(bg, 500, 1100);
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

  const poses = layOut(product.parts);
  for (const p of product.parts) {
    const o = buildPart(p);
    objects[p.id] = o;
    const q = assembledQuat(p);
    finalM[p.id] = new THREE.Matrix4().compose(new V3(...p.pos), q, new V3(1, 1, 1));
    pile[p.id] = poses[p.id];
    o.position.copy(pile[p.id].pos);
    o.quaternion.copy(pile[p.id].quat);
    scene.add(o);
    const ext = partExtent(p).applyQuaternion(q);
    ext.set(Math.abs(ext.x), Math.abs(ext.y), Math.abs(ext.z)).multiplyScalar(0.5);
    assembledBox.expandByPoint(new V3(...p.pos).sub(ext)).expandByPoint(new V3(...p.pos).add(ext));
  }
  // The assembly turns about its own middle, so upside down it still sits on the floor.
  pivot.set(0, (assembledBox.min.y + assembledBox.max.y) / 2, 0);
  assembly.position.copy(pivot);
  if (product.startFlipped) {
    assembly.quaternion.setFromAxisAngle(product.startFlipped === 'z' ? new V3(0, 0, 1) : new V3(1, 0, 0), Math.PI);
  }
  const toLocal = new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z);
  for (const p of product.parts) {
    localM[p.id] = toLocal.clone().multiply(finalM[p.id]);
    if (p.parent) relM[p.id] = finalM[p.parent].clone().invert().multiply(finalM[p.id]);
  }
  scene.add(buildTray());

  resize();
  const box = overviewBox();
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).addScaledVector(viewDir(30), sphere.radius * 3);
  fit(box, 30, reduceMotion ? 0.01 : 1.4);
  showGhosts();
  render();

  const clock = new THREE.Clock();
  let first = true;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    stepTweens(dt);
    controls.update();
    updatePulse(clock.elapsedTime);
    updateLabels();
    renderer.render(scene, camera);
    if (first) {
      first = false;
      $('loading').hidden = true;
      window.__guideReady = true;
    }
  });
}

start();

// Handy for debugging and automated checks.
window.guide = { next, back, jumpTo, playAll, isBusy: () => busy, done: () => done, camera, controls };
