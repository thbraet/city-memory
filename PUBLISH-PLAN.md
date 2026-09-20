# Publishing City Memory — plan

Goal: the game live on a public domain, a public read-only API over the same
data, and ad slots that can earn something — all on free tiers, €0 spent.

## Constraints that shape everything

1. **€0.** No registrar fee, no paid plan, no card on file. Anything that
   needs money gets built but left switched off, with the manual step written
   down.
2. **Owner is away.** Every account-creation, DNS or approval step is deferred
   to `MANUAL-STEPS.md`; the code around it ships ready and inert.
3. **EU site, EU visitors.** Ads plus EU traffic means consent is a hard
   requirement, not a nicety, so the ad layer is consent-gated from day one.

## Phases

### 0. Repo foundations (autonomous)
git init, LICENSE split (MIT for code, ODbL for the OSM-derived data),
.gitattributes, CI workflow. The repo must be pushable to GitHub unattended.

### 1. Public API (autonomous)
A build step emits a static, versioned, cache-friendly JSON API into
`public/api/v1/` — no server, so it costs nothing and cannot fall over:

- `/api/v1/` discovery document, `/api/v1/openapi.json`
- `/api/v1/municipalities` — all 565, metadata + WGS84 centroid + bbox
- `/api/v1/municipalities/{nis}` — one, with geometry
- `/api/v1/scopes`, `/api/v1/scopes/{id}`, `/api/v1/provinces`, `/api/v1/regions`
- `/api/v1/geo/*.geojson` — real lon/lat GeoJSON, rebuilt from `data/raw/`
- `/api/v1/search/{prefix}.json` — prefix index, so clients can autocomplete
- CORS + immutable caching headers, an HTML docs page at `/api/`

### 2. Site, SEO, monetization (autonomous)
- Ad slots driven by one config file. Empty IDs render nothing, so the live
  site is clean until the owner pastes a publisher ID in.
- Consent banner + Google Consent Mode v2, default denied. No ad or analytics
  script loads before a choice is made.
- `/about`, `/privacy`, `/terms`, `/api`, `ads.txt`, `sitemap.xml`, `robots.txt`
- Per-scope SEO landing pages (one per province/region) — the only realistic
  way a niche quiz earns organic traffic, and traffic is what ads pay on.
- Open Graph card, JSON-LD, manifest, icons.

### 3. Deploy config (autonomous)
Cloudflare Pages as primary (unlimited bandwidth, free custom domain, real
header control for the API), GitHub Pages as a fallback with its caveats
documented. Both configured; neither needs a paid plan.

### 4. MANUAL-STEPS.md (autonomous output, manual input)
Exact, ordered, copy-pasteable: accounts to create, the domain options ranked
by cost (€0 subdomain vs ~€10/yr real domain) with the ad-network consequence
of each, AdSense vs subdomain-friendly networks, DNS records, verification,
and the single config file to paste IDs into.

## The honest catch, decided up front

A truly free *real* domain does not exist in 2026. Free options are
subdomains (`*.pages.dev`, `eu.org`, `js.org`, `is-a.dev`). Google AdSense
generally will not approve a site on a subdomain the publisher does not own
the root of. So the plan builds a **network-agnostic** ad layer: it works
with AdSense the day a real domain exists, and with subdomain-friendly
networks before that. The research phase verifies this rather than assuming it.
