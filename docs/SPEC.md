# Flanaverse — spec

A locally hosted, static, interactive site for exploring Mike Flanagan's films and series: which actors keep returning, which props and easter eggs tie the works together, and which authors he adapts. Built 2026-11 from TMDB data plus hand-curated research in `research/`.

## Decisions

- **Stack:** Vite 8 + TypeScript 5.9, vanilla DOM, modular D3 v7 in SVG, MiniSearch for search. No framework. `npm run dev` to use; `npm run build && npm run preview` for the static build.
- **Data:** `npm run fetch` pulls TMDB into `src/data/generated/` and `public/img/` (gitignored cache in `data/cache/`). Hand-curated content lives in `data/curated/*.json` and is typed in `src/data/types.ts`. `src/data/model.ts` joins everything once at startup; views only read `model`.
- **Layout precomputed:** the home map's force layout runs in `scripts/layout.mjs` (Node, d3-force, fixed seed) and is written to `src/data/generated/layout.json`. The browser never runs a simulation.
- **No spoiler shield, dark theme only.** Owner has seen everything.
- **Hash routes**, slugs in URLs (never TMDB ids). Page navigation pushes history; in-view state (filters, focus) uses `replaceState` via `router.setQuery()`.
- **TMDB compliance:** About page carries the TMDB logo and the Terms wording: "This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB." Non-commercial. Data refreshed within six months (`fetchedAt` in `works.json`).

## Routes

| Route | View module | Content |
|---|---|---|
| `#/` | `views/home.ts` | Timeline Map hero (works pinned by release date, films above / series below, recurring actors floated between, threads on hover, objects toggle layer), search, three entry cards |
| `#/works` | `views/works.ts` | Poster wall in date order with era headings; film/series filter |
| `#/work/:slug` | `views/work.ts` | Backdrop hero, premise, source author, Flanagan's roles, recurring cast first (people also in other works, with what else they were in), full cast collapsed, episodes with stills (series), connections in this work, "shares the most cast with" |
| `#/people` | `views/people.ts` | Headshot grid sorted by works count, filter by min works, link to grid |
| `#/person/:slug` | `views/person.ts` | Ego map (person centre, works ring by date, frequent co-stars outer ring), role cards per work, "most often with", curated profile |
| `#/grid` | `views/grid.ts` | Cast Grid: actors × works matrix, min-works stepper, sort, film/series toggle, show-characters toggle, sticky headers; reusable for crew |
| `#/connections` | `views/connections.ts` | Catalogue of props, eggs, callbacks, references, cameos, locations; filters by category, work, confidence |
| `#/connection/:id` | `views/connection.ts` | Object trail on the date axis with a marker per sighting, per-sighting notes, sources |
| `#/sources` | `views/sources.ts` | King, Poe, Jackson, James, Pike and the works adapting them |
| `#/themes` | `views/themes.ts` | Themes × works grid and per-theme notes (theme = connection with category `theme`) |
| `#/timeline` | `views/timeline.ts` | Date axis with era bands and a works arc diagram (arc weight = shared recurring cast; hover lists the people) |
| `#/connect/:a/:b` | `views/connect.ts` | "How are these connected": two pickers (works or people), chain of headshot → poster → headshot, shared works list |
| `#/search?q=` | `views/search.ts` | Results grouped by type |
| `#/about` | `views/about.ts` | Credits, TMDB notice and logo, sources, licence |

Every view module exports `default function (route: Route, mount: HTMLElement): void | (() => void)` and may return a cleanup. Views own `src/views/<name>.ts` and `src/styles/<name>.css` (imported by the view).

## Shared vocabulary (one look per entity type, everywhere)

| Entity | Shape | Colour token | Chip class |
|---|---|---|---|
| Work | poster rectangle | `--brass` | `.chip--work` |
| Person | circle headshot | `--bone` | `.chip--person` |
| Prop / location | diamond | `--verdigris` | `.chip--prop` |
| Egg / callback / cameo | star | `--sanguine` | `.chip--egg` |
| Reference / author | book spine | `--wisteria` | `.chip--author` |
| Theme | plain tag | `--ash` | `.chip--theme` |

Shared components in `src/components/`: `chips.ts` (entity chips, headshots, poster cards), `peek.ts` (peek panel: right drawer / bottom sheet; `openPeek`, `closePeek`), `palette.ts` (search), `strip.ts` (the "appears in" strip on the shared date axis), `trail.ts` (your path). Use them rather than re-inventing.

## Interaction rules

- One click on a node/cell/card in a visualization opens the peek panel; "Open page" or a second click navigates. Plain links on pages navigate directly.
- `/` or Cmd/Ctrl-K opens search from anywhere. Esc closes panel or palette.
- Keyboard: everything interactive is a `<button>` or `<a>`; visualizations expose a list fallback (`<ul>` of links under the SVG, visually hidden or in a "List" toggle).
- Mobile: first tap selects + peeks, second tap opens. Grids scroll both ways with sticky headers. No hover-only information.
- Respect `prefers-reduced-motion`.

## Visual direction

Gothic, candle-lit, a well-printed old book in a dark room. Tokens in `src/styles/tokens.css`. Cormorant Garamond for display (≥ 28px), Spectral for reading text, IBM Plex Sans for UI (condensed via `font-stretch` for dense labels, `tabular-nums` for numbers). Backdrops full-bleed at 12–20% opacity, desaturated, under a radial fade to `--ink`. Headshots slightly desaturated at rest, full colour when lit. Avoid: blood-drip type, Trajan caps, red-on-black, glitch, purple gradients, rounded-everything, shadow-heavy cards.

## Eras (for bands and headings)

- 2011–2017 Independent & Intrepid films (Absentia → Gerald's Game)
- 2018–2023 The Netflix years (Hill House → Usher)
- 2025– Amazon & beyond (The Life of Chuck, Carrie)
- Pre-2011 early work (Makebelieve, Ghosts of Hamilton Street, Oculus: Chapter 3) is shown in the timeline and works wall under "Early", not in the map.
