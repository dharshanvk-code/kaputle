#!/usr/bin/env node
// Records a time-lapse of a guide building itself, as an MP4. Frames are rendered one at a time
// on a fixed clock, so the video is smooth even on a slow machine. Needs ffmpeg.
//
//   npm run record -- hemnes [--speed 10] [--out hemnes-build.mp4] [--poster hemnes.jpg]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FPS = 30;

const args = process.argv.slice(2);
const product = args.find((a) => !a.startsWith('--')) || 'hemnes';
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const speed = Number(option('speed', 5));
const out = path.resolve(option('out', `${product}-build.mp4`));
const poster = option('poster');

const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'kaputle-frames-'));
const server = await serve(0);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 }, colorScheme: 'light' });
  await page.route('https://cdn.jsdelivr.net/npm/three@*/**', (route) => {
    const file = route.request().url().replace(/^.*\/npm\/three@[^/]+\//, '');
    route.fulfill({ path: path.join(root, 'node_modules/three', file), contentType: 'text/javascript' });
  });
  const url = `http://localhost:${server.address().port}/guide/?product=${product}&embed&speed=${speed}`;
  await page.goto(url, { timeout: 300_000 });
  await page.waitForFunction(() => window.guide?.capture && window.guide.done() > 0 && !window.guide.isBusy(), null, { timeout: 300_000 });
  await page.addStyleTag({ content: '.embed-bar, .labels, .part-info { display: none !important; }' });
  await page.evaluate(() => {
    window.guide.capture.pause();
    window.guide.controls.autoRotate = false;
  });

  let n = 0;
  const shoot = async (count) => {
    for (let i = 0; i < count; i++) {
      await page.evaluate((dt) => window.guide.capture.frame(dt), 1 / FPS);
      await page.screenshot({ path: path.join(frames, `f${String(n++).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
    }
  };
  const building = () => page.evaluate(() => window.guide.isBusy() || window.guide.done() < document.querySelectorAll('#stepList li').length);

  // From the box to the finished product, then a slow turn once it's built.
  await page.evaluate(() => window.guide.jumpTo(0));
  await shoot(FPS * 1.2);
  await page.evaluate(() => {
    window.guide.playAll();
  });
  while (await building()) {
    await shoot(1);
    if (n % FPS === 0) process.stdout.write(`\r  ${n / FPS} s recorded`);
  }
  await shoot(FPS * 3);
  process.stdout.write('\n');

  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(frames, 'f%05d.jpg'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '27', '-preset', 'slow', '-movflags', '+faststart', '-an', out]);
  if (poster) fs.copyFileSync(path.join(frames, `f${String(n - 1).padStart(5, '0')}.jpg`), path.resolve(poster));
  console.log(`Wrote ${path.relative(process.cwd(), out)} (${(n / FPS).toFixed(1)} s)${poster ? ` and ${poster}` : ''}`);
} finally {
  await browser.close();
  server.close();
  fs.rmSync(frames, { recursive: true, force: true });
}
