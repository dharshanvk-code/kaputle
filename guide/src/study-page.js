// The facilitator's page for the user study: start a session, run the paper-manual timer, and
// see, sum up and export the results kept on this device.
import { startStudy, loadResults, saveResults } from './study.js';

const $ = (id) => document.getElementById(id);
const form = $('newSession');

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const share = (xs, test) => (xs.length ? Math.round((100 * xs.filter(test).length) / xs.length) : NaN);
const num = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '–');
const pct = (n) => (Number.isFinite(n) ? `${n}%` : '–');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---- starting a session

const products = await fetch('products/index.json').then((r) => r.json()).catch(() => []);
form.product.innerHTML = products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');

function suggestNext() {
  const results = loadResults();
  form.participant.value = `P${String(results.length + 1).padStart(2, '0')}`;
  // Alternate the groups so they stay balanced.
  const last = results.at(-1)?.condition;
  const next = last === 'paper' ? '3d' : 'paper';
  form.querySelector(`input[name="condition"][value="${next}"]`).checked = true;
  if (results.length) form.product.value = results.at(-1).product;
  $('nextHint').textContent = results.length ? `Suggested: ${next === '3d' ? '3D guide' : 'paper manual'} next, to keep the groups balanced.` : '';
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const participant = form.participant.value.trim().replace(/[^\w-]/g, '');
  const condition = form.condition.value;
  const product = form.product.value;
  if (loadResults().some((r) => r.participant === participant) && !confirm(`There's already a result for ${participant}. Start another session with the same code?`)) return;
  if (condition === '3d') {
    location.href = `index.html?product=${encodeURIComponent(product)}&study=${encodeURIComponent(participant)}`;
    return;
  }
  $('setup').hidden = true;
  $('results').hidden = true;
  $('paperSession').hidden = false;
  startStudy({ participant, condition, product, mount: $('paperSession') });
});

// ---- the results

const COLUMNS = [
  ['participant', 'Participant'], ['condition', 'Instructions'], ['product', 'Furniture'], ['date', 'Date'],
  ['minutes', 'Minutes'], ['stuck', 'Got stuck'], ['mistakes', 'Mistakes'], ['result', 'Built correctly'],
  ['enjoyment', 'Enjoyment (1–5)'], ['confidence', 'Confidence (1–5)'], ['ease', 'Ease (1–7)'],
  ['experience', 'Experience'], ['prefer', 'Would rather use'], ['confusing', 'Confusing'], ['notes', 'Notes'],
];

function render() {
  const results = loadResults();
  const groups = [['paper', 'Paper manual'], ['3d', '3D guide']].map(([key, label]) => [label, results.filter((r) => r.condition === key)]);
  const row = (label, cell) => `<tr><th scope="row">${label}</th>${groups.map(([, rs]) => `<td>${cell(rs)}</td>`).join('')}</tr>`;
  $('summary').innerHTML = `
    <thead><tr><th></th>${groups.map(([label]) => `<th scope="col">${label}</th>`).join('')}</tr></thead>
    <tbody>
      ${row('People', (rs) => rs.length)}
      ${row('Average minutes', (rs) => num(mean(rs.map((r) => r.minutes))))}
      ${row('Average “got stuck”', (rs) => num(mean(rs.map((r) => r.stuck))))}
      ${row('Average mistakes', (rs) => num(mean(rs.map((r) => r.mistakes))))}
      ${row('Built fully correctly', (rs) => pct(share(rs, (r) => r.result === 'correct')))}
      ${row('Enjoyment (1–5)', (rs) => num(mean(rs.map((r) => r.enjoyment))))}
      ${row('Confidence (1–5)', (rs) => num(mean(rs.map((r) => r.confidence))))}
      ${row('Ease (1–7)', (rs) => num(mean(rs.map((r) => r.ease))))}
      ${row('Would rather use the 3D guide', (rs) => (rs.some((r) => r.prefer) ? pct(share(rs.filter((r) => r.prefer), (r) => r.prefer === '3d')) : '–'))}
    </tbody>`;
  $('rows').innerHTML = `
    <thead><tr>${COLUMNS.map(([, label]) => `<th scope="col">${label}</th>`).join('')}<th></th></tr></thead>
    <tbody>${results.map((r, i) => `<tr>${COLUMNS.map(([key]) => `<td>${esc(key === 'date' ? r.date?.slice(0, 10) : r[key])}</td>`).join('')}<td><button type="button" class="btn ghost" data-delete="${i}">Delete</button></td></tr>`).join('')}</tbody>`;
}

$('rows').addEventListener('click', (e) => {
  const i = e.target.closest('[data-delete]')?.dataset.delete;
  if (i === undefined) return;
  const results = loadResults();
  if (!confirm(`Delete ${results[i].participant}'s result?`)) return;
  results.splice(Number(i), 1);
  saveResults(results);
  render();
  suggestNext();
});

function download(name, type, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const csvCell = (v) => {
  const s = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const stamp = () => new Date().toISOString().slice(0, 10);

$('downloadCsv').addEventListener('click', () => {
  const keys = [...COLUMNS.map(([k]) => k), 'backs', 'replays', 'stepSeconds', 'stuckAt'];
  const lines = [keys.join(','), ...loadResults().map((r) => keys.map((k) => csvCell(r[k])).join(','))];
  download(`kaputle-study-${stamp()}.csv`, 'text/csv', `${lines.join('\n')}\n`);
});
$('downloadJson').addEventListener('click', () => download(`kaputle-study-${stamp()}.json`, 'application/json', JSON.stringify(loadResults(), null, 2)));
$('clearAll').addEventListener('click', () => {
  if (!loadResults().length || !confirm('Delete every result on this device? Download them first if you need them.')) return;
  saveResults([]);
  render();
  suggestNext();
});

render();
suggestNext();
