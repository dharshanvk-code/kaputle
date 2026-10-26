import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildFlashlight, LENGTH } from './flashlight.js';
import { cuttingMatTexture, woodTexture, pegboardTexture } from './textures.js';
import { PARTS, LIST_ORDER, TAKE_APART_ORDER, MOVABLE } from './parts.js';

const $ = (id) => document.getElementById(id);
const V3 = THREE.Vector3;
const Q = THREE.Quaternion;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

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
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// A near plane of 0.5 (not 0.1) gives the depth buffer far more precision at bench distance.
const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 400);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = THREE.MathUtils.degToRad(84);
controls.minDistance = 2;
controls.maxDistance = 85;
controls.screenSpacePanning = true;

const key = new THREE.DirectionalLight(0xfff3e6, 2.3);
key.position.set(-12, 30, 20);
key.target.position.set(-1, 0, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -26, right: 26, top: 22, bottom: -22, near: 1, far: 90 });
key.shadow.camera.updateProjectionMatrix();
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.04;
key.shadow.radius = 4;
const fill = new THREE.DirectionalLight(0xd2e2ff, 0.5);
fill.position.set(22, 10, 18);
scene.add(key, key.target, fill);

// ---------- workbench ----------
{
  const wood = woodTexture();
  const bench = new THREE.Mesh(
    new THREE.BoxGeometry(110, 3, 44),
    new THREE.MeshStandardMaterial({ map: wood, roughness: 0.72 }),
  );
  bench.position.set(0, -1.58, 2); // top sits 0.8 mm below the mat so they never z-fight
  bench.receiveShadow = true;

  const mat = new THREE.Mesh(
    new THREE.PlaneGeometry(44, 22),
    new THREE.MeshStandardMaterial({
      map: cuttingMatTexture(44, 22),
      roughness: 0.9,
      polygonOffset: true, // always win the depth test against the bench underneath
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  mat.rotation.x = -Math.PI / 2;
  mat.position.set(-2, 0, 3.6);
  mat.receiveShadow = true;

  const pegTex = pegboardTexture();
  pegTex.repeat.set(140 / 20.32, 60 / 20.32);
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 60),
    new THREE.MeshStandardMaterial({ map: pegTex, roughness: 0.92 }),
  );
  wall.position.set(0, 28, -19);
  wall.receiveShadow = true;

  // V-blocks that cradle the flashlight
  const blockTex = wood.clone();
  blockTex.repeat.set(0.25, 0.25);
  const blockMat = new THREE.MeshStandardMaterial({ map: blockTex, color: 0xd9b48a, roughness: 0.6 });
  const shape = new THREE.Shape();
  shape.moveTo(-1.9, 0);
  shape.lineTo(1.9, 0);
  shape.lineTo(1.9, 1.75);
  shape.lineTo(1.25, 1.75);
  shape.lineTo(0, 0.72);
  shape.lineTo(-1.25, 1.75);
  shape.lineTo(-1.9, 1.75);
  shape.closePath();
  const blockGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.6, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
  blockGeo.translate(0, 0, -0.8);
  for (const x of [-5.8, 3.2]) {
    const b = new THREE.Mesh(blockGeo, blockMat);
    b.rotation.y = Math.PI / 2;
    b.position.set(x, 0.02, 0);
    b.castShadow = b.receiveShadow = true;
    scene.add(b);
  }
  scene.add(bench, mat, wall);
}

// ---------- flashlight ----------
const fl = buildFlashlight();
fl.root.rotation.z = -Math.PI / 2; // lay it down: +Y (tail → head) becomes +X
fl.root.position.set(-LENGTH / 2, 2.75, 0);
scene.add(fl.root);
scene.updateMatrixWorld(true);

const state = {};
const home = {};
for (const id of MOVABLE) {
  const o = fl.objects[id];
  state[id] = 'in';
  home[id] = { parent: o.parent, pos: o.position.clone(), quat: o.quaternion.clone() };
}

const meshesByPart = {};
fl.root.traverse((o) => {
  if (!o.isMesh) return;
  (meshesByPart[o.userData.part] ||= []).push(o);
});

const BENCH_QUAT = {
  upright: new Q(),
  // Along X like the flashlight, + end toward the head, wrapper text facing up.
  lying: new Q().setFromAxisAngle(new V3(0, 0, 1), -Math.PI / 2)
    .multiply(new Q().setFromAxisAngle(new V3(0, 1, 0), Math.PI / 2)),
};

function benchPose(id) {
  const b = PARTS[id].bench;
  return [new V3(...b.pos), BENCH_QUAT[b.pose].clone()];
}

// ---------- rules ----------
function isHidden(id) {
  if (id === 'battery1' || id === 'battery2') return state[id] === 'in';
  if (id === 'bulb') return state.bulb === 'in' && state.head === 'in';
  if (id === 'spring') return state.tailcap === 'in';
  return false;
}

function blockReason(id, action) {
  const out = (p) => state[p] === 'out';
  if (action === 'out') {
    if ((id === 'battery1' || id === 'battery2') && !out('tailcap')) return 'Unscrew the tail cap first. The batteries come out the back.';
    if (id === 'battery1' && !out('battery2')) return 'Battery 2 is in the way. Take it out first.';
    if (id === 'bulb' && !out('head')) return 'Unscrew the head first. The bulb sits underneath it.';
    if (id === 'lens' && !out('head')) return 'Take the head off first. The lens is clamped inside it.';
  } else {
    if ((id === 'battery1' || id === 'battery2') && !out('tailcap')) return 'Take the tail cap off to open the tube.';
    if (id === 'battery2' && out('battery1')) return 'Battery 1 goes in first. It sits deeper in the tube, next to the bulb.';
    if (id === 'bulb' && !out('head')) return 'Take the head off to reach the bulb socket.';
    if (id === 'lens' && !out('head')) return 'Take the head off to fit the lens back in.';
  }
  return null;
}

function moveLabel(id) {
  const out = state[id] === 'in';
  if (id === 'lens') return out ? 'Lift out' : 'Fit back in';
  if (PARTS[id].spin) return out ? 'Unscrew' : 'Screw back on';
  return out ? 'Take out' : 'Put back';
}

function where(id) {
  if (id === 'spring') return state.tailcap === 'in' ? ['hidden', 'Inside the tail cap'] : ['bench', 'In the tail cap'];
  if (id === 'body') return ['in', 'Stays in the cradle'];
  if (id === 'switch') return ['in', 'Built into the body'];
  if (id === 'lens' && state.lens === 'in') return state.head === 'in' ? ['in', 'In the head'] : ['bench', 'In the head'];
  if (state[id] === 'out') return ['bench', 'On the bench'];
  return isHidden(id) ? ['hidden', 'Hidden inside'] : ['in', 'In place'];
}

// ---------- tweening ----------
const tweens = new Set();
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function tween(duration, fn) {
  const d = reduceMotion ? Math.min(duration, 0.12) : duration;
  return new Promise((resolve) => tweens.add({ t: 0, d, fn, resolve }));
}
function stepTweens(dt) {
  for (const tw of [...tweens]) {
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.d);
    tw.fn(ease(k));
    if (k >= 1) {
      tweens.delete(tw);
      tw.resolve();
    }
  }
}

