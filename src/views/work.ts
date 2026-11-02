/**
 * #/work/:slug: the work page. Backdrop hero, the story, recurring cast first
 * (people who also act in other works), full cast behind a disclosure, key
 * crew, episodes for series, connections, and the works it shares most cast with.
 * Curated metadata (model.workMeta) is optional; every section falls back to TMDB.
 */
import type { Route } from '../lib/router';
import { html, mountHtml, plural, type Raw } from '../lib/html';
import { model, recurringCast, actingWorks, personHref, workHref, slugify, type Edge } from '../data/model';
import { workChip, personChip, connectionChip, authorChip, headshot, posterCard, chipList, CATEGORY_LABEL } from '../components/chips';
import { recordVisit } from '../components/trail';
import type { Work, WorkMeta, Episode, Person, Connection, ConnectionCategory, CrewCredit } from '../data/types';
import '../styles/work.css';

const FLANAGAN_ID = 551463;

/* ---------- small helpers ---------- */

const KIND_LABEL: Record<Work['kind'], string> = { feature: 'Film', series: 'Series', short: 'Short film' };

const fmtDate = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const epCode = (e: Episode) => `S${e.season}E${e.number}`;

const person = (id: number): Person | undefined => model.people.get(id);

/** Comma-joined person links (for dense contexts such as episode credits). */
const nameLinks = (ids: number[]): Raw =>
  html`${ids.map((id, i) => {
    const p = person(id);
    return html`${i ? ', ' : ''}${p ? html`<a href="${personHref(id)}">${p.name}</a>` : ''}`;
  })}`;

/** Flanagan's jobs on a work, as readable role names, from TMDB crew credits. */
const ROLE_OF: Record<string, string> = {
  Creator: 'Creator', Director: 'Director', Writer: 'Writer', Screenplay: 'Writer', Teleplay: 'Writer',
  'Teleplay, Writer': 'Writer', Story: 'Writer', Editor: 'Editor', Producer: 'Producer', 'Executive Producer': 'Executive producer',
};
const ROLE_ORDER = ['Creator', 'Director', 'Writer', 'Editor', 'Producer', 'Executive producer'];
const rank = (role: string) => { const i = ROLE_ORDER.indexOf(role); return i < 0 ? ROLE_ORDER.length : i; };
function flanaganRoles(w: Work, meta?: WorkMeta): string[] {
  if (meta?.flanaganRoles?.length) return meta.flanaganRoles;
  const roles = new Set(w.crew.filter((c) => c.personId === FLANAGAN_ID).map((c) => ROLE_OF[c.job] ?? c.job));
  return [...roles].sort((a, b) => rank(a) - rank(b));
}

/** Key crew groups, in display order; the job is shown when a group mixes jobs. Source authors ("Novel") are in the hero. */
const CREW_GROUPS: { label: string; jobs: string[] }[] = [
  { label: 'Directed by', jobs: ['Director'] },
  { label: 'Written by', jobs: ['Writer', 'Screenplay', 'Teleplay', 'Teleplay, Writer', 'Story'] },
  { label: 'Cinematography', jobs: ['Director of Photography'] },
  { label: 'Music', jobs: ['Original Music Composer'] },
  { label: 'Editing', jobs: ['Editor'] },
  { label: 'Production design', jobs: ['Production Design'] },
  { label: 'Casting', jobs: ['Casting'] },
  { label: 'Producers', jobs: ['Producer', 'Executive Producer'] },
];

function crewGroups(w: Work): { label: string; people: { p: Person; jobs: string[] }[] }[] {
  return CREW_GROUPS.map((g) => {
    const byPerson = new Map<number, string[]>();
    for (const c of w.crew.filter((c: CrewCredit) => g.jobs.includes(c.job))) {
      byPerson.set(c.personId, [...(byPerson.get(c.personId) ?? []), c.job]);
    }
    const people = [...byPerson].map(([id, jobs]) => ({ p: person(id)!, jobs })).filter((x) => x.p);
    return { label: g.label, people };
  }).filter((g) => g.people.length);
}

