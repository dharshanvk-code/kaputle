// Tapping a part: an outline around it and a card saying what it is and where it goes.
import * as THREE from 'three';
import { $, V3 } from './config.js';
import { canvas, camera } from './scene.js';
import { G, partById, isPlaced } from './state.js';
import { jumpTo } from './steps.js';
import { diagramFor, DIAGRAM_W, DIAGRAM_H } from './diagram.js';

const coarsePointer = matchMedia('(pointer: coarse)').matches;
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const _c = new V3();

export function screenPoint(id, rect) {
  new THREE.Box3().setFromObject(G.objects[id]).getCenter(_c).project(camera);
  return { x: (_c.x * 0.5 + 0.5) * rect.width, y: (-_c.y * 0.5 + 0.5) * rect.height, behind: _c.z > 1 };
}

function pick(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  ndc.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(Object.values(G.objects), true).find((h) => h.object.userData.part);
  const hitId = hit?.object.userData.part ?? null;
  if (hitId && partById(hitId).shape !== 'board') return hitId;
  // Hardware is tiny, so a near miss still counts, and it wins over the board behind it.
  let best = null;
  let bestD = coarsePointer ? 30 : 16;
  for (const p of G.product.parts) {
    if (p.shape === 'board') continue;
    const sp = screenPoint(p.id, rect);
    const d = Math.hypot(sp.x - x, sp.y - y);
    if (!sp.behind && d < bestD) {
      bestD = d;
      best = p.id;
    }
  }
  return best || hitId;
}

function partStatus(id) {
  const n = G.stepOf[id];
  if (n < G.done) return `Fitted in step ${n + 1}`;
  if (n === G.done) return 'Needed for this step';
  if (!isPlaced(id) && G.rest[id] !== G.pile[id]) return `Set out, waiting for step ${n + 1}`;
  if (isPlaced(id)) return `Fitted to the ${partById(partById(id).parent).name.toLowerCase()}`;
  return 'Still in the box';
}

const round = (n) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);

function partDetails(p) {
  const rows = [];
  if (p.shape === 'board') {
    const [a, b, c] = [...p.size].sort((m, n) => n - m);
    rows.push(['Size', `about ${round(a)} × ${round(b)} × ${round(c)} cm`]);
    const fitted = new Map();
    for (const q of G.product.parts) {
      if (q.parent !== p.id) continue;
      const k = `${q.label ? `${q.label} ` : ''}${q.name}`;
      fitted.set(k, (fitted.get(k) || 0) + 1);
    }
    if (fitted.size) rows.push(['Fitted to it', [...fitted].map(([k, n]) => `${n} × ${k}`).join(', ')]);
  } else {
    rows.push(['Size', `about ${round(p.length)} cm long`]);
    if (p.parent) rows.push(['Goes into', `the ${partById(p.parent).name.toLowerCase()}`]);
  }
  return rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
}

export function renderInfo() {
  const el = $('partInfo');
  if (!G.picked) {
    el.hidden = true;
    return;
  }
  const p = partById(G.picked);
  const n = G.stepOf[G.picked];
  const same = G.product.parts.filter((q) => q.name === p.name && (q.label || '') === (p.label || '')).length;
  const hasDiagram = p.shape === 'board' || p.parent;
  el.innerHTML = `
    <button type="button" class="close" data-info="close" aria-label="Close">×</button>
    <p class="info-name">${p.label ? `<span class="letter">${p.label}</span>` : ''}${p.name}</p>
    <p class="info-meta">${same > 1 ? `1 of ${same} · ` : ''}${partStatus(G.picked)}</p>
    ${hasDiagram ? `<img class="info-diagram" src="${diagramFor(G.picked)}" width="${DIAGRAM_W / 2}" height="${DIAGRAM_H / 2}" alt="Where the ${p.name.toLowerCase()} goes in the finished ${G.product.name.toLowerCase()}, highlighted">` : ''}
    <dl class="info-details">${partDetails(p)}</dl>
    <p class="info-step">Used in step ${n + 1}: ${G.product.steps[n].title}</p>
    ${n !== G.done ? `<button type="button" class="btn small" data-info="go" ${G.busy ? 'disabled' : ''}>Go to step ${n + 1}</button>` : ''}`;
  el.hidden = false;
  placeInfo();
}

// Keep the card beside the part as the camera moves, inside the viewport.
export function placeInfo() {
  if (!G.picked) return;
  const el = $('partInfo');
  const rect = canvas.getBoundingClientRect();
  const sp = screenPoint(G.picked, rect);
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let x = sp.x + 16;
  if (x + w > rect.width - 10) x = sp.x - w - 16;
  x = Math.max(10, Math.min(x, rect.width - w - 10));
  const y = Math.max(10, Math.min(sp.y - h / 2, rect.height - h - 10));
  el.style.transform = `translate(${x}px, ${y}px)`;
}

// An accent rim around the tapped part: a slightly larger copy drawn from the inside, so only
// its edge shows. Thicker and easier to see than 1px lines.
const outlineMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a, side: THREE.BackSide });
let outline = [];

export function selectPart(id) {
  for (const l of outline) l.removeFromParent();
  outline = [];
  G.picked = id;
  if (id) {
    outlineMat.color.set(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d9531c');
    G.objects[id].traverse((m) => {
      if (!m.isMesh || m.userData.part !== id) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const size = m.geometry.boundingBox.getSize(new V3());
      const rim = partById(id).shape === 'board' ? 0.5 : 0.18; // cm of rim on each side
      const l = new THREE.Mesh(m.geometry, outlineMat);
      l.scale.set(1 + (2 * rim) / Math.max(size.x, 0.01), 1 + (2 * rim) / Math.max(size.y, 0.01), 1 + (2 * rim) / Math.max(size.z, 0.01));
      l.raycast = () => {};
      outline.push([m, l]);
    });
    outline = outline.map(([m, l]) => (m.add(l), l));
  }
  renderInfo();
}

let down = null;
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, t: performance.now() };
});
canvas.addEventListener('pointerup', (e) => {
  if (!down || !G.product) return;
  const tap = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && performance.now() - down.t < 500;
  down = null;
  if (tap) selectPart(pick(e.clientX, e.clientY));
});
let lastHover = 0;
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || e.buttons || !G.product) return;
  if (performance.now() - lastHover < 120) return;
  lastHover = performance.now();
  canvas.style.cursor = pick(e.clientX, e.clientY) ? 'pointer' : '';
});
$('partInfo').addEventListener('click', (e) => {
  const act = e.target.closest('[data-info]')?.dataset.info;
  if (act === 'close') selectPart(null);
  if (act === 'go') jumpTo(G.stepOf[G.picked]);
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') selectPart(null);
});