// ---------- moving parts ----------
const _q = new Q();

function pullAxis(id) {
  const pq = home[id].parent.getWorldQuaternion(new Q());
  return new V3(0, Math.sign(PARTS[id].pull), 0).applyQuaternion(pq).normalize();
}

async function takeOut(id, speed = 1) {
  const o = fl.objects[id];
  const cfg = PARTS[id];
  scene.updateMatrixWorld(true);
  const axis = pullAxis(id);
  const p0 = o.getWorldPosition(new V3());
  const q0 = o.getWorldQuaternion(new Q());
  scene.attach(o);
  const p1 = p0.clone().addScaledVector(axis, Math.abs(cfg.pull));
  const spin = cfg.spin * Math.PI * 2;
  await tween((0.45 + Math.abs(cfg.pull) * 0.045) * speed, (k) => {
    o.position.lerpVectors(p0, p1, k);
    o.quaternion.copy(_q.setFromAxisAngle(axis, spin * k)).multiply(q0);
  });
  const q1 = o.quaternion.clone();
  const [p2, q2] = benchPose(id);
  await tween(0.8 * speed, (k) => {
    o.position.lerpVectors(p1, p2, k);
    o.position.y += Math.sin(Math.PI * k) * 3;
    o.quaternion.slerpQuaternions(q1, q2, k);
  });
  state[id] = 'out';
}

