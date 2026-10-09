// /about, /privacy, /terms and /legal.
//
// These are not filler. Belgian law (Code of Economic Law, Art. XII.6) requires
// an information-society service to publish who runs it and where they can be
// reached, and the GDPR requires a real Article 13 notice the moment advertising
// puts a third party on the page. AdSense also rejects sites that have nothing
// but a game on them, so the honest version of these pages and the commercially
// useful version happen to be the same document.
//
// What they say changes with the configuration: with no ad account there is no
// advertising section, because describing ad cookies a visitor is not being
// given would be a lie in the other direction.
//
// The wording lives in strings/en.mjs, not here. These four pages are English
// for now — a privacy notice is worth translating only by someone willing to be
// held to the translation — but keeping the copy in the bundle means the day
// that happens is a data change rather than a rewrite of this file. The
// conditionals stay here, where they can be read against the config.
import { document, esc, jsonLd } from './layout.mjs';
import { loadBundle } from './strings/index.mjs';

export async function build(ctx) {
  const t = await loadBundle('en', ctx.log);
  return [about(ctx, t), privacy(ctx, t), terms(ctx, t), legalNotice(ctx, t)];
}

const page = (ctx, spec) => ({
  path: spec.path,
  body: document(spec, ctx),
  url: spec.url,
  lang: spec.lang,
  sitemap: spec.sitemap ?? true,
});

// A link for the strings bundle: `link(href)('the words')`. The label comes
// from the bundle, which is HTML, so it goes in as written.
const link = (href) => (label) => `<a href="${esc(href)}">${label}</a>`;
const ext = (href) => (label) => `<a href="${esc(href)}" rel="noopener">${label}</a>`;

// ------------------------------------------------------------------- /about

function about(ctx, t) {
  const { site, enabled } = ctx;
  const s = t.about;
  const count = ctx.api.index.counts.municipalities;

  return page(ctx, {
    path: 'about/index.html',
    url: '/about',
    lang: 'en',
    title: s.meta.title,
    description: s.meta.description({ count }),
    head: jsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: site.name,
      url: ctx.url('/'),
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Any browser',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      inLanguage: ['nl', 'fr', 'en'],
    }),
    body: `<article class="prose">
  <h1>${s.h1}</h1>

  <p class="lede">${s.lede}</p>

  <h2>${s.whyHeading}</h2>
  <p>${s.why1({ count: esc(String(count)) })}</p>
  <p>${s.why2}</p>

  <h2>${s.dataHeading}</h2>
  <p>${s.data1({
    osmLink: ext('https://www.openstreetmap.org/'),
    extractDate: esc((ctx.api.index.osmExtract ?? '').slice(0, 10)),
  })}</p>
  <p>${s.data2}</p>
  <p>${s.data3({ statbelLink: ext('https://statbel.fgov.be/') })}</p>

  <h2>${s.apiHeading}</h2>
  <p>${s.api({ apiLink: link('/api/') })}</p>

  <h2>${s.ownerHeading}</h2>
  ${enabled.owner(site)
    ? `<p>${s.ownerNamed({
      name: esc(site.owner.name),
      country: esc(site.owner.country),
      email: esc(site.owner.email),
      emailLink: link(`mailto:${site.owner.email}`),
    })}</p>`
    : `<p>${s.ownerAnonymous({ legalLink: link('/legal') })}</p>`}
  <p>${s.source({ repoLink: ext(site.repository) })}</p>

  ${enabled.ads(site) ? `<h2>${s.adsHeading}</h2>
  <p>${s.ads({ privacyLink: link('/privacy') })}</p>` : ''}
  ${enabled.support(site) ? `<h2>${s.supportHeading}</h2>
  <p>${s.support({
    kofiLink: site.support.kofi ? ext(`https://ko-fi.com/${site.support.kofi}`) : null,
    sponsorsLink: site.support.githubSponsors ? ext(`https://github.com/sponsors/${site.support.githubSponsors}`) : null,
  })}</p>` : ''}
</article>`,
  });
}

// ----------------------------------------------------------------- /privacy

