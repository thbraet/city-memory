// The HTML shell every generated page shares.
//
// Generated pages are plain server-sent HTML on purpose. The game itself is a
// JavaScript application and always will be, but a crawler that has to execute
// a module graph and fetch 3.8 MB of JSON before it sees a single municipality
// name will index nothing useful — and pages nobody can find earn nothing. So
// the text lives in the markup, and the game hangs off it.
import { enabled } from '../site-config.mjs';
import { routeFor, homeFor } from './routes.mjs';
import { bundleFor } from './strings/index.mjs';

/** Escape text for an HTML text node or a double-quoted attribute. */
export const esc = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

/**
 * A full HTML document.
 *
 * page: {
 *   path        where this lands in dist/, e.g. 'privacy/index.html'
 *   url         the site-relative canonical path, e.g. '/privacy'
 *   title       the <title>, without the site name
 *   description the meta description — write a real one, it is the search snippet
 *   lang        'nl' | 'fr' | 'en'
 *   body        the markup inside <main>
 *   head        extra markup for <head> (JSON-LD, mostly)
 *   alternates  [{ lang, url }] for hreflang, when the page exists in more than one language
 *   breadcrumbs [{ name, url }] — rendered, and emitted as JSON-LD
 *   scripts     extra <script> markup at the end of <body>
 *   wide        true to drop the reading-width constraint (the game needs the room)
 * }
 */
export function document(page, ctx) {
  const { site } = ctx;
  const title = page.title === site.name ? site.name : `${page.title} — ${site.name}`;
  const canonical = ctx.url(page.url);
  // The furniture speaks the page's language. A French page inside an English
  // header reads as a machine translation of somebody else's site, and the
  // "Play" link pointing at the Dutch home page would strand the reader there.
  const t = bundleFor(page.lang ?? site.defaultLanguage);

  return `<!doctype html>
<html lang="${esc(page.lang ?? site.defaultLanguage)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(page.description)}">
<link rel="canonical" href="${esc(canonical)}">
${hreflang(page, ctx)}${verification(ctx)}<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:locale" content="${esc(ogLocale(page.lang ?? site.defaultLanguage))}">
<meta property="og:image" content="${esc(ctx.url('/og.png'))}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon-192.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="stylesheet" href="/styles.css?v=map-names-2">
<link rel="alternate" type="application/json" href="${esc(ctx.url('/api/v1/index.json'))}" title="City Memory API">
${consentDefaults(ctx)}${page.head ?? ''}</head>
<body class="page${page.wide ? ' page-wide' : ''}">
${siteHeader(page, ctx, t)}
<main class="content" id="main">
${page.body}
</main>
${siteFooter(ctx, t)}
${analytics(ctx)}${page.scripts ?? ''}</body>
</html>
`;
}

// ------------------------------------------------------------------- the seam

/**
 * Google Consent Mode v2 defaults.
 *
 * This has to be the first script in the document and it has to be inline: an
 * external file can lose the race with an ad tag, and a tag that fires before
 * the defaults are set is exactly the situation the defaults exist to prevent.
 * Denied everywhere rather than denied-in-the-EEA, because the audience is
 * Belgian and a region list is a thing to get subtly wrong for no benefit.
 *
 * There is deliberately no banner here. A banner for ad consent must come from
 * a Google-certified CMP — Google's own, configured in the AdSense dashboard and
 * delivered by the AdSense tag itself — and a hand-rolled one, however correct
 * under the GDPR, would disqualify the site from serving ads in the EEA. So the
 * only consent code the site owns is this block. Nothing calls
 * gtag('consent', 'update'): that is the CMP's job.
 */
function consentDefaults(ctx) {
  if (!enabled.ads(ctx.site) || !ctx.site.ads.consentModeDefaultsDenied) return '';
  return `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}`
    + `gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',`
    + `analytics_storage:'denied',wait_for_update:500});</script>\n`
    + `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=`
    + `${esc(ctx.site.ads.adsensePublisherId)}" crossorigin="anonymous"></script>\n`;
}

/**
 * Cloudflare Web Analytics, deliberately outside the consent gate.
 *
 * The beacon sets no cookie and writes nothing to the visitor's device, which
 * puts it outside ePrivacy Article 5(3) — there is nothing to consent to. Do
 * not "helpfully" wrap this in a consent check: it would cost the site its
 * basic measurement and buy nothing legally.
 */
function analytics(ctx) {
  if (!enabled.analytics(ctx.site)) return '';
  return `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" `
    + `data-cf-beacon='{"token":"${esc(ctx.site.analytics.cloudflareToken)}"}'></script>\n`;
}

// ------------------------------------------------------------------ furniture

