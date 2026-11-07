#!/usr/bin/env node
/**
 * Builds the Flanaverse dataset from TMDB.
 *
 * Reads data/works.json (curated list of works with TMDB ids), fetches details,
 * credits, seasons/episodes and images, downloads the images into public/img/,
 * and writes src/data/generated/{works,people}.json.
 *
 * Raw API responses are cached in data/cache/ so re-runs are cheap. Delete the
 * cache (or pass --refresh) to refetch.
 *
 * Usage:  TMDB_API_KEY=... node scripts/fetch-tmdb.mjs [--refresh] [--no-images]
 * The key is also read from .env in the repo root (gitignored) if not set in the environment.
 */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(ROOT, 'data', 'cache');
const IMG_DIR = path.join(ROOT, 'public', 'img');
const OUT_DIR = path.join(ROOT, 'src', 'data', 'generated');
const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

const REFRESH = process.argv.includes('--refresh');
const SKIP_IMAGES = process.argv.includes('--no-images');

/** Crew jobs worth keeping: these become "crew" nodes in the site. */
const CREW_JOBS = new Set([
  'Director', 'Writer', 'Screenplay', 'Story', 'Novel', 'Teleplay', 'Creator',
  'Producer', 'Executive Producer', 'Director of Photography', 'Original Music Composer',
  'Editor', 'Production Design', 'Casting', 'Costume Design', 'Makeup Designer',
  'Special Effects Makeup Artist', 'Visual Effects Supervisor',
]);
const MAX_CAST_PER_WORK = 60;
const MAX_BACKDROPS = 8;
const CONCURRENCY = 6;