async function putBack(id, speed = 1) {
  const o = fl.objects[id];
  const cfg = PARTS[id];
  const { parent, pos, quat } = home[id];
  scene.updateMatrixWorld(true);
  const target = new THREE.Matrix4().compose(pos, quat, new V3(1, 1, 1)).premultiply(parent.matrixWorld);
  const pT = new V3();
  const qT = new Q();
  target.decompose(pT, qT, new V3());
  const axis = pullAxis(id);
  const spin = cfg.spin * Math.PI * 2;
  const p1 = pT.clone().addScaledVector(axis, Math.abs(cfg.pull));
  const q1 = new Q().setFromAxisAngle(axis, spin).multiply(qT);
  const p0 = o.position.clone();
  const q0 = o.quaternion.clone();
  await tween(0.8 * speed, (k) => {
    o.position.lerpVectors(p0, p1, k);
    o.position.y += Math.sin(Math.PI * k) * 3;
    o.quaternion.slerpQuaternions(q0, q1, k);
  });
  await tween((0.45 + Math.abs(cfg.pull) * 0.045) * speed, (k) => {
    o.position.lerpVectors(p1, pT, k);
    o.quaternion.copy(_q.setFromAxisAngle(axis, spin * (1 - k))).multiply(qT);
  });
  parent.attach(o);
  o.position.copy(pos);
  o.quaternion.copy(quat);
  state[id] = 'in';
}

let busy = false;

async function run(task) {
  if (busy) return;
  busy = true;
  render();
  try {
    if (inspecting) await endInspect();
    await task();
  } finally {
    busy = false;
    render();
  }
}

function movePart(id) {
  if (!PARTS[id].removable) return;
  const action = state[id] === 'in' ? 'out' : 'in';
  const why = blockReason(id, action);
  if (why) {
    toast(why);
    return;
  }
  run(() => (action === 'out' ? takeOut(id) : putBack(id)));
}

function toggleAll() {
  const allOut = MOVABLE.every((id) => state[id] === 'out');
  run(async () => {
    if (allOut) {
      for (const id of [...TAKE_APART_ORDER].reverse()) {
        if (state[id] === 'out' && !blockReason(id, 'in')) await putBack(id, 0.6);
      }
    } else {
      for (const id of TAKE_APART_ORDER) {
        if (state[id] === 'in' && !blockReason(id, 'out')) await takeOut(id, 0.6);
      }
    }
  });
}

// ---------- camera ----------
const VIEW_DIR = new V3(-0.1, 0.8, 1).normalize();
function overviewPose() {
  const vf = THREE.MathUtils.degToRad(camera.fov) / 2;
  const hf = Math.atan(Math.tan(vf) * camera.aspect);
  const d = Math.max(15.5 / Math.tan(hf), 8.5 / Math.tan(vf));
  const target = new V3(-2.2, 1.6, 4.2);
  return { pos: target.clone().addScaledVector(VIEW_DIR, d), target };
}

function animateCamera(pos, target, duration) {
  const p0 = camera.position.clone();
  const t0 = controls.target.clone();
  return tween(duration, (k) => {
    camera.position.lerpVectors(p0, pos, k);
    controls.target.lerpVectors(t0, target, k);
  });
}

let userMoved = false;
controls.addEventListener('start', () => {
  userMoved = true;
  controls.autoRotate = false;
  $('hint').hidden = true;
});

function partBox(id) {
  const box = new THREE.Box3();
  for (const m of meshesByPart[id]) box.expandByObject(m);
  return box;
}

let inspecting = null;
let savedView = null;

async function inspect(id) {
  if (isHidden(id)) {
    toast(`The ${PARTS[id].name.toLowerCase()} is inside the flashlight. Take it out to inspect it.`);
    return;
  }
  if (busy) return;
  if (!inspecting) savedView = { pos: camera.position.clone(), target: controls.target.clone() };
  inspecting = id;
  selected = id;
  controls.autoRotate = false;
  render();
  scene.updateMatrixWorld(true);
  const sphere = partBox(id).getBoundingSphere(new THREE.Sphere());
  const vf = THREE.MathUtils.degToRad(camera.fov) / 2;
  const hf = Math.atan(Math.tan(vf) * camera.aspect);
  const dist = Math.max(2.4, (sphere.radius / Math.sin(Math.min(vf, hf))) * 1.1);
  const dir = camera.position.clone().sub(controls.target).normalize();
  dir.y = Math.max(dir.y, 0.5);
  dir.normalize();
  await animateCamera(sphere.center.clone().addScaledVector(dir, dist), sphere.center, 0.85);
  if (inspecting === id && !reduceMotion) {
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.2;
  }
}

async function endInspect() {
  if (!inspecting) return;
  inspecting = null;
  controls.autoRotate = false;
  render();
  if (savedView) await animateCamera(savedView.pos, savedView.target, 0.7);
}

