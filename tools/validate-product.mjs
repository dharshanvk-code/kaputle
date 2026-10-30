// Checks a guide product file against what the player expects.
// Returns a list of problems; an empty list means the file is playable.
// Also runs as a CLI: node tools/validate-product.mjs [product.json ...]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SHAPES = ['board', 'dowel', 'pin', 'screw', 'nail', 'knob'];
export const MATERIALS = ['birch', 'blackbrown', 'white', 'hardboard', 'dowel', 'steel', 'brass', 'plastic', 'felt', 'cardboard'];
export const TOOLS = ['Hands', 'Hammer', 'Screwdriver', 'Wrench'];

const isVec = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const isPos = (n) => isNum(n) && n > 0;
const POSES = ['upright', 'upsideDown', 'over'];

export function validateProduct(product) {
  const errors = [];
  const err = (msg) => errors.push(msg);
  if (!product || typeof product !== 'object') return ['The file is not a JSON object.'];
  if (typeof product.name !== 'string' || !product.name.trim()) err('`name` must be a non-empty string.');
  if (!Array.isArray(product.parts) || !product.parts.length) err('`parts` must be a non-empty array.');
  if (!Array.isArray(product.steps) || !product.steps.length) err('`steps` must be a non-empty array.');
  if (product.startFlipped !== undefined && !['x', 'z'].includes(product.startFlipped)) err('`startFlipped` must be "x" or "z" when present.');
  if (product.startPose !== undefined) {
    const sp = product.startPose;
    if (!sp || !['x', 'z'].includes(sp.axis) || (sp.angle !== undefined && !isNum(sp.angle))) err('`startPose` must be {"axis": "x" or "z", "angle": degrees}.');
    if (product.startFlipped !== undefined) err('Use `startPose` or `startFlipped`, not both.');
  }
  if (errors.length) return errors;

  const ids = new Set();
  for (const [i, p] of product.parts.entries()) {
    const where = `parts[${i}]${p?.id ? ` (${p.id})` : ''}`;
    if (typeof p.id !== 'string' || !p.id) { err(`${where}: missing \`id\`.`); continue; }
    if (ids.has(p.id)) err(`${where}: duplicate id.`);
    ids.add(p.id);
    if (typeof p.name !== 'string' || !p.name) err(`${where}: missing \`name\`.`);
    if (p.label !== undefined && typeof p.label !== 'string') err(`${where}: \`label\` must be a string.`);
    if (p.stageUp !== undefined && (!isVec(p.stageUp) || p.stageUp.every((n) => n === 0))) err(`${where}: \`stageUp\` must be a direction [x, y, z].`);
    if (!SHAPES.includes(p.shape)) err(`${where}: \`shape\` must be one of ${SHAPES.join(', ')}.`);
    if (!isVec(p.pos)) err(`${where}: \`pos\` must be [x, y, z] numbers.`);
    if (p.material !== undefined && !MATERIALS.includes(p.material)) err(`${where}: unknown material "${p.material}". Use one of ${MATERIALS.join(', ')}.`);
    if (p.shape === 'board') {
      if (!isVec(p.size) || !p.size.every((n) => n > 0)) err(`${where}: a board needs \`size\` [x, y, z], all positive.`);
    } else if (SHAPES.includes(p.shape)) {
      if (!isPos(p.radius)) err(`${where}: \`radius\` must be a positive number.`);
      if (!isPos(p.length)) err(`${where}: \`length\` must be a positive number.`);
      if (!isVec(p.dir) || p.dir.every((n) => n === 0)) err(`${where}: hardware needs \`dir\`, the direction it is pushed or screwed in.`);
    }
  }
  for (const p of product.parts) {
    if (p.parent === undefined) continue;
    if (p.parent === p.id) err(`${p.id}: a part can't be its own parent.`);
    else if (!ids.has(p.parent)) err(`${p.id}: parent "${p.parent}" is not a part.`);
  }
  // No parent chains that loop back on themselves.
  const byId = new Map(product.parts.map((p) => [p.id, p]));
  for (const p of product.parts) {
    const seen = new Set();
    let cur = p;
    while (cur?.parent && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.parent);
      if (cur && seen.has(cur.id)) { err(`${p.id}: its parent chain loops.`); break; }
    }
  }

  const used = new Map();
  const firstStep = new Map();
  product.steps.forEach((s, i) => Array.isArray(s?.parts) && s.parts.forEach((id) => !firstStep.has(id) && firstStep.set(id, i)));
  for (const [i, s] of product.steps.entries()) {
    const where = `steps[${i}]${s?.title ? ` ("${s.title}")` : ''}`;
    if (typeof s.title !== 'string' || !s.title) err(`${where}: missing \`title\`.`);
    if (typeof s.text !== 'string' || !s.text) err(`${where}: missing \`text\`.`);
    if (s.tool !== undefined && !TOOLS.includes(s.tool)) err(`${where}: \`tool\` must be one of ${TOOLS.join(', ')}.`);
    if (s.manual !== undefined && !isNum(s.manual) && typeof s.manual !== 'string') err(`${where}: \`manual\` must be a step number or a string like "65–66".`);
    if (!Array.isArray(s.parts)) { err(`${where}: \`parts\` must be an array (empty for a flip or turn).`); continue; }
    if (s.type === 'flip') {
      if (s.parts.length) err(`${where}: a flip step moves the whole assembly, so its \`parts\` must be empty.`);
      if (s.axis !== undefined && !['x', 'z'].includes(s.axis)) err(`${where}: flip \`axis\` must be "x" or "z".`);
      if (s.angle !== undefined && (!isNum(s.angle) || s.angle === 0)) err(`${where}: flip \`angle\` must be a non-zero number of degrees.`);
      continue;
    }
    if (s.type === 'turn') {
      if (s.parts.length) err(`${where}: a turn step only turns parts that are already out, so its \`parts\` must be empty.`);
      if (!Array.isArray(s.turn) || !s.turn.length) err(`${where}: a turn step needs \`turn\`, the ids of the parts it turns.`);
      else for (const id of s.turn) {
        if (!ids.has(id)) err(`${where}: "${id}" is not a part.`);
        else if (byId.get(id).parent) err(`${where}: "${id}" is fitted to another part; turn that part instead.`);
        else if (!(firstStep.get(id) > i)) err(`${where}: "${id}" is already fitted by this step, so it can't be turned on the floor.`);
      }
      if (s.up !== undefined) {
        if (!isVec(s.up) || s.up.every((n) => n === 0)) err(`${where}: \`up\` must be a direction [x, y, z].`);
      } else if (!POSES.includes(s.pose)) err(`${where}: a turn step needs \`pose\` (${POSES.join(', ')}) or \`up\`.`);
      continue;
    }
    if (s.type !== undefined) err(`${where}: unknown step type "${s.type}".`);
    if (!s.parts.length) err(`${where}: a step must fit at least one part.`);
    if (s.from !== undefined && !isVec(s.from)) err(`${where}: \`from\` must be [x, y, z].`);
    if (s.local !== undefined && typeof s.local !== 'boolean') err(`${where}: \`local\` must be true or false.`);
    if (s.slide !== undefined && !isPos(s.slide)) err(`${where}: \`slide\` must be a positive number.`);
    if (s.lower !== undefined && !isPos(s.lower)) err(`${where}: \`lower\` must be a positive number.`);
    if (s.approach !== undefined) {
      if (typeof s.approach !== 'object' || Array.isArray(s.approach)) err(`${where}: \`approach\` must map part ids to [x, y, z].`);
      else for (const [id, v] of Object.entries(s.approach)) {
        if (!s.parts.includes(id)) err(`${where}: \`approach\` names "${id}", which this step doesn't fit.`);
        if (!isVec(v)) err(`${where}: \`approach.${id}\` must be [x, y, z].`);
      }
    }
    for (const id of s.parts) {
      if (!ids.has(id)) err(`${where}: "${id}" is not a part.`);
      used.set(id, (used.get(id) || 0) + 1);
    }
  }
  for (const id of ids) {
    const n = used.get(id) || 0;
    if (n === 0) err(`${id}: never fitted in any step. Every part must be used exactly once.`);
    if (n > 1) err(`${id}: fitted in ${n} steps. Every part must be used exactly once.`);
  }
  if (errors.length) return errors;
  return [...errors, ...checkGeometry(product)];
}

