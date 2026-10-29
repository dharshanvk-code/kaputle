// Moving through the steps: next, back, jumping, replaying and playing them all.
import { EMBED } from './config.js';
import { controls } from './scene.js';
import { wait, timing } from './tween.js';
import { G } from './state.js';
import { playStep, prepareStep, unprepareStep, showGhosts, clearGhosts } from './assembly.js';
import { fit, overviewBox, frameCurrent } from './camera.js';
import { render, dismissTip } from './ui.js';

export async function next() {
  if (G.busy || G.done >= G.product.steps.length) return;
  dismissTip();
  G.busy = true;
  clearGhosts();
  render();
  await playStep(G.done, true);
  G.done++;
  await prepareStep(G.done);
  G.busy = false;
  showGhosts();
  render();
  frameCurrent(0.9);
}

export async function back() {
  if (G.busy || G.done === 0) return;
  G.busy = true;
  clearGhosts();
  render();
  await unprepareStep(G.done); // leaving this step: anything it set out goes back to the pile
  G.done--;
  render();
  frameCurrent(0.7);
  await playStep(G.done, false);
  G.busy = false;
  showGhosts();
  render();
}

export async function jumpTo(target) {
  if (G.busy || target === G.done) return;
  timing.speed = 0.35;
  timing.instant = Math.abs(target - G.done) > 2;
  try {
    while (G.done < target) await next();
    while (G.done > target) await back();
  } finally {
    timing.instant = false;
    timing.speed = 1;
  }
  frameCurrent(0.8);
}

// Replay the step just done: undo it quickly, then play it again at normal speed.
export async function replay() {
  if (G.busy || G.done === 0) return;
  timing.speed = 0.35;
  await back();
  timing.speed = 1;
  await next();
}

export async function playAll() {
  G.autoplay = true;
  controls.autoRotate = false;
  render();
  while (G.autoplay && G.done < G.product.steps.length) {
    await next();
    await wait(0.5);
  }
  G.autoplay = false;
  if (EMBED && G.done >= G.product.steps.length) controls.autoRotate = true;
  render();
}

// The embed's one button: watch the build from the start, pause, or carry on.
export async function embedPlay() {
  if (G.autoplay) {
    G.autoplay = false;
    render();
    return;
  }
  if (G.busy) return;
  if (G.done >= G.product.steps.length) await jumpTo(0);
  playAll();
}

export function restart() {
  G.autoplay = false;
  jumpTo(0).then(() => fit(overviewBox(), 30, 1));
}
