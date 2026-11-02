/**
 * #/ — the Timeline Map hero (docs/SPEC.md, research/design-references.md 2.1).
 *
 * Core works are fixed stations on a release-date axis (films above, series
 * below); recurring actors float around them at positions precomputed by
 * scripts/layout.mjs. Hover or focus lights a node's neighbourhood and an
 * actor's thread; one click opens the peek, a second click opens the page.
 * In-view state (focus, objects layer) lives in the query string via setQuery().
 */
import { select, zoom, zoomIdentity, zoomTransform, line, curveMonotoneX, type Selection, type ZoomTransform } from 'd3';
import type { Route } from '../lib/router';
import { setQuery } from '../lib/router';
import { html, mountHtml, plural, type Raw } from '../lib/html';
import { model, ERAS, workHref, personHref, connectionHref, actingWorks, recurringCast, roleIn, sharedWorks } from '../data/model';
import type { Work, Person, Connection, ConnectionCategory } from '../data/types';
import { glyph, personChip, workChip, chipList, kindOf, CATEGORY_LABEL } from '../components/chips';
import { openPeek, onPeekClose, isPeekOpen, type PeekContent } from '../components/peek';
import { appearsInStrip, AXIS_FROM, AXIS_TO, xOfYear } from '../components/strip';
import { openPalette } from '../components/palette';
import layoutJson from '../data/generated/layout.json';
import '../styles/home.css';

/* ---------- Layout data (world units = CSS px at zoom 1, axis at y = 0) ---------- */

interface Layout {
  meta: { axisFrom: number; axisTo: number; width: number; posterW: number; posterH: number; filmGap: number; seriesGap: number };
  works: Record<string, { x: number; y: number; ax: number }>;
  people: Record<string, { x: number; y: number; r: number }>;
}
const LAYOUT = layoutJson as Layout;
const { width: W, posterW: PW, posterH: PH, filmGap: FILM_GAP, seriesGap: SERIES_GAP } = LAYOUT.meta;
if (LAYOUT.meta.axisFrom !== AXIS_FROM || LAYOUT.meta.axisTo !== AXIS_TO) {
  console.warn('layout.json was built for a different axis than strip.ts; run `npm run layout`.');
}

/** Actors with this many works are always labelled (others on hover). Matches scripts/layout.mjs. */
const LABELLED_MIN_WORKS = 4;
const OBJECT_CATEGORIES: ConnectionCategory[] = ['prop', 'location', 'egg', 'callback', 'cameo'];
const SVG_NS = 'http://www.w3.org/2000/svg';
const LABEL_SIZE = 11;
const LINE_H = LABEL_SIZE * 1.15;
const BLEED = 4000; // era bands and the axis extend this far past the map bounds

type Key = `person:${string}` | `work:${string}` | `conn:${string}`;
/** `y` is the drawn position: `baseY` from layout.json plus any series-side shift (see applySeriesShift). */
interface Station { work: Work; key: Key; x: number; y: number; baseY: number; ax: number; series: boolean }
interface ActorNode { person: Person; key: Key; slug: string; works: Work[]; x: number; y: number; baseY: number; r: number }
interface Marker { conn: Connection; work: string; key: Key; x: number; y: number }
interface Label { key: Key; lines: string[]; always: boolean; baseW: number; el: SVGTextElement; station?: Station; actor?: ActorNode }
interface Box { x0: number; y0: number; x1: number; y1: number }
/** A label-placement obstacle: a box (posters, labels) or, for headshots, a circle. */
interface Obstacle { key: Key; box: Box; circle?: { x: number; y: number; r: number } }

/* ---------- Index the model once ---------- */

const stations: Station[] = model.coreWorks
  .filter((w) => LAYOUT.works[w.slug])
  .map((w) => ({ work: w, key: `work:${w.slug}` as Key, series: w.kind === 'series', ...LAYOUT.works[w.slug], baseY: LAYOUT.works[w.slug].y }));
const stationBySlug = new Map(stations.map((s) => [s.work.slug, s]));

/** Recurring actors: acting credits in 2+ core works (model.repertory also counts non-core tiers). */
const actorNodes: ActorNode[] = model.actors
  .map((p) => ({ p, works: actingWorks(p).filter((w) => stationBySlug.has(w.slug)) }))
  .filter(({ p, works }) => works.length >= 2 && LAYOUT.people[p.id])
  .map(({ p, works }) => {
    const slug = model.personSlug.get(p.id) ?? String(p.id);
    return { person: p, key: `person:${slug}` as Key, slug, works, ...LAYOUT.people[p.id], baseY: LAYOUT.people[p.id].y };
  });
const actorBySlug = new Map(actorNodes.map((a) => [a.slug, a]));
const actorsByWork = new Map<string, ActorNode[]>();
for (const a of actorNodes) for (const w of a.works) {
  if (!actorsByWork.has(w.slug)) actorsByWork.set(w.slug, []);
  actorsByWork.get(w.slug)!.push(a);
}


/**
 * Opens a gap below the axis for the props & eggs strip by moving everything on
 * the series side down. Always rederived from layout.json, so nothing leaks between renders.
 */
