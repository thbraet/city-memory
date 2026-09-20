# Deploying City Memory

Two hosts are configured. **Cloudflare Pages is the one to use.** GitHub Pages
is a fallback that works but serves the API worse, and is documented here so
that switching is a known quantity rather than an experiment on a bad day.

Nothing in this document costs money. No card is needed for either host.

Account creation, domain purchase and the AdSense application are not here;
they are in MANUAL-STEPS.md. This file is only about getting the built site
onto a host and checking that it arrived intact.

## The one thing to know before anything else

`npm run build` is **not** the command a host should run. It runs `build:api`
first, and `build:api` reads `data/raw/` — the 25 MB Overpass download that is
gitignored because it is a cache, not a source. A host clones the repository,
so `data/raw/` is never there, and `build:api` exits 1 with:

```
data/raw/ is missing, so there is no WGS84 geometry to build the API from.
```

The API is committed output: `public/api/v1/` is in the repository, 601 files
of it. So the host only ever runs:

```
npm run build:site
```

which assembles `dist/` from the checkout alone. Refreshing the API data is a
local job:

```
node scripts/build-data.mjs --refetch   # repopulates data/raw/ from Overpass
npm run build:api                       # rewrites public/api/v1/
git add public/api public/data && git commit
```

and the new data reaches the world as a commit, like everything else.

---

## Cloudflare Pages (primary)

### Why this one

Free plan, verified 2026-09-20: unlimited static-asset bandwidth and requests,
500 builds a month, one build at a time, a 20-minute build timeout, 20,000
files per deployment, 25 MiB per file, free custom domain, free TLS, no card.
It honours `_headers` (up to 100 rules) and `_redirects` (up to 2,000), which
is what makes a public API possible: CORS and cache lifetimes are ours to set.
Its terms contain no non-commercial clause, so ads are allowed.

The current build is about 1,215 files and 24 MB, comfortably inside all of it.

Two hosts that look like alternatives and are not:

- **Vercel** is disqualified. Its Fair Use Guidelines name "the inclusion of
  advertisements, including but not limited to online advertising platforms
  like Google AdSense" as commercial usage, and the Hobby tier is
  non-commercial only. An ad-funded site on Hobby is a terms breach.
- **Netlify** free is credit-based: 300 credits a month, roughly 15 GB of
  bandwidth or about 20 production deploys, and the site is paused when the
  credits run out. A paused API is a broken API.

### First deploy

No file in the repository configures Cloudflare. The settings are typed into
their dashboard when the project is created, and the Git integration then
rebuilds on every push to the production branch.

1. Push the repository to GitHub. The remote is `origin`, the production
   branch is `main`.
2. In the Cloudflare dashboard, create a Pages project connected to that
   GitHub repository. Cloudflare asks for repository access; grant it to this
   repository only.
3. Fill in the build settings exactly:

   | Setting | Value |
   | --- | --- |
   | Framework preset | None |
   | Build command | `npm run build:site` |
   | Build output directory | `dist` |
   | Root directory | leave empty (the build runs from the repository root) |
   | Production branch | `main` |

4. Add one build environment variable, in the same project's settings, for the
   production environment (and for previews, if you want preview builds too):

   | Name | Value |
   | --- | --- |
   | `NODE_VERSION` | `22` |

   Cloudflare's build image picks its own Node otherwise, and an unpinned
   version is a build that changes under you. 22 rather than the 26 this was
   developed on: 22 is the long-term-support line and is certainly present on
   the build image, and the code uses nothing newer — no `Object.groupBy`, no
   `Promise.withResolvers`, no import attributes. The repository also carries a
   `.node-version` file saying the same thing, so if you drop the environment
   variable the pin survives. If you set both, set them to the same number.

5. Optionally add `SITE_ORIGIN` once a custom domain exists (see below). Until
   then the default in `scripts/lib/site-config.mjs` is right.

6. Deploy. The build log should end with the site build's own summary:
   `1250 files, 26.20 MB` and `dist/ is ready.` The exact numbers move with the
   data; an order-of-magnitude difference means something did not build.

