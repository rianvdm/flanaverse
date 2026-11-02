/**
 * #/works: the poster wall. Core works in date order under era headings, then
 * small sections for early work, scripts directed by others, and what's next.
 * The film/series filter lives in the query string (?kind=film|series).
 */
import type { Route } from '../lib/router';
import { setQuery } from '../lib/router';
import { html, mountHtml, plural, type Raw } from '../lib/html';
import { model, ERAS, eraFor, recurringCast } from '../data/model';
import { posterCard } from '../components/chips';
import type { Work, WorkTier } from '../data/types';
import '../styles/works.css';

type KindFilter = 'all' | 'film' | 'series';

const FILTERS: { id: KindFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'film', label: 'Films' },
  { id: 'series', label: 'Series' },
];

/** The non-core tiers, shown after the eras in this order. */
const TAIL: { tier: Exclude<WorkTier, 'core'>; title: string; blurb: string }[] = [
  { tier: 'early', title: 'Early work', blurb: 'Before Absentia: the student-era features and the short that became Oculus.' },
  { tier: 'written', title: 'Written by Flanagan, directed by others', blurb: 'Scripts he wrote for other directors; the casts rarely overlap with his own company.' },
  { tier: 'upcoming', title: 'Coming next', blurb: 'Announced or in production. Dates and casts may still change.' },
];

const parseFilter = (v: string | null): KindFilter => (v === 'film' || v === 'series' ? v : 'all');
const matches = (w: Work, f: KindFilter) => f === 'all' || (f === 'series' ? w.kind === 'series' : w.kind !== 'series');

/** Platform (curated first, then the TMDB network) and how many of the cast act in other works. */
function caption(w: Work): Raw {
  const platform = model.workMeta.get(w.slug)?.platform || w.networks?.[0];
  const shared = recurringCast(w).length;
  return html`${platform ?? ''}${platform && shared ? ' · ' : ''}${shared ? html`<span class="num">${plural(shared, 'shared actor')}</span>` : ''}`;
}

const wall = (works: Work[]): Raw =>
  html`<ul class="grid-posters wall__grid">${works.map((w) => html`<li>${posterCard(w, { caption: caption(w) })}</li>`)}</ul>`;

function sections(filter: KindFilter): Raw {
  const core = model.works.filter((w) => w.tier === 'core' && matches(w, filter));
  const eras = ERAS.map((era) => ({ era, works: core.filter((w) => eraFor(w.year).id === era.id) })).filter((g) => g.works.length);
  const tails = TAIL.map((t) => ({ ...t, works: model.works.filter((w) => w.tier === t.tier && matches(w, filter)) })).filter((g) => g.works.length);

  return html`
    ${eras.map(({ era, works }) => html`
      <section class="wall__era" aria-labelledby="era-${era.id}">
        <header class="wall__era-head">
          <p class="kicker num">${era.from}–${era.to >= 2030 ? 'now' : era.to}</p>
          <h2 id="era-${era.id}">${era.name}</h2>
          <p class="wall__blurb">${era.blurb}</p>
        </header>
        ${wall(works)}
      </section>`)}
    ${tails.length ? html`<div class="wall__tails">
      ${tails.map((t) => html`
        <section class="wall__tail" style="--n:${t.works.length}" aria-labelledby="tier-${t.tier}">
          <header class="wall__tail-head">
            <h2 id="tier-${t.tier}">${t.title}</h2>
            <p class="wall__blurb">${t.blurb}</p>
          </header>
          ${wall(t.works)}
        </section>`)}
    </div>` : ''}
    ${!eras.length && !tails.length ? html`<p class="muted">No works match this filter.</p>` : ''}`;
}

export default function render(route: Route, mount: HTMLElement) {
  let filter = parseFilter(route.query.get('kind'));
  const core = model.coreWorks;
  const films = core.filter((w) => w.kind !== 'series').length;

  mountHtml(mount, html`<div class="page wall">
    <header class="wall__head">
      <p class="kicker">The works</p>
      <h1>Every film and series</h1>
      <p class="wall__intro">${plural(core.length, 'core work')}: ${plural(films, 'film')} and ${plural(core.length - films, 'series', 'series')}, from Absentia to now. Each poster counts the actors it shares with the rest of the Flanaverse.</p>
      <div class="filters wall__filters">
        <span class="seg" role="group" aria-label="Show">
          ${FILTERS.map((f) => html`<button class="btn" type="button" data-kind="${f.id}" aria-pressed="${f.id === filter}">${f.label}</button>`)}
        </span>
      </div>
    </header>
    <div class="wall__body"></div>
  </div>`);

  const body = mount.querySelector<HTMLElement>('.wall__body')!;
  const buttons = [...mount.querySelectorAll<HTMLButtonElement>('[data-kind]')];
  const paint = () => {
    mountHtml(body, sections(filter));
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === filter)));
  };
  paint();

  const onClick = (e: Event) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('[data-kind]');
    if (!btn) return;
    filter = parseFilter(btn.dataset.kind ?? null);
    setQuery({ kind: filter === 'all' ? undefined : filter });
    paint();
  };
  mount.addEventListener('click', onClick);
  document.title = 'Works · Flanaverse';
  return () => mount.removeEventListener('click', onClick);
}
