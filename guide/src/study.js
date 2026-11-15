// User-study mode, for comparing the paper manual with the 3D guide. Both groups get the same
// treatment: a build timer, a "Got stuck" button, and the same questions afterwards (enjoyment,
// confidence, ease) plus a few for the facilitator (mistakes seen, whether it was built right).
// With the 3D guide it also times every step. Results are kept on this device; study.html lists
// them, sums them up and exports them as a spreadsheet.
//
// It doesn't import three.js, so the paper-manual timer in study.html loads fast.

const RESULTS = 'kaputle-study-results';
const CURRENT = 'kaputle-study-current'; // the build in progress, so a reload doesn't lose it

const read = (store, key, fallback) => {
  try {
    return JSON.parse(store.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (store, key, value) => {
  try {
    store.setItem(key, JSON.stringify(value));
  } catch { /* private browsing with storage off: the export still works this session */ }
};

export const loadResults = () => read(localStorage, RESULTS, []);
export const saveResults = (list) => write(localStorage, RESULTS, list);

const clock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

let session = null;
let stepStarted = 0;
let ui = null;

const persist = () => write(sessionStorage, CURRENT, session);

// ---- the questions, the same for both groups

const scale = (name, label, low, high, n) => `
  <fieldset class="study-scale">
    <legend>${label}</legend>
    <div class="study-options">${Array.from({ length: n }, (_, i) => `<label><input type="radio" name="${name}" value="${i + 1}" required><span>${i + 1}</span></label>`).join('')}</div>
    <div class="study-ends"><span>${low}</span><span>${high}</span></div>
  </fieldset>`;

const choice = (name, label, options) => `
  <fieldset class="study-choice">
    <legend>${label}</legend>
    ${options.map(([value, text]) => `<label><input type="radio" name="${name}" value="${value}" required> ${text}</label>`).join('')}
  </fieldset>`;

function surveyHtml(condition) {
  return `
    <form method="dialog" class="study-survey">
      <h2>Nice work. A few quick questions</h2>
      <p class="study-help">There are no right answers. We’re testing the instructions, not you.</p>
      ${scale('enjoyment', 'How much did you enjoy putting it together?', 'Not at all', 'A lot', 5)}
      ${scale('confidence', 'How sure were you, at each step, that you were doing it right?', 'Not sure at all', 'Completely sure', 5)}
      ${scale('ease', 'Overall, how easy or difficult was it?', 'Very difficult', 'Very easy', 7)}
      ${choice('experience', 'Before today, how often had you put together flat-pack furniture?', [['never', 'Never'], ['few', 'Once or a few times'], ['often', 'Many times']])}
      ${condition === '3d' ? choice('prefer', 'Next time, which would you rather use?', [['3d', 'This 3D guide'], ['paper', 'A paper manual'], ['either', 'No preference']]) : ''}
      <label class="study-text">What, if anything, was confusing? <textarea name="confusing" rows="2"></textarea></label>
      <div class="study-facilitator">
        <h3>For the facilitator</h3>
        <label class="study-text">Mistakes you saw (a part put on wrong, a step undone or redone) <input type="number" name="mistakes" min="0" step="1" required inputmode="numeric"></label>
        ${choice('result', 'Was it built correctly at the end?', [['correct', 'Yes, all correct'], ['minor', 'Small issues'], ['wrong', 'No, something is wrong']])}
        <label class="study-text">Notes <textarea name="notes" rows="2"></textarea></label>
      </div>
      <button type="submit" class="btn primary">Save result</button>
    </form>`;
}

// ---- the bar shown while building, and the dialogs around it

function buildUi(mount) {
  const bar = document.createElement('div');
  bar.className = 'study-bar';
  bar.innerHTML = `
    <span class="study-who"></span>
    <span class="study-time" aria-live="off">0:00</span>
    <button type="button" class="btn study-stuck">Got stuck</button>
    <button type="button" class="btn primary study-finish">I’m finished</button>`;
  mount.append(bar);

  const intro = document.createElement('dialog');
  intro.className = 'study-dialog';
  intro.innerHTML = `
    <h2>Ready when you are</h2>
    <p>Build the furniture using ${session.condition === '3d' ? 'this 3D guide' : 'the paper manual'}. Work at your normal pace.</p>
    <p>If you get stuck, tap <b>Got stuck</b>, then carry on. When the furniture is fully built, tap <b>I’m finished</b>.</p>
    <button type="button" class="btn primary study-start">Start the timer</button>`;
  document.body.append(intro);

  const survey = document.createElement('dialog');
  survey.className = 'study-dialog study-survey-dialog';
  document.body.append(survey);

  const time = bar.querySelector('.study-time');
  const tick = setInterval(() => {
    if (session?.startedAt && !session.finishedAt) time.textContent = clock(Date.now() - session.startedAt);
  }, 500);

  bar.querySelector('.study-who').textContent = `${session.participant} · ${session.condition === '3d' ? '3D guide' : 'Paper manual'}`;
  bar.querySelector('.study-stuck').addEventListener('click', (e) => {
    if (!session.startedAt) return;
    session.stuck.push({ step: session.step, atSec: Math.round((Date.now() - session.startedAt) / 1000) });
    persist();
    e.currentTarget.textContent = `Got stuck (${session.stuck.length})`;
  });
  bar.querySelector('.study-finish').addEventListener('click', () => {
    if (!session.startedAt) return;
    if (!confirm('Is the furniture completely built?')) return;
    session.finishedAt = Date.now();
    persist();
    clearInterval(tick);
    time.textContent = clock(session.finishedAt - session.startedAt);
    survey.innerHTML = surveyHtml(session.condition);
    survey.showModal();
    survey.querySelector('form').addEventListener('submit', (ev) => {
      const form = new FormData(ev.currentTarget);
      const answers = Object.fromEntries(form.entries());
      for (const k of ['enjoyment', 'confidence', 'ease', 'mistakes']) answers[k] = Number(answers[k]);
      const result = {
        participant: session.participant,
        condition: session.condition,
        product: session.product,
        date: new Date(session.startedAt).toISOString(),
        minutes: Math.round((session.finishedAt - session.startedAt) / 600) / 100,
        stuck: session.stuck.length,
        stuckAt: session.stuck,
        backs: session.backs,
        replays: session.replays,
        stepSeconds: session.stepSeconds,
        ...answers,
      };
      saveResults([...loadResults(), result]);
      try {
        sessionStorage.removeItem(CURRENT);
      } catch { /* nothing kept */ }
      survey.innerHTML = `
        <h2>Saved. Thank you!</h2>
        <p>Please hand the device back to the facilitator.</p>
        <a class="btn primary" href="study.html">Back to the study page</a>`;
    });
  });
  intro.querySelector('.study-start').addEventListener('click', () => {
    session.startedAt = Date.now();
    stepStarted = session.startedAt;
    persist();
    intro.close();
  });
  return { intro };
}

// Starts (or, after a reload, resumes) a timed build. `condition` is "3d" or "paper".
export function startStudy({ participant, condition, product, mount = document.body }) {
  const saved = read(sessionStorage, CURRENT, null);
  session = saved && saved.participant === participant && saved.condition === condition && !saved.finishedAt
    ? saved
    : { participant, condition, product, startedAt: 0, finishedAt: 0, step: 1, stuck: [], backs: {}, replays: {}, stepSeconds: {} };
  stepStarted = Date.now();
  persist();
  document.documentElement.classList.add('study');
  ui = buildUi(mount);
  if (!session.startedAt) ui.intro.showModal();
}

// ---- hooks the 3D guide calls as the participant moves through the steps

const active = () => session && session.startedAt && !session.finishedAt;

// `done` steps are now complete, so step `done` (counting from 1) just finished.
export function studyStepDone(done) {
  if (!active() || session.condition !== '3d') return;
  const now = Date.now();
  session.stepSeconds[done] = Math.round(((session.stepSeconds[done] || 0) + (now - stepStarted) / 1000) * 10) / 10;
  stepStarted = now;
  session.step = done + 1;
  persist();
}

// They went back, so step `done + 1` is to be done again.
export function studyBack(done) {
  if (!active()) return;
  const step = done + 1;
  session.backs[step] = (session.backs[step] || 0) + 1;
  session.step = step;
  stepStarted = Date.now();
  persist();
}

// They watched step `done` again.
export function studyReplay(done) {
  if (!active()) return;
  session.replays[done] = (session.replays[done] || 0) + 1;
  persist();
}
