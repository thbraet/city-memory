// Province and region are derived from the first two digits of the NIS code.
export const PROVINCES = [
  { id: 'antwerpen',        name: 'Antwerpen',       region: 'flanders',  prefixes: ['11', '12', '13'], expected: 67 },
  { id: 'brussels',         name: 'Brussel / Bruxelles', region: 'brussels', prefixes: ['21'],          expected: 19 },
  { id: 'vlaams-brabant',   name: 'Vlaams-Brabant',  region: 'flanders',  prefixes: ['23', '24'],       expected: 63 },
  { id: 'brabant-wallon',   name: 'Brabant wallon',  region: 'wallonia',  prefixes: ['25'],             expected: 27 },
  { id: 'west-vlaanderen',  name: 'West-Vlaanderen', region: 'flanders',  prefixes: ['31','32','33','34','35','36','37','38'], expected: 62 },
  { id: 'oost-vlaanderen',  name: 'Oost-Vlaanderen', region: 'flanders',  prefixes: ['41','42','43','44','45','46'],           expected: 55 },
  { id: 'hainaut',          name: 'Hainaut',         region: 'wallonia',  prefixes: ['51','52','53','54','55','56','57','58'], expected: 69 },
  { id: 'liege',            name: 'Liège',           region: 'wallonia',  prefixes: ['61','62','63','64'], expected: 84 },
  { id: 'limburg',          name: 'Limburg',         region: 'flanders',  prefixes: ['71', '72', '73'], expected: 38 },
  { id: 'luxembourg',       name: 'Luxembourg',      region: 'wallonia',  prefixes: ['81','82','83','84','85'], expected: 43 },
  { id: 'namur',            name: 'Namur',           region: 'wallonia',  prefixes: ['91', '92', '93'], expected: 38 },
];

export const REGIONS = {
  flanders: { id: 'flanders', name: 'Vlaanderen', lang: 'nl' },
  wallonia: { id: 'wallonia', name: 'Wallonie', lang: 'fr' },
  brussels: { id: 'brussels', name: 'Brussel / Bruxelles', lang: 'both' },
};

const BY_PREFIX = new Map();
for (const p of PROVINCES) for (const prefix of p.prefixes) BY_PREFIX.set(prefix, p);

export function provinceForNis(nis) {
  return BY_PREFIX.get(String(nis).slice(0, 2)) ?? null;
}

// The nine municipalities of the German-speaking Community. The plan derives the
// local language from the region, which would label these French-first; they are
// officially German-speaking, so they get their own entry. See data/REPORT.md.
export const GERMAN_COMMUNITY = new Set([
  '63001', // Amel / Amblève
  '63012', // Büllingen / Bullange
  '63013', // Bütgenbach / Butgenbach
  '63023', // Eupen
  '63040', // Kelmis / La Calamine
  '63048', // Lontzen
  '63061', // Raeren
  '63067', // Sankt Vith / Saint-Vith
  '63087', // Burg-Reuland
]);

export function localLangFor(nis, region) {
  if (GERMAN_COMMUNITY.has(nis)) return 'de';
  return REGIONS[region].lang;
}