function applySeriesShift(shift: number): void {
  for (const s of stations) s.y = s.baseY + (s.baseY > 0 ? shift : 0);
  for (const a of actorNodes) a.y = a.baseY + (a.baseY > 0 ? shift : 0);
}

/* ---------- Helpers ---------- */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
/** Does the box touch the obstacle? Circles are tested exactly, so labels can tuck past a headshot's corners. */
function hits(b: Box, o: Obstacle): boolean {
  if (!overlaps(b, o.box)) return false;
  if (!o.circle) return true;
  const { x, y, r } = o.circle;
  const dx = x - clamp(x, b.x0, b.x1), dy = y - clamp(y, b.y0, b.y1);
  return dx * dx + dy * dy < r * r;
}
const overlapArea = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

function splitKey(key: Key): ['person' | 'work' | 'conn', string] {
  const i = key.indexOf(':');
  return [key.slice(0, i) as 'person' | 'work' | 'conn', key.slice(i + 1)];
}

function hrefFor(key: Key): string {
  const [kind, id] = splitKey(key);
  if (kind === 'person') return personHref(actorBySlug.get(id)!.person.id);
  if (kind === 'work') return workHref(id);
  return connectionHref(id);
}

/** Only person/work focus is deep-linkable; anything unknown is ignored. */
function parseFocus(v: string | null): Key | null {
  if (!v) return null;
  const [kind, id] = splitKey(v as Key);
  if (kind === 'person' && actorBySlug.has(id)) return v as Key;
  if (kind === 'work' && stationBySlug.has(id)) return v as Key;
  return null;
}

function centreOf(key: Key): { x: number; y: number } | null {
  const [kind, id] = splitKey(key);
  if (kind === 'person') return actorBySlug.get(id) ?? null;
  if (kind === 'work') return stationBySlug.get(id) ?? null;
  return null;
}

/** Splits a long title into two balanced lines for the map labels. */
function wrapTitle(title: string, max = 17): string[] {
  if (title.length <= max) return [title];
  const words = title.split(' ');
  let best = [title];
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const diff = Math.abs(a.length - b.length);
    if (diff < bestDiff) { bestDiff = diff; best = [a, b]; }
  }
  return best;
}

const initials = (name: string) => name.split(/\s+/).map((s) => s[0]).slice(0, 2).join('');
const platformOf = (w: Work) => model.workMeta.get(w.slug)?.platform ?? w.networks?.[0];

/* ---------- Peek content ---------- */

function personPeek(a: ActorNode): PeekContent {
  const p = a.person;
  let partner: { name: string; n: number } | null = null;
  for (const other of actorNodes) {
    if (other === a) continue;
    const n = sharedWorks(p, other.person).length;
    if (n >= 2 && (!partner || n > partner.n)) partner = { name: other.person.name, n };
  }
  return {
    kind: 'person',
    title: p.name,
    subtitle: `${plural(a.works.length, 'work')}${partner ? ` · most often with ${partner.name}` : ''}`,
    image: p.profileLarge ?? p.profile,
    imageShape: 'circle',
    href: personHref(p.id),
    body: html`${appearsInStrip(a.works.map((w) => w.slug), { compact: true })}
      <h3>Roles</h3>
      <ul class="home-roles">${a.works.map((w) => html`<li><span class="home-roles__who">${roleIn(p, w.slug) || 'Uncredited'}</span> in <a href="${workHref(w.slug)}">${w.title}</a> <span class="num muted">${w.year}</span></li>`)}</ul>`,
  };
}

function workPeek(s: Station): PeekContent {
  const w = s.work;
  const extent = w.kind === 'series' ? (w.episodeCount ? plural(w.episodeCount, 'episode') : 'series') : (w.runtime ? `${w.runtime} min` : 'film');
  const cast = recurringCast(w);
  return {
    kind: 'work',
    title: w.title,
    subtitle: [String(w.year), platformOf(w), extent].filter(Boolean).join(' · '),
    image: w.poster,
    imageShape: 'poster',
    href: workHref(w.slug),
    body: html`<h3>Recurring cast (${cast.length})</h3>
      ${chipList(cast.map((x) => personChip(x.person, { role: x.character })), 'No one from this cast acts in another core work.')}
      ${cast.length ? html`<h3>Where else you've seen them</h3>
      <ul class="home-roles">${cast.map((x) => html`<li><span class="home-roles__who">${x.person.name}</span> ${x.others.map((o, i) => html`${i ? ', ' : ''}<a href="${workHref(o.slug)}">${o.title}</a>`)}</li>`)}</ul>` : ''}`,
  };
}

function connectionPeek(c: Connection): PeekContent {
  const apps = c.appearances.filter((a) => model.workBySlug.has(a.work));
  return {
    kind: kindOf(c.category),
    title: c.title,
    subtitle: `${CATEGORY_LABEL[c.category]} · ${plural(new Set(apps.map((a) => a.work)).size, 'work')} · ${c.confidence}`,
    image: c.image ?? null,
    href: connectionHref(c.id),
    body: html`<p>${c.summary}</p>
      <h3>Where to look</h3>
      <ul class="home-roles">${apps.map((a) => html`<li>${workChip(model.workBySlug.get(a.work)!)}${a.episode ? html` <span class="num muted">${a.episode}</span>` : ''} <span class="muted">${a.note}</span></li>`)}</ul>`,
  };
}

