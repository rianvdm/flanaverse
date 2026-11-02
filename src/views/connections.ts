/**
 * #/connections: the Props & Eggs catalogue. Every curated connection except
 * themes (they have their own page), filterable by category, work, confidence,
 * cross-work only and free text. Filter state lives in the query string.
 *
 * Also exports the small card-level helpers the object and themes pages reuse
 * (confidence badge, poster thumb, distinct works).
 */
import type { Route } from '../lib/router';
import { setQuery } from '../lib/router';
import { html, mountHtml, plural, type Raw } from '../lib/html';
import { model, connectionHref, workHref } from '../data/model';
import type { Connection, ConnectionCategory, Confidence, Work } from '../data/types';
import { glyph, kindOf, CATEGORY_LABEL } from '../components/chips';
import '../styles/connections.css';

/* ---------- helpers shared with connection.ts and themes.ts ---------- */

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  confirmed: 'Confirmed',
  reported: 'Reported',
  'fan-theory': 'Fan theory',
};

export const CONFIDENCE_HINT: Record<Confidence, string> = {
  confirmed: 'Confirmed on screen or by the filmmakers',
  reported: 'Reported by press or cast, not confirmed on screen',
  'fan-theory': 'A fan reading; unconfirmed',
};

/** Confidence as a text badge; the border style differs too, so colour is never the only cue. */
export function confidenceBadge(c: Confidence): Raw {
  return html`<span class="conf conf--${c}" title="${CONFIDENCE_HINT[c]}">${CONFIDENCE_LABEL[c]}</span>`;
}

/** Distinct known works a connection appears in, in release order. */
export function distinctWorks(c: Connection): Work[] {
  const seen = new Set<string>();
  const out: Work[] = [];
  for (const a of c.appearances) {
    const w = model.workBySlug.get(a.work);
    if (w && !seen.has(w.slug)) { seen.add(w.slug); out.push(w); }
  }
  return out.sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
}

/** Small poster thumbnail linking to the work: 'xs' 28×42, 'sm' 40×60. */
export function posterThumb(w: Work, size: 'xs' | 'sm' = 'xs'): Raw {
  return html`<a class="pthumb pthumb--${size}" href="${workHref(w.slug)}" title="${w.title} (${w.year})">${w.poster
    ? html`<img src="${w.poster}" alt="${w.title}" loading="lazy">`
    : html`<span>${w.title}</span>`}</a>`;
}

/* ---------- the catalogue ---------- */

/** Flagship entries pinned to the top of the unfiltered catalogue, if present. */
const FEATURED = ['lasser-glass', 'hill-house-hidden-ghosts', 'dark-tower-markers'];

const CATEGORIES: { key: ConnectionCategory; label: string }[] = [
  { key: 'prop', label: 'Props' },
  { key: 'location', label: 'Locations' },
  { key: 'egg', label: 'Easter eggs' },
  { key: 'callback', label: 'Callbacks' },
  { key: 'reference', label: 'References' },
  { key: 'cameo', label: 'Cameos' },
];

interface Filters { cat: ConnectionCategory | ''; work: string; conf: '' | 'confirmed'; cross: boolean; q: string }

function readFilters(q: URLSearchParams): Filters {
  const cat = q.get('cat') ?? '';
  const work = q.get('work') ?? '';
  return {
    cat: CATEGORIES.some((c) => c.key === cat) ? (cat as ConnectionCategory) : '',
    work: model.workBySlug.has(work) ? work : '',
    conf: q.get('conf') === 'confirmed' ? 'confirmed' : '',
    cross: q.get('cross') === '1',
    q: q.get('q') ?? '',
  };
}

function writeFilters(f: Filters): void {
  setQuery({ cat: f.cat || undefined, work: f.work || undefined, conf: f.conf || undefined, cross: f.cross ? 1 : undefined, q: f.q.trim() || undefined });
}

const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

