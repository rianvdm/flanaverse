#!/usr/bin/env node
/**
 * Validates the hand-maintained data before it reaches the site.
 *
 * src/data/model.ts imports the curated JSON with `as` casts, so tsc never
 * checks it: a misspelled category, a work slug that doesn't exist or a typo'd
 * key builds cleanly and then breaks or silently vanishes at runtime. This
 * script checks data/works.json and data/curated/*.json against the shapes in
 * src/data/types.ts, and checks every cross-reference (work slugs, TMDB person
 * ids, episode refs, image paths) against the generated TMDB data.
 *
 * Keep the shapes below in sync with src/data/types.ts.
 *
 * Errors fail the run (exit 1). Warnings don't: a work listed in
 * data/works.json with no generated TMDB data yet is a warning, so someone
 * without a TMDB key can still propose a new work.
 *
 * Usage: npm run validate
 */
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (rel) => JSON.parse(await readFile(path.join(ROOT, rel), 'utf8'));
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

const errors = [];
const warnings = [];
const error = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

// ---------------------------------------------------------------------------
// Shape checking. A checker is (value, where) => void and reports through error().

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EPISODE = /^S(\d+)E(\d+)$/;

const str = (v, where) => {
  if (typeof v !== 'string' || v.trim() === '') error(where, `expected a non-empty string, got ${JSON.stringify(v)}`);
};
const int = (v, where) => {
  if (!Number.isInteger(v) || v <= 0) error(where, `expected a positive integer, got ${JSON.stringify(v)}`);
};
const kebab = (v, where) => {
  str(v, where);
  if (typeof v === 'string' && v && !KEBAB.test(v)) error(where, `"${v}" is not kebab-case`);
};
const isoDate = (v, where) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) error(where, `expected a YYYY-MM-DD date, got ${JSON.stringify(v)}`);
};
const url = (v, where) => {
  str(v, where);
  if (typeof v !== 'string') return;
  let ok = false;
  try { ok = ['http:', 'https:'].includes(new URL(v).protocol); } catch {}
  if (!ok) error(where, `"${v}" is not an http(s) URL`);
};
const oneOf = (...allowed) => (v, where) => {
  if (!allowed.includes(v)) error(where, `${JSON.stringify(v)} is not one of ${allowed.join(', ')}`);
};
const nullable = (check) => (v, where) => { if (v !== null) check(v, where); };
const arrayOf = (check, { min = 0 } = {}) => (v, where) => {
  if (!Array.isArray(v)) return error(where, 'expected an array');
  if (v.length < min) error(where, `expected at least ${min} item${min === 1 ? '' : 's'}`);
  v.forEach((item, i) => check(item, `${where}[${i}]`));
};
const recordOf = (checkKey, checkValue) => (v, where) => {
  if (!isObj(v)) return error(where, 'expected an object');
  for (const [k, val] of Object.entries(v)) { checkKey(k, `${where} key`); checkValue(val, `${where}.${k}`); }
};
/** An object with exactly these keys: unknown keys are errors, which catches typos. */
const shape = (required, optional = {}) => (v, where) => {
  if (!isObj(v)) return error(where, 'expected an object');
  for (const [key, check] of Object.entries(required)) {
    if (!(key in v)) error(where, `missing "${key}"`);
    else check(v[key], `${where}.${key}`);
  }
  for (const [key, check] of Object.entries(optional)) {
    if (key in v && v[key] !== undefined) check(v[key], `${where}.${key}`);
  }
  for (const key of Object.keys(v)) {
    if (!(key in required) && !(key in optional)) error(where, `unknown key "${key}"`);
  }
};

// Shapes, mirroring src/data/types.ts (curated) and scripts/fetch-tmdb.mjs (works list).

const episodeRef = (v, where) => {
  if (typeof v !== 'string' || !EPISODE.test(v)) error(where, `expected an episode ref like "S1E3", got ${JSON.stringify(v)}`);
};
const source = shape({ label: str, url });

const WORK_ENTRY = shape(
  {
    slug: kebab,
    title: str,
    tmdb: shape({ type: oneOf('movie', 'tv'), id: int }),
    year: int,
    tier: oneOf('core', 'early', 'written', 'upcoming'),
    kind: oneOf('feature', 'series', 'short'),
  },
  { releaseDate: isoDate, releaseNote: str },
);

const CONNECTION = shape(
  {
    id: kebab,
    title: str,
    category: oneOf('prop', 'egg', 'callback', 'reference', 'cameo', 'location', 'theme'),
    summary: str,
    description: str,
    appearances: arrayOf(shape({ work: str, note: str }, { episode: episodeRef }), { min: 1 }),
    confidence: oneOf('confirmed', 'reported', 'fan-theory'),
    sources: arrayOf(source, { min: 1 }),
  },
  { people: arrayOf(int), image: nullable(str) },
);

const WORK_META = shape(
  {
    slug: str,
    platform: str,
    flanaganRoles: arrayOf(str, { min: 1 }),
    sourceMaterial: nullable(shape({ author: str, title: str }, { note: str })),
    premise: str,
    whyItMatters: str,
    trivia: arrayOf(str),
    wikipedia: url,
  },
  { episodeNotes: recordOf(episodeRef, str) },
);

const PERSON_META = shape(
  { id: int, profile: str },
  { firstWorkedWith: str, funFact: str, sources: arrayOf(source) },
);