function peekFor(key: Key): PeekContent | null {
  const [kind, id] = splitKey(key);
  if (kind === 'person') { const a = actorBySlug.get(id); return a ? personPeek(a) : null; }
  if (kind === 'work') { const s = stationBySlug.get(id); return s ? workPeek(s) : null; }
  const c = model.connectionById.get(id);
  return c ? connectionPeek(c) : null;
}

/* ---------- Page markup ---------- */

function masthead(): Raw {
  const backdrop = model.workBySlug.get('the-haunting-of-hill-house')?.backdrop;
  const counts = [
    plural(stations.length, 'work'),
    plural(actorNodes.length, 'recurring actor'),
    model.connections.length ? plural(model.connections.length, 'connection') : null,
  ].filter(Boolean).join(' · ');
  const cards: { href: string; title: string; text: string; icon: Raw }[] = [
    { href: '#/grid', title: 'Cast Grid', text: 'Every recurring actor against every work.', icon: glyph('person') },
    { href: '#/connections', title: 'Props & Eggs', text: 'Recurring objects, callbacks and hidden ghosts.', icon: glyph('egg') },
    { href: '#/works', title: 'Works', text: 'The films and series, in release order.', icon: glyph('work') },
  ];
  return html`<header class="home-mast bleed">
    ${backdrop ? html`<div class="bleed__img" style="background-image:url('${backdrop}')"></div>` : ''}
    <div class="home-mast__text">
      <h1 class="home-mast__title">Flanaverse</h1>
      <p class="home-mast__sub">Mike Flanagan's films and series, and the company of actors who keep coming back to haunt them.</p>
      <div class="home-mast__row">
        <p class="home-mast__counts ui num">${counts}</p>
        <button class="btn home-mast__search" type="button"><svg viewBox="0 0 16 16" aria-hidden="true" class="home-mast__lens"><circle cx="7" cy="7" r="4.5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/></svg>Search<kbd>/</kbd></button>
      </div>
    </div>
    <nav class="home-cards" aria-label="Explore">
      ${cards.map((c) => html`<a class="home-card" href="${c.href}"><span class="home-card__title">${c.icon}${c.title}</span><span class="home-card__text">${c.text}</span></a>`)}
    </nav>
  </header>`;
}

function listView(): Raw {
  return html`<details class="home-list">
    <summary class="ui">List view: every work and recurring actor</summary>
    <div class="home-list__cols">
      <section><h2 class="kicker">Works</h2><ul>${stations.slice().sort((a, b) => a.work.releaseDate.localeCompare(b.work.releaseDate)).map((s) => html`<li><a href="${workHref(s.work.slug)}">${s.work.title}</a> <span class="muted num">${s.work.year} · ${s.series ? 'series' : 'film'}</span></li>`)}</ul></section>
      <section><h2 class="kicker">Recurring actors</h2><ul>${actorNodes.map((a) => html`<li><a href="${personHref(a.person.id)}">${a.person.name}</a> <span class="muted num">${plural(a.works.length, 'work')}</span></li>`)}</ul></section>
    </div>
  </details>`;
}

/* ---------- The view ---------- */

