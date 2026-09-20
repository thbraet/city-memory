// The one file to edit after the accounts exist.
//
// Everything that depends on an account, a domain or an approval lives here and
// nowhere else. Every value is empty by default and every consumer treats empty
// as "this feature is off", so the site is publishable — and correct — before a
// single account has been created. Fill a value in, rebuild, and that feature
// turns on. See MANUAL-STEPS.md for where each value comes from.
//
// Nothing here is a secret. These are all public identifiers that ship in the
// HTML anyway; the site has no server and therefore no secrets at all.

export const site = {
  // ---------------------------------------------------------------- identity
  name: 'City Memory',
  tagline: 'Learn every Belgian municipality.',

  // The canonical origin, no trailing slash. Until a domain exists this is the
  // Cloudflare Pages subdomain, which is a perfectly good public address.
  // Changing it rewrites every canonical URL, sitemap entry and API link.
  origin: process.env.SITE_ORIGIN ?? 'https://city-memory.pages.dev',

  // Shown on /about and in the API contact field. A real address is required by
  // Belgian law for a site that carries advertising (see MANUAL-STEPS.md);
  // until one is set, /about says the site is run by an individual and gives
  // the contact address below.
  owner: {
    name: '',
    // A geographic address, not a PO box. Belgian law (Code of Economic Law,
    // Art. XII.6) requires one on any online service, and an ad-funded site is
    // unambiguously one. If you do not want your home address public, arrange a
    // business or domiciliation address BEFORE switching ads on.
    address: '',
    email: '',
    country: 'Belgium',
    enterpriseNumber: '', // KBO/BCE number, if you register as a zelfstandige
    vat: '',
  },

  // Filled in once the repo exists. Empty means the footer shows no source
  // link at all, rather than sending every visitor to a placeholder 404.
  repository: 'https://github.com/thbraet/city-memory',

  // ------------------------------------------------------------------- ads
  ads: {
    // AdSense publisher id, exactly as Google gives it: 'ca-pub-0000000000000000'.
    // Empty means no ad script is loaded at all, no slots are rendered, and no
    // consent banner is shown — which is the correct state for a site with no
    // ad account, not a degraded one.
    adsensePublisherId: '',

    // Slot ids from the AdSense "Ad units" tab. A slot with no id renders
    // nothing at all — no placeholder, no reserved box. Most visitors see the
    // no-ad layout anyway, so that is the layout the pages are designed for.
    slots: {
      belowGame: '',   // after a round ends, where attention is already loose
      sidebar: '',     // desktop only, beside the start screen
    },

    // Google's own CMP is switched on in the AdSense dashboard, not in code,
    // but the site still has to set Consent Mode defaults before any Google tag
    // loads. Leave true for an EU audience.
    consentModeDefaultsDenied: true,
  },

  // ------------------------------------------------------------- analytics
  analytics: {
    // Cloudflare Web Analytics token. Cookieless and storage-free, so it needs
    // no consent banner. Empty means no analytics script at all.
    cloudflareToken: '',
  },

  // -------------------------------------------------------------- donations
  // These need no approval and no consent banner, so they are the only revenue
  // that can be switched on the same day the site goes up.
  support: {
    kofi: '',          // the username in ko-fi.com/USERNAME
    githubSponsors: '', // the username in github.com/sponsors/USERNAME
  },

  // ------------------------------------------------------------ verification
  // Meta-tag verification tokens. Each is a bare token, not the whole tag.
  verification: {
    google: '',   // Google Search Console
    bing: '',     // Bing Webmaster Tools
  },

  // ------------------------------------------------------------------ i18n
  // The three languages the content exists in. Dutch leads because most of the
  // search demand for Belgian municipality drilling is Dutch-language.
  languages: ['nl', 'fr', 'en'],
  defaultLanguage: 'nl',
};

/** True when a feature has everything it needs to be switched on. */
export const enabled = {
  ads: (s = site) => Boolean(s.ads.adsensePublisherId),
  analytics: (s = site) => Boolean(s.analytics.cloudflareToken),
  support: (s = site) => Boolean(s.support.kofi || s.support.githubSponsors),
  owner: (s = site) => Boolean(s.owner.name && s.owner.email),
};

/** An absolute URL for a site-relative path. */
export const url = (rel, s = site) => `${s.origin.replace(/\/$/, '')}/${String(rel).replace(/^\//, '')}`;