/* ---------- sections ---------- */

function hero(w: Work, meta: WorkMeta | undefined): Raw {
  const platform = meta?.platform || w.networks?.[0];
  const length = w.kind === 'series'
    ? (w.episodeCount ? plural(w.episodeCount, 'episode') : '')
    : (w.runtime ? `${w.runtime} min` : '');
  const kicker = [String(w.year), KIND_LABEL[w.kind], length, platform, w.certification].filter(Boolean) as string[];
  const roles = flanaganRoles(w, meta);
  const flanagan = person(FLANAGAN_ID);

  // Source: curated author first; else TMDB "Novel" credits (e.g. Stephen King on Doctor Sleep).
  const novelists = w.crew.filter((c) => c.job === 'Novel').map((c) => person(c.personId)).filter((p): p is Person => !!p);
  const source: Raw | null = meta?.sourceMaterial
    ? html`${authorOrText(meta.sourceMaterial.author)} <span class="work-hero__source-title">${meta.sourceMaterial.title}</span>${meta.sourceMaterial.note ? html`<span class="work-hero__source-note">${meta.sourceMaterial.note}</span>` : ''}`
    : novelists.length ? html`${novelists.map((p) => authorOrText(p.name))}` : null;

  return html`<section class="work-hero bleed">
    ${w.backdrop ? html`<div class="bleed__img work-hero__bleed" style="background-image:url('${w.backdrop}')"></div>` : ''}
    <div class="work-hero__inner">
      <div class="work-hero__poster">
        ${w.poster ? html`<img src="${w.poster}" alt="${w.title} poster" width="500" height="750">` : html`<span class="work-hero__poster-empty">${w.title}</span>`}
      </div>
      <div class="work-hero__text">
        <p class="kicker work-hero__kicker num">${kicker.map((k, i) => html`${i ? html`<span class="work-hero__dot" aria-hidden="true">·</span>` : ''}<span>${k}</span>`)}</p>
        <h1 class="work-hero__title">${w.title}</h1>
        ${w.tagline ? html`<p class="work-hero__tagline">${w.tagline}</p>` : ''}
      </div>
      <dl class="work-hero__facts">
        ${roles.length ? html`<div><dt>Mike Flanagan</dt><dd>${flanagan ? html`<a class="work-hero__flanagan" href="${personHref(FLANAGAN_ID)}">${roles.join(', ')}</a>` : roles.join(', ')}</dd></div>` : ''}
        ${source ? html`<div><dt>Based on</dt><dd class="work-hero__source">${source}</dd></div>` : ''}
        ${w.genres.length ? html`<div><dt>Genre</dt><dd>${w.genres.join(' · ')}</dd></div>` : ''}
        ${w.tier !== 'core' ? html`<div><dt>Note</dt><dd>${w.tier === 'written' ? 'Written by Flanagan, directed by others' : w.tier === 'upcoming' ? 'Not yet released' : 'Early work, before Absentia'}</dd></div>` : ''}
        </dl>
    </div>
  </section>`;
}

function story(w: Work, meta: WorkMeta | undefined): Raw {
  const premise = meta?.premise || w.overview;
  if (!premise && !meta?.whyItMatters) return html``;
  return html`<section class="section work-story" id="story" data-nav="Story" aria-labelledby="h-story">
    <div class="section__head"><h2 id="h-story">The story</h2></div>
    <div class="prose">
      ${premise ? html`<p>${premise}</p>` : ''}
      ${meta?.whyItMatters ? html`<p class="work-story__why"><span class="kicker">Why it matters</span>${meta.whyItMatters}</p>` : ''}
    </div>
  </section>`;
}

