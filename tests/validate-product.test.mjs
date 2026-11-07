import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateProduct } from '../tools/validate-product.mjs';

const chest = () => JSON.parse(fs.readFileSync(new URL('../guide/products/hemnes-2-drawer.json', import.meta.url), 'utf8'));
const part = (p, id) => p.parts.find((q) => q.id === id);

test('a board lifted off the parts it rests on is reported as floating', () => {
  const p = chest();
  part(p, 'top').pos[1] += 3;
  assert.ok(validateProduct(p).some((e) => e.startsWith('top floats')));
});

test('a knob moved away from its drawer is reported as floating', () => {
  const p = chest();
  const knob = p.parts.find((q) => q.shape === 'knob');
  knob.pos[2] += 5;
  assert.ok(validateProduct(p).some((e) => e.startsWith(`${knob.id} floats`)));
});

test('hardware counts must match the inventory copied from the manual', () => {
  const p = chest();
  const counts = {};
  for (const q of p.parts) if (q.label && q.shape !== 'board') counts[q.label] = (counts[q.label] || 0) + 1;
  p.inventory = Object.entries(counts).map(([label, count]) => ({ label, count }));
  assert.deepEqual(validateProduct(p), []);

  p.inventory.find((r) => r.label === '101350').count = 22;
  p.inventory = p.inventory.filter((r) => r.label !== '191064');
  const problems = validateProduct(p);
  assert.ok(problems.some((e) => e.includes('22 × 101350') && e.includes('has 20')));
  assert.ok(problems.some((e) => e.includes('191064') && e.includes('missing from "inventory"')));
});