async function loadKey() {
  if (process.env.TMDB_API_KEY) return process.env.TMDB_API_KEY;
  try {
    const env = await readFile(path.join(ROOT, '.env'), 'utf8');
    const m = env.match(/^TMDB_API_KEY=["']?([^"'\n]+)/m);
    if (m) return m[1];
  } catch {}
  throw new Error('TMDB_API_KEY not set in the environment or in .env');
}
const KEY = await loadKey();

async function exists(p) { try { await access(p); return true; } catch { return false; } }

/** GET a TMDB endpoint with on-disk caching. */
async function tmdb(endpoint, params = {}) {
  const url = new URL(API + endpoint);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const cacheFile = path.join(CACHE_DIR, endpoint.replace(/^\//, '').replace(/[\/?=&]/g, '_') + (params.append_to_response ? '_' + params.append_to_response.replace(/,/g, '-') : '') + '.json');
  if (!REFRESH && await exists(cacheFile)) return JSON.parse(await readFile(cacheFile, 'utf8'));
  url.searchParams.set('api_key', KEY);
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url);
    if (res.status === 429) { await sleep(1500 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`${res.status} ${endpoint}: ${await res.text()}`);
    const json = await res.json();
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, JSON.stringify(json));
    return json;
  }
  throw new Error(`rate limited repeatedly on ${endpoint}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Downloads an image once; returns the public path or null. */
async function image(tmdbPath, size, kind) {
  if (!tmdbPath) return null;
  const file = `${kind}/${size}${tmdbPath}`;
  const dest = path.join(IMG_DIR, file);
  if (SKIP_IMAGES) return `/img/${file}`;
  if (!(await exists(dest))) {
    await mkdir(path.dirname(dest), { recursive: true });
    const res = await fetch(`${IMG}/${size}${tmdbPath}`);
    if (!res.ok) { console.warn(`  ! image ${res.status} ${tmdbPath}`); return null; }
    await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  }
  return `/img/${file}`;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  }));
  return out;
}

const curated = JSON.parse(await readFile(path.join(ROOT, 'data', 'works.json'), 'utf8'));
/** personId -> { ...person, appearances: [] } */
const people = new Map();

function person(p) {
  if (!people.has(p.id)) {
    people.set(p.id, { id: p.id, name: p.name, profilePath: p.profile_path ?? null, gender: p.gender, appearances: [] });
  }
  return people.get(p.id);
}

function addAppearance(p, work, entry) {
  const rec = person(p);
  let app = rec.appearances.find((a) => a.work === work.slug);
  if (!app) { app = { work: work.slug, characters: [], jobs: [], episodeCount: 0, order: null }; rec.appearances.push(app); }
  for (const c of entry.characters ?? []) if (c && !app.characters.includes(c)) app.characters.push(c);
  for (const j of entry.jobs ?? []) if (j && !app.jobs.includes(j)) app.jobs.push(j);
  app.episodeCount = Math.max(app.episodeCount, entry.episodeCount ?? 0);
  if (entry.order != null) app.order = app.order == null ? entry.order : Math.min(app.order, entry.order);
}

async function buildMovie(work) {
  const m = await tmdb(`/movie/${work.tmdb.id}`, { append_to_response: 'credits,images,release_dates' });
  const cast = m.credits.cast.slice(0, MAX_CAST_PER_WORK);
  for (const c of cast) addAppearance(c, work, { characters: [c.character], order: c.order });
  const crew = m.credits.crew.filter((c) => CREW_JOBS.has(c.job));
  for (const c of crew) addAppearance(c, work, { jobs: [c.job] });
  const cert = m.release_dates?.results?.find((r) => r.iso_3166_1 === 'US')?.release_dates?.find((d) => d.certification)?.certification ?? null;
  return {
    ...work,
    tmdbTitle: m.title,
    overview: m.overview,
    tagline: m.tagline || null,
    releaseDate: work.releaseDate ?? m.release_date,   // curated override (festival premiere vs TMDB's US release)
    runtime: m.runtime,
    genres: m.genres.map((g) => g.name),
    certification: cert,
    voteAverage: m.vote_average,
    poster: await image(m.poster_path, 'w500', 'poster'),
    backdrop: await image(m.backdrop_path, 'w1280', 'backdrop'),
    backdrops: await pickBackdrops(m.images, m.backdrop_path),
    cast: cast.map((c) => ({ personId: c.id, character: c.character, order: c.order })),
    crew: crew.map((c) => ({ personId: c.id, job: c.job, department: c.department })),
    seasons: [],
  };
}

async function pickBackdrops(images, primary) {
  const list = (images?.backdrops ?? [])
    .filter((b) => b.file_path !== primary && (b.iso_639_1 == null || b.iso_639_1 === 'en'))
    .sort((a, b) => b.vote_average - a.vote_average)
    .slice(0, MAX_BACKDROPS);
  return (await mapLimit(list, 3, (b) => image(b.file_path, 'w1280', 'backdrop'))).filter(Boolean);
}

async function buildTv(work) {
  const t = await tmdb(`/tv/${work.tmdb.id}`, { append_to_response: 'aggregate_credits,images,content_ratings' });
  const cast = t.aggregate_credits.cast.slice(0, MAX_CAST_PER_WORK);
  for (const c of cast) {
    addAppearance(c, work, {
      characters: c.roles.map((r) => r.character),
      episodeCount: c.total_episode_count,
      order: c.order,
    });
  }
  const crew = t.aggregate_credits.crew.filter((c) => c.jobs.some((j) => CREW_JOBS.has(j.job)));
  for (const c of crew) addAppearance(c, work, { jobs: c.jobs.map((j) => j.job).filter((j) => CREW_JOBS.has(j)), episodeCount: c.total_episode_count });
  for (const c of t.created_by ?? []) addAppearance(c, work, { jobs: ['Creator'] });

  const seasons = [];
  for (const s of t.seasons.filter((s) => s.season_number > 0)) {
    const season = await tmdb(`/tv/${work.tmdb.id}/season/${s.season_number}`);
    const episodes = [];
    for (const e of season.episodes) {
      const directors = e.crew.filter((c) => c.job === 'Director');
      const writers = e.crew.filter((c) => ['Writer', 'Teleplay', 'Story'].includes(c.job));
      for (const c of directors) addAppearance(c, work, { jobs: ['Director'] });
      for (const c of writers) addAppearance(c, work, { jobs: ['Writer'] });
      for (const g of e.guest_stars ?? []) addAppearance(g, work, { characters: [g.character], episodeCount: 1 });
      episodes.push({
        season: s.season_number,
        number: e.episode_number,
        name: e.name,
        overview: e.overview,
        airDate: e.air_date,
        runtime: e.runtime,
        still: await image(e.still_path, 'w780', 'still'),
        directors: directors.map((c) => c.id),
        writers: writers.map((c) => c.id),
        guestStars: (e.guest_stars ?? []).map((g) => ({ personId: g.id, character: g.character })),
      });
    }
    seasons.push({ number: s.season_number, name: season.name, episodes });
  }
  const cert = t.content_ratings?.results?.find((r) => r.iso_3166_1 === 'US')?.rating ?? null;
  return {
    ...work,
    tmdbTitle: t.name,
    overview: t.overview,
    tagline: t.tagline || null,
    releaseDate: work.releaseDate ?? t.first_air_date,
    runtime: t.episode_run_time?.[0] ?? null,
    episodeCount: t.number_of_episodes,
    genres: t.genres.map((g) => g.name),
    certification: cert,
    voteAverage: t.vote_average,
    networks: (t.networks ?? []).map((n) => n.name),
    poster: await image(t.poster_path, 'w500', 'poster'),
    backdrop: await image(t.backdrop_path, 'w1280', 'backdrop'),
    backdrops: await pickBackdrops(t.images, t.backdrop_path),
    cast: cast.map((c) => ({ personId: c.id, character: c.roles.map((r) => r.character).join(' / '), order: c.order, episodeCount: c.total_episode_count })),
    crew: crew.map((c) => ({ personId: c.id, job: c.jobs.map((j) => j.job).filter((j) => CREW_JOBS.has(j)).join(', '), department: c.department })),
    seasons,
  };
}

console.log(`Fetching ${curated.length} works…`);
const works = [];
for (const work of curated) {
  console.log(`- ${work.title}`);
  works.push(work.tmdb.type === 'movie' ? await buildMovie(work) : await buildTv(work));
}

// Person details: everyone with a real appearance. Bios only for people in 2+ works or top-billed.
const all = [...people.values()];
const detailed = all.filter((p) => p.appearances.length >= 2 || p.appearances.some((a) => a.order != null && a.order < 12));
console.log(`People: ${all.length} total, fetching details for ${detailed.length}…`);
await mapLimit(detailed, CONCURRENCY, async (p) => {
  const d = await tmdb(`/person/${p.id}`);
  p.biography = d.biography || null;
  p.birthday = d.birthday || null;
  p.deathday = d.deathday || null;
  p.placeOfBirth = d.place_of_birth || null;
  p.knownForDepartment = d.known_for_department || null;
  p.imdbId = d.imdb_id || null;
  p.profilePath = p.profilePath ?? d.profile_path ?? null;
});
console.log('Downloading profile images…');
await mapLimit(all, CONCURRENCY, async (p) => {
  p.profile = await image(p.profilePath, 'w185', 'profile');
  p.profileLarge = p.appearances.length >= 2 ? await image(p.profilePath, 'h632', 'profile') : null;
  delete p.profilePath;
});

const peopleOut = Object.fromEntries(all.sort((a, b) => b.appearances.length - a.appearances.length || a.name.localeCompare(b.name)).map((p) => [p.id, p]));
await mkdir(OUT_DIR, { recursive: true });
await writeFile(path.join(OUT_DIR, 'works.json'), JSON.stringify(works, null, 1));
await writeFile(path.join(OUT_DIR, 'people.json'), JSON.stringify(peopleOut, null, 1));
const multi = all.filter((p) => p.appearances.length >= 2).length;
console.log(`Wrote ${works.length} works, ${all.length} people (${multi} in 2+ works).`);
