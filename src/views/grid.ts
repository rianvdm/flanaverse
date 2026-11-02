/**
 * Cast Grid (#/grid): people × core works incidence matrix. Answers "who keeps
 * showing up". All view state lives in the query string so a grid is shareable:
 *   #/grid?min=3&sort=first&format=series&chars=1&crew=1
 */
import type { Route } from '../lib/router';
import { setQuery } from '../lib/router';
import { html, mountHtml, plural, type Raw } from '../lib/html';
import { model, personHref, workHref, isActing, isKeyCrew } from '../data/model';
import type { Work, Person, Appearance } from '../data/types';
import { openPeek, onPeekClose } from '../components/peek';
import { appearsInStrip } from '../components/strip';
import '../styles/grid.css';

type Sort = 'works' | 'first' | 'name' | 'cluster';
type Format = 'all' | 'film' | 'series';
type Level = 'main' | 'support' | 'guest' | 'crew';

interface State { min: number; sort: Sort; format: Format; chars: boolean; crew: boolean }

interface Cell { app: Appearance; level: Level }
interface Row { person: Person; cells: (Cell | null)[]; count: number; first: number }

const MIN_MIN = 1, MAX_MIN = 8, DEFAULT_MIN = 2;
const SORTS: { id: Sort; label: string }[] = [
  { id: 'works', label: 'Most works' },
  { id: 'first', label: 'First appearance' },
  { id: 'name', label: 'Name A–Z' },
  { id: 'cluster', label: 'Cluster by works' },
];
const FORMATS: { id: Format; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'film', label: 'Films' },
  { id: 'series', label: 'Series' },
];
const LEVEL_LABEL: Record<Level, string> = { main: 'Main cast', support: 'Supporting', guest: 'Guest / one episode', crew: 'Crew only' };

/** Short column labels; long titles would push the rotated headers past 120px. */
const SHORT: Record<string, string> = {
  'ouija-origin-of-evil': 'Ouija',
  'the-haunting-of-hill-house': 'Hill House',
  'the-haunting-of-bly-manor': 'Bly Manor',
  'the-fall-of-the-house-of-usher': 'Usher',
};
const shortTitle = (w: Work) => SHORT[w.slug] ?? w.title.replace(/^The /, '');

function readState(q: URLSearchParams): State {
  const min = Number(q.get('min'));
  const sort = q.get('sort') as Sort;
  const format = q.get('format') as Format;
  return {
    min: Number.isInteger(min) && min >= MIN_MIN && min <= MAX_MIN ? min : DEFAULT_MIN,
    sort: SORTS.some((s) => s.id === sort) ? sort : 'works',
    format: FORMATS.some((f) => f.id === format) ? format : 'all',
    chars: q.get('chars') === '1',
    crew: q.get('crew') === '1',
  };
}

/** Defaults are omitted so the canonical URL stays short. */
function writeState(s: State): void {
  setQuery({
    min: s.min === DEFAULT_MIN ? undefined : s.min,
    sort: s.sort === 'works' ? undefined : s.sort,
    format: s.format === 'all' ? undefined : s.format,
    chars: s.chars ? 1 : undefined,
    crew: s.crew ? 1 : undefined,
  });
}

/** Main / supporting / guest from episode share (series) or billing order (films). */
function actingLevel(w: Work, a: Appearance): Level {
  if (w.kind === 'series') {
    const total = w.episodeCount ?? 0;
    if (total > 0 && a.episodeCount >= total * 0.6) return 'main';
    return a.episodeCount >= 2 ? 'support' : 'guest';
  }
  if (a.order == null) return 'guest';
  if (a.order < 8) return 'main';
  return a.order < 20 ? 'support' : 'guest';
}

function cellFor(w: Work, a: Appearance | undefined, crew: boolean): Cell | null {
  if (!a) return null;
  if (isActing(a)) return { app: a, level: actingLevel(w, a) };
  if (crew && a.jobs.length > 0) return { app: a, level: 'crew' };
  return null;
}

