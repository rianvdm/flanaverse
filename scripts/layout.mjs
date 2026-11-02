#!/usr/bin/env node
/**
 * Precomputes the home Timeline Map layout (docs/SPEC.md: "Layout precomputed").
 *
 * Works are fixed stations on a release-date x-axis: films above the axis,
 * series below, nudged sideways only where two posters would overlap.
 * Recurring actors (acting credits in 2+ core works) are placed by a d3-force
 * simulation: pulled to the mean date of their works, pushed into the film or
 * series half where most of their work is, kept out of the poster band around
 * the axis, and spaced by radius plus label room. d3-force v3 uses a fixed-seed
 * random source, so the same data always yields the same layout.
 *
 * Reads src/data/generated/{works,people}.json; writes
 * src/data/generated/layout.json as
 *   { meta, works: { slug: { x, y, ax } }, people: { id: { x, y, r } } }
 * in world units, with the axis at y = 0.
 *
 * Usage: npm run layout
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { forceSimulation, forceX, forceY, forceCollide, forceLink } from 'd3';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN = path.join(ROOT, 'src', 'data', 'generated');

/* Must match AXIS_FROM / AXIS_TO / xOfYear / yearOf in src/components/strip.ts. */
const AXIS_FROM = 2011;
const AXIS_TO = 2027;
const xOfYear = (year, width) => ((year - AXIS_FROM) / (AXIS_TO - AXIS_FROM)) * width;
const yearOf = (date) => Number(date.slice(0, 4)) + (Number(date.slice(5, 7) || 1) - 1) / 12;

/* World geometry (world units = CSS px at zoom 1). home.ts reads these from meta. */
const WIDTH = 1500;           // 2011 -> 2027
const POSTER_W = 44;
const POSTER_H = 66;
const FILM_GAP = 24;          // axis to the bottom of a film poster (year labels sit here)
const SERIES_GAP = 32;        // axis to the top of a series poster (props & eggs markers sit here)
const POSTER_SPACING = POSTER_W + 8;
const CLEAR_FILM = FILM_GAP + POSTER_H + 48;     // actors stay above this (room for two label rows)
const CLEAR_SERIES = SERIES_GAP + POSTER_H + 48; // and below this
const LABELLED_MIN_WORKS = 4; // matches home.ts: always-on labels
const Y_SPREAD = 170;         // how far past the poster band actors settle
const NODE_ROOM = 9;          // collide padding: unlabelled actors
const LABEL_ROOM = 26;        // collide padding: always-labelled actors (label sits below)

const radiusFor = (n) => 10 + (Math.min(n, 10) - 2) * (14 / 8);

const works = JSON.parse(await readFile(path.join(GEN, 'works.json'), 'utf8'));
const people = Object.values(JSON.parse(await readFile(path.join(GEN, 'people.json'), 'utf8')));

const core = works.filter((w) => w.tier === 'core').sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
const coreBySlug = new Map(core.map((w) => [w.slug, w]));
const isSeries = (w) => w.kind === 'series';

