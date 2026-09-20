# What only you can do

Everything in this repo that could be built without you is built. What is left
needs an account, an approval, or a decision that is yours rather than mine.

The steps are in dependency order. Steps 1–4 put the site and the API live and
take about half an hour. Everything after that is about money, and none of it
blocks anything before it.

**Total cost if you follow this as written: €0.** The one place where €0 and ad
revenue might collide is flagged at step 8, with what to do if it does.

---

## The short version

| # | Step | Time | Cost | Blocks |
|---|------|------|------|--------|
| 1 | Push the repo to GitHub | 5 min | €0 | everything |
| 2 | Cloudflare account | 3 min | €0 | hosting |
| 3 | Cloudflare Pages project | 5 min | €0 | the site being reachable |
| 4 | Check the API headers | 2 min | €0 | nothing — but verifies step 3 |
| 5 | Cloudflare Web Analytics | 3 min | €0 | knowing if any of this works |
| 6 | Ko-fi | 10 min | €0 | the only revenue that works at zero traffic |
| 7 | Search Console + Bing | 15 min | €0 | being found at all |
| 8 | AdSense application | 20 min + weeks of waiting | €0 | ad revenue |
| 9 | Google's consent message | 15 min | €0 | ad revenue in the EU |
| 10 | Your legal identity | 10 min | €0 | ads, legally |
| 11 | Ask an accountant | one email | €0 | your peace of mind |

---

## 1. Push the repo to GitHub

The repo is already a git repository with everything committed. It needs to be
**public** — GitHub Actions minutes are free on public repos, and the GitHub
Pages fallback needs it.

```sh
# Create an empty repo at https://github.com/new, named city-memory, public,
# with no README/licence/gitignore (we have all three). Then:
cd ~/Documents/city-memory
git remote add origin https://github.com/YOUR-USERNAME/city-memory.git
git branch -M main
git push -u origin main
```

`data/raw/` (25 MB of cached OpenStreetMap downloads) and `node_modules/` are
gitignored and will not be pushed. The built API under `public/api/` **is**
committed on purpose, so the site can build without that cache.

Then edit one line in `scripts/lib/site-config.mjs`:

```js
repository: 'https://github.com/YOUR-USERNAME/city-memory',
```

## 2. Create a Cloudflare account

<https://dash.cloudflare.com/sign-up> — email and password. **No credit card.**
Verify the email and stop there; you do not need to add a domain yet.

Why Cloudflare and not the others: unlimited bandwidth on the free plan, a
`_headers` file that lets the API send real CORS and caching headers, and terms
with no non-commercial clause, so ads are allowed. Vercel's free tier
**explicitly forbids** AdSense, and Netlify's free tier now pauses your site
when it runs out of monthly credits. Do not deploy this to either.

## 3. Create the Pages project

Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** →
authorise GitHub → pick `city-memory`.

Settings to enter:

| Field | Value |
|---|---|
| Production branch | `main` |
| Build command | `npm run build:site` |
| Build output directory | `dist` |
| Environment variable | `NODE_VERSION` = `22` |

Not `npm run build` — that would also rebuild the API, which needs the 25 MB
OpenStreetMap cache that is not in the repo. The API is committed, so
`build:site` alone is correct and is what `DEPLOY.md` explains in more detail.

Deploy. You get **`city-memory.pages.dev`** (or similar — note the exact name).

Then, still in the project settings, turn **preview deployments off** (Settings
→ Builds & deployments → Preview deployments → None). Preview URLs are random
subdomains that would serve the same ads on URLs AdSense has not approved, and
would compete with your real pages in search.

Finally, put the real URL into `scripts/lib/site-config.mjs`:

```js
origin: 'https://city-memory.pages.dev',
```

and push. Every canonical URL, sitemap entry and API link follows from that one
value, so it is worth getting right before anything gets indexed.

## 4. Check the API actually works

```sh
curl -sI https://city-memory.pages.dev/api/v1/municipalities.json | grep -i -E 'access-control|cache-control'
```

You want `access-control-allow-origin: *` and a `cache-control` with a real
`max-age`. If the CORS header is missing, `_headers` did not end up in the
output directory — check that the build output directory is `dist` and not the
repo root.

