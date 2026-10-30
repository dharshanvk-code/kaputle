#!/usr/bin/env node
// Writes guide/products/hemnes.json, the 8-drawer dresser guide, from the IKEA HEMNES manual
// (AA-2406539-5). It's too big to write by hand as JSON (497 parts), so this places the parts,
// then lists the steps in the manual's order.
//
//   node tools/products/hemnes.mjs [out.json]
//
// Finished, upright frame in cm: x left to right, y up, z back to front (front is +z). Sizes are
// estimates from the drawings; part counts, part numbers and step order follow the manual.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatProduct } from '../format-product.mjs';
import { validateProduct } from '../validate-product.mjs';

const parts = [];
const steps = [];
const byId = new Map();

const round3 = (v) => v.map((x) => Math.round(x * 1000) / 1000);

function add(p) {
  if (byId.has(p.id)) throw new Error(`duplicate part id ${p.id}`);
  byId.set(p.id, p);
  parts.push(p);
  return p.id;
}

function board(id, name, size, pos, material, { label = '', parent, stageUp } = {}) {
  const p = { id, name, label, shape: 'board', size: round3(size), pos: round3(pos), material };
  if (parent) p.parent = parent;
  if (stageUp) p.stageUp = stageUp;
  return add(p);
}

function hw(id, name, label, shape, radius, length, pos, dir, material, parent) {
  const p = { id, name, label, shape, radius, length, pos: round3(pos), dir, material };
  if (parent) p.parent = parent;
  return add(p);
}

function step(title, text, tool, ids, { manual, ...rest } = {}) {
  steps.push({ ...(manual !== undefined && { manual }), title, text, tool, parts: [...ids], ...rest });
}

function flip(title, text, axis, angle, { manual } = {}) {
  steps.push({ type: 'flip', ...(manual !== undefined && { manual }), axis, angle, title, text, tool: 'Hands', parts: [] });
}

function turn(title, text, ids, { manual, pose, up } = {}) {
  steps.push({
    type: 'turn', ...(manual !== undefined && { manual }), title, text, tool: 'Hands', parts: [], turn: [...ids],
    ...(pose && { pose }), ...(up && { up }),
  });
}

// Hardware by part number.
const stud118331 = (id, pos, dir, parent) => hw(id, 'Cam stud', '118331', 'pin', 0.35, 3.4, pos, dir, 'steel', parent); // half in each piece
const dowel101350 = (id, pos, dir, parent) => hw(id, 'Short dowel', '101350', 'dowel', 0.4, 3, pos, dir, 'dowel', parent);
const lock110630 = (id, pos, dir, parent) => hw(id, 'Cam lock', '110630', 'pin', 0.75, 1.2, pos, dir, 'steel', parent); // a sliver proud of its hole
const lockAt = (facePoint, dir) => facePoint.map((v, i) => v + dir[i] * 0.4);

const W = 'white'; // the stained solid-wood parts you see
const IN = 'birch'; // drawer boxes
const HB = 'hardboard';
const ST = 'steel';
const SIDES = [['L', -1], ['R', 1]];

// ---- carcase geometry
const LEG_X = 76.75; // leg centres, x
const LEG_Z = 21.25; // leg centres, z
const LEG_IN = 74.5; // inner faces of the legs (x)
const PANEL_IN = 75.85; // inner face of the side panels (x)
const RAIL_Z = 22.0; // front rails (the back rail is at -22)
const TOP_Y = 91.0; // top rails, 89-93
const BOT_Y = 11.5; // bottom front rail, 9-14
const ROW_Y = [44.5, 69.5]; // short rails, 3 tall
const RUN_Y = [15.5, 47.5, 72.5]; // cabinet runners: bottom, middle and top rows
const STRIP_Z = 12.0;

// Legs, with the manual's labels L1, L2, R1, R2 (1 is the front, 2 the back).
const legs = {};
for (const [side, sx] of SIDES) {
  for (const [n, sz] of [['1', 1], ['2', -1]]) {
    const where = `${sx < 0 ? 'Left' : 'Right'}${sz > 0 ? ' front' : ' back'}`;
    legs[side + n] = board(`leg${side}${n}`, `${where} leg`, [4.5, 92.4, 4.5], [sx * LEG_X, 46.8, sz * LEG_Z], W, { label: side + n });
  }
}
const legSigns = (k) => [k[0] === 'L' ? -1 : 1, k[1] === '1' ? 1 : -1];

const panelL = board('panelL', 'Left side panel', [1.8, 84, 38], [-LEG_X, 51, 0], W, { stageUp: [1, 0, 0] });
const panelR = board('panelR', 'Right side panel', [1.8, 84, 38], [LEG_X, 51, 0], W, { stageUp: [-1, 0, 0] });
const panels = { L: panelL, R: panelR };
for (const k of Object.keys(legs)) byId.get(legs[k]).parent = panels[k[0]];

