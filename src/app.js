// Screens and wiring. The game rules live in game.js, progress in store.js and
// everything geographic in map.js; this file only moves data between them.
import { Round, selectItems, mastery } from './game.js';
import { createStore } from './store.js';
import { createMap } from './map.js';
import { el, $, displayName, fullName, promptNode, formatPercent } from './ui.js';

// Root-absolute, not relative: the published site has a home page per language,
// and from /fr/ a relative path would fetch /fr/public/data/. Both the dev
// server and the CDN serve the repo layout from /, so this resolves identically
// in both.
const DATA = '/public/data/';
// A miss is left on screen longer than a hit: there are two shapes to take in,
// and you have something to learn from it.
const FEEDBACK_HIT_MS = 900;
const FEEDBACK_MISS_MS = 1800;

const state = {
  index: null,
  store: createStore(),
  scopes: new Map(),   // id -> loaded scope file
  round: null,
  scopeId: 'belgium',
  size: 20,
  map: null,
  inset: null,
  busy: false,
  settle: null,
};

const root = document.getElementById('app');

/** Swap the screen. Unlike replaceChildren, a skipped optional node is dropped
 *  rather than stringified into a stray "undefined" on the page. */
function render(...nodes) {
  root.replaceChildren(...nodes.flat().filter((n) => n != null && n !== false));
  showRoundEndAd(false);
}

/** The round-end ad slot sits outside #app (see scripts/lib/pages/game.mjs)
 *  and only exists when ads are configured. It is filled the first time it is
 *  shown, because AdSense cannot size an ad inside a hidden element. */
function showRoundEndAd(show) {
  const slot = document.getElementById('ad-round-end');
  if (!slot) return;
  slot.hidden = !show;
  if (show && !slot.dataset.filled) {
    slot.dataset.filled = '1';
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* blocked */ }
  }
}

async function boot() {
  try {
    state.index = await getJSON(`${DATA}municipalities.json`);
  } catch (err) {
    render(el('p', { class: 'notice error' },
      'Could not load the map data. If you opened index.html directly, serve the folder over HTTP instead — try ',
      el('code', {}, 'npm start'), '.'));
    console.error(err);
    return;
  }
  state.byId = new Map(state.index.municipalities.map((m) => [m.id, m]));
  // The province and region pages send people here with ?scope=antwerpen as
  // their call to action; an id that is not in the index (a stale link, a typo,
  // a municipality merged away) is ignored rather than left to blow up in
  // showStart(), which assumes the current scope exists.
  const wanted = new URLSearchParams(window.location.search).get('scope');
  if (wanted && state.index.scopes.some((s) => s.id === wanted)) state.scopeId = wanted;
  const stamp = document.getElementById('extract-stamp');
  if (stamp && state.index.osmTimestamp) {
    stamp.textContent = ` · OSM extract ${state.index.osmTimestamp.slice(0, 10)}`;
  }
  document.addEventListener('keydown', onKey);
  showStart();
}

const jsonCache = new Map();
async function getJSON(url) {
  if (!jsonCache.has(url)) {
    jsonCache.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return r.json();
    }).catch((err) => { jsonCache.delete(url); throw err; }));
  }
  return jsonCache.get(url);
}

async function loadScope(id) {
  if (!state.scopes.has(id)) state.scopes.set(id, await getJSON(`${DATA}scopes/${id}.json`));
  return state.scopes.get(id);
}

// ---------------------------------------------------------------- start screen

