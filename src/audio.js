// Workshop sound effects, synthesised with Web Audio so there are no audio files to load.
// Browsers only allow audio after a tap or click, so the context starts on the first gesture.

let ctx = null;
let master = null;
let noise = null;
let enabled = false;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setSound(on) {
  enabled = on;
  if (on) ensure();
}
export const soundOn = () => enabled;

// Wake the audio context on the first gesture if sound was left on from a previous visit.
window.addEventListener('pointerdown', () => enabled && ensure(), { once: true });

function burst({ at = 0, dur, type = 'bandpass', freq, freqEnd, q = 1, gain }) {
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.004, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

function tone({ at = 0, freq, freqEnd, dur, gain, type = 'sine' }) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function buzz(ms) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Vibration is optional; some browsers and embedded views refuse it.
  }
}

const play = (fn) => (...args) => {
  if (!enabled || !ensure()) return;
  fn(...args);
};

export const sfx = {
  // Metal threads ticking past each other while something screws on or off.
  thread: play((duration, turns) => {
    const n = Math.max(5, Math.round(turns * 7));
    for (let i = 0; i < n; i++) {
      const at = (i / n) * duration + Math.random() * 0.012;
      burst({ at, dur: 0.028, freq: 3200 + Math.random() * 1800, q: 7, gain: 0.16 });
    }
  }),
  // A battery sliding along the tube.
  slide: play((duration) => {
    burst({ dur: Math.max(0.15, duration), type: 'lowpass', freq: 350, freqEnd: 1500, q: 0.8, gain: 0.1 });
  }),
  // A part seating home: crisp tick plus a small thump.
  seat: play(() => {
    tone({ freq: 1900, dur: 0.04, gain: 0.12, type: 'triangle' });
    tone({ freq: 150, freqEnd: 70, dur: 0.1, gain: 0.3 });
    buzz(14);
  }),
  // Setting a part down on the mat.
  thud: play(() => {
    burst({ dur: 0.09, type: 'lowpass', freq: 520, q: 0.7, gain: 0.25 });
    tone({ freq: 120, freqEnd: 60, dur: 0.09, gain: 0.16 });
    buzz(8);
  }),
  // Glass lens being lifted or seated.
  glass: play(() => {
    tone({ freq: 3400, dur: 0.28, gain: 0.05 });
    tone({ freq: 5150, dur: 0.2, gain: 0.025 });
  }),
  // The switch: press and release.
  click: play(() => {
    burst({ dur: 0.014, type: 'highpass', freq: 3800, q: 0.7, gain: 0.35 });
    tone({ freq: 2400, dur: 0.018, gain: 0.08, type: 'square' });
    burst({ at: 0.075, dur: 0.012, type: 'highpass', freq: 4400, q: 0.7, gain: 0.22 });
    buzz(10);
  }),
};