// Step 1: 12 cam studs in the legs, on the face toward the panel.
const s1 = [];
for (const [k, leg] of Object.entries(legs)) {
  const [sx, sz] = legSigns(k);
  [22, 52, 82].forEach((y, j) => s1.push(stud118331(`stud1${k}${j}`, [sx * LEG_X, y, sz * 19], [0, 0, sz], leg)));
}
// Step 2: 8 dowels in the legs.
const s2 = [];
for (const [k, leg] of Object.entries(legs)) {
  const [sx, sz] = legSigns(k);
  [37, 67].forEach((y, j) => s2.push(dowel101350(`dowel2${k}${j}`, [sx * LEG_X, y, sz * 19], [0, 0, sz], leg)));
}
// Step 3: 12 cam locks in the panels.
const s3 = [];
for (const [side, sx] of SIDES) {
  for (const sz of [1, -1]) {
    [22, 52, 82].forEach((y, j) => s3.push(lock110630(`lock3${side}${sz > 0 ? 'f' : 'b'}${j}`, lockAt([sx * PANEL_IN, y, sz * 17], [sx, 0, 0]), [sx, 0, 0], panels[side])));
  }
}
// Step 4: long dowels and the interlock strips.
const s4a = [];
const strips = {};
for (const [side, sx] of SIDES) {
  [25, 53, 81].forEach((y, j) => s4a.push(hw(`dowel4${side}${j}`, 'Long dowel', '101353', 'dowel', 0.5, 2.2, [sx * PANEL_IN, y, STRIP_Z], [sx, 0, 0], 'dowel', panels[side])));
  strips[side] = board(`strip${side}`, `${sx < 0 ? 'Left' : 'Right'} interlock strip`, [1.2, 72, 3], [sx * (PANEL_IN - 0.6), 53, STRIP_Z], W, { parent: panels[side] });
}
// Steps 5-6: cabinet runners on the side frames.
const sideRunners = {};
const sideScrews = {};
for (const [side, sx, stamp] of [['R', 1, 'CR'], ['L', -1, 'CL']]) {
  const rx = sx * (PANEL_IN - 1.2 - 0.5);
  sideRunners[side] = RUN_Y.map((y, j) => board(`runner${side}${j}`, `Cabinet runner IKEA ${stamp}`, [1.0, 2, 38], [rx, y, 0], ST, { label: '10085235', parent: panels[side] }));
  sideScrews[side] = RUN_Y.flatMap((y, j) => [-15, 16].map((z, k) =>
    hw(`screw5${side}${j}${k}`, 'Screw', '107716', 'screw', 0.25, 2.8, [sx * (PANEL_IN - 1.2 - 1.0), y, z], [sx, 0, 0], ST, panels[side]))); // through the runner into the panel
}
// Step 7: glides.
const s7 = Object.entries(legs).map(([k, leg]) => {
  const [sx, sz] = legSigns(k);
  return board(`glide${k}`, 'Floor glide', [4.2, 0.6, 4.2], [sx * LEG_X, 0.3, sz * LEG_Z], 'plastic', { label: '191064/5', parent: leg });
});

// Rails. Each rail end has a cam stud above its centre line and a dowel below it.
const rails = {
  topF: board('railTopF', 'Top front rail', [149, 4, 3], [0, TOP_Y, RAIL_Z], W),
  topB: board('railTopB', 'Top back rail', [149, 4, 3], [0, TOP_Y, -RAIL_Z], W),
  bot: board('railBot', 'Bottom front rail', [149, 5, 3], [0, BOT_Y, RAIL_Z], W),
};
for (const [side, sx] of SIDES) {
  ROW_Y.forEach((y, j) => {
    rails[`short${side}${j}`] = board(`railShort${side}${j}`, `Short rail, ${sx < 0 ? 'left' : 'right'} ${j === 0 ? 'lower' : 'upper'}`, [73, 3, 3], [sx * 38, y, RAIL_Z], W);
  });
}
const STUD_DY = { topF: 0.9, topB: 0.9, bot: 1.2, short: 0.7 };
function railYs(key) {
  const dy = STUD_DY[key.startsWith('short') ? 'short' : key];
  const y = byId.get(rails[key]).pos[1];
  return [y + dy, y - dy]; // cam stud, dowel
}

// Step 8: 10 cam studs in the legs' inner faces (4 per front leg, 1 per back leg).
const s8 = [];
for (const [side, sx] of SIDES) {
  [`topF`, `short${side}1`, `short${side}0`, `bot`].forEach((key, j) =>
    s8.push(stud118331(`stud8${side}1${j}`, [sx * LEG_IN, railYs(key)[0], RAIL_Z], [sx, 0, 0], legs[`${side}1`])));
  s8.push(stud118331(`stud8${side}2`, [sx * LEG_IN, railYs('topB')[0], -RAIL_Z], [sx, 0, 0], legs[`${side}2`]));
}

// Step 9: 14 dowels in the rail ends.
const s9 = [];
for (const [key, rid] of Object.entries(rails)) {
  const r = byId.get(rid);
  const y = railYs(key)[1];
  s9.push(dowel101350(`dowel9${key}a`, [r.pos[0] - r.size[0] / 2, y, r.pos[2]], [1, 0, 0], rid));
  s9.push(dowel101350(`dowel9${key}b`, [r.pos[0] + r.size[0] / 2, y, r.pos[2]], [-1, 0, 0], rid));
}

function railLocks(prefix, side) {
  const sx = side === 'L' ? -1 : 1;
  return ['topF', 'topB', 'bot', `short${side}0`, `short${side}1`].map((key) => {
    const back = key === 'topB';
    const d = back ? [0, 0, -1] : [0, 0, 1];
    return lock110630(`${prefix}${key}`, lockAt([sx * (LEG_IN - 2.0), railYs(key)[0], back ? -20.5 : 20.5], d), d);
  });
}

