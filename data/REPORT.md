# City Memory — build report

## Decisions this build made beyond the original implementation plan

Nothing in the plan turned out to be blocked. All five phases are implemented and
every acceptance check in the plan's "Autonomous execution" section passes. The
judgement calls below were made where the plan was silent or where following it
literally would have produced something wrong.

**Brussels is emitted once, not twice.** The plan lists the scopes as
"Belgium · Flanders · Wallonia · Brussels · each of the 11 provinces", but the
province/region table's 11 rows already include Brussels — which is a region, not
a province. Emitting it under both headings would have produced two identical
19-municipality scope files. There are therefore **14 distinct scope files**, and
the start screen lists Brussels once, under Provinces.

**The nine municipalities of the German-speaking Community get `localLang: "de"`.**
The plan derives the local language from the region, which would label Eupen,
Kelmis, Sankt Vith and their neighbours French-first. They are officially
German-speaking, and the plan asks for `nameDe` to be resolved at all, which only
pays off if German is displayed somewhere. The list is hard-coded in
`scripts/lib/regions.mjs`; every other municipality follows the plan's rule.
Hand-maintained NIS codes are easy to get wrong — the first version had `63045`,
which is Lierneux, not Lontzen (`63048`) — so a test pins the nine by name rather
than by code.

**Brussels shows French first, Dutch second, at equal weight.** The plan says
"both in Brussels" without fixing an order. Neither name is subordinate, so the
secondary name is rendered in the same size as the primary rather than smaller.

**The map never captures the pointer.** Panning originally called
`svg.setPointerCapture()` on pointerdown. While an element holds pointer capture
the browser retargets the compatibility mouse events with it, so the `click` that
follows a press arrives on the `<svg>` rather than on the `<path>` that was
pressed — and the `<svg>` carries no `data-id`. Every single answer was dropped
silently: you could click the map forever and nothing happened. Panning now
listens on the window for the duration of a gesture instead, which keeps a drag
working past the edge of the map without touching event targeting, and the
answer is resolved from the pointerdown target rather than the click target.
jsdom does not implement capture retargeting, so the original smoke test could
not have caught this; `test/dom.test.mjs` now dispatches the sequence the way a
real browser delivers it (pointerdown on the path, click on the svg).

**Only small shapes get an extra hit target.** The plan asks for "a transparent
wide stroke as an extra hit target" on tiny shapes. Applying it to every shape
means a neighbour's 10-pixel stroke covers a strip several pixels *inside* the
larger municipality next to it, and a click plainly within a big municipality
scores against the small one beside it — Vielsalm's own centre resolved to
Lierneux. Shapes narrower than 1.5% of the full map get the fat target; the rest
rely on their fill.

**Double-tap-to-zoom was dropped in favour of explicit ± buttons.** The plan asks
for both "a click lands on the path element itself" and "double-tap" zoom. On this
map every pixel is an answer, so the first tap of a double-tap submits one — a
real double-click in the browser scored a wrong answer before it zoomed. Wheel,
drag, pinch and Reset are unchanged; the two buttons replace the gesture. This is
the only requirement in the plan that was deliberately not implemented as written.

**The projection is fitted in the plane, not with `fitExtent`.** `osmtogeojson`
emits rings in OSM's order rather than GeoJSON winding order, and d3's spherical
`geoPath.bounds` reads a clockwise exterior ring as "the whole globe except this
shape". Every feature's bounds came back as half the planet and `fitExtent`
collapsed the map to a single point. The pipeline only ever projects point by
point, which is winding-agnostic, so the fit is computed the same way. SVG
rendering uses `fill-rule: evenodd`, which is winding-agnostic too, so enclaves
render and hit-test as holes.

**Simplification is budget-driven rather than hand-tuned.** The plan asks for
"aggressive for the Belgium-wide map, gentle for province maps". Rather than pick
two numbers, the build walks a ladder of simplification weights and keeps the
*gentlest* one whose emitted file fits a byte budget (420 KB for the country and
region maps, 320 KB for a province). Belgium lands on a hard weight because it
carries 565 shapes; provinces land near the source data. The chosen weight per
scope is in the table below.

