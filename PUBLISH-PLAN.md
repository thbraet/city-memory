# Publishing City Memory — plan

Goal: the game live on a public domain, a public read-only API over the same
data, and ad slots that can earn something — all on free tiers, €0 spent.

## Launch review — 2026-10-03

- Implemented locally: static API, generated site and SEO pages, optional ad
  placements, consent defaults, legal pages, hosting headers and rewrites,
  and GitHub Actions workflows. The latest local check passed all 157 tests.
- GitHub remote and repository link are configured. Local changes remain
  uncommitted; the remote's current visibility and CI status are unverified.
- First launch is game and API only, as chosen by the owner. Cloudflare Pages
  is deployed at `https://city-memory.pages.dev`. Live homepage, API docs,
  JSON and GeoJSON endpoints, extensionless API rewrite, province-page redirect
  and sitemap respond successfully. JSON CORS and GeoJSON content type work.
  Live cache headers revealed overlapping lifetimes; the local fix passes all
  157 tests and still needs to be pushed, deployed and checked live.
  The configured origin is `https://city-memory.pages.dev`.
  If the actual origin differs, update both the site configuration and the
  committed API's absolute URLs, as described in DEPLOY.md.
- Analytics, donation links, search verification, AdSense IDs and owner contact
  details are empty. Decide which features to enable for the first launch;
  advertising setup is a separate follow-up.
- API design differs from the original proposal below: search is one
  `/api/v1/search.json` index, and province/region collections replace the
  proposed generic `/scopes` endpoints. Mutable API URLs use finite caching
  rather than immutable caching. Decide whether these differences are acceptable.
- Consent implementation uses denied defaults and Google's dashboard-managed
  CMP. Setting a publisher ID loads the AdSense script immediately; the original
  promise below that no script loads before a choice does not describe the code.
  Before enabling ads, configure the CMP and verify actual consent behaviour.
  Cloudflare analytics is intentionally independent of ad consent.
- GitHub Actions, `.node-version` and Cloudflare instructions now select Node
  22. A successful run on that runtime remains to be confirmed in GitHub CI.
- GitHub Pages is configured to deploy on pushes to main as well as manually.
  Confirm whether that fallback should be enabled: its project-subpath links
  are known to be unsuitable without a custom domain or root repository.

The phases below preserve the original proposal. MANUAL-STEPS.md supplies the
account setup instructions; DEPLOY.md supplies the deployment checks. Hosting,
advertising and legal policy claims below require current verification before
they are relied on for launch.

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

## The honest catch — researched, and it resolved better than expected

The plan assumed a free subdomain could not carry AdSense, and that ~€10/yr
for a domain would be the one unavoidable cost. Twelve research agents went
at this, and two of them reached opposite conclusions, so the claim went
through an adversarial check against primary sources. The result:

**AdSense on `*.pages.dev` is documented as allowed.** Google's own site
policy lists exactly three kinds of site you may add, one of which is
"subdomains on platforms that are already part of the public suffix list",
and `pages.dev` is on that list (checked against the published list dated
2026-09-18). The widespread claim that free subdomains cannot be monetised
traces to forum threads, not to Google, and the agent asserting it could not
produce a primary source. So the €0 path is intact, and the ad layer targets
AdSense directly rather than hedging across low-quality networks that would
have been the fallback.

Two things the research changed for real:

- **Vercel is out.** Its Fair Use Guidelines name AdSense as commercial usage
  and restrict the free tier to non-commercial personal use. Netlify's free
  tier now pauses the site when monthly credits run out. Cloudflare Pages has
  no equivalent clause. That decision is now evidence-based rather than taste.
- **Belgian law wants a name and a geographic address** on an ad-funded site
  (Code of Economic Law, Art. XII.6), and ad income may make the owner a
  *zelfstandige in bijberoep*, whose social contributions could exceed what a
  site this size earns. Neither is a coding problem, and both belong in the
  owner's hands before ads go live — so both are in MANUAL-STEPS.md, near the
  top rather than buried.