At this point the game and the API are live and public. Everything below is
about being found and being paid.

## 5. Cloudflare Web Analytics

Dashboard → **Web Analytics** → add `city-memory.pages.dev` → copy the token.

```js
analytics: { cloudflareToken: 'PASTE_IT_HERE' },
```

This is cookieless — it stores nothing on the visitor's device — so it needs no
consent banner and is deliberately kept outside the consent logic. Do not
replace it with Google Analytics: GA would drag your basic traffic numbers
behind a consent banner for no benefit.

## 6. Ko-fi — do this before AdSense

<https://ko-fi.com/manage/onboarding> — takes ten minutes, connects to PayPal,
0% platform fee, no approval process and no traffic minimum.

```js
support: { kofi: 'yourusername', githubSponsors: 'yourusername' },
```

This is the only revenue that works at zero traffic and the only one that needs
nobody's permission. At this site's realistic traffic it may well out-earn the
ads.

## 7. Get indexed

**Google Search Console** (<https://search.google.com/search-console>): add a
**URL-prefix** property for `https://city-memory.pages.dev/`. A *Domain*
property will not work on a shared suffix like `pages.dev`. Verify with the
**HTML tag** method, and paste the token (just the `content` value, not the
whole tag) into:

```js
verification: { google: 'PASTE_TOKEN_HERE' },
```

Push, wait for the deploy, then click Verify. After that, submit
`https://city-memory.pages.dev/sitemap.xml`, and use URL Inspection →
Request Indexing on your best pages: the home page, `/provincies`, two or three
province pages, and `/api/`.

**Bing Webmaster Tools** (<https://www.bing.com/webmasters/>): use "Import from
Google Search Console". Two clicks, and it feeds Copilot and DuckDuckGo as well.

## 8. Apply to AdSense

**Wait a few weeks after step 7.** Applying before anything is indexed is the
most common reason small sites get rejected, and a rejection starts a history on
your account.

<https://adsense.google.com/start/> — sign up with a personal Google account. On
"Connect your site", enter exactly `city-memory.pages.dev` — no `https://`, no
`www`, no path.

**About the free subdomain.** AdSense's own site policy lists three kinds of
site you may add, and one of them is *"subdomains on platforms that are already
part of the public suffix list"*. `pages.dev` is on that list (verified against
the published list dated 2026-09-18), so `city-memory.pages.dev` is a site you
can add in your own account. You will find blog posts claiming free subdomains
cannot be monetised; that claim traces back to forum threads, not to Google, and
Google's own documentation contradicts it.

**If the application is refused** specifically because of the domain, that is
the one point where €0 and ad revenue genuinely collide. Your options then:

- **`citymemory.be.eu.org`** — free, forever, and a real domain you control the
  DNS for. Apply at <https://nic.eu.org/>. It is also on the public suffix list,
  and Cloudflare accepts it as a normal free zone. Volunteer-run, so approval
  takes days to weeks.
- **A real domain** — `.be` via any Belgian registrar or `.com` anywhere, about
  €6–12 a year. This breaks the zero-euro rule, and it is the only thing in this
  whole plan that would.

Do not "solve" a rejection by signing up with Adsterra, Monetag or PropellerAds.
They accept anyone, they pay in popunders and push notifications, they give you
no GDPR consent tooling, and this is a site that schoolchildren use.

Once approved:

```js
ads: {
  adsensePublisherId: 'ca-pub-0000000000000000',  // from Account → Account information
  slots: { belowGame: '1234567890', sidebar: '' }, // from Ads → Ad units
},
```

Pasting the publisher ID is the switch. While it is empty, the site loads no ad
script, renders no slots, writes no `ads.txt` and shows no consent banner —
which is the correct state for a site with no ad account, not a degraded one.
`ads.txt` is generated from that same value, so there is nothing else to edit.

## 9. Publish Google's consent message — not optional

AdSense → **Privacy & messaging** → **European regulations** → create and
publish the message.

This is a hard requirement, not a nicety: Google serves **no ads at all** to
EEA, UK and Swiss visitors without a certified consent platform, and your
audience is essentially all Belgian. Use **Google's own** CMP, which is free and
built in. Do not substitute Cookiebot, CookieYes or Osano — their free tiers all
lack the IAB TCF integration Google requires, and a hand-written banner, however
GDPR-correct, disqualifies you from serving ads.

When configuring it:

- Choose the layout with **"Do not consent"** shown as prominently as "Consent".
  This is a legal requirement in the EU and the single most common enforcement
  finding against small sites.
- Under **Ads → Ad serving settings**, switch **limited ads on**. It is off by
  default. It is what earns you something from visitors who decline.

The site already does its half: Consent Mode defaults are set to denied inline
in the `<head>` of every page, before any Google script loads, and the footer's
"Cookie settings" link reopens the dialogue so people can change their mind.

Afterwards, check on a real phone with DevTools: nothing should be written to
storage before you click something.

## 10. Fill in your legal identity — before ads go live

Belgian law (Code of Economic Law, Art. XII.6) requires an online service to
publish who runs it: **a name, a geographic address, and contact details.** An
ad-funded site is unambiguously covered. There is no email-only exemption.

```js
owner: {
  name: 'Your Name',
  address: 'Street 1, 1000 Brussels',
  email: 'you@example.com',
  country: 'Belgium',
},
```

`/legal` currently states plainly that these details are missing and that the
site carries no advertising, which is true today. Once ads are on, that page has
to be real.

**If you do not want your home address public**, sort that out *before* ads go
live — a business address or a domiciliation service, which does cost money. The
alternative is not "leave it blank".

## 11. One email to an accountant

Ask specifically: *does recurring AdSense and Ko-fi income from a personal
hobby site count as **diverse inkomsten** (33%, no registration), or does it make
me a **zelfstandige in bijberoep** (KBO number, quarterly social contributions)?*

At €5–20 a month this is academic and should not delay anything. It matters
because social contributions on a *bijberoep* can comfortably exceed what a site
this size earns — which would make the honest answer "keep it ad-free and take
the Ko-fi tips". Better to know that before the first payout than after.

---

## What to expect, honestly

A niche Dutch/French educational quiz earns roughly **€0.50–2 per thousand page
views**. So:

- 1,000 page views a month ≈ **€1/month**
- 10,000 page views a month ≈ **€5–20/month**

AdSense pays out at **€70**. At 10,000 monthly views that is a payment every
four to fourteen months; at 1,000, effectively never.

This is not a reason to skip it — the hosting is free, the API is genuinely
useful, and the work is already done. It is a reason to treat Ko-fi as the real
revenue line and ads as a slow accumulator, and not to spend €12 on a domain
expecting it back.

The site's one honest advantage: **after the 2025 mergers Belgium has 565
municipalities, and essentially every competing quiz still uses the old 581.**
Every landing page says so. That is what could win the search traffic that makes
any of the above non-zero.

---

## Where each value goes

Everything account-dependent lives in **one file**:
`scripts/lib/site-config.mjs`. Empty always means "this feature is off", so you
can fill it in one value at a time and rebuild.

| Value | From step | What switches on |
|---|---|---|
| `origin` | 3 | canonical URLs, sitemap, API links |
| `repository` | 1 | the source links in the footer |
| `analytics.cloudflareToken` | 5 | traffic measurement |
| `support.kofi` | 6 | the support link in the footer |
| `verification.google` | 7 | Search Console verification |
| `ads.adsensePublisherId` | 8 | ads, `ads.txt`, the consent block |
| `ads.slots.*` | 8 | the individual ad placements |
| `owner.*` | 10 | the legal notice and the privacy contact |

After editing, `npm run build:site` locally to check, then commit and push —
Cloudflare rebuilds on push.

## If something looks wrong

```sh
npm test                      # 150+ checks, no network needed
npm run build                 # rebuild API and site (needs data/raw/ for the API)
npm run build:site            # rebuild just the site (what Cloudflare runs)
npm run serve:dist            # serve the built site at localhost:8080
```

`DEPLOY.md` covers rolling back a bad deploy and diagnosing header problems.