**No municipality is allowed to vanish.** Baarle-Hertog is 26 exclaves inside the
Netherlands, and an early build simplified every one of them away, leaving the
municipality unclickable. Any feature that loses all of its geometry now keeps its
largest unsimplified polygon instead — the border it then shares with its
neighbours is a hair off, and being on the map at all matters more. This is a
safety net that lets the budget search try aggressive weights without risk; at the
weights actually chosen it never fires, and the rescue column below is empty
throughout. At the national weight Baarle-Hertog keeps 5 of its 26 pieces, and the
smallest municipalities in the country — Sint-Joost-ten-Node, Herstappe — all
survive.

**The name review list is cross-language, not OSM-versus-Wikidata.** The plan
says to report "every case where the two names differ". Read as an OSM/Wikidata
disagreement it would have missed the plan's own example: OSM carries no
`name:fr` for Knokke-Heist at all, so there was nothing to disagree with and
"Knocke-Heyst" would have shipped unreviewed. Both tables are below; the
cross-language one is the review surface.

**The override file corrects spellings, not translations.** Both sources turned
out to carry archaic exonyms, in both directions. 43 overrides are committed,
limited to cases where the French form is a pre-1900 spelling of the same word
(`gh`→`g`, `y`→`i`, `c`→`k`, `-que`→`-ke`, silent `-e`) and modern French usage is
simply the Dutch spelling, plus two accent restorations on official Walloon
spellings. Living French exonyms that are genuinely different words — Anvers,
Malines, Gand, Courtrai, Louvain, Ostende, Lierre, Hal, Vilvorde, Schaerbeek —
are deliberately untouched. Archaic French *translations* (Vieux-Turnhout,
Heist-sur-la-Montagne, Wavre-Sainte-Catherine, …) are also untouched and flagged
for a human, because calling them dead is not a call this build can verify.

**Phase 4's "optional later modes" were not built.** Reverse mode, timed mode and
"which province is this" are listed in the plan as optional and later; the five
phases are complete without them.


## Extract

| | |
|---|---|
| OSM base timestamp | `2026-09-20T11:49:36Z` |
| Built at | `2026-09-20T12:46:12.453Z` |
| Source | Overpass `boundary=administrative` + `admin_level=8` + `ref:INS`, 9 chunks by leading NIS digit |
| Licence | Boundaries © OpenStreetMap contributors, ODbL — <https://www.openstreetmap.org/copyright> |

## Counts per province

Drift policy: a count that differs from the plan's 2026-09-20 table is **not** a
build failure. The newest OSM state is by definition the state worth learning;
the delta is recorded here and the build continues.

| Province | Region | Plan (2026-09-20) | Observed | Delta |
|---|---|---|---|---|
| Antwerpen | flanders | 67 | 67 | — |
| Brussel / Bruxelles | brussels | 19 | 19 | — |
| Vlaams-Brabant | flanders | 63 | 63 | — |
| Brabant wallon | wallonia | 27 | 27 | — |
| West-Vlaanderen | flanders | 62 | 62 | — |
| Oost-Vlaanderen | flanders | 55 | 55 | — |
| Hainaut | wallonia | 69 | 69 | — |
| Liège | wallonia | 84 | 84 | — |
| Limburg | flanders | 38 | 38 | — |
| Luxembourg | wallonia | 43 | 43 | — |
| Namur | wallonia | 38 | 38 | — |
| **Total** | | **565** | **565** | **—** |

Structural checks: 0 feature(s) dropped for non-polygonal geometry,
0 structural failure(s).

## Name resolution

Precedence: `data/name-overrides.json` → OSM `name:<lang>` → Wikidata label → OSM `name`.

Resolved fields by source (3 languages × 565 municipalities = 1695):

| Source | Fields |
|---|---|
| override | 44 |
| OSM `name:<lang>` | 660 |
| Wikidata label | 973 |
| OSM `name` fallback | 18 |

Wikidata labels available for 565 QIDs.

### OSM / Wikidata name conflicts (32)

Every case where OSM's `name:<lang>` and the Wikidata label disagree. OSM wins
unless an override says otherwise. Entries marked *(override)* are corrections
committed in `data/name-overrides.json`.