function resetView() {
  const go = async () => {
    if (inspecting) {
      inspecting = null;
      controls.autoRotate = false;
      render();
    }
    const p = overviewPose();
    await animateCamera(p.pos, p.target, 0.8);
    userMoved = false;
  };
  go();
}

// ---------- picking & highlight ----------
let selected = null;
let hovered = null;
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function pick(x, y) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const targets = [fl.root, ...MOVABLE.map((id) => fl.objects[id]).filter((o) => o.parent === scene)];
  for (const hit of raycaster.intersectObjects(targets, true)) {
    if (hit.object.userData.part) return hit.object.userData.part;
  }
  return null;
}

function refreshGlow() {
  for (const [id, meshes] of Object.entries(meshesByPart)) {
    // No tint while inspecting: the part should show its true colours up close.
    const hex = inspecting ? 0x000000 : id === selected ? 0x3a1806 : id === hovered ? 0x1e0e04 : 0x000000;
    for (const m of meshes) m.material.emissive?.setHex(hex);
  }
}

function select(id) {
  selected = id;
  if (inspecting && id && id !== inspecting && !isHidden(id)) inspect(id);
  render();
}

let down = null;
let lastTap = { id: null, t: 0 };
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, t: performance.now() };
});
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const quick = performance.now() - down.t < 600;
  down = null;
  if (moved > 6 || !quick) return;
  const id = pick(e.clientX, e.clientY);
  const now = performance.now();
  if (id && lastTap.id === id && now - lastTap.t < 400) {
    lastTap = { id: null, t: 0 };
    inspect(id);
    return;
  }
  lastTap = { id, t: now };
  if (!id && inspecting) return;
  select(id);
});
let hoverEvent = null;
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' && !e.buttons) hoverEvent = e;
});
canvas.addEventListener('pointerleave', () => {
  hoverEvent = null;
  if (hovered) {
    hovered = null;
    refreshGlow();
  }
});

function updateHover() {
  if (!hoverEvent) return;
  const id = pick(hoverEvent.clientX, hoverEvent.clientY);
  hoverEvent = null;
  if (id !== hovered) {
    hovered = id;
    canvas.style.cursor = id ? 'pointer' : '';
    refreshGlow();
  }
}

// ---------- floating labels ----------
const LABELLED = ['tailcap', 'spring', 'battery2', 'battery1', 'bulb', 'head', 'lens'];
const labels = {};
for (const id of LABELLED) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'part-label';
  b.textContent = PARTS[id].name;
  b.hidden = true;
  b.addEventListener('click', () => select(id));
  b.addEventListener('dblclick', () => inspect(id));
  $('labels').append(b);
  labels[id] = b;
}

function labelShown(id) {
  if (inspecting || busy) return false;
  if (id === selected) return !isHidden(id);
  if (id === 'spring') return false;
  if (id === 'lens') return state.lens === 'out';
  return state[id] === 'out';
}

