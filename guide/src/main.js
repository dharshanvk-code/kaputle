// The assembly-guide player. It knows nothing about any one product: it reads a product file
// (parts with sizes and final positions, plus ordered steps) and builds the 3D scene, the parts
// pile and the step-by-step animation from that alone.
import * as THREE from 'three';
import { $, V3, Q, reduceMotion, PRODUCT_NAME, PRODUCT_URL, EMBED } from './config.js';
import { renderer, scene, camera, controls, canvas, viewDir, resize } from './scene.js';
import { buildPart, assembledQuat, partExtent, partCentre, absV } from './parts.js';
import { drillHoles } from './holes.js';
import { layOut, buildTray } from './pile.js';
import { stepTweens, wait, timing } from './tween.js';
import { G, assembly, turnQ, nextFlip } from './state.js';
import { restY, prepareStep, showGhosts, updatePulse } from './assembly.js';
import { fit, overviewBox, frameCurrent } from './camera.js';
import { next, back, jumpTo, replay, playAll, embedPlay } from './steps.js';
import { render, updateLabels } from './ui.js';
import { selectPart, placeInfo, screenPoint } from './info.js';

async function start() {
  try {
    const res = await fetch(PRODUCT_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    G.product = await res.json();
  } catch (err) {
    $('loading').textContent = `Couldn't load the product file (${PRODUCT_URL}). ${err.message}`;
    return;
  }
  $('productName').textContent = G.product.name;
  $('partCount').textContent = `${G.product.parts.length} parts · ${G.product.steps.length} steps`;
  if (G.product.source?.url) {
    // The manual this guide was built from, linked rather than copied.
    const link = document.createElement('a');
    link.href = G.product.source.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = `Based on: ${G.product.source.label || 'the original manual'} ↗`;
    $('productSource').replaceChildren(link);
    $('productSource').hidden = false;
  }

  G.product.steps.forEach((st, n) => st.parts.forEach((id) => (G.stepOf[id] = n)));
  for (const p of G.product.parts) {
    const q = assembledQuat(p);
    G.finalM[p.id] = new THREE.Matrix4().compose(new V3(...p.pos), q, new V3(1, 1, 1));
    const ext = absV(partExtent(p).applyQuaternion(q)).multiplyScalar(0.5);
    const centre = partCentre(p).applyQuaternion(q).add(new V3(...p.pos));
    G.assembledBox.expandByPoint(centre.clone().sub(ext)).expandByPoint(centre.clone().add(ext));
  }
  // The size is worked out from the boards (not hardware or metal fittings like wall brackets),
  // so every product states it the same way.
  const woodBox = new THREE.Box3();
  for (const p of G.product.parts) {
    if (p.shape !== 'board' || ['steel', 'brass'].includes(p.material)) continue;
    const half = new V3(...p.size).multiplyScalar(0.5);
    woodBox.expandByPoint(new V3(...p.pos).sub(half)).expandByPoint(new V3(...p.pos).add(half));
  }
  const dims = woodBox.getSize(new V3());
  $('productSpec').textContent = [`About ${Math.round(dims.x)} × ${Math.round(dims.y)} × ${Math.round(dims.z)} cm`, G.product.spec].filter(Boolean).join(' · ');
  // Leave room for the build in any orientation it's turned to: lying down, it's wider.
  const half = G.assembledBox.getSize(new V3()).multiplyScalar(0.5);
  const reach = Math.max(half.x, half.y, half.z);
  const pileX = reach + 30;
  G.stageZ = reach + 14;
  G.stageW = Math.max(120, 2 * (pileX - 14));

  const poses = layOut(G.product, pileX);
  for (const p of G.product.parts) {
    const o = buildPart(p);
    G.objects[p.id] = o;
    o.userData.partId = p.id;
    G.pile[p.id] = poses[p.id];
    G.rest[p.id] = G.pile[p.id];
    o.position.copy(G.pile[p.id].pos);
    o.quaternion.copy(G.pile[p.id].quat);
    scene.add(o);
  }
  // The assembly turns about its own middle and always rests on the floor.
  G.assembledBox.getCenter(G.pivot);
  const startQ = G.product.startPose ? turnQ(G.product.startPose.axis, G.product.startPose.angle ?? 180)
    : G.product.startFlipped ? turnQ(G.product.startFlipped, 180) : new Q();
  assembly.quaternion.copy(startQ);
  assembly.position.set(G.pivot.x, restY(startQ, nextFlip(0)), G.pivot.z);
  const toLocal = new THREE.Matrix4().makeTranslation(-G.pivot.x, -G.pivot.y, -G.pivot.z);
  for (const p of G.product.parts) {
    G.localM[p.id] = toLocal.clone().multiply(G.finalM[p.id]);
    if (p.parent) G.relM[p.id] = G.finalM[p.parent].clone().invert().multiply(G.finalM[p.id]);
  }
  scene.add(buildTray());
  drillHoles(G.product, G.objects);

  resize();
  const box = overviewBox();
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).addScaledVector(viewDir(30), sphere.radius * 3);
  fit(box, 30, reduceMotion ? 0.01 : 1.4);
  G.busy = true;
  render();

  const clock = new THREE.Clock();
  let first = true;
  let elapsed = 0;
  const frame = (dt) => {
    elapsed += dt;
    stepTweens(dt);
    controls.update();
    updatePulse(elapsed);
    updateLabels();
    placeInfo();
    renderer.render(scene, camera);
    if (first) {
      first = false;
      $('loading').hidden = true;
      window.__guideReady = true;
    }
  };
  renderer.setAnimationLoop(() => frame(Math.min(clock.getDelta(), 0.05)));
  // For recording smooth videos on slow machines: stop the clock and step frames by hand.
  window.guide.capture = { pause: () => renderer.setAnimationLoop(null), frame };

  // After the opening shot, set out whatever the first step works on.
  await wait(1.4);
  await prepareStep(0);
  G.busy = false;
  showGhosts();
  render();
  if (G.staged.length) frameCurrent(1);
  if (EMBED) {
    // Open on the finished product, slowly turning, with the build a press away.
    $('embedBar').hidden = false;
    $('embedOpen').href = `${location.pathname}?product=${PRODUCT_NAME}`;
    $('embedPlay').addEventListener('click', embedPlay);
    await jumpTo(G.product.steps.length);
    controls.autoRotate = true;
    // Tell the page it can swap its placeholder image for this, now the finished product shows.
    if (window.parent !== window) window.parent.postMessage({ kaputle: 'ready' }, '*');
  }
}

// Handy for debugging, and used by the tests and the video recorder.
window.guide = {
  next, back, jumpTo, playAll, replay, selectPart,
  screenPointOf: (id) => screenPoint(id, canvas.getBoundingClientRect()),
  isBusy: () => G.busy,
  done: () => G.done,
  setInstant: (on) => (timing.instant = on), // skip animations, for fast automated checks
  camera, controls,
  objects: G.objects,
  capture: null, // { pause, frame }: stop the clock and step frames by hand, set once running
};

start();