// Centre divider: the front post is the piece the others are laid against.
const divF = board('divFront', 'Centre divider, front post', [3, 75, 3], [0, 51.5, RAIL_Z], W, { stageUp: [1, 0, 0] });
const divB = board('divBack', 'Centre divider, back post', [3, 75, 3], [0, 51.5, -RAIL_Z], W, { parent: divF });
const divS = board('divStrip', 'Centre divider, interlock strip', [1.5, 75, 3], [0, 51.5, STRIP_Z], W, { parent: divF });
const divRunners = {};
const divScrews = {};
for (const [stamp, sx] of [['CL', 1], ['CR', -1]]) {
  divRunners[stamp] = RUN_Y.map((y, j) => board(`runnerDiv${stamp}${j}`, `Cabinet runner IKEA ${stamp}`, [1.0, 2, 44], [sx * 2.0, y, 0], ST, { label: '10085261', parent: divF }));
  divScrews[stamp] = RUN_Y.flatMap((y, j) => [-21.5, STRIP_Z, 21.5].map((z, k) =>
    hw(`screw14${stamp}${j}${k}`, 'Screw', '108462', 'screw', 0.25, 2.0, [sx * 2.5, y, z], [-sx, 0, 0], ST, divF))); // reaches the thinner strip too
}
const s16 = [1, -1].flatMap((sx) => ROW_Y.map((y, j) =>
  hw(`stud16${sx > 0 ? 'R' : 'L'}${j}`, 'Cam stud', '603440', 'pin', 0.35, 3.4, [sx * 1.5, y + 0.7, RAIL_Z], [-sx, 0, 0], ST, divF)));
const d17 = dowel101350('dowel17', [0, 14, 21.4], [0, 1, 0], divF);
const d18 = dowel101350('dowel18', [0, 89, 21.4], [0, -1, 0], divF);
const b20 = [
  hw('bolt20top', 'Bolt', '100214', 'screw', 0.35, 7, [0, 93, 22.6], [0, -1, 0], ST),
  hw('bolt20back', 'Bolt', '100214', 'screw', 0.35, 7, [0, 93, -22.6], [0, -1, 0], ST),
  hw('bolt20bot', 'Bolt', '100214', 'screw', 0.35, 7, [0, 9, 22.9], [0, 1, 0], ST),
];
const l20 = ROW_Y.map((y, j) => lock110630(`lock20R${j}`, lockAt([3.5, y + 0.7, 20.5], [0, 0, 1]), [0, 0, 1]));
const l22 = ROW_Y.map((y, j) => lock110630(`lock22L${j}`, lockAt([-3.5, y + 0.7, 20.5], [0, 0, 1]), [0, 0, 1]));
const l13 = railLocks('lock13', 'R');
const l24 = railLocks('lock24', 'L');
const foot = hw('foot', 'Adjustable foot', '107862', 'knob', 1.3, 2.4, [0, 9 - 1.2, 21.3], [0, 1, 0], 'plastic');

// Top-row dividers.
const topDiv = {};
const topRunners = {};
const topScrews = {};
const topDowels = {};
for (const [side, sx] of SIDES) {
  const x = sx * 38;
  topDiv[side] = board(`topDiv${side}`, `Top-row divider, ${sx < 0 ? 'left' : 'right'}`, [1.6, 22, 43.9], [x, 82, 1.45], W, { stageUp: [-1, 0, 0] });
  topRunners[side] = {
    CR: board(`runnerTop${side}CR`, 'Cabinet runner IKEA CR', [1.0, 2, 41], [x - 1.3, RUN_Y[2], 0], ST, { parent: topDiv[side] }),
    CL: board(`runnerTop${side}CL`, 'Cabinet runner IKEA CL', [1.0, 2, 41], [x + 1.3, RUN_Y[2], 0], ST, { parent: topDiv[side] }),
  };
  topScrews[side] = {
    CR: [-16, 16].map((z, k) => hw(`screw27${side}${k}`, 'Screw', '108462', 'screw', 0.25, 1.6, [x - 1.8, RUN_Y[2], z], [1, 0, 0], ST, topDiv[side])),
    CL: [-16, 16].map((z, k) => hw(`screw28${side}${k}`, 'Screw', '108462', 'screw', 0.25, 1.6, [x + 1.8, RUN_Y[2], z], [-1, 0, 0], ST, topDiv[side])),
  };
  topDowels[side] = dowel101350(`dowel29${side}`, [x, 93, -14], [0, -1, 0], topDiv[side]);
}
const s30a = SIDES.map(([side, sx]) => hw(`screw30${side}`, 'Screw', '100232', 'screw', 0.35, 6, [sx * 38, 93, 21.0], [0, -1, 0], 'plastic'));
const s30b = SIDES.map(([side, sx]) => hw(`bolt30${side}`, 'Bolt', '100214', 'screw', 0.35, 6, [sx * 38, 68, 21.0], [0, 1, 0], ST));

// Top.
const top = board('top', 'Top', [160, 3, 50], [0, 94.5, 1], W, { stageUp: [0, -1, 0] });
const brackets = SIDES.map(([side, sx]) => board(`bracket${side}`, 'Wall bracket', [4, 0.4, 2.2], [sx * 70, 92.8, -24.4], ST, { label: '106989', parent: top }));
const washers = SIDES.map(([side, sx]) => hw(`washer${side}`, 'Washer', '100823', 'pin', 0.6, 0.12, [sx * 70, 92.54, -23.8], [0, 1, 0], ST, top));
const bracketScrews = SIDES.map(([side, sx]) => hw(`screw31${side}`, 'Screw', '109049', 'screw', 0.25, 1.6, [sx * 70, 92.48, -23.8], [0, 1, 0], ST, top));
const topStuds = [
  ...[-63, -42, -21, 0, 21, 42, 63].map((x) => [x, 93, -21.2]),
  ...[-1, 1].flatMap((sx) => [-10, 10].map((z) => [sx * LEG_X, 93, z])),
];
const s32 = topStuds.map((pos, k) => stud118331(`stud32_${k}`, pos, [0, 1, 0], top));
const s33 = [
  ...Object.keys(legs).map((k) => {
    const [sx, sz] = legSigns(k);
    return dowel101350(`dowel33${k}`, [sx * LEG_X, 93, sz * LEG_Z], [0, -1, 0]);
  }),
  ...SIDES.map(([side, sx]) => dowel101350(`dowel33${side}P`, [sx * LEG_X, 93, 0], [0, -1, 0])),
];
const b35 = [-57, -19, 19, 57].map((x, k) => hw(`bolt35_${k}`, 'Bolt', '100214', 'screw', 0.35, 6, [x, 89, RAIL_Z], [0, 1, 0], ST));
const l36 = topStuds.map(([x, , z], k) => {
  if (Math.abs(x) > 70) {
    const sx = x < 0 ? -1 : 1;
    return lock110630(`lock36_${k}`, lockAt([sx * PANEL_IN, 91.6, z], [sx, 0, 0]), [sx, 0, 0]);
  }
  return lock110630(`lock36_${k}`, lockAt([x, 91.6, -20.5], [0, 0, -1]), [0, 0, -1]);
});

