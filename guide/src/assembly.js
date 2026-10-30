// Moving parts: setting them out to work on, fitting them, turning the assembly over, and
// showing where the next parts go.
import * as THREE from 'three';
import { V3, Q } from './config.js';
import { scene } from './scene.js';
import { UP, DOWN, assembledQuat, partExtent, partCentre, canonicalAxis } from './parts.js';
import { tween, wait, ease, tapEase } from './tween.js';
import { G, assembly, partById, rootOf, holderOf, holderMatrix, isPlaced, nextFlip, X_AXIS, Z_AXIS } from './state.js';

// How high the assembly's middle sits when it rests on the floor in a given orientation,
// counting only what's built by the time it's turned again (lying on its front, a dresser
// rests on its frame, not on drawer knobs that aren't fitted yet).
export function restY(q, untilStep = Infinity) {
  let minY = Infinity;
  const corner = new V3();
  for (const p of G.product.parts) {
    if (!(G.stepOf[rootOf(p.id)] < untilStep)) continue;
    const rot = assembledQuat(p).premultiply(q);
    const half = partExtent(p).multiplyScalar(0.5);
    const centre = partCentre(p).applyQuaternion(assembledQuat(p)).add(new V3(...p.pos)).sub(G.pivot).applyQuaternion(q);
    // The lowest corner of the part's box, turned.
    let low = 0;
    for (const [axis, h] of [[new V3(1, 0, 0), half.x], [new V3(0, 1, 0), half.y], [new V3(0, 0, 1), half.z]]) {
      low -= Math.abs(corner.copy(axis).applyQuaternion(rot).y) * h;
    }
    minY = Math.min(minY, centre.y + low);
  }
  return minY === Infinity ? 0 : -minY;
}

// Where a part ends up in the world right now, given where its holder currently is.
export function targetPose(p) {
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
    G.finalM[p.parent].decompose(new V3(), qParent, new V3());
    q.multiply(qParent.invert());
  }
  return q;
}

// `from` and `approach` are in the world as the viewer sees it, or with `local: true`, in the
// finished product's own frame (so "from behind the drawer" stays right however it's turned).
export function approachOffset(step, p, t) {
  const v = step.approach?.[p.id] || step.from;
  if (v) return step.local ? new V3(...v).applyQuaternion(finalToWorld(p)) : new V3(...v);
  if (p.dir) return canonicalAxis(p).clone().applyQuaternion(t.quat).multiplyScalar(-(step.slide || 4));
  return new V3(0, 20, 0);
}

// When a step fits hardware to a part that's still in the pile, that part first moves out onto
// the floor in front of the build, turned so the side being worked on faces up. A `turn` step
// turns parts that are set out (say, a drawer turned upside down to fit its runners).
const GAP = 8;

// The box around a part and everything fitted to it so far, at a given orientation.
function footprint(id, quat) {
  const o = G.objects[id];
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
  G.finalM[id].decompose(new V3(), q, new V3());
  return longwise(id, new Q().setFromUnitVectors(new V3(...up).normalize().applyQuaternion(q.invert()), UP));
}

function stagingQuat(parentId, children) {
  const parent = partById(parentId);
  // The product file can say which face should face up while it's worked on.
  if (parent.stageUp) return faceUp(parentId, parent.stageUp);
  const qParent = new Q();
  G.finalM[parentId].decompose(new V3(), qParent, new V3());
  const toParent = qParent.clone().invert();
  const avg = new V3();
  for (const c of children) avg.add(canonicalAxis(c).clone().applyQuaternion(assembledQuat(c)).applyQuaternion(toParent));
  // Hardware going in from one side: turn that side up. Mixed sides (both ends of a shelf): lie flat.
  const q = avg.length() > 0.5 ? new Q().setFromUnitVectors(avg.normalize(), DOWN) : G.pile[parentId].quat.clone();
  return longwise(parentId, q);
}

function moveTo(id, pose, duration = 1.1) {
  const o = G.objects[id];
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
  const taken = G.staged
    .filter((e) => e.ids.some((id) => !isPlaced(id) && G.rest[id] === e.poses[id]))
    .map((e) => [e.z0, e.z1])
    .sort((a, b) => a[0] - b[0]);
  let z = G.stageZ;
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
    if (!row || row.w + GAP + it.size.x > G.stageW) {
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
      prev[it.id] = G.rest[it.id];
      G.rest[it.id] = poses[it.id] = pose;
      moves.push(moveTo(it.id, pose));
      x += it.size.x + GAP;
    }
    z += r.d + GAP;
  }
  G.staged.push({ step, kind, ids: sized.map((it) => it.id), prev, poses, z0, z1: z0 + depth });
  await Promise.all(moves);
}

