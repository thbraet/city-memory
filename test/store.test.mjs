// Acceptance checks on persistence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryStorage, STORAGE_KEY, SCHEMA_VERSION } from '../src/store.js';

test('stats round-trip through export and import unchanged', () => {
  const source = createStore(memoryStorage());
  source.record('11002', true, 1000);
  source.record('11002', true, 2000);
  source.record('21004', false, 3000);
  source.record('63023', true, 4000);
  source.record('63023', false, 5000);

  const exported = source.toJSON();
  const wire = JSON.parse(JSON.stringify(exported)); // through a file, as it would be

  const target = createStore(memoryStorage());
  const count = target.fromJSON(wire);

  assert.equal(count, 3);
  assert.deepEqual(target.all(), source.all());
  for (const id of ['11002', '21004', '63023']) {
    assert.deepEqual(target.get(id), source.get(id), id);
  }
});

test('a record accumulates seen, correct, wrong, streak and lastSeen', () => {
  const store = createStore(memoryStorage());
  assert.deepEqual(store.get('11002'), { seen: 0, correct: 0, wrong: 0, streak: 0, lastSeen: 0 });

  store.record('11002', true, 10);
  assert.deepEqual(store.get('11002'), { seen: 1, correct: 1, wrong: 0, streak: 1, lastSeen: 10 });

  store.record('11002', true, 20);
  assert.equal(store.get('11002').streak, 2);

  store.record('11002', false, 30);
  assert.deepEqual(store.get('11002'), { seen: 3, correct: 2, wrong: 1, streak: 0, lastSeen: 30 });
});

test('progress survives a new store over the same storage', () => {
  const storage = memoryStorage();
  createStore(storage).record('44021', true, 99);
  assert.deepEqual(createStore(storage).get('44021'), { seen: 1, correct: 1, wrong: 0, streak: 1, lastSeen: 99 });
});

test('the persisted payload is keyed and versioned', () => {
  const storage = memoryStorage();
  createStore(storage).record('44021', true, 99);
  const raw = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(raw.version, SCHEMA_VERSION);
  assert.ok(raw.stats['44021']);
});

test('import rejects a payload it cannot trust', () => {
  const store = createStore(memoryStorage());
  store.record('11002', true, 1);
  const before = store.all();

  assert.throws(() => store.fromJSON({ version: 99, stats: {} }), /unsupported version/);
  assert.throws(() => store.fromJSON({ version: SCHEMA_VERSION }), /no stats/);
  assert.throws(() => store.fromJSON({ version: SCHEMA_VERSION, stats: { nope: {} } }), /bad municipality id/);
  assert.throws(() => store.fromJSON({ version: SCHEMA_VERSION, stats: { '11002': { seen: -1 } } }), /bad seen/);
  assert.throws(() => store.fromJSON('not json'), SyntaxError);

  assert.deepEqual(store.all(), before, 'a rejected import changes nothing');
});

test('import accepts a JSON string as well as an object', () => {
  const store = createStore(memoryStorage());
  const payload = JSON.stringify({ version: SCHEMA_VERSION, stats: { '11002': { seen: 2, correct: 2, wrong: 0, streak: 2, lastSeen: 7 } } });
  assert.equal(store.fromJSON(payload), 1);
  assert.equal(store.get('11002').correct, 2);
});

test('reset clears everything', () => {
  const store = createStore(memoryStorage());
  store.record('11002', true, 1);
  store.reset();
  assert.deepEqual(store.all(), {});
});

test('a broken or hostile storage never breaks the game', () => {
  const hostile = {
    getItem: () => '{ not json',
    setItem: () => { throw new Error('quota'); },
    removeItem: () => {},
  };
  const store = createStore(hostile);
  assert.deepEqual(store.all(), {});
  assert.doesNotThrow(() => store.record('11002', true, 1));
  assert.equal(store.get('11002').seen, 1, 'the round still tracks progress in memory');
});