function showStart(message) {
  const scopes = state.index.scopes;
  const grouped = {
    country: scopes.filter((s) => s.kind === 'country'),
    region: scopes.filter((s) => s.kind === 'region'),
    province: scopes.filter((s) => s.kind === 'province'),
  };
  const current = scopes.find((s) => s.id === state.scopeId) ?? scopes[0];
  state.scopeId = current.id;
  state.size = Math.min(state.size, current.count);

  const sizeInput = el('input', {
    type: 'range', min: 1, max: current.count, value: state.size,
    id: 'size', class: 'slider',
    oninput: (e) => { state.size = Number(e.target.value); sizeLabel.textContent = labelFor(); },
  });
  const labelFor = () => `${state.size} of ${current.count}`;
  const sizeLabel = el('output', { class: 'size-label', for: 'size' }, labelFor());

  const scopeButton = (s) => el('button', {
    type: 'button',
    class: `chip${s.id === state.scopeId ? ' is-on' : ''}`,
    onclick: () => { state.scopeId = s.id; state.size = Math.min(state.size, s.count); showStart(); },
  }, s.name, el('span', { class: 'chip-count' }, s.count));

  const preset = (n) => el('button', {
    type: 'button', class: 'chip small',
    disabled: n > current.count,
    onclick: () => { state.size = n; sizeInput.value = n; sizeLabel.textContent = labelFor(); },
  }, n === current.count ? 'all' : n);

  const summary = progressSummary(current);

  render(
    el('header', { class: 'masthead' },
      el('h1', {}, 'City Memory'),
      el('p', { class: 'tagline' },
        'A municipality is named. Click its shape. Miss it and it comes back.'),
    ),
    message && el('p', { class: 'notice' }, message),
    el('section', { class: 'panel' },
      el('h2', {}, 'Where'),
      el('div', { class: 'chips' }, grouped.country.map(scopeButton)),
      el('h3', {}, 'Regions'),
      el('div', { class: 'chips' }, grouped.region.map(scopeButton)),
      el('h3', {}, 'Provinces'),
      el('div', { class: 'chips' }, grouped.province.map(scopeButton)),
    ),
    el('section', { class: 'panel' },
      el('h2', {}, 'How many'),
      el('div', { class: 'size-row' }, sizeInput, sizeLabel),
      el('div', { class: 'chips' }, [5, 10, 20, 50, 100, current.count].filter((n, i, a) => a.indexOf(n) === i).map(preset)),
      el('p', { class: 'hint' },
        `${summary.unseen} never seen · ${summary.shaky} shaky · ${summary.solid} solid`,
        summary.unseen > 0 ? ' — new ones come first.' : ''),
    ),
    el('div', { class: 'actions' },
      el('button', { type: 'button', class: 'primary', onclick: () => startRound() }, 'Start round'),
      el('button', { type: 'button', onclick: showProgress }, 'Progress map'),
      el('button', { type: 'button', onclick: showSettings }, 'Progress data'),
    ),
  );
}

function scopeMembers(scopeId) {
  const scope = state.index.scopes.find((s) => s.id === scopeId);
  return state.index.municipalities.filter((m) => (
    scope.kind === 'country' ? true : scope.kind === 'region' ? m.region === scopeId : m.province === scopeId
  ));
}

function progressSummary(scope) {
  const out = { unseen: 0, shaky: 0, solid: 0 };
  for (const m of scopeMembers(scope.id)) out[mastery(state.store.get(m.id))]++;
  return out;
}

// ----------------------------------------------------------------- play screen

async function startRound(ids) {
  const scope = await loadScope(state.scopeId);
  const pool = scope.features.map((f) => f.id);
  const picked = ids ?? selectItems(pool, state.size, state.store.all());
  // A round started while the previous one's feedback was still on screen would
  // otherwise inherit its input lock and ignore the first answer.
  clearTimeout(state.settle);
  state.busy = false;
  state.round = new Round(picked);
  renderPlay(scope);
}

function renderPlay(scope) {
  const prompt = el('div', { class: 'prompt', id: 'prompt' });
  const feedback = el('div', { class: 'feedback', id: 'feedback', role: 'status', 'aria-live': 'polite' });
  const meter = el('div', { class: 'meter' }, el('div', { class: 'meter-fill', id: 'meter-fill' }));
  const stage = el('div', { class: 'stage' });
  const insetHost = el('div', { class: 'inset', hidden: scope.id !== 'belgium' });

  render(
    el('div', { class: 'play' },
      el('div', { class: 'topbar' },
        el('button', { type: 'button', class: 'ghost', onclick: () => endRound(true) }, '← End'),
        prompt,
        el('div', { class: 'topbar-right' },
          el('button', { type: 'button', class: 'ghost icon', title: 'Zoom out', 'aria-label': 'Zoom out', onclick: () => state.map.zoomBy(1.5) }, '−'),
          el('button', { type: 'button', class: 'ghost icon', title: 'Zoom in', 'aria-label': 'Zoom in', onclick: () => state.map.zoomBy(1 / 1.5) }, '+'),
          el('button', { type: 'button', class: 'ghost', title: 'Reset the view', onclick: () => state.map.resetView() }, 'Reset'),
          el('button', { type: 'button', class: 'ghost', title: 'Give up on this one (space)', onclick: () => answer(null) }, 'Give up'),
        ),
      ),
      meter,
      stage,
      insetHost,
      feedback,
      el('p', { class: 'hint keys' }, 'Scroll, pinch or ± to zoom · drag to pan · space to give up · Esc to end'),
    ),
  );

  state.map = createMap(stage, { onPick: (id) => answer(id) });
  state.map.load(scope);

  state.inset = null;
  if (scope.id === 'belgium') {
    loadScope('brussels').then((brussels) => {
      insetHost.replaceChildren(el('span', { class: 'inset-title' }, 'Brussels'));
      state.inset = createMap(insetHost, { onPick: (id) => answer(id), interactive: false });
      state.inset.load(brussels);
    }).catch(() => { insetHost.hidden = true; });
  }

  nextPrompt();
}