// ---- geometry: the finished product should look physically right

const TOL = 0.05; // cm
const unit = (v) => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};
const along = (pos, dir, t) => pos.map((x, i) => x + dir[i] * t);

// The two ends of a hardware part's axis. Screws and nails run from the head along `dir`;
// everything else is centred on `pos`.
function axisEnds(p) {
  const dir = unit(p.dir);
  if (p.shape === 'screw' || p.shape === 'nail') return [p.pos, along(p.pos, dir, p.length)];
  return [along(p.pos, dir, -p.length / 2), along(p.pos, dir, p.length / 2)];
}

function lowestPoint(p) {
  if (p.shape === 'board') return p.pos[1] - p.size[1] / 2;
  const dir = unit(p.dir);
  const headR = p.shape === 'screw' ? p.radius * 2.1 : p.shape === 'nail' ? p.radius * 3 : p.radius;
  const side = Math.sqrt(Math.max(0, 1 - dir[1] ** 2)); // how far the radius reaches downwards
  const [a, b] = axisEnds(p);
  const headEnd = p.shape === 'screw' || p.shape === 'nail' ? a : null;
  return Math.min(a[1] - (headEnd ? headR : p.radius) * side, b[1] - p.radius * side);
}

const insideBox = (pt, centre, size) => pt.every((x, i) => Math.abs(x - centre[i]) <= size[i] / 2 + TOL);
const fmt = (n) => String(Math.round(n * 100) / 100);