function recurring(w: Work): Raw {
  const list = recurringCast(w);
  if (!list.length) {
    return html`<section class="section" id="recurring" data-nav="Recurring cast" aria-labelledby="h-recurring">
      <div class="section__head"><h2 id="h-recurring">Recurring cast</h2></div>
      <p class="muted">No one in this cast acts in another Flanagan work${w.tier === 'upcoming' ? ' yet' : ''}.</p>
    </section>`;
  }
  return html`<section class="section" id="recurring" data-nav="Recurring cast" aria-labelledby="h-recurring">
    <div class="section__head">
      <h2 id="h-recurring">Recurring cast</h2>
      <p class="section__note">${plural(list.length, 'actor')} who also ${list.length === 1 ? 'appears' : 'appear'} elsewhere in the Flanaverse</p>
    </div>
    <ul class="rc-grid">
      ${list.map(({ person: p, character, others }) => html`<li class="rc-card">
        <a class="rc-card__shot" href="${personHref(p.id)}" tabindex="-1" aria-hidden="true">${headshot(p, 'md')}</a>
        <div class="rc-card__body">
          <div class="rc-card__top">
            <a class="rc-card__name" href="${personHref(p.id)}">${p.name}</a>
            <span class="rc-card__count num">${plural(others.length + 1, 'work')}</span>
          </div>
          ${character ? html`<p class="rc-card__role">as ${character}</p>` : ''}
          <ul class="chips rc-card__works" aria-label="Also in">${others.map((o) => html`<li>${workChip(o)}</li>`)}</ul>
        </div>
      </li>`)}
    </ul>
  </section>`;
}

function fullCast(w: Work): Raw {
  const cast = w.cast.slice().sort((a, b) => a.order - b.order)
    .map((c) => ({ c, p: person(c.personId) })).filter((x): x is { c: typeof x.c; p: Person } => !!x.p);
  if (!cast.length) return html``;
  return html`<section class="section" id="cast" data-nav="Full cast">
    <details class="work-cast">
      <summary><span class="work-cast__label">Full cast</span><span class="num muted">${cast.length}</span></summary>
      <ul class="work-cast__list">
        ${cast.map(({ c, p }) => html`<li>
          ${personChip(p)}
          <span class="work-cast__role">${c.character || '—'}${c.episodeCount && w.kind === 'series' ? html`<span class="num"> · ${plural(c.episodeCount, 'ep')}</span>` : ''}</span>
        </li>`)}
      </ul>
    </details>
  </section>`;
}

function keyCrew(w: Work): Raw {
  const groups = crewGroups(w);
  if (!groups.length) return html``;
  return html`<section class="section" id="crew" data-nav="Key crew" aria-labelledby="h-crew">
    <div class="section__head"><h2 id="h-crew">Key crew</h2></div>
    <dl class="work-crew">
      ${groups.map((g) => {
        const mixed = new Set(g.people.flatMap((x) => x.jobs)).size > 1;
        return html`<div class="work-crew__row"><dt>${g.label}</dt><dd>${chipList(g.people.map(({ p, jobs }) => personChip(p, { role: mixed ? jobs.join(', ') : undefined })))}</dd></div>`;
      })}
    </dl>
  </section>`;
}

function episodeCard(e: Episode, meta: WorkMeta | undefined): Raw {
  const code = epCode(e);
  const note = meta?.episodeNotes?.[code];
  const recurringGuests = e.guestStars
    .map((g) => ({ g, p: person(g.personId) }))
    .filter((x): x is { g: typeof x.g; p: Person } => !!x.p && actingWorks(x.p).length >= 2);
  // Guest characters stay out of the chips to keep cards compact; the full cast lists them.
  return html`<li class="ep">
    <div class="ep__still">
      ${e.still ? html`<img src="${e.still}" alt="" loading="lazy" width="780" height="439">` : html`<span class="ep__still-empty num">${code}</span>`}
    </div>
    <div class="ep__body">
      <p class="ep__meta num"><span class="ep__code">${code}</span>${e.airDate ? html`<span>${fmtDate(e.airDate)}</span>` : ''}${e.runtime ? html`<span>${e.runtime} min</span>` : ''}</p>
      <h3 class="ep__title">${e.name}</h3>
      ${e.directors.length || e.writers.length ? html`<dl class="ep__credits">
        ${e.directors.length ? html`<div><dt>Directed by</dt><dd>${nameLinks(e.directors)}</dd></div>` : ''}
        ${e.writers.length ? html`<div><dt>Written by</dt><dd>${nameLinks(e.writers)}</dd></div>` : ''}
      </dl>` : ''}
      ${e.overview ? html`<p class="ep__overview">${e.overview}</p>` : ''}
      ${note ? html`<p class="ep__note"><span class="kicker">Look for</span>${note}</p>` : ''}
      ${recurringGuests.length ? html`<div class="ep__guests"><p class="kicker">Recurring guests</p>${chipList(recurringGuests.map(({ p }) => personChip(p)))}</div>` : ''}
    </div>
  </li>`;
}

