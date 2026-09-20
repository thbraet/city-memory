// Per-municipality progress, keyed by NIS code so it survives a data rebuild.
// The storage backend is injected, which keeps this testable under `node --test`.

export const STORAGE_KEY = 'city-memory.v1';
export const SCHEMA_VERSION = 1;

const blankStat = () => ({ seen: 0, correct: 0, wrong: 0, streak: 0, lastSeen: 0 });

/** An in-memory stand-in for localStorage, used by tests and as a fallback when
 *  the browser denies storage (private mode, blocked site data). */
export function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
  };
}

export function createStore(storage) {
  const backend = storage ?? safeLocalStorage();
  let stats = read(backend);

  function persist() {
    try {
      backend.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, stats }));
    } catch {
      // Storage full or blocked. The round still works; progress just won't last.
    }
  }

  return {
    get(id) {
      return stats[id] ? { ...stats[id] } : blankStat();
    },
    all() {
      return { ...stats };
    },
    /** Record one answer. `at` is injectable so tests are not clock-dependent. */
    record(id, correct, at = Date.now()) {
      const stat = stats[id] ? { ...stats[id] } : blankStat();
      stat.seen++;
      if (correct) {
        stat.correct++;
        stat.streak++;
      } else {
        stat.wrong++;
        stat.streak = 0;
      }
      stat.lastSeen = at;
      stats[id] = stat;
      persist();
      return { ...stat };
    },
    reset() {
      stats = {};
      persist();
    },
    toJSON() {
      return { version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), stats: { ...stats } };
    },
    /**
     * Replace progress from an exported file. Unknown keys and malformed stats
     * are rejected rather than merged, so a bad import cannot corrupt a profile.
     */
    fromJSON(payload) {
      const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
      if (parsed.version !== SCHEMA_VERSION) throw new Error(`unsupported version ${parsed.version}`);
      if (!parsed.stats || typeof parsed.stats !== 'object') throw new Error('no stats');
      const clean = {};
      for (const [id, stat] of Object.entries(parsed.stats)) {
        if (!/^\d{5}$/.test(id)) throw new Error(`bad municipality id ${id}`);
        clean[id] = normalise(stat, id);
      }
      stats = clean;
      persist();
      return Object.keys(clean).length;
    },
  };
}

function normalise(stat, id) {
  const out = blankStat();
  for (const key of Object.keys(out)) {
    const value = stat?.[key];
    if (!Number.isFinite(value) || value < 0) throw new Error(`bad ${key} for ${id}`);
    out[key] = value;
  }
  return out;
}

function read(backend) {
  try {
    const raw = backend.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed?.version !== SCHEMA_VERSION || typeof parsed.stats !== 'object') return {};
    return parsed.stats ?? {};
  } catch {
    return {};
  }
}

function safeLocalStorage() {
  try {
    const probe = '__city-memory-probe__';
    globalThis.localStorage.setItem(probe, '1');
    globalThis.localStorage.removeItem(probe);
    return globalThis.localStorage;
  } catch {
    return memoryStorage();
  }
}
