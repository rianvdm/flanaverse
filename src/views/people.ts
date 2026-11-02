/**
 * #/people: the repertory index. A headshot grid of everyone who acts in a
 * core work, most-travelled first, with a "min works" control, a name or
 * character filter, and an "Include crew" toggle for key crew.
 * State lives in the query string: ?min=3&crew=1&q=siegel
 */
import type { Route } from '../lib/router';
import { setQuery } from '../lib/router';
import { html, mountHtml, type Raw } from '../lib/html';
import { model, isActing, isKeyCrew, eraFor } from '../data/model';
import { personCard } from '../components/chips';
import type { Appearance, Person, Work } from '../data/types';
import '../styles/people.css';

const MIN_WORKS = 1;
const MAX_WORKS = 7;
const DEFAULT_MIN = 2;
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];

/** Short era labels for the card caption ("Netflix era · 2018"). */
const ERA_SHORT: Record<string, string> = {
  early: 'Early era',
  independent: 'Indie era',
  netflix: 'Netflix era',
  amazon: 'Amazon era',
};

interface Entry {
  person: Person;
  acting: number;          // core works acted in
  withCrew: number;        // core works acted in or key-crewed
  isCrew: boolean;         // has key crew credits on core works
  jobs: string[];          // most frequent key jobs, for the crew caption
  firstActing: Work | null;
  firstAny: Work | null;
  haystack: string;        // normalised name + characters, for the filter
}

const normalise = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

const isKeyJob = (job: string) => isKeyCrew({ work: '', characters: [], jobs: [job], episodeCount: 0, order: null });

function coreWork(a: Appearance): Work | undefined {
  const w = model.workBySlug.get(a.work);
  return w && w.tier === 'core' ? w : undefined;
}

function earliest(apps: Appearance[]): Work | null {
  let first: Work | null = null;
  for (const a of apps) {
    const w = coreWork(a);
    if (w && (!first || w.releaseDate < first.releaseDate)) first = w;
  }
  return first;
}