function buildRows(columns: Work[], s: State): Row[] {
  const rows: Row[] = [];
  for (const person of model.people.values()) {
    const byWork = new Map(person.appearances.map((a) => [a.work, a]));
    const cells = columns.map((w) => cellFor(w, byWork.get(w.slug), s.crew));
    const count = cells.filter(Boolean).length;
    if (count < s.min) continue;
    // Crew-only rows need at least one key-crew job, so drivers and stunt
    // doubles with two credits don't flood the grid.
    if (cells.every((c) => !c || c.level === 'crew') && !person.appearances.some(isKeyCrew)) continue;
    rows.push({ person, cells, count, first: cells.findIndex(Boolean) });
  }
  const byName = (a: Row, b: Row) => a.person.name.localeCompare(b.person.name);
  const pattern = (r: Row) => r.cells.map((c) => (c ? '1' : '0')).join('');
  const cmp: Record<Sort, (a: Row, b: Row) => number> = {
    works: (a, b) => b.count - a.count || a.first - b.first || byName(a, b),
    first: (a, b) => a.first - b.first || b.count - a.count || byName(a, b),
    name: byName,
    cluster: (a, b) => pattern(b).localeCompare(pattern(a)) || b.count - a.count || byName(a, b),
  };
  return rows.sort(cmp[s.sort]);
}

/** Second half of a role line: "10 of 10 episodes" / "billed #2" / the jobs. */
function roleMeta(w: Work, c: Cell): string {
  const a = c.app;
  if (c.level === 'crew') return a.jobs.join(', ');
  if (w.kind === 'series') return `${a.episodeCount} of ${w.episodeCount ?? '?'} episodes`;
  return a.order != null ? `billed #${a.order + 1}` : LEVEL_LABEL[c.level];
}

/** "as Theodora Crain · 10 of 10 episodes", or "Director, Writer" for crew. */
function roleLine(w: Work, c: Cell): string {
  return c.level === 'crew' ? roleMeta(w, c) : `as ${c.app.characters.join(' / ')} · ${roleMeta(w, c)}`;
}

function renderCell(p: Person, w: Work, c: Cell | null, r: number, col: number, s: State): Raw {
  if (!c) return html`<td class="cg-cell cg-cell--empty"></td>`;
  const label = `${p.name} ${roleLine(w, c)} (${w.title}, ${LEVEL_LABEL[c.level].toLowerCase()})`;
  const text = s.chars ? (c.level === 'crew' ? c.app.jobs[0] : c.app.characters[0]) : '';
  return html`<td class="cg-cell"><button type="button" class="cg-mark cg-mark--${c.level}" data-r="${r}" data-c="${col}" tabindex="-1" title="${label}" aria-label="${label}">${text ? html`<span class="cg-mark__text">${text}</span>` : ''}</button></td>`;
}

