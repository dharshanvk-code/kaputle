// Visit counts, through GoatCounter: no cookies and nothing that identifies a person. It counts
// a view of each guide, the first time someone reaches its last step, and, in the embed, the first
// press of play. It only runs on the published site, so local runs and tests count nothing.
import { PRODUCT_NAME, EMBED } from './config.js';

const ENDPOINT = 'https://kaputle.goatcounter.com/count';
const ON = location.hostname === 'dharshanvk-code.github.io';
let loaded;
const once = new Set();

function load() {
  loaded ??= new Promise((resolve) => {
    // allow_frame: the embed runs inside the portfolio page, which GoatCounter ignores by default.
    window.goatcounter = { no_onload: true, allow_frame: true, endpoint: ENDPOINT };
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://gc.zgo.at/count.js';
    s.dataset.goatcounter = ENDPOINT;
    s.onload = resolve; // if a blocker stops it, nothing is counted and nothing breaks
    document.head.append(s);
  });
  return loaded;
}

function count(path, title, event) {
  if (!ON || once.has(path)) return;
  once.add(path);
  load().then(() => window.goatcounter?.count?.({ path, title, event }));
}

export const countView = (name) => !EMBED && count(`/kaputle/guide/${PRODUCT_NAME}`, name, false);
export const countFinished = (name) => !EMBED && count(`finished-${PRODUCT_NAME}`, `Finished: ${name}`, true);
export const countEmbedPlay = (name) => EMBED && count(`embed-play-${PRODUCT_NAME}`, `Pressed play on the portfolio: ${name}`, true);