// Back panels and nails.
const BACK_Z = -23.65;
const backLower = board('backLower', 'Back panel, lower', [157, 41.75, 0.3], [0, 9 + 41.75 / 2, BACK_Z], HB);
const backUpper = board('backUpper', 'Back panel, upper', [157, 41.75, 0.3], [0, 9 + 41.75 * 1.5, BACK_Z], HB);
const nail = (id, x, y) => hw(id, 'Nail', '101221', 'nail', 0.1, 2, [x, y, -23.8], [0, 0, 1], ST);
const n39 = nail('nail39', -77, 91);
const n40 = nail('nail40', 77, 91);
const n41 = nail('nail41', -77, 11);
const n42 = [
  ...[-58, -39, -20, 20, 39, 58].map((x, k) => nail(`nail42top${k}`, x, 91)),
  ...SIDES.flatMap(([side, sx]) => [21, 33, 45, 57, 69, 81].map((y, k) => nail(`nail42${side}${k}`, sx * 77, y))),
  ...[16, 26, 36, 46, 56, 66, 76, 85].map((y, k) => nail(`nail42post${k}`, 0, y)),
  nail('nail42corner', 77, 11),
];

// ---- drawers: front centre x and y, width, height, size, and where it goes
const DRAWERS = {
  S1: [-56.65, 80, 35.3, 17.6, 'small', 'top row, far left'],
  S2: [-19.35, 80, 35.3, 17.6, 'small', 'top row, left of centre'],
  S3: [19.35, 80, 35.3, 17.6, 'small', 'top row, right of centre'],
  S4: [56.65, 80, 35.3, 17.6, 'small', 'top row, far right'],
  M1: [-38, 57, 72.6, 21.6, 'middle', 'middle row, left'],
  M2: [38, 57, 72.6, 21.6, 'middle', 'middle row, right'],
  G1: [-38, 28.5, 72.6, 28.6, 'bottom', 'bottom row, left'],
  G2: [38, 28.5, 72.6, 28.6, 'bottom', 'bottom row, right'],
};
const D = {};
for (const [key, [xc, yc, w, h, size, where]] of Object.entries(DRAWERS)) {
  const Size = size[0].toUpperCase() + size.slice(1);
  const b = yc - h / 2 - 0.2; // floor of the opening
  const half = w / 2 - 1.1; // half the drawer box's outside width
  const sideH = h - 4;
  const sideTop = b + 2.6 + sideH;
  const d = {};
  d.front = board(`front${key}`, `Drawer front, ${where}`, [w, h, 2], [xc, yc, 22.5], W, { stageUp: [0, 0, -1] });
  d.sides = SIDES.map(([s, sx]) =>
    board(`side${key}${s}`, `${Size} drawer side`, [1.5, sideH, 38], [xc + sx * (half - 0.75), b + 2.6 + sideH / 2, 2.5], IN, { parent: d.front, stageUp: [-sx, 0, 0] }));
  const studYs = [b + 5.5, sideTop - 2.5];
  const dowelYs = [b + 2.6 + sideH * 0.38, b + 2.6 + sideH * 0.62];
  d.studs = SIDES.flatMap(([s, sx]) => studYs.map((y, j) =>
    hw(`stud${key}${s}${j}`, 'Cam stud', '123492', 'pin', 0.35, 3, [xc + sx * (half - 0.75), y, 21.5], [0, 0, 1], ST, d.front)));
  d.dowels = SIDES.flatMap(([s, sx], n) => dowelYs.map((y, j) =>
    hw(`dowel${key}${s}${j}`, 'Dowel', '101345', 'dowel', 0.4, 3, [xc + sx * (half - 0.75), y, 21.5], [0, 0, -1], 'dowel', d.sides[n])));
  d.locks = SIDES.flatMap(([s, sx], n) => studYs.map((y, j) =>
    lock110630(`lock${key}${s}${j}`, [xc + sx * (half - 0.4), y, 20.0], [-sx, 0, 0], d.sides[n])));
  d.bottom = board(`bottom${key}`, `${Size} drawer bottom`, [w - 4.2, 0.3, 37.5], [xc, b + 3.6, 2.25], HB, { parent: d.front });
  d.back = board(`back${key}`, `${Size} drawer back`, [w - 5.2, h - 5.5, 1.5], [xc, b + 1.35 + h / 2, -15.75], IN, { parent: d.front });
  const [backLo, backHi] = [b + 4.1, sideTop];
  const screwYs = size === 'bottom' ? [backLo + 2.5, (backLo + backHi) / 2, backHi - 2.5] : [backLo + 2.5, backHi - 2.5];
  d.screws = SIDES.flatMap(([s, sx], n) => screwYs.map((y, j) =>
    hw(`screw${key}${s}${j}`, 'Screw', '110519', 'screw', 0.3, 3, [xc + sx * half, y, -15.75], [-sx, 0, 0], ST, d.sides[n])));
  d.runners = SIDES.map(([s, sx], n) =>
    board(`drunner${key}${s}`, 'Drawer runner', [0.6, 1.5, 37], [xc + sx * (half + 0.3), b + 3.35, 2.0], ST, { label: '10085261', parent: d.sides[n] }));
  d.runnerScrews = SIDES.flatMap(([s, sx], n) => [14, -10].map((z, j) =>
    hw(`rscrew${key}${s}${j}`, 'Screw', '10080579', 'screw', 0.25, 1.2, [xc + sx * (half + 0.6), b + 3.35, z], [-sx, 0, 0], ST, d.sides[n])));
  const knobXs = size === 'small' ? [xc] : [xc - w / 4, xc + w / 4];
  d.knobs = knobXs.map((x, j) => hw(`knob${key}${j}`, 'Knob', '117615', 'knob', 1.6, 2.6, [x, yc, 23.5 + 1.3], [0, 0, -1], W, d.front));
  d.knobScrews = knobXs.map((x, j) => hw(`kscrew${key}${j}`, 'Screw', '119976', 'screw', 0.25, 3, [x, yc, 21.5], [0, 0, 1], ST, d.front));
  if (size !== 'small') {
    d.bar = board(`bar${key}`, 'Support bar', [2.5, 1, 36], [xc, b + 2.95, 2.5], ST, { label: '10054466', parent: d.front });
    d.barScrews = [19.5, -14.5].map((z, j) => hw(`bscrew${key}${j}`, 'Screw', '105344', 'screw', 0.25, 1.2, [xc, b + 2.45, z], [0, 1, 0], ST, d.front));
  }
  D[key] = d;
}
const SMALL = ['S1', 'S2', 'S3', 'S4'];
const BIG = ['M1', 'M2', 'G1', 'G2'];
const every = (keys, field) => keys.flatMap((k) => D[k][field]);
const fronts = (keys) => keys.map((k) => D[k].front);

