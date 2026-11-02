/**
 * Timeline (#/timeline): the core works on a 2011–2027 date axis with era bands
 * and an arc diagram. An arc joins two works that share actors; its width is the
 * number of shared actors. Below it, the works grouped by era with simple stats.
 * Deep link: #/timeline?focus=<work-slug> lights that station's arcs.
 */
import { select, scaleLinear, type Selection } from 'd3';
import type { Route } from '../lib/router';
import { setQuery } from '../lib/router';
import { html, mountHtml, plural, type Raw } from '../lib/html';
import { model, ERAS, eraFor, workHref, actingWorks, roleIn, type Edge, type Era } from '../data/model';
import type { Work, Person } from '../data/types';
import { personChip, posterCard, workChip, chipList } from '../components/chips';
import { openPeek, onPeekClose } from '../components/peek';
import { AXIS_FROM, AXIS_TO, yearOf } from '../components/strip';
import '../styles/timeline.css';

interface Pair { edge: Edge; a: Work; b: Work; actors: Person[] }
interface Station { work: Work; x: number; trueX: number; row: number }

const SHORT: Record<string, string> = {
  'ouija-origin-of-evil': 'Ouija',
  'the-haunting-of-hill-house': 'Hill House',
  'the-haunting-of-bly-manor': 'Bly Manor',
  'the-fall-of-the-house-of-usher': 'Usher',
};
const shortTitle = (w: Work) => SHORT[w.slug] ?? w.title.replace(/^The /, '');

const MIN_W = 960;          // below this the figure scrolls sideways
const POSTER_W = 34, POSTER_H = 51;
const GAP = 12;             // minimum gap between neighbouring posters
const ARC_MAX_H = 230;
const TOP = 46;             // era names + year ruler
const MARGIN_X = 28;
const TIP_NAMES = 12;

/** Core-work pairs that share at least one actor, heaviest first. */
function corePairs(): Pair[] {
  const core = new Set(model.coreWorks.map((w) => w.slug));
  return model.edges
    .filter((e) => e.actors.length > 0 && core.has(e.source) && core.has(e.target))
    .map((edge) => ({
      edge,
      a: model.workBySlug.get(edge.source)!,
      b: model.workBySlug.get(edge.target)!,
      actors: edge.actors.map((id) => model.people.get(id)!).filter(Boolean)
        .sort((x, y) => actingWorks(y).length - actingWorks(x).length || x.name.localeCompare(y.name)),
    }))
    .sort((p, q) => q.actors.length - p.actors.length);
}

/**
 * Spread posters that would overlap (Hush and Before I Wake are a month apart)
 * while keeping each cluster centred on its true dates.
 */
function dodge(xs: number[], spacing: number): number[] {
  const clusters: { start: number; xs: number[] }[] = [];
  for (const x of xs) {
    clusters.push({ start: x, xs: [x] });
    // Merge backwards while the newest cluster overlaps its predecessor.
    while (clusters.length > 1) {
      const c = clusters[clusters.length - 1], p = clusters[clusters.length - 2];
      if (p.start + p.xs.length * spacing <= c.start) break;
      const merged = [...p.xs, ...c.xs];
      const mean = merged.reduce((s, v) => s + v, 0) / merged.length;
      clusters.splice(-2, 2, { start: mean - ((merged.length - 1) * spacing) / 2, xs: merged });
    }
  }
  return clusters.flatMap((c) => c.xs.map((_, i) => c.start + i * spacing));
}

function namesLine(actors: Person[]): string {
  const shown = actors.slice(0, TIP_NAMES).map((p) => p.name).join(', ');
  return actors.length > TIP_NAMES ? `${shown} +${actors.length - TIP_NAMES}` : shown;
}

const connectHref = (a: string, b: string) => `#/connect/${a}/${b}`;

