import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildFlashlight, LENGTH } from './flashlight.js';
import { cuttingMatTexture, woodTexture, pegboardTexture, glowTexture } from './textures.js';
import { PARTS, LIST_ORDER, TAKE_APART_ORDER, MOVABLE, GUIDE } from './parts.js';
import { sfx, setSound, soundOn } from './audio.js';

const $ = (id) => document.getElementById(id);
const V3 = THREE.Vector3;
const Q = THREE.Quaternion;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer = matchMedia('(pointer: coarse)').matches;

const canvas = $('scene');
const viewport = $('viewport');

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage is optional */ } },
};

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

const KEY_INTENSITY = 2.3;
const FILL_INTENSITY = 0.5;
const key = new THREE.DirectionalLight(0xfff3e6, KEY_INTENSITY);
key.position.set(-12, 30, 20);
key.target.position.set(-1, 0, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -26, right: 26, top: 22, bottom: -22, near: 1, far: 90 });
key.shadow.camera.updateProjectionMatrix();
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.04;
key.shadow.radius = 4;
const fill = new THREE.DirectionalLight(0xd2e2ff, FILL_INTENSITY);
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

// ---------- light: bulb glow, beam, and the dimmed room ----------
const noHit = () => {};
const bulbObj = fl.objects.bulb;
const filamentMat = bulbObj.userData.filament.material;
const bulbGlassMat = bulbObj.userData.glass.material;
const reflectorMat = fl.objects.head.userData.reflector.material;
const FILAMENT_Y = bulbObj.userData.filament.position.y;

const bulbLight = new THREE.PointLight(0xffcf94, 0, 16, 2);
bulbLight.position.y = FILAMENT_Y;
const glow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTexture(), color: 0xffd9a0, blending: THREE.AdditiveBlending,
  depthWrite: false, transparent: true, opacity: 0, fog: false,
}));
glow.scale.set(2.6, 2.6, 1);
glow.position.y = FILAMENT_Y;
glow.raycast = noHit;
glow.visible = false;
bulbObj.add(bulbLight, glow);

const BEAM_LEN = 26;
const BEAM_SPREAD = 0.27;
const spot = new THREE.SpotLight(0xfff0d4, 0, 80, BEAM_SPREAD + 0.05, 0.6, 1.4);
spot.position.set(0, LENGTH + 0.2, 0);
spot.target.position.set(0, LENGTH + 30, 0);
const beam = new THREE.Mesh(
  new THREE.CylinderGeometry(2.3, 2.3 + BEAM_LEN * Math.tan(BEAM_SPREAD), BEAM_LEN, 64, 1, true),
  new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xffe2b0) }, uOpacity: { value: 0 } },
    vertexShader: `
      varying float vAlong; varying vec3 vNormal; varying vec3 vView;
      void main() {
        vAlong = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uOpacity;
      varying float vAlong; varying vec3 vNormal; varying vec3 vView;
      void main() {
        float facing = pow(abs(dot(normalize(vNormal), normalize(vView))), 2.2);
        float fade = pow(vAlong, 2.0);
        gl_FragColor = vec4(uColor, uOpacity * facing * fade);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }),
);
beam.rotation.x = Math.PI; // narrow end at the lens
beam.position.y = LENGTH + BEAM_LEN / 2 + 0.05;
beam.raycast = noHit;
beam.visible = false;
fl.root.add(spot, spot.target, beam);

// Remember every material's reflection strength so the room can dim around the beam.
const envMats = [];
scene.traverse((o) => {
  if (o.isMesh && o.material && 'envMapIntensity' in o.material) envMats.push([o.material, o.material.envMapIntensity]);
});

let switchOn = false;
const power = { level: 0, beam: 0 };
const WARM = new THREE.Color(0xffb866);
const CIRCUIT = ['tailcap', 'battery1', 'battery2', 'bulb'];

const circuitComplete = () => CIRCUIT.every((id) => state[id] === 'in');
const isLit = () => switchOn && circuitComplete();
const beamOn = () => isLit() && state.head === 'in';

function setLit(mat, on, intensity) {
  mat.userData.lit = on ? WARM : null;
  mat.userData.litIntensity = intensity;
}

function updatePower(dt) {
  const k = Math.min(1, dt * 11);
  power.level += ((isLit() ? 1 : 0) - power.level) * k;
  power.beam += ((beamOn() ? 1 : 0) - power.beam) * k;
  const L = power.level;
  const B = power.beam;
  setLit(filamentMat, L > 0.004, 9 * L);
  setLit(bulbGlassMat, L > 0.004, 0.35 * L);
  setLit(reflectorMat, B > 0.004, 0.45 * B);
  bulbLight.intensity = 24 * L;
  glow.visible = L > 0.004;
  glow.material.opacity = 0.95 * L;
  spot.intensity = 900 * B;
  beam.visible = B > 0.004;
  beam.material.uniforms.uOpacity.value = 0.5 * B;
  const dim = Math.max(0.3 * L, 0.72 * B);
  key.intensity = KEY_INTENSITY * (1 - 0.85 * dim);
  fill.intensity = FILL_INTENSITY * (1 - dim);
  for (const [m, base] of envMats) m.envMapIntensity = base * (1 - 0.75 * dim);
}

// "Battery 1" reads as a name; "the bulb" needs an article.
const partRef = (id) => (isBattery(id) ? PARTS[id].name : `the ${PARTS[id].name.toLowerCase()}`);
const capitalise = (t) => t[0].toUpperCase() + t.slice(1);

function missingForLight() {
  const missing = CIRCUIT.filter((id) => state[id] !== 'in').map(partRef);
  if (!missing.length) return null;
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing.at(-1)}`;
  return `${capitalise(list)} ${missing.length === 1 ? 'is' : 'are'} missing.`;
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
  if (id === 'switch') return ['in', switchOn ? 'Switched on' : 'Switched off'];
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
const isBattery = (id) => id === 'battery1' || id === 'battery2';