function nextPrompt() {
  const round = state.round;
  const promptHost = $('#prompt');
  const fill = $('#meter-fill');
  if (!round || round.done) return endRound();

  const m = state.byId.get(round.current);
  promptHost.replaceChildren(promptNode(m));
  promptHost.dataset.id = m.id;

  const total = round.items.size;
  const left = round.remainingItems;
  if (fill) fill.style.width = `${Math.round(((total - left) / total) * 100)}%`;
}

function answer(clickedId) {
  const round = state.round;
  if (!round || round.done || state.busy) return;
  state.busy = true;

  const expected = round.current;
  const result = round.answer(clickedId ?? Symbol('gave-up'));
  state.store.record(expected, result.correct);

  const target = state.byId.get(expected);
  const feedback = $('#feedback');

  paint(expected, result.correct ? 'correct' : 'target');
  label(expected, fullName(target), result.correct ? 'good' : 'target');

  if (result.correct) {
    feedback.replaceChildren(el('span', { class: 'good' }, result.retired ? 'Right — retired.' : 'Right.'));
  } else if (clickedId && state.byId.has(clickedId)) {
    const clicked = state.byId.get(clickedId);
    paint(clickedId, 'wrong');
    label(clickedId, fullName(clicked), 'bad');
    feedback.replaceChildren(
      el('span', { class: 'bad' }, `That was ${fullName(clicked)}.`),
      ' ',
      el('span', {}, `${fullName(target)} is here.`),
    );
  } else {
    feedback.replaceChildren(el('span', {}, `${fullName(target)} is here.`));
  }

  const settle = setTimeout(() => {
    state.busy = false;
    // The player may have left mid-feedback (Esc, or a jump to the progress
    // map), in which case this round's screen is gone and there is nothing to
    // clear or prompt.
    if (state.round !== round || !feedback.isConnected) return;
    state.map.clearStates();
    state.inset?.clearStates();
    feedback?.replaceChildren();
    if (result.done) endRound();
    else nextPrompt();
  }, result.correct ? FEEDBACK_HIT_MS : FEEDBACK_MISS_MS);
  state.settle = settle;
}

// Brussels communes appear on both the main map and the inset, so paint both.
function paint(id, kind) {
  state.map.setState(id, kind);
  state.inset?.setState(id, kind);
}

// Only the main map gets a name: the inset is 150 px wide, so a label there
// would be a few pixels tall. The colour alone carries it.
function label(id, text, variant) {
  state.map.showLabel(id, text, variant);
}

function onKey(event) {
  if (!state.round || state.round.done) return;
  if (event.key === ' ' || event.code === 'Space') {
    event.preventDefault();
    answer(null);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    endRound(true);
  }
}

// -------------------------------------------------------------- summary screen

function endRound(abandoned = false) {
  const round = state.round;
  if (!round) return showStart();
  round.end();
  state.round = null;
  state.busy = false;
  clearTimeout(state.settle);

  const stumbles = round.stumbles;
  const scope = state.index.scopes.find((s) => s.id === state.scopeId);

  render(
    el('header', { class: 'masthead' },
      el('h1', {}, abandoned ? 'Round ended' : 'Round complete'),
      el('p', { class: 'tagline' }, scope.name),
    ),
    el('section', { class: 'panel' },
      el('div', { class: 'stats' },
        stat(formatPercent(round.accuracy), 'accuracy'),
        stat(round.correct, 'right'),
        stat(round.wrong, 'wrong'),
        stat(round.items.size, 'municipalities'),
      ),
    ),
    el('section', { class: 'panel' },
      el('h2', {}, stumbles.length ? `Stumbles (${stumbles.length})` : 'No stumbles'),
      stumbles.length
        ? el('ul', { class: 'stumbles' }, stumbles
            .sort((a, b) => b.wrong - a.wrong)
            .map((s) => el('li', {},
              el('span', {}, fullName(state.byId.get(s.id))),
              el('span', { class: 'times' }, `${s.wrong}×`))))
        : el('p', { class: 'hint' }, 'Clean round.'),
    ),
    el('div', { class: 'actions' },
      stumbles.length
        ? el('button', { type: 'button', class: 'primary', onclick: () => startRound(stumbles.map((s) => s.id)) }, 'Drill just these')
        : el('button', { type: 'button', class: 'primary', onclick: () => startRound() }, 'Another round'),
      el('button', { type: 'button', onclick: () => showStart() }, 'Back to start'),
      el('button', { type: 'button', onclick: showProgress }, 'Progress map'),
    ),
  );
  showRoundEndAd(true);
}