/* 1. Work stations: true date x, then spread apart within each half so posters never overlap. */
const stations = new Map();
for (const half of [core.filter((w) => !isSeries(w)), core.filter(isSeries)]) {
  const items = half.map((w) => ({ slug: w.slug, ax: xOfYear(yearOf(w.releaseDate), WIDTH), series: isSeries(w) }))
    .sort((a, b) => a.ax - b.ax);
  items.forEach((it) => { it.x = it.ax; });
  for (let iter = 0; iter < 200; iter++) {
    let moved = false;
    for (let i = 1; i < items.length; i++) {
      const gap = items[i].x - items[i - 1].x;
      if (gap < POSTER_SPACING) {
        const push = (POSTER_SPACING - gap) / 2;
        items[i - 1].x -= push;
        items[i].x += push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  for (const it of items) {
    const y = it.series ? SERIES_GAP + POSTER_H / 2 : -(FILM_GAP + POSTER_H / 2);
    stations.set(it.slug, { x: round(it.x), y, ax: round(it.ax) });
  }
}

/* 2. Recurring actors: acting credits in 2+ core works. */
const actors = people
  .map((p) => {
    const slugs = [...new Set(p.appearances.filter((a) => a.characters.length > 0 && coreBySlug.has(a.work)).map((a) => a.work))];
    return { id: p.id, name: p.name, slugs };
  })
  .filter((a) => a.slugs.length >= 2)
  .sort((a, b) => b.slugs.length - a.slugs.length || a.id - b.id);

const nodes = [];
const links = [];
const workNodes = new Map();
for (const [slug, s] of stations) {
  const n = { id: `w:${slug}`, kind: 'work', x: s.x, y: s.y, fx: s.x, fy: s.y };
  workNodes.set(slug, n);
  nodes.push(n);
}
for (const a of actors) {
  const films = a.slugs.filter((s) => !isSeries(coreBySlug.get(s))).length;
  const side = films * 2 > a.slugs.length ? -1 : 1; // majority films -> above (y < 0)
  const meanX = a.slugs.reduce((t, s) => t + stations.get(s).ax, 0) / a.slugs.length;
  const r = radiusFor(a.slugs.length);
  const labelled = a.slugs.length >= LABELLED_MIN_WORKS;
  const clear = side < 0 ? CLEAR_FILM : CLEAR_SERIES;
  const n = {
    id: `p:${a.id}`, kind: 'person', personId: a.id, side, r, meanX, labelled,
    minAbsY: clear + r,
    // A stable, readable start: at the mean date, just outside the poster band.
    x: meanX, y: side * (clear + r + 20),
  };
  nodes.push(n);
  for (const s of a.slugs) links.push({ source: n.id, target: `w:${s}` });
}

/** Keeps actors out of the poster band around the axis. */
function forceClearBand() {
  let ns = [];
  const force = () => {
    for (const n of ns) {
      if (n.kind !== 'person') continue;
      if (n.side * n.y < n.minAbsY) { n.y = n.side * n.minAbsY; if (n.vy * n.side < 0) n.vy = 0; }
    }
  };
  force.initialize = (all) => { ns = all; };
  return force;
}

const isPerson = (n) => n.kind === 'person';
const sim = forceSimulation(nodes)
  .force('x', forceX((n) => (isPerson(n) ? n.meanX : n.x)).strength((n) => (isPerson(n) ? 0.25 : 0)))
  .force('y', forceY((n) => (isPerson(n) ? n.side * (n.minAbsY + Y_SPREAD) : n.y)).strength((n) => (isPerson(n) ? 0.04 : 0)))
  .force('link', forceLink(links).id((n) => n.id).strength(0.015).distance(60))
  // Labels sit below the node, so labelled actors claim more room.
  .force('collide', forceCollide((n) => (isPerson(n) ? n.r + (n.labelled ? LABEL_ROOM : NODE_ROOM) : 0)).strength(0.9).iterations(3))
  .force('band', forceClearBand())
  .stop();

for (let i = 0; i < 600; i++) sim.tick();

const out = {
  meta: {
    axisFrom: AXIS_FROM, axisTo: AXIS_TO, width: WIDTH,
    posterW: POSTER_W, posterH: POSTER_H, filmGap: FILM_GAP, seriesGap: SERIES_GAP,
    generatedFrom: { works: core.length, actors: actors.length },
  },
  works: Object.fromEntries([...stations].map(([slug, s]) => [slug, s])),
  people: Object.fromEntries(nodes.filter(isPerson).map((n) => [n.personId, { x: round(n.x), y: round(n.y), r: round(n.r) }])),
};

await writeFile(path.join(GEN, 'layout.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`layout.json: ${core.length} works, ${actors.length} actors`);

function round(v) { return Math.round(v * 10) / 10; }