function pullAxis(id) {
  const pq = home[id].parent.getWorldQuaternion(new Q());
  return new V3(0, Math.sign(PARTS[id].pull), 0).applyQuaternion(pq).normalize();
}

function partSound(id, duration) {
  if (PARTS[id].spin) sfx.thread(duration, PARTS[id].spin);
  else if (isBattery(id)) sfx.slide(duration);
  else if (id === 'lens') sfx.glass();
}

async function takeOut(id, speed = 1) {
  const o = fl.objects[id];
  const cfg = PARTS[id];
  scene.updateMatrixWorld(true);
  state[id] = 'moving'; // the contact breaks as soon as it starts to move
  const axis = pullAxis(id);
  const p0 = o.getWorldPosition(new V3());
  const q0 = o.getWorldQuaternion(new Q());
  scene.attach(o);
  const p1 = p0.clone().addScaledVector(axis, Math.abs(cfg.pull));
  const spin = cfg.spin * Math.PI * 2;
  const d1 = (0.45 + Math.abs(cfg.pull) * 0.045) * speed;
  partSound(id, d1);
  await tween(d1, (k) => {
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
  sfx.thud();
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
  const d2 = (0.45 + Math.abs(cfg.pull) * 0.045) * speed;
  partSound(id, d2);
  await tween(d2, (k) => {
    o.position.lerpVectors(p1, pT, k);
    o.quaternion.copy(_q.setFromAxisAngle(axis, spin * (1 - k))).multiply(qT);
  });
  parent.attach(o);
  o.position.copy(pos);
  o.quaternion.copy(quat);
  sfx.seat();
  state[id] = 'in';
}

let busy = false;

async function run(task) {
  if (busy) return;
  busy = true;
  const wasLit = isLit();
  render();
  try {
    if (inspecting) await endInspect();
    await task();
  } finally {
    busy = false;
    if (!wasLit && isLit()) toast(state.head === 'in' ? 'Circuit complete. It lights up!' : 'The bare bulb lights up. Put the head on to focus it into a beam.');
    afterChange();
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

function takeAllApart(speed = 0.6) {
  return run(async () => {
    for (const id of TAKE_APART_ORDER) {
      if (state[id] === 'in' && !blockReason(id, 'out')) await takeOut(id, speed);
    }
  });
}

function toggleAll() {
  if (MOVABLE.every((id) => state[id] === 'out')) {
    run(async () => {
      for (const id of [...TAKE_APART_ORDER].reverse()) {
        if (state[id] === 'out' && !blockReason(id, 'in')) await putBack(id, 0.6);
      }
    });
  } else {
    takeAllApart();
  }
}

// ---------- the switch ----------
const dome = fl.objects.switch.userData.dome;
const DOME_Y = dome.position.y;

function toggleSwitch(forceOn) {
  if (busy) return;
  switchOn = forceOn ?? !switchOn;
  sfx.click();
  tween(0.07, (k) => (dome.position.y = DOME_Y - 0.09 * k)).then(() => tween(0.09, (k) => (dome.position.y = DOME_Y - 0.09 * (1 - k))));
  if (switchOn) {
    const missing = missingForLight();
    if (missing) toast(`Click… nothing. The circuit is broken. ${missing}`);
    else if (state.head !== 'in') toast('The bare bulb lights up. Put the head on to focus it into a beam.');
    else if (!inspecting) beamShot();
  }
  afterChange();
}

// ---------- camera ----------
const portrait = () => camera.aspect < 0.9;
function viewDir() {
  return portrait() ? new V3(-0.05, 1.25, 1).normalize() : new V3(-0.1, 0.8, 1).normalize();
}

function overviewPose() {
  const vf = THREE.MathUtils.degToRad(camera.fov) / 2;
  const hf = Math.atan(Math.tan(vf) * camera.aspect);
  const [halfW, halfH] = portrait() ? [13.8, 10] : [15.5, 8.5];
  const d = Math.max(halfW / Math.tan(hf), halfH / Math.tan(vf));
  const target = new V3(-2.2, 1.6, 4.2);
  return { pos: target.clone().addScaledVector(viewDir(), d), target };
}

function animateCamera(pos, target, duration) {
  const p0 = camera.position.clone();
  const t0 = controls.target.clone();
  return tween(duration, (k) => {
    camera.position.lerpVectors(p0, pos, k);
    controls.target.lerpVectors(t0, target, k);
  });
}

function fitBox(box, duration = 0.9, minDist = 6) {
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const vf = THREE.MathUtils.degToRad(camera.fov) / 2;
  const hf = Math.atan(Math.tan(vf) * camera.aspect);
  const dist = Math.max(minDist, (sphere.radius / Math.sin(Math.min(vf, hf))) * 1.02);
  userMoved = true;
  return animateCamera(sphere.center.clone().addScaledVector(viewDir(), dist), sphere.center, duration);
}

// Frame the flashlight and the pool of light it throws down the bench.
function beamShot() {
  fitBox(new THREE.Box3(new V3(-11, 0, -3), new V3(27, 3, 5)), 1.4);
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
    toast(`${capitalise(partRef(id))} is inside the flashlight. Take it out to inspect it.`);
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
  // A bulb still in its socket can only be seen from the front, past the end of the tube.
  const dir = id === 'bulb' && state.bulb === 'in'
    ? new V3(1, 0.6, 0.7).normalize()
    : camera.position.clone().sub(controls.target).normalize();
  dir.y = Math.max(dir.y, 0.5);
  dir.normalize();
  await animateCamera(sphere.center.clone().addScaledVector(dir, Math.max(dist, id === 'bulb' ? 4 : 0)), sphere.center, 0.85);
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
  if (inspecting) {
    inspecting = null;
    controls.autoRotate = false;
    render();
  }
  const p = overviewPose();
  animateCamera(p.pos, p.target, 0.8).then(() => (userMoved = false));
}

// ---------- guided build ----------
const guide = { active: false, shownStep: -1, ghost: null, ghostFor: null };
const GUIDE_DONE = {
  lens: () => state.lens === 'in',
  bulb: () => state.bulb === 'in',
  head: () => state.head === 'in',
  battery1: () => state.battery1 === 'in',
  battery2: () => state.battery2 === 'in',
  tailcap: () => state.tailcap === 'in',
  switch: () => beamOn(),
};
const guideIndex = () => GUIDE.findIndex((s) => !GUIDE_DONE[s.id]());
const guideStep = () => (guide.active ? GUIDE[guideIndex()] || null : null);

const ghostMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, depthTest: false, depthWrite: false });

// A see-through blueprint-blue copy of the part where it needs to go, drawn on top of everything
// so it shows even inside the tube.
function makeGhost(id) {
  const src = fl.objects[id];
  scene.updateMatrixWorld(true);
  const inv = src.matrixWorld.clone().invert();
  const g = new THREE.Group();
  src.traverse((o) => {
    if (!o.isMesh) return;
    const m = new THREE.Mesh(o.geometry, ghostMat);
    new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld).decompose(m.position, m.quaternion, m.scale);
    m.renderOrder = 10;
    m.raycast = noHit;
    g.add(m);
  });
  g.position.copy(home[id].pos);
  g.quaternion.copy(home[id].quat);
  home[id].parent.add(g);
  return g;
}

function clearGhost() {
  guide.ghost?.removeFromParent();
  guide.ghost = null;
  guide.ghostFor = null;
}

function syncGuide() {
  if (!guide.active) return;
  const i = guideIndex();
  const step = GUIDE[i];
  const needsGhost = step && MOVABLE.includes(step.id) && state[step.id] === 'out';
  if (!needsGhost || guide.ghostFor !== step.id) {
    clearGhost();
    if (needsGhost) {
      guide.ghost = makeGhost(step.id);
      guide.ghostFor = step.id;
    }
  }
  if (i !== guide.shownStep) {
    guide.shownStep = i;
    if (i < 0) {
      toast('Built and working. Nice job.');
    } else if (step.id === 'switch') {
      fitBox(partBox('body').union(partBox('head')), 0.9);
    } else {
      scene.updateMatrixWorld(true);
      const box = partBox(step.id);
      if (guide.ghost) box.expandByObject(guide.ghost);
      fitBox(box, 0.9);
    }
  }
}

async function startGuide() {
  if (busy) return;
  guide.active = true;
  guide.shownStep = -1;
  switchOn = false;
  selected = null;
  if (MOVABLE.some((id) => state[id] !== 'out')) {
    toast('Taking it apart first, so you can build it from scratch.');
    await takeAllApart(0.5);
  } else {
    afterChange();
  }
}

function exitGuide() {
  guide.active = false;
  clearGhost();
  afterChange();
}

function doGuideStep() {
  const step = guideStep();
  if (!step) return;
  if (step.id === 'switch') toggleSwitch(true);
  else movePart(step.id);
}

// ---------- picking & highlight ----------
let selected = null;
let hovered = null;
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const _c = new V3();

// Small parts are hard to hit on a phone, so a near miss still counts.
function nearbySmallPart(x, y, r) {
  const candidates = ['switch'];
  if (!isHidden('bulb')) candidates.push('bulb');
  if (state.tailcap === 'out') candidates.push('spring');
  if (state.lens === 'out') candidates.push('lens');
  let best = null;
  let bestD = coarsePointer ? 34 : 14;
  for (const id of candidates) {
    partBox(id).getCenter(_c).project(camera);
    const d = Math.hypot((_c.x * 0.5 + 0.5) * r.width + r.left - x, (-_c.y * 0.5 + 0.5) * r.height + r.top - y);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

function pick(x, y) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const targets = [fl.root, ...MOVABLE.map((id) => fl.objects[id]).filter((o) => o.parent === scene)];
  let hit = null;
  for (const h of raycaster.intersectObjects(targets, true)) {
    if (h.object.userData.part) {
      hit = h.object.userData.part;
      break;
    }
  }
  if (hit === 'switch' || hit === 'bulb' || hit === 'spring') return hit;
  return nearbySmallPart(x, y, r) || hit;
}

const _glow = new THREE.Color();
const PULSE = new THREE.Color(0x6a2c08);
function refreshGlow(time = 0) {
  const step = guideStep();
  const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 4));
  for (const [id, meshes] of Object.entries(meshesByPart)) {
    _glow.setHex(0);
    if (!inspecting) {
      if (step && step.id === id) _glow.copy(PULSE).multiplyScalar(pulse);
      else if (id === selected) _glow.setHex(0x3a1806);
      else if (id === hovered) _glow.setHex(0x1e0e04);
    }
    for (const m of meshes) {
      const mat = m.material;
      if (!mat.emissive) continue;
      if (mat.userData.lit) {
        mat.emissive.copy(mat.userData.lit);
        mat.emissiveIntensity = mat.userData.litIntensity;
      } else {
        mat.emissive.copy(_glow);
        mat.emissiveIntensity = 1;
      }
    }
  }
  ghostMat.opacity = 0.24 + 0.24 * pulse;
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
  if (moved > 8 || !quick) return;
  const id = pick(e.clientX, e.clientY);
  const now = performance.now();
  if (id && lastTap.id === id && now - lastTap.t < 400) {
    lastTap = { id: null, t: 0 };
    inspect(id);
    return;
  }
  lastTap = { id, t: now };
  const step = guideStep();
  if (step && id === step.id) {
    doGuideStep();
    return;
  }
  if (!id && inspecting) return;
  select(id);
});
let hoverEvent = null;
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' && !e.buttons) hoverEvent = e;
});
canvas.addEventListener('pointerleave', () => {
  hoverEvent = null;
  hovered = null;
});

