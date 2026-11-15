// The user-study mode, run the way a facilitator would: one person builds with the paper manual,
// the next with the 3D guide, and the results page sums both up and exports them.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from '../tools/serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOAD = { timeout: 300_000 };
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

async function answerSurvey(page, { enjoyment, mistakes }) {
  const survey = page.locator('.study-survey');
  await survey.waitFor();
  await survey.locator(`input[name="enjoyment"][value="${enjoyment}"] + span`).click();
  await survey.locator('input[name="confidence"][value="4"] + span').click();
  await survey.locator('input[name="ease"][value="6"] + span').click();
  await survey.locator('input[name="experience"][value="few"]').check();
  if (await survey.locator('input[name="prefer"]').count()) await survey.locator('input[name="prefer"][value="3d"]').check();
  await survey.locator('textarea[name="confusing"]').fill('Which way the shelf goes, at first');
  await survey.locator('input[name="mistakes"]').fill(String(mistakes));
  await survey.locator('input[name="result"][value="correct"]').check();
  await survey.locator('button[type="submit"]').click();
  await page.getByText('Saved. Thank you!').waitFor();
}

test('a paper session and a 3D session are timed, surveyed and summed up', async () => {
  const context = await browser.newContext({ viewport: { width: 1000, height: 700 }, reducedMotion: 'reduce' });
  await context.route('https://cdn.jsdelivr.net/npm/three@*/**', (route) => {
    const file = route.request().url().replace(/^.*\/npm\/three@[^/]+\//, '');
    route.fulfill({ path: path.join(root, 'node_modules/three', file), contentType: 'text/javascript' });
  });
  await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.fulfill({ body: '', contentType: 'text/css' }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept()); // "Is the furniture completely built?"
  try {
    // Person 1: the paper manual, timed on the study page itself.
    await page.goto(`${base}study.html`, LOAD);
    await page.waitForFunction(() => document.querySelector('select[name="product"]').options.length > 0);
    assert.equal(await page.inputValue('input[name="participant"]'), 'P01');
    assert.ok(await page.isChecked('input[name="condition"][value="paper"]'));
    await page.selectOption('select[name="product"]', 'end-table');
    await page.click('#newSession button[type="submit"]');
    await page.click('.study-start');
    await page.click('.study-stuck');
    await page.click('.study-finish');
    await answerSurvey(page, { enjoyment: 3, mistakes: 2 });

    // Person 2: the 3D guide. The study page suggests it, to keep the groups balanced.
    await page.goto(`${base}study.html`, LOAD);
    await page.waitForFunction(() => document.querySelector('input[name="participant"]').value === 'P02');
    assert.ok(await page.isChecked('input[name="condition"][value="3d"]'));
    assert.equal(await page.inputValue('select[name="product"]'), 'end-table');
    await page.click('#newSession button[type="submit"]');
    await page.waitForFunction(() => window.__guideReady && !window.guide.isBusy(), null, LOAD);
    await page.click('.study-start');
    for (let i = 0; i < 3; i++) {
      await page.click('#card [data-act="next"]');
      await page.waitForFunction(() => !window.guide.isBusy(), null, LOAD);
    }
    await page.click('#replayBtn');
    await page.waitForFunction(() => window.guide.done() === 3 && !window.guide.isBusy(), null, LOAD);
    await page.click('.study-finish');
    await answerSurvey(page, { enjoyment: 5, mistakes: 0 });

    // The results page: one person in each group, with the 3D session's per-step timings.
    await page.goto(`${base}study.html`, LOAD);
    const results = await page.evaluate(() => JSON.parse(localStorage.getItem('kaputle-study-results')));
    assert.deepEqual(results.map((r) => [r.participant, r.condition, r.product]), [['P01', 'paper', 'end-table'], ['P02', '3d', 'end-table']]);
    assert.equal(results[0].stuck, 1);
    assert.equal(results[0].mistakes, 2);
    assert.deepEqual(Object.keys(results[1].stepSeconds), ['1', '2', '3']);
    assert.deepEqual(results[1].replays, { 3: 1 });
    assert.deepEqual(results[1].backs, {}, 'a replay is not counted as going back');
    assert.equal(results[1].prefer, '3d');
    const summary = await page.locator('#summary').innerText();
    assert.match(summary, /People\s+1\s+1/);
    assert.match(summary, /Enjoyment \(1–5\)\s+3\.0\s+5\.0/);

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#downloadCsv')]);
    const csv = fs.readFileSync(await download.path(), 'utf8').trim().split('\n');
    assert.equal(csv.length, 3);
    assert.ok(csv[0].startsWith('participant,condition,product,date,minutes'));
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
