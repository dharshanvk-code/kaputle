// End-to-end checks of the guide player in a real (headless) browser.
//
//   npm test
//
// For every product: play all the steps, check that nothing passes through the floor and that
// every part ends exactly where the product file says, then undo every step and check that
// everything is back in the box. Then a few checks of things a visitor sees: an animated step,
// the tap-a-part card and the embed.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from '../tools/serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const threeDir = path.join(root, 'node_modules', 'three');
const PRODUCTS = fs.readdirSync(path.join(root, 'guide/products')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
const LOAD = { timeout: 300_000 };

let server;
let browser;
let base;

before(async () => {
  server = await serve(0);
  base = `http://localhost:${server.address().port}`;
  // Software rendering, so the tests run on machines without a GPU.
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
});

after(async () => {
  await browser?.close();
  server?.close();
});

// Open a guide page with three.js served from node_modules (no network needed) and errors collected.
async function open(query, options = {}) {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 }, reducedMotion: 'reduce', ...options });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.route('https://cdn.jsdelivr.net/npm/three@*/**', (route) => {
    const file = route.request().url().replace(/^.*\/npm\/three@[^/]+\//, '');
    route.fulfill({ path: path.join(threeDir, file), contentType: 'text/javascript' });
  });
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.fulfill({ body: '', contentType: 'text/css' }));
  await page.goto(`${base}/guide/?${query}`, LOAD);
  await page.waitForFunction(() => window.__guideReady && window.guide && !window.guide.isBusy(), null, LOAD);
  return { page, errors };
}

// Every part's world position and orientation, rounded.
const poses = (page) => page.evaluate(() => Object.fromEntries(Object.entries(window.guide.objects).map(([id, o]) => {
  o.updateWorldMatrix(true, false);
  return [id, Array.from(o.matrixWorld.elements, (v) => Math.round(v * 100) / 100)];
})));

// Parts whose meshes reach more than 3 mm below the floor.
const belowFloor = (page) => page.evaluate(() => {
  const low = [];
  for (const [id, o] of Object.entries(window.guide.objects)) {
    o.updateWorldMatrix(true, true);
    let min = Infinity;
    o.traverse((m) => {
      if (!m.isMesh || m.userData.part !== id) return;
      m.geometry.computeBoundingBox();
      min = Math.min(min, m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld).min.y);
    });
    if (min < -0.3) low.push(`${id} (${min.toFixed(1)} cm)`);
  }
  return low;
});

for (const name of PRODUCTS) {
  test(`${name}: every step plays forward and back`, async () => {
    const product = JSON.parse(fs.readFileSync(path.join(root, `guide/products/${name}.json`), 'utf8'));
    const { page, errors } = await open(`product=${name}`);
    const start = await poses(page);
    await page.evaluate(() => window.guide.setInstant(true));

    for (let i = 0; i < product.steps.length; i++) {
      await page.evaluate(() => window.guide.next());
      assert.deepEqual(await belowFloor(page), [], `below the floor after step ${i + 1} (${product.steps[i].title})`);
    }
    const end = await poses(page);
    const misplaced = product.parts
      .filter((p) => Math.hypot(end[p.id][12] - p.pos[0], end[p.id][13] - p.pos[1], end[p.id][14] - p.pos[2]) > 0.05)
      .map((p) => p.id);
    assert.deepEqual(misplaced, [], 'parts not where the product file puts them');

    for (let i = 0; i < product.steps.length; i++) await page.evaluate(() => window.guide.back());
    const back = await poses(page);
    const notBack = Object.keys(start).filter((id) => start[id].some((v, k) => Math.abs(v - back[id][k]) > 0.05));
    assert.deepEqual(notBack, [], 'parts not back where they started after undoing every step');
    assert.deepEqual(errors, []);
    await page.close();
  });
}

test('a step animates, and the step card and list follow it', async () => {
  const { page, errors } = await open('product=console');
  assert.match(await page.textContent('#card'), /Step 1 of 11/);
  await page.click('[data-act="next"]');
  await page.waitForFunction(() => window.guide.done() === 1 && !window.guide.isBusy(), null, LOAD);
  assert.match(await page.textContent('#card'), /Step 2 of 11/);
  assert.equal(await page.locator('.step-row.done').count(), 1);
  assert.match(await page.textContent('#productSpec'), /^About \d+ × \d+ × \d+ cm · /);
  assert.deepEqual(errors, []);
  await page.close();
});

test('tapping a part shows what it is, with a picture of where it goes', async () => {
  const { page, errors } = await open('product=console');
  await page.evaluate(() => window.guide.selectPart('top'));
  await page.waitForSelector('#partInfo:not([hidden]) .info-diagram');
  assert.match(await page.textContent('#partInfo'), /Tabletop/);
  assert.deepEqual(errors, []);
  await page.close();
});

test('the embed opens on the finished product and can play the build', async () => {
  const { page, errors } = await open('product=console&embed');
  await page.waitForFunction(() => window.guide.done() === 11 && !window.guide.isBusy(), null, LOAD);
  assert.ok(await page.isHidden('.side'), 'the side panel is hidden in the embed');
  assert.match(await page.textContent('#embedStep'), /Built/);
  await page.click('#embedPlay');
  await page.waitForFunction(() => window.guide.done() >= 1, null, LOAD);
  assert.match(await page.textContent('#embedPlay'), /Pause/);
  assert.deepEqual(errors, []);
  await page.close();
});
