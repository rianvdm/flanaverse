/**
 * #/connection/:id: the object page. Hero, description, the object trail (one
 * marker per sighting on the shared date axis, poster above each work), the
 * sightings list with episode stills, people, related entries and sources.
 */
import type { Route } from '../lib/router';
import { html, mountHtml, plural, type Raw } from '../lib/html';
import { model, connectionHref, workHref, ERAS } from '../data/model';
import type { Connection, ConnectionAppearance, Episode, Person, Work } from '../data/types';
import { glyph, kindOf, CATEGORY_LABEL, personChip, connectionChip, chipList, workChip } from '../components/chips';
import { AXIS_FROM, AXIS_TO, xOfYear, yearOf } from '../components/strip';
import { recordVisit } from '../components/trail';
import { confidenceBadge, distinctWorks, posterThumb, CONFIDENCE_HINT } from './connections';
import '../styles/connection.css';

/* ---------- data helpers ---------- */

interface Sighting { app: ConnectionAppearance; work: Work; episode?: Episode; index: number }

const EP_RE = /S(\d+)\s*E(\d+)/i;

function episodeOf(w: Work, code?: string): Episode | undefined {
  const m = code ? EP_RE.exec(code) : null;
  if (!m) return undefined;
  return w.seasons.find((s) => s.number === Number(m[1]))?.episodes.find((e) => e.number === Number(m[2]));
}

function epSortKey(code?: string): number {
  const m = code ? EP_RE.exec(code) : null;
  return m ? Number(m[1]) * 1000 + Number(m[2]) : 0;
}

/** Appearances joined to their works, in release order then episode order. Unknown works are dropped. */
function sightingsOf(c: Connection): Sighting[] {
  return c.appearances
    .map((app, index) => ({ app, index, work: model.workBySlug.get(app.work) }))
    .filter((s): s is Omit<Sighting, 'episode'> & { work: Work } => !!s.work)
    .map((s) => ({ ...s, episode: episodeOf(s.work, s.app.episode) }))
    .sort((a, b) => a.work.releaseDate.localeCompare(b.work.releaseDate) || epSortKey(a.app.episode) - epSortKey(b.app.episode) || a.index - b.index);
}

function relatedTo(c: Connection): Connection[] {
  const mine = new Set(distinctWorks(c).map((w) => w.slug));
  const scored = model.connections
    .filter((o) => o.id !== c.id)
    .map((o) => ({ o, shared: distinctWorks(o).filter((w) => mine.has(w.slug)).length }));
  const byOverlap = scored.filter((x) => x.shared >= 2).sort((a, b) => b.shared - a.shared || a.o.title.localeCompare(b.o.title)).map((x) => x.o);
  const sameCat = scored.filter((x) => x.o.category === c.category && !byOverlap.includes(x.o))
    .sort((a, b) => b.shared - a.shared || a.o.title.localeCompare(b.o.title)).map((x) => x.o);
  return [...byOverlap, ...sameCat].slice(0, 6);
}

const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const paragraphs = (s: string) => s.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
const episodeLabel = (s: Sighting) => s.app.episode ? `${s.app.episode}${s.episode ? ` · ${s.episode.name}` : ''}` : '';

/* ---------- the object trail ---------- */

interface Column { work: Work; sightings: Sighting[]; trueX: number; x: number; lane: number; el: HTMLElement }

/**
 * 1-D label spreading: keeps sorted positions at least `gap` apart, centring each
 * merged cluster on the mean of its true positions, then clamps into [lo, hi].
 */