// ---- steps
step('Screw cam studs into the legs',
  'Lay the four legs L1, L2, R1 and R2 on a soft surface. Screw a cam stud 118331 into each of the three holes on the face shown, by hand or with a screwdriver. Stop when the plain shank stands clear of the wood.',
  'Screwdriver', s1, { manual: 1, spin: 3, slide: 3 });
step('Push dowels into the legs',
  'Push two short dowels 101350 into each leg, beside the cam studs. Use the short dowels here, not the long 101353.',
  'Hands', s2, { manual: 2, slide: 3 });
step('Fit the legs to the side panels',
  'Lay both side panels flat, inner side up. Push legs L1 and L2 onto the edges of one panel and R1 and R2 onto the other, studs and dowels into the holes.',
  'Hands', [legs.L1, legs.L2, legs.R1, legs.R2], {
    manual: 2, local: true,
    approach: { [legs.L1]: [0, 0, 10], [legs.L2]: [0, 0, -10], [legs.R1]: [0, 0, 10], [legs.R2]: [0, 0, -10] },
  });
step('Lock the legs with cam locks',
  'Drop a cam lock 110630 into each of the 12 round holes on the panels and turn it clockwise until it grips the stud.',
  'Screwdriver', s3, { manual: 3, spin: 0.5, slide: 2 });
step('Push the long dowels into the panels',
  'Push three long dowels 101353 into the holes down the middle of each panel.',
  'Hands', s4a, { manual: 4, slide: 3 });
step('Press on the interlock strips',
  'Press an interlock strip onto the dowels on each panel, with its catches lined up as the manual shows. The strips stop more than one drawer opening at once.',
  'Hands', [strips.L, strips.R], { manual: 4, local: true, approach: { [strips.L]: [8, 0, 0], [strips.R]: [-8, 0, 0] } });
step('Lay the CR runners on the right frame',
  'Lay three cabinet runners stamped IKEA CR (10085235) across the frame with legs R1 and R2, wheels at the front.',
  'Hands', sideRunners.R, { manual: 5, local: true, from: [-10, 0, 0] });
step('Screw down the CR runners',
  'Fix each runner with two screws 107716. Take care not to mix them up with 108462 or 10080579, which look similar.',
  'Screwdriver', sideScrews.R, { manual: 5, spin: 3, slide: 2 });
step('Lay the CL runners on the left frame',
  'Lay three runners stamped IKEA CL (10085235) across the frame with legs L1 and L2.',
  'Hands', sideRunners.L, { manual: 6, local: true, from: [10, 0, 0] });
step('Screw down the CL runners',
  'Fix each runner with two screws 107716.',
  'Screwdriver', sideScrews.L, { manual: 6, spin: 3, slide: 2 });
step('Push glides into the legs',
  'Press a glide 191064/191065 into the bottom end of each leg.',
  'Hands', s7, { manual: 7, local: true, from: [0, -4, 0] });
step('Screw more cam studs into the legs',
  'Screw ten cam studs 118331 into the inner faces of the legs: four in each front leg (L1, R1) and one near the top of each back leg (L2, R2). These hold the rails.',
  'Screwdriver', s8, { manual: 8, spin: 3, slide: 3 });
step('Push dowels into the rails',
  'Set out the seven rails and push a short dowel 101350 into the hole at each end.',
  'Hands', s9, { manual: 9, slide: 3 });
step('Lay out the right side frame',
  'The dresser is built lying on its right side. Lay the frame with legs R1 and R2 flat where you’ll work, runners facing up and the legs’ glide ends to your left.',
  'Hands', [panelR], { manual: 10 });
step('Stand the short rails in the right frame',
  'Push the two short rails onto the studs in leg R1, dowels into the holes.',
  'Hands', [rails.shortR0, rails.shortR1], { manual: 10 });
step('Fit the top front and top back rails',
  'Push the two long top rails onto the studs at the top ends of legs R1 and R2. Check the marks shown in the manual so each rail faces the right way.',
  'Hands', [rails.topF, rails.topB], { manual: 11 });