/** Most frequent key jobs across core works, at most two. */
function topJobs(apps: Appearance[]): string[] {
  const counts = new Map<string, number>();
  for (const a of apps) for (const j of a.jobs) if (isKeyJob(j)) counts.set(j, (counts.get(j) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 2).map(([j]) => j);
}

let entriesCache: Entry[] | null = null;
function entries(): Entry[] {
  if (entriesCache) return entriesCache;
  const out: Entry[] = [];
  for (const person of model.people.values()) {
    const core = person.appearances.filter((a) => coreWork(a));
    const actingApps = core.filter(isActing);
    const crewApps = core.filter(isKeyCrew);
    if (!actingApps.length && !crewApps.length) continue;
    out.push({
      person,
      acting: actingApps.length,
      withCrew: core.filter((a) => isActing(a) || isKeyCrew(a)).length,
      isCrew: crewApps.length > 0,
      jobs: topJobs(core),
      firstActing: earliest(actingApps),
      firstAny: earliest(core.filter((a) => isActing(a) || isKeyCrew(a))),
      haystack: normalise([person.name, ...person.appearances.flatMap((a) => a.characters)].join(' ')),
    });
  }
  entriesCache = out;
  return out;
}

interface State { min: number; crew: boolean; q: string }

function readState(query: URLSearchParams): State {
  const n = Number(query.get('min'));
  return {
    min: Number.isInteger(n) && n >= MIN_WORKS && n <= MAX_WORKS ? n : DEFAULT_MIN,
    crew: query.get('crew') === '1',
    q: query.get('q') ?? '',
  };
}

const countFor = (e: Entry, crew: boolean) => (crew ? e.withCrew : e.acting);

function visible(state: State): Entry[] {
  return entries()
    .filter((e) => countFor(e, state.crew) >= state.min && (state.crew || e.acting > 0))
    .sort((a, b) => countFor(b, state.crew) - countFor(a, state.crew) || a.person.name.localeCompare(b.person.name));
}

function caption(e: Entry, crew: boolean): Raw {
  const n = countFor(e, crew);
  const first = crew ? e.firstAny : e.firstActing;
  const era = first ? ERA_SHORT[eraFor(first.year).id] ?? eraFor(first.year).name : '';
  const jobs = crew && e.isCrew ? e.jobs.join(' · ') : '';
  return html`<span class="people-card__count">${n} work${n === 1 ? '' : 's'}</span>${jobs ? html`<span class="people-card__jobs">${jobs}</span>` : ''}${first ? html`<span class="people-card__era" title="First appearance: ${first.title}">${era} · ${first.year}</span>` : ''}`;
}

function headline(state: State, total: number): Raw {
  const one = total === 1;
  const who = state.crew ? (one ? 'person' : 'people') : (one ? 'actor' : 'actors');
  const verb = state.crew ? (one ? 'has credits on' : 'have credits on') : (one ? 'appears in' : 'appear in');
  const span = state.min === 1 ? 'at least one work' : `${NUMBER_WORDS[state.min]} or more works`;
  return html`<span class="num">${total}</span> ${who} ${verb} ${span}`;
}

export default function render(route: Route, mount: HTMLElement) {
  document.title = 'People · Flanaverse';
  const state = readState(route.query);

  mountHtml(mount, html`
    <div class="page people">
      <header class="people__head">
        <p class="kicker">The repertory company</p>
        <h1>People</h1>
        <p class="people__lede">
          <span data-count></span>.
          <a class="people__grid-link" href="#/grid">See them as a cast grid →</a>
        </p>
      </header>

      <div class="filters people__filters">
        <div class="people__min">
          <span id="people-min-label">Min works</span>
          <div class="seg" role="group" aria-labelledby="people-min-label">
            ${Array.from({ length: MAX_WORKS - MIN_WORKS + 1 }, (_, i) => i + MIN_WORKS).map((n) => html`<button class="btn num" type="button" data-min="${n}" aria-pressed="${String(n === state.min)}">${n}</button>`)}
          </div>
        </div>
        <label class="people__search">
          <span class="visually-hidden">Filter by name or character</span>
          <input type="search" placeholder="Filter by name or character" autocomplete="off" spellcheck="false" value="${state.q}" data-q>
        </label>
        <button class="btn people__crew" type="button" aria-pressed="${String(state.crew)}" data-crew>Include crew</button>
      </div>

      <p class="people__status muted" aria-live="polite" data-status></p>
      <ul class="grid-people people__grid" data-grid></ul>
    </div>`);

  const grid = mount.querySelector<HTMLElement>('[data-grid]')!;
  const status = mount.querySelector<HTMLElement>('[data-status]')!;
  const count = mount.querySelector<HTMLElement>('[data-count]')!;
  const input = mount.querySelector<HTMLInputElement>('[data-q]')!;
  const crewBtn = mount.querySelector<HTMLButtonElement>('[data-crew]')!;
  const minBtns = [...mount.querySelectorAll<HTMLButtonElement>('[data-min]')];

  let rows: { el: HTMLElement; haystack: string }[] = [];

  const sync = () => setQuery({ min: state.min === DEFAULT_MIN ? undefined : state.min, crew: state.crew ? 1 : undefined, q: state.q || undefined });

  /** Re-renders the grid in one innerHTML pass (min or crew changed). */
  function renderGrid(): void {
    const list = visible(state);
    mountHtml(count, headline(state, list.length));
    mountHtml(grid, html`${list.map((e) => html`<li>${personCard(e.person, { caption: caption(e, state.crew) })}</li>`)}`);
    const items = [...grid.children] as HTMLElement[];
    rows = list.map((e, i) => ({ el: items[i], haystack: e.haystack }));
    applyFilter();
  }

  /** Hides non-matching cards without re-rendering (search-as-you-type). */
  function applyFilter(): void {
    const q = state.q.trim();
    const terms = normalise(q).split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const r of rows) {
      const hit = terms.every((t) => r.haystack.includes(t));
      r.el.hidden = !hit;
      if (hit) shown++;
    }
    if (!terms.length) status.textContent = '';
    else if (shown) status.textContent = `Showing ${shown} of ${rows.length} matching “${q}”`;
    else status.textContent = `No one here matches “${q}”. Try a lower minimum${state.crew ? '' : ' or include crew'}.`;
  }

  for (const b of minBtns) {
    b.addEventListener('click', () => {
      state.min = Number(b.dataset.min);
      minBtns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      sync();
      renderGrid();
    });
  }
  crewBtn.addEventListener('click', () => {
    state.crew = !state.crew;
    crewBtn.setAttribute('aria-pressed', String(state.crew));
    sync();
    renderGrid();
  });
  input.addEventListener('input', () => {
    state.q = input.value;
    sync();
    applyFilter();
  });

  renderGrid();
}