Cloudflare installs dependencies itself when it finds `package-lock.json`. If
a build log shows the build starting without an install — `Cannot find package
'd3-geo'` is what that looks like — change the build command to
`npm ci && npm run build:site` and redeploy.

### Attaching a custom domain

In the Pages project there is a section for custom domains. Add the hostname
there, then:

- **Domain already on Cloudflare DNS.** Cloudflare creates the record for you.
  Nothing else to do.
- **Domain at another registrar.** Cloudflare shows the record to create. For
  a subdomain such as `www`, that is a CNAME to `<project>.pages.dev`. An apex
  domain cannot hold a CNAME in plain DNS; either move the domain's nameservers
  to Cloudflare (free, and then the apex works through CNAME flattening) or use
  whatever ALIAS/ANAME record your registrar offers.

TLS is issued automatically and takes a few minutes. The `.pages.dev` address
keeps working afterwards.

Then make the site agree about where it lives, in this order:

1. Edit `origin` in `scripts/lib/site-config.mjs` to the new origin, no
   trailing slash. This moves every canonical URL, every sitemap entry and
   every link the API documents.
2. Rebuild the API with the new base, because `openapi.json` and the discovery
   document embed absolute URLs that the site build does not touch:
   `API_BASE_URL=https://your.domain npm run build:api`. This needs
   `data/raw/`, so it happens locally, and the result is committed.
3. Push. Cloudflare rebuilds.

Setting `SITE_ORIGIN` in the dashboard does step 1 without a commit, which is
useful for a preview, but the committed value is what anyone reading the repo
believes, so change it there too.

### Rolling back a bad deploy