// Undo the newest setOut, if it belongs to this step.
async function unstage(step, kind) {
  const entry = G.staged.at(-1);
  if (!entry || entry.step !== step || entry.kind !== kind) return;
  G.staged.pop();
  await Promise.all(entry.ids.filter((id) => !isPlaced(id)).map((id) => {
    G.rest[id] = entry.prev[id];
    return moveTo(id, G.rest[id], 0.9);
  }));
}

export async function prepareStep(i) {
  const step = G.product.steps[i];
  if (!step || step.type || G.staged.some((s) => s.step === i && s.kind === 'prep')) return;
  const groups = new Map();
  for (const id of step.parts) {
    const p = partById(id);
    if (!p.parent || isPlaced(p.parent) || G.rest[p.parent] !== G.pile[p.parent]) continue;
    if (!groups.has(p.parent)) groups.set(p.parent, []);
    groups.get(p.parent).push(p);
  }
  if (!groups.size) return;
  await setOut(i, 'prep', [...groups].map(([id, kids]) => ({ id, quat: stagingQuat(id, kids) })));
}

export const unprepareStep = (i) => unstage(i, 'prep');

// The orientation a `turn` step gives a set-out part: a named pose, or a face turned up.
function turnedQuat(id, pose, up) {
  if (up) return faceUp(id, up);
  const final = assembledQuat(partById(id));
  if (pose === 'upright') return final;
  if (pose === 'upsideDown') return new Q().setFromAxisAngle(Z_AXIS, Math.PI).multiply(final);
  return longwise(id, new Q().setFromAxisAngle(X_AXIS, Math.PI).multiply(G.rest[id].quat)); // 'over'
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
    const o = G.objects[id];
    const dy = 0.02 - new THREE.Box3().setFromObject(o).min.y;
    if (Math.abs(dy) < 0.05) return null;
    if (G.rest[id] === G.pile[id]) G.rest[id] = { pos: G.pile[id].pos.clone(), quat: G.pile[id].quat };
    G.rest[id].pos.y += dy;
    const y0 = o.position.y;
    return tween(0.35, (k) => (o.position.y = y0 + dy * ease(k)));
  }));
}

// Hand the part to its holder and snap it to its exact pose there.
function settle(p) {
  const o = G.objects[p.id];
  holderOf(p).add(o);
  holderMatrix(p).decompose(o.position, o.quaternion, o.scale);
}

async function animatePart(step, p, t, forward) {
  const o = G.objects[p.id];
  const s = G.rest[p.id];
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

export async function playStep(i, forward) {
  const step = G.product.steps[i];
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
    list.forEach((p) => scene.attach(G.objects[p.id]));
    if (lowerBy) await tween(0.6, (k) => raise(ease(k)));
    await Promise.all(list.map((p, n) => wait(n * 0.05).then(() => animatePart(step, p, targets[n], false))));
    if (lowerBy) await tween(0.6, (k) => raise(1 - ease(k)));
    await reseat(list);
  }
}

// See-through copies of the next parts, in the places they go.
let ghosts = [];
const ghostMat = new THREE.MeshBasicMaterial({ color: 0x2f7bff, transparent: true, opacity: 0.3, depthTest: false, depthWrite: false });

export function clearGhosts() {
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

export function showGhosts() {
  clearGhosts();
  const step = G.product.steps[G.done];
  if (!step || step.type) return;
  for (const id of step.parts) {
    const p = partById(id);
    const g = new THREE.Group();
    G.objects[id].traverse((o) => {
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

// Gentle pulse on the parts waiting in the pile for this step.
const PULSE = new THREE.Color(0x5c2a0a);
export function updatePulse(t) {
  const step = G.busy ? null : G.product.steps[G.done];
  const wanted = new Set(step ? step.parts : []);
  const k = 0.5 + 0.5 * Math.sin(t * 4);
  for (const [id, o] of Object.entries(G.objects)) {
    o.traverse((m) => {
      if (!m.isMesh || m.userData.part !== id || !m.material.emissive) return;
      m.material.emissive.copy(PULSE).multiplyScalar(wanted.has(id) && id !== G.picked ? 0.4 + 0.6 * k : 0);
    });
  }
  ghostMat.opacity = 0.2 + 0.2 * k;
  markerMat.opacity = 0.45 + 0.45 * k;
  for (const m of markers) m.scale.setScalar(1 + 0.18 * k);
}