function spread(xs: number[], gap: number, lo: number, hi: number): number[] {
  let clusters = xs.map((x) => ({ start: x, n: 1, sum: x }));
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < clusters.length - 1; i++) {
      const a = clusters[i], b = clusters[i + 1];
      if (a.start + a.n * gap > b.start) {
        const n = a.n + b.n, sum = a.sum + b.sum;
        clusters.splice(i, 2, { start: sum / n - ((n - 1) * gap) / 2, n, sum });
        merged = true;
        break;
      }
    }
  }
  const out = clusters.flatMap((cl) => Array.from({ length: cl.n }, (_, k) => cl.start + k * gap));
  for (let i = 0; i < out.length; i++) out[i] = Math.max(out[i], i === 0 ? lo : out[i - 1] + gap);
  for (let i = out.length - 1; i >= 0; i--) out[i] = Math.min(out[i], i === out.length - 1 ? hi : out[i + 1] - gap);
  return out;
}

function trailMarkup(c: Connection, sightings: Sighting[]): Raw {
  const kind = kindOf(c.category);
  const byWork = new Map<string, Sighting[]>();
  for (const s of sightings) {
    if (!byWork.has(s.work.slug)) byWork.set(s.work.slug, []);
    byWork.get(s.work.slug)!.push(s);
  }
  return html`<figure class="ob-trail" aria-label="Object trail: where ${c.title} appears, by release date">
    <div class="ob-trail__stage">
      <svg class="ob-trail__svg" aria-hidden="true"></svg>
      ${[...byWork.values()].map((list) => html`<div class="ob-col" data-work="${list[0].work.slug}">
        ${posterThumb(list[0].work, 'sm')}
        <div class="ob-col__marks">${list.map((s) => html`<button type="button" class="ob-mark ob-mark--${kind}" data-index="${s.index}"
          aria-label="${s.work.title}${s.app.episode ? `, ${s.app.episode}` : ''}: ${s.app.note}" aria-expanded="false">${glyph(kind)}</button>`)}</div>
      </div>`)}
      <div class="ob-tip" role="tooltip" hidden></div>
    </div>
    <figcaption class="ob-trail__cap ui">Each mark is a sighting, placed at the work's release date. Select one for the note.</figcaption>
  </figure>`;
}