function episodes(w: Work, meta: WorkMeta | undefined): Raw {
  if (w.kind !== 'series') return html``;
  const seasons = w.seasons.filter((s) => s.episodes.length);
  if (!seasons.length) return html``;
  const multi = w.seasons.length > 1;
  const pending = w.seasons.filter((s) => !s.episodes.length);
  return html`<section class="section" id="episodes" data-nav="Episodes" aria-labelledby="h-episodes">
    <div class="section__head">
      <h2 id="h-episodes">Episodes</h2>
      <p class="section__note num">${plural(seasons.reduce((n, s) => n + s.episodes.length, 0), 'episode')}${pending.length ? ` · ${pending.map((s) => s.name).join(', ')} announced` : ''}</p>
    </div>
    ${seasons.map((s) => html`
      ${multi ? html`<h3 class="ep-season">${s.name}</h3>` : ''}
      <ol class="ep-grid">${s.episodes.map((e) => episodeCard(e, meta))}</ol>`)}
  </section>`;
}

function connections(w: Work): Raw {
  const list = model.connectionsByWork.get(w.slug) ?? [];
  if (!list.length) return html``;
  const byCat = new Map<ConnectionCategory, Connection[]>();
  for (const c of list) byCat.set(c.category, [...(byCat.get(c.category) ?? []), c]);
  const order = Object.keys(CATEGORY_LABEL) as ConnectionCategory[];
  return html`<section class="section" id="connections" data-nav="Connections" aria-labelledby="h-connections">
    <div class="section__head">
      <h2 id="h-connections">Connections in this work</h2>
      <p class="section__note"><a href="#/connections">All props &amp; eggs</a></p>
    </div>
    <div class="work-conn">
      ${order.filter((cat) => byCat.has(cat)).map((cat) => html`<div class="work-conn__group">
        <h3 class="work-conn__cat">${CATEGORY_LABEL[cat]}</h3>
        <ul class="work-conn__list">
          ${byCat.get(cat)!.map((c) => {
            const apps = c.appearances.filter((a) => a.work === w.slug);
            return html`<li>
              ${connectionChip(c)}
              ${apps.map((a) => html`<p class="work-conn__note">${a.episode ? html`<span class="num work-conn__ep">${a.episode}</span>` : ''}${a.note}</p>`)}
            </li>`;
          })}
        </ul>
      </div>`)}
    </div>
  </section>`;
}

function sharesCast(w: Work): Raw {
  const near = model.edges
    .filter((e: Edge) => (e.source === w.slug || e.target === w.slug) && e.actors.length)
    .map((e) => ({ other: model.workBySlug.get(e.source === w.slug ? e.target : e.source)!, actors: e.actors.map(person).filter((p): p is Person => !!p) }))
    .filter((x) => x.other)
    .sort((a, b) => b.actors.length - a.actors.length || a.other.releaseDate.localeCompare(b.other.releaseDate))
    .slice(0, 8);
  if (!near.length) return html``;
  return html`<section class="section" id="shares" data-nav="Shared cast" aria-labelledby="h-shares">
    <div class="section__head"><h2 id="h-shares">Shares the most cast with</h2></div>
    <ul class="shares">
      ${near.map(({ other, actors }) => html`<li class="shares__item" title="${actors.map((p) => p.name).join(', ')}">
        ${posterCard(other, { size: 'sm' })}
        <div class="shares__people">
          <a class="shares__title" href="${workHref(other.slug)}">${other.title}</a>
          <p class="shares__year num">${other.year} · ${KIND_LABEL[other.kind]}</p>
          <p class="shares__count num">${plural(actors.length, 'shared actor')}</p>
          <p class="shares__names">${nameLinks(actors.slice(0, 6).map((p) => p.id))}${actors.length > 6 ? html` <span class="muted">and ${actors.length - 6} more</span>` : ''}</p>
        </div>
      </li>`)}
    </ul>
  </section>`;
}

