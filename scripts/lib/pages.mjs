// Everything that gets generated into dist/ beyond the copied game.
//
// Each module under pages/ owns one family of output and exports
//
//   build(ctx) -> Promise<Array<{ path, body }>>
//
// where `path` is relative to dist/ and `body` is a string. Nothing writes to
// disk itself; this file collects the lot and writes it, so the set of files a
// build produces is inspectable in one place and a module can be reordered,
// tested or dropped without touching the writer.
//
// ctx is:
//   { site, enabled, url, data, api, layout, languages, log }
//     site     the config object from site-config.mjs
//     enabled  the feature predicates from site-config.mjs
//     url      absolute-URL helper
//     data     the committed game data (municipalities.json, parsed)
//     api      the built API's index and openapi documents, parsed
//     layout   the shared HTML shell from pages/layout.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { enabled, url } from './site-config.mjs';
import * as layout from './pages/layout.mjs';
import { loadStrings } from './pages/strings/index.mjs';
import * as legal from './pages/legal.mjs';
import * as apiDocs from './pages/api-docs.mjs';
import * as geo from './pages/geo.mjs';
import * as game from './pages/game.mjs';
import * as og from './pages/og.mjs';
import * as feeds from './pages/feeds.mjs';

// Feeds runs last and only last: the sitemap is built from the pages the other
// modules actually produced, so a page that was never generated can never be
// promised to a crawler.
const MODULES = [
  ['game', game],
  ['legal', legal],
  ['api docs', apiDocs],
  ['geography', geo],
  ['social card', og],
];

export async function buildPages({ dist, root, site, log }) {
  const read = async (rel) => JSON.parse(await readFile(path.join(root, rel), 'utf8'));

  const ctx = {
    site,
    enabled,
    url: (rel) => url(rel, site),
    data: await read('public/data/municipalities.json'),
    api: {
      index: await read('public/api/v1/index.json'),
      openapi: await read('public/api/v1/openapi.json'),
      municipalities: await read('public/api/v1/municipalities.json'),
      provinces: await read('public/api/v1/provinces.json'),
      regions: await read('public/api/v1/regions.json'),
    },
    layout,
    // Tier-one pages exist in all three; the 565 municipality pages are
    // language-neutral, because three near-identical translations of "Liège is
    // in the province of Liège" is what scaled-content abuse looks like.
    languages: site.languages,
    log,
  };

  // Every bundle, before any page renders: the shell reads them synchronously.
  await loadStrings(site.languages, log);

  const written = [];
  const emit = async (files, name) => {
    for (const file of files) {
      const target = path.join(dist, file.path);
      await mkdir(path.dirname(target), { recursive: true });
      // A body may be a string or a Buffer; an image module returns the latter.
      await writeFile(target, file.body);
      written.push(file);
    }
    log(`  ${name.padEnd(11)} ${files.length} file${files.length === 1 ? '' : 's'}`);
  };

  for (const [name, mod] of MODULES) {
    await emit(await mod.build(ctx), name);
  }

  // Everything generated so far, for the sitemap to describe.
  ctx.generated = written.filter((f) => f.url);
  await emit(await feeds.build(ctx), 'feeds');

  const paths = written.map((f) => f.path);
  const duplicates = paths.filter((f, i) => paths.indexOf(f) !== i);
  if (duplicates.length) {
    throw new Error(`two page modules both wrote: ${[...new Set(duplicates)].join(', ')}`);
  }
  return paths;
}
