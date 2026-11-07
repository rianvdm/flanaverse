# AGENTS.md - Flanaverse

Instructions for AI coding agents working in this repository. Read `README.md` for what the project is and `docs/SPEC.md` for routes, the shared visual vocabulary and the interaction rules before changing any view.

## Project overview

A static, client-only site mapping Mike Flanagan's films and series, his recurring actors, and the props and easter eggs between works. **Vite 8 + TypeScript 5.9, vanilla DOM, D3 v7 in SVG, MiniSearch for search.** No framework, no backend, no Worker code: `wrangler.jsonc` serves `dist/` as static assets.

Do not add a UI framework, a CSS framework, a state library or a server.

## Commands

```sh
npm install
npm run dev          # http://localhost:5173
npm run check        # tsc --noEmit
npm run build        # tsc --noEmit && vite build
npm run layout       # recompute src/data/generated/layout.json
npm run fetch        # TMDB pipeline + layout; needs TMDB_API_KEY in env or .env
```

There is no test suite and no linter. `npm run build` is the gate: run it before you call a change done.

Never run `npm run deploy` or `wrangler deploy`. Only the maintainer deploys.

## How the code fits together

- `src/app.ts` builds the shell and registers routes; `src/lib/router.ts` is a hash router (`#/work/:slug`). Page navigation pushes history; in-view state (filters, focus) goes through `router.setQuery()`, which uses `replaceState`.
- `src/data/model.ts` joins generated TMDB data with curated JSON once at startup. **Views read only from `model`**; they never import JSON directly.
- Each route is one module in `src/views/<name>.ts` with its own `src/styles/<name>.css`, imported by the view. A view exports `default function (route: Route, mount: HTMLElement)` and may return a cleanup function. Remove any listeners or timers you add in that cleanup.
- Build markup with the `html` tagged template from `src/lib/html.ts`. It escapes interpolations. Use `raw()` only for strings you produced yourself, never for curated or TMDB text.
- Reuse the shared components in `src/components/` (`chips.ts`, `peek.ts`, `palette.ts`, `strip.ts`, `trail.ts`) before writing new ones. Every entity type has one look everywhere (the table in `docs/SPEC.md`); a new view must use the same chip classes and colour tokens.
- Colours, type and spacing come from the tokens in `src/styles/tokens.css`. Don't hardcode hex values in view CSS.
- The home map layout is precomputed in `scripts/layout.mjs` with a fixed seed. The browser never runs a force simulation. If you change which works or people appear on the map, run `npm run layout` and commit the new `layout.json`.

## Code style

Match the surrounding code; there is no formatter config.

- 2-space indentation, semicolons, single quotes, `import type` for type-only imports.
- Modules open with a `/** ... */` block saying what they do. For views, start with the route (`#/themes: ...`).
- TypeScript is strict with `noUnusedLocals` and `noUnusedParameters`. Prefix intentionally unused parameters with `_`.
- Comments explain why, not what.

## Accessibility and interaction rules

These come from `docs/SPEC.md` and apply to every change:

- Everything interactive is a `<button>` or an `<a>`. SVG visualizations need a keyboard-reachable list fallback.
- Nothing is hover-only. On touch, the first tap selects and opens the peek panel; the second tap navigates.
- `/` and Cmd/Ctrl-K open search from anywhere; Esc closes the panel or palette.
- Respect `prefers-reduced-motion`.
- The site is dark-theme only and shows spoilers on purpose. Don't add a light theme or a spoiler shield.

## Data: what you may and may not edit

**Never hand-edit** `src/data/generated/works.json`, `src/data/generated/people.json` or anything in `public/img/`. They are TMDB output from `scripts/fetch-tmdb.mjs`. To change them, change `data/works.json` or the script and rerun `npm run fetch` (which needs a TMDB key). If you don't have a key, change `data/works.json` only and say in the PR that a fetch is needed.

**Curated content** lives in `data/curated/*.json`, and its shapes are in `src/data/types.ts`. The model imports the JSON with `as` casts, so **`npm run build` does not catch bad data**: a misspelled category, a work slug that doesn't exist, or a missing field will all build cleanly and then break or vanish at runtime. Check these by hand:

- `category` is one of `prop`, `egg`, `callback`, `reference`, `cameo`, `location`, `theme`.
- `confidence` is one of `confirmed`, `reported`, `fan-theory`, and it matches the evidence (definitions in `README.md`). Never upgrade a label without a source that supports the higher level.
- Connection `id`s are unique kebab-case.
- Every `work` value is a slug that exists in `data/works.json`.
- Every person id (`people`, `PersonMeta.id`) is a TMDB person id present in `src/data/generated/people.json`.
- Episode references use `S1E3` form and follow Wikipedia's episode tables.
- Every new or changed connection has at least one entry in `sources` with a working URL.

After editing curated data, open the affected pages in `npm run dev` (`#/connection/<id>`, `#/work/<slug>`, `#/themes`) and confirm the entry renders.

## Writing curated content

The curated prose is the product. Treat it with the same care as the code.

- Every factual claim needs a source a reader can follow. Don't add facts from memory or from model knowledge without one, and don't invent quotes, timestamps or episode numbers.
- Don't present fan theories as fact. If a source hedges, the entry hedges.
- `summary` is one sentence. `description` is a paragraph or two in plain, specific language: what the object is, where it shows up, and who said so.
- Keep the TMDB notice in `src/views/about.ts` word for word. The TMDB API terms require it.

## Pull requests

- One change per PR.
- Run `npm run build` and say in the PR description which pages you checked in the browser.
- Don't commit `.env`, `data/cache/`, `dist/` or `.wrangler/`.

## Licensing

Code is MIT. Curated writing in `data/curated/` and `research/` is CC BY 4.0. TMDB data and images are under TMDB's terms and not ours to relicense. See `LICENSE`.