function trivia(meta: WorkMeta | undefined): Raw {
  if (!meta?.trivia?.length) return html``;
  return html`<section class="section" id="trivia" data-nav="Trivia" aria-labelledby="h-trivia">
    <div class="section__head"><h2 id="h-trivia">Trivia</h2></div>
    <ul class="work-trivia prose">${meta.trivia.map((t) => html`<li>${t}</li>`)}</ul>
  </section>`;
}

function links(w: Work, meta: WorkMeta | undefined): Raw {
  const tmdb = `https://www.themoviedb.org/${w.tmdb.type}/${w.tmdb.id}`;
  const wiki = meta?.wikipedia || `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(`${w.title} ${w.year}`)}`;
  return html`<footer class="section work-links">
    <a class="btn" href="${wiki}" target="_blank" rel="noopener">${meta?.wikipedia ? 'Wikipedia' : 'Search Wikipedia'} <span aria-hidden="true">↗</span></a>
    <a class="btn" href="${tmdb}" target="_blank" rel="noopener">TMDB <span aria-hidden="true">↗</span></a>
    <a class="btn" href="#/works">All works</a>
  </footer>`;
}

/** In-page jump links, built from the sections that rendered (those with data-nav). */
function fillJumps(mount: HTMLElement): void {
  const nav = mount.querySelector<HTMLElement>('.work-jumps');
  if (!nav) return;
  const targets = [...mount.querySelectorAll<HTMLElement>('[data-nav]')];
  // Plain #anchors would hit the hash router, so these are buttons that scroll.
  mountHtml(nav, html`${targets.map((t) => html`<button type="button" data-jump="${t.id}">${t.dataset.nav}</button>`)}`);
  nav.hidden = targets.length < 3;
}

/* ---------- view ---------- */

/** An author chip when the author has a section on #/sources, otherwise plain text. */
function authorOrText(name: string) {
  const id = slugify(name);
  return model.authors.some((a) => a.id === id) ? authorChip(id, name) : html`<span class="work-hero__source-author">${name}</span>`;
}

export default function render(route: Route, mount: HTMLElement) {
  const w = model.workBySlug.get(route.params.slug);
  if (!w) {
    document.title = 'Work not found · Flanaverse';
    mountHtml(mount, html`<div class="page"><p class="kicker">Not found</p><h1>No work called “${route.params.slug}”</h1><p class="prose">It may have been renamed. Browse <a href="#/works">all works</a> or press <kbd>/</kbd> to search.</p></div>`);
    return;
  }
  const meta = model.workMeta.get(w.slug);

  mountHtml(mount, html`<article class="work">
    ${hero(w, meta)}
    <div class="page work__body">
      <nav class="work-jumps" aria-label="On this page"></nav>
      ${story(w, meta)}
      ${recurring(w)}
      ${fullCast(w)}
      ${keyCrew(w)}
      ${episodes(w, meta)}
      ${connections(w)}
      ${sharesCast(w)}
      ${trivia(meta)}
      ${links(w, meta)}
    </div>
  </article>`);

  const onClick = (e: Event) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('[data-jump]');
    if (!btn) return;
    const target = mount.querySelector<HTMLElement>(`#${btn.dataset.jump}`);
    if (!target) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };
  mount.addEventListener('click', onClick);
  fillJumps(mount);

  document.title = `${w.title} · Flanaverse`;
  recordVisit({ kind: 'work', title: w.title, href: workHref(w.slug) });
  return () => mount.removeEventListener('click', onClick);
}
