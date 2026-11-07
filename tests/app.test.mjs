// Checks of the installable app: the home screen lists every guide, the offline cache knows every
// file the player needs, and after one visit the home screen and a guide work with no network.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from '../tools/serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const guide = (...p) => path.join(root, 'guide', ...p);
const PRODUCTS = fs.readdirSync(guide('products')).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => f.slice(0, -5));
const index = JSON.parse(fs.readFileSync(guide('products/index.json'), 'utf8'));
const LOAD = { timeout: 300_000 };

test('the home screen lists every guide, with a picture for each', () => {
  assert.deepEqual(index.map((g) => g.id).sort(), [...PRODUCTS].sort(), 'run npm run build:library after adding a guide');
  for (const g of index) assert.ok(fs.existsSync(guide(g.image)), `${g.image} is missing`);
});

test('the offline cache lists every file of the player, and the manifest icons exist', () => {
  const sw = fs.readFileSync(guide('sw.js'), 'utf8');
  for (const f of fs.readdirSync(guide('src'))) assert.ok(sw.includes(`'src/${f}'`), `sw.js doesn't cache src/${f}`);
  const manifest = JSON.parse(fs.readFileSync(guide('manifest.webmanifest'), 'utf8'));
  for (const icon of manifest.icons) assert.ok(fs.existsSync(guide(icon.src)), `${icon.src} is missing`);
  assert.ok(fs.existsSync(guide(manifest.start_url)));
});

let server;
let browser;
let base;

before(async () => {
  server = await serve(0);
  base = `http://localhost:${server.address().port}/guide/`;
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
});

after(async () => {
  await browser?.close();
  server?.close();
});

test('after one visit, the home screen and a guide open with no network', async () => {
  const context = await browser.newContext({ viewport: { width: 900, height: 600 }, reducedMotion: 'reduce' });
  // Routed on the context, so the service worker's own requests are served from disk too.
  await context.route('https://cdn.jsdelivr.net/npm/three@*/**', (route) => {
    const file = route.request().url().replace(/^.*\/npm\/three@[^/]+\//, '');
    route.fulfill({ path: path.join(root, 'node_modules/three', file), contentType: 'text/javascript' });
  });
  await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.fulfill({ body: '', contentType: 'text/css' }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => errors.push(`${r.url()}: ${r.failure()?.errorText}`));
  try {
    // ?sw turns the service worker on, which test browsers otherwise skip.
    await page.goto(`${base}library.html?sw`, LOAD);
    assert.equal(await page.locator('.guide-card').count(), PRODUCTS.length);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.click('.guide-card >> text=Console table');
    await page.waitForFunction(() => window.__guideReady && !window.guide.isBusy(), null, LOAD);

    await context.setOffline(true);
    await page.goto(`${base}library.html`, LOAD);
    await page.waitForSelector('.guide-card');
    assert.equal(await page.locator('.guide-card').count(), PRODUCTS.length);
    await page.goto(`${base}index.html?product=console`, LOAD);
    await page.waitForFunction(() => window.__guideReady && !window.guide.isBusy(), null, LOAD);
    assert.equal(await page.textContent('#productName'), 'Console table');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