const stat = (value, label) => el('div', { class: 'stat' },
  el('div', { class: 'stat-value' }, String(value)),
  el('div', { class: 'stat-label' }, label));

// ------------------------------------------------------------- progress screen

async function showProgress() {
  const scope = await loadScope('belgium');
  const stage = el('div', { class: 'stage tall' });
  const readout = el('p', { class: 'hint', id: 'progress-readout' }, 'Hover or tap a municipality.');

  const counts = { unseen: 0, shaky: 0, solid: 0 };
  for (const m of state.index.municipalities) counts[mastery(state.store.get(m.id))]++;

  render(
    el('header', { class: 'masthead' },
      el('h1', {}, 'Progress'),
      el('p', { class: 'tagline' }, 'Where the blind spots are.'),
    ),
    el('div', { class: 'legend' },
      el('span', { class: 'key m-unseen' }, `never seen (${counts.unseen})`),
      el('span', { class: 'key m-shaky' }, `shaky (${counts.shaky})`),
      el('span', { class: 'key m-solid' }, `solid (${counts.solid})`),
    ),
    stage,
    readout,
    el('div', { class: 'actions' },
      el('button', { type: 'button', class: 'primary', onclick: () => showStart() }, 'Back to start'),
      el('button', { type: 'button', onclick: showSettings }, 'Progress data'),
    ),
  );

  const map = createMap(stage, {
    onPick: (id) => {
      const m = state.byId.get(id);
      const stat = state.store.get(id);
      $('#progress-readout').textContent = stat.seen
        ? `${fullName(m)} — ${stat.correct}/${stat.seen} right, streak ${stat.streak} (${mastery(stat)})`
        : `${fullName(m)} — never seen`;
    },
  });
  map.load(scope);
  map.svg.classList.add('is-progress');
  for (const id of map.ids) map.setMastery(id, mastery(state.store.get(id)));
}

// ------------------------------------------------------------- settings screen

function showSettings() {
  const fileInput = el('input', {
    type: 'file', accept: 'application/json,.json', class: 'file',
    onchange: async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const count = state.store.fromJSON(await file.text());
        showStart(`Imported progress for ${count} municipalities.`);
      } catch (err) {
        $('#settings-status').replaceChildren(el('span', { class: 'bad' }, `Import failed: ${err.message}`));
      }
    },
  });

  const total = state.index.municipalities.length;
  const tracked = Object.keys(state.store.all()).length;

  render(
    el('header', { class: 'masthead' },
      el('h1', {}, 'Progress data'),
      el('p', { class: 'tagline' }, `${tracked} of ${total} municipalities have a record.`),
    ),
    el('section', { class: 'panel' },
      el('h2', {}, 'Export'),
      el('p', { class: 'hint' }, 'A JSON file keyed by NIS code, so it survives a cleared browser, a new machine or a data rebuild.'),
      el('button', { type: 'button', onclick: exportProgress }, 'Download progress.json'),
    ),
    el('section', { class: 'panel' },
      el('h2', {}, 'Import'),
      el('p', { class: 'hint' }, 'Replaces what is stored in this browser.'),
      fileInput,
    ),
    el('section', { class: 'panel danger' },
      el('h2', {}, 'Reset'),
      el('button', { type: 'button', class: 'danger', onclick: () => {
        state.store.reset();
        showStart('Progress cleared.');
      } }, 'Erase all progress'),
    ),
    el('p', { class: 'notice', id: 'settings-status' }),
    el('div', { class: 'actions' },
      el('button', { type: 'button', class: 'primary', onclick: () => showStart() }, 'Back to start'),
    ),
  );
}

function exportProgress() {
  const blob = new Blob([JSON.stringify(state.store.toJSON(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `city-memory-progress-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Exposed so the DOM smoke test can drive a round without scraping globals.
globalThis.cityMemory = { state, startRound, answer, showStart, showProgress };

boot();
