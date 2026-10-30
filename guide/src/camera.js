// Camera moves: framing each step, the whole build, or a part.
import * as THREE from 'three';
import { camera, controls, viewDir } from './scene.js';
import { partExtent, partCentre } from './parts.js';
import { pileBox } from './pile.js';
import { tween, ease, cancel, timing } from './tween.js';
import { G, assembly, partById, isPlaced } from './state.js';
import { targetPose, approachOffset } from './assembly.js';

// Only one camera move at a time: a new one takes over from wherever the last one had got to.
let cameraMove = null;
function animateCamera(pos, target, duration) {
  cancel(cameraMove);
  const p0 = camera.position.clone();
  const t0 = controls.target.clone();
  const finished = tween(duration, (k) => {
    const e = ease(k);
    camera.position.lerpVectors(p0, pos, e);
    controls.target.lerpVectors(t0, target, e);
  });
  cameraMove = timing.last;
  return finished;
}

export function fit(box, azimuth, duration = 1, minRadius = 22) {
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const vf = THREE.MathUtils.degToRad(camera.fov) / 2;
  const hf = Math.atan(Math.tan(vf) * camera.aspect);
  const dist = (Math.max(minRadius, sphere.radius) / Math.sin(Math.min(vf, hf))) * 1.02;
  return animateCamera(sphere.center.clone().addScaledVector(viewDir(azimuth), dist), sphere.center, duration);
}

function stepBox(i) {
  const step = G.product.steps[i];
  const box = new THREE.Box3();
  for (const id of step.parts) {
    const p = partById(id);
    const t = targetPose(p);
    const ext = partExtent(p).applyQuaternion(t.quat);
    ext.set(Math.abs(ext.x), Math.abs(ext.y), Math.abs(ext.z)).multiplyScalar(0.5);
    const centre = partCentre(p).applyQuaternion(t.quat).add(t.pos);
    box.expandByPoint(centre.clone().sub(ext)).expandByPoint(centre.clone().add(ext));
    box.expandByPoint(t.pos.clone().add(approachOffset(step, p, t)));
  }
  return box;
}

export function overviewBox() {
  return G.assembledBox.clone().union(pileBox);
}

// Steps that add a board show the whole piece so far; hardware steps zoom in on the joints.
export function frameCurrent(duration = 1) {
  const step = G.product.steps[G.done];
  if (!step) return fit(G.assembledBox, 30, duration);
  if (step.type === 'flip') {
    const box = new THREE.Box3().setFromObject(assembly);
    box.max.y += step.lift ?? 30;
    return fit(box, step.view ?? 30, duration);
  }
  if (step.type === 'turn') {
    const box = new THREE.Box3();
    for (const id of step.turn) box.union(new THREE.Box3().setFromObject(G.objects[id]));
    box.max.y += 20;
    return fit(box, step.view ?? 30, duration);
  }
  const box = stepBox(G.done);
  // Hardware fitted to a part that's been set out: show the whole part, not just the joints.
  for (const id of step.parts) {
    const parent = partById(id).parent;
    if (parent && !isPlaced(parent)) box.union(new THREE.Box3().setFromObject(G.objects[parent]));
    // A part that was set out earlier is picked up from there, so keep it in view too.
    if (!isPlaced(id) && G.rest[id] !== G.pile[id]) box.union(new THREE.Box3().setFromObject(G.objects[id]));
  }
  const addsBoard = step.parts.some((id) => partById(id).shape === 'board');
  if (addsBoard && assembly.children.length) box.union(new THREE.Box3().setFromObject(assembly));
  if (step.lower) box.max.y += step.lower;
  return fit(box, step.view ?? 30, duration);
}
