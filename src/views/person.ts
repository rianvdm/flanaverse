/**
 * #/person/:slug: one person's page. Header with profile, the ego map (the
 * person at the centre, their core works in a ring by date, co-stars who share
 * two or more of those works in an outer ring), role cards per work, "most
 * often with", the appears-in strip, and behind-the-camera credits.
 */
import { select, type Selection } from 'd3';
import type { Route } from '../lib/router';
import { html, mountHtml, plural, type Raw } from '../lib/html';
import { model, isActing, workHref, personHref } from '../data/model';
import { headshot, personChip, chipList } from '../components/chips';
import { openPeek, onPeekClose } from '../components/peek';
import { appearsInStrip } from '../components/strip';
import { recordVisit } from '../components/trail';
import type { Appearance, Person, Work } from '../data/types';
import '../styles/person.css';

/* ------------------------------------------------------------------ data */

interface Credit { work: Work; app: Appearance }
interface CoStar { person: Person; shared: Work[] }

const TAU = Math.PI * 2;
const TIER_LABEL: Record<Work['tier'], string> = { core: '', early: 'Early work', written: 'Written by Flanagan', upcoming: 'Upcoming' };

/** Every credit with a known work, chronological. */
function creditsOf(p: Person): Credit[] {
  return p.appearances
    .map((app) => ({ app, work: model.workBySlug.get(app.work) }))
    .filter((c): c is Credit => !!c.work)
    .sort((a, b) => a.work.releaseDate.localeCompare(b.work.releaseDate));
}

/** Core works where the person acts or holds any crew job: the ego map's ring. */
const ringCredits = (credits: Credit[]) => credits.filter((c) => c.work.tier === 'core' && (isActing(c.app) || c.app.jobs.length > 0));

let actingIndex: Map<number, Set<string>> | null = null;
/** person id -> slugs of core works they act in (built once). */
function coreActing(): Map<number, Set<string>> {
  if (actingIndex) return actingIndex;
  actingIndex = new Map();
  for (const p of model.people.values()) {
    const slugs = p.appearances.filter((a) => isActing(a) && model.workBySlug.get(a.work)?.tier === 'core').map((a) => a.work);
    if (slugs.length) actingIndex.set(p.id, new Set(slugs));
  }
  return actingIndex;
}

/** Other actors who share at least one of the ring works, most shared first. */
function coStarsOf(p: Person, ring: Work[]): CoStar[] {
  const out: CoStar[] = [];
  for (const [id, slugs] of coreActing()) {
    if (id === p.id) continue;
    const shared = ring.filter((w) => slugs.has(w.slug));
    if (shared.length) out.push({ person: model.people.get(id)!, shared });
  }
  return out.sort((a, b) => b.shared.length - a.shared.length || a.person.name.localeCompare(b.person.name));
}

const firstName = (p: Person) => p.name.split(/\s+/)[0];

/** Distinct character names; "Adelaide (voice)" folds into "Adelaide" when both exist. */
function characters(a: Appearance): string {
  const names = [...new Set(a.characters.map((c) => c.trim()).filter(Boolean))];
  const present = new Set(names);
  const qualifier = /\s*\((voice|uncredited)\)$/i;
  return names.filter((n) => !(qualifier.test(n) && present.has(n.replace(qualifier, '')))).join(' / ');
}

/** What a person does in a work: their characters, else their jobs. */
function roleText(p: Person, slug: string): string {
  const a = p.appearances.find((x) => x.work === slug);
  if (!a) return '';
  return characters(a) || a.jobs.join(', ');
}

/** TMDB's known-for department, or a guess from the credits. */
function department(p: Person): string {
  if (p.knownForDepartment) return p.knownForDepartment;
  return p.appearances.some(isActing) ? 'Acting' : 'Crew';
}

/** "Hill House", "Usher", "Ouija": compact titles for dense labels. */
function shortTitle(w: Work): string {
  return w.title
    .replace(/^The Haunting of /, '')
    .replace(/^The Fall of the House of /, '')
    .replace(/:.*$/, '')
    .replace(/^The /, '');
}

function kindLabel(w: Work): string {
  if (w.kind === 'series') return `Series · ${plural(w.episodeCount ?? 0, 'episode')}`;
  return w.kind === 'short' ? 'Short' : 'Film';
}