function privacy(ctx, t) {
  const { site, enabled } = ctx;
  const s = t.privacy;
  const ads = enabled.ads(site);
  const analytics = enabled.analytics(site);
  const controller = enabled.owner(site)
    ? s.controllerNamed({
      name: esc(site.owner.name),
      country: esc(site.owner.country),
      email: esc(site.owner.email),
      emailLink: link(`mailto:${site.owner.email}`),
    })
    : s.controllerAnonymous({ legalLink: link('/legal') });

  const cookieRow = (row) => `      <tr><td>${row.key}</td><td>${row.kind}</td><td>${row.purpose}</td><td>${row.kept}</td></tr>`;
  const th = s.cookieTable.headers;

  return page(ctx, {
    path: 'privacy/index.html',
    url: '/privacy',
    lang: 'en',
    title: s.meta.title,
    description: s.meta.description,
    body: `<article class="prose">
  <h1>${s.h1}</h1>
  <p class="lede">${s.lede({ ads })}</p>
  <p class="muted">${s.updated({ date: esc((ctx.api.index.generatedAt ?? '').slice(0, 10)) })}</p>

  <h2>${s.controllerHeading}</h2>
  <p>${s.controller({ controller })}</p>

  <h2>${s.deviceHeading}</h2>
  <p>${s.device}</p>
  <table class="cookie-table">
    <thead><tr><th>${esc(th.key)}</th><th>${esc(th.kind)}</th><th>${esc(th.purpose)}</th><th>${esc(th.kept)}</th></tr></thead>
    <tbody>
${cookieRow(s.cookieTable.progress)}
${ads ? `${cookieRow(s.cookieTable.adsGeneral)}\n${cookieRow(s.cookieTable.adsNamed)}` : ''}
    </tbody>
  </table>

  <h2>${s.logsHeading}</h2>
  <p>${s.logs}</p>

  ${analytics ? `<h2>${s.analyticsHeading}</h2>
  <p>${s.analytics}</p>` : ''}

  <h2>${s.adsHeading}</h2>
  ${ads ? `<p>${s.adsWho}</p>
  <p>${s.adsBasis}</p>
  <p>${s.adsRefusal}</p>
  <p>${s.adsWithdrawal}</p>
  <p>${s.adsVendors({ vendorListLink: ext('https://support.google.com/admanager/answer/9012903') })}</p>`
    : `<p>${s.adsNone}</p>`}

  <h2>${s.neverHeading}</h2>
  <ul>
${s.never({ ads }).map((item) => `    <li>${item}</li>`).join('\n')}
  </ul>

  <h2>${s.rightsHeading}</h2>
  <p>${s.rights}</p>
  <p>${s.rightsPractical({
    ads,
    adCentreLink: ext('https://myadcenter.google.com/'),
    legalLink: link('/legal'),
  })}</p>
  <p>${s.supervisoryAuthority({ dpaLink: ext('https://www.gegevensbeschermingsautoriteit.be/') })}</p>

  <h2>${s.childrenHeading}</h2>
  <p>${s.children({ ads })}</p>

  <h2>${s.changesHeading}</h2>
  <p>${s.changes({ repoLink: ext(site.repository) })}</p>
</article>`,
  });
}

// ------------------------------------------------------------------- /terms

function terms(ctx, t) {
  const { site } = ctx;
  const s = t.terms;
  const bullets = (items) => items.map((item) => `    <li>${item}</li>`).join('\n');

  return page(ctx, {
    path: 'terms/index.html',
    url: '/terms',
    lang: 'en',
    title: s.meta.title,
    description: s.meta.description,
    body: `<article class="prose">
  <h1>${s.h1}</h1>
  <p class="lede">${s.lede}</p>

  <h2>${s.gameHeading}</h2>
  <p>${s.game}</p>

  <h2>${s.apiHeading}</h2>
  <p>${s.apiIntro({ apiLink: link('/api/') })}</p>
  <ul>
${bullets(s.apiRequests)}
  </ul>
  <p>${s.apiVersioning}</p>

  <h2>${s.licenceHeading}</h2>
  <p>${s.licenceIntro({ odblLink: ext('https://opendatacommons.org/licenses/odbl/1-0/') })}</p>
  <ul>
${bullets(s.licencePoints)}
  </ul>
  <p>${s.licenceSummary}</p>

  <h2>${s.codeHeading}</h2>
  <p>${s.code({ repoLink: ext(site.repository) })}</p>

  <h2>${s.warrantyHeading}</h2>
  <p>${s.warranty}</p>

  <h2>${s.useHeading}</h2>
  <p>${s.use}</p>
</article>`,
  });
}

// ------------------------------------------------------------------- /legal

/**
 * The imprint. Belgian law wants a name, a geographic address and contact
 * details on any information-society service, and an ad-funded site is
 * unambiguously one. Until the owner fills those in, the page says plainly that
 * it is incomplete rather than pretending otherwise — and `npm run check:legal`
 * fails, so it cannot quietly ship that way once ads are on.
 */
function legalNotice(ctx, t) {
  const { site, enabled } = ctx;
  const s = t.legalNotice;
  const complete = enabled.owner(site) && site.owner.address;

  return page(ctx, {
    path: 'legal/index.html',
    url: '/legal',
    lang: 'en',
    // noindex, so it has no business in the sitemap either: asking a crawler to
    // fetch a page in order to be told not to index it wastes both ends.
    sitemap: false,
    title: s.meta.title,
    description: s.meta.description,
    head: '<meta name="robots" content="noindex">\n',
    body: `<article class="prose">
  <h1>${s.h1}</h1>
  <p class="muted">${s.basis}</p>

  ${complete ? `<dl class="facts">
    <dt>${esc(s.facts.operator)}</dt><dd>${esc(site.owner.name)}</dd>
    <dt>${esc(s.facts.address)}</dt><dd>${esc(site.owner.address)}</dd>
    <dt>${esc(s.facts.country)}</dt><dd>${esc(site.owner.country)}</dd>
    <dt>${esc(s.facts.email)}</dt><dd><a href="mailto:${esc(site.owner.email)}">${esc(site.owner.email)}</a></dd>
${site.owner.enterpriseNumber ? `    <dt>${esc(s.facts.enterpriseNumber)}</dt><dd>${esc(site.owner.enterpriseNumber)}</dd>` : ''}
${site.owner.vat ? `    <dt>${esc(s.facts.vat)}</dt><dd>${esc(site.owner.vat)}</dd>` : ''}
  </dl>` : `<div class="callout warn">
    <p>${s.incomplete}</p>
  </div>
  <p>${site.repository
    ? s.incompleteMeanwhile({ issuesLink: ext(`${site.repository}/issues`) })
    : s.incompleteNoContact}</p>`}

  <h2>${s.hostingHeading}</h2>
  <p>${s.hosting}</p>

  <h2>${s.contentHeading}</h2>
  <p>${s.content({ termsLink: link('/terms') })}</p>
</article>`,
  });
}
