// Round mechanics. No DOM, no storage — everything here is a pure function of
// its arguments, which is what makes the acceptance checks runnable under
// `node --test`.

/** Mastery buckets used by the progress map and by item selection. */
export function mastery(stat) {
  if (!stat || stat.seen === 0) return 'unseen';
  const accuracy = stat.seen > 0 ? stat.correct / stat.seen : 0;
  if (stat.streak >= 3 && accuracy >= 0.6) return 'solid';
  return 'shaky';
}

const EMPTY = { seen: 0, correct: 0, wrong: 0, streak: 0, lastSeen: 0 };

/**
 * Pick `size` ids from `pool`, weighted towards weakness: never seen first, then
 * previously missed, then longest unseen, then mastered. Within a tier the order
 * is shuffled so repeated rounds over the same scope are not identical.
 */
export function selectItems(pool, size, stats = {}, random = Math.random) {
  const tiers = [[], [], [], []];
  for (const id of pool) {
    const stat = stats[id] ?? EMPTY;
    if (stat.seen === 0) tiers[0].push(id);
    else if (stat.wrong > 0 && mastery(stat) !== 'solid') tiers[1].push(id);
    else if (mastery(stat) !== 'solid') tiers[2].push(id);
    else tiers[3].push(id);
  }
  shuffle(tiers[0], random);
  shuffle(tiers[1], random);
  // Longest unseen first, so the tail of the queue is genuinely stale material.
  tiers[2].sort((a, b) => (stats[a]?.lastSeen ?? 0) - (stats[b]?.lastSeen ?? 0));
  tiers[3].sort((a, b) => (stats[a]?.lastSeen ?? 0) - (stats[b]?.lastSeen ?? 0));

  const picked = [];
  for (const tier of tiers) {
    for (const id of tier) {
      if (picked.length >= size) break;
      picked.push(id);
    }
  }
  shuffle(picked, random); // don't ask all the never-seen ones first
  return picked;
}

export function shuffle(array, random = Math.random) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/** Two correct answers in a row retire an item from the round. */
export const MASTERY_STREAK = 2;
/** A missed item comes back roughly this far down the queue, jittered. */
export const REQUEUE_GAP = 4;

export class Round {
  constructor(ids, { random = Math.random } = {}) {
    if (!Array.isArray(ids) || ids.length === 0) throw new Error('a round needs at least one item');
    this.random = random;
    this.queue = [...ids];
    this.items = new Map(ids.map((id) => [id, { id, streak: 0, asked: 0, correct: 0, wrong: 0 }]));
    this.asked = 0;
    this.correct = 0;
    this.wrong = 0;
    this.done = false;
  }

  get current() {
    return this.done ? null : this.queue[0] ?? null;
  }

  get remaining() {
    return this.queue.length;
  }

  /** Items still in the queue, counted once each — what a progress bar wants. */
  get remainingItems() {
    return new Set(this.queue).size;
  }

  get stumbles() {
    return [...this.items.values()].filter((i) => i.wrong > 0);
  }

  get accuracy() {
    return this.asked === 0 ? 0 : this.correct / this.asked;
  }

  /**
   * Answer the current prompt by naming the municipality that was clicked.
   * Returns what happened; the caller turns that into feedback and a redraw.
   */
  answer(clickedId) {
    const expected = this.current;
    if (expected == null) return { done: true };
    const item = this.items.get(expected);
    const isCorrect = clickedId === expected;

    this.asked++;
    item.asked++;
    this.queue.shift();

    if (isCorrect) {
      this.correct++;
      item.correct++;
      item.streak++;
      if (item.streak >= MASTERY_STREAK) {
        // Retired. An id is never in the queue twice — it is shifted off before
        // being requeued — so there is nothing left to remove.
      } else {
        this.queue.push(expected);
      }
    } else {
      this.wrong++;
      item.wrong++;
      item.streak = 0;
      this.requeue(expected);
    }

    if (this.queue.length === 0) this.done = true;
    return {
      expected,
      clicked: clickedId,
      correct: isCorrect,
      retired: isCorrect && item.streak >= MASTERY_STREAK,
      streak: item.streak,
      done: this.done,
    };
  }

  /** Giving up counts as a miss, so the item comes back later in the round. */
  giveUp() {
    const expected = this.current;
    if (expected == null) return { done: true };
    return this.answer(Symbol('gave-up'));
  }

  requeue(id) {
    const jitter = Math.floor(this.random() * 3) - 1; // -1, 0 or +1
    const at = Math.min(Math.max(REQUEUE_GAP + jitter, 1), this.queue.length);
    this.queue.splice(at, 0, id);
  }

  end() {
    this.done = true;
    this.queue = [];
  }
}