step('Fit the bottom front rail',
  'Push the bottom front rail onto the stud near the bottom of leg R1.',
  'Hands', [rails.bot], { manual: 12 });
step('Lock the rails to the right frame',
  'Turn a cam lock 110630 clockwise in each of the five rails, close to the right frame.',
  'Screwdriver', l13, { manual: 13, spin: 0.5, slide: 2 });
step('Lay out the centre divider',
  'Lay the three pieces of the centre divider side by side: the front post, the interlock strip and the back post, the way the manual shows.',
  'Hands', [divB, divS], { manual: 14 });
step('Lay the CL runners across the divider',
  'Lay three runners stamped IKEA CL (10085261) across all three pieces.',
  'Hands', divRunners.CL, { manual: 14, local: true, from: [10, 0, 0] });
step('Screw down the CL runners',
  'Fix each runner to all three pieces with three screws 108462, nine in all.',
  'Screwdriver', divScrews.CL, { manual: 14, spin: 3, slide: 2 });
turn('Turn the divider over', 'Turn the divider over so the bare side faces up.', [divF], { manual: 15, pose: 'over' });
step('Lay the CR runners across the divider',
  'Lay three runners stamped IKEA CR (10085261) across this side.',
  'Hands', divRunners.CR, { manual: 15, local: true, from: [-10, 0, 0] });
step('Screw down the CR runners',
  'Fix them with nine more screws 108462.',
  'Screwdriver', divScrews.CR, { manual: 15, spin: 3, slide: 2 });
turn('Stand the divider on its edge', 'Stand the divider on its back edge, front post on top.', [divF], { manual: 16, up: [0, 0, 1] });
step('Screw in the double cam studs',
  'Screw four cam studs 603440 into the holes on both faces of the front post.',
  'Screwdriver', s16, { manual: 16, spin: 3, slide: 3 });
step('Push a dowel into the front post',
  'Push a short dowel 101350 into the hole in the bottom end of the front post.',
  'Hands', [d17], { manual: 17, slide: 3 });
step('Push a dowel into the other end',
  'Push another short dowel 101350 into the top end of the front post.',
  'Hands', [d18], { manual: 18, slide: 3 });
step('Lower the divider into place',
  'Lower the divider onto the short rails, the studs going into the rail ends and the dowels into the long rails.',
  'Hands', [divF], { manual: 19, from: [0, 30, 0] });
step('Bolt the divider to the rails',
  'With the Allen key 100001, drive three bolts 100214 through the long rails into the ends of the divider. Not the black 100232.',
  'Wrench', b20, { manual: 20, spin: 4, slide: 4 });
step('Lock the short rails to the divider',
  'Turn a cam lock 110630 in each short rail, next to the divider.',
  'Screwdriver', l20, { manual: 20, spin: 0.5, slide: 2 });
step('Fit the left short rails',
  'Push the other two short rails onto the studs on the top face of the divider.',
  'Hands', [rails.shortL0, rails.shortL1], { manual: 21 });
step('Lock the left short rails',
  'Turn a cam lock 110630 in each of these rails, next to the divider.',
  'Screwdriver', l22, { manual: 22, spin: 0.5, slide: 2 });
step('Lower the left side frame on top',
  'Turn the frame with legs L1 and L2 over and lower it onto the ends of the rails.',
  'Hands', [panelL], { manual: 23, from: [0, 35, 0] });
step('Lock the rails to the left frame',
  'Turn a cam lock 110630 in each of the five rails, close to the left frame.',
  'Screwdriver', l24, { manual: 24, spin: 0.5, slide: 2 });
step('Screw in the middle foot',
  'Screw the adjustable foot 107862 into the hole under the middle of the bottom front rail.',
  'Hands', [foot], { manual: 25, spin: 3, slide: 3 });
flip('Stand the dresser up', 'Tip the frame up onto its legs. It’s big: get someone to help.', 'z', 90, { manual: 26 });
step('Fit CR runners to the top-row dividers',
  'Lay the two small dividers flat and place a runner stamped IKEA CR on each.',
  'Hands', [topRunners.L.CR, topRunners.R.CR], { manual: 27, local: true, from: [-10, 0, 0] });
step('Screw down the CR runners',
  'Fix each with two screws 108462.',
  'Screwdriver', [...topScrews.L.CR, ...topScrews.R.CR], { manual: 27, spin: 3, slide: 2 });
turn('Turn the dividers over', 'Turn both dividers over.', [topDiv.L, topDiv.R], { manual: 28, pose: 'over' });
step('Fit CL runners to the top-row dividers',
  'Place a runner stamped IKEA CL on the other side of each.',
  'Hands', [topRunners.L.CL, topRunners.R.CL], { manual: 28, local: true, from: [10, 0, 0] });
step('Screw down the CL runners',
  'Fix each with two screws 108462.',
  'Screwdriver', [...topScrews.L.CL, ...topScrews.R.CL], { manual: 28, spin: 3, slide: 2 });
turn('Stand the dividers up', 'Stand both dividers on their bottom edge.', [topDiv.L, topDiv.R], { manual: 29, pose: 'upright' });
step('Push a dowel into each divider',
  'Push a short dowel 101350 into the hole in the top edge of each divider.',
  'Hands', [topDowels.L, topDowels.R], { manual: 29, slide: 3 });
step('Set the dividers in the top row',
  'Stand the dividers in the top row of the frame, one each side of the centre divider, on the middle of the upper short rails.',
  'Hands', [topDiv.L, topDiv.R], { manual: 30, from: [0, 30, 0] });
