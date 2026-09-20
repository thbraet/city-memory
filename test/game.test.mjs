// Acceptance checks on the round mechanics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Round, selectItems, mastery, MASTERY_STREAK } from '../src/game.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const index = JSON.parse(await readFile(path.join(root, 'public/data/municipalities.json'), 'utf8'));

/** A deterministic PRNG, so a failure is reproducible. */
function prng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

test('an item needs two correct answers in a row to retire', () => {
  const round = new Round(['a', 'b'], { random: prng(1) });
  assert.equal(round.current, 'a');

  let r = round.answer('a');
  assert.equal(r.correct, true);
  assert.equal(r.retired, false, 'one correct answer is not enough');
  assert.ok(round.queue.includes('a'), 'it is back in the queue');

  round.answer(round.current); // clear 'b' once
  assert.equal(round.current, 'a');
  r = round.answer('a');
  assert.equal(r.retired, true, 'the second correct answer in a row retires it');
  assert.ok(!round.queue.includes('a'), 'and it leaves the queue for good');
});

test('a wrong answer resets the streak and requeues the item', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const round = new Round(ids, { random: prng(7) });

  round.answer('a');                    // 'a' now has streak 1
  assert.equal(round.items.get('a').streak, 1);

  // Answer everything else correctly until 'a' comes back round. Wrong answers
  // would do too, but a requeued miss can leapfrog 'a' indefinitely.
  while (round.current !== 'a') round.answer(round.current);
  const r = round.answer('wrong-one');
  assert.equal(r.correct, false);
  assert.equal(round.items.get('a').streak, 0, 'the streak is reset');
  assert.ok(round.queue.includes('a'), 'it is requeued');
  assert.ok(round.queue.indexOf('a') >= 1, 'not immediately');
  assert.ok(round.queue.indexOf('a') <= 5, 'but within a handful of prompts');
});

test('a wrong answer means two more correct ones are still needed', () => {
  const round = new Round(['a', 'b', 'c', 'd', 'e'], { random: prng(3) });
  round.answer('a');
  while (round.current !== 'a') round.answer(round.current);
  round.answer('wrong');
  let corrects = 0;
  while (!round.done) {
    if (round.current === 'a') corrects++;
    round.answer(round.current);
  }
  assert.equal(corrects, MASTERY_STREAK, 'exactly two more correct answers');
});

test('giving up counts as a miss', () => {
  const round = new Round(['a', 'b', 'c', 'd', 'e'], { random: prng(5) });
  const r = round.giveUp();
  assert.equal(r.correct, false);
  assert.equal(round.wrong, 1);
  assert.ok(round.queue.includes('a'));
});

test('accuracy and stumbles reflect what happened', () => {
  const round = new Round(['a', 'b'], { random: prng(2) });
  round.answer('a');        // right
  round.answer('zzz');      // wrong on b
  while (!round.done) round.answer(round.current);
  assert.equal(round.wrong, 1);
  assert.equal(round.stumbles.length, 1);
  assert.equal(round.stumbles[0].id, 'b');
  assert.ok(round.accuracy > 0 && round.accuracy < 1);
});

// The plan's termination check: every scope, and every N from 1 to the scope
// size. Three answering strategies, including a deliberately terrible one.
const strategies = {
  perfect: (round) => round.current,
  awful: () => 'never-a-real-id',
  mixed: (round, random) => (random() < 0.45 ? round.current : 'never-a-real-id'),
};

for (const scope of index.scopes) {
  const pool = index.municipalities
    .filter((m) => (scope.kind === 'country' ? true : scope.kind === 'region' ? m.region === scope.id : m.province === scope.id))
    .map((m) => m.id);

  test(`scope ${scope.id}: a round terminates for every N from 1 to ${pool.length}`, () => {
    assert.equal(pool.length, scope.count);
    for (let n = 1; n <= pool.length; n++) {
      // 'awful' never answers correctly, so it can only terminate if giving up
      // eventually retires nothing — it must be capped rather than run forever.
      for (const [name, strategy] of Object.entries(strategies)) {
        if (name === 'awful' && n > 3) continue; // one size is enough to prove the shape
        const random = prng(n * 31 + name.length);
        const ids = selectItems(pool, n, {}, random);
        assert.equal(ids.length, n, `selectItems returned ${ids.length} for n=${n}`);
        assert.equal(new Set(ids).size, n, 'selection has no duplicates');

        const round = new Round(ids, { random });
        const cap = name === 'awful' ? 500 : n * 40 + 200;
        let steps = 0;
        while (!round.done && steps < cap) {
          round.answer(strategy(round, random));
          steps++;
        }
        if (name === 'awful') {
          // Never answering correctly must keep the round alive, not crash it.
          assert.equal(round.done, false, 'a never-correct round does not end on its own');
          assert.equal(round.remainingItems, n, 'nothing is retired');
        } else {
          assert.equal(round.done, true, `${scope.id} n=${n} ${name} did not terminate in ${cap} steps`);
          assert.equal(round.queue.length, 0);
        }
      }
    }
  });
}

test('selection prefers never-seen, then missed, then stale, then mastered', () => {
  const stats = {
    mastered: { seen: 10, correct: 10, wrong: 0, streak: 9, lastSeen: 900 },
    missed: { seen: 4, correct: 1, wrong: 3, streak: 0, lastSeen: 800 },
    stale: { seen: 2, correct: 2, wrong: 0, streak: 2, lastSeen: 1 },
  };
  const pool = ['mastered', 'missed', 'stale', 'fresh'];
  assert.deepEqual(selectItems(pool, 1, stats, prng(1)), ['fresh']);
  assert.deepEqual(selectItems(pool, 2, stats, prng(1)).sort(), ['fresh', 'missed']);
  assert.deepEqual(selectItems(pool, 3, stats, prng(1)).sort(), ['fresh', 'missed', 'stale']);
  assert.equal(selectItems(pool, 4, stats, prng(1)).length, 4);
});

test('selection never returns more than the pool holds', () => {
  const pool = ['a', 'b', 'c'];
  assert.equal(selectItems(pool, 99, {}, prng(1)).length, 3);
});

test('mastery buckets', () => {
  assert.equal(mastery(undefined), 'unseen');
  assert.equal(mastery({ seen: 0, correct: 0, wrong: 0, streak: 0, lastSeen: 0 }), 'unseen');
  assert.equal(mastery({ seen: 1, correct: 1, wrong: 0, streak: 1, lastSeen: 1 }), 'shaky');
  assert.equal(mastery({ seen: 5, correct: 5, wrong: 0, streak: 5, lastSeen: 1 }), 'solid');
  assert.equal(mastery({ seen: 10, correct: 3, wrong: 7, streak: 3, lastSeen: 1 }), 'shaky');
});

test('a round cannot be created empty', () => {
  assert.throws(() => new Round([]), /at least one item/);
});
