// Every animation is a tween: a function of 0 to 1, run over a duration and awaited.
import { reduceMotion, EMBED, EMBED_SPEED } from './config.js';

export const timing = {
  speed: 1, // short-lived speed-up when jumping between steps
  instant: false, // long jumps skip the animation altogether
  playback: 1, // the viewer's chosen speed: 1, 0.5 or 0.25
  last: null, // the tween most recently started, so a caller can cancel it later
};

const tweens = new Set();
export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
try { timing.playback = Number(localStorage.getItem('guide:playback')) || 1; } catch { /* storage is optional */ }
if (EMBED) timing.playback = EMBED_SPEED;
export function tween(duration, fn) {
  if (timing.instant) {
    fn(1);
    timing.last = null;
    return Promise.resolve();
  }
  const d = reduceMotion ? Math.min(duration, 0.12) : (duration * timing.speed) / timing.playback;
  return new Promise((resolve) => {
    timing.last = { t: 0, d, fn, resolve };
    tweens.add(timing.last);
  });
}

export function stepTweens(dt) {
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

export const wait = (s) => tween(s, () => {});

// Stop a running tween early; whoever awaits it carries on.
export function cancel(t) {
  if (t && tweens.delete(t)) t.resolve();
}

// Hammered parts go in with three taps instead of one smooth push.
export const tapEase = (k) => {
  const taps = 3;
  const i = Math.min(taps - 1, Math.floor(k * taps));
  const f = k * taps - i;
  return (i + (f < 0.35 ? ease(f / 0.35) : 1)) / taps;
};
