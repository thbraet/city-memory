// A DOM smoke test: boot the real page under jsdom, start a Belgium round, click
// the right shape, then click a wrong one, and assert the game reacts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('..', import.meta.url));

const dom = new JSDOM(await readFile(path.join(root, 'index.html'), 'utf8'), {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
const { window } = dom;

// The page fetches its data relative to the document; serve it from disk.
window.fetch = async (url) => {
  const rel = String(url).replace(/^https?:\/\/[^/]+\//, '');
  const body = await readFile(path.join(root, rel), 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(body) };
};

// Node's own timers stay in place: jsdom's are defined in terms of the global
// ones, so copying them across makes setTimeout call itself forever.
for (const key of ['window', 'document', 'Node', 'Event', 'MouseEvent', 'localStorage', 'Blob', 'getComputedStyle']) {
  globalThis[key] = window[key] ?? globalThis[key];
}
globalThis.window = window;
globalThis.document = window.document;
globalThis.fetch = window.fetch;

await import('../src/app.js');

const app = globalThis.cityMemory;
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** Wait until `check()` is truthy, or fail after `ms`. */
async function until(check, ms = 5000, what = 'condition') {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await tick(10);
  }
  throw new Error(`timed out waiting for ${what}`);
}

test('the start screen renders the scopes and a size picker', async () => {
  await until(() => document.querySelector('.chips'), 5000, 'the start screen');
  const chipLabels = [...document.querySelectorAll('.chip')].map((c) => c.textContent);
  assert.ok(chipLabels.some((t) => t.includes('België')), 'offers Belgium');
  assert.ok(chipLabels.some((t) => t.includes('Vlaanderen')), 'offers Flanders');
  assert.ok(chipLabels.some((t) => t.includes('Hainaut')), 'offers a province');
  assert.ok(document.querySelector('#size'), 'offers a batch size');
});

test('a Belgium round draws a clickable path per municipality', async () => {
  app.state.size = 6;
  app.state.scopeId = 'belgium';
  await app.startRound();
  await until(() => document.querySelector('.shapes path'), 5000, 'the map');

  const shapes = document.querySelectorAll('.shapes path');
  assert.equal(shapes.length, app.state.index.municipalities.length, 'one path per municipality');

  // Extra hit targets go to the shapes too small to click, not to every shape:
  // a fat stroke on a big municipality eats into its neighbours.
  const hitIds = new Set([...document.querySelectorAll('.hits path')].map((p) => p.dataset.id));
  assert.ok(hitIds.size > 0 && hitIds.size < shapes.length, `${hitIds.size} extra hit targets`);
  for (const id of ['21014', '21008', '21011']) {   // the smallest Brussels communes
    assert.ok(hitIds.has(id), `${id} is small enough to need a hit target`);
  }
  for (const id of ['62063', '82039', '57081']) {   // Liège, Bastogne, Tournai
    assert.ok(!hitIds.has(id), `${id} is large enough not to need one`);
  }
  assert.ok(document.querySelector('#prompt').textContent.length > 0, 'a municipality is named');
  assert.equal(document.querySelectorAll('.labels text').length, 0, 'no names on the map during play');
});

test('clicking the correct path registers the answer', async () => {
  const round = app.state.round;
  const expected = round.current;
  const before = round.correct;

  const target = document.querySelector(`.shapes path[data-id="${expected}"]`);
  assert.ok(target, 'the prompted municipality is on the map');
  target.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  assert.equal(round.correct, before + 1, 'counted as correct');
  assert.equal(round.items.get(expected).streak, 1, 'the streak advanced');
  assert.ok(target.classList.contains('is-correct'), 'the shape is marked correct');
  assert.ok(document.querySelector('.labels text'), 'the name appears after the answer');
  assert.ok(document.querySelector('#feedback').textContent.includes('Right'), 'feedback says so');

  await until(() => !document.querySelector('.shapes path.is-correct'), 5000, 'the feedback to clear');
  assert.equal(document.querySelectorAll('.labels text').length, 0, 'labels clear with it');
});

test('clicking a wrong path requeues the prompted municipality', async () => {
  const round = app.state.round;
  const expected = await until(() => round.current, 5000, 'the next prompt');
  const wrong = app.state.index.municipalities.find((m) => m.id !== expected).id;

  const beforeWrong = round.wrong;
  const decoy = document.querySelector(`.shapes path[data-id="${wrong}"]`);
  decoy.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  assert.equal(round.wrong, beforeWrong + 1, 'counted as wrong');
  assert.equal(round.items.get(expected).streak, 0, 'the streak reset');
  assert.ok(round.queue.includes(expected), 'the missed municipality is requeued');
  assert.ok(round.queue.indexOf(expected) >= 1, 'not as the very next prompt');
  assert.ok(decoy.classList.contains('is-wrong'), 'the wrong shape is flagged');
  assert.ok(document.querySelector(`.shapes path[data-id="${expected}"]`).classList.contains('is-target'),
    'the right one is pointed out');
  assert.ok(document.querySelector('#feedback').textContent.includes('That was'), 'and named');
});

test('the Belgium map carries a Brussels inset', async () => {
  await until(() => document.querySelector('.inset .map'), 5000, 'the inset');
  assert.equal(document.querySelectorAll('.inset .shapes path').length, 19, 'the 19 communes');
});

test('the footer credits OpenStreetMap under ODbL', () => {
  const footer = document.querySelector('.footer').textContent;
  assert.match(footer, /OpenStreetMap contributors, ODbL/);
  assert.ok(document.querySelector('.footer a[href="https://www.openstreetmap.org/copyright"]'));
  assert.match(footer, /OSM extract \d{4}-\d{2}-\d{2}/);
});

test('the progress map shades every municipality by mastery', async () => {
  await app.showProgress();
  await until(() => document.querySelector('.is-progress'), 5000, 'the progress map');
  const shaded = document.querySelectorAll('.is-progress .shapes path[class*="m-"]');
  assert.equal(shaded.length, app.state.index.municipalities.length);
  assert.ok(document.querySelectorAll('.legend .key').length === 3, 'a three-way legend');
});

test('space gives up on the current prompt and requeues it', async () => {
  app.state.scopeId = 'brussels';
  app.state.size = 4;
  await app.startRound();
  await until(() => document.querySelector('.shapes path'), 5000, 'the map');

  const round = app.state.round;
  const expected = round.current;
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true }));

  assert.equal(round.wrong, 1, 'giving up counts as a miss');
  assert.ok(round.queue.includes(expected), 'and the item comes back');
  assert.ok(document.querySelector('#feedback').textContent.includes('is here'), 'the answer is shown');
  await until(() => !document.querySelector('.shapes path.is-target'), 5000, 'the feedback to clear');
});

