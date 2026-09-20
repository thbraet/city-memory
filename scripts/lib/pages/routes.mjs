// Where each generated page lives, in each language.
//
// Its own module because three places need it and two of them import each
// other: geo.mjs writes these pages, game.mjs links into them from the home
// page, and layout.mjs builds the nav out of them. Keeping the table in geo.mjs
// and importing it from layout.mjs would close an import cycle between the
// shell and one of the modules that fills it.
//
// Dutch owns the bare paths because it is the default language and most of the
// search demand for drilling Belgian municipalities is Dutch. The other two sit
// under a prefix, and the route words are localised rather than shared:
// /provincie/antwerpen and /fr/province/anvers are both addresses a reader can
// look at and understand, which /nl/province/11 is not.
export const ROUTES = {
  nl: { prefix: '', provinces: 'provincies', province: 'provincie', region: 'regio' },
  fr: { prefix: '/fr', provinces: 'provinces', province: 'province', region: 'region' },
  en: { prefix: '/en', provinces: 'provinces', province: 'province', region: 'region' },
};

/** A language's own home page. Dutch is the default, so it owns the root. */
export const homeFor = (lang) => `${ROUTES[lang]?.prefix ?? ''}/`;

/** The address of a tier-one page: routeFor('fr', 'province', 'hainaut'). */
export const routeFor = (lang, kind, id) => {
  const r = ROUTES[lang] ?? ROUTES.nl;
  return kind === 'provinces' ? `${r.prefix}/${r.provinces}` : `${r.prefix}/${r[kind]}/${id}`;
};

/**
 * The same page in every language, for hreflang, the sitemap and the visible
 * language switcher. These have to be reciprocal — every version listing every
 * version — or Google discards the set.
 */
export const alternatesFor = (languages, kind, id) =>
  languages.map((lang) => ({ lang, url: routeFor(lang, kind, id) }));

/**
 * The 565 municipality pages exist once, language-neutral, showing the Dutch,
 * French and German names together. Three translations of "Liège is in the
 * province of Liège" would be 1,695 near-identical pages, which is what Google
 * calls scaled content abuse, and the three official names on one page is the
 * honest representation anyway.
 */
export const municipalityRoute = (slug) => `/gemeente/${slug}`;
