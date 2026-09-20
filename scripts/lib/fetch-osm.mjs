// Fetch Belgian admin_level=8 relations from Overpass, one chunk per leading
// digit of ref:INS. Raw responses are cached in data/raw/ so reruns are free.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const USER_AGENT = 'city-memory/0.1 (+https://github.com/thbraet/city-memory)';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

const query = (digit) => `[out:json][timeout:280];
area["ISO3166-1"="BE"][admin_level=2]->.b;
rel(area.b)["boundary"="administrative"]["admin_level"="8"]["ref:INS"~"^${digit}"];
out geom;`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchChunk(digit, log) {
  let lastError;
  // 3 attempts on the primary endpoint, then the mirror.
  for (const endpoint of ENDPOINTS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'text/plain' },
          body: query(digit),
          signal: AbortSignal.timeout(300_000),
        });
        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        // Overpass reports runtime errors as HTML with a 200 status.
        if (!text.trimStart().startsWith('{')) {
          throw new Error(`non-JSON response: ${text.replace(/\s+/g, ' ').slice(0, 200)}`);
        }
        const json = JSON.parse(text);
        if (!Array.isArray(json.elements)) throw new Error('no elements array');
        log(`  chunk ^${digit}: ${json.elements.length} elements from ${new URL(endpoint).host}`);
        return json;
      } catch (err) {
        lastError = err;
        const wait = 5000 * attempt * attempt;
        log(`  chunk ^${digit} attempt ${attempt} on ${new URL(endpoint).host} failed: ${err.message}`);
        if (attempt < 3) {
          log(`    retrying in ${wait / 1000}s`);
          await sleep(wait);
        }
      }
    }
  }
  throw new Error(`chunk ^${digit} failed on every endpoint: ${lastError?.message}`);
}

export async function fetchAll({ rawDir, log = console.log }) {
  await mkdir(rawDir, { recursive: true });
  const chunks = [];
  for (const digit of DIGITS) {
    const file = path.join(rawDir, `osm-${digit}.json`);
    if (existsSync(file)) {
      const cached = JSON.parse(await readFile(file, 'utf8'));
      if (Array.isArray(cached.elements)) {
        log(`  chunk ^${digit}: ${cached.elements.length} elements (cached)`);
        chunks.push(cached);
        continue;
      }
    }
    const json = await fetchChunk(digit, log);
    await writeFile(file, JSON.stringify(json));
    chunks.push(json);
    await sleep(2000); // be polite to the public endpoint
  }
  return chunks;
}