function updateHover() {
  if (!hoverEvent) return;
  const id = pick(hoverEvent.clientX, hoverEvent.clientY);
  hoverEvent = null;
  if (id !== hovered) {
    hovered = id;
    canvas.style.cursor = id ? 'pointer' : '';
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
  b.addEventListener('click', () => (guideStep()?.id === id ? doGuideStep() : select(id)));
  b.addEventListener('dblclick', () => inspect(id));
  $('labels').append(b);
  labels[id] = b;
}

function labelShown(id) {
  if (inspecting || busy) return false;
  if (guideStep()?.id === id) return state[id] === 'out';
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
  const stepId = guideStep()?.id;
  for (const id of LABELLED) {
    const el = labels[id];
    const show = labelShown(id);
    el.hidden = !show;
    if (!show) continue;
    _box.makeEmpty();
    for (const m of meshesByPart[id]) _box.expandByObject(m);
    // Battery 1 is labelled at its near end so it doesn't collide with Battery 2.
    const below = id === 'battery1' && state[id] === 'out';
    if (below) _p.set((_box.min.x + _box.max.x) / 2, _box.min.y, _box.max.z + 0.8);
    else _p.set((_box.min.x + _box.max.x) / 2, _box.max.y + 0.4, (_box.min.z + _box.max.z) / 2);
    _p.project(camera);
    if (_p.z > 1) {
      el.hidden = true;
      continue;
    }
    const x = (_p.x * 0.5 + 0.5) * w;
    const y = (-_p.y * 0.5 + 0.5) * h;
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, ${below ? '20%' : '-100%'})`;
    el.classList.toggle('is-selected', id === selected || id === stepId);
  }
}

// ---------- UI ----------
let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3600);
}

const FIXED_NOTE = {
  spring: 'The spring stays fixed inside the tail cap.',
  body: 'The body stays in the cradle. Everything else comes off it.',
};

function renderGuideCard(card) {
  const i = guideIndex();
  const total = GUIDE.length;
  const bar = GUIDE.map((s, n) => `<span class="${GUIDE_DONE[s.id]() ? 'done' : n === i ? 'now' : ''}"></span>`).join('');
  const list = GUIDE.map((s, n) => `<li class="${GUIDE_DONE[s.id]() ? 'done' : n === i ? 'now' : ''}">${s.title}</li>`).join('');
  if (i < 0) {
    card.innerHTML = `
      <p class="eyebrow">Guided build · Complete</p>
      <div class="steps-bar">${bar}</div>
      <h2>It works!</h2>
      <p>You built a working flashlight: six parts and one complete circuit, from the batteries through the bulb and back.</p>
      <div class="actions">
        <button type="button" class="btn primary" data-act="guide-again">Build it again</button>
        <button type="button" class="btn" data-act="guide-exit">Exit guide</button>
      </div>
      <ol class="guide-steps">${list}</ol>`;
    return;
  }
  const step = GUIDE[i];
  const blocked = MOVABLE.includes(step.id) ? blockReason(step.id, 'in') : null;
  card.innerHTML = `
    <p class="eyebrow">Guided build · Step ${i + 1} of ${total}</p>
    <div class="steps-bar">${bar}</div>
    <h2>${step.title}</h2>
    <p>${step.tip}</p>
    <div class="actions">
      <button type="button" class="btn primary" data-act="guide-do" ${busy || blocked ? 'disabled' : ''}>${step.action}</button>
      <button type="button" class="btn" data-act="guide-exit">Exit guide</button>
    </div>
    <p class="reason">${blocked || 'Or tap the glowing part yourself. The see-through outline shows where it goes.'}</p>
    <ol class="guide-steps">${list}</ol>`;
}

function renderCard() {
  const card = $('card');
  card.classList.toggle('is-guide', guide.active);
  if (guide.active) {
    renderGuideCard(card);
    return;
  }
  if (!selected) {
    card.innerHTML = `
      <p class="eyebrow">Getting started</p>
      <h2>Pick a part</h2>
      <p>Tap anything on the flashlight, or pick from the list below. A good first move: unscrew the tail cap at the back to reach the batteries.</p>
      <p class="reason">New here? Try <b>Guided build</b> for a step-by-step walkthrough.</p>`;
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
  } else if (id === 'switch') {
    move = `<button type="button" class="btn primary" data-act="power" ${busy ? 'disabled' : ''}>${switchOn ? 'Switch off' : 'Switch on'}</button>`;
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
  const pw = $('powerBtn');
  pw.setAttribute('aria-pressed', String(switchOn));
  pw.querySelector('.label').textContent = switchOn ? 'Switch off' : 'Switch on';
  pw.classList.toggle('is-lit', isLit());
  pw.disabled = busy;
  const gb = $('guideBtn');
  gb.textContent = guide.active ? 'Exit guide' : 'Guided build';
  gb.disabled = busy && !guide.active;
  $('inspectBar').hidden = !inspecting;
  if (inspecting) $('inspectName').textContent = PARTS[inspecting].name;
  renderCard();
  renderList();
}

function afterChange() {
  syncGuide();
  render();
}

$('card').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'move') movePart(selected);
  if (act === 'inspect') inspect(selected);
  if (act === 'done') endInspect();
  if (act === 'power') toggleSwitch();
  if (act === 'guide-do') doGuideStep();
  if (act === 'guide-exit') exitGuide();
  if (act === 'guide-again') startGuide();
});
$('partList').addEventListener('click', (e) => {
  const id = e.target.closest('[data-id]')?.dataset.id;
  if (id) select(id);
});
$('apartBtn').addEventListener('click', toggleAll);
$('powerBtn').addEventListener('click', () => toggleSwitch());
$('guideBtn').addEventListener('click', () => (guide.active ? exitGuide() : startGuide()));
$('resetViewBtn').addEventListener('click', resetView);
$('doneInspect').addEventListener('click', endInspect);

const soundBtn = $('soundBtn');
function renderSound() {
  soundBtn.setAttribute('aria-pressed', String(soundOn()));
  soundBtn.querySelector('.label').textContent = soundOn() ? 'Sound on' : 'Sound off';
}
setSound(store.get('kaputle:sound', false));
renderSound();
soundBtn.addEventListener('click', () => {
  setSound(!soundOn());
  store.set('kaputle:sound', soundOn());
  renderSound();
  sfx.click();
});

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (inspecting) endInspect();
  else select(null);
});

// ---------- theme ----------
function applyTheme() {
  const cs = getComputedStyle(document.documentElement);
  const bg = cs.getPropertyValue('--scene').trim() || '#d6dce3';
  scene.background = new THREE.Color(bg);
  scene.fog = new THREE.Fog(bg, 90, 200);
  ghostMat.color.set(cs.getPropertyValue('--ghost').trim() || '#2f7bff');
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
  updatePower(dt);
  refreshGlow(clock.elapsedTime);
  updateLabels();
  renderer.render(scene, camera);
  if (first) {
    first = false;
    $('loading').hidden = true;
    window.__kaputleReady = true;
  }
});

// Handy for debugging and automated checks.
window.kaputle = {
  state, select, inspect, endInspect, movePart, toggleAll, toggleSwitch, startGuide, exitGuide, doGuideStep,
  isBusy: () => busy, isLit, camera, controls,
};
