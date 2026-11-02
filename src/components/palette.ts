/**
 * Search palette: "/" or Cmd/Ctrl-K from anywhere. MiniSearch over works,
 * people, connections and authors; results grouped by type; Enter opens.
 */
import MiniSearch from 'minisearch';
import { html, mountHtml } from '../lib/html';
import { model, workHref, personHref, connectionHref, isActing } from '../data/model';
import { glyph, kindOf, type EntityKind } from './chips';
import './palette.css';

export interface SearchDoc { id: string; kind: EntityKind; title: string; sub: string; text: string; href: string; image: string | null; weight: number }

let index: MiniSearch<SearchDoc> | null = null;
let docs: SearchDoc[] = [];

export function buildSearchIndex(): MiniSearch<SearchDoc> {
  if (index) return index;
  docs = [
    ...model.works.map<SearchDoc>((w) => ({ id: `work:${w.slug}`, kind: 'work', title: w.title, sub: `${w.year} · ${w.kind}`, text: `${w.overview} ${w.genres.join(' ')}`, href: workHref(w.slug), image: w.poster, weight: 3 })),
    ...[...model.people.values()].filter((p) => p.appearances.some(isActing) || p.appearances.length >= 2).map<SearchDoc>((p) => {
      const roles = p.appearances.map((a) => (a.characters.length ? a.characters.join(' ') : a.jobs.join(' '))).join(' ');
      const n = p.appearances.filter(isActing).length;
      return { id: `person:${p.id}`, kind: 'person', title: p.name, sub: n ? `${n} work${n === 1 ? '' : 's'}` : (p.knownForDepartment ?? ''), text: roles, href: personHref(p.id), image: p.profile, weight: 1 + Math.min(p.appearances.length, 6) * 0.3 };
    }),
    ...model.connections.map<SearchDoc>((c) => ({ id: `conn:${c.id}`, kind: kindOf(c.category), title: c.title, sub: c.category, text: `${c.summary} ${c.appearances.map((a) => a.note).join(' ')}`, href: connectionHref(c.id), image: c.image ?? null, weight: 2 })),
    ...model.authors.map<SearchDoc>((a) => ({ id: `author:${a.id}`, kind: 'author', title: a.name, sub: 'Source author', text: a.blurb, href: `#/sources#${a.id}`, image: null, weight: 2 })),
  ];
  index = new MiniSearch<SearchDoc>({ fields: ['title', 'sub', 'text'], storeFields: ['kind', 'title', 'sub', 'href', 'image', 'weight'], searchOptions: { boost: { title: 4, sub: 1.5 }, prefix: true, fuzzy: 0.2 } });
  index.addAll(docs);
  return index;
}

export function search(q: string, limit = 24): SearchDoc[] {
  if (!q.trim()) return [];
  return buildSearchIndex().search(q).map((r) => ({ ...(r as unknown as SearchDoc), score: r.score * (r as unknown as SearchDoc).weight }))
    .sort((a, b) => b.score - a.score).slice(0, limit);
}

let overlay: HTMLElement | null = null;

export function openPalette(initial = ''): void {
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'palette';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Search');
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closePalette(); });
  }
  mountHtml(overlay, html`<div class="palette__box">
    <input class="palette__input" type="search" placeholder="Search works, people, props, eggs…" aria-label="Search" autocomplete="off" value="${initial}">
    <ul class="palette__results" role="listbox"></ul>
    <p class="palette__hint ui">↑↓ to move · Enter to open · Esc to close</p>
  </div>`);
  overlay.hidden = false;
  const input = overlay.querySelector<HTMLInputElement>('.palette__input')!;
  const list = overlay.querySelector<HTMLUListElement>('.palette__results')!;
  let active = 0;
  const render = () => {
    const results = search(input.value, 16);
    active = Math.min(active, Math.max(results.length - 1, 0));
    mountHtml(list, results.length ? html`${results.map((r, i) => html`<li role="option" aria-selected="${i === active}" class="palette__item ${i === active ? 'is-active' : ''}">
      <a href="${r.href}">${r.image ? html`<img src="${r.image}" alt="" class="palette__img palette__img--${r.kind}">` : html`<span class="palette__img palette__img--${r.kind} palette__img--empty">${glyph(r.kind)}</span>`}<span class="palette__text"><span>${r.title}</span><span class="palette__sub">${glyph(r.kind)} ${r.sub}</span></span></a></li>`)}` : input.value.trim() ? html`<li class="palette__empty muted">Nothing found for “${input.value}”</li>` : html`<li class="palette__empty muted">Try “Lasser Glass”, “Henry Thomas” or “Midnight Mass”</li>`);
    list.querySelectorAll('a').forEach((a) => a.addEventListener('click', closePalette));
  };
  input.addEventListener('input', () => { active = 0; render(); });
  input.addEventListener('keydown', (e) => {
    const n = list.querySelectorAll('.palette__item').length;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % Math.max(n, 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + Math.max(n, 1)) % Math.max(n, 1); render(); }
    else if (e.key === 'Enter') { const a = list.querySelector<HTMLAnchorElement>('.palette__item.is-active a'); if (a) { closePalette(); location.hash = a.getAttribute('href')!.slice(1); } else if (input.value.trim()) { closePalette(); location.hash = `/search?q=${encodeURIComponent(input.value.trim())}`; } }
    else if (e.key === 'Escape') closePalette();
  });
  render();
  input.focus();
  input.select();
}

export function closePalette(): void { if (overlay) overlay.hidden = true; }

export function installPaletteShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); openPalette(); }
  });
}
