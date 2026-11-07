// The app's home screen: every guide, easiest first, from products/index.json
// (written by tools/build-library.mjs).
import { startApp, STANDALONE } from './app.js';

startApp();

const list = document.getElementById('guides');

function card(g) {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.className = 'guide-card';
  a.href = `index.html?product=${encodeURIComponent(g.id)}`;
  const img = document.createElement('img');
  img.src = g.image;
  img.alt = '';
  img.width = 800;
  img.height = 500;
  img.loading = 'lazy';
  const body = document.createElement('div');
  body.className = 'body';
  const h = document.createElement('h2');
  h.textContent = g.name;
  const spec = document.createElement('p');
  spec.textContent = g.spec;
  const meta = document.createElement('p');
  meta.className = 'meta';
  meta.textContent = `${g.parts} parts · ${g.steps} steps`;
  body.append(h, spec, meta);
  a.append(img, body);
  li.append(a);
  return li;
}

try {
  const res = await fetch('products/index.json');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  list.replaceChildren(...(await res.json()).map(card));
} catch {
  list.innerHTML = '<li class="library-error">Couldn’t load the list of guides. Check your connection and try again.</li>';
}

// The install hint: a button where the browser offers one (Chrome, Edge, Android), the
// Share-menu steps on an iPhone or iPad, and nothing once installed or dismissed.
const hint = document.getElementById('install');
const dismissed = () => {
  try {
    return localStorage.getItem('kaputle-install-dismissed') === '1';
  } catch {
    return false;
  }
};
document.getElementById('installClose').addEventListener('click', () => {
  hint.hidden = true;
  try {
    localStorage.setItem('kaputle-install-dismissed', '1');
  } catch { /* private mode: it just shows again next time */ }
});
if (!STANDALONE && !dismissed()) {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) {
    document.getElementById('installHow').textContent = 'Tap the Share button, then “Add to Home Screen”. Guides you’ve opened then work without internet.';
    hint.hidden = false;
  }
  let offer = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    offer = e;
    document.getElementById('installBtn').hidden = false;
    hint.hidden = false;
  });
  document.getElementById('installBtn').addEventListener('click', async () => {
    if (!offer) return;
    offer.prompt();
    await offer.userChoice;
    offer = null;
    hint.hidden = true;
  });
}