function renderTable(columns: Work[], rows: Row[], s: State): Raw {
  if (!columns.length || !rows.length) {
    return html`<p class="muted cg-empty">Nobody appears in ${s.min} or more of these works. Lower "Min works" to see more people.</p>`;
  }
  const totals = columns.map((_, i) => rows.filter((r) => r.cells[i] && r.cells[i]!.level !== 'crew').length);
  return html`<table class="cg-table">
    <caption class="visually-hidden">Cast grid: ${plural(rows.length, 'person', 'people')} by ${plural(columns.length, 'work')}. Cells mark an acting role${s.crew ? ' or a crew credit' : ''}.</caption>
    <thead>
      <tr>
        <th scope="col" class="cg-corner"><span class="kicker">Person</span><span class="kicker cg-corner__n">Works</span></th>
        ${columns.map((w) => html`<th scope="col" class="cg-col">
          <a href="${workHref(w.slug)}" title="${w.title} (${w.year})">
            ${w.poster ? html`<img src="${w.poster}" alt="" loading="lazy" width="40" height="60">` : html`<span class="cg-col__noimg"></span>`}
            <span class="cg-col__title" aria-hidden="true">${shortTitle(w)}</span>
            <span class="visually-hidden">${w.title}, ${w.year}</span>
          </a>
        </th>`)}
        <th scope="col" class="cg-count cg-count--head"><abbr title="Number of works in this grid">N</abbr></th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((row, r) => html`<tr>
        <th scope="row" class="cg-row">
          <a href="${personHref(row.person.id)}">
            ${row.person.profile ? html`<img class="cg-row__img" src="${row.person.profile}" alt="" loading="lazy" width="22" height="22">` : html`<span class="cg-row__img cg-row__img--empty"></span>`}
            <span class="cg-row__name">${row.person.name}</span>
            <span class="cg-row__n num" aria-hidden="true">${row.count}</span>
          </a>
        </th>
        ${columns.map((w, col) => renderCell(row.person, w, row.cells[col], r, col, s))}
        <td class="cg-count num">${row.count}</td>
      </tr>`)}
    </tbody>
    <tfoot>
      <tr>
        <th scope="row" class="cg-row cg-row--foot">Recurring actors</th>
        ${totals.map((n, i) => html`<td class="cg-total num" title="${plural(n, 'recurring actor')} in ${columns[i].title}">${n}</td>`)}
        <td class="cg-count"></td>
      </tr>
    </tfoot>
  </table>`;
}

function legendItem(level: Level): Raw {
  return html`<span class="cg-mark cg-mark--${level} cg-mark--swatch" aria-hidden="true"></span>${LEVEL_LABEL[level]}`;
}

function renderControls(s: State): Raw {
  return html`<div class="filters cg-filters" role="group" aria-label="Grid controls">
    <span class="cg-stepper" role="group" aria-label="Minimum works">
      <span>Min works</span>
      <button type="button" class="btn cg-step" data-step="-1" aria-label="Fewer works" ${s.min <= MIN_MIN ? 'disabled' : ''}>−</button>
      <output class="num cg-step__value" tabindex="-1" aria-live="polite">${s.min}</output>
      <button type="button" class="btn cg-step" data-step="1" aria-label="More works" ${s.min >= MAX_MIN ? 'disabled' : ''}>+</button>
    </span>
    <label>Sort
      <select class="cg-sort">${SORTS.map((o) => html`<option value="${o.id}" ${o.id === s.sort ? 'selected' : ''}>${o.label}</option>`)}</select>
    </label>
    <span class="seg" role="group" aria-label="Format">${FORMATS.map((f) => html`<button type="button" class="btn" data-format="${f.id}" aria-pressed="${String(f.id === s.format)}">${f.label}</button>`)}</span>
    <button type="button" class="btn" data-toggle="chars" aria-pressed="${String(s.chars)}">Show characters</button>
    <button type="button" class="btn" data-toggle="crew" aria-pressed="${String(s.crew)}">Include crew</button>
  </div>`;
}

function peekPerson(p: Person, focus: { work: Work; cell: Cell }): void {
  const lines = model.coreWorks
    .map((w) => {
      const c = cellFor(w, p.appearances.find((x) => x.work === w.slug), true);
      return c ? { w, c } : null;
    })
    .filter((x): x is { w: Work; c: Cell } => !!x);
  openPeek({
    kind: 'person',
    title: p.name,
    subtitle: `${focus.work.title}: ${roleLine(focus.work, focus.cell)}`,
    image: p.profileLarge ?? p.profile,
    imageShape: 'circle',
    href: personHref(p.id),
    body: html`
      ${appearsInStrip(lines.map((x) => x.w.slug), { compact: true })}
      <h3>${plural(lines.length, 'work')}</h3>
      <ul class="cg-peek-roles">${lines.map(({ w, c }) => html`<li class="${w.slug === focus.work.slug ? 'is-current' : ''}">
        <span class="cg-mark cg-mark--${c.level} cg-mark--swatch" aria-hidden="true"></span>
        <span><a href="${workHref(w.slug)}">${w.title}</a> <span class="muted">${roleLine(w, c)}</span></span>
      </li>`)}</ul>`,
  });
}