function matches(c: Connection, f: Filters): boolean {
  if (f.cat && c.category !== f.cat) return false;
  if (f.work && !c.appearances.some((a) => a.work === f.work)) return false;
  if (f.conf && c.confidence !== f.conf) return false;
  if (f.cross && distinctWorks(c).length < 2) return false;
  const q = norm(f.q.trim());
  if (q) {
    const hay = norm([c.title, c.summary, c.description, ...c.appearances.map((a) => a.note), ...distinctWorks(c).map((w) => w.title)].join(' '));
    if (!q.split(/\s+/).every((t) => hay.includes(t))) return false;
  }
  return true;
}

function sortEntries(list: Connection[], pinFeatured: boolean): Connection[] {
  const featured = pinFeatured ? FEATURED.map((id) => list.find((c) => c.id === id)).filter((c): c is Connection => !!c) : [];
  const rest = list.filter((c) => !featured.includes(c))
    .map((c) => ({ c, n: distinctWorks(c).length }))
    .sort((a, b) => b.n - a.n || a.c.title.localeCompare(b.c.title))
    .map((x) => x.c);
  return [...featured, ...rest];
}

function card(c: Connection, featured: boolean): Raw {
  const kind = kindOf(c.category);
  const works = distinctWorks(c);
  const MAX_THUMBS = 7;
  return html`<li class="cx-card cx-card--${kind} ${featured ? 'cx-card--featured' : ''}">
    ${c.image ? html`<div class="cx-card__img"><img src="${c.image}" alt="" loading="lazy"></div>` : ''}
    <div class="cx-card__body">
      <p class="kicker cx-card__kicker">${glyph(kind)}<span>${CATEGORY_LABEL[c.category]}</span>${featured ? html`<span class="cx-card__flag">Featured</span>` : ''}</p>
      <h3 class="cx-card__title"><a href="${connectionHref(c.id)}">${c.title}</a></h3>
      <p class="cx-card__summary">${c.summary}</p>
    </div>
    <div class="cx-card__foot">
      <span class="cx-card__thumbs" aria-label="Appears in">${works.slice(0, MAX_THUMBS).map((w) => posterThumb(w))}${works.length > MAX_THUMBS ? html`<span class="cx-card__more num">+${works.length - MAX_THUMBS}</span>` : ''}</span>
      <div class="cx-card__meta">
        <span class="cx-card__n num">${plural(works.length, 'work')}</span>
        ${confidenceBadge(c.confidence)}
      </div>
    </div>
  </li>`;
}

