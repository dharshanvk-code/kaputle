#!/usr/bin/env node
// Builds the app's home screen data: guide/products/index.json (one line per guide, easiest
// first) and a picture of each finished product in guide/images/. Run it after adding a guide.
//
//   npm run build:library [-- --no-images]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productsDir = path.join(root, 'guide/products');
const imagesDir = path.join(root, 'guide/images');

const ids = fs.readdirSync(productsDir).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => f.replace(/\.json$/, ''));
const guides = ids.map((id) => {
  const p = JSON.parse(fs.readFileSync(path.join(productsDir, `${id}.json`), 'utf8'));
  return { id, name: p.name, spec: p.spec || '', parts: p.parts.length, steps: p.steps.length, image: `images/${id}.jpg` };
}).sort((a, b) => a.parts - b.parts);
fs.writeFileSync(path.join(productsDir, 'index.json'), `[\n${guides.map((g) => `  ${JSON.stringify(g)}`).join(',\n')}\n]\n`);
console.log(`Wrote guide/products/index.json: ${guides.length} guides`);

if (!process.argv.includes('--no-images')) {
  fs.mkdirSync(imagesDir, { recursive: true });
  const server = await serve(0);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 500 }, colorScheme: 'light' });
    await page.route('https://cdn.jsdelivr.net/npm/three@*/**', (route) => {
      const file = route.request().url().replace(/^.*\/npm\/three@[^/]+\//, '');
      route.fulfill({ path: path.join(root, 'node_modules/three', file), contentType: 'text/javascript' });
    });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ body: '', contentType: 'text/css' }));
    for (const g of guides) {
      // The embed opens on the finished product; stop it turning and hide its controls.
      await page.goto(`http://localhost:${server.address().port}/guide/?product=${g.id}&embed`, { timeout: 300_000 });
      await page.waitForFunction((n) => window.guide?.done() === n && !window.guide.isBusy(), g.steps, { timeout: 300_000 });
      await page.addStyleTag({ content: '.embed-bar, .labels { display: none !important; }' });
      await page.evaluate(() => (window.guide.controls.autoRotate = false));
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(imagesDir, `${g.id}.jpg`), type: 'jpeg', quality: 82 });
      console.log(`  ${g.image}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}