function peekPair(p: Pair): void {
  openPeek({
    kind: 'work',
    title: `${p.a.title} ↔ ${p.b.title}`,
    subtitle: `${plural(p.actors.length, 'shared actor')} · ${p.a.year} and ${p.b.year}`,
    image: p.b.poster,
    imageShape: 'poster',
    href: connectHref(p.a.slug, p.b.slug),
    body: html`
      <h3>In both</h3>
      ${chipList(p.actors.map((x) => personChip(x, { role: `${roleIn(x, p.a.slug)} / ${roleIn(x, p.b.slug)}` })))}
      <p class="tl-peek-link"><a href="${connectHref(p.a.slug, p.b.slug)}">How these two connect →</a></p>`,
  });
}

function peekStation(w: Work, pairs: Pair[]): void {
  const mine = pairs.filter((p) => p.a === w || p.b === w);
  const others = mine.map((p) => ({ other: p.a === w ? p.b : p.a, n: p.actors.length }));
  openPeek({
    kind: 'work',
    title: w.title,
    subtitle: `${w.year} · ${w.kind === 'series' ? `${w.episodeCount ?? '?'} episodes` : 'film'} · shares cast with ${plural(others.length, 'work')}`,
    image: w.poster,
    imageShape: 'poster',
    href: workHref(w.slug),
    body: html`
      <h3>Shares cast with</h3>
      <ul class="tl-peek-pairs">${others.map((o) => html`<li>${workChip(o.other, { year: true })}<a class="num" href="${connectHref(w.slug, o.other.slug)}">${plural(o.n, 'actor')}</a></li>`)}</ul>`,
  });
}

function eraStats(era: Era): { works: Work[]; also: Work[]; episodes: number; debuts: Person[] } {
  const inEra = (w: Work) => eraFor(w.year).id === era.id;
  const works = model.coreWorks.filter(inEra);
  const also = model.works.filter((w) => w.tier !== 'core' && inEra(w));
  const episodes = works.reduce((n, w) => n + (w.kind === 'series' ? w.episodeCount ?? 0 : 0), 0);
  const debuts = model.repertory.filter((p) => {
    const ws = actingWorks(p);
    return ws.length >= 2 && eraFor(ws[0].year).id === era.id;
  });
  return { works, also, episodes, debuts };
}

const TIER_NOTE: Record<string, string> = { early: 'early work', written: 'written by Flanagan', upcoming: 'upcoming' };

function renderEras(): Raw {
  return html`${ERAS.map((era) => {
    const s = eraStats(era);
    if (!s.works.length && !s.also.length) return '';
    const years = `${era.from}–${era.to >= 2030 ? '' : era.to}`;
    const stats = [
      s.works.length ? plural(s.works.length, 'core work') : '',
      s.episodes ? `${s.episodes} series episodes` : '',
      s.debuts.length ? `${plural(s.debuts.length, 'recurring actor')} first appeared` : '',
    ].filter(Boolean);
    return html`<section class="tl-era" id="era-${era.id}">
      <div class="tl-era__head">
        <h3>${era.name}</h3>
        <span class="tl-era__years num">${years}</span>
      </div>
      <p class="tl-era__blurb">${era.blurb}</p>
      ${stats.length ? html`<p class="tl-era__stats num">${stats.join(' · ')}</p>` : ''}
      ${s.works.length ? html`<div class="tl-era__works">${s.works.map((w) => posterCard(w, { size: 'sm' }))}</div>` : ''}
      ${s.also.length ? html`<p class="tl-also"><span class="kicker">Also</span> ${s.also.map((w, i) => html`${i ? ' · ' : ''}<a href="${workHref(w.slug)}">${w.title}</a> <span class="num">${w.year}</span>, ${TIER_NOTE[w.tier] ?? w.tier}`)}</p>` : ''}
    </section>`;
  })}`;
}

function widthLegend(max: number, stroke: (n: number) => number): Raw {
  const steps = [1, Math.round(max / 2), max];
  return html`<ul class="tl-legend" aria-label="Arc width legend">${steps.map((n) => html`<li><svg width="36" height="14" aria-hidden="true"><line x1="2" x2="34" y1="7" y2="7" stroke-width="${stroke(n)}"/></svg>${plural(n, 'shared actor')}</li>`)}</ul>`;
}

