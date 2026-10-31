import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandCopies } from '../tools/expand-copies.mjs';
import { validateProduct } from '../tools/validate-product.mjs';

const shorthand = {
  name: 'Two boards and four dowels',
  parts: [
    { id: 'left', name: 'Left board', label: 'A', shape: 'board', size: [2, 20, 10], pos: [-5, 10, 0], material: 'birch' },
    { id: 'right', name: 'Right board', label: 'A', shape: 'board', size: [2, 20, 10], pos: [5, 10, 0], material: 'birch' },
    {
      id: 'dowel', name: 'Dowel', label: '101350', shape: 'dowel', radius: 0.4, length: 2, dir: [0, -1, 0], material: 'dowel', parent: 'left',
      copies: [[-5, 19, -2], [-5, 19, 2], { pos: [5, 19, -2], parent: 'right' }, { pos: [5, 19, 2], parent: 'right' }],
    },
  ],
  steps: [
    { title: 'Push in the dowels', text: 'Push a dowel into each hole.', parts: ['dowel'], approach: { dowel: [0, 5, 0] } },
    { title: 'Stand up the boards', text: 'Stand both boards up.', parts: ['left', 'right'] },
  ],
};

test('copies become separate parts, and steps that name the group get every copy', () => {
  const p = expandCopies(shorthand);
  assert.deepEqual(p.parts.map((q) => q.id), ['left', 'right', 'dowel-1', 'dowel-2', 'dowel-3', 'dowel-4']);
  assert.deepEqual(p.parts.find((q) => q.id === 'dowel-3').pos, [5, 19, -2]);
  assert.equal(p.parts.find((q) => q.id === 'dowel-1').parent, 'left');
  assert.equal(p.parts.find((q) => q.id === 'dowel-4').parent, 'right');
  assert.ok(p.parts.every((q) => !('copies' in q)));
  assert.deepEqual(p.steps[0].parts, ['dowel-1', 'dowel-2', 'dowel-3', 'dowel-4']);
  assert.deepEqual(Object.keys(p.steps[0].approach), ['dowel-1', 'dowel-2', 'dowel-3', 'dowel-4']);
  assert.deepEqual(p.steps[1].parts, ['left', 'right']);
  assert.deepEqual(validateProduct(p), []);
});

test('a product without copies comes back unchanged', () => {
  const plain = { name: 'x', parts: [{ id: 'a' }], steps: [] };
  assert.equal(expandCopies(plain), plain);
});