const _box = new THREE.Box3();
const _p = new V3();
function updateLabels() {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  for (const id of LABELLED) {
    const el = labels[id];
    const show = labelShown(id);
    el.hidden = !show;
    if (!show) continue;
    _box.makeEmpty();
    for (const m of meshesByPart[id]) _box.expandByObject(m);
    // Battery 1 is labelled at its near end so it doesn't collide with Battery 2.
    if (id === 'battery1' && state[id] === 'out') _p.set((_box.min.x + _box.max.x) / 2, _box.min.y, _box.max.z + 0.8);
    else _p.set((_box.min.x + _box.max.x) / 2, _box.max.y + 0.4, (_box.min.z + _box.max.z) / 2);
    _p.project(camera);
    if (_p.z > 1) {
      el.hidden = true;
      continue;
    }
    const x = (_p.x * 0.5 + 0.5) * w;
    const y = (-_p.y * 0.5 + 0.5) * h;
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, ${id === 'battery1' && state[id] === 'out' ? '20%' : '-100%'})`;
    el.classList.toggle('is-selected', id === selected);
  }
}

// ---------- UI ----------
let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3200);
}

const FIXED_NOTE = {
  spring: 'The spring stays fixed inside the tail cap.',
  body: 'The body stays in the cradle. Everything else comes off it.',
  switch: 'The switch is built into the body.',
};

function renderCard() {
  const card = $('card');
  if (!selected) {
    card.innerHTML = `
      <p class="eyebrow">Getting started</p>
      <h2>Pick a part</h2>
      <p>Tap anything on the flashlight, or pick from the list below. A good first move: unscrew the tail cap at the back to reach the batteries.</p>`;
    return;
  }
  const id = selected;
  const P = PARTS[id];
  const [kind, place] = where(id);
  let move = '';
  let reason = '';
  if (P.removable) {
    const why = blockReason(id, state[id] === 'in' ? 'out' : 'in');
    move = `<button type="button" class="btn primary" data-act="move" ${why || busy ? 'disabled' : ''}>${moveLabel(id)}</button>`;
    if (why) reason = why;
  } else {
    reason = FIXED_NOTE[id] || '';
  }
  const hidden = isHidden(id);
  const inspectBtn = inspecting === id
    ? `<button type="button" class="btn" data-act="done">Done inspecting</button>`
    : `<button type="button" class="btn" data-act="inspect" ${hidden || busy ? 'disabled' : ''}>Inspect up close</button>`;
  if (hidden && !reason) reason = 'It’s hidden inside. Take it out to inspect it.';
  card.innerHTML = `
    <p class="where"><span class="dot ${kind}"></span>${place}</p>
    <h2>${P.name}</h2>
    <p>${P.blurb}</p>
    <p class="notice-title">Look for</p>
    <ul class="notice">${P.notice.map((n) => `<li>${n}</li>`).join('')}</ul>
    <div class="actions">${move}${inspectBtn}</div>
    ${reason ? `<p class="reason">${reason}</p>` : ''}`;
}

function renderList() {
  $('partList').innerHTML = LIST_ORDER.map((id) => {
    const [kind, place] = where(id);
    return `<li><button type="button" class="part-row ${selected === id ? 'is-selected' : ''}" data-id="${id}" aria-pressed="${selected === id}">
      <span class="dot ${kind}"></span><span class="pname">${PARTS[id].name}</span><span class="ploc">${place}</span></button></li>`;
  }).join('');
}

function render() {
  const outCount = MOVABLE.filter((id) => state[id] === 'out').length;
  $('progressText').textContent = `${outCount} of ${MOVABLE.length} parts out`;
  $('progressFill').style.width = `${(outCount / MOVABLE.length) * 100}%`;
  const apart = $('apartBtn');
  apart.textContent = outCount === MOVABLE.length ? 'Put it all back' : 'Take it all apart';
  apart.disabled = busy;
  $('inspectBar').hidden = !inspecting;
  if (inspecting) $('inspectName').textContent = PARTS[inspecting].name;
  renderCard();
  renderList();
  refreshGlow();
}

$('card').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'move') movePart(selected);
  if (act === 'inspect') inspect(selected);
  if (act === 'done') endInspect();
});
$('partList').addEventListener('click', (e) => {
  const id = e.target.closest('[data-id]')?.dataset.id;
  if (id) select(id);
});
$('apartBtn').addEventListener('click', toggleAll);
$('resetViewBtn').addEventListener('click', resetView);
$('doneInspect').addEventListener('click', endInspect);
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (inspecting) endInspect();
  else select(null);
});

// ---------- theme ----------
function applyTheme() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--scene').trim() || '#d6dce3';
  scene.background = new THREE.Color(bg);
  scene.fog = new THREE.Fog(bg, 90, 200);
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
applyTheme();

// ---------- sizing & loop ----------
function resize() {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (!userMoved && !inspecting && !tweens.size) {
    const p = overviewPose();
    camera.position.copy(p.pos);
    controls.target.copy(p.target);
  }
}
new ResizeObserver(resize).observe(viewport);
resize();

// Opening shot: glide in from a wider angle.
{
  const p = overviewPose();
  camera.position.copy(p.pos);
  controls.target.copy(p.target);
  if (!reduceMotion) {
    const start = p.pos.clone().sub(p.target).applyAxisAngle(new V3(0, 1, 0), 0.5).multiplyScalar(1.25).add(p.target);
    start.y += 6;
    camera.position.copy(start);
    animateCamera(p.pos, p.target, 1.6);
  }
}

render();
const clock = new THREE.Clock();
let first = true;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  stepTweens(dt);
  controls.update();
  updateHover();
  updateLabels();
  renderer.render(scene, camera);
  if (first) {
    first = false;
    $('loading').hidden = true;
    window.__kaputleReady = true;
  }
});

// Handy for debugging and automated checks.
window.kaputle = { state, select, inspect, endInspect, movePart, toggleAll, isBusy: () => busy, camera, controls };
