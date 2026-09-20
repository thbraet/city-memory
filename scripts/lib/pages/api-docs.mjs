// /api/ — the human page for the machine-readable API.
//
// Rendered from openapi.json rather than written beside it, so the docs cannot
// drift from the spec: an endpoint that is not in the spec cannot appear here,
// and one that is appears automatically.
import { document, esc, jsonLd, breadcrumbs } from './layout.mjs';

export async function build(ctx) {
  const { api, site } = ctx;
  const spec = api.openapi;
  const base = spec.servers[0].url;
  const crumbs = breadcrumbs([{ name: 'City Memory', url: '/' }, { name: 'API', url: '/api/' }], ctx);

  const body = `${crumbs.html}
<article class="prose">
  <h1>City Memory API</h1>
  <p class="lede">Every Belgian municipality — official names in Dutch, French and German,
  NIS codes, province and region, WGS84 centroid, bounding box, surface area, which
  municipalities border which, and boundary geometry as GeoJSON.</p>

  <p>It is free, public and needs no key. Every endpoint is a static file on a CDN,
  which is why there are no quotas, no rate limits and no sign-up — and also why
  there are no query parameters. Fetch a collection and filter it yourself, or
  fetch the province you care about.</p>

  <div class="callout">
    <p><strong>${esc(String(api.index.counts.municipalities))} municipalities</strong>,
    ${esc(String(api.index.counts.provinces))} provinces,
    ${esc(String(api.index.counts.regions))} regions. Built from an OpenStreetMap extract of
    <time datetime="${esc(api.index.osmExtract ?? '')}">${esc((api.index.osmExtract ?? '').slice(0, 10))}</time>.</p>
  </div>

  <h2 id="start">Start here</h2>
  <pre class="code"><code>curl ${esc(base)}/municipalities.json</code></pre>
  <p>One response, ${esc(String(api.index.counts.municipalities))} municipalities, no geometry —
  around 250 kB. It is the file to reach for first, and for most uses the only one you need.</p>

  <h3>One municipality, with its boundary</h3>
  <pre class="code"><code>curl ${esc(base)}/municipalities/21004.json</code></pre>
  <p>A GeoJSON <code>Feature</code>, so it goes straight into Leaflet, MapLibre or QGIS
  without unwrapping. <code>21004</code> is the NIS code for Brussels; every municipality
  has one and it is the stable key across the whole API.</p>

  <h3>All the shapes at once</h3>
  <pre class="code"><code>curl ${esc(base)}/geo/belgium.geojson</code></pre>
  <p>A <code>FeatureCollection</code> of all ${esc(String(api.index.counts.municipalities))} boundaries,
  simplified hard enough to send in one response. For detail, take
  <code>/geo/provinces/{id}.geojson</code> instead — those are simplified about forty times less.</p>

  <h2 id="endpoints">Endpoints</h2>
  <p>Base URL: <code>${esc(base)}</code></p>
  <table class="endpoints">
    <thead><tr><th>Path</th><th>What it gives you</th></tr></thead>
    <tbody>
${Object.entries(spec.paths).map(([p, def]) => `      <tr>
        <td><code>${esc(p)}</code></td>
        <td><strong>${esc(def.get.summary)}</strong>${def.get.description ? `<br><span class="muted">${esc(def.get.description.split('\n')[0])}</span>` : ''}</td>
      </tr>`).join('\n')}
    </tbody>
  </table>
  <p>The full description is in <a href="${esc(base)}/openapi.json">openapi.json</a> (OpenAPI 3.1),
  and <a href="${esc(base)}/index.json">index.json</a> is a discovery document listing every endpoint.</p>

  <h2 id="fields">What a municipality looks like</h2>
  <pre class="code"><code>${esc(JSON.stringify(sample(api.municipalities), null, 2))}</code></pre>
  <dl class="fields">
    <dt><code>nis</code></dt><dd>The five-digit NIS/INS code Belgian administrations use. The stable identifier here.</dd>
    <dt><code>name</code></dt><dd>The name the municipality uses itself: Dutch in Flanders, French in Wallonia, German in the German-speaking Community, both in Brussels.</dd>
    <dt><code>centroid</code></dt><dd><code>[longitude, latitude]</code>, WGS84, and guaranteed to fall <em>inside</em> the municipality — so you can pin a marker on it even for a shape shaped like a horseshoe.</dd>
    <dt><code>bbox</code></dt><dd><code>[west, south, east, north]</code>, WGS84.</dd>
    <dt><code>areaKm2</code></dt><dd>Surface area, computed from the boundary on a sphere.</dd>
    <dt><code>parts</code></dt><dd>How many disjoint pieces the municipality is made of. Usually 1. Baarle-Hertog is 26.</dd>
    <dt><code>neighbourCount</code></dt><dd>How many municipalities share a border. The detail endpoint lists them by name.</dd>
  </dl>

  <h2 id="cors">Using it from a browser</h2>
  <p>Every endpoint sends <code>Access-Control-Allow-Origin: *</code>, so fetch it directly:</p>
  <pre class="code"><code>const res = await fetch('${esc(base)}/search.json');
const { entries } = await res.json();

// terms are lowercased and accent-folded, so "liege" finds Liège
const hits = entries.filter(e =&gt; e.terms.some(t =&gt; t.startsWith('liege')));</code></pre>

  <h2 id="stability">Stability</h2>
  <p>The path carries the version. Anything published under <code>/api/v1/</code> keeps its
  shape: fields may be added, but existing ones will not change meaning or disappear.
  A breaking change becomes <code>/api/v2/</code>. The data behind it is refreshed when the
  OpenStreetMap extract is rebuilt, and <code>generatedAt</code> tells you when that was.</p>

  <h2 id="licence">Licence and attribution</h2>
  <p>The data comes from OpenStreetMap and stays under the
  <a href="${esc(api.index.license.data.url)}" rel="noopener">Open Database License</a>.
  In practice:</p>
  <ul>
    <li><strong>Showing it</strong> — a map, an app, a chart — needs the credit
    “© OpenStreetMap contributors”, visible to whoever is looking at it.</li>
    <li><strong>Redistributing the data</strong>, or a database you derived from it, means
    that database is ODbL too, and has to be offered under the same terms.</li>
  </ul>
  <p>The code behind this site is MIT. Attribution for City Memory itself is welcome
  but not required.</p>

  <h2 id="limits">What this API is not</h2>
  <ul>
    <li>It has no addresses, no postcodes and no population figures. For addresses use
    <a href="https://www.geopunt.be/" rel="noopener">Geopunt</a> or BeSt Address.</li>
    <li>It does not geocode. Given a point, it will not tell you which municipality you
    are in — though with <code>/geo/belgium.geojson</code> and a point-in-polygon test, you can.</li>
    <li>It reflects OpenStreetMap, not the Belgian state. Municipal mergers show up when
    a mapper enters them, which may be before or after they take legal effect.</li>
  </ul>
</article>`;

  const head = jsonLd({
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'City Memory API — Belgian municipalities',
    description: spec.info.summary,
    url: ctx.url('/api/'),
    license: api.index.license.data.url,
    creator: { '@type': 'Organization', name: site.name, url: ctx.url('/') },
    isAccessibleForFree: true,
    keywords: ['Belgium', 'municipalities', 'gemeenten', 'communes', 'NIS code', 'GeoJSON', 'boundaries'],
    spatialCoverage: { '@type': 'Place', name: 'Belgium' },
    distribution: [
      { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${base}/municipalities.json` },
      { '@type': 'DataDownload', encodingFormat: 'application/geo+json', contentUrl: `${base}/geo/belgium.geojson` },
    ],
  }) + crumbs.ld;

  return [{
    path: 'api/index.html',
    url: '/api/',
    lang: 'en',
    sitemap: true,
    body: document({
      path: 'api/index.html',
      url: '/api/',
      lang: 'en',
      title: 'API',
      description: 'A free public API for all 565 Belgian municipalities: names in three languages, NIS codes, centroids, areas, borders and GeoJSON boundaries. No key, no quota.',
      head,
      body,
    }, ctx),
  }];
}

/** A real record from the built API, trimmed to what reads well in a doc. */
function sample(collection) {
  const m = collection.municipalities.find((x) => x.nis === '21004') ?? collection.municipalities[0];
  return {
    nis: m.nis,
    name: m.name,
    names: m.names,
    officialLanguage: m.officialLanguage,
    province: m.province,
    region: m.region,
    centroid: m.centroid,
    bbox: m.bbox,
    areaKm2: m.areaKm2,
    parts: m.parts,
    neighbourCount: m.neighbourCount,
    osm: m.osm,
  };
}