function checkGeometry(product) {
  const problems = [];
  const boards = product.parts.filter((p) => p.shape === 'board');
  // Knobs count as solid for the screws that hold them on.
  const solids = [
    ...boards.map((b) => ({ id: b.id, centre: b.pos, size: b.size })),
    ...product.parts.filter((p) => p.shape === 'knob').map((k) => ({ id: k.id, centre: k.pos, size: [k.radius * 2, k.radius * 2, k.radius * 2].map((s, i) => (Math.abs(unit(k.dir)[i]) > 0.9 ? k.length : s)) })),
  ];
  const inSolid = (pt) => solids.some((s) => insideBox(pt, s.centre, s.size));

  // It rests on the floor.
  const low = Math.min(...product.parts.map(lowestPoint));
  if (Math.abs(low) > 0.1) {
    problems.push(`The finished product's lowest point is at y = ${fmt(low)} cm, but it should stand on the floor at y = 0. Move every part by ${fmt(-low)} cm in y.`);
  }

  // Hardware ends inside the wood it joins, instead of poking out into the air.
  for (const p of product.parts) {
    if (!['dowel', 'screw', 'nail'].includes(p.shape)) continue;
    const [a, b] = axisEnds(p);
    if (p.shape === 'dowel') {
      for (const [end, which] of [[a, 'one end'], [b, 'the other end']]) {
        if (!inSolid(end)) problems.push(`${p.id}: ${which} of this dowel, at [${end.map(fmt).join(', ')}], sticks out of the boards it joins. Shorten it or move it so both ends are inside wood.`);
      }
    } else if (!inSolid(b)) {
      problems.push(`${p.id}: the tip of this ${p.shape}, at [${b.map(fmt).join(', ')}], ends outside any board, so it pokes out into the air. Shorten it or move it so the tip is inside wood.`);
    }
  }
  return problems;
}

// CLI: checks the files given, or every product in guide/products.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const productsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'guide', 'products');
  const files = process.argv.length > 2
    ? process.argv.slice(2)
    : fs.readdirSync(productsDir).filter((f) => f.endsWith('.json')).map((f) => path.join(productsDir, f));
  let failed = false;
  for (const file of files) {
    const errors = validateProduct(JSON.parse(fs.readFileSync(file, 'utf8')));
    const name = path.relative(process.cwd(), file);
    if (errors.length) {
      failed = true;
      console.error(`${name}: ${errors.length} problem${errors.length === 1 ? '' : 's'}`);
      for (const e of errors) console.error(`  - ${e}`);
    } else {
      console.log(`${name}: OK`);
    }
  }
  process.exit(failed ? 1 : 0);
}