| NIS | Lang | OSM | Wikidata | Chosen |
|---|---|---|---|---|
| 11022 | fr | Calmpthout | Kalmthout | Kalmthout *(override)* |
| 12005 | fr | Bonheyden | Bonheiden | Bonheiden *(override)* |
| 12014 | fr | Heist-sur-la-Montagne | Heist-op-den-Berg | Heist-sur-la-Montagne |
| 12025 | de | Mecheln | Mechelen | Mecheln |
| 23038 | fr | Campenhout | Kampenhout | Kampenhout *(override)* |
| 24086 | fr | Vieux-Héverlé | Oud-Heverlee | Vieux-Héverlé |
| 25023 | fr | Court-Saint-Etienne | Court-Saint-Étienne | Court-Saint-Étienne *(override)* |
| 31004 | fr | Blankenberghe | Blanckenberghe | Blankenberge *(override)* |
| 44083 | fr | Deynze | Deinze | Deinze *(override)* |
| 44084 | fr | Aeltre | Aalter | Aalter *(override)* |
| 45059 | fr | Bracle | Brakel | Brakel *(override)* |
| 46021 | fr | Saint-Nicolas-Waes | Saint-Nicolas | Saint-Nicolas-Waes |
| 57027 | nl | Steenput | Estaimpuis | Steenput |
| 58002 | nl | Bing | Binche | Bing |
| 62108 | de | Weset | Wesent | Weset |
| 63046 | de | Limburg | Limbourg | Limburg |
| 63084 | nl | Welkenraat | Welkenraedt | Welkenraat |
| 63084 | de | Welkenrath | Welkenraedt | Welkenrath |
| 63086 | de | Dreibrücken | Trois-Ponts | Dreibrücken |
| 63088 | nl | Blieberg | Plombières | Blieberg |
| 63088 | de | Bleiberg | Plombières | Bleiberg |
| 73109 | de | Vuren | Voeren | Vuren |
| 81001 | de | Arel | Arlon | Arel |
| 81013 | de | Martelingen | Martelange | Martelingen |
| 82009 | de | Feitweiler | Fauvillers | Feitweiler |
| 82014 | de | Hohenfels | Houffalize | Hohenfels |
| 82039 | de | Bastnach | Bastogne | Bastnach |
| 85034 | de | Zillig | Saint-Léger | Zillig |
| 85045 | de | Wirten | Virton | Wirten |
| 85046 | de | Habich | Habay | Habich |
| 92035 | nl | Eghezée | Éghezée | Éghezée *(override)* |
| 92035 | fr | Eghezée | Éghezée | Éghezée *(override)* |

### Cross-language review list (117)

Every municipality whose Dutch and French names differ — the surface the plan asks
for a sanity pass over, because an archaic exonym usually shows up here rather
than as an OSM/Wikidata disagreement (the French label for Knokke-Heist was
"Knocke-Heyst", and OSM carried no `name:fr` at all to disagree with).

`[o]` = OSM tag, `[w]` = Wikidata label, `[f]` = OSM `name` fallback,
`[*]` = corrected in `data/name-overrides.json`.

Still worth a human eye: the archaic French *translations* left in place on
purpose — Vieux-Turnhout, Vieux-Héverlé, Heist-sur-la-Montagne,
Wavre-Sainte-Catherine, Capelle-au-Bois, Herck-la-Ville, Saint-Gilles-Waes,
Saint-Nicolas-Waes, Puers-Saint-Amand, Nazareth-La Pinte. They are attested
historical names, and deciding they are dead is not a call this build can verify.

