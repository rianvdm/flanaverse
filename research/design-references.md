# Flanaverse explorer: design references and recommendation

*Researched 2026-11-02. Library versions checked against the npm registry and TMDB behaviour tested against the live API on that date.*

The best model for this site is a chronology-anchored map for browsing plus an actor × work grid for the "who keeps showing up" question, both built with modular D3 v7 in SVG and laid out at build time. Several premises in the brief need correcting before the pipeline is built (TMDB still sizes, the attribution wording, and which reference projects are interactive at all), so read the premise checks first.

## 0. Premise checks

1. **TMDB still sizes.** `/configuration` lists stills as `w92`, `w185`, `w300`, `original`. `w780` and `w1280` are *backdrop* sizes. I tested a real Hill House S1E1 still on 2026-11-02 and the CDN does serve `w500`, `w780` and `w1280` for it (HTTP 200), but that is undocumented and could stop working. Design for `w300` and `original`, and treat `w780` as a convenience that might break.
2. **Attribution wording differs between TMDB's FAQ and its legal terms.** The FAQ asks for "This product uses the TMDB API but is not endorsed or certified by TMDB." The API Terms of Use say the product "uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB." Use the Terms wording, since it is the contract.
3. **TMDB's licence is non-commercial and caching is capped at 6 months.** A locally hosted fan site fits, but downloaded images and data must be refreshed (or re-pulled) at least every six months, and you can't add ads or sell anything without a separate agreement.
4. **Every Noise at Once is frozen.** Its own page says it "was a long-running attempt" with data "through 2023-11-19", after Glenn McDonald's Spotify layoff. It is a reference for its interaction model only; its audio previews point at Spotify preview URLs.
5. **Several named references are not interactive.** Netflix Tudum's Flanaverse piece is a static listicle. The Stephen King universe "maps" are static flowcharts. I found no interactive Tarantino map. The Pixar Theory timeline is mostly a static infographic. Jer Thorp's NYT work (Cascade) visualised how Times stories spread on Twitter, so it is relevant as an exploratory-tool pattern and nothing more.
6. **No dedicated Flanaverse Fandom wiki turned up.** A fandom.com-restricted search found Lasser Glass pages on the Villains, Evil and Blumhouse wikis, and `flanagan.fandom.com` belongs to John Flanagan (Ranger's Apprentice). Fandom returns 403 to scripted requests, so any wiki data would have to be gathered by hand. Fandom text is CC BY-SA, so copied prose needs attribution and the same licence.

## 1. Reference projects

Grouped by what they teach. "Screenshot in words" is what you see on first load.

### 1.1 Maps where the words are the nodes

**Every Noise at Once** (Glenn McDonald) - [everynoise.com](https://everynoise.com/)
- *Model:* a giant scatter plot of 6,291 genre names, each an absolutely positioned `<div>` (I counted them in the 3.5 MB HTML). No edges at all. Position encodes sound: "down is more organic, up is more mechanical and electric; left is denser and more atmospheric, right is spikier and bouncier." You scroll the page; there is no zoom.
- *Screenshot in words:* a black-ish page of coloured text in slightly varied sizes, packed edge to edge, running thousands of pixels down. Colour is computed per genre.
- *Works:* the text is the visualisation, so nothing needs a legend or a hover to be legible. One click plays a sample; the `»` beside each genre opens a sub-map of that genre's artists. Two levels, same visual grammar.
- *Annoying:* no search on the map, no orientation (you can't tell where you are on a 10,000 px canvas), the axes are explained in one sentence most people never read, and it is now stale.
- *Take for Flanaverse:* labels can be nodes. A "constellation" of actor names sized by appearances is legible without edges. Keep the two-level drill-down (map, then a sub-map per entity).

**Music-Map** (part of Gnod) - [music-map.com](https://www.music-map.com/)
- *Model:* an ego map. You type one artist, the page shows that name in the centre and about 48 related names around it. I pulled `/radiohead`: the page ships a 49×49 affinity matrix in an inline script and lays the names out client-side so that closer means "more people like both". Every name is a plain link to its own map.
- *Screenshot in words:* white page, a cloud of artist names, the searched one largest in the middle, no lines.
- *Works:* "Click on any name to travel along." Real URLs per artist, so back/forward and sharing work. Zero learning curve.
- *Annoying:* no explanation of *why* two names are close, ads in the layout, and no way to see two hops at once.
- *Take:* the per-actor page should open with this: the actor in the centre, their Flanagan works around them, frequent co-stars one ring out, every name a link. Add the "why" (shared works) that Music-Map leaves out.

**Map of Metal** (Patrick Galbraith with Nick Grant, 2009, [source on GitHub](https://github.com/patrickgalbraith/mapofmetal)) - [mapofmetal.com](https://mapofmetal.com/)
- *Model:* a hand-illustrated "geographic" map of subgenres, panned like a fantasy-novel map, with a minimap in the corner. Clicking a region opens history text and sample tracks. Write-ups at [MakeUseOf](https://www.makeuseof.com/tag/mapofmetal-guide-to-metal-music/) and [Music Machinery](https://musicmachinery.com/2010/12/07/map-of-metal/).
- *Works:* the hand layout gives it personality and a sense of place; the minimap fixes the orientation problem Every Noise has.
- *Annoying:* the original was Flash-era slow, and hand layouts don't update when the data changes.
- *Take:* a hand-tuned layout is defensible for ~15 works, because the works change rarely. Add a minimap or "you are here" indicator on any canvas wider than the screen.

### 1.2 Film universes and shared casts

**Netflix Tudum "Who's who" (2022)** - [netflix.com/tudum/articles/midnight-club-cast-mike-flanagan-flanaverse](https://www.netflix.com/tudum/articles/midnight-club-cast-mike-flanagan-flanaverse)
- *Model:* a static article. One photo per actor, then a list of "Work: character, one-line description".
- *Works:* the per-actor card format (photo, list of roles tagged by work) is exactly what people want when they recognise a face. Henry Thomas's entry lists seven works, which shows how long these lists get.
- *Annoying:* no cross-filtering, frozen at 2022, and nothing links to anything.
- *Take:* this is the actor page's lower half. Copy the card structure and add the links.

**yWorks "Mapping Marvel's universe as a graph"** - [yworks.com/blog/marvel-graph](https://www.yworks.com/blog/marvel-graph), [live demo](https://live.yworks.com/demos/promo/GDC2019/)
- *Model:* movies as nodes in chronological order; **characters drawn as edges** that thread through the movies they appear in, each in its own colour with an icon. Edge thickness is screen time. Hover a hero to highlight their line; click to filter.
- *Works:* the authors say plainly that a bipartite character/movie graph "produces crisscrossing edges and visual chaos", and turning characters into lines fixed it. Chronology reads left to right.
- *Annoying:* with dozens of coloured lines it needs the filter; colour stops identifying people after about eight lines.
- *Take:* the most relevant single reference here. On hover or selection, draw an actor as a "subway line" through their works on the timeline. Leave lines grey or hidden by default.

**The Marvel Cinematic Network** (Tristan Guillevin) - [marvel.ladataviz.com](https://marvel.ladataviz.com/), [IIB showcase](https://www.informationisbeautifulawards.com/showcase/5104-the-marvel-cinematic-network)
- *Model:* one page per MCU phase; scroll down and characters connect to films as the films release. Annotations per film.
- *Works:* splitting a big universe into eras keeps every view small. Scroll order matches release order.
- *Annoying:* you can't see the whole universe at once, and the phase split is Marvel's, not something in the data.
- *Take:* Flanagan has natural eras (indie films; studio films; Netflix series; post-Netflix). Era bands on the timeline are worth having; separate pages per era are not, at 15 works.

**Brian Moore, "Marvel's Universe of Characters"** - [IIB showcase](https://www.informationisbeautifulawards.com/showcase/5095-marvel-s-universe-of-characters)
- *Model:* character grid; click a character and the films they appear in light up.
- *Take:* the click-to-light-up interaction is the right default for the cast grid.

**The Oracle of Bacon** - [oracleofbacon.org](https://oracleofbacon.org/), [how it works](https://oracleofbacon.org/how.php)
- *Model:* two text inputs, a breadth-first search over a co-star graph built from TMDB data, and a text chain of "A was in X with B". Options filter by movies vs TV, role type and genre. Side pages rank the "centers of the Hollywood universe".
- *Works:* one question, one answer, instantly. The "center" ranking is a fun secondary stat.
- *Annoying:* the answer is a plain text list; no pictures of the people or posters in the chain.
- *Take:* inside the Flanaverse almost everyone is one or two hops apart, so path-finding is a toy. A "How are these two connected?" picker that lists *shared works and characters* is more useful, and a "Flanaverse centrality" ranking (who links the most other actors) is a nice stat for the people index.

**Stephen King universe flowcharts** - Gillian James / Tessie Girl, via [Laughing Squid](https://laughingsquid.com/the-stephen-king-universe/) and [Cool Infographics](https://coolinfographics.com/blog/2013/5/16/the-stephen-king-universe.html); context in [Den of Geek on Castle Rock](https://www.denofgeek.com/tv/how-castle-rock-unites-the-stephen-king-universe)
- *Model:* static poster. Book covers as nodes, hand-drawn connector lines for shared characters and places, Dark Tower in the middle.
- *Annoying:* [Creative Bloq's write-up](https://www.creativebloq.com/infographic/stephen-king-flow-chart-5133132) notes text too small to read. Static posters of a dense network always hit this.
- *Take:* Doctor Sleep, Gerald's Game and The Life of Chuck are King adaptations, so the Author page for King should link out to the wider King universe and not try to map it.

**Tarantino "Realer than Real" / "Movie Movie" universes** - explainers at [The Take](https://the-take.com/read/is-there-a-tarantino-universe-how-are-all-the-films-of-quentin-tarantino-connected) and [ScreenCrush video](https://screencrush.com/tarantino-cinematic-universe-connections/)
- *Model:* articles and video essays. No interactive map surfaced.
- *Take:* the two-universe framing is a useful idea: Flanaverse links are of different kinds (same actor, same prop, same in-world place, same source author). Give each link a `kind` in the data and let the UI filter by it.

**The Pixar Theory** (Jon Negroni) - [jonnegroni.com/2013/07/15/pixar-theory-timeline](https://jonnegroni.com/2013/07/15/pixar-theory-timeline)
- *Model:* a vertical in-universe timeline infographic; films ordered by when their stories happen.
- *Take:* in-story chronology is a separate axis from release order. Flanagan's stories span centuries (Usher, Bly Manor's framing, the Lasser Glass's history), but most works aren't in one continuity, so an in-story timeline only makes sense for the Lasser Glass object page.

### 1.3 Data-journalism craft

**The Pudding, "Film Dialogue"** (Hanah Anderson, Matt Daniels) - [pudding.cool/2017/03/film-dialogue](https://pudding.cool/2017/03/film-dialogue/)
- *Model:* scrollytelling intro, then an explorer with genre/decade filters and a film search; each film is a bar of male/female dialogue share.
- *Works:* search plus a couple of filters on top of a simple mark is enough to make 2,000 films explorable.
- *Take:* the explore mode is the template for the cast grid: one simple mark per cell, filters along the top, search that jumps to a row.

**The Pudding, "Every Line in Hamilton"** (Shirley Wu) - [pudding.cool/2017/03/hamilton](https://pudding.cool/2017/03/hamilton/), [IIB entry](https://www.informationisbeautifulawards.com/showcase/2346)
- *Model:* every run of lyrics is a dot, coloured by character; scroll steps filter to characters, conversations and recurring themes; explore mode at the end.
- *Take:* recurring themes as filterable layers over the same base layout. That is the right treatment for Flanagan's themes (grief, addiction, faith, family, inherited trauma) on the timeline.

**Jer Thorp at the NYT R&D Lab (Cascade, 2010-12)** - [Wikipedia](https://en.wikipedia.org/wiki/Jer_Thorp), [OCR archive](https://o-c-r.github.io/human-centered-tools/2010/09/01/cascade)
- *Model:* an exploratory tool for one story's spread through Twitter, drawn as a branching 3D cascade over time.
- *Take:* "exploratory tools, not canned charts". The relevant idea is time on one axis with branching links off it, which is what the hero view does with actors branching off works.

**Information is Beautiful film work** - the 2012 Hollywood challenge, e.g. Gordon Chan's [Hollywood Budgets](https://awesome.ecosyste.ms/projects/github.com%2Fgchan%2Fhollywood-budgets) (filters by year, story type, gross) and Lilach Manheim's [Rise and Fall of Movie Franchises](https://www.informationisbeautifulawards.com/showcase/3465-the-rise-and-fall-of-movie-franchises)
- *Take:* nothing network-shaped. Manheim's franchise timeline (one row per franchise, films as marks along a year axis) is the same structure as the cast grid turned sideways.

### 1.4 Network templates

**Simpsons / Les Misérables co-occurrence matrix** - [D3 v4 Simpsons demo](https://moleleo.github.io/D3V4NetworkDataVisualizations/index.html), modelled on [Mike Bostock's Les Misérables matrix](https://bost.ocks.org/mike/miserables/)
- *Model:* characters on both axes, a cell per pair that co-occurs, with a dropdown to reorder rows by name, frequency or cluster.
- *Works:* reordering is the whole trick. The same matrix sorted by cluster shows groups a force layout hides.
- *Take:* the cast grid needs a sort control (by count, by first appearance, by cluster).

**Observable force and arc notebooks** - [disjoint force-directed graph](https://observablehq.com/@d3/disjoint-force-directed-graph), [Mathieu Jacomy's force layout notes](https://observablehq.com/@jacomyma/force-directed-network-layout), [D3 arc diagram](https://observablehq.com/@d3/arc-diagram)
- *Take:* the bipartite actor/movie model (actors and works as the two node types, project onto actors for co-star links) is standard; see [Co-stardom network](https://en.wikipedia.org/wiki/Co-stardom_network). [Netzschleuder](https://networks.skewed.de/net/dbpedia_starring) warns that automatic force layouts "can be quite meaningless", which is why the hero view below pins works to time.

**xkcd 657, "Movie Narrative Charts"** - [xkcd.com/657](https://xkcd.com/657/)
- *Model:* characters as lines over time, converging when they share a scene.
- *Take:* the same "people as lines" idea as yWorks, at a smaller scale. Good inspiration for an actor's thread drawn on hover.

## 2. Interaction patterns for ~250-400 nodes

The node counts in the brief are a ceiling, not what any one view should show. Most of those 80-150 actors appear in exactly one work; the recurring set is the interesting part. Design every view around a filter like "appears in ≥2 works" and let one-off cast live on work pages.

| Layout | Good at | Bad at | Verdict |
|---|---|---|---|
| Free force-directed (works + actors + props) | Clusters, discovery, a "map" feel | Chronology, stable positions, legible labels past ~100 nodes; different every run unless precomputed | Use only with works pinned to time (below) |
| Arc diagram (works on a line, arcs = shared cast) | Showing which works share the most people, in order | Individual actors; arcs between distant works pile up | Good secondary on the Timeline page, works-only (15 nodes) |
| Chord diagram (works around a circle) | Looks striking | No chronology; 15 long titles around a circle are hard to label; can't show who | Skip |
| Adjacency matrix (work × work) | Exact overlap counts | Says nothing about people | Fold into the arc diagram's hover |
| Incidence matrix / "cast grid" (actor × work) | "Who keeps showing up", sorting, scanning a row for one actor's career, mobile | Topology, "map" delight | **Primary analytical view** |
| Bipartite ribbons (works one side, actors the other) | Small sets (≤30 actors) | Turns to spaghetti at 60+ actors | Skip, except inside a work page for that work's recurring cast |
| Timeline "subway" with curved links | Chronology, eras, following one person | Many simultaneous lines (colour runs out) | **Primary browsing view**, with lines drawn on demand |

[Ghoniem, Fekete and Castagliola (InfoVis 2004)](https://www.lisn.upsaclay.fr/publications/a-comparison-of-the-readability-of-graphs-using-node-link-and-matrix-based-representations/) found matrices beat node-link diagrams on most tasks above about 20 vertices, with path-finding the exception. [Okoe, Jianu and Kobourov](https://ar5iv.labs.arxiv.org/html/1709.00293) found node-link better for topology questions like "select all neighbours". That maps neatly onto this site: the grid answers "who and how often", the map answers "what is this connected to".

### 2.1 Recommended primary view: the Timeline Map (home)

- Works are fixed stations along an x-axis of release date, 2011 to the present. Films sit above the axis, series below, which separates the film and Netflix eras without extra chrome. Each station is a small poster (`w92`/`w185`).
- Recurring actors (≥2 works) are round headshots placed by a force simulation with `forceX` pulling each actor to the mean date of their works, `forceY` pushing them off the axis into the film or series half where most of their work is, `forceCollide` on the node radius plus label, and `forceLink` to each of their works. Node radius scales with the number of works.
- Edges render as faint brass hairlines. Hover or tap an actor and their edges light up, and their thread is drawn as one smooth curve through their works in date order (the yWorks / xkcd idea). Everything else dims to about 15% opacity.
- Props and easter eggs are a toggle layer ("Show objects"), drawn as small diamonds near the works they appear in. Off by default.
- Labels are always on for works and for actors with ≥4 works; the rest label on hover. Era bands (soft vertical washes) carry the era names.
- **Compute the layout at build time.** Run the d3-force simulation in a Node script, write `x/y` into the JSON, and render static positions in the browser. d3-force v3 defaults to a fixed-seed linear congruential generator (`simulation.randomSource`), so the same input gives the same layout. You get no jitter on load, no CPU cost on phones, stable positions that can be referenced in URLs, and a place to hand-nudge a few nodes with an overrides file.

### 2.2 Secondary views

1. **Cast Grid** (`#/grid`). Rows are actors, columns are works in date order with poster headers. A filled cell means the actor appears; opacity or fill style marks main cast vs guest (use TMDB `episode_count` vs the series' episode total, and `order` for films). Hover or tap a cell to see the character name; a "show characters" toggle prints names in the cells. Sort by number of works (default), first appearance, name, or cluster. A "min works" stepper (2-7) and a film/series toggle sit above it. Row headers stick on horizontal scroll; column headers stick on vertical scroll. Fifteen columns at 28-32 px fit a phone. Reuse the same component for Themes × Works, Objects × Works and Crew × Works.
2. **Actor ego map** (top of each actor page). Music-Map style: the actor in the centre, their works in a ring ordered by date, co-stars who share ≥2 works in an outer ring, edge labels naming the shared works. Every node is a link.
3. **Works arc diagram** (Timeline page). Works on the date axis, arcs sized by shared recurring cast. Hover an arc to list the shared people.
4. **Connection finder** (`#/connect/a/b`). Two pickers; output is a visual chain of headshot, poster, headshot with character names, plus the list of every shared work. Cheap to build, and people will use it on their phones mid-episode.
5. **Object trail** (each prop/egg page). One row on the date axis with a marker per sighting and a still thumbnail where you have one. The Lasser Glass page is the flagship.

## 3. Navigation and information architecture

### 3.1 Sections

| Route | Page | Main content |
|---|---|---|
| `#/` | Home | Timeline Map, search box, three entry cards (Cast Grid, Objects & Eggs, Works) |
| `#/works` | Works index | Poster wall in date order with era headings; filter film/series |
| `#/work/:slug` | Work | Backdrop hero, synopsis, source author, recurring cast (people from other works first), full cast collapsed, episodes (series), objects/eggs in this work, "shares the most cast with" list |
| `#/work/:slug/s:n` | Season | Episode stills (`w300`), per-episode guest recurring cast |
| `#/people` | People index | Headshot grid sorted by works count; link to Cast Grid |
| `#/person/:slug` | Actor or crew | Ego map, role cards per work (Tudum format with links), "most often with" list |
| `#/grid` | Cast Grid | Matrix with filters in the query string |
| `#/objects` | Objects & eggs | Card grid filtered by kind (prop, cameo, reference, place, name), work, recurring only |
| `#/object/:slug` | Object/egg | Object trail, per-sighting notes, spoiler-gated details |
| `#/sources`, `#/source/:slug` | Source authors | King, Poe, Jackson, James, Pike: works adapted, original titles, years |
| `#/themes`, `#/theme/:slug` | Themes | Themes × Works grid; per theme, works with a short note on how it shows up |
| `#/timeline` | Timeline | Date axis, era bands, works arc diagram, theme layers |
| `#/connect/:a/:b` | Connection finder | Chain and shared works |
| `#/search?q=` | Search results | Grouped by entity type |
| `#/about` | About & credits | TMDB logo and notice, data sources, licences |

### 3.2 URL scheme rules

- Hash routes are right for a static, locally hosted site: no server rewrite rules, deep links survive a reload. Use `#/` paths and a `?` query inside the hash for view state, e.g. `#/grid?min=3&sort=first&format=series` and `#/?focus=person:henry-thomas&layer=objects`.
- Slugs, not TMDB ids, in URLs (`henry-thomas`, `the-haunting-of-hill-house`). Keep `tmdbId` in the data. Add a numeric suffix only on a collision.
- Page navigation uses `pushState` (Back works). Selection changes inside a view (focus an actor on the map, change a grid filter) use `replaceState`, so Back leaves the view instead of stepping through every hover.

### 3.3 Detail panels vs pages

- One click or tap on any node or cell opens a **peek panel**: right-side drawer on desktop (about 380 px), bottom sheet on mobile at 50% height that can be dragged up. It shows image, name, one line, the works strip, and an "Open page" button. The map stays visible and keeps the selection.
- The panel title, the "Open page" button, Enter, or a double-click navigates to the full page. Pages are canonical and deep-linkable; the panel is a preview.
- Esc closes the panel. Clicking a different node swaps its contents without closing.
- Pages never open a second panel on top of themselves. Links on pages are plain navigation.

### 3.4 Keeping it easy

- **One visual vocabulary for entity types everywhere** (map, grid, chips, search results): works are brass poster rectangles, people are bone-coloured circles with headshots, objects are verdigris diamonds, eggs are sanguine stars, authors are wisteria book-spines, themes are plain text tags. Learn it once on the map and every page reads the same.
- **Every entity page has the same three parts:** header (image, name, one line); "Appears in" strip on the shared date axis; connections (lists of chips). Nothing else is required, so thin entities still look complete.
- **Progressive disclosure:** the map shows works and recurring actors only; objects are a toggle; one-off cast is on work pages behind "Full cast".
- **A trail.** Keep the last six visited entities as a row of chips under the header ("Your path: Hill House → Henry Thomas → Midnight Mass"). It is the Music-Map "travel along" feeling made visible, and it gives people a way back without the Back button.
- **Spoiler shield.** Flanagan easter eggs and character fates are spoilers. Add an "I've seen" checklist of works stored in `localStorage` (wrapped in try/catch); for unseen works, blur egg descriptions and character fates until clicked. Default: everything shielded except the poster-level synopsis.
- **Search as a command palette.** `/` or Cmd-K opens it from anywhere; results grouped by type with the type icon; Enter goes to the page. With a few hundred entities, a client-side index loads instantly.
- **Mobile:** no hover, so first tap selects and opens the peek, second tap on the same node opens the page. Pinch-zoom on the map; the grid scrolls in both directions with sticky headers.

## 4. Visual direction

Gothic and candle-lit, with the films supplying most of the imagery. The type and colour should feel like a well-printed old book in a dark room. Avoid the horror-poster clichés: blood-drip type, Trajan/Cinzel caps, red-on-black, glitch effects.

### 4.1 Palette (dark is the default theme)

Contrast ratios computed against `--ink` (WCAG 2.x formula).

| Token | Hex | Role | Contrast on ink |
|---|---|---|---|
| `--ink` | `#0A0D14` | Page background, near-black with a navy cast | - |
| `--night` | `#111725` | Panels, cards | - |
| `--vault` | `#1A2232` | Raised surfaces, hover rows, grid empty cells | - |
| `--hairline` | `#2C3649` | Dividers, grid lines, inactive edges | 1.6 (decorative only) |
| `--bone` | `#EAE3D2` | Primary text, people nodes | 15.2 |
| `--ash` | `#A8A08F` | Secondary text, captions, metadata | 7.5 |
| `--dust` | `#7D7768` | Disabled text, axis ticks (large/bold only) | 4.4 |
| `--brass` | `#C9A45C` | Primary accent: works, links, selected state, grid fills | 8.3 |
| `--candle` | `#F0C878` | Hover/active highlight, the "lit" thread on the map | 12.3 |
| `--verdigris` | `#6E9E8F` | Objects and props | 6.4 |
| `--sanguine` | `#CF6252` | Easter eggs, spoiler markers (sparingly) | 5.1 |
| `--wisteria` | `#9C8DBE` | Source authors / literature | 6.5 |

Optional light "parchment" theme: background `#F2ECDF`, text `#1A1712` (15.2), secondary `#5E5749` (6.1), brass `#735620` (5.8), verdigris `#3F6B5E` (5.1), sanguine `#8E2F25` (6.9), wisteria `#5F4E86` (6.1). Define all of these as CSS custom properties on `:root` and swap under `[data-theme]` and `prefers-color-scheme`.

Why these: the navy-black reads as night, not as a generic dark mode; brass and candle give warm light against it; verdigris and wisteria are aged-metal and pressed-flower colours that stay distinct from brass for colour-blind readers (brass vs sanguine is the riskiest pair, so eggs also get a star shape, never colour alone).

### 4.2 Type

All on Google Fonts; self-host through Fontsource so the local site works offline.

| Role | Family | Settings | Why |
|---|---|---|---|
| Display (titles, work names, big numbers) | **Cormorant Garamond** (variable, wght 300-700) | 500-600 weight, 28 px and up, slight negative tracking | High-contrast Garamond with long, sharp serifs. Reads as literary and old without costume. Too thin below ~20 px, so never use it for body. |
| Reading text (synopses, egg notes, essays) | **Spectral** (static, 200-800) | 400, 17-18 px, line-height 1.55 | Designed by Production Type for screen reading; pairs with Cormorant's Garamond lineage but holds up at body size. |
| UI, labels, filters, numbers | **IBM Plex Sans** (variable, wght 100-700, wdth 75-100) | 450-500; condensed width (`font-stretch: 85%`) for graph labels and grid headers; `font-variant-numeric: tabular-nums` | Slightly mechanical, not as ubiquitous as Inter, and the width axis lets dense labels fit without shrinking. |

Two-family fallback if three feels like too many: Cormorant Garamond plus IBM Plex Sans, with Plex Sans for body text.

Rejected: Playfair Display (the default "elegant serif" of the last decade; looks like wedding stationery), Cinzel (the Trajan horror-poster cliché), IM Fell English (lovely period texture but rough at UI sizes; fine for a single drop cap or a pull-quote from Poe or Shirley Jackson if you want one flourish), Fraunces (its soft, "wonky" axes read playful, which fights the tone), EB Garamond (good, but sits too close to Cormorant to earn a slot).

### 4.3 Imagery and effects

- **Stills bleeding through.** On work pages and behind the home map, place a backdrop (`w1280`) full-bleed at 12-20% opacity, `filter: grayscale(.6) sepia(.15)`, under a radial gradient that fades to `--ink` at the edges. Desaturating unifies 15 works graded in very different colours. Blend with `mix-blend-mode: luminosity` over `--night` if you want the navy cast to win.
- **Candle light.** On the home map, a soft radial "pool" of `--candle` at about 6% alpha follows the pointer (update two CSS custom properties in a `requestAnimationFrame`). Turn it off under `prefers-reduced-motion` and on touch devices.
- **Film grain.** One static noise PNG (generate it once with an SVG `feTurbulence` and rasterise) tiled at 4-6% opacity over the backdrop. Animated grain costs battery for little gain.
- **Headshots.** Circular, slight desaturation at rest (`grayscale(.35)`), full colour on hover/selection. That makes "lit" mean something.
- **Performance rule:** CSS filters and blend modes on one backdrop are cheap; on 150 SVG nodes they are not. Pre-process node images at build time (resize, desaturate) and keep runtime filters for single large images.

## 5. Libraries

npm versions as of 2026-11-02 (registry `latest` tag):

| Package | Version | Released |
|---|---|---|
| `d3` (umbrella) | 7.9.0 | 2024-03-12 |
| `d3-force` | 3.0.0 | 2021-06 |
| `d3-selection` | 3.0.0 | 2021-06 |
| `d3-zoom` | 3.0.0 | 2021-06 |
| `d3-shape` | 3.2.0 | 2022-12 |
| `d3-scale` | 4.0.2 | 2021-09 |
| `d3-transition` | 3.0.1 | 2021-06 |
| `d3-array` | 3.2.4 | 2023-05 |
| `d3-chord` | 3.0.1 | 2021-06 |
| `@types/d3` | 7.4.3 | 2023-11 |
| `sigma` | 4.0.4 | 2026-10-27 (4.0.0 shipped 2026-10-08) |
| `graphology` | 0.26.0 | 2025-01-26 |
| `cytoscape` | 3.34.4 | 2026-10-15 |
| `vis-network` | 10.1.4 | 2026-10-27 |
| `echarts` | 6.1.0 | 2026-05-19 |
| `vite` | 8.3.5 | 2026-10-21 (needs Node ^20.19 or ≥22.12) |
| `typescript` | 7.0.2 | 2026-07-08 (6.0.3 is the last 6.x) |
| `minisearch` | 7.2.0 | 2025-09-16 |
| `fuse.js` | 7.5.0 | 2026-07-13 |
| `@fontsource-variable/cormorant-garamond`, `@fontsource-variable/ibm-plex-sans`, `@fontsource/spectral` | 5.3.0 | 2026-07-19 |

D3 has not shipped a major since v7; the modules are stable, not abandoned.

### Recommendation: modular D3 v7, SVG rendering

- The graph is small. A few hundred SVG elements with `<image>` nodes is well within what browsers handle, and SVG gives you CSS styling (the palette tokens apply directly), crisp text in your own fonts, focusable elements for keyboard and screen-reader access, and `<a>`-style semantics.
- You need several chart types (timeline map, matrix, arc, ego map, object trail) with one visual language. D3 is the only option here that does all of them without fighting a house style.
- Import modules, not the umbrella: `d3-selection`, `d3-scale`, `d3-shape`, `d3-zoom`, `d3-transition`, `d3-array` in the browser; `d3-force` only in the build script (and in the browser only if you add a live "untangle" mode).

Pitfalls and how to handle them:

- *Layout jitter and phone CPU:* precompute positions at build time (section 2.1).
- *Label collision:* label works always, actors with ≥4 works always, the rest on hover. For always-on labels, run a greedy placer at build time that tries four positions (right, left, above, below) and drops a label that still collides. Include label width in `forceCollide` radius for labelled nodes.
- *Mobile:* `d3-zoom` handles pinch and pan, but set `touch-action: none` on the SVG and a `scaleExtent` (e.g. 0.5-4), and make tap targets at least 44 px at the default zoom even if the drawn node is smaller (an invisible larger circle behind each node).
- *Images in SVG:* use one shared circular `<clipPath>` per size and plain `<image>` elements; avoid a `<pattern>` per node. Set `decoding="async"` on any HTML `<img>`.
- *Types:* `@types/d3-*` lag a little, and `SimulationNodeDatum` typing for custom node types needs a small generic wrapper. Write the node/edge types once in a `types.ts` and share them between the build script and the client.
- *TypeScript 7:* Vite transpiles TS itself, so `tsc` is only for `--noEmit` type checks. TS 7 is the new native compiler and still young; if an editor plugin or `@types` package misbehaves, pin `typescript@6.0.3` for the check without changing code.

Why not the others:

- **Sigma.js 4 + graphology:** WebGL, built for thousands of nodes, with good ForceAtlas2 layouts. Overkill at this size, labels render in WebGL (SDF text) so your Google Fonts and CSS don't apply the same way, images need `@sigma/node-image`, and v4 has shipped four patch releases in its first three weeks after a large rewrite. Revisit only if the graph grows past a few thousand nodes.
- **Cytoscape.js:** a solid graph model with `preset` layouts and good built-in interaction, but canvas-rendered with its own stylesheet language, and it only does node-link. You'd still need D3 for the grid and arcs, so you'd maintain two styling systems.
- **vis-network:** fast to start, but live physics wobble and a generic look that is hard to make gothic.
- **ECharts 6:** capable graph series and good mobile defaults, but a large bundle and a strong house style; customising tooltips and labels to this design is more work than drawing them in D3.

Search: **MiniSearch 7.2.0**. Field boosts (name > character names > aliases > synopsis), prefix and fuzzy matching, and a tiny index for a few hundred documents. Build the index at build time and ship it as JSON.

## 6. TMDB notes for the pipeline

Docs: [image basics](https://developer.themoviedb.org/docs/image-basics), [configuration](https://developer.themoviedb.org/reference/configuration-details), [rate limiting](https://developer.themoviedb.org/docs/rate-limiting), [FAQ](https://developer.themoviedb.org/docs/faq), [API Terms of Use](https://www.themoviedb.org/api-terms-of-use), [logos & attribution](https://www.themoviedb.org/about/logos-attribution).

### 6.1 Images

URL: `https://image.tmdb.org/t/p/{size}{file_path}` (the `file_path` already starts with `/`). Example: `https://image.tmdb.org/t/p/w500/1E5baAaEse26fej7uHcjOgEE2t2.jpg`. Get the base URL and sizes from `GET /3/configuration` rather than hardcoding them. SVG logos only come at `original`. The CDN currently answers from BunnyCDN with a one-year `cache-control`.

Sizes listed by `/configuration` (verified 2026-11-02):

| Type | Documented sizes | Use on this site |
|---|---|---|
| Poster | w92, w154, w185, w342, w500, w780, original | `w92` map stations and grid headers; `w342` cards; `w780` work-page hero |
| Backdrop | w300, w780, w1280, original | `w1280` bleed-through backgrounds; `w300` card backgrounds |
| Still (episode) | w92, w185, w300, original | `w300` episode grids; `original` (about 300 KB for a Hill House still) for a lightbox |
| Profile (person) | w45, w185, h632, original | `w185` map nodes and chips (sharp at 2x for a 64 px circle); `h632` actor page header |
| Logo | w45, w92, w154, w185, w300, w500, original | Network/studio logos if you show them |

Undocumented but working on 2026-11-02: `w500`, `w780`, `w1280` on still paths, `w300`/`w500` on profile paths. Don't depend on them.

Since the site is local, download the images during the pipeline and serve them from `public/img/…`. Record `fetchedAt` per item and re-run the pipeline at least every six months to stay inside the caching clause.

### 6.2 Endpoints

All under `https://api.themoviedb.org/3`. Authenticate with the v4 read token as `Authorization: Bearer …` (or the v3 `api_key` query parameter).

| Endpoint | What you get | Notes from testing |
|---|---|---|
| `GET /tv/{id}` | Series details, `seasons[]`, `created_by`, networks | Use `append_to_response=aggregate_credits,images` to make it one call |
| `GET /tv/{id}/aggregate_credits` | Cast and crew across **all** episodes. `cast[].roles[]` = `{credit_id, character, episode_count}`, plus `total_episode_count`, `order`. `crew[].jobs[]` and `department` | Includes guest stars: Hill House returns 52 cast (including one-episode roles such as Russ Tamblyn) and 88 crew. Use this, not `/credits`, which is only the latest season's regulars |
| `GET /tv/{id}/season/{n}` | `episodes[]` with `still_path`, `air_date`, `guest_stars[]`, `crew[]` | Needed for per-episode guest appearances and stills. Hill House S1E1 lists 10 guest stars, including Samantha Sloyan and Robert Longstreet |
| `GET /tv/{id}/images` | `backdrops`, `posters`, `logos` with width, height, `iso_639_1`, `vote_average` | Pass `include_image_language=en,null` or you only get one language; `null` = textless art, which is what you want for backgrounds |
| `GET /movie/{id}` | Details, `release_date`, `runtime` | `append_to_response=credits,images` works in one call (Doctor Sleep: 57 cast, 69 posters, 49 backdrops) |
| `GET /movie/{id}/credits` | `cast[]` with `character`, `order`; `crew[]` with `job` | |
| `GET /movie/{id}/images` | As for TV | Same `include_image_language` rule |
| `GET /person/{id}` | Bio, birthday, `profile_path` | `append_to_response=combined_credits,images` |
| `GET /person/{id}/images` | `profiles[]` | Often only 1-3 profiles per person |
| `GET /configuration` | Image base URL and sizes | Call once per pipeline run |
| `GET /search/tv`, `/search/movie`, `/search/person` | Id lookup | Use once to seed a hand-checked id list, then pin the ids in a data file |

Pipeline size, roughly: one call per work with `append_to_response`, one per season, one per recurring person. That is a few hundred requests per run, which is nothing against the limit.

### 6.3 Rate limits

TMDB says limits "sit somewhere in the 40 requests per second range" and may change; respect any `429`. In practice: a concurrency of 4-8 with a small delay, retry on 429 with exponential backoff, and cache raw responses on disk so reruns hit the network only for what changed.

### 6.4 Attribution

- Show the TMDB logo (one of the approved SVGs from the logos page; don't recolour or distort it) and the notice: "This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB."
- Put it on `#/about` (the FAQ says an "About" or "Credits" section), and add a one-line footer link to it. The TMDB logo must be less prominent than the site's own name or mark.
- TMDB brand colours if you need them: `#0d253f`, `#01b4e4`, `#90cea1`. They clash with this palette, so keep the logo on a small neutral plate on the About page.
- Non-commercial only under the standard licence.

## 7. One-page recommendation

**Build:** Vite 8.3.5 + TypeScript (7.0.2, pin 6.0.3 if tooling complains), vanilla DOM, modular D3 v7 (`d3-selection` 3.0.0, `d3-scale` 4.0.2, `d3-shape` 3.2.0, `d3-zoom` 3.0.0, `d3-transition` 3.0.1, `d3-array` 3.2.4; `d3-force` 3.0.0 in the build script), MiniSearch 7.2.0, Fontsource 5.3.0 for Cormorant Garamond, Spectral and IBM Plex Sans. SVG rendering throughout.

**Data pipeline (Node script, run by hand):**
1. A hand-maintained `works.yaml` with TMDB ids, slugs, era, format, source author, and status (released/announced).
2. Fetch with `append_to_response`, cache raw JSON on disk, retry 429s, concurrency ≤8.
3. Download images at fixed sizes (posters w92/w342/w780, backdrops w1280, stills w300, profiles w185/h632), desaturate node thumbnails, write to `public/img/`.
4. Merge in hand-curated `objects.yaml`, `eggs.yaml`, `themes.yaml` (with `kind` on every link: actor, prop, place, reference, author).
5. Run the force layout and label placer, apply `layout-overrides.json`, emit `graph.json` with positions plus a MiniSearch index.
6. Stamp `fetchedAt`; refresh within six months.

**Views, in build order:**
1. Cast Grid (`#/grid`). Smallest effort, answers the main question, and it's the component you'll reuse for themes, objects and crew.
2. Work and Person pages with the peek panel, the trail, and the spoiler shield.
3. Timeline Map on the home page: works pinned by date (films above, series below), recurring actors floated by precomputed force, actor threads lit on hover, objects as a toggle layer.
4. Objects & Eggs catalogue and object trails (Lasser Glass first).
5. Timeline page with the works arc diagram and theme layers; Sources; Themes.
6. Connection finder.

Skip chord diagrams, bipartite ribbons at full size, free-floating force layouts at runtime, and Sigma/Cytoscape.

**Interaction rules:** one tap = peek panel; second tap or "Open page" = navigate. `pushState` for pages, `replaceState` for in-view state. `/` or Cmd-K for search. Same shape and colour per entity type everywhere. One-off cast only on work pages.

**Look:** `--ink #0A0D14` background, `--night #111725` panels, `--bone #EAE3D2` text, `--ash #A8A08F` secondary, `--brass #C9A45C` accent, `--candle #F0C878` highlight, `--verdigris #6E9E8F` objects, `--sanguine #CF6252` eggs, `--wisteria #9C8DBE` authors. Cormorant Garamond for display, Spectral for reading, IBM Plex Sans (condensed for labels) for UI. Desaturated `w1280` backdrops at low opacity behind pages, static grain, a pointer-following candle pool on the map that respects reduced motion.

**Compliance:** TMDB logo and Terms-wording notice on `#/about`, linked from the footer; non-commercial; six-month refresh. Credit any Fandom-derived text under CC BY-SA.

## Sources

- Every Noise at Once: [everynoise.com](https://everynoise.com/), [Wikipedia](https://en.wikipedia.org/wiki/Every_Noise_at_Once), [Billboard Canada](https://ca.billboard.com/business/streaming/spotify-s-former-data-alchemist-gives-every-song-a-genre)
- Music-Map: [music-map.com](https://www.music-map.com/), example page [music-map.com/radiohead](https://www.music-map.com/radiohead)
- Map of Metal: [GitHub](https://github.com/patrickgalbraith/mapofmetal), [MakeUseOf](https://www.makeuseof.com/tag/mapofmetal-guide-to-metal-music/), [Music Machinery](https://musicmachinery.com/2010/12/07/map-of-metal/)
- Netflix Tudum recurring cast: [netflix.com/tudum](https://www.netflix.com/tudum/articles/midnight-club-cast-mike-flanagan-flanaverse)
- Lasser Glass appearances: [CinemaBlend](https://cinemablend.com/streaming-news/mike-flanagans-lasser-glass-where-to-find-oculus-haunted-mirror-each-horror-projects-house-of-usher), [/Film](https://slashfilm.com/1402882/fall-house-usher-oculus-mirror-lasser-glass-cameo), [Bloody Disgusting](https://bloody-disgusting.com/news/3462273/huge-oculus-easter-egg-may-missed-geralds-game/); Fandom pages at [Villains Wiki](https://villains.fandom.com/wiki/Lasser_Glass), [Blumhouse Wiki](https://blumhouse.fandom.com/wiki/Lasser_Glass)
- MCU: [yWorks blog](https://www.yworks.com/blog/marvel-graph), [Guillevin](https://www.informationisbeautifulawards.com/showcase/5104-the-marvel-cinematic-network), [Moore](https://www.informationisbeautifulawards.com/showcase/5095-marvel-s-universe-of-characters)
- Oracle of Bacon: [site](https://oracleofbacon.org/), [how it works](https://oracleofbacon.org/how.php)
- Stephen King flowcharts: [Laughing Squid](https://laughingsquid.com/the-stephen-king-universe/), [Cool Infographics](https://coolinfographics.com/blog/2013/5/16/the-stephen-king-universe.html), [Creative Bloq](https://www.creativebloq.com/infographic/stephen-king-flow-chart-5133132), [Den of Geek](https://www.denofgeek.com/tv/how-castle-rock-unites-the-stephen-king-universe)
- Tarantino: [The Take](https://the-take.com/read/is-there-a-tarantino-universe-how-are-all-the-films-of-quentin-tarantino-connected), [ScreenCrush](https://screencrush.com/tarantino-cinematic-universe-connections/)
- Pixar Theory: [Jon Negroni](https://jonnegroni.com/2013/07/15/pixar-theory-timeline), [Fanlore](https://www.fanlore.org/wiki/The_Pixar_Theory)
- The Pudding: [Film Dialogue](https://pudding.cool/2017/03/film-dialogue/), [Hamilton](https://pudding.cool/2017/03/hamilton/)
- Jer Thorp / Cascade: [Wikipedia](https://en.wikipedia.org/wiki/Jer_Thorp), [OCR](https://o-c-r.github.io/human-centered-tools/2010/09/01/cascade)
- Information is Beautiful film entries: [Hollywood Budgets](https://awesome.ecosyste.ms/projects/github.com%2Fgchan%2Fhollywood-budgets), [Movie Franchises](https://www.informationisbeautifulawards.com/showcase/3465-the-rise-and-fall-of-movie-franchises)
- Matrices and networks: [Simpsons D3 matrix](https://moleleo.github.io/D3V4NetworkDataVisualizations/index.html), [Les Misérables matrix](https://bost.ocks.org/mike/miserables/), [Co-stardom network](https://en.wikipedia.org/wiki/Co-stardom_network), [Netzschleuder](https://networks.skewed.de/net/dbpedia_starring), [Observable force graph](https://observablehq.com/@d3/disjoint-force-directed-graph), [Observable arc diagram](https://observablehq.com/@d3/arc-diagram), [xkcd 657](https://xkcd.com/657/)
- Readability studies: [Ghoniem et al. 2004](https://www.lisn.upsaclay.fr/publications/a-comparison-of-the-readability-of-graphs-using-node-link-and-matrix-based-representations/), [Okoe, Jianu, Kobourov](https://ar5iv.labs.arxiv.org/html/1709.00293)
- Libraries: [npm registry](https://www.npmjs.com/) (versions above), [sigma v4.0.0 release](https://github.com/jacomyal/sigma.js/releases/tag/sigma@4.0.0), [sigma v3 to v4 migration](https://www.sigmajs.org/how-to/technical/migration-v3-v4/)
- Fonts: [Google Fonts metadata](https://fonts.google.com/metadata/fonts), [Fontsource](https://fontsource.org/)
- TMDB: [image basics](https://developer.themoviedb.org/docs/image-basics), [configuration](https://developer.themoviedb.org/reference/configuration-details), [aggregate credits](https://developer.themoviedb.org/reference/tv-series-aggregate-credits), [rate limiting](https://developer.themoviedb.org/docs/rate-limiting), [FAQ](https://developer.themoviedb.org/docs/faq), [API Terms of Use](https://www.themoviedb.org/api-terms-of-use), [logos & attribution](https://www.themoviedb.org/about/logos-attribution)