export default function render(route: Route, mount: HTMLElement) {
  const objectConnections = model.connections.filter((c) => OBJECT_CATEGORIES.includes(c.category) && c.appearances.some((a) => stationBySlug.has(a.work)));
  const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  mountHtml(mount, html`<div class="home">
    ${masthead()}
    <section class="home-map" aria-label="Timeline map">
      <div class="home-map__bar ui">
        <p class="home-map__hint">Films above the line, series below. ${canHover ? 'Hover an actor to follow their thread; click to preview, click again to open.' : 'Tap an actor to follow their thread; tap again to open.'}</p>
        <div class="home-map__tools">
          <button class="btn home-map__objects" type="button" aria-pressed="false"${objectConnections.length ? '' : ' hidden'}>${glyph('prop')}${glyph('egg')}<span>Show props &amp; eggs</span></button>
          <button class="btn home-map__reset" type="button">Reset view</button>
        </div>
      </div>
      <div class="home-map__frame">
        <svg class="map" role="group" aria-label="Map of Flanagan's works by release date, with the actors who recur across them"></svg>
        <div class="home-map__candle" aria-hidden="true"></div>
        <div class="home-map__tip ui" role="tooltip" hidden></div>
      </div>
      ${listView()}
    </section>
  </div>`);

  mount.querySelector('.home-mast__search')!.addEventListener('click', () => openPalette());

  const frame = mount.querySelector<HTMLElement>('.home-map__frame')!;
  const svgEl = mount.querySelector<SVGSVGElement>('svg.map')!;
  const tip = mount.querySelector<HTMLElement>('.home-map__tip')!;
  const objectsBtn = mount.querySelector<HTMLButtonElement>('.home-map__objects')!;
  const resetBtn = mount.querySelector<HTMLButtonElement>('.home-map__reset')!;

  /* State */
  let selected: Key | null = parseFocus(route.query.get('focus'));
  let hovered: Key | null = null;
  let peeked: Key | null = null;
  let showObjects = route.query.get('objects') === '1' && objectConnections.length > 0;
  let userMoved = false;
  let labelScale = 1;

  const syncQuery = () => setQuery({
    focus: selected && !selected.startsWith('conn:') ? selected : undefined,
    objects: showObjects ? '1' : undefined,
  });

  /* Props & eggs: a small grid of markers just below the axis under each work they appear in */
  const MARKER_COLS = 6, MARKER_STEP = 8, MARKER_TOP = 10;
  const markers: Marker[] = [];
  let markerRows = 0;
  for (const st of stations) {
    const conns = objectConnections
      .filter((c) => c.appearances.some((a) => a.work === st.work.slug))
      .sort((a, b) => kindOf(b.category).localeCompare(kindOf(a.category)) || a.title.localeCompare(b.title)); // diamonds, then stars
    markerRows = Math.max(markerRows, Math.ceil(conns.length / MARKER_COLS));
    conns.forEach((c, i) => {
      const row = Math.floor(i / MARKER_COLS), col = i % MARKER_COLS;
      const inRow = Math.min(MARKER_COLS, conns.length - row * MARKER_COLS);
      markers.push({ conn: c, work: st.work.slug, key: `conn:${c.id}`, x: st.x + (col - (inRow - 1) / 2) * MARKER_STEP, y: MARKER_TOP + row * MARKER_STEP });
    });
  }
  /** How far the series side moves down while the strip is showing. */
  const markerShift = Math.max(0, MARKER_TOP + (markerRows - 1) * MARKER_STEP + 10 - SERIES_GAP);
  applySeriesShift(showObjects ? markerShift : 0);

  /* World bounds (room reserved for the shifted series side, so toggling never refits) */
  const actorYs = actorNodes.flatMap((a) => [a.baseY - a.r, a.baseY + a.r]);
  const bounds = {
    x0: Math.min(-PW / 2, ...stations.map((s) => s.x - PW / 2)) - 24,
    x1: Math.max(W + PW / 2, ...stations.map((s) => s.x + PW / 2)) + 24,
    y0: Math.min(-(FILM_GAP + PH + 40), ...actorYs) - 44,
    y1: Math.max(SERIES_GAP + PH + 40, ...actorYs) + 30 + markerShift,
  };

  /* SVG scaffold, back to front */
  const svg = select(svgEl);
  svg.append('defs').append('clipPath').attr('id', 'home-clip-circle').attr('clipPathUnits', 'objectBoundingBox')
    .append('circle').attr('cx', 0.5).attr('cy', 0.5).attr('r', 0.5);
  const world = svg.append('g').attr('class', 'map__world');
  const gEras = world.append('g').attr('class', 'map__eras');
  const gAxis = world.append('g').attr('class', 'map__axis');
  const gEdges = world.append('g').attr('class', 'map__edges');
  const gThread = world.append('g').attr('class', 'map__thread');
  const gStems = world.append('g').attr('class', 'map__stems');
  const gWorks = world.append('g').attr('class', 'map__works');
  const gMarkers = world.append('g').attr('class', 'map__markers');
  const gPeople = world.append('g').attr('class', 'map__people');
  const gLabels = world.append('g').attr('class', 'map__labels').attr('aria-hidden', 'true');

  /* Era bands */
  ERAS.filter((e) => e.to >= AXIS_FROM && e.from <= AXIS_TO).forEach((e, i) => {
    const x0 = xOfYear(Math.max(e.from, AXIS_FROM), W);
    const left = i === 0 ? bounds.x0 - BLEED : x0;
    const right = e.to + 1 >= AXIS_TO ? bounds.x1 + BLEED : xOfYear(e.to + 1, W);
    // Bands run far past the map so panning never shows their ends.
    gEras.append('rect').attr('class', `map-era map-era--${i % 2 ? 'b' : 'a'}`)
      .attr('x', left).attr('y', bounds.y0 - BLEED).attr('width', right - left).attr('height', bounds.y1 - bounds.y0 + 2 * BLEED);
    gEras.append('text').attr('class', 'map-era__name').attr('x', x0 + 8).attr('y', bounds.y0 + 8).text(e.name);
  });

  /* Axis, ticks and year labels */
  gAxis.append('line').attr('class', 'map-axis').attr('x1', bounds.x0 - BLEED).attr('x2', bounds.x1 + BLEED).attr('y1', 0).attr('y2', 0);
  for (let y = AXIS_FROM; y <= AXIS_TO; y++) {
    const x = xOfYear(y, W);
    gAxis.append('line').attr('class', 'map-tick').attr('x1', x).attr('x2', x).attr('y1', -4).attr('y2', 4);
    gAxis.append('text').attr('class', 'map-year').attr('x', x + 3).attr('y', -4).text(y);
  }

  /* Edges: each actor to each of their works */
  const edgeData = actorNodes.flatMap((a) => a.works.map((w) => ({ a, s: stationBySlug.get(w.slug)! })));
  const edges = gEdges.selectAll('line').data(edgeData).join('line')
    .attr('class', 'map-edge');

  const thread = gThread.append('path').attr('class', 'map-threadline');
  const threadPath = line<Station>().x((s) => s.x).y((s) => s.y).curve(curveMonotoneX);

  /* Stems: the true release date on the axis, up/down to the (possibly nudged) poster */
  const stems = gStems.selectAll('g').data(stations).join('g').attr('class', 'map-stem');
  const stemLines = stems.append('line').attr('x1', (s) => s.ax).attr('y1', 0).attr('x2', (s) => s.x);
  stems.append('circle').attr('cx', (s) => s.ax).attr('cy', 0).attr('r', 2.5);

  /* Work stations: small brass-framed posters */
  const workNodes = gWorks.selectAll<SVGGElement, Station>('g').data(stations).join('g')
    .attr('class', 'map-node map-node--work')
    .attr('tabindex', 0).attr('role', 'button')
    .attr('aria-label', (s) => `${s.work.title}, ${s.work.year} ${s.series ? 'series' : 'film'}, ${plural(actorsByWork.get(s.work.slug)?.length ?? 0, 'recurring actor')}`);
  workNodes.append('rect').attr('class', 'map-poster__bg').attr('x', -PW / 2).attr('y', -PH / 2).attr('width', PW).attr('height', PH);
  workNodes.filter((s) => !!s.work.poster).append('image')
    .attr('href', (s) => s.work.poster!).attr('x', -PW / 2).attr('y', -PH / 2).attr('width', PW).attr('height', PH)
    .attr('preserveAspectRatio', 'xMidYMid slice');
  workNodes.append('rect').attr('class', 'map-ring').attr('x', -PW / 2).attr('y', -PH / 2).attr('width', PW).attr('height', PH);

  /* Actor nodes: circular headshots */
  const personNodes = gPeople.selectAll<SVGGElement, ActorNode>('g').data(actorNodes).join('g')
    .attr('class', 'map-node map-node--person')
    .attr('tabindex', 0).attr('role', 'button')
    .attr('aria-label', (a) => `${a.person.name}, ${plural(a.works.length, 'work')}`);
  personNodes.append('circle').attr('class', 'map-person__bg').attr('r', (a) => a.r);
  personNodes.filter((a) => !!a.person.profile).append('image')
    .attr('href', (a) => a.person.profile!).attr('x', (a) => -a.r).attr('y', (a) => -a.r)
    .attr('width', (a) => a.r * 2).attr('height', (a) => a.r * 2)
    .attr('clip-path', 'url(#home-clip-circle)').attr('preserveAspectRatio', 'xMidYMin slice');
  personNodes.filter((a) => !a.person.profile).append('text').attr('class', 'map-initials')
    .attr('text-anchor', 'middle').attr('dy', '0.35em').style('font-size', (a) => `${a.r * 0.8}px`).text((a) => initials(a.person.name));
  personNodes.append('circle').attr('class', 'map-ring').attr('r', (a) => a.r);

  /** Writes the current station/actor positions into the SVG (they move when the objects strip opens). */
  function positionNodes(): void {
    workNodes.attr('transform', (s) => `translate(${s.x},${s.y})`);
    personNodes.attr('transform', (a) => `translate(${a.x},${a.y})`);
    edges.attr('x1', (d) => d.a.x).attr('y1', (d) => d.a.y).attr('x2', (d) => d.s.x).attr('y2', (d) => d.s.y);
    stemLines.attr('y2', (s) => (s.series ? s.y - PH / 2 : -FILM_GAP));
  }
  positionNodes();

  /* Labels; positions come from placeLabels() */
  const labelSpecs: Omit<Label, 'baseW' | 'el'>[] = [
    ...stations.map((s) => ({ key: s.key, lines: wrapTitle(s.work.title), always: true, station: s })),
    ...actorNodes.map((a) => ({ key: a.key, lines: [a.person.name], always: a.works.length >= LABELLED_MIN_WORKS, actor: a })),
  ];
  const labels: Label[] = labelSpecs.map((l) => {
    const el = document.createElementNS(SVG_NS, 'text');
    el.setAttribute('class', `map-label map-label--${l.station ? 'work' : 'person'}${l.always ? '' : ' map-label--hover'}`);
    l.lines.forEach((s, i) => {
      const ts = document.createElementNS(SVG_NS, 'tspan');
      ts.setAttribute('x', '0');
      ts.setAttribute('dy', i === 0 ? '0.85em' : '1.15em');
      ts.textContent = s;
      el.appendChild(ts);
    });
    gLabels.node()!.appendChild(el);
    return { ...l, baseW: 0, el };
  });
  /** What applyLight last lit, so label placement can give lit names first claim on space. */
  let litKeys = new Set<Key>();
  let activeKey: Key | null = null;

  function measureLabels(): void {
    for (const l of labels) {
      let w = 0;
      l.el.querySelectorAll('tspan').forEach((ts) => { w = Math.max(w, ts.getComputedTextLength()); });
      l.baseW = w / labelScale;
    }
  }

  /**
   * Collision-aware placement against posters, headshots and earlier labels.
   * Order: work titles (stable), then lit actors, then the always-on actors, each by works count.
   */
  function placeLabels(): void {
    const s = labelScale, pad = 1.5 * s, gap = 2 * s, lh = LINE_H * s;
    const obstacles: Obstacle[] = [
      ...stations.map((st) => ({ key: st.key, box: { x0: st.x - PW / 2, x1: st.x + PW / 2, y0: st.y - PH / 2, y1: st.y + PH / 2 } })),
      ...actorNodes.map((a) => ({ key: a.key, box: { x0: a.x - a.r, x1: a.x + a.r, y0: a.y - a.r, y1: a.y + a.r }, circle: a })),
    ];
    const free = (b: Box, own: Key) => obstacles.every((o) => o.key === own || !hits(b, o));
    const crowding = (b: Box, own: Key) => obstacles.reduce((t, o) => (o.key === own ? t : t + overlapArea(b, o.box)), 0);
    const leastCrowded = (cs: Box[], own: Key) => cs.reduce((best, c) => (crowding(c, own) < crowding(best, own) ? c : best));
    const rank = (l: Label) => (l.station ? 0 : litKeys.has(l.key) ? 1 : 2);
    const visible = labels
      .filter((l) => l.always || litKeys.has(l.key))
      .sort((a, b) => rank(a) - rank(b) || (b.actor?.works.length ?? 0) - (a.actor?.works.length ?? 0));
    for (const l of visible) {
      const w = l.baseW * s, h = l.lines.length * lh;
      const at = (cx: number, top: number): Box => ({ x0: cx - w / 2 - pad, x1: cx + w / 2 + pad, y0: top - pad, y1: top + h + pad });
      let candidates: Box[];
      if (l.station) {
        // Away from the axis (above films, below series), stepping outwards a line at a time.
        // Each row tries centred, then flush with the poster's left edge, then its right edge.
        const st = l.station;
        const shift = Math.max(0, w / 2 - PW / 2);
        candidates = [0, 1, 2].flatMap((row) => {
          const top = st.series ? st.y + PH / 2 + gap + row * lh : st.y - PH / 2 - gap - h - row * lh;
          return [at(st.x, top), at(st.x + shift, top), at(st.x - shift, top)];
        });
      } else {
        // Below; if that collides, above; then right, left, and the four diagonals.
        const a = l.actor!;
        const side = a.r + gap + w / 2 + pad;
        const diag = a.r * 0.7 + gap;
        candidates = [
          at(a.x, a.y + a.r + gap),
          at(a.x, a.y - a.r - gap - h),
          at(a.x + side, a.y - h / 2),
          at(a.x - side, a.y - h / 2),
          at(a.x + diag + w / 2, a.y + diag),
          at(a.x - diag - w / 2, a.y + diag),
          at(a.x + diag + w / 2, a.y - diag - h),
          at(a.x - diag - w / 2, a.y - diag - h),
        ];
      }
      const spot = candidates.find((b) => free(b, l.key));
      const box = spot ?? leastCrowded(candidates, l.key);
      l.el.setAttribute('transform', `translate(${(box.x0 + box.x1) / 2},${box.y0 + pad})`);
      // An actor label with no clear spot waits for its own hover instead of overprinting.
      const crowded = !spot && !!l.actor && l.key !== activeKey;
      l.el.classList.toggle('is-crowded', crowded);
      if (!crowded) obstacles.push({ key: l.key, box });
    }
  }

  const DIAMOND = 'M0,-3.8L3.8,0L0,3.8L-3.8,0Z';
  const STAR = 'M0,-4.4L1.1,-1.5L4.2,-1.4L1.8,0.6L2.6,3.6L0,1.9L-2.6,3.6L-1.8,0.6L-4.2,-1.4L-1.1,-1.5Z';
  const markerNodes = gMarkers.selectAll<SVGGElement, Marker>('g').data(markers).join('g')
    .attr('class', (m) => `map-node map-marker map-marker--${kindOf(m.conn.category)}`)
    .attr('transform', (m) => `translate(${m.x},${m.y})`)
    .attr('tabindex', 0).attr('role', 'button')
    .attr('aria-label', (m) => `${CATEGORY_LABEL[m.conn.category]}: ${m.conn.title}`);
  markerNodes.append('circle').attr('class', 'map-marker__hit').attr('r', MARKER_STEP / 2);
  markerNodes.append('path').attr('d', (m) => (kindOf(m.conn.category) === 'prop' ? DIAMOND : STAR)).attr('transform', 'scale(0.75)');

  function renderObjects(): void {
    gMarkers.attr('display', showObjects ? null : 'none');
    objectsBtn.setAttribute('aria-pressed', String(showObjects));
    objectsBtn.querySelector('span')!.textContent = showObjects ? 'Hide props & eggs' : 'Show props & eggs';
  }
  renderObjects();

  /* ---------- Lighting ---------- */

  function applyLight(): void {
    const key = hovered ?? selected;
    svgEl.classList.toggle('has-focus', !!key);
    const lit = new Set<Key>();
    const litEdges = new Set<string>(); // `${personSlug}|${workSlug}`
    let threadFor: ActorNode | undefined;
    if (key) {
      lit.add(key);
      const [kind, id] = splitKey(key);
      if (kind === 'person') {
        threadFor = actorBySlug.get(id);
        for (const w of threadFor?.works ?? []) { lit.add(`work:${w.slug}`); litEdges.add(`${id}|${w.slug}`); }
      } else if (kind === 'work') {
        for (const a of actorsByWork.get(id) ?? []) { lit.add(a.key); litEdges.add(`${a.slug}|${id}`); }
      } else {
        for (const app of model.connectionById.get(id)?.appearances ?? []) lit.add(`work:${app.work}`);
      }
    }
    workNodes.classed('is-lit', (s) => lit.has(s.key)).classed('is-selected', (s) => s.key === selected);
    personNodes.classed('is-lit', (a) => lit.has(a.key)).classed('is-selected', (a) => a.key === selected);
    markerNodes.classed('is-lit', (m) => lit.has(m.key) || key === `work:${m.work}`);
    stems.classed('is-lit', (s) => lit.has(s.key));
    edges.classed('is-lit', (d) => litEdges.has(`${d.a.slug}|${d.s.work.slug}`));
    for (const l of labels) l.el.classList.toggle('is-lit', lit.has(l.key));
    litKeys = lit;
    activeKey = key;
    placeLabels();
    personNodes.filter((a) => lit.has(a.key)).raise(); // lit headshots above their neighbours
    if (threadFor) {
      const pts = threadFor.works.map((w) => stationBySlug.get(w.slug)!).sort((p, q) => p.x - q.x);
      thread.attr('d', threadPath(pts)).attr('visibility', null);
    } else {
      thread.attr('d', null).attr('visibility', 'hidden');
    }
  }

  function hover(key: Key | null): void {
    if (hovered === key) return;
    hovered = key;
    applyLight();
  }

  /** First click/tap selects and peeks; a second on the same node opens its page. */
  function activate(key: Key): void {
    if (peeked === key && isPeekOpen()) { location.hash = hrefFor(key); return; }
    const content = peekFor(key);
    if (!content) return;
    selected = key;
    peeked = key;
    openPeek(content);
    syncQuery();
    applyLight();
    keepClearOfSheet(key);
  }

  /**
   * On small screens the peek is a bottom sheet over the lower 60% of the
   * viewport; bring the frame to the top and pan the selected node above the
   * sheet so the second tap can reach it.
   */
  function keepClearOfSheet(key: Key): void {
    const sheet = document.querySelector<HTMLElement>('.peek');
    const node = nodeElement(key);
    if (!sheet || !node || !matchMedia('(max-width: 767.98px)').matches) return;
    const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 56;
    const bottom = innerHeight - sheet.offsetHeight;
    const centreY = () => { const b = node.getBoundingClientRect(); return b.top + b.height / 2; };
    if (centreY() > top + 24 && centreY() < bottom - 24) return;
    window.scrollBy({ top: frame.getBoundingClientRect().top - top, behavior: 'instant' });
    const k = zoomTransform(svgEl).k;
    svg.call(zoomer.translateBy, 0, ((top + bottom) / 2 - centreY()) / k);
  }

  function nodeElement(key: Key): SVGGElement | null {
    return workNodes.filter((s) => s.key === key).node() ?? personNodes.filter((a) => a.key === key).node() ?? markerNodes.filter((m) => m.key === key).node();
  }

  const offPeekClose = onPeekClose(() => {
    const opener = peeked && nodeElement(peeked);
    peeked = null;
    selected = null;
    hovered = null;
    syncQuery();
    applyLight();
    // peek.ts only restores focus to HTML elements; return it to the SVG node that opened the panel.
    const active = document.activeElement;
    if (opener && (!active || active === document.body || active.closest('.peek'))) opener.focus({ preventScroll: true });
  });

  function showTip(m: Marker, e: PointerEvent | null): void {
    const c = m.conn;
    mountHtml(tip, html`<span class="home-map__tip-kind">${glyph(kindOf(c.category))} ${CATEGORY_LABEL[c.category]}</span><strong>${c.title}</strong><span>${c.summary}</span>`);
    tip.hidden = false;
    const r = frame.getBoundingClientRect();
    let px: number, py: number;
    if (e) { px = e.clientX; py = e.clientY; } else {
      const b = markerNodes.filter((d) => d === m).node()!.getBoundingClientRect();
      px = b.x + b.width / 2; py = b.bottom;
    }
    tip.style.transform = `translate(${clamp(px - r.left + 12, 8, r.width - tip.offsetWidth - 8)}px, ${clamp(py - r.top + 14, 8, r.height - tip.offsetHeight - 8)}px)`;
  }
  const hideTip = () => { tip.hidden = true; };

  /** Pointer + keyboard wiring shared by every kind of node. Hover is mouse-only. */
  function wire<D>(sel: Selection<SVGGElement, D, SVGGElement, unknown>, keyOf: (d: D) => Key, onHover?: (d: D, e: PointerEvent | null) => void): void {
    sel
      .on('pointerenter', (e: PointerEvent, d) => { if (e.pointerType === 'mouse') { hover(keyOf(d)); onHover?.(d, e); } })
      .on('pointerleave', (e: PointerEvent) => { if (e.pointerType === 'mouse') { hover(null); hideTip(); } })
      .on('click', (e: MouseEvent, d) => { e.stopPropagation(); hideTip(); activate(keyOf(d)); })
      .on('keydown', (e: KeyboardEvent, d) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(keyOf(d)); } })
      .on('focus', function (this: SVGGElement, _e: FocusEvent, d) { if (this.matches(':focus-visible')) { hover(keyOf(d)); onHover?.(d, null); } })
      .on('blur', () => { hover(null); hideTip(); });
  }
  wire(workNodes, (s) => s.key);
  wire(personNodes, (a) => a.key);
  wire(markerNodes, (m) => m.key, showTip);

  objectsBtn.addEventListener('click', () => {
    showObjects = !showObjects;
    applySeriesShift(showObjects ? markerShift : 0);
    positionNodes();
    renderObjects();
    applyLight(); // also re-places labels around the moved nodes
    syncQuery();
  });

  /* ---------- Pan and zoom ---------- */

  /** Fits the whole map; on small screens zooms in to a readable scale centred on the focus or the Netflix years. */
  function fitTransform(): ZoomTransform {
    const w = svgEl.clientWidth, h = svgEl.clientHeight;
    const bw = bounds.x1 - bounds.x0, bh = bounds.y1 - bounds.y0;
    const fit = Math.min(w / bw, h / bh);
    if (w >= 768 || fit >= 0.6) {
      return zoomIdentity.translate((w - bw * fit) / 2 - bounds.x0 * fit, (h - bh * fit) / 2 - bounds.y0 * fit).scale(fit);
    }
    const k = clamp(h / bh, fit, 0.7);
    const cx = (selected && centreOf(selected)?.x) || xOfYear(2020.5, W);
    const tx = clamp(w / 2 - cx * k, w - bounds.x1 * k, -bounds.x0 * k);
    return zoomIdentity.translate(tx, (h - bh * k) / 2 - bounds.y0 * k).scale(k);
  }

  /** Labels shrink more slowly than the map when zooming out and grow more slowly when zooming in. */
  const labelScaleFor = (k: number) => clamp(k ** -0.75, 0.5, 2.4);
  let labelFrame = 0;
  function onZoomScale(k: number): void {
    const next = labelScaleFor(k);
    if (Math.abs(next - labelScale) / labelScale < 0.04) return;
    cancelAnimationFrame(labelFrame);
    labelFrame = requestAnimationFrame(() => {
      labelScale = next;
      svgEl.style.setProperty('--ls', String(labelScale));
      placeLabels();
    });
  }

  const zoomer = zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.25, 4])
    .on('zoom', (e: { transform: ZoomTransform; sourceEvent: Event | null }) => {
      world.attr('transform', e.transform.toString());
      if (e.sourceEvent) userMoved = true;
      onZoomScale(e.transform.k);
    });
  svg.call(zoomer).on('dblclick.zoom', null); // a second click/tap opens the page instead

  resetBtn.addEventListener('click', () => {
    userMoved = false;
    svg.call(zoomer.transform, fitTransform());
  });

  // Refit when the frame changes size (window resize, peek drawer opening) unless the reader has panned.
  const ro = new ResizeObserver(() => { if (!userMoved) svg.call(zoomer.transform, fitTransform()); });
  ro.observe(svgEl);

  /* ---------- Candle-light pool following the pointer ---------- */

  let candleFrame = 0;
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    cancelAnimationFrame(candleFrame);
    candleFrame = requestAnimationFrame(() => {
      const r = frame.getBoundingClientRect();
      frame.style.setProperty('--mx', `${e.clientX - r.left}px`);
      frame.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  };
  if (canHover && !reducedMotion) {
    frame.classList.add('has-candle');
    frame.addEventListener('pointermove', onPointerMove);
  }

  /* ---------- First paint ---------- */

  const t0 = fitTransform();
  labelScale = labelScaleFor(t0.k);
  svgEl.style.setProperty('--ls', String(labelScale));
  svg.call(zoomer.transform, t0);
  measureLabels();
  applyLight(); // also places labels
  // Widths change once the condensed UI font has loaded.
  void document.fonts.ready.then(() => { if (svgEl.isConnected) { measureLabels(); placeLabels(); } });

  return () => {
    offPeekClose();
    ro.disconnect();
    cancelAnimationFrame(labelFrame);
    cancelAnimationFrame(candleFrame);
    frame.removeEventListener('pointermove', onPointerMove);
    svg.on('.zoom', null);
  };
}