| NIS | Province | Dutch | French |
|---|---|---|---|
| 11002 | Antwerpen | Antwerpen \[o\] | Anvers \[o\] |
| 12014 | Antwerpen | Heist-op-den-Berg \[o\] | Heist-sur-la-Montagne \[o\] |
| 12021 | Antwerpen | Lier \[o\] | Lierre \[o\] |
| 12025 | Antwerpen | Mechelen \[o\] | Malines \[o\] |
| 12035 | Antwerpen | Sint-Katelijne-Waver \[o\] | Wavre-Sainte-Catherine \[o\] |
| 12041 | Antwerpen | Puurs-Sint-Amands \[o\] | Puers-Saint-Amand \[o\] |
| 13002 | Antwerpen | Baarle-Hertog \[o\] | Baerle-Duc \[o\] |
| 13031 | Antwerpen | Oud-Turnhout \[o\] | Vieux-Turnhout \[o\] |
| 21002 | Brussel / Bruxelles | Oudergem \[o\] | Auderghem \[o\] |
| 21003 | Brussel / Bruxelles | Sint-Agatha-Berchem \[o\] | Berchem-Sainte-Agathe \[o\] |
| 21004 | Brussel / Bruxelles | Brussel \[o\] | Bruxelles \[o\] |
| 21007 | Brussel / Bruxelles | Vorst \[o\] | Forest \[o\] |
| 21009 | Brussel / Bruxelles | Elsene \[o\] | Ixelles \[o\] |
| 21012 | Brussel / Bruxelles | Sint-Jans-Molenbeek \[o\] | Molenbeek-Saint-Jean \[o\] |
| 21013 | Brussel / Bruxelles | Sint-Gillis \[o\] | Saint-Gilles \[o\] |
| 21014 | Brussel / Bruxelles | Sint-Joost-ten-Node \[o\] | Saint-Josse-ten-Noode \[o\] |
| 21015 | Brussel / Bruxelles | Schaarbeek \[o\] | Schaerbeek \[o\] |
| 21016 | Brussel / Bruxelles | Ukkel \[o\] | Uccle \[o\] |
| 21017 | Brussel / Bruxelles | Watermaal-Bosvoorde \[o\] | Watermael-Boitsfort \[o\] |
| 21018 | Brussel / Bruxelles | Sint-Lambrechts-Woluwe \[o\] | Woluwe-Saint-Lambert \[o\] |
| 21019 | Brussel / Bruxelles | Sint-Pieters-Woluwe \[o\] | Woluwe-Saint-Pierre \[o\] |
| 23009 | Vlaams-Brabant | Bever \[o\] | Biévène \[o\] |
| 23027 | Vlaams-Brabant | Halle \[o\] | Hal \[o\] |
| 23039 | Vlaams-Brabant | Kapelle-op-den-Bos \[o\] | Capelle-au-Bois \[o\] |
| 23077 | Vlaams-Brabant | Sint-Pieters-Leeuw \[o\] | Leeuw-Saint-Pierre \[o\] |
| 23088 | Vlaams-Brabant | Vilvoorde \[o\] | Vilvorde \[o\] |
| 23101 | Vlaams-Brabant | Sint-Genesius-Rode \[o\] | Rhode-Saint-Genèse \[o\] |
| 24062 | Vlaams-Brabant | Leuven \[o\] | Louvain \[o\] |
| 24086 | Vlaams-Brabant | Oud-Heverlee \[o\] | Vieux-Héverlé \[o\] |
| 24107 | Vlaams-Brabant | Tienen \[o\] | Tirlemont \[o\] |
| 24130 | Vlaams-Brabant | Zoutleeuw \[o\] | Léau \[o\] |
| 24134 | Vlaams-Brabant | Scherpenheuvel-Zichem \[o\] | Montaigu-Zichem \[o\] |
| 25005 | Brabant wallon | Bevekom \[o\] | Beauvechain \[o\] |
| 25014 | Brabant wallon | Eigenbrakel \[o\] | Braine-l'Alleud \[o\] |
| 25015 | Brabant wallon | Kasteelbrakel \[o\] | Braine-le-Château \[o\] |
| 25031 | Brabant wallon | Genepiën \[o\] | Genappe \[o\] |
| 25037 | Brabant wallon | Graven \[o\] | Grez-Doiceau \[o\] |
| 25044 | Brabant wallon | Itter \[o\] | Ittre \[o\] |
| 25048 | Brabant wallon | Geldenaken \[o\] | Jodoigne \[o\] |
| 25050 | Brabant wallon | Terhulpen \[o\] | La Hulpe \[o\] |
| 25072 | Brabant wallon | Nijvel \[o\] | Nivelles \[o\] |
| 25084 | Brabant wallon | Perwijs \[o\] | Perwez \[o\] |
| 25105 | Brabant wallon | Tubeke \[o\] | Tubize \[o\] |
| 25112 | Brabant wallon | Waver \[o\] | Wavre \[o\] |
| 25118 | Brabant wallon | Heilissem \[w\] | Hélécine \[o\] |
| 31005 | West-Vlaanderen | Brugge \[o\] | Bruges \[o\] |
| 31033 | West-Vlaanderen | Torhout \[o\] | Thourout \[o\] |
| 32003 | West-Vlaanderen | Diksmuide \[o\] | Dixmude \[o\] |
| 33011 | West-Vlaanderen | Ieper \[o\] | Ypres \[o\] |
| 33016 | West-Vlaanderen | Mesen \[o\] | Messines \[o\] |
| 33029 | West-Vlaanderen | Wervik \[o\] | Wervicq \[o\] |
| 34022 | West-Vlaanderen | Kortrijk \[o\] | Courtrai \[o\] |
| 34027 | West-Vlaanderen | Menen \[o\] | Menin \[o\] |
| 34043 | West-Vlaanderen | Spiere-Helkijn \[o\] | Espierres-Helchin \[o\] |
| 35013 | West-Vlaanderen | Oostende \[o\] | Ostende \[o\] |
| 35029 | West-Vlaanderen | De Haan \[o\] | Le Coq \[o\] |
| 36015 | West-Vlaanderen | Roeselare \[o\] | Roulers \[o\] |
| 38008 | West-Vlaanderen | De Panne \[o\] | La Panne \[o\] |
| 38014 | West-Vlaanderen | Koksijde \[o\] | Coxyde \[o\] |
| 38016 | West-Vlaanderen | Nieuwpoort \[o\] | Nieuport \[o\] |
| 38025 | West-Vlaanderen | Veurne \[o\] | Furnes \[o\] |
| 41002 | Oost-Vlaanderen | Aalst \[o\] | Alost \[o\] |
| 41018 | Oost-Vlaanderen | Geraardsbergen \[o\] | Grammont \[o\] |
| 41063 | Oost-Vlaanderen | Sint-Lievens-Houtem \[o\] | Hautem-Saint-Liévin \[o\] |
| 42006 | Oost-Vlaanderen | Dendermonde \[o\] | Termonde \[o\] |
| 43014 | Oost-Vlaanderen | Sint-Laureins \[w\] | Saint-Laurent \[o\] |
| 44021 | Oost-Vlaanderen | Gent \[o\] | Gand \[w\] |
| 44064 | Oost-Vlaanderen | Sint-Martens-Latem \[o\] | Laethem-Saint-Martin \[w\] |
| 44086 | Oost-Vlaanderen | Nazareth-De Pinte \[w\] | Nazareth-La Pinte \[o\] |
| 45035 | Oost-Vlaanderen | Oudenaarde \[o\] | Audenarde \[o\] |
| 45041 | Oost-Vlaanderen | Ronse \[o\] | Renaix \[o\] |
| 46020 | Oost-Vlaanderen | Sint-Gillis-Waas \[o\] | Saint-Gilles-Waes \[o\] |
| 46021 | Oost-Vlaanderen | Sint-Niklaas \[o\] | Saint-Nicolas-Waes \[o\] |
| 46025 | Oost-Vlaanderen | Temse \[o\] | Tamise \[o\] |
| 51004 | Hainaut | Aat \[o\] | Ath \[o\] |
| 51008 | Hainaut | Belle \[w\] | Belœil \[o\] |
| 51017 | Hainaut | Elzele \[o\] | Ellezelles \[o\] |
| 51019 | Hainaut | Vloesberg \[o\] | Flobecq \[o\] |
| 51067 | Hainaut | Edingen \[o\] | Enghien \[o\] |
| 51068 | Hainaut | Opzullik \[o\] | Silly \[o\] |
| 51069 | Hainaut | Lessen \[o\] | Lessines \[o\] |
| 53044 | Hainaut | Jurbeke \[o\] | Jurbise \[o\] |
| 53053 | Hainaut | Bergen \[o\] | Mons \[o\] |
| 55004 | Hainaut | 's-Gravenbrakel \[o\] | Braine-le-Comte \[o\] |
| 55040 | Hainaut | Zinnik \[o\] | Soignies \[o\] |
| 57027 | Hainaut | Steenput \[o\] | Estaimpuis \[o\] |
| 57081 | Hainaut | Doornik \[o\] | Tournai \[o\] |
| 57096 | Hainaut | Moeskroen \[o\] | Mouscron \[o\] |
| 57097 | Hainaut | Komen-Waasten \[o\] | Comines-Warneton \[o\] |
| 58002 | Hainaut | Bing \[o\] | Binche \[o\] |
| 61031 | Liège | Hoei \[o\] | Huy \[o\] |
| 62011 | Liège | Bitsingen \[o\] | Bassenge \[o\] |
| 62063 | Liège | Luik \[o\] | Liège \[o\] |
| 62108 | Liège | Wezet \[o\] | Visé \[o\] |
| 63001 | Liège | Amel \[o\] | Amblève \[o\] |
| 63012 | Liège | Büllingen \[w\] | Bullange \[o\] |
| 63013 | Liège | Bütgenbach \[w\] | Butgenbach \[o\] |
| 63040 | Liège | Kelmis \[o\] | La Calamine \[o\] |
| 63046 | Liège | Limburg \[o\] | Limbourg \[o\] |
| 63067 | Liège | Sankt Vith \[w\] | Saint-Vith \[o\] |
| 63080 | Liège | Weismes \[w\] | Waimes \[o\] |
| 63084 | Liège | Welkenraat \[o\] | Welkenraedt \[o\] |
| 63088 | Liège | Blieberg \[o\] | Plombières \[o\] |
| 64034 | Liège | Hannuit \[o\] | Hannut \[o\] |
| 64047 | Liège | Lijsem \[o\] | Lincent \[o\] |
| 64056 | Liège | Oerle \[o\] | Oreye \[o\] |
| 64074 | Liège | Borgworm \[o\] | Waremme \[o\] |
| 71024 | Limburg | Herk-de-Stad \[o\] | Herck-la-Ville \[o\] |
| 71034 | Limburg | Leopoldsburg \[o\] | Bourg-Léopold \[o\] |
| 71053 | Limburg | Sint-Truiden \[o\] | Saint-Trond \[o\] |
| 72004 | Limburg | Bree \[o\] | Brée \[o\] |
| 73109 | Limburg | Voeren \[o\] | Fourons \[o\] |
| 73111 | Limburg | Tongeren-Borgloon \[w\] | Tongres-Looz \[o\] |
| 81001 | Luxembourg | Aarlen \[o\] | Arlon \[o\] |
| 82039 | Luxembourg | Bastenaken \[o\] | Bastogne \[o\] |
| 92094 | Namur | Namen \[o\] | Namur \[o\] |
| 92142 | Namur | Gembloers \[o\] | Gembloux \[o\] |

## Emitted files

| Scope | Kind | Features | Simplify weight | Size | Rescued from simplification |
|---|---|---|---|---|---|
| belgium | country | 565 | 25 | 393 KB | — |
| flanders | region | 285 | 3 | 357 KB | — |
| wallonia | region | 261 | 5 | 356 KB | — |
| antwerpen | province | 67 | 0.1 | 241 KB | — |
| brussels | province | 19 | 0 | 127 KB | — |
| vlaams-brabant | province | 63 | 0.1 | 278 KB | — |
| brabant-wallon | province | 27 | 0.05 | 135 KB | — |
| west-vlaanderen | province | 62 | 0.1 | 264 KB | — |
| oost-vlaanderen | province | 55 | 0.05 | 308 KB | — |
| hainaut | province | 69 | 0.2 | 278 KB | — |
| liege | province | 84 | 0.2 | 305 KB | — |
| limburg | province | 38 | 0.05 | 226 KB | — |
| luxembourg | province | 43 | 0.2 | 255 KB | — |
| namur | province | 38 | 0.05 | 210 KB | — |

Plus `public/data/municipalities.json` (108 KB), the shared
index of all 565 municipalities with their names, province and region.
