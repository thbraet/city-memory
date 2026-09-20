// Resolve a Dutch, French and German name for every municipality.
//
// Precedence (the plan's rule): a committed override wins over everything, then
// the OSM name:<lang> tag, then the Wikidata label, then the plain OSM name.
export function resolveNames(entries, wikidataLabels, overrides) {
  const conflicts = [];
  const sources = { override: 0, osm: 0, wikidata: 0, fallback: 0 };

  const resolved = entries.map((e) => {
    const out = { ...e };
    for (const lang of ['nl', 'fr', 'de']) {
      const key = `name${lang[0].toUpperCase()}${lang[1]}`;
      const osmName = e.tags[`name:${lang}`] ?? null;
      const wdName = wikidataLabels[e.qid]?.[lang] ?? null;
      const override = overrides[e.nis]?.[lang] ?? null;

      if (osmName && wdName && osmName !== wdName) {
        conflicts.push({ nis: e.nis, lang, osm: osmName, wikidata: wdName, chosen: override ?? osmName, overridden: Boolean(override) });
      }

      let value, source;
      if (override) { value = override; source = 'override'; }
      else if (osmName) { value = osmName; source = 'osm'; }
      else if (wdName) { value = wdName; source = 'wikidata'; }
      else { value = e.tags.name; source = 'fallback'; }
      sources[source]++;
      out[key] = value;
      (out.nameSource ??= {})[lang] = source;
    }
    return out;
  });

  return { resolved, conflicts, sources };
}
