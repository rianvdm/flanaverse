/**
 * #/search?q=: full results page for the shared search index, grouped by kind.
 * Typing updates the query (replaceState, debounced) and re-renders results.
 */
import type { Route } from '../lib/router';
import { setQuery } from '../lib/router';
import { html, mountHtml, plural, type Raw } from '../lib/html';
import { model } from '../data/model';
import { glyph, CATEGORY_LABEL, type EntityKind } from '../components/chips';
import { search, type SearchDoc } from '../components/palette';
import '../styles/search.css';

interface Group { key: string; label: string; kind: EntityKind; match: (d: SearchDoc) => boolean }

/** Grouped by the document id prefix the palette index assigns (work:, person:, conn:, author:). */
const GROUPS: Group[] = [
  { key: 'work', label: 'Works', kind: 'work', match: (d) => d.id.startsWith('work:') },
  { key: 'person', label: 'People', kind: 'person', match: (d) => d.id.startsWith('person:') },
  { key: 'conn', label: 'Props, eggs & themes', kind: 'prop', match: (d) => d.id.startsWith('conn:') },
  { key: 'author', label: 'Authors', kind: 'author', match: (d) => d.id.startsWith('author:') },
];

const SUGGESTIONS = ['Lasser Glass', 'Henry Thomas', 'Midnight Mass', 'Stephen King', 'mirror'];

/** A friendlier sub-line than the raw index field, where the model can give one. */
function subFor(d: SearchDoc): string {
  if (d.id.startsWith('conn:')) {
    const c = model.connectionById.get(d.id.slice(5));
    return c ? `${CATEGORY_LABEL[c.category]} · ${c.summary}` : d.sub;
  }
  if (d.id.startsWith('work:')) {
    const w = model.workBySlug.get(d.id.slice(5));
    return w ? `${w.year} · ${w.kind === 'series' ? 'Series' : w.kind === 'short' ? 'Short' : 'Film'}` : d.sub;
  }
  return d.sub;
}

function result(d: SearchDoc): Raw {
  const shape = d.id.startsWith('person:') ? 'circle' : d.id.startsWith('work:') ? 'poster' : 'still';
  return html`<li><a class="sr-item" href="${d.href}">
    ${d.image ? html`<img class="sr-item__img sr-item__img--${shape}" src="${d.image}" alt="" loading="lazy">`
      : html`<span class="sr-item__img sr-item__img--${shape} sr-item__img--empty">${glyph(d.kind)}</span>`}
    <span class="sr-item__text">
      <span class="sr-item__title">${glyph(d.kind)}<span>${d.title}</span></span>
      <span class="sr-item__sub">${subFor(d)}</span>
    </span>
  </a></li>`;
}

function resultsMarkup(q: string): Raw {
  if (!q.trim()) {
    return html`<div class="sr-empty"><p>Search works, people, props, eggs and authors.</p>
      <p class="sr-suggest">Try ${SUGGESTIONS.map((s, i) => html`${i ? ', ' : ''}<a href="#/search?q=${encodeURIComponent(s)}" data-q="${s}">${s}</a>`)}.</p></div>`;
  }
  const docs = search(q, 60);
  if (!docs.length) {
    return html`<div class="sr-empty"><p>Nothing found for “${q}”.</p><p class="sr-suggest">Check the spelling, or browse <a href="#/works">works</a>, <a href="#/people">people</a> or <a href="#/connections">props &amp; eggs</a>.</p></div>`;
  }
  const groups = GROUPS.map((g) => ({ g, items: docs.filter(g.match) })).filter((x) => x.items.length);
  return html`<p class="sr-count ui num" aria-live="polite">${plural(docs.length, 'result')} for “${q}”</p>
    ${groups.map(({ g, items }) => html`<section class="sr-group sr-group--${g.key}" aria-labelledby="sr-${g.key}">
      <h2 id="sr-${g.key}" class="sr-group__head">${glyph(g.kind)}<span>${g.label}</span><span class="num">${items.length}</span></h2>
      <ul class="sr-list">${items.map(result)}</ul>
    </section>`)}`;
}

export default function render(route: Route, mount: HTMLElement) {
  let q = route.query.get('q') ?? '';
  document.title = q ? `“${q}” · Search · Flanaverse` : 'Search · Flanaverse';

  mountHtml(mount, html`<div class="page sr">
    <header class="sr-head">
      <p class="kicker">Search</p>
      <label class="sr-field">
        <span class="visually-hidden">Search the Flanaverse</span>
        <input class="sr-input" type="search" name="q" value="${q}" placeholder="Search works, people, props, eggs…" autocomplete="off" spellcheck="false">
      </label>
    </header>
    <div class="sr-results"></div>
  </div>`);

  const input = mount.querySelector<HTMLInputElement>('.sr-input')!;
  const out = mount.querySelector<HTMLElement>('.sr-results')!;
  const paint = () => {
    mountHtml(out, resultsMarkup(q));
    out.querySelectorAll<HTMLAnchorElement>('[data-q]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      input.value = a.dataset.q!;
      commit();
      input.focus();
    }));
  };
  const commit = () => {
    q = input.value;
    setQuery({ q: q.trim() || undefined });
    document.title = q.trim() ? `“${q.trim()}” · Search · Flanaverse` : 'Search · Flanaverse';
    paint();
  };

  let timer = 0;
  input.addEventListener('input', () => { window.clearTimeout(timer); timer = window.setTimeout(commit, 160); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { window.clearTimeout(timer); commit(); }
  });

  paint();
  if (!q) input.focus();
  return () => window.clearTimeout(timer);
}
