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
//   { site, enabled, url, data, api, layout, log }
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
import * as legal from './pages/legal.mjs';
import * as apiDocs from './pages/api-docs.mjs';
import * as geo from './pages/geo.mjs';
import * as feeds from './pages/feeds.mjs';

// Order matters only for the log; every module is independent.
const MODULES = [
  ['legal', legal],
  ['api docs', apiDocs],
  ['geography', geo],
  ['feeds', feeds],
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
    log,
  };

  const written = [];
  for (const [name, mod] of MODULES) {
    const files = await mod.build(ctx);
    for (const file of files) {
      const target = path.join(dist, file.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.body);
      written.push(file.path);
    }
    log(`  ${name.padEnd(10)} ${files.length} file${files.length === 1 ? '' : 's'}`);
  }

  const duplicates = written.filter((f, i) => written.indexOf(f) !== i);
  if (duplicates.length) {
    throw new Error(`two page modules both wrote: ${[...new Set(duplicates)].join(', ')}`);
  }
  return written;
}
