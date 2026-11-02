#!/usr/bin/env node
/**
 * Precomputes the home Timeline Map layout (docs/SPEC.md: "Layout precomputed").
 *
 * Works are fixed stations on a release-date x-axis: films above the axis,
 * series below, nudged sideways only where two posters would overlap.
 * Recurring actors (acting credits in 2+ core works) are placed by a d3-force
 * simulation: pulled to the mean date of their works, pushed into the film or
 * series half where most of their work is, clamped to a band 60-160px (series:
 * 60-200px) from the axis, and kept off the posters, their titles and each other. d3-force v3 uses a fixed-seed
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
const BAND_MIN = 60;           // actor centres sit between BAND_MIN and the side's max distance from the axis
const BAND_MAX_FILM = 160;     // films (above): 15 actors, plenty of room
const BAND_MAX_SERIES = 200;   // series (below): ~50 actors in the Netflix years need a little more depth
const LABELLED_MIN_WORKS = 4;  // matches home.ts: always-on labels
const NODE_ROOM = 8;           // collide padding: unlabelled actors
const LABEL_ROOM = 20;         // collide padding: always-labelled actors (label sits below)
const POSTER_ROOM = Math.hypot(POSTER_W, POSTER_H) / 2 + 4; // a poster as a collide circle
const LABEL_CHAR_W = 5.2;      // approx. width of one 11px condensed character, for work-label obstacles

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

/* Fixed obstacles: each poster, plus its title label on the side away from the axis. */
const nodes = [];
const links = [];
for (const [slug, s] of stations) {
  nodes.push({ id: `w:${slug}`, kind: 'work', x: s.x, y: s.y, fx: s.x, fy: s.y, room: POSTER_ROOM });
  const title = coreBySlug.get(slug).title;
  const lineChars = title.length > 17 ? Math.ceil(title.length / 2) : title.length; // home.ts wraps long titles
  const room = Math.max(16, (lineChars * LABEL_CHAR_W) / 2);
  const side = Math.sign(s.y);
  const y = s.y + side * (POSTER_H / 2 + room * 0.6);
  nodes.push({ id: `l:${slug}`, kind: 'label', x: s.x, y, fx: s.x, fy: y, room });
}
for (const a of actors) {
  const films = a.slugs.filter((s) => !isSeries(coreBySlug.get(s))).length;
  const side = films * 2 > a.slugs.length ? -1 : 1; // majority films -> above (y < 0)
  const meanX = a.slugs.reduce((t, s) => t + stations.get(s).ax, 0) / a.slugs.length;
  const r = radiusFor(a.slugs.length);
  const labelled = a.slugs.length >= LABELLED_MIN_WORKS;
  const n = {
    id: `p:${a.id}`, kind: 'person', personId: a.id, side, r, meanX, labelled,
    minAbsY: BAND_MIN + r, maxAbsY: side < 0 ? BAND_MAX_FILM : BAND_MAX_SERIES,
    // A stable start: at the mean date, in the middle of the band.
    x: meanX, y: side * ((BAND_MIN + (side < 0 ? BAND_MAX_FILM : BAND_MAX_SERIES)) / 2),
  };
  nodes.push(n);
  for (const s of a.slugs) links.push({ source: n.id, target: `w:${s}` });
}

/** Clamps each actor into its side's band: clear of the axis strip, never far from the posters. */
function forceBand() {
  let ns = [];
  const force = () => {
    for (const n of ns) {
      if (n.kind !== 'person') continue;
      // Clamp where the node will land this tick (position + velocity), not where it is now.
      const d = n.side * (n.y + n.vy);
      if (d < n.minAbsY) { n.y = n.side * n.minAbsY; n.vy = 0; }
      else if (d > n.maxAbsY) { n.y = n.side * n.maxAbsY; n.vy = 0; }
    }
  };
  force.initialize = (all) => { ns = all; };
  return force;
}

const isPerson = (n) => n.kind === 'person';
const sim = forceSimulation(nodes)
  .force('x', forceX((n) => (isPerson(n) ? n.meanX : n.x)).strength((n) => (isPerson(n) ? 0.12 : 0)))
  .force('y', forceY((n) => (isPerson(n) ? n.side * (n.minAbsY + n.maxAbsY) / 2 : n.y)).strength((n) => (isPerson(n) ? 0.15 : 0)))
  .force('link', forceLink(links).id((n) => n.id).strength(0.01).distance(60))
  // Labels sit below the node, so labelled actors claim more room; posters and titles are fixed obstacles.
  .force('collide', forceCollide((n) => (isPerson(n) ? n.r + (n.labelled ? LABEL_ROOM : NODE_ROOM) : n.room)).strength(0.9).iterations(4))
  .force('band', forceBand())
  .stop();

for (let i = 0; i < 800; i++) sim.tick();

/* Report anything still overlapping (headshot vs headshot, headshot vs poster). */
const people_ = nodes.filter(isPerson);
let clashes = 0;
for (let i = 0; i < people_.length; i++) {
  const a = people_[i];
  for (let j = i + 1; j < people_.length; j++) {
    const b = people_[j];
    if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + 2) clashes++;
  }
  for (const s of stations.values()) {
    const dx = Math.max(Math.abs(a.x - s.x) - POSTER_W / 2, 0), dy = Math.max(Math.abs(a.y - s.y) - POSTER_H / 2, 0);
    if (Math.hypot(dx, dy) < a.r + 2) clashes++;
  }
}
if (clashes) console.warn(`layout: ${clashes} overlapping node pair(s); loosen BAND_MAX_* or the collide padding.`);
const absY = people_.map((n) => Math.abs(n.y));
console.log(`actor |y| range ${Math.round(Math.min(...absY))}-${Math.round(Math.max(...absY))}`);

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