export default function render(route: Route, mount: HTMLElement) {
  const pairs = corePairs();
  const maxActors = Math.max(1, ...pairs.map((p) => p.actors.length));
  const stroke = scaleLinear().domain([1, maxActors]).range([1, 10]);
  let focus = model.workBySlug.has(route.query.get('focus') ?? '') ? route.query.get('focus')! : null;
  let selectedPair: Pair | null = null;

  mountHtml(mount, html`<div class="page tl-page">
    <header class="tl-head">
      <p class="kicker">Timeline</p>
      <h1>Who carried over, and when</h1>
      <p class="muted tl-lede">Each arc joins two works that share actors. The thicker the arc, the more of them. Hover or tap an arc for the names; tap a poster to light all of its arcs.</p>
    </header>
    <div class="tl-figure-head">
      ${widthLegend(maxActors, (n) => stroke(n))}
      <p class="tl-hint muted">Scroll sideways for the full timeline →</p>
    </div>
    <figure class="tl-figure">
      <div class="tl-scroll"><div class="tl-canvas"></div></div>
      <div class="tl-tip" role="tooltip" hidden></div>
      <figcaption>
        <details class="tl-list">
          <summary>All ${pairs.length} pairs as a list</summary>
          <ol>${pairs.map((p, i) => html`<li><button type="button" class="tl-list__pair" data-pair="${i}">${p.a.title} ↔ ${p.b.title}</button> <span class="num muted">${plural(p.actors.length, 'shared actor')}</span></li>`)}</ol>
        </details>
      </figcaption>
    </figure>
    <section class="section tl-eras" aria-labelledby="tl-eras-h">
      <div class="section__head"><h2 id="tl-eras-h">By era</h2></div>
      ${renderEras()}
    </section>
  </div>`);

  const canvas = mount.querySelector<HTMLElement>('.tl-canvas')!;
  const scroller = mount.querySelector<HTMLElement>('.tl-scroll')!;
  const figure = mount.querySelector<HTMLElement>('.tl-figure')!;
  const tip = mount.querySelector<HTMLElement>('.tl-tip')!;
  let svg: Selection<SVGSVGElement, unknown, null, undefined> | null = null;
  let stations: Station[] = [];

  /** Lit state: a hovered/selected pair, else a hovered/focused station. */
  function light(state: { pair?: Pair | null; slug?: string | null }): void {
    if (!svg) return;
    const slug = state.pair ? null : state.slug ?? null;
    const lit = (p: Pair) => (state.pair ? p === state.pair : !!slug && (p.a.slug === slug || p.b.slug === slug));
    const litWorks = new Set<string>();
    pairs.forEach((p) => { if (lit(p)) { litWorks.add(p.a.slug); litWorks.add(p.b.slug); } });
    if (slug) litWorks.add(slug);
    const any = !!state.pair || !!slug;
    svg.classed('has-lit', any);
    svg.selectAll<SVGPathElement, Pair>('.tl-arc').classed('is-lit', (p) => lit(p));
    svg.selectAll<SVGGElement, Station>('.tl-station').classed('is-lit', (s) => litWorks.has(s.work.slug)).classed('is-focus', (s) => s.work.slug === slug);
  }
  const rest = () => light(selectedPair ? { pair: selectedPair } : { slug: focus });

  function showTip(p: Pair, ev: MouseEvent | null): void {
    mountHtml(tip, html`<strong>${p.a.title} ↔ ${p.b.title}</strong><span class="tl-tip__n num">${plural(p.actors.length, 'shared actor')}</span><span class="tl-tip__names">${namesLine(p.actors)}</span>`);
    tip.hidden = false;
    const box = figure.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const px = ev ? ev.clientX : box.left + box.width / 2;
    const py = ev ? ev.clientY : box.top + 80;
    tip.style.left = `${Math.min(Math.max(0, px - box.left - t.width / 2), box.width - t.width)}px`;
    tip.style.top = `${Math.max(0, py - box.top - t.height - 16)}px`;
  }
  const hideTip = () => { tip.hidden = true; };

  function draw(): void {
    const W = Math.max(MIN_W, Math.round(scroller.clientWidth));
    const x = scaleLinear().domain([AXIS_FROM, AXIS_TO]).range([MARGIN_X, W - MARGIN_X]);
    const works = model.coreWorks;
    const trueXs = works.map((w) => x(yearOf(w.releaseDate)));
    const xs = dodge(trueXs, POSTER_W + GAP);
    stations = works.map((work, i) => ({ work, x: xs[i], trueX: trueXs[i], row: i % 2 }));
    const at = new Map(stations.map((s) => [s.work.slug, s]));
    const maxSpanH = Math.min(ARC_MAX_H, Math.max(...pairs.map((p) => Math.abs(at.get(p.b.slug)!.x - at.get(p.a.slug)!.x) / 2)));
    const baseY = TOP + maxSpanH + 14;
    const posterY = baseY + 12;
    const labelY = posterY + POSTER_H + 16;
    const H = labelY + 34;

    canvas.replaceChildren();
    svg = select(canvas).append('svg')
      .attr('class', 'tl-svg')
      .attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
      .attr('role', 'img')
      .attr('aria-label', `Arc diagram of ${works.length} works from ${AXIS_FROM} to ${AXIS_TO}; ${pairs.length} pairs share actors. A list follows.`);

    // Era bands and names
    const eras = ERAS.filter((e) => e.to >= AXIS_FROM);
    const bands = svg.append('g').attr('class', 'tl-eras-g');
    bands.selectAll('rect').data(eras).join('rect')
      .attr('class', (_, i) => `tl-band tl-band--${i % 2}`)
      .attr('x', (e) => x(Math.max(e.from, AXIS_FROM)))
      .attr('width', (e) => x(Math.min(e.to + 1, AXIS_TO)) - x(Math.max(e.from, AXIS_FROM)))
      .attr('y', 0).attr('height', H);
    bands.selectAll('text').data(eras).join('text')
      .attr('class', 'tl-band__name')
      .attr('x', (e) => x(Math.max(e.from, AXIS_FROM)) + 8).attr('y', 16)
      .text((e) => e.name);

    // Year ruler along the top, faint gridlines down to the axis
    const years = Array.from({ length: AXIS_TO - AXIS_FROM + 1 }, (_, i) => AXIS_FROM + i);
    const ruler = svg.append('g').attr('class', 'tl-ruler').attr('aria-hidden', 'true');
    ruler.selectAll('line').data(years).join('line')
      .attr('x1', (y) => x(y)).attr('x2', (y) => x(y)).attr('y1', TOP - 8).attr('y2', baseY);
    ruler.selectAll('text').data(years.filter((y) => W >= 1100 || y % 2 === 1)).join('text')
      .attr('x', (y) => x(y) + 3).attr('y', TOP - 12).text((y) => y);

    // Axis and true-date ticks (with a leader where a poster was nudged)
    const axis = svg.append('g').attr('class', 'tl-axis').attr('aria-hidden', 'true');
    axis.append('line').attr('class', 'tl-axis__line').attr('x1', MARGIN_X).attr('x2', W - MARGIN_X).attr('y1', baseY).attr('y2', baseY);
    axis.selectAll('path').data(stations).join('path')
      .attr('class', 'tl-leader')
      .attr('d', (s) => `M${s.trueX},${baseY - 4} L${s.trueX},${baseY} L${s.x},${posterY}`);

    // Arcs: widest first so thin arcs stay on top and hoverable
    const arcPath = (p: Pair) => {
      const x1 = at.get(p.a.slug)!.x, x2 = at.get(p.b.slug)!.x;
      const [l, r] = x1 < x2 ? [x1, x2] : [x2, x1];
      const rx = (r - l) / 2, ry = Math.min(rx, maxSpanH);
      return `M${l},${baseY} A${rx},${ry} 0 0 1 ${r},${baseY}`;
    };
    const byWidth = [...pairs].sort((p, q) => q.actors.length - p.actors.length);
    const arcs = svg.append('g').attr('class', 'tl-arcs');
    arcs.selectAll<SVGPathElement, Pair>('.tl-arc').data(byWidth).join('path')
      .attr('class', 'tl-arc').attr('d', arcPath).attr('stroke-width', (p) => stroke(p.actors.length));
    arcs.selectAll<SVGPathElement, Pair>('.tl-arc-hit').data(byWidth).join('path')
      .attr('class', 'tl-arc-hit').attr('d', arcPath).attr('stroke-width', (p) => Math.max(10, stroke(p.actors.length) + 6))
      .on('mouseenter', (ev: MouseEvent, p) => { light({ pair: p }); showTip(p, ev); })
      .on('mousemove', (ev: MouseEvent, p) => showTip(p, ev))
      .on('mouseleave', () => { hideTip(); rest(); })
      .on('click', (ev: MouseEvent, p) => { selectedPair = p; light({ pair: p }); showTip(p, ev); peekPair(p); });

    // Stations: <a> so they are focusable; first click peeks, second navigates
    const st = svg.append('g').attr('class', 'tl-stations').selectAll<SVGAElement, Station>('a').data(stations).join('a')
      .attr('class', 'tl-station')
      .attr('href', (s) => workHref(s.work.slug))
      .attr('aria-label', (s) => `${s.work.title}, ${s.work.year}`);
    st.append('circle').attr('class', 'tl-station__dot').attr('cx', (s) => s.x).attr('cy', baseY).attr('r', 3.5);
    st.append('rect').attr('class', 'tl-station__frame')
      .attr('x', (s) => s.x - POSTER_W / 2).attr('y', posterY).attr('width', POSTER_W).attr('height', POSTER_H);
    st.filter((s) => !!s.work.poster).append('image')
      .attr('href', (s) => s.work.poster!).attr('preserveAspectRatio', 'xMidYMid slice')
      .attr('x', (s) => s.x - POSTER_W / 2).attr('y', posterY).attr('width', POSTER_W).attr('height', POSTER_H);
    st.append('text').attr('class', 'tl-station__label')
      .attr('x', (s) => s.x).attr('y', (s) => labelY + s.row * 15).attr('text-anchor', 'middle')
      .text((s) => shortTitle(s.work));
    st.on('mouseenter focus', (_, s) => { if (!selectedPair) light({ slug: s.work.slug }); })
      .on('mouseleave blur', () => rest())
      .on('click', (ev: MouseEvent, s) => {
        if (focus === s.work.slug && !selectedPair) return;   // second click follows the link
        ev.preventDefault();
        focus = s.work.slug;
        selectedPair = null;
        setQuery({ focus });
        light({ slug: focus });
        peekStation(s.work, pairs);
      });

    rest();
  }

  draw();
  if (focus) {
    const s = stations.find((x) => x.work.slug === focus);
    if (s) scroller.scrollLeft = Math.max(0, s.x - scroller.clientWidth / 2);
  }

  mount.querySelector('.tl-list')!.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-pair]');
    if (!b) return;
    selectedPair = pairs[Number(b.dataset.pair)];
    light({ pair: selectedPair });
    peekPair(selectedPair);
  });

  scroller.addEventListener('scroll', hideTip, { passive: true });
  let lastW = scroller.clientWidth, frame = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (Math.abs(scroller.clientWidth - lastW) < 2) return;
      lastW = scroller.clientWidth;
      draw();
    });
  });
  ro.observe(scroller);
  const offClose = onPeekClose(() => { selectedPair = null; hideTip(); rest(); });

  return () => { ro.disconnect(); cancelAnimationFrame(frame); offClose(); };
}
