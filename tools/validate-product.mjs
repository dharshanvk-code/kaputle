// Checks a guide product file against what the player expects.
// Returns a list of problems; an empty list means the file is playable.
// Also runs as a CLI: node tools/validate-product.mjs guide/products/bookshelf.json

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SHAPES = ['board', 'dowel', 'pin', 'screw', 'nail'];
export const MATERIALS = ['birch', 'blackbrown', 'white', 'hardboard', 'dowel', 'steel', 'brass', 'plastic', 'felt', 'cardboard'];
export const TOOLS = ['Hands', 'Hammer', 'Screwdriver', 'Wrench'];

const isVec = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
const isPos = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;

export function validateProduct(product) {
  const errors = [];
  const err = (msg) => errors.push(msg);
  if (!product || typeof product !== 'object') return ['The file is not a JSON object.'];
  if (typeof product.name !== 'string' || !product.name.trim()) err('`name` must be a non-empty string.');
  if (!Array.isArray(product.parts) || !product.parts.length) err('`parts` must be a non-empty array.');
  if (!Array.isArray(product.steps) || !product.steps.length) err('`steps` must be a non-empty array.');
  if (product.startFlipped !== undefined && !['x', 'z'].includes(product.startFlipped)) err('`startFlipped` must be "x" or "z" when present.');
  if (errors.length) return errors;

  const ids = new Set();
  for (const [i, p] of product.parts.entries()) {
    const where = `parts[${i}]${p?.id ? ` (${p.id})` : ''}`;
    if (typeof p.id !== 'string' || !p.id) { err(`${where}: missing \`id\`.`); continue; }
    if (ids.has(p.id)) err(`${where}: duplicate id.`);
    ids.add(p.id);
    if (typeof p.name !== 'string' || !p.name) err(`${where}: missing \`name\`.`);
    if (p.label !== undefined && typeof p.label !== 'string') err(`${where}: \`label\` must be a string.`);
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
  for (const [i, s] of product.steps.entries()) {
    const where = `steps[${i}]${s?.title ? ` ("${s.title}")` : ''}`;
    if (typeof s.title !== 'string' || !s.title) err(`${where}: missing \`title\`.`);
    if (typeof s.text !== 'string' || !s.text) err(`${where}: missing \`text\`.`);
    if (s.tool !== undefined && !TOOLS.includes(s.tool)) err(`${where}: \`tool\` must be one of ${TOOLS.join(', ')}.`);
    if (!Array.isArray(s.parts)) { err(`${where}: \`parts\` must be an array (empty for a flip).`); continue; }
    if (s.type === 'flip') {
      if (s.parts.length) err(`${where}: a flip step moves the whole assembly, so its \`parts\` must be empty.`);
      if (s.axis !== undefined && !['x', 'z'].includes(s.axis)) err(`${where}: flip \`axis\` must be "x" or "z".`);
      continue;
    }
    if (s.type !== undefined) err(`${where}: unknown step type "${s.type}".`);
    if (!s.parts.length) err(`${where}: a step must fit at least one part.`);
    if (s.from !== undefined && !isVec(s.from)) err(`${where}: \`from\` must be [x, y, z].`);
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
  return errors;
}

// CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node tools/validate-product.mjs <product.json>');
    process.exit(2);
  }
  const errors = validateProduct(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (errors.length) {
    console.error(`${file}: ${errors.length} problem${errors.length === 1 ? '' : 's'}`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`${file}: OK`);
}
