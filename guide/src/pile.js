// The parts pile, generated rather than authored. Boards lie flat in piles beside the build,
// largest first, with metal runners in piles of their own. Hardware sits in a tray in front of
// the piles, a line or more per kind of part, in the order the steps use it. The floor in front
// of the build stays clear, so parts can be set out there to be worked on. Everything is sized
// from the product, so a dresser gets more room than a side table.
import * as THREE from 'three';
import { V3, Q } from './config.js';
import { MATS, UP, shadowed, absV } from './parts.js';

const PILE_FRONT = 40;
const PILE_BACK = -80;
const PILE_HEIGHT = 22;
export const TRAY = { x: 0, z: 0, w: 30, d: 22 };
export const pileBox = new THREE.Box3();
const isSmall = (p) => p.shape === 'board' && Math.max(...p.size) < 6;

// Lay a box flat: smallest side up, longest side left to right.
function flatQuat(size) {
  const s = new V3(...size);
  const smallest = ['x', 'y', 'z'].reduce((m, d) => (s[d] < s[m] ? d : m), 'x');
  let q = new Q();
  if (smallest === 'x') q.setFromAxisAngle(new V3(0, 0, 1), Math.PI / 2);
  if (smallest === 'z') q.setFromAxisAngle(new V3(1, 0, 0), Math.PI / 2);
  let ext = absV(s.clone().applyQuaternion(q));
  if (ext.z > ext.x) {
    q = new Q().setFromAxisAngle(UP, Math.PI / 2).multiply(q);
    ext = new V3(ext.z, ext.y, ext.x);
  }
  return { q, ext };
}

// Where every part lies at the start. `pileX` is the left edge of the piles, clear of the build.
export function layOut(product, pileX) {
  const parts = product.parts;
  const poses = {};
  pileBox.makeEmpty();
  const area = (p) => { const s = [...p.size].sort((m, n) => n - m); return s[0] * s[1]; };
  const boards = parts.filter((p) => p.shape === 'board' && !isSmall(p));
  const wood = boards.filter((p) => p.material !== 'steel').sort((a, b) => area(b) - area(a));
  const metal = boards.filter((p) => p.material === 'steel').sort((a, b) => area(b) - area(a));

  // Piles fill a column from front to back, then start the next column further out.
  let colX = pileX;
  let colW = 0;
  let zCursor = PILE_FRONT;
  const startPile = (ext) => {
    if (zCursor - ext.z < PILE_BACK && zCursor < PILE_FRONT) {
      colX += colW + 8;
      colW = 0;
      zCursor = PILE_FRONT;
    }
    const pileAt = { x: colX + ext.x / 2, z: zCursor - ext.z / 2, h: 0 };
    zCursor -= ext.z + 6;
    colW = Math.max(colW, ext.x);
    return pileAt;
  };
  for (const list of [wood, metal]) {
    let cur = null;
    for (const p of list) {
      const { q, ext } = flatQuat(p.size);
      if (!cur || cur.h + ext.y > PILE_HEIGHT) cur = startPile(ext);
      const pos = new V3(cur.x, cur.h + ext.y / 2 + 0.02, cur.z);
      poses[p.id] = { pos, quat: q };
      cur.h += ext.y + 0.05;
      pileBox.expandByPoint(pos.clone().sub(ext.clone().multiplyScalar(0.5))).expandByPoint(pos.clone().add(ext.clone().multiplyScalar(0.5)));
    }
  }

  // Hardware, grouped by kind, in the order the steps first use it.
  const firstUse = {};
  product.steps.forEach((st, n) => st.parts.forEach((id) => (firstUse[id] ??= n)));
  const groups = new Map();
  for (const p of parts) {
    if (p.shape === 'board' && !isSmall(p)) continue;
    const k = `${p.label || ''}|${p.name}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  const ordered = [...groups.values()].sort((a, b) => (firstUse[a[0].id] ?? 0) - (firstUse[b[0].id] ?? 0));
  const lying = new Q().setFromAxisAngle(new V3(0, 0, 1), -Math.PI / 2); // local Y → +X
  const MAX_W = 64;
  const local = [];
  let trayW = 24;
  let z = 1.5;
  for (const list of ordered) {
    const p = list[0];
    const headed = p.shape === 'screw' || p.shape === 'nail';
    const headR = p.shape === 'screw' ? p.radius * 2.1 : p.radius * 3;
    const len = isSmall(p) ? p.size[0] : p.length + (headed ? 0.22 : 0);
    const deep = isSmall(p) ? p.size[2] : 2 * (headed ? headR : p.radius);
    const high = isSmall(p) ? p.size[1] / 2 : headed ? headR : p.radius;
    const pitch = len + 0.8;
    const perLine = Math.max(1, Math.floor((MAX_W - 3) / pitch));
    list.forEach((q, i) => {
      const line = Math.floor(i / perLine);
      const col = i % perLine;
      const pos = new V3(1.5 + col * pitch + len / 2, 0.9 + high, z + line * (deep + 0.8) + deep / 2);
      // Headed parts are built from the head, so shift them so the part is centred in its slot.
      if (headed) pos.x += p.length / 2;
      local.push([q.id, pos, isSmall(q) ? new Q() : lying.clone()]);
    });
    trayW = Math.max(trayW, Math.min(list.length, perLine) * pitch + 3);
    z += Math.ceil(list.length / perLine) * (deep + 0.8) + 0.6;
  }
  TRAY.w = trayW;
  TRAY.d = z + 1.5;
  TRAY.x = pileX + TRAY.w / 2;
  TRAY.z = PILE_FRONT + 8 + TRAY.d / 2;
  for (const [id, pos, quat] of local) {
    pos.x += TRAY.x - TRAY.w / 2;
    pos.z += TRAY.z - TRAY.d / 2;
    poses[id] = { pos, quat };
  }
  pileBox.expandByPoint(new V3(TRAY.x - TRAY.w / 2, 0, TRAY.z - TRAY.d / 2)).expandByPoint(new V3(TRAY.x + TRAY.w / 2, 3, TRAY.z + TRAY.d / 2));
  return poses;
}

export function buildTray() {
  const g = new THREE.Group();
  const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(TRAY.w, 0.6, TRAY.d), MATS.cardboard));
  base.position.y = 0.3;
  g.add(base);
  for (const [w, d, x, z] of [[TRAY.w, 0.4, 0, TRAY.d / 2], [TRAY.w, 0.4, 0, -TRAY.d / 2], [0.4, TRAY.d, TRAY.w / 2, 0], [0.4, TRAY.d, -TRAY.w / 2, 0]]) {
    const wall = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, 2.4, d), MATS.cardboard));
    wall.position.set(x, 1.2, z);
    g.add(wall);
  }
  g.position.set(TRAY.x, 0, TRAY.z);
  return g;
}