function episodeLine(c: Credit): string {
  const total = c.work.episodeCount ?? 0;
  if (c.work.kind !== 'series' || !c.app.episodeCount) return '';
  return total ? `${Math.min(c.app.episodeCount, total)} of ${plural(total, 'episode')}` : plural(c.app.episodeCount, 'episode');
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** TMDB biography split into a ~60-word lead and the rest, minus the Wikipedia footer. */
function splitBio(bio: string): { lead: string; rest: string[] } {
  const clean = bio.replace(/\n*Description above from the Wikipedia article[\s\S]*$/i, '').replace(/ /g, ' ').trim();
  const paras = clean.split(/\n{2,}|\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (!paras.length) return { lead: '', rest: [] };
  const words = paras[0].split(/\s+/);
  if (words.length <= 75) return { lead: paras[0], rest: paras.slice(1) };
  // Cut at the first sentence end between 45 and 90 words, else hard-cut at 60.
  let cut = -1;
  for (let i = 44; i < Math.min(words.length - 1, 90); i++) if (/[.!?]["”’)]?$/.test(words[i])) { cut = i + 1; break; }
  if (cut < 0) cut = 60;
  return { lead: words.slice(0, cut).join(' ') + (cut === 60 ? '…' : ''), rest: [words.slice(cut).join(' '), ...paras.slice(1)] };
}

/* ------------------------------------------------------------- ego layout */

interface Cfg {
  vb: number; centreR: number;
  workR: number; posterW: number; posterH: number; workFont: number; wrapAt: number; workYear: boolean;
  ringSingle: number; ringInner: number; ringOuter: number; singleMax: number; evenSpread: boolean;
  nodeMin: number; nodeStep: number; nodeMax: number; maxStars: number; labelFont: number;
}

/* Viewbox units. Work labels sit outside each poster, between the two rings. */
const WIDE: Cfg = {
  vb: 1100, centreR: 66,
  workR: 192, posterW: 44, posterH: 66, workFont: 13, wrapAt: 13, workYear: true,
  ringSingle: 352, ringInner: 330, ringOuter: 382, singleMax: 30, evenSpread: false,
  nodeMin: 13, nodeStep: 3.5, nodeMax: 27, maxStars: 80, labelFont: 14,
};
const NARROW: Cfg = {
  vb: 660, centreR: 54,
  workR: 150, posterW: 40, posterH: 60, workFont: 17, wrapAt: 9, workYear: false,
  ringSingle: 294, ringInner: 294, ringOuter: 294, singleMax: 99, evenSpread: true,
  nodeMin: 13, nodeStep: 3, nodeMax: 22, maxStars: 18, labelFont: 0,
};

interface WorkNode { key: string; credit: Credit; a: number; x: number; y: number; lines: string[] }
interface StarNode { key: string; star: CoStar; a: number; x: number; y: number; r: number; R: number }
interface LinkDatum { key: string; star: StarNode; work: WorkNode }
interface EgoLayout { works: WorkNode[]; stars: StarNode[]; links: LinkDatum[]; hidden: number }

const polar = (R: number, a: number): [number, number] => [R * Math.sin(a), -R * Math.cos(a)];
const norm = (a: number) => ((a % TAU) + TAU) % TAU;

function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(/\s+/)) {
    const last = lines[lines.length - 1];
    if (last && (last + ' ' + word).length <= max) lines[lines.length - 1] = last + ' ' + word;
    else lines.push(word);
  }
  return lines.length > 2 ? [lines[0], lines.slice(1).join(' ')] : lines;
}

/**
 * Spreads co-stars round the ring near the circular mean of their shared works.
 * Returns angles in sorted order (index k) so callers can alternate rings.
 * Deterministic: sorted by target angle, then evenly slotted or relaxed apart.
 */
function spread(targets: number[], minSep: number): { index: number; a: number }[] {
  const n = targets.length;
  const order = targets.map((t, i) => ({ i, t: norm(t) })).sort((x, y) => x.t - y.t || x.i - y.i);
  if (n * minSep >= TAU * 0.9) {
    const step = TAU / n;
    let sx = 0, sy = 0;
    order.forEach((o, k) => { sx += Math.cos(o.t - k * step); sy += Math.sin(o.t - k * step); });
    const off = Math.atan2(sy, sx);
    return order.map((o, k) => ({ index: o.i, a: off + k * step }));
  }
  const a = order.map((o) => o.t);
  for (let iter = 0; iter < 300 && n > 1; iter++) {
    let moved = false;
    for (let k = 0; k < n; k++) {
      const next = (k + 1) % n;
      const gap = a[next] - a[k] + (next === 0 ? TAU : 0);
      if (gap < minSep - 1e-6) { const push = (minSep - gap) / 2; a[k] -= push; a[next] += push; moved = true; }
    }
    if (!moved) break;
  }
  return order.map((o, k) => ({ index: o.i, a: a[k] }));
}

function layoutEgo(ring: Credit[], allStars: CoStar[], cfg: Cfg): EgoLayout {
  const works: WorkNode[] = ring.map((credit, i) => {
    const a = (i / ring.length) * TAU;
    const [x, y] = polar(cfg.workR, a);
    return { key: `w:${credit.work.slug}`, credit, a, x, y, lines: wrap(shortTitle(credit.work), cfg.wrapAt) };
  });
  const workBySlug = new Map(works.map((w) => [w.credit.work.slug, w]));
  const stars = allStars.slice(0, cfg.maxStars);
  const radius = (n: number) => Math.min(cfg.nodeMax, cfg.nodeMin + cfg.nodeStep * (n - 2));

  const targets = stars.map((s) => {
    let sx = 0, sy = 0;
    for (const w of s.shared) { const a = workBySlug.get(w.slug)!.a; sx += Math.sin(a); sy += Math.cos(a); }
    return Math.hypot(sx, sy) < 1e-6 ? workBySlug.get(s.shared[0].slug)!.a : Math.atan2(sx, sy);
  });
  const twoRings = stars.length > cfg.singleMax;
  // Dense work rings (12+) push their flank labels outward; give them room.
  const crowding = Math.max(0, ring.length - 11) * 8;
  const minSep = twoRings || cfg.evenSpread ? TAU / stars.length : (2 * cfg.nodeMax + 10) / cfg.ringSingle;
  const placed: StarNode[] = [];
  spread(targets, minSep).forEach(({ index, a }, k) => {
    const s = stars[index];
    const R = (twoRings ? (k % 2 ? cfg.ringOuter : cfg.ringInner) : cfg.ringSingle) + crowding;
    const [x, y] = polar(R, a);
    placed[index] = { key: `p:${s.person.id}`, star: s, a: norm(a), x, y, r: radius(s.shared.length), R };
  });
  const links: LinkDatum[] = placed.flatMap((sn) => sn.star.shared.map((w) => ({ key: `${sn.key}|w:${w.slug}`, star: sn, work: workBySlug.get(w.slug)! })));
  return { works, stars: placed, links, hidden: allStars.length - stars.length };
}

/* --------------------------------------------------------------- ego draw */

interface EgoHandlers {
  preview(key: string | null): void;
  activate(key: string, ev: Event): void;
}

type Svg = Selection<SVGSVGElement, unknown, null, undefined>;

function drawEgo(host: HTMLElement, centre: Person, layout: EgoLayout, cfg: Cfg, on: EgoHandlers): Svg {
  host.replaceChildren();
  // Without a co-star ring, crop the view to the works ring and its labels.
  const vb = layout.stars.length ? cfg.vb : 2 * (cfg.workR + cfg.posterH / 2 + 4 * (cfg.workFont || 12) + 8);
  const half = vb / 2;
  const svg = select(host).append('svg')
    .attr('class', 'ego__svg')
    .attr('viewBox', `${-half} ${-half} ${vb} ${vb}`)
    .attr('role', 'group')
    .attr('aria-label', `Map of ${centre.name}'s works and frequent co-stars`);

  svg.append('defs').append('clipPath').attr('id', 'ego-clip').attr('clipPathUnits', 'objectBoundingBox')
    .append('circle').attr('cx', 0.5).attr('cy', 0.5).attr('r', 0.5);

  const guides = svg.append('g').attr('class', 'ego__guides').attr('aria-hidden', 'true');
  guides.append('circle').attr('r', cfg.workR);
  if (layout.stars.length) {
    const rings = [...new Set(layout.stars.map((s) => s.R))];
    for (const R of rings) guides.append('circle').attr('class', 'ego__guide--outer').attr('r', R);
  }

  const curve = (l: LinkDatum) => {
    const { x: sx, y: sy } = l.star;
    const { x: wx, y: wy } = l.work;
    return `M${sx.toFixed(1)},${sy.toFixed(1)} Q${((sx + wx) * 0.36).toFixed(1)},${((sy + wy) * 0.36).toFixed(1)} ${wx.toFixed(1)},${wy.toFixed(1)}`;
  };
  svg.append('g').attr('class', 'ego__links').attr('aria-hidden', 'true')
    .selectAll('path').data(layout.links).join('path').attr('class', 'ego-link').attr('d', curve);

  // Centre: the person, not a link (this is their page).
  const c = svg.append('g').attr('class', 'ego-centre').attr('aria-hidden', 'true');
  c.append('circle').attr('class', 'ego-centre__bg').attr('r', cfg.centreR);
  const src = centre.profileLarge ?? centre.profile;
  if (src) {
    c.append('image').attr('href', src).attr('x', -cfg.centreR).attr('y', -cfg.centreR)
      .attr('width', cfg.centreR * 2).attr('height', cfg.centreR * 2)
      .attr('preserveAspectRatio', 'xMidYMin slice').attr('clip-path', 'url(#ego-clip)');
  } else {
    c.append('text').attr('class', 'ego-initials').attr('dy', '0.35em').text(initials(centre));
  }
  c.append('circle').attr('class', 'ego-centre__ring').attr('r', cfg.centreR);

  // Works ring.
  const pw = cfg.posterW, ph = cfg.posterH;
  const works = svg.append('g').attr('class', 'ego__works')
    .selectAll<SVGAElement, WorkNode>('a').data(layout.works).join('a')
    .attr('class', 'ego-node ego-work')
    .attr('href', (d) => workHref(d.credit.work.slug))
    .attr('aria-label', (d) => `${d.credit.work.title}, ${d.credit.work.year}: ${roleText(centre, d.credit.work.slug)}`)
    .attr('transform', (d) => `translate(${d.x.toFixed(1)},${d.y.toFixed(1)})`);
  works.append('rect').attr('class', 'ego-work__bg').attr('x', -pw / 2).attr('y', -ph / 2).attr('width', pw).attr('height', ph);
  works.filter((d) => !!d.credit.work.poster).append('image')
    .attr('href', (d) => d.credit.work.poster!).attr('x', -pw / 2).attr('y', -ph / 2).attr('width', pw).attr('height', ph)
    .attr('preserveAspectRatio', 'xMidYMid slice');
  works.append('rect').attr('class', 'ego-work__frame').attr('x', -pw / 2).attr('y', -ph / 2).attr('width', pw).attr('height', ph);
  if (cfg.workFont) {
    // Label on the outward side of the poster: above at the top of the ring,
    // beside it on the flanks, below at the bottom. Never over a neighbour.
    const f = cfg.workFont, lh = f * 1.1;
    works.append('text').attr('class', 'ego-work__label').style('font-size', `${f}px`).each(function (d) {
      const sa = Math.sin(d.a), ca = Math.cos(d.a);
      const ext = Math.abs(sa) * (pw / 2) + Math.abs(ca) * (ph / 2) + 6;
      const lx = sa * ext, ly = -ca * ext;
      const lines: { text: string; year?: boolean }[] = d.lines.map((text) => ({ text }));
      if (cfg.workYear) lines.push({ text: String(d.credit.work.year), year: true });
      const block = (lines.length - 1) * lh;
      const top = ca > 0.3 ? ly - block - 0.25 * f : ca < -0.3 ? ly + 0.8 * f : ly - block / 2 + 0.35 * f;
      const text = select(this).attr('text-anchor', sa > 0.3 ? 'start' : sa < -0.3 ? 'end' : 'middle');
      lines.forEach((l, i) => text.append('tspan').attr('class', l.year ? 'ego-work__year' : null)
        .attr('x', lx.toFixed(1)).attr('y', (top + i * lh).toFixed(1)).text(l.text));
    });
  }

  // Co-star ring.
  const stars = svg.append('g').attr('class', 'ego__stars')
    .selectAll<SVGAElement, StarNode>('a').data(layout.stars).join('a')
    .attr('class', 'ego-node ego-star')
    .attr('href', (d) => personHref(d.star.person.id))
    .attr('aria-label', (d) => `${d.star.person.name}, ${plural(d.star.shared.length, 'shared work')}`)
    .attr('transform', (d) => `translate(${d.x.toFixed(1)},${d.y.toFixed(1)})`);
  stars.append('circle').attr('class', 'ego-star__bg').attr('r', (d) => d.r);
  stars.filter((d) => !!d.star.person.profile).append('image')
    .attr('href', (d) => d.star.person.profile!)
    .attr('x', (d) => -d.r).attr('y', (d) => -d.r).attr('width', (d) => d.r * 2).attr('height', (d) => d.r * 2)
    .attr('preserveAspectRatio', 'xMidYMin slice').attr('clip-path', 'url(#ego-clip)');
  stars.filter((d) => !d.star.person.profile).append('text').attr('class', 'ego-initials')
    .attr('dy', '0.35em').style('font-size', (d) => `${Math.round(d.r * 0.75)}px`).text((d) => initials(d.star.person));
  stars.append('circle').attr('class', 'ego-star__ring').attr('r', (d) => d.r);

  if (cfg.labelFont) {
    stars.append('text').attr('class', 'ego-star__label').style('font-size', `${cfg.labelFont}px`)
      .attr('dy', '0.35em')
      .attr('text-anchor', (d) => (d.a > Math.PI ? 'end' : 'start'))
      .attr('transform', (d) => {
        const deg = (d.a * 180) / Math.PI - 90;
        const off = d.r + 6;
        // Rotate into the radial direction; flip on the left half so text reads left to right.
        return d.a > Math.PI ? `rotate(${(deg + 180).toFixed(2)}) translate(${-off},0)` : `rotate(${deg.toFixed(2)}) translate(${off},0)`;
      })
      .each(function (d) {
        const name = d.star.person.name;
        const text = select(this);
        text.append('tspan').text(name.length > 22 ? name.slice(0, 21) + '…' : name);
        text.append('tspan').attr('class', 'ego-star__count').text(` ${d.star.shared.length}`);
      });
  }

  svg.selectAll<SVGAElement, { key: string }>('.ego-node')
    .on('mouseenter focus', (_e, d) => on.preview(d.key))
    .on('mouseleave blur', () => on.preview(null))
    .on('click', (e: MouseEvent, d) => on.activate(d.key, e))
    .on('keydown', (e: KeyboardEvent, d) => { if (e.key === 'Enter') on.activate(d.key, e); });
  return svg;
}

const initials = (p: Person) => p.name.split(/\s+/).map((s) => s[0]).slice(0, 2).join('');

/** Lights a node plus everything it connects to; null clears. */
function highlight(svg: Svg, layout: EgoLayout, key: string | null): void {
  const lit = new Set<string>();
  if (key?.startsWith('p:')) {
    const s = layout.stars.find((x) => x.key === key);
    if (s) { lit.add(key); for (const w of s.star.shared) { lit.add(`w:${w.slug}`); lit.add(`${key}|w:${w.slug}`); } }
  } else if (key?.startsWith('w:')) {
    lit.add(key);
    for (const l of layout.links) if (l.work.key === key) { lit.add(l.key); lit.add(l.star.key); }
  }
  svg.classed('is-focus', !!key);
  svg.selectAll<SVGElement, { key: string }>('.ego-node, .ego-link').classed('is-lit', (d) => lit.has(d.key));
  // Lit links draw above unlit ones.
  svg.selectAll<SVGPathElement, LinkDatum>('.ego-link.is-lit').raise();
}

/* ----------------------------------------------------------------- markup */

function hero(p: Person, credits: Credit[], ring: Credit[]): Raw {
  const meta = model.personMeta.get(p.id);
  const acting = credits.filter((c) => isActing(c.app));
  const dept = department(p);
  const onScreenFirst = dept === 'Acting' && acting.length > 0;
  const first = (onScreenFirst ? acting : credits)[0];
  const backdropWork = [...acting].sort((a, b) => (a.app.order ?? 999) - (b.app.order ?? 999))[0]?.work ?? ring[0]?.work;
  const bio = !meta?.profile && p.biography ? splitBio(p.biography) : null;
  const born = [p.birthday ? `Born ${formatDate(p.birthday)}` : '', p.placeOfBirth ? `in ${p.placeOfBirth}` : ''].filter(Boolean).join(' ');
  const died = p.deathday ? `Died ${formatDate(p.deathday)}` : '';

  return html`<header class="person-hero bleed">
    ${backdropWork?.backdrop ? html`<div class="bleed__img" style="background-image:url('${backdropWork.backdrop}')"></div>` : ''}
    <div class="page person-hero__inner">
      <div class="person-hero__shot">${headshot(p, 'xl')}</div>
      <div class="person-hero__text">
        <p class="kicker person-hero__kicker">
          <span>${dept}</span><span class="person-hero__sep">&nbsp;· </span><span class="num">${plural(ring.length || credits.length, 'work')}</span>${first ? html`<span class="person-hero__sep">&nbsp;· </span>${onScreenFirst ? 'first appeared in' : 'first credit'} <a href="${workHref(first.work.slug)}">${shortTitle(first.work)}</a>&nbsp;<span class="num">(${first.work.year})</span>` : ''}
        </p>
        <h1 class="person-hero__name">${p.name}</h1>
        <div class="person-hero__bio">
          ${meta?.profile ? html`<p>${meta.profile}</p>` : ''}
          ${bio?.lead ? html`<p>${bio.lead}</p>` : ''}
          ${bio && bio.rest.length ? html`<details class="person-hero__more"><summary>More</summary>${bio.rest.map((t) => html`<p>${t}</p>`)}<p class="person-hero__credit">Biography from TMDB.</p></details>` : ''}
          ${!meta?.profile && !bio?.lead ? html`<p class="muted">No biography yet.</p>` : ''}
          ${meta?.funFact ? html`<p class="person-hero__fact"><span class="kicker">Also</span> ${meta.funFact}</p>` : ''}
        </div>
        ${born || died ? html`<p class="person-hero__facts">${[born, died].filter(Boolean).join(' · ')}</p>` : ''}
        <p class="person-hero__links">
          <a class="btn" href="https://www.themoviedb.org/person/${p.id}" rel="noopener" target="_blank">TMDB</a>
          ${p.imdbId ? html`<a class="btn" href="https://www.imdb.com/name/${p.imdbId}" rel="noopener" target="_blank">IMDb</a>` : ''}
        </p>
        ${meta?.sources?.length ? html`<p class="person-hero__sources">Profile sources: ${meta.sources.map((s, i) => html`${i ? ' · ' : ''}<a href="${s.url}" rel="noopener" target="_blank">${s.label}</a>`)}</p>` : ''}
      </div>
    </div>
  </header>`;
}

function roleCard(c: Credit, useJobs: boolean): Raw {
  const w = c.work;
  const chars = characters(c.app);
  const eps = episodeLine(c);
  const total = w.episodeCount ?? 0;
  const tier = TIER_LABEL[w.tier];
  const role = useJobs ? c.app.jobs.join(', ') : chars;
  return html`<li class="role">
    <a class="role__poster" href="${workHref(w.slug)}" tabindex="-1" aria-hidden="true">
      ${w.poster ? html`<img src="${w.poster}" alt="" loading="lazy">` : html`<span>${shortTitle(w)}</span>`}
    </a>
    <div class="role__body">
      <p class="role__meta"><span class="num">${w.year}</span> · ${w.kind === 'series' ? 'Series' : w.kind === 'short' ? 'Short' : 'Film'}${tier ? html` · <span class="role__tier">${tier}</span>` : ''}</p>
      <h3 class="role__work"><a href="${workHref(w.slug)}">${w.title}</a></h3>
      ${role
        ? html`<p class="role__as">${useJobs ? '' : html`<span class="role__as-word">as</span> `}<span class="role__char">${role}</span></p>`
        : html`<p class="role__as muted">Role not yet announced</p>`}
      ${eps ? html`<p class="role__eps num">${eps}
        ${total && total <= 20 ? html`<span class="role__dots" aria-hidden="true">${Array.from({ length: total }, (_, i) => html`<i class="${i < c.app.episodeCount ? 'is-on' : ''}"></i>`)}</span>` : ''}
      </p>` : ''}
      ${!useJobs && c.app.jobs.length ? html`<p class="role__also">Also ${c.app.jobs.join(', ').toLowerCase()}</p>` : ''}
    </div>
  </li>`;
}

/* ------------------------------------------------------------------- view */

export default function render(route: Route, mount: HTMLElement) {
  const slug = route.params.slug;
  const p = model.personBySlug.get(slug);
  if (!p) {
    document.title = 'Not found · Flanaverse';
    mountHtml(mount, html`<div class="page person-missing"><p class="kicker">Not found</p><h1>No one called “${slug}”</h1>
      <p class="prose">That person isn't in the Flanaverse data. Browse <a href="#/people">everyone in the repertory</a> or press <kbd>/</kbd> to search.</p></div>`);
    return;
  }

  const href = personHref(p.id);
  document.title = `${p.name} · Flanaverse`;
  recordVisit({ kind: 'person', title: p.name, href });

  const credits = creditsOf(p);
  const ring = ringCredits(credits);
  const ringWorks = ring.map((c) => c.work);
  const allCo = coStarsOf(p, ringWorks);
  const frequent = allCo.filter((s) => s.shared.length >= 2);
  const actingCredits = credits.filter((c) => isActing(c.app) || (!c.app.characters.length && !c.app.jobs.length));
  const hasActing = credits.some((c) => isActing(c.app));
  const crewCredits = credits.filter((c) => c.app.jobs.length > 0);
  const roleCredits = hasActing ? actingCredits : credits;
  const mySlug = model.personSlug.get(p.id) ?? slug;
  const fn = firstName(p);

  const mapIntro = ring.length === 0
    ? `${p.name} has no credits on the core films and series yet, so there is no map to draw.`
    : ring.length === 1
      ? `${fn} has one core work so far, so there is no ring of returning co-stars yet.`
      : frequent.length
        ? `${plural(frequent.length, 'person', 'people')} share two or more works with ${fn}. Select a face or a poster to light what connects them.`
        : `No other actor shares two of ${fn}'s works yet.`;

  const none = html``;
  const crewFirst = department(p) !== 'Acting';
  const rolesSection = roleCredits.length ? html`<section class="section" aria-labelledby="roles-h">
          <div class="section__head"><h2 id="roles-h">${!hasActing ? 'Credits' : crewFirst ? 'On screen' : 'Roles'}</h2><span class="kicker num">${plural(roleCredits.length, hasActing ? 'role' : 'credit')}</span></div>
          <ol class="roles">${roleCredits.map((c) => roleCard(c, !hasActing))}</ol>
        </section>` : none;
  const crewSection = hasActing && crewCredits.length ? html`<section class="section" aria-labelledby="crew-h">
          <div class="section__head"><h2 id="crew-h">Behind the camera</h2><span class="kicker num">${plural(crewCredits.length, 'work')}</span></div>
          <ol class="crew">${crewCredits.map((c) => html`<li class="crew__row">
            <span class="crew__year num">${c.work.year}</span>
            <a class="crew__work" href="${workHref(c.work.slug)}">${c.work.title}</a>
            <span class="crew__jobs">${c.app.jobs.join(', ')}</span>
          </li>`)}</ol>
        </section>` : none;
  const oftenSection = frequent.length ? html`<section class="section" aria-labelledby="often-h">
          <div class="section__head"><h2 id="often-h">Most often with</h2><span class="kicker">Shared works</span></div>
          <ol class="pairs">${frequent.slice(0, 8).map((s) => html`<li class="pair">
            ${personChip(s.person, { role: `${s.shared.length} together` })}
            <span class="pair__works">${s.shared.map((w) => w.title).join(' · ')}</span>
            <a class="pair__link" href="#/connect/${mySlug}/${model.personSlug.get(s.person.id) ?? s.person.id}" aria-label="How ${p.name} and ${s.person.name} connect">Connect →</a>
          </li>`)}</ol>
        </section>` : none;
  const stripSection = credits.length ? html`<section class="section" aria-labelledby="strip-h">
          <div class="section__head"><h2 id="strip-h">Appears in</h2><span class="kicker">On the shared timeline</span></div>
          <div class="person__strip">${appearsInStrip(credits.map((c) => c.work.slug), { notes: Object.fromEntries(credits.map((c) => [c.work.slug, roleText(p, c.work.slug)])) })}</div>
        </section>` : none;

  mountHtml(mount, html`
    <article class="person">
      ${hero(p, credits, ring)}
      <div class="page person__body">
        ${ring.length ? html`<section class="section ego" aria-labelledby="ego-h">
          <div class="section__head"><h2 id="ego-h">The map</h2><span class="kicker">Works by date, clockwise from 12</span></div>
          <p class="ego__caption" aria-live="polite" data-caption>${mapIntro}</p>
          <div class="ego__canvas ${frequent.length ? '' : 'is-solo'}" data-ego></div>
          <p class="ego__note muted" data-ego-note hidden></p>
          <details class="ego__list">
            <summary>List view</summary>
            <div class="ego__list-cols">
              <div>
                <h3>Works</h3>
                <ol>${ring.map((c) => html`<li><a href="${workHref(c.work.slug)}">${c.work.title}</a> <span class="num muted">${c.work.year}</span> <span class="muted">· ${roleText(p, c.work.slug)}</span></li>`)}</ol>
              </div>
              ${frequent.length ? html`<div>
                <h3>Co-stars in two or more</h3>
                <ol>${frequent.map((s) => html`<li><a href="${personHref(s.person.id)}">${s.person.name}</a> <span class="num muted">${s.shared.length}</span> <span class="muted">· ${s.shared.map(shortTitle).join(', ')}</span></li>`)}</ol>
              </div>` : ''}
            </div>
          </details>
        </section>` : html`<p class="section muted">${mapIntro}</p>`}

        ${crewFirst ? [crewSection, rolesSection] : [rolesSection, crewSection]}
        ${oftenSection}
        ${stripSection}
      </div>
    </article>`);

  if (!ring.length) return;

  /* Ego map: interactive state. */
  const canvas = mount.querySelector<HTMLElement>('[data-ego]')!;
  const caption = mount.querySelector<HTMLElement>('[data-caption]')!;
  const note = mount.querySelector<HTMLElement>('[data-ego-note]')!;
  const narrowMq = window.matchMedia('(max-width: 719.98px)');
  let layout: EgoLayout;
  let svg: Svg;
  let selected: string | null = null;

  const starByKey = () => new Map(layout.stars.map((s) => [s.key, s]));
  const workByKey = () => new Map(layout.works.map((w) => [w.key, w]));

  function describe(key: string | null): string {
    if (!key) return mapIntro;
    if (key.startsWith('p:')) {
      const s = starByKey().get(key);
      if (!s) return mapIntro;
      const titles = s.star.shared.map(shortTitle);
      const list = titles.length > 1 ? `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}` : titles[0];
      return `${s.star.person.name}: with ${fn} in ${list}.`;
    }
    const w = workByKey().get(key);
    if (!w) return mapIntro;
    const n = layout.links.filter((l) => l.work.key === key).length;
    const role = roleText(p!, w.credit.work.slug);
    return `${w.credit.work.title} (${w.credit.work.year}): ${isActing(w.credit.app) ? `as ${characters(w.credit.app)}` : role}${n ? ` · ${plural(n, 'co-star')} from the ring` : ''}.`;
  }

  function preview(key: string | null): void {
    const k = key ?? selected;
    highlight(svg, layout, k);
    caption.textContent = describe(k);
  }

  function peekStar(s: StarNode): void {
    const o = s.star.person;
    const theirs = creditsOf(o);
    const otherSlug = model.personSlug.get(o.id) ?? String(o.id);
    openPeek({
      kind: 'person',
      title: o.name,
      subtitle: `${plural(s.star.shared.length, 'work')} with ${p!.name}`,
      image: o.profile,
      imageShape: 'circle',
      href: personHref(o.id),
      body: html`
        <h3>Together in</h3>
        <ul class="pk-roles">${s.star.shared.map((w) => html`<li>
          <a href="${workHref(w.slug)}">${w.title}</a> <span class="num muted">${w.year}</span>
          <span class="pk-roles__as">as ${roleText(o, w.slug)} <span class="muted">· ${fn} as ${roleText(p!, w.slug)}</span></span>
        </li>`)}</ul>
        <h3>Everything ${firstName(o)} is in</h3>
        ${appearsInStrip(theirs.map((c) => c.work.slug), { compact: true, notes: Object.fromEntries(theirs.map((c) => [c.work.slug, roleText(o, c.work.slug)])) })}
        <p class="pk-connect"><a href="#/connect/${mySlug}/${otherSlug}">How ${fn} and ${firstName(o)} connect →</a></p>`,
    });
  }

  function peekWork(wn: WorkNode): void {
    const w = wn.credit.work;
    const here = layout.links.filter((l) => l.work.key === wn.key).map((l) => l.star.star.person);
    const eps = episodeLine(wn.credit);
    const role = isActing(wn.credit.app) ? characters(wn.credit.app) : wn.credit.app.jobs.join(', ');
    openPeek({
      kind: 'work',
      title: w.title,
      subtitle: `${w.year} · ${kindLabel(w)}`,
      image: w.poster,
      imageShape: 'poster',
      href: workHref(w.slug),
      body: html`
        <p class="pk-lead">${p!.name} ${isActing(wn.credit.app) ? html`plays <strong>${role}</strong>` : html`<span class="muted">·</span> <strong>${role}</strong>`}${eps ? html` <span class="muted num">(${eps})</span>` : ''}</p>
        ${here.length ? html`<h3>Also here, from the ring</h3>${chipList(here.map((o) => personChip(o, { role: roleText(o, w.slug) })))}` : ''}`,
    });
  }

  function activate(key: string, ev: Event): void {
    const mouse = ev as MouseEvent;
    if (mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.altKey) return; // let the browser open a new tab
    if (selected === key && ev.type === 'click') return; // second click: follow the link
    ev.preventDefault();
    if (selected === key) { // second Enter: navigate
      const target = key.startsWith('p:') ? starByKey().get(key) : null;
      location.hash = target ? personHref(target.star.person.id) : workHref(key.slice(2));
      return;
    }
    selected = key;
    preview(null);
    if (key.startsWith('p:')) { const s = starByKey().get(key); if (s) peekStar(s); }
    else { const w = workByKey().get(key); if (w) peekWork(w); }
  }

  function draw(): void {
    const cfg = narrowMq.matches ? NARROW : WIDE;
    layout = layoutEgo(ring, ring.length > 1 ? frequent : [], cfg);
    svg = drawEgo(canvas, p!, layout, cfg, { preview, activate });
    note.hidden = layout.hidden === 0;
    note.textContent = layout.hidden ? `Showing the ${layout.stars.length} most frequent co-stars; all ${frequent.length} are in the list view.` : '';
    preview(null);
  }

  draw();
  const onMq = () => draw();
  narrowMq.addEventListener('change', onMq);
  const offPeek = onPeekClose(() => { selected = null; preview(null); });
  return () => { narrowMq.removeEventListener('change', onMq); offPeek(); };
}