/** Lays the trail out in pixels for the current width; re-run on resize. */
function layoutTrail(stage: HTMLElement, cols: Column[]): void {
  const width = stage.clientWidth;
  if (!width || !cols.length) return;
  const narrow = width < 600;
  const thumbW = narrow ? 28 : 40, thumbH = thumbW * 1.5;
  const step = narrow ? 18 : 20;                       // marker pitch
  const pad = thumbW / 2 + 2;
  const hasEarly = cols.some((c) => c.work.year < AXIS_FROM);
  const earlyW = hasEarly ? Math.min(96, width * 0.14) : 0;
  const x0 = pad + earlyW, x1 = width - pad;
  const xMain = (y: number) => x0 + Math.min(Math.max(xOfYear(y, x1 - x0), 0), x1 - x0);

  const early = cols.filter((c) => c.work.year < AXIS_FROM);
  early.forEach((c, i) => { c.trueX = pad + ((i + 0.5) * (earlyW - 16)) / early.length; });
  cols.filter((c) => c.work.year >= AXIS_FROM).forEach((c) => { c.trueX = xMain(yearOf(c.work.releaseDate)); });

  const gap = thumbW + 8;
  const lanes = cols.length * gap > width - 2 * pad ? 2 : 1;
  const xs = spread(cols.map((c) => c.trueX), lanes === 2 ? gap / 2 : gap, pad, width - pad);
  cols.forEach((c, i) => { c.x = xs[i]; c.lane = lanes === 2 ? i % 2 : 0; });

  const maxMarks = Math.max(...cols.map((c) => c.sightings.length));
  const colH = thumbH + 6 + maxMarks * step;
  const laneH = colH + 10;
  const top = 6;
  const axisY = top + lanes * laneH + 20;
  const height = axisY + 28;
  stage.style.height = `${height}px`;

  for (const c of cols) {
    const colTop = top + (lanes - 1 - c.lane) * laneH;
    c.el.style.left = `${c.x - thumbW / 2}px`;
    c.el.style.top = `${colTop}px`;
    c.el.style.width = `${thumbW}px`;
    c.el.style.setProperty('--thumb-w', `${thumbW}px`);
    c.el.style.setProperty('--step', `${step}px`);
  }

  // SVG: era washes, axis, ticks, leaders from each column down to its date.
  const tickEvery = narrow ? 4 : 2;
  const ticks: number[] = [];
  for (let y = AXIS_FROM; y <= AXIS_TO; y++) ticks.push(y);
  const eras = ERAS.filter((e) => e.to >= AXIS_FROM && e.from <= AXIS_TO);
  const svg = stage.querySelector<SVGSVGElement>('.ob-trail__svg')!;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  const svgBody = html`
    ${eras.map((e, i) => {
      const a = xMain(Math.max(e.from, AXIS_FROM)), b = xMain(Math.min(e.to + 1, AXIS_TO));
      return html`<rect class="ob-era ${i % 2 ? 'ob-era--alt' : ''}" x="${a}" y="0" width="${b - a}" height="${axisY}"/>
        ${narrow ? '' : html`<text class="ob-era__label" x="${a + 6}" y="${axisY - 6}">${e.name}</text>`}`;
    })}
    ${hasEarly ? html`<line class="ob-axis" x1="${pad - 4}" x2="${x0 - 14}" y1="${axisY}" y2="${axisY}"/>
      <path class="ob-break" d="M${x0 - 11} ${axisY + 5} l4 -10 M${x0 - 6} ${axisY + 5} l4 -10"/>
      <text class="ob-tick__label" x="${(pad + x0 - 14) / 2}" y="${axisY + 20}" text-anchor="middle">Early</text>` : ''}
    <line class="ob-axis" x1="${x0}" x2="${x1}" y1="${axisY}" y2="${axisY}"/>
    ${ticks.map((y) => html`<line class="ob-tick" x1="${xMain(y)}" x2="${xMain(y)}" y1="${axisY}" y2="${axisY + (y % tickEvery === 0 ? 6 : 3)}"/>
      ${y % tickEvery === 0 ? html`<text class="ob-tick__label num" x="${xMain(y)}" y="${axisY + 20}" text-anchor="middle">${y}</text>` : ''}`)}
    ${cols.map((c) => {
      const bottom = top + (lanes - 1 - c.lane) * laneH + thumbH + 6 + c.sightings.length * step;
      const knee = axisY - 10;
      return html`<path class="ob-leader" data-work="${c.work.slug}" d="M${c.x} ${bottom} V${Math.max(knee, bottom)} L${c.trueX} ${axisY}"/>
        <circle class="ob-pin" data-work="${c.work.slug}" cx="${c.trueX}" cy="${axisY}" r="3"/>`;
    })}`;
  svg.innerHTML = svgBody.value;
}

/* ---------- view ---------- */

