// The step card, the step list, the prompt in the 3D view, the floating part labels and the
// embed's control bar.
import { $, V3, EMBED } from './config.js';
import { viewport, camera } from './scene.js';
import { timing } from './tween.js';
import { G, partById } from './state.js';
import { next, back, jumpTo, replay, playAll, restart } from './steps.js';
import { frameCurrent } from './camera.js';
import { renderInfo } from './info.js';

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
    const p = partById(id);
    const k = `${p.label || ''}|${p.name}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts].map(([k, n]) => {
    const [label, name] = k.split('|');
    return `<li>${label ? `<span class="letter">${label}</span>` : ''}${n} × ${name}</li>`;
  }).join('');
}

function speedControl() {
  const opt = (v, label) => `<button type="button" data-speed="${v}" aria-pressed="${timing.playback === v}">${label}</button>`;
  return `<div class="speed" role="group" aria-label="Playback speed"><span>Speed</span>${opt(1, '1×')}${opt(0.5, '½×')}${opt(0.25, '¼×')}</div>`;
}

// A small prompt in the 3D view after each step, so you don't have to look at the panel.
function renderPrompt() {
  const el = $('nextPrompt');
  const step = G.product.steps[G.done];
  const show = G.done > 0 && step && !G.busy && !G.autoplay;
  el.hidden = !show;
  if (show) $('nextTitle').textContent = step.title;
  $('firstTip').hidden = !(G.done === 0 && !G.busy && !tipSeen);
}

export function render() {
  renderInfo();
  renderPrompt();
  if (EMBED) renderEmbed();
  const total = G.product.steps.length;
  const card = $('card');
  // One segment per step reads well up to a few dozen steps; past that, one continuous bar.
  const bar = total > 30
    ? `<span class="done" style="flex: ${G.done}"></span><span class="now" style="flex: ${G.done < total ? 1 : 0}"></span><span style="flex: ${Math.max(0, total - G.done - 1)}"></span>`
    : G.product.steps.map((s, n) => `<span class="${n < G.done ? 'done' : n === G.done ? 'now' : ''}"></span>`).join('');
  if (G.done >= total) {
    card.innerHTML = `
      <p class="eyebrow">Complete</p>
      <div class="steps-bar${total > 30 ? ' long' : ''}">${bar}</div>
      <h2>Built.</h2>
      <p>${G.product.parts.length} parts, ${total} steps. Drag to look it over from every side.</p>
      <div class="actions">
        <button type="button" class="btn" data-act="back" ${G.busy ? 'disabled' : ''}>Back a step</button>
        <button type="button" class="btn primary" data-act="restart" ${G.busy ? 'disabled' : ''}>Start over</button>
      </div>`;
  } else {
    const step = G.product.steps[G.done];
    card.innerHTML = `
      <p class="eyebrow">Step ${G.done + 1} of ${total}${step.manual ? ` · Manual step ${step.manual}` : ''}</p>
      <div class="steps-bar${total > 30 ? ' long' : ''}">${bar}</div>
      <h2>${step.title}</h2>
      <p>${step.text}</p>
      <div class="needs">
        <span class="tool">${icon(step.tool)}${step.tool || 'Hands'}</span>
        ${step.parts.length ? `<ul>${needs(step)}</ul>` : ''}
      </div>
      <div class="actions">
        <button type="button" class="btn" data-act="back" ${G.busy || G.done === 0 ? 'disabled' : ''}>Back</button>
        <button type="button" class="btn primary" data-act="next" ${G.busy ? 'disabled' : ''}>Do this step</button>
        <button type="button" class="btn ghost" data-act="${G.autoplay ? 'stop' : 'play'}" ${G.busy && !G.autoplay ? 'disabled' : ''}>${G.autoplay ? 'Pause' : 'Play all'}</button>
      </div>
      ${step.type ? '' : '<p class="reason">The blue outline shows where the parts go.</p>'}
      ${speedControl()}`;
  }
  $('stepList').innerHTML = G.product.steps.map((s, n) =>
    `<li><button type="button" class="step-row ${n < G.done ? 'done' : n === G.done ? 'now' : ''}" data-step="${n}" ${G.busy ? 'disabled' : ''}>
      <span class="num">${n + 1}</span><span class="t">${s.title}</span></button></li>`).join('');
}

$('card').addEventListener('click', (e) => {
  const sp = e.target.closest('[data-speed]')?.dataset.speed;
  if (sp) {
    timing.playback = Number(sp);
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
    G.autoplay = false;
    render();
  }
});
$('stepList').addEventListener('click', (e) => {
  const n = e.target.closest('[data-step]')?.dataset.step;
  if (n === undefined) return;
  // Tapping the step you just did plays it again; any other step jumps there.
  if (Number(n) === G.done - 1) replay();
  else jumpTo(Number(n));
});
$('nextBtn').addEventListener('click', () => next());
$('replayBtn').addEventListener('click', () => replay());

// A one-time tip for first-time visitors.
let tipSeen = false;
try { tipSeen = localStorage.getItem('guide:tipSeen') === '1'; } catch { /* storage is optional */ }
export function dismissTip() {
  if (tipSeen) return;
  tipSeen = true;
  try { localStorage.setItem('guide:tipSeen', '1'); } catch { /* storage is optional */ }
  $('firstTip').hidden = true;
}

$('firstTip').addEventListener('click', dismissTip);

// Swipe the step card left or right on touch screens. (Swiping the 3D view turns the camera.)
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
export function updateLabels() {
  const step = G.busy ? null : G.product.steps[G.done];
  const wanted = new Set(step ? step.parts : []);
  const shown = new Set();
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  for (const id of Object.keys(labelEls)) labelEls[id].hidden = true;
  if (!step) return;
  for (const id of wanted) {
    const p = partById(id);
    const key = p.label || p.id; // one label per kind of hardware; every unlabelled board gets its own
    if (shown.has(key) || id === G.picked) continue; // the info card already names a tapped part
    shown.add(key);
    let el = labelEls[key];
    if (!el) {
      el = document.createElement('span');
      el.className = 'part-label';
      $('labels').append(el);
      labelEls[key] = el;
    }
    el.textContent = p.label ? `${p.label} · ${p.name}` : p.name;
    _p.copy(G.objects[id].position);
    _p.y += 3;
    _p.project(camera);
    if (_p.z > 1) continue;
    el.hidden = false;
    el.style.transform = `translate(${(_p.x * 0.5 + 0.5) * w}px, ${(-_p.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
  }
}

function renderEmbed() {
  const total = G.product.steps.length;
  const step = G.product.steps[G.done];
  $('embedStep').textContent = G.done >= total
    ? `Built · ${G.product.parts.length} parts · ${total} steps`
    : `Step ${G.done + 1} of ${total} · ${step.title}`;
  $('embedPlay').textContent = G.autoplay ? '❚❚ Pause' : G.done >= total ? '▶ Watch it build' : '▶ Keep building';
}
