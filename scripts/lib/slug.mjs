// URL slugs and accent folding, in one place.
//
// Two builds need to agree on these. build-api.mjs writes a `links.map` into
// every municipality's API record pointing at that municipality's page, and
// pages/geo.mjs decides what that page is actually called. If the two ever
// computed a slug differently, the API would hand out links that 404 — and it
// would do it for a handful of accented names only, which is exactly the kind
// of breakage that survives a casual test.
//
// The names this handles: accents (Liège), the bilingual pairs the display rule
// joins with a slash (Bruxelles / Brussel), hyphens and apostrophes
// (Sint-Genesius-Rode, 's-Gravenbrakel).

/** Lowercase, strip accents, trim. Also what the API's search index stores. */
export const fold = (s) => String(s)
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLowerCase()
  .trim();

/**
 * The URL slug for a municipality's display name.
 *
 * A bilingual name is cut at the slash: "Bruxelles / Brussel" becomes
 * "bruxelles". The alternative — a slug carrying both names — reads badly and
 * buys nothing, since the page shows all three names anyway.
 *
 * Across all 565 current municipalities this produces no collisions, which the
 * API tests assert. Callers should still handle one: a future merger could
 * easily introduce a repeat.
 */
export const slugify = (name) => fold(name.split(' / ')[0])
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

/**
 * Slugs for a whole set, guaranteed unique.
 *
 * A clash falls back to name-province, then to name-NIS, which cannot clash
 * because the NIS code is the primary key.
 */
export function assignSlugs(municipalities, nameOf = (m) => m.name, provinceOf = (m) => m.province?.name ?? '') {
  const taken = new Set();
  const slugs = new Map();
  for (const m of municipalities) {
    const base = slugify(nameOf(m));
    let s = base;
    if (taken.has(s)) s = `${base}-${slugify(provinceOf(m))}`;
    if (taken.has(s)) s = `${base}-${m.nis ?? m.id}`;
    taken.add(s);
    slugs.set(m.nis ?? m.id, s);
  }
  return slugs;
}