export default function render(route: Route, mount: HTMLElement) {
  document.title = 'Props & Eggs · Flanaverse';
  const all = model.connections.filter((c) => c.category !== 'theme');
  const f = readFilters(route.query);
  const counts = new Map(CATEGORIES.map((c) => [c.key, all.filter((x) => x.category === c.key).length]));
  const crossCount = all.filter((c) => distinctWorks(c).length >= 2).length;
  const worksInUse = model.coreWorks.filter((w) => all.some((c) => c.appearances.some((a) => a.work === w.slug)));

  mountHtml(mount, html`<div class="page cx">
    <header class="cx-head">
      <p class="kicker">Props &amp; Eggs</p>
      <h1>Objects, names and hidden things</h1>
      <p class="cx-lede">The mirror that keeps turning up, the ghosts tucked into the background of Hill House, the surnames and lines Flanagan carries from one work into the next.${all.length ? html` <span class="num">${plural(all.length, 'entry', 'entries')}</span>, <span class="num">${crossCount}</span> of them in more than one work.` : ''}</p>
      <dl class="cx-stats">
        ${CATEGORIES.map((c) => html`<div class="cx-stat cx-stat--${kindOf(c.key)}">
          <dt>${glyph(kindOf(c.key))}<span>${c.label}</span></dt>
          <dd class="num">${counts.get(c.key) ?? 0}</dd>
        </div>`)}
      </dl>
    </header>

    <div class="cx-filters" role="search" aria-label="Filter props and eggs">
      <div class="cx-cats" role="group" aria-label="Category">
        <button type="button" class="btn" data-cat="" aria-pressed="${String(!f.cat)}">All</button>
        ${CATEGORIES.map((c) => html`<button type="button" class="btn" data-cat="${c.key}" aria-pressed="${String(f.cat === c.key)}">${glyph(kindOf(c.key))}${c.label}</button>`)}
      </div>
      <div class="filters cx-row">
        <label>Work
          <select name="work">
            <option value="">All works</option>
            ${worksInUse.map((w) => html`<option value="${w.slug}" ${w.slug === f.work ? html`selected` : ''}>${w.title} (${w.year})</option>`)}
          </select>
        </label>
        <div class="seg" role="group" aria-label="Confidence">
          <button type="button" class="btn" data-conf="" aria-pressed="${String(!f.conf)}">All</button>
          <button type="button" class="btn" data-conf="confirmed" aria-pressed="${String(f.conf === 'confirmed')}">Confirmed only</button>
        </div>
        <button type="button" class="btn cx-cross" aria-pressed="${String(f.cross)}">Cross-work only</button>
        <label class="cx-q"><span class="visually-hidden">Filter by text</span>
          <input type="search" name="q" placeholder="Filter by text…" value="${f.q}" autocomplete="off">
        </label>
      </div>
    </div>

    <p class="cx-count ui" aria-live="polite"></p>
    <ul class="cx-grid"></ul>
  </div>`);

  const root = mount.querySelector<HTMLElement>('.cx')!;
  const grid = root.querySelector<HTMLUListElement>('.cx-grid')!;
  const count = root.querySelector<HTMLElement>('.cx-count')!;
  const input = root.querySelector<HTMLInputElement>('input[name="q"]')!;
  const select = root.querySelector<HTMLSelectElement>('select[name="work"]')!;

  const syncButtons = () => {
    root.querySelectorAll<HTMLButtonElement>('[data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === f.cat)));
    root.querySelectorAll<HTMLButtonElement>('[data-conf]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.conf === f.conf)));
    root.querySelector('.cx-cross')!.setAttribute('aria-pressed', String(f.cross));
  };

  const update = () => {
    const filtered = all.filter((c) => matches(c, f));
    const pin = !f.cat && !f.work && !f.conf && !f.cross && !f.q.trim();
    const list = sortEntries(filtered, pin);
    const pinned = new Set(pin ? FEATURED : []);
    count.textContent = all.length === 0 ? ''
      : filtered.length === all.length ? `Showing all ${all.length}` : `Showing ${filtered.length} of ${all.length}`;
    mountHtml(grid, list.length
      ? html`${list.map((c) => card(c, pinned.has(c.id)))}`
      : html`<li class="cx-empty"><p>${all.length ? 'Nothing matches these filters.' : 'The catalogue is still being written.'}</p>${all.length ? html`<button type="button" class="btn cx-reset">Clear filters</button>` : ''}</li>`);
    grid.querySelector('.cx-reset')?.addEventListener('click', () => {
      Object.assign(f, { cat: '', work: '', conf: '', cross: false, q: '' });
      input.value = '';
      select.value = '';
      apply();
    });
  };

  const apply = () => { syncButtons(); writeFilters(f); update(); };

  root.querySelectorAll<HTMLButtonElement>('[data-cat]').forEach((b) => b.addEventListener('click', () => { f.cat = (b.dataset.cat ?? '') as Filters['cat']; apply(); }));
  root.querySelectorAll<HTMLButtonElement>('[data-conf]').forEach((b) => b.addEventListener('click', () => { f.conf = (b.dataset.conf ?? '') as Filters['conf']; apply(); }));
  root.querySelector('.cx-cross')!.addEventListener('click', () => { f.cross = !f.cross; apply(); });
  select.addEventListener('change', () => { f.work = select.value; apply(); });

  let timer = 0;
  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { f.q = input.value; writeFilters(f); update(); }, 150);
  });

  update();
  return () => window.clearTimeout(timer);
}
