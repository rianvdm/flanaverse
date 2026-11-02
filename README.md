# Flanaverse

An interactive, locally hosted map of Mike Flanagan's films and series: the actors who keep returning, the props and easter eggs that tie the works together, and the authors he adapts. Unofficial fan project, built November 2026.

## Run it

```sh
npm install
npm run dev          # http://localhost:5173
```

For a static build: `npm run build && npm run preview`. Everything is static; no server beyond Vite's.

## Refresh the data

Film data and images come from [TMDB](https://www.themoviedb.org/). TMDB's licence is non-commercial and asks that cached data be refreshed within six months.

```sh
TMDB_API_KEY=... npm run fetch       # or put TMDB_API_KEY in ../product-ai/.env
npm run layout                       # recompute the home map layout
```

`npm run fetch` reads `data/works.json` (the curated list of works with TMDB ids and tiers), caches raw API responses in `data/cache/` (gitignored), downloads posters, backdrops, stills and headshots into `public/img/`, and writes `src/data/generated/works.json` and `people.json`. Pass `--refresh` to ignore the cache.

## Where things live

| Path | What |
|---|---|
| `data/works.json` | Hand-maintained list of works: slug, TMDB id, year, tier (`core`, `early`, `written`, `upcoming`) |
| `data/curated/` | Hand-curated content typed in `src/data/types.ts`: `connections.json` (props, eggs, callbacks, references, cameos, locations, themes), `works-meta.json` (premises, roles, source material, trivia, episode notes), `people-meta.json` (repertory profiles), `authors.json` |
| `research/` | The research the curated content was written from, with sources and confidence labels |
| `docs/SPEC.md` | Routes, shared vocabulary, interaction rules, visual direction |
| `scripts/fetch-tmdb.mjs` | TMDB pipeline |
| `scripts/layout.mjs` | Build-time force layout for the home map |
| `src/data/model.ts` | Joins generated and curated data; the only thing views read |
| `src/views/` | One module per route; `src/components/` holds the shared chips, peek panel, strip, search palette and trail |

## Credits

This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB. Easter-egg and prop research draws on Netflix Tudum, Collider, Screen Rant, CinemaBlend, Bloody Disgusting, Vulture, Deadline, Wikipedia and Flanagan's own posts; each entry on the site carries its sources and a confidence label.