function siteHeader(page, ctx, t) {
  const lang = page.lang ?? ctx.site.defaultLanguage;
  const home = homeFor(lang);
  const nav = [
    [home, t.common.nav.play],
    [routeFor(lang, 'provinces'), t.common.nav.provinces],
    ['/api/', t.common.nav.api],
    ['/about', t.common.nav.about],
  ];
  return `<a class="skip" href="#main">${esc(t.common.nav.skip)}</a>
<header class="site-header">
  <a class="site-name" href="${esc(home)}">${esc(ctx.site.name)}</a>
  <nav class="site-nav" aria-label="${esc(t.common.nav.play)}">
${nav.map(([href, label]) => `    <a href="${esc(href)}"${page.url === href ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('\n')}
  </nav>
${languageSwitcher(page, ctx, t)}</header>`;
}

/**
 * The visible way between languages.
 *
 * hreflang tells a search engine the translations exist; it does nothing for a
 * reader who landed on the Dutch page and wants the French one. Only pages that
 * declare alternates get this, which is exactly the tier-one set — the 565
 * municipality pages exist once, in one language-neutral form, and have nothing
 * to switch to.
 */
function languageSwitcher(page, ctx, t) {
  if (!page.alternates || page.alternates.length < 2) return '';
  const label = { nl: 'Nederlands', fr: 'Français', en: 'English' };
  return `  <nav class="lang-switch" aria-label="${esc(t.common.nav.language)}">
${page.alternates.map((alt) => (alt.lang === page.lang
    ? `    <span aria-current="true" lang="${esc(alt.lang)}">${esc(label[alt.lang] ?? alt.lang)}</span>`
    : `    <a href="${esc(alt.url)}" lang="${esc(alt.lang)}" hreflang="${esc(alt.lang)}">${esc(label[alt.lang] ?? alt.lang)}</a>`)).join('\n')}
  </nav>
`;
}

function siteFooter(ctx, t) {
  const { site } = ctx;
  const f = t.common.footer;
  const support = [];
  if (site.support.kofi) support.push(`<a href="https://ko-fi.com/${esc(site.support.kofi)}" rel="noopener">${esc(f.kofi)}</a>`);
  if (site.support.githubSponsors) support.push(`<a href="https://github.com/sponsors/${esc(site.support.githubSponsors)}" rel="noopener">${esc(f.sponsor)}</a>`);

  // The consent link only exists when there is a CMP to reopen. Google's EU
  // user consent policy requires a way back to the choice, and a banner with no
  // way back is the most common enforcement finding there is.
  const consentLink = enabled.ads(site)
    ? `\n  <a href="#" onclick="googlefc&amp;&amp;googlefc.callbackQueue&amp;&amp;googlefc.callbackQueue.push(googlefc.showRevocationMessage);return false">${esc(f.cookies)}</a>`
    : '';

  // The repository link is a configured value like any other, so an unset one
  // renders nothing rather than sending every visitor to a placeholder 404.
  const sourceLink = site.repository
    ? `\n  <a href="${esc(site.repository)}" rel="noopener">${esc(f.source)}</a>`
    : '';

  const osmLink = (label) => `<a href="https://www.openstreetmap.org/copyright" rel="noopener">${esc(label)}</a>`;

  return `<footer class="site-footer">
  <p>${f.attribution({ osmLink })}</p>
  <nav aria-label="${esc(f.about)}">
  <a href="/about">${esc(f.about)}</a>
  <a href="/privacy">${esc(f.privacy)}</a>
  <a href="/terms">${esc(f.terms)}</a>
  <a href="/legal">${esc(f.legal)}</a>
  <a href="/api/">${esc(f.api)}</a>${sourceLink}${support.length ? '\n  ' + support.join('\n  ') : ''}${consentLink}
  </nav>
</footer>`;
}

function hreflang(page, ctx) {
  if (!page.alternates?.length) return '';
  const rows = page.alternates.map((alt) =>
    `<link rel="alternate" hreflang="${esc(alt.lang)}" href="${esc(ctx.url(alt.url))}">`);
  const fallback = page.alternates.find((a) => a.lang === ctx.site.defaultLanguage) ?? page.alternates[0];
  rows.push(`<link rel="alternate" hreflang="x-default" href="${esc(ctx.url(fallback.url))}">`);
  return rows.join('\n') + '\n';
}

function verification(ctx) {
  const tags = [];
  if (ctx.site.verification.google) tags.push(`<meta name="google-site-verification" content="${esc(ctx.site.verification.google)}">`);
  if (ctx.site.verification.bing) tags.push(`<meta name="msvalidate.01" content="${esc(ctx.site.verification.bing)}">`);
  return tags.length ? tags.join('\n') + '\n' : '';
}

const ogLocale = (lang) => ({ nl: 'nl_BE', fr: 'fr_BE', en: 'en_GB' }[lang] ?? 'nl_BE');

// --------------------------------------------------------------- ingredients

/** A JSON-LD block. Objects go in as data; nothing here is interpolated into markup. */
export function jsonLd(value) {
  // </script> inside a string would end the block early, and U+2028/9 break
  // older parsers. Both are cheap to neutralise and expensive to discover.
  const body = JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll(' ', '\\u2028')
    .replaceAll(' ', '\\u2029');
  return `<script type="application/ld+json">${body}</script>\n`;
}

/** Breadcrumbs, rendered and as structured data, from [{ name, url }]. */
export function breadcrumbs(trail, ctx) {
  if (!trail?.length) return { html: '', ld: '' };
  const html = `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>`
    + trail.map((step, i) => (i === trail.length - 1
      ? `<li aria-current="page">${esc(step.name)}</li>`
      : `<li><a href="${esc(step.url)}">${esc(step.name)}</a></li>`)).join('')
    + `</ol></nav>`;
  const ld = jsonLd({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((step, i) => ({
      '@type': 'ListItem', position: i + 1, name: step.name, item: ctx.url(step.url),
    })),
  });
  return { html, ld };
}

/**
 * An ad slot.
 *
 * Renders nothing at all when there is no publisher id — not a placeholder, not
 * a reserved grey box. Most visitors will see the no-ad layout (no account yet,
 * consent refused, or a blocker), so that is the layout the page is designed
 * for, and an ad is something that appears within the flow rather than a hole
 * the page is built around.
 */
export function adSlot(name, ctx) {
  const { site } = ctx;
  const slot = site.ads.slots[name];
  if (!enabled.ads(site) || !slot) return '';
  return `<aside class="ad-slot ad-${esc(name)}" aria-label="Advertisement">
  <ins class="adsbygoogle" style="display:block" data-ad-client="${esc(site.ads.adsensePublisherId)}"
       data-ad-slot="${esc(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins>
  <script>(adsbygoogle=window.adsbygoogle||[]).push({});</script>
</aside>`;
}
