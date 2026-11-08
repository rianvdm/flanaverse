# Flanaverse

An interactive map of Mike Flanagan's films and series: the actors who keep coming back, the props and easter eggs that tie the works together, and the authors he adapts. It's an unofficial fan project, live at **https://flanaverse.elezea.com**.

The site is static: Vite, TypeScript and D3, with no framework and no backend. Film data and images come from TMDB. Everything else (the connections, premises, actor profiles and trivia) is hand-curated from published interviews and articles, and every claim carries its sources and a confidence label.

## Run it locally

You need Node 20.19+ or 22.12+ (Vite 8's minimum).

```sh
npm install
npm run dev          # http://localhost:5173
```

The generated TMDB data and images are committed, so you don't need a TMDB API key to run the site or to edit the curated content.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 5173 |
| `npm run validate` | Check the curated data: shapes, labels, and that every work, person, episode and image it mentions exists |
| `npm run check` | Type-check, then validate |
| `npm run build` | Type-check, validate, then build to `dist/` |
| `npm run preview` | Serve the built `dist/` |

## Contributing

Pull requests are welcome. If you've spotted a mistake but don't want to touch the code, [suggest a correction](https://github.com/rianvdm/flanaverse/issues/new?template=correction.yml) instead: say where on the site it is and link a source, and I'll make the change.

The most useful pull requests are content fixes:

- **Corrections.** A wrong episode number, a misattributed quote, a prop that turns out to be a different prop. Point to the source that shows it.
- **New connections.** A prop, easter egg, callback, cameo, location or theme that the site is missing. Add it to `data/curated/connections.json` with at least one source.
- **Better sources.** Upgrading a `reported` or `fan-theory` entry to `confirmed` because Flanagan or someone from the production said it on the record.

Confidence labels mean specific things, and the site shows them to readers:

| Label | Meaning |
|---|---|
| `confirmed` | Flanagan, a credited crew member, or an official production source has said it on the record (interview, social post, screen credit) |
| `reported` | Two or more independent outlets describe it, but nobody from the production has confirmed it |
| `fan-theory` | One outlet, a fan post, or an interpretation |

Spoilers are fine. The site doesn't hide them.

Code fixes and new views are welcome too. For anything bigger than a bug fix, open an issue first so we can agree on the approach before you build it. `docs/SPEC.md` describes the routes, the shared visual vocabulary and the interaction rules that every view follows.

Before you open a PR:

1. Run `npm run build` and make sure it passes. CI runs the same build on every PR, and a PR can't merge until it passes.
2. Open the pages your change touches in `npm run dev`, in a narrow window as well as a wide one.
3. Keep the PR to one change. A batch of easter eggs is one change; an easter egg plus a CSS refactor is two.

If you use an AI coding agent, point it at [AGENTS.md](AGENTS.md).

## Where things live

| Path | What |
|---|---|
| `data/works.json` | The list of works: slug, TMDB id, year, tier (`core`, `early`, `written`, `upcoming`) |
| `data/curated/` | Hand-curated content, typed in `src/data/types.ts`: `connections.json` (props, eggs, callbacks, references, cameos, locations, themes), `works-meta.json` (premises, roles, source material, trivia, episode notes), `people-meta.json` (repertory profiles), `authors.json` |
| `research/` | The research the curated content was written from, with sources and confidence labels |
| `docs/SPEC.md` | Routes, shared vocabulary, interaction rules, visual direction |
| `src/data/generated/` | TMDB output from `npm run fetch` plus the precomputed home map layout. Don't edit by hand |
| `public/img/` | TMDB posters, backdrops, stills and headshots. Don't edit by hand |
| `src/data/model.ts` | Joins generated and curated data; the only thing views read |
| `src/views/` | One module per route |
| `src/components/` | Shared chips, peek panel, "appears in" strip, search palette and trail |
| `scripts/fetch-tmdb.mjs` | TMDB pipeline |
| `scripts/layout.mjs` | Build-time force layout for the home map |
| `scripts/validate.mjs` | Curated data checks, run by `npm run check`, `npm run build` and CI |

## Refreshing TMDB data

Adding a work to `data/works.json`, or refreshing the cast and images, needs a [TMDB API key](https://developer.themoviedb.org/docs/getting-started). If you want a new work added and don't have a key, open an issue or a PR that only changes `data/works.json`, and I'll run the fetch.

```sh
echo 'TMDB_API_KEY=your-key' > .env                  # gitignored
npm run fetch                                        # fetch from TMDB, then recompute the layout
node scripts/fetch-tmdb.mjs --refresh && npm run layout   # same, ignoring the local cache
npm run layout                                       # recompute only the home map layout
```

`npm run fetch` reads `data/works.json`, caches raw API responses in `data/cache/` (gitignored), downloads images into `public/img/`, and writes `src/data/generated/works.json` and `people.json`. TMDB's terms are non-commercial and ask that cached data be refreshed within six months.

## Deploy

Only the maintainer deploys. The site runs as an assets-only Cloudflare Worker (`wrangler.jsonc`) on a custom domain, and merging to `main` does not deploy it.

```sh
npm run deploy       # build, then wrangler deploy
npm run og           # re-render public/og.png from og/og.html (needs npm run dev on :5173)
```

## Licence

- **Code** is under the [MIT License](LICENSE).
- **Curated writing** in `data/curated/` and `research/` is under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **TMDB data and images** in `src/data/generated/` and `public/img/` are not covered by either licence. They come from TMDB under the [TMDB API terms](https://www.themoviedb.org/api-terms-of-use), and the images belong to their rights holders.

By opening a pull request you agree that your contribution is released under the licence for the part of the repo it changes.

## Credits

This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.

Easter-egg and prop research draws on Netflix Tudum, Collider, Screen Rant, CinemaBlend, Bloody Disgusting, Vulture, Deadline, Wikipedia and Flanagan's own posts. Each entry on the site lists its own sources.

Flanaverse is not affiliated with Mike Flanagan, Intrepid Pictures, Red Room Pictures, Netflix or Amazon.