step('Screw the dividers in from above',
  'With the Allen key 100006, drive a black screw 100232 down through the top front rail into each divider.',
  'Wrench', s30a, { manual: 30, spin: 4, slide: 4 });
step('Bolt the dividers from below',
  'With the Allen key 100001, drive a bolt 100214 up through the short rail into the bottom of each divider.',
  'Wrench', s30b, { manual: 30, spin: 4, slide: 4 });
step('Fit the wall brackets to the top',
  'Lay the top upside down on a soft surface. Place a wall bracket 106989 at each back corner, as shown.',
  'Hands', brackets, { manual: 31 });
step('Screw down the brackets',
  'Fix each bracket with a screw 109049 and washer 100823.',
  'Screwdriver', [...washers, ...bracketScrews], { manual: 31, spin: 2, slide: 2 });
step('Screw cam studs into the top',
  'Screw 11 cam studs 118331 into the underside of the top, along the back and at the ends.',
  'Screwdriver', s32, { manual: 32, spin: 3, slide: 3 });
step('Push dowels into the legs and sides',
  'Push a short dowel 101350 into the top of each leg and into the top edge of each side panel: six in all.',
  'Hands', s33, { manual: 33, slide: 3 });
step('Lower the top into place',
  'Turn the top right way up and lower it onto the frame, the studs and dowels into their holes.',
  'Hands', [top], { manual: 34, from: [0, 30, 0] });
step('Bolt the top from below',
  'With the Allen key 100001, drive four bolts 100214 up through the top front rail into the top.',
  'Wrench', b35, { manual: 35, spin: 4, slide: 4 });
step('Lock the top',
  'Turn the 11 cam locks 110630 under the top, along the back rail and inside the side panels.',
  'Screwdriver', l36, { manual: 36, spin: 0.5, slide: 2 });
flip('Lay the dresser on its front', 'With a helper, lay the dresser face down on a soft surface such as the flattened box.', 'x', 90, { manual: 37 });
step('Lay the back panels on',
  'Lay the two hardboard back panels on the back, edges lined up with the frame, as shown.',
  'Hands', [backLower, backUpper], { manual: 37, from: [0, 15, 0] });
step('Mark the middle post, then nail a corner',
  'Draw a pencil line across the panels over the middle of the centre divider’s back post, so the nails find it later. Then hammer one nail 101221 into a top corner.',
  'Hammer', [n39], { manual: '38–39', slide: 2 });
step('Nail the opposite corner',
  'Check the frame is square, then nail the other top corner.',
  'Hammer', [n40], { manual: 40, slide: 2 });
step('Nail a bottom corner',
  'Hammer a nail into a bottom corner.',
  'Hammer', [n41], { manual: 41, slide: 2 });
step('Nail the back all round',
  'Hammer in the other 27 nails around the edges and down your pencil line.',
  'Hammer', n42, { manual: 42, slide: 2 });
flip('Stand the dresser up', 'Stand the dresser back up on its legs.', 'x', -90, { manual: 42 });
step('Screw cam studs into the small drawer fronts',
  'The four small drawers are built the same way. Lay each front face down and screw in four cam studs 123492.',
  'Screwdriver', every(SMALL, 'studs'), { manual: 47, spin: 3, slide: 3 });
step('Push dowels into the small drawer sides',
  'Push two dowels 101345 into the front end of each of the eight sides.',
  'Hands', every(SMALL, 'dowels'), { manual: 48, slide: 3 });
step('Fit the sides of the first small drawer',
  'Start with the sides that carry the warning sticker; that drawer goes top left. Push both sides onto one front, sticker facing in.',
  'Hands', D.S1.sides, { manual: 49 });
step('Fit the sides of the other three',
  'Push two sides onto each of the other three fronts.',
  'Hands', every(['S2', 'S3', 'S4'], 'sides'), { manual: 49 });
step('Lock the sides',
  'Turn four cam locks 110630 clockwise in each drawer, two per side.',
  'Screwdriver', every(SMALL, 'locks'), { manual: 50, spin: 0.5, slide: 2 });
step('Slide in the bottoms',
  'Slide a hardboard bottom down into the grooves of each drawer.',
  'Hands', every(SMALL, 'bottom'), { manual: 51, local: true, from: [0, 0, -40] });
step('Fit the drawer backs',
  'Set a back on the open end of each drawer, between the sides.',
  'Hands', every(SMALL, 'back'), { manual: 52, local: true, from: [0, 0, -20] });
step('Hammer in the back screws',
  'Tap four screws 110519 through the sides into each back.',
  'Hammer', every(SMALL, 'screws'), { manual: 52, slide: 3 });
turn('Turn the drawers upside down', 'Turn all four small drawers upside down.', fronts(SMALL), { manual: 53, pose: 'upsideDown' });
step('Clip on the drawer runners',
  'Hook a drawer runner 10085261 onto the bottom edge of each side, at the front.',
  'Hands', every(SMALL, 'runners'), { manual: 53, local: true, from: [0, -12, 0] });
step('Screw the runners on',
  'Fix each runner with two screws 10080579.',
  'Screwdriver', every(SMALL, 'runnerScrews'), { manual: 53, spin: 3, slide: 2 });
turn('Turn the drawers right way up', 'Turn the drawers back over.', fronts(SMALL), { manual: 54, pose: 'upright' });
step('Fit the knobs',
  'Hold a knob 117615 on each front and screw it on from inside with a screw 119976.',
  'Screwdriver', [...every(SMALL, 'knobs'), ...every(SMALL, 'knobScrews')], { manual: 54, spin: 2, slide: 4 });
step('Screw cam studs into the big drawer fronts',
  'The two middle and two bottom drawers are built the same way. Lay each front face down and screw in four cam studs 123492.',
  'Screwdriver', every(BIG, 'studs'), { manual: 55, spin: 3, slide: 3 });
