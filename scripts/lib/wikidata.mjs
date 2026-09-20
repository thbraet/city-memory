// Fetch nl/fr/de labels for a list of QIDs, 50 at a time. Cached like the OSM
// chunks so reruns cost nothing.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { USER_AGENT } from './fetch-osm.mjs';

const API = 'https://www.wikidata.org/w/api.php';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchLabels(qids, { cacheFile, log = console.log }) {
  if (cacheFile && existsSync(cacheFile)) {
    const cached = JSON.parse(await readFile(cacheFile, 'utf8'));
    if (qids.every((q) => q in cached)) {
      log(`  wikidata: ${Object.keys(cached).length} entities (cached)`);
      return cached;
    }
  }
  const labels = {};
  for (let i = 0; i < qids.length; i += 50) {
    const batch = qids.slice(i, i + 50);
    const url = `${API}?action=wbgetentities&format=json&props=labels&languages=nl|fr|de&ids=${batch.join('|')}`;
    let json;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        json = await res.json();
        if (json.error) throw new Error(json.error.info || 'wikidata error');
        break;
      } catch (err) {
        log(`  wikidata batch ${i / 50 + 1} attempt ${attempt} failed: ${err.message}`);
        if (attempt === 3) throw err;
        await sleep(3000 * attempt);
      }
    }
    for (const [qid, entity] of Object.entries(json.entities ?? {})) {
      labels[qid] = {
        nl: entity.labels?.nl?.value ?? null,
        fr: entity.labels?.fr?.value ?? null,
        de: entity.labels?.de?.value ?? null,
      };
    }
    log(`  wikidata batch ${i / 50 + 1}/${Math.ceil(qids.length / 50)}: ${Object.keys(json.entities ?? {}).length} entities`);
    await sleep(500);
  }
  if (cacheFile) await writeFile(cacheFile, JSON.stringify(labels, null, 1));
  return labels;
}