test('the zoom buttons change the view without answering', async () => {
  const round = app.state.round;
  const asked = round.asked;
  const svg = document.querySelector('.stage .map');
  const before = svg.getAttribute('viewBox');

  const zoomIn = [...document.querySelectorAll('.topbar-right button')].find((b) => b.title === 'Zoom in');
  assert.ok(zoomIn, 'there is a zoom-in button');
  zoomIn.click();

  assert.notEqual(svg.getAttribute('viewBox'), before, 'the view changed');
  assert.equal(round.asked, asked, 'no answer was submitted');

  [...document.querySelectorAll('.topbar-right button')].find((b) => b.title === 'Reset the view').click();
  assert.equal(svg.getAttribute('viewBox'), before, 'reset restores the starting view');
});

test('Esc ends the round and shows the summary', async () => {
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(app.state.round, null, 'the round is over');
  assert.match(document.querySelector('h1').textContent, /Round ended/);
  assert.ok(document.querySelector('.stats'), 'with a scoreline');
});

test('export and import round-trip through the settings screen', async () => {
  const exported = app.state.store.toJSON();
  assert.ok(Object.keys(exported.stats).length > 0, 'a round left progress behind');
  const before = app.state.store.all();

  app.state.store.reset();
  assert.deepEqual(app.state.store.all(), {}, 'cleared');

  app.state.store.fromJSON(JSON.parse(JSON.stringify(exported)));
  assert.deepEqual(app.state.store.all(), before, 'restored unchanged');
});

// jsdom has no PointerEvent constructor; a MouseEvent carrying a pointerId is
// indistinguishable to the code under test.
function pointerEvent(type, { pointerId = 1, clientX = 0, clientY = 0 } = {}) {
  const event = new window.MouseEvent(type, { bubbles: true, clientX, clientY });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event;
}

// The bug this guards against: the map used to call svg.setPointerCapture() on
// every pointerdown. While an element holds pointer capture the browser
// retargets the compatibility mouse events with it, so the click that follows a
// press arrived on the <svg> — which carries no data-id — and every answer was
// silently dropped. jsdom does not implement that retargeting, so the click has
// to be dispatched the way a real browser delivers it: pointerdown on the path,
// click on the svg.
test('a click retargeted away from the path still answers', async () => {
  app.state.scopeId = 'brussels';
  app.state.size = 4;
  await app.startRound();
  await until(() => document.querySelector('.shapes path'), 5000, 'the map');

  const round = app.state.round;
  const expected = round.current;
  const svg = document.querySelector('.stage .map');
  const shape = document.querySelector(`.shapes path[data-id="${expected}"]`);

  shape.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 }));
  window.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 10, clientY: 10 }));
  svg.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  assert.equal(round.correct, 1, 'the press target decided the answer');
  assert.ok(shape.classList.contains('is-correct'), 'and it is painted correct');
  await until(() => !document.querySelector('.shapes path.is-correct'), 5000, 'the feedback to clear');
});

test('a press that turns into a pan does not answer', async () => {
  const round = app.state.round;
  const expected = await until(() => round.current, 5000, 'the next prompt');
  const asked = round.asked;
  const svg = document.querySelector('.stage .map');
  const shape = document.querySelector(`.shapes path[data-id="${expected}"]`);

  shape.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2, clientX: 10, clientY: 10 }));
  window.dispatchEvent(pointerEvent('pointermove', { pointerId: 2, clientX: 90, clientY: 70 }));
  window.dispatchEvent(pointerEvent('pointerup', { pointerId: 2, clientX: 90, clientY: 70 }));
  svg.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  assert.equal(round.asked, asked, 'panning across the map is not an answer');
});

test('a wrong answer paints the click red and the right shape green', async () => {
  const round = app.state.round;
  const expected = await until(() => round.current, 5000, 'a prompt');
  const wrong = app.state.index.municipalities.find((m) => m.id !== expected && m.region === 'brussels').id;
  const decoy = document.querySelector(`.shapes path[data-id="${wrong}"]`);

  decoy.dispatchEvent(pointerEvent('pointerdown', { pointerId: 3, clientX: 10, clientY: 10 }));
  window.dispatchEvent(pointerEvent('pointerup', { pointerId: 3, clientX: 10, clientY: 10 }));
  document.querySelector('.stage .map').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  assert.ok(decoy.classList.contains('is-wrong'), 'what you clicked goes red');
  assert.ok(document.querySelector(`.shapes path[data-id="${expected}"]`).classList.contains('is-target'),
    'the one you wanted goes green');
  assert.equal(document.querySelectorAll('.shapes path.is-target').length, 1, 'exactly one right answer shown');
});