step('Push dowels into the big drawer sides',
  'Push two dowels 101345 into the front end of each side.',
  'Hands', every(BIG, 'dowels'), { manual: 56, slide: 3 });
step('Fit the sides',
  'Push two sides onto each front. The middle drawers take the lower sides.',
  'Hands', every(BIG, 'sides'), { manual: 57 });
step('Lock the sides',
  'Turn four cam locks 110630 in each drawer, two per side.',
  'Screwdriver', every(BIG, 'locks'), { manual: 58, spin: 0.5, slide: 2 });
step('Slide in the bottoms',
  'Slide a hardboard bottom into the grooves of each drawer.',
  'Hands', every(BIG, 'bottom'), { manual: 59, local: true, from: [0, 0, -40] });
step('Fit the drawer backs',
  'Set a back on each drawer, between the sides.',
  'Hands', every(BIG, 'back'), { manual: 60, local: true, from: [0, 0, -20] });
step('Hammer in the back screws',
  'Tap screws 110519 through the sides into each back: four in each middle drawer, six in each bottom drawer.',
  'Hammer', every(BIG, 'screws'), { manual: 60, slide: 3 });
step('Fit the support bars',
  'Slide each bottom partly out. Lay a support bar 10054466 along the middle of the bottom and screw its front end on with a screw 105344.',
  'Screwdriver', [...BIG.map((k) => D[k].bar), ...BIG.map((k) => D[k].barScrews[0])], {
    manual: 61, local: true, spin: 2, slide: 2,
    approach: Object.fromEntries(BIG.map((k) => [D[k].bar, [0, -12, 0]])),
  });
step('Screw down the other end',
  'Swing each bar against the back, screw it on with another screw 105344, and push the bottom back in.',
  'Screwdriver', BIG.map((k) => D[k].barScrews[1]), { manual: 62, spin: 2, slide: 2 });
turn('Turn the drawers upside down', 'Turn the four big drawers upside down.', fronts(BIG), { manual: 63, pose: 'upsideDown' });
step('Clip on the drawer runners',
  'Hook a drawer runner 10085261 onto the bottom edge of each side, at the front.',
  'Hands', every(BIG, 'runners'), { manual: 63, local: true, from: [0, -12, 0] });
step('Screw the runners on',
  'Fix each runner with two screws 10080579.',
  'Screwdriver', every(BIG, 'runnerScrews'), { manual: 63, spin: 3, slide: 2 });
turn('Turn the drawers right way up', 'Turn the drawers back over.', fronts(BIG), { manual: 64, pose: 'upright' });
step('Fit the knobs',
  'Fit two knobs 117615 to each front, each with a screw 119976 from inside.',
  'Screwdriver', [...every(BIG, 'knobs'), ...every(BIG, 'knobScrews')], { manual: 64, spin: 2, slide: 4 });
const IN_FROM = [0, 0, 45];
step('Slide in the first small drawer',
  'Flip up the interlock latch in the top-left opening, then slide in the drawer with the warning sticker. Once the drawers are in, only one opens at a time.',
  'Hands', [D.S1.front], { manual: '65–66', from: IN_FROM });
step('Slide in the next small drawer',
  'Flip up the latch on the centre divider, then slide a small drawer into the opening beside the first.',
  'Hands', [D.S2.front], { manual: '67–68', from: IN_FROM });
step('Slide in a middle drawer',
  'Flip up the two latches beside the left middle opening, then slide in a middle drawer.',
  'Hands', [D.M1.front], { manual: '69–70', from: IN_FROM });
step('Slide in a bottom drawer',
  'Flip up the two latches beside the bottom-left opening, then slide in a bottom drawer.',
  'Hands', [D.G1.front], { manual: '71–72', from: IN_FROM });
step('Slide in the right-hand small drawers',
  'Flip up the latches on the right-hand side, then slide in the last two small drawers.',
  'Hands', [D.S3.front, D.S4.front], { manual: '73–74', from: IN_FROM });
step('Slide in the right-hand middle drawer',
  'Slide the last middle drawer into its opening.',
  'Hands', [D.M2.front], { manual: 74, from: IN_FROM });
step('Slide in the last drawer',
  'Slide in the last bottom drawer. Before you use the dresser, fix it to the wall with the brackets on the top, as manual steps 43–46 show: it can tip over if it isn’t.',
  'Hands', [D.G2.front], { manual: 74, from: IN_FROM });

const product = {
  name: '8-drawer dresser',
  spec: 'White stain · 8 drawers · built from a 52-page paper manual · sizes estimated',
  source: {
    label: 'IKEA HEMNES 8-drawer dresser manual (AA-2406539-5)',
    url: 'https://www.ikea.com/us/en/assembly_instructions/hemnes-8-drawer-dresser-white-stain__AA-2406539-5-100.pdf',
  },
  startPose: { axis: 'z', angle: -90 },
  parts,
  steps,
  notes: [
    'Sizes are estimated from the drawings; part counts, part numbers and step order follow the manual.',
    'Steps 43–46 (fixing the dresser to the wall) are left out of the animation; the last step says to do them.',
    'The interlock latches (steps 65, 67, 69, 71, 73) are folded into the drawer steps that follow them.',
    'The top-row divider runners carry no part number in the manual, so they are labelled by their IKEA CR / CL stamps only.',
    'Where a cam stud, bolt or lock sits inside a joint is estimated; the manual shows only roughly where.',
  ],
};

const problems = validateProduct(product);
if (problems.length) {
  console.error(problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
const out = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'guide', 'products', 'hemnes.json');
fs.writeFileSync(out, formatProduct(product));
console.log(`${parts.length} parts, ${steps.length} steps -> ${path.relative(process.cwd(), out)}`);