Cloudflare keeps every deployment and serves any of them on demand. Open the
project's list of deployments, find the last good one, and use its rollback
action (Cloudflare has moved and renamed this control over the years; it is in
the row's own menu, alongside "view build log"). The rollback is instant and
needs no build, which is the reason to prefer it over fixing forward when the
site is visibly broken.

Then fix the repository properly — `git revert` and push — so the next deploy
does not re-publish the same breakage.

### Verifying a deploy

Run these against the live domain, not against `node scripts/serve.mjs`. The
dev server deliberately mimics some of the CDN's behaviour but it does not
read `_headers` or `_redirects`; only the real host applies those.

The API's public contract is `/api/v1/...`. Check a JSON endpoint:

```
$ curl -sI https://your.domain/api/v1/municipalities.json
HTTP/2 200
content-type: application/json; charset=utf-8
access-control-allow-origin: *
cache-control: public, max-age=3600, stale-while-revalidate=86400
x-content-type-options: nosniff
```

The three headers that matter are `access-control-allow-origin: *` (without it
no browser client can use the API at all), the `cache-control` line (without it
every request is a fresh origin hit) and the content type.

Check a GeoJSON file, which carries its own type rule:

```
$ curl -sI https://your.domain/api/v1/geo/belgium.geojson
HTTP/2 200
content-type: application/geo+json; charset=utf-8
access-control-allow-origin: *
```

Check that the extensionless forms rewrite, which is `_redirects` working:

```
$ curl -s -o /dev/null -w '%{http_code}\n' https://your.domain/api/v1/municipalities
200
```

And that the site itself is whole:

```
$ curl -s -o /dev/null -w '%{http_code}\n' https://your.domain/provincie/antwerpen
200
```

### The site deploys but the API is wrong

Work down this list; they are ordered by how often each one is the answer.

**`/api/v1/...` returns 404 while `/public/api/v1/...` returns the file.**
The site build has copied `public/` verbatim instead of placing the API at the
root of the deployment. Everything else assumes `/api/v1/`: the `_headers`
rules, the `_redirects` rewrites, `openapi.json`'s `servers` block, the docs
page and every URL in this document. The fix belongs in
`scripts/build-site.mjs`, not in the Cloudflare dashboard. Check what the build
actually produced with `find dist -name index.json -path '*api*'` before
deploying again.

**Content type is `application/octet-stream`, or the browser downloads the file
instead of showing it.** The host guesses from the extension and does not know
`.geojson`. That is exactly what the `/api/v1/geo/*` block in `_headers` is
for, so if the type is wrong, `_headers` is not being applied. Confirm the file
is at the root of the deployment (`dist/_headers`, not `dist/public/_headers`),
that the path pattern matches the URL you actually requested, and that the file
has fewer than 100 rules — Cloudflare drops the ones past the limit rather than
failing the deploy. CI counts the rules on every push for this reason.

**No `access-control-allow-origin` header.** Same cause: `_headers` is not
being applied, or a more specific rule matched first and replaced the block you
expected. Cloudflare applies the most specific matching rule, so a `/api/v1/geo/*`
rule that omits a header does not inherit it from `/api/*`. Check the rule that
actually matched, not the one you meant.

**Everything 404s except the front page.** The output directory is wrong.
It is `dist`, and the build command must have run — an empty or absent `dist/`
makes Cloudflare publish whatever else it finds.

---

## GitHub Pages (fallback)

`.github/workflows/deploy-github-pages.yml` builds `dist/` and publishes it
through `actions/upload-pages-artifact` and `actions/deploy-pages`. It runs on
every push to `main` and on manual dispatch.

To turn it on: in the repository's Pages settings, set the source to GitHub
Actions. Then run the workflow from the Actions tab, or push. The artifact
deploy does not run Jekyll, so no `.nojekyll` file is needed and the
underscore-prefixed files are published as they are — not that they do
anything here.

Know what you are getting:

- **No `_headers`, no `_redirects`.** GitHub Pages has no way to set headers.
  It serves `access-control-allow-origin: *` and `cache-control: max-age=600`
  on everything, and neither can be changed. The CORS header is a lucky
  accident that makes the API usable; the 10-minute cache is worse than the
  hour the API asks for, and the `.geojson` content type is whatever GitHub
  decides it is. The extensionless API paths (`/api/v1/municipalities`) do not
  exist here at all, because they are rewrites. Only the `.json` and
  `.geojson` URLs work.
- **A project site is served from `/<repo>/`.** Every link in the generated
  pages starts with a slash, so on `https://USER.github.io/city-memory/` they
  all resolve to the wrong root and 404. The workflow warns when it detects
  this. For a fallback that actually works, either attach a custom domain in
  the Pages settings, or host from a repository named `USER.github.io`.
- **Limits.** 1 GB published site, 100 GB a month of bandwidth (soft), 10
  builds an hour (soft). The build is 24 MB, so only bandwidth is plausibly
  reachable.
- **Terms.** GitHub's prohibited-use policy bars running "your online business"
  on Pages. An ad-funded site is a judgement call under that sentence, which is
  the reason this is the fallback and not the primary host. If Cloudflare is
  down for a day, this is fine. As a permanent home for an ad-carrying site it
  is a risk you would be taking knowingly.

Rolling back on GitHub Pages: re-run the last good workflow run from the
Actions tab, or revert the commit and push. There is no stored-deployment
rollback of the Cloudflare kind.

---

## What CI checks, and what it does not

`.github/workflows/ci.yml` runs on pull requests and on pushes to `main`:
`npm ci`, `npm test`, `npm run build:site`, and then a check that `dist/`
exists and fits the Cloudflare limits — file count, per-file size, and the
`_headers` and `_redirects` rule counts, which the build itself does not know
about. The numbers land in the run's summary.

CI does not run `build:api`, for the reason at the top of this document, and
so it cannot notice that `public/api/v1/` has drifted from `data/raw/`. It
also does not deploy anything: Cloudflare deploys from its own Git integration,
independently of whether CI passed. A red CI run does not block a deploy. If
that matters to you later, the Cloudflare project can be switched from the Git
integration to a deploy from CI with `wrangler`, which needs an API token in
the repository secrets.