export default async function render(route: Route, mount: HTMLElement) {
  const c = model.connectionById.get(route.params.id);
  if (!c) {
    const nf = await import('./not-found');
    return nf.default(route, mount);
  }

  const kind = kindOf(c.category);
  const sightings = sightingsOf(c);
  const works = distinctWorks(c);
  const people = (c.people ?? []).map((id) => model.people.get(id)).filter((p): p is Person => !!p);
  const related = relatedTo(c);
  const first = works[0], last = works[works.length - 1];
  const bleedSrc = c.image ?? first?.backdrop ?? null;

  document.title = `${c.title} · Flanaverse`;
  recordVisit({ kind, title: c.title, href: connectionHref(c.id) });

  mountHtml(mount, html`<article class="ob ob--${kind}">
    <header class="ob-hero bleed">
      ${bleedSrc ? html`<div class="bleed__img" style="background-image:url('${bleedSrc}')"></div>` : ''}
      <div class="page ob-hero__inner ${c.image ? 'has-image' : ''}">
        <div class="ob-hero__text">
          <p class="kicker ob-kicker">${glyph(kind)}<span>${CATEGORY_LABEL[c.category]}</span>${confidenceBadge(c.confidence)}</p>
          <h1 class="ob-title">${c.title}</h1>
          <p class="ob-summary">${c.summary}</p>
        </div>
        ${c.image ? html`<figure class="ob-hero__fig"><img src="${c.image}" alt="${c.title}"></figure>` : ''}
      </div>
    </header>

    <div class="page ob-body">
      <div class="ob-intro">
        <div class="ob-desc prose">${paragraphs(c.description).map((p) => html`<p>${p}</p>`)}</div>
        <aside class="ob-facts" aria-label="At a glance">
          <dl>
            <div><dt>Kind</dt><dd>${glyph(kind)} ${CATEGORY_LABEL[c.category]}</dd></div>
            <div><dt>Confidence</dt><dd>${confidenceBadge(c.confidence)}<span class="ob-facts__hint">${CONFIDENCE_HINT[c.confidence]}</span></dd></div>
            <div><dt>Sightings</dt><dd class="num">${plural(sightings.length, 'sighting')} in ${plural(works.length, 'work')}</dd></div>
            ${first ? html`<div><dt>${works.length > 1 ? 'Span' : 'Seen in'}</dt><dd>${workChip(first, { year: true })}${works.length > 1 ? html`<span class="ob-facts__to" aria-hidden="true">to</span><span class="visually-hidden">to</span>${workChip(last, { year: true })}` : ''}</dd></div>` : ''}
          </dl>
          ${people.length ? html`<h2 class="ob-facts__h">People</h2>${chipList(people.map((p) => personChip(p)))}` : ''}
        </aside>
      </div>

      ${sightings.length ? html`<section class="section ob-trail-section" aria-labelledby="ob-trail-h">
        <div class="section__head"><h2 id="ob-trail-h">Object trail</h2><span class="ui muted num">${first.year === last.year ? first.year : `${first.year} to ${last.year}`}</span></div>
        ${trailMarkup(c, sightings)}
      </section>

      <section class="section" aria-labelledby="ob-sightings-h">
        <div class="section__head"><h2 id="ob-sightings-h">Sightings</h2><span class="ui muted num">${sightings.length}</span></div>
        <ol class="ob-sightings">
          ${sightings.map((s) => html`<li class="ob-sighting" data-index="${s.index}" id="sighting-${s.index}">
            ${posterThumb(s.work, 'sm')}
            <div class="ob-sighting__text">
              <p class="ob-sighting__head"><a href="${workHref(s.work.slug)}">${s.work.title}</a><span class="num muted"> ${s.work.year}</span>${episodeLabel(s) ? html`<span class="ob-sighting__ep">${episodeLabel(s)}</span>` : ''}</p>
              <p class="ob-sighting__note">${s.app.note}</p>
            </div>
            ${s.episode?.still ? html`<img class="ob-sighting__still" src="${s.episode.still}" alt="Still from ${s.work.title}, ${s.episode.name}" loading="lazy">` : ''}
          </li>`)}
        </ol>
      </section>` : ''}

      ${related.length ? html`<section class="section" aria-labelledby="ob-related-h">
        <div class="section__head"><h2 id="ob-related-h">Related</h2></div>
        ${chipList(related.map(connectionChip))}
      </section>` : ''}

      ${c.sources.length ? html`<section class="section" aria-labelledby="ob-sources-h">
        <div class="section__head"><h2 id="ob-sources-h">Sources</h2></div>
        <ul class="ob-sources">${c.sources.map((s) => html`<li><a href="${s.url}" target="_blank" rel="noopener">${s.label}</a>${hostOf(s.url) ? html` <span class="muted">${hostOf(s.url)}</span>` : ''}</li>`)}</ul>
      </section>` : ''}
    </div>
  </article>`);

  /* Trail interactivity: tooltip on hover/focus, pinned on click, linked to the list. */
  const stage = mount.querySelector<HTMLElement>('.ob-trail__stage');
  if (!stage) return;
  const tip = stage.querySelector<HTMLElement>('.ob-tip')!;
  const bySlug = new Map<string, Sighting[]>();
  sightings.forEach((s) => { if (!bySlug.has(s.work.slug)) bySlug.set(s.work.slug, []); bySlug.get(s.work.slug)!.push(s); });
  const cols: Column[] = [...stage.querySelectorAll<HTMLElement>('.ob-col')].map((el) => ({
    el, work: model.workBySlug.get(el.dataset.work!)!, sightings: bySlug.get(el.dataset.work!)!, trueX: 0, x: 0, lane: 0,
  }));
  const sightingByIndex = new Map(sightings.map((s) => [String(s.index), s]));
  let pinned: HTMLButtonElement | null = null;

  const showTip = (btn: HTMLButtonElement) => {
    const s = sightingByIndex.get(btn.dataset.index!)!;
    mountHtml(tip, html`<p class="ob-tip__head"><strong>${s.work.title}</strong> <span class="num">${s.work.year}</span>${episodeLabel(s) ? html` · ${episodeLabel(s)}` : ''}</p><p class="ob-tip__note">${s.app.note}</p>`);
    tip.hidden = false;
    const sr = stage.getBoundingClientRect(), br = btn.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const cx = br.left - sr.left + br.width / 2;
    tip.style.left = `${Math.min(Math.max(cx - tw / 2, 0), sr.width - tw)}px`;
    const above = br.top - sr.top - th - 8;
    tip.style.top = `${above >= 0 ? above : br.bottom - sr.top + 8}px`;
    stage.querySelectorAll('.ob-col').forEach((el) => el.classList.toggle('is-lit', el.contains(btn)));
    stage.querySelectorAll('.ob-leader, .ob-pin').forEach((el) => el.classList.toggle('is-lit', (el as SVGElement).dataset.work === s.work.slug));
    mount.querySelectorAll('.ob-sighting').forEach((li) => li.classList.toggle('is-lit', (li as HTMLElement).dataset.index === btn.dataset.index));
  };
  const hideTip = () => {
    if (pinned) { showTip(pinned); return; }
    tip.hidden = true;
    stage.querySelectorAll('.is-lit').forEach((el) => el.classList.remove('is-lit'));
    mount.querySelectorAll('.ob-sighting.is-lit').forEach((el) => el.classList.remove('is-lit'));
  };
  const unpin = () => {
    pinned?.setAttribute('aria-expanded', 'false');
    pinned = null;
    hideTip();
  };

  stage.querySelectorAll<HTMLButtonElement>('.ob-mark').forEach((btn) => {
    btn.addEventListener('mouseenter', () => showTip(btn));
    btn.addEventListener('mouseleave', hideTip);
    btn.addEventListener('focus', () => showTip(btn));
    btn.addEventListener('blur', () => { if (pinned !== btn) hideTip(); });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (pinned === btn) { unpin(); return; }
      pinned?.setAttribute('aria-expanded', 'false');
      pinned = btn;
      btn.setAttribute('aria-expanded', 'true');
      showTip(btn);
    });
  });
  const onDocClick = (e: MouseEvent) => { if (pinned && !tip.contains(e.target as Node)) unpin(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && pinned) unpin(); };
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKey);

  let lastWidth = 0;
  const ro = new ResizeObserver(() => {
    if (stage.clientWidth === lastWidth) return;
    lastWidth = stage.clientWidth;
    tip.hidden = true;
    layoutTrail(stage, cols);
    if (pinned) showTip(pinned);
  });
  ro.observe(stage);
  layoutTrail(stage, cols);

  return () => {
    ro.disconnect();
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onKey);
  };
}