const AUTHOR = shape({
  id: kebab,
  name: str,
  works: arrayOf(shape({ work: str, title: str }, { note: str }), { min: 1 }),
  blurb: str,
});

// ---------------------------------------------------------------------------

const works = await readJson('data/works.json');
const connections = await readJson('data/curated/connections.json');
const worksMeta = await readJson('data/curated/works-meta.json');
const peopleMeta = await readJson('data/curated/people-meta.json');
const authors = await readJson('data/curated/authors.json');
const generatedWorks = await readJson('src/data/generated/works.json');
const generatedPeople = await readJson('src/data/generated/people.json');

/** Checks each item's shape, then that `key(item)` is unique. Returns the items keyed. */
function checkList(file, items, check, key) {
  const seen = new Map();
  if (!Array.isArray(items)) { error(file, 'expected a top-level array'); return seen; }
  items.forEach((item, i) => {
    const k = isObj(item) ? key(item) : undefined;
    const where = `${file}[${i}]${k !== undefined ? ` (${k})` : ''}`;
    check(item, where);
    if (k === undefined) return;
    if (seen.has(k)) error(where, `duplicate ${JSON.stringify(k)}, also at index ${seen.get(k).index}`);
    else seen.set(k, { item, index: i, where });
  });
  return seen;
}

const workList = checkList('data/works.json', works, WORK_ENTRY, (w) => w.slug);
const connList = checkList('connections.json', connections, CONNECTION, (c) => c.id);
const metaList = checkList('works-meta.json', worksMeta, WORK_META, (m) => m.slug);
const personList = checkList('people-meta.json', peopleMeta, PERSON_META, (p) => p.id);
const authorList = checkList('authors.json', authors, AUTHOR, (a) => a.id);

// Cross-references. Slugs must be in data/works.json; generated data may lag behind it.

const generatedBySlug = new Map(generatedWorks.map((w) => [w.slug, w]));
const personIds = new Set(Object.values(generatedPeople).map((p) => p.id));

for (const { item: w, where } of workList.values()) {
  if (!generatedBySlug.has(w.slug)) warn(where, 'no TMDB data yet; the maintainer needs to run npm run fetch');
}
for (const slug of generatedBySlug.keys()) {
  if (!workList.has(slug)) error('src/data/generated/works.json', `"${slug}" is not in data/works.json; rerun npm run fetch`);
}

const workRef = (slug, where) => {
  if (typeof slug === 'string' && !workList.has(slug)) error(where, `unknown work slug "${slug}"`);
};
const personRef = (id, where) => {
  if (Number.isInteger(id) && !personIds.has(id)) error(where, `TMDB person ${id} is not in src/data/generated/people.json`);
};
const episodeExists = (slug, ref, where) => {
  const m = typeof ref === 'string' && EPISODE.exec(ref);
  const work = generatedBySlug.get(slug);
  if (!m || !work) return;
  if (work.kind !== 'series') return error(where, `"${slug}" is not a series, so it has no ${ref}`);
  const season = work.seasons.find((s) => s.number === Number(m[1]));
  if (!season?.episodes.some((e) => e.number === Number(m[2]))) error(where, `"${slug}" has no ${ref}`);
};

for (const { item: c, where } of connList.values()) {
  if (Array.isArray(c.appearances)) {
    c.appearances.forEach((a, i) => {
      if (!isObj(a)) return;
      workRef(a.work, `${where}.appearances[${i}].work`);
      if (a.episode !== undefined) episodeExists(a.work, a.episode, `${where}.appearances[${i}].episode`);
    });
  }
  if (Array.isArray(c.people)) c.people.forEach((id, i) => personRef(id, `${where}.people[${i}]`));
  if (typeof c.image === 'string') {
    if (!c.image.startsWith('/img/')) error(`${where}.image`, `"${c.image}" should be a /img/... path`);
    else if (!(await exists(path.join(ROOT, 'public', c.image)))) error(`${where}.image`, `public${c.image} does not exist`);
  }
}

for (const { item: m, where } of metaList.values()) {
  workRef(m.slug, `${where}.slug`);
  if (isObj(m.episodeNotes)) {
    for (const ref of Object.keys(m.episodeNotes)) episodeExists(m.slug, ref, `${where}.episodeNotes.${ref}`);
  }
}

for (const { item: p, where } of personList.values()) {
  personRef(p.id, `${where}.id`);
  if (p.firstWorkedWith !== undefined) workRef(p.firstWorkedWith, `${where}.firstWorkedWith`);
}

for (const { item: a, where } of authorList.values()) {
  if (Array.isArray(a.works)) a.works.forEach((w, i) => isObj(w) && workRef(w.work, `${where}.works[${i}].work`));
}

// ---------------------------------------------------------------------------

for (const w of warnings) console.warn(`warning  ${w}`);
for (const e of errors) console.error(`error    ${e}`);

const counts = `${connList.size} connections, ${metaList.size} work notes, ${personList.size} profiles, ${authorList.size} authors, ${workList.size} works`;
if (errors.length) {
  console.error(`\nData validation failed: ${errors.length} error${errors.length === 1 ? '' : 's'} (${counts}).`);
  process.exit(1);
}
console.log(`Data OK: ${counts}${warnings.length ? `, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : ''}.`);