/** One tooltip for every cell, positioned against the viewport. */
function createTip(): HTMLElement {
  const tip = document.createElement('div');
  tip.className = 'cg-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.appendChild(tip);
  return tip;
}

function showTip(tip: HTMLElement, target: HTMLElement, p: Person, w: Work, c: Cell): void {
  const who = c.level === 'crew' ? html`<strong>${p.name}</strong>` : html`<strong>${p.name}</strong> as ${c.app.characters.join(' / ')}`;
  mountHtml(tip, html`${who}<span class="cg-tip__meta">${w.title} · ${roleMeta(w, c)}</span>`);
  tip.hidden = false;
  const r = target.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  const left = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), window.innerWidth - t.width - 8);
  const above = r.top - t.height - 8;
  tip.style.left = `${left}px`;
  tip.style.top = `${above > 8 ? above : r.bottom + 8}px`;
}

export default function render(route: Route, mount: HTMLElement) {
  let state = readState(route.query);
  let columns: Work[] = [];
  let rows: Row[] = [];
  let selected: HTMLButtonElement | null = null;
  const tip = createTip();

  mountHtml(mount, html`<div class="page page--wide cg-page">
    <header class="cg-head">
      <p class="kicker">Cast Grid</p>
      <h1>Who keeps showing up</h1>
      <p class="muted cg-lede">Everyone in Flanagan's core films and series, one row each. Tap a cell for the role, a name for the person, a poster for the work.</p>
    </header>
    <div class="cg-controls"></div>
    <div class="cg-meta">
      <p class="cg-summary num" aria-live="polite"></p>
      <ul class="cg-legend" aria-label="Legend">
        <li>${legendItem('main')}</li><li>${legendItem('support')}</li><li>${legendItem('guest')}</li><li class="cg-legend__crew">${legendItem('crew')}</li>
      </ul>
    </div>
    <div class="cg-scroll"></div>
  </div>`);

  const controls = mount.querySelector<HTMLElement>('.cg-controls')!;
  const scroller = mount.querySelector<HTMLElement>('.cg-scroll')!;
  const summary = mount.querySelector<HTMLElement>('.cg-summary')!;
  const legendCrew = mount.querySelector<HTMLElement>('.cg-legend__crew')!;

  function update(next: Partial<State>, write = true): void {
    state = { ...state, ...next };
    if (write) writeState(state);
    columns = model.coreWorks.filter((w) => state.format === 'all' || (state.format === 'series') === (w.kind === 'series'));
    rows = buildRows(columns, state);
    selected = null;
    tip.hidden = true;
    mountHtml(controls, renderControls(state));
    mountHtml(scroller, renderTable(columns, rows, state));
    scroller.classList.toggle('is-chars', state.chars);
    legendCrew.hidden = !state.crew;
    const unit = { all: ['work', 'works'], film: ['film', 'films'], series: ['series', 'series'] }[state.format];
    summary.textContent = `${plural(rows.length, 'person', 'people')} in ${state.min} or more of ${plural(columns.length, unit[0], unit[1])}`;
    const first = scroller.querySelector<HTMLButtonElement>('.cg-mark');
    if (first) first.tabIndex = 0;
  }

  controls.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button');
    if (!b) return;
    const sel = b.dataset.step ? `[data-step="${b.dataset.step}"]` : b.dataset.format ? `[data-format="${b.dataset.format}"]` : `[data-toggle="${b.dataset.toggle}"]`;
    if (b.dataset.step) update({ min: Math.min(MAX_MIN, Math.max(MIN_MIN, state.min + Number(b.dataset.step))) });
    else if (b.dataset.format) update({ format: b.dataset.format as Format });
    else if (b.dataset.toggle === 'chars') update({ chars: !state.chars });
    else if (b.dataset.toggle === 'crew') update({ crew: !state.crew });
    // Re-rendering replaced the control; keep keyboard focus on its successor.
    const again = controls.querySelector<HTMLButtonElement>(sel);
    (again && !again.disabled ? again : controls.querySelector<HTMLElement>('output'))?.focus();
  });
  controls.addEventListener('change', (e) => {
    const t = e.target as HTMLSelectElement;
    if (!t.classList.contains('cg-sort')) return;
    update({ sort: t.value as Sort });
    controls.querySelector<HTMLSelectElement>('.cg-sort')?.focus();
  });

  const lookup = (b: HTMLElement) => {
    const row = rows[Number(b.dataset.r)], col = Number(b.dataset.c);
    return { row, work: columns[col], cell: row.cells[col]! };
  };

  scroller.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('.cg-mark');
    if (!b) return;
    const { row, work, cell } = lookup(b);
    if (selected === b) { location.hash = personHref(row.person.id); return; }   // second tap opens the page
    selected?.classList.remove('is-selected');
    selected = b;
    b.classList.add('is-selected');
    roveTo(b, false);
    peekPerson(row.person, { work, cell });
  });

  /** Light the hovered cell's row and column headers so long rows stay legible. */
  const setHot = (b: HTMLElement | null) => {
    scroller.querySelectorAll('.is-hot').forEach((el) => el.classList.remove('is-hot'));
    if (!b) return;
    b.closest('tr')?.classList.add('is-hot');
    scroller.querySelectorAll('.cg-col')[Number(b.dataset.c)]?.classList.add('is-hot');
  };
  const onOver = (e: Event) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('.cg-mark');
    if (!b) return;
    const { row, work, cell } = lookup(b);
    setHot(b);
    showTip(tip, b, row.person, work, cell);
  };
  const hideTip = () => { tip.hidden = true; setHot(null); };
  scroller.addEventListener('mouseover', onOver);
  scroller.addEventListener('focusin', onOver);
  scroller.addEventListener('mouseleave', hideTip);
  scroller.addEventListener('focusout', hideTip);
  scroller.addEventListener('scroll', hideTip, { passive: true });
  window.addEventListener('scroll', hideTip, { passive: true });

  /** Roving tabindex: one cell is in the tab order; arrows move between filled cells. */
  function roveTo(b: HTMLButtonElement, focus = true): void {
    scroller.querySelectorAll<HTMLButtonElement>('.cg-mark[tabindex="0"]').forEach((x) => { x.tabIndex = -1; });
    b.tabIndex = 0;
    if (focus) { b.focus(); b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  }
  const at = (r: number, c: number) => scroller.querySelector<HTMLButtonElement>(`.cg-mark[data-r="${r}"][data-c="${c}"]`);
  const STEP: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };

  scroller.addEventListener('keydown', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('.cg-mark');
    if (!b) return;
    const r = Number(b.dataset.r), c = Number(b.dataset.c);
    let target: HTMLButtonElement | null = null;
    if (e.key in STEP) {
      const [dr, dc] = STEP[e.key];
      for (let rr = r + dr, cc = c + dc; rr >= 0 && rr < rows.length && cc >= 0 && cc < columns.length && !target; rr += dr, cc += dc) target = at(rr, cc);
    } else if (e.key === 'Home') target = scroller.querySelector<HTMLButtonElement>(`.cg-mark[data-r="${r}"]`);
    else if (e.key === 'End') target = [...scroller.querySelectorAll<HTMLButtonElement>(`.cg-mark[data-r="${r}"]`)].pop() ?? null;
    else return;
    e.preventDefault();
    if (target) roveTo(target);
  });

  const offClose = onPeekClose(() => { selected?.classList.remove('is-selected'); selected = null; });

  update({}, false);

  return () => {
    offClose();
    window.removeEventListener('scroll', hideTip);
    tip.remove();
  };
}
