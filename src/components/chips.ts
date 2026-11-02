/**
 * The shared entity vocabulary: one look per entity type everywhere.
 * Works = brass poster rectangles, people = bone circles, props = verdigris
 * diamonds, eggs = sanguine stars, authors = wisteria book spines, themes = tags.
 */
import { html, type Raw } from '../lib/html';
import { model, workHref, personHref, connectionHref } from '../data/model';
import type { Work, Person, Connection, ConnectionCategory } from '../data/types';
import './chips.css';

export type EntityKind = 'work' | 'person' | 'prop' | 'egg' | 'author' | 'theme';

export function kindOf(category: ConnectionCategory): EntityKind {
  switch (category) {
    case 'prop': case 'location': return 'prop';
    case 'reference': return 'author';
    case 'theme': return 'theme';
    default: return 'egg';
  }
}

export const CATEGORY_LABEL: Record<ConnectionCategory, string> = {
  prop: 'Prop', egg: 'Easter egg', callback: 'Callback', reference: 'Reference', cameo: 'Cameo', location: 'Location', theme: 'Theme',
};

/** Inline SVG glyph for a kind (used in chips, legends, search results). */
export function glyph(kind: EntityKind): Raw {
  const c = `glyph glyph--${kind}`;
  switch (kind) {
    case 'work': return html`<svg class="${c}" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="1.5" width="10" height="13" rx="1"/></svg>`;
    case 'person': return html`<svg class="${c}" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/></svg>`;
    case 'prop': return html`<svg class="${c}" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 14.5 8 8 14.5 1.5 8z"/></svg>`;
    case 'egg': return html`<svg class="${c}" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.2l2 4.4 4.8.5-3.6 3.2 1 4.7L8 11.6 3.8 14l1-4.7L1.2 6.1 6 5.6z"/></svg>`;
    case 'author': return html`<svg class="${c}" viewBox="0 0 16 16" aria-hidden="true"><rect x="4.5" y="1.5" width="7" height="13" rx="0.5"/><line x1="4.5" y1="4.5" x2="11.5" y2="4.5"/><line x1="4.5" y1="11.5" x2="11.5" y2="11.5"/></svg>`;
    case 'theme': return html`<svg class="${c}" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2h6l6 6-6 6-6-6z"/><circle cx="5.5" cy="5.5" r="1.2"/></svg>`;
  }
}

export function workChip(w: Work, opts: { year?: boolean } = {}): Raw {
  return html`<a class="chip chip--work" href="${workHref(w.slug)}">${glyph('work')}<span>${w.title}</span>${opts.year ? html`<span class="chip__meta num">${w.year}</span>` : ''}</a>`;
}

export function personChip(p: Person, opts: { role?: string; count?: boolean } = {}): Raw {
  const n = p.appearances.filter((a) => a.characters.length > 0).length;
  return html`<a class="chip chip--person" href="${personHref(p.id)}">${p.profile ? html`<img class="chip__img" src="${p.profile}" alt="" loading="lazy" width="20" height="20">` : glyph('person')}<span>${p.name}</span>${opts.role ? html`<span class="chip__meta">${opts.role}</span>` : ''}${opts.count && n > 1 ? html`<span class="chip__meta num">×${n}</span>` : ''}</a>`;
}

export function connectionChip(c: Connection): Raw {
  const kind = kindOf(c.category);
  return html`<a class="chip chip--${kind}" href="${connectionHref(c.id)}">${glyph(kind)}<span>${c.title}</span></a>`;
}

export function authorChip(id: string, name: string): Raw {
  return html`<a class="chip chip--author" href="#/sources#${id}">${glyph('author')}<span>${name}</span></a>`;
}

/** Circular headshot with a bone ring; sizes: 'sm' 40px, 'md' 64px, 'lg' 120px, 'xl' 200px. */
export function headshot(p: Person, size: 'sm' | 'md' | 'lg' | 'xl' = 'md'): Raw {
  const src = size === 'lg' || size === 'xl' ? (p.profileLarge ?? p.profile) : p.profile;
  const initials = p.name.split(/\s+/).map((s) => s[0]).slice(0, 2).join('');
  return src
    ? html`<span class="headshot headshot--${size}"><img src="${src}" alt="${p.name}" loading="lazy"></span>`
    : html`<span class="headshot headshot--${size} headshot--empty" aria-label="${p.name}"><span>${initials}</span></span>`;
}

/** Poster card linking to the work page. */
export function posterCard(w: Work, opts: { caption?: Raw | string; size?: 'sm' | 'md' | 'lg' } = {}): Raw {
  const size = opts.size ?? 'md';
  return html`<a class="poster poster--${size}" href="${workHref(w.slug)}">
    ${w.poster ? html`<img src="${w.poster}" alt="${w.title} poster" loading="lazy">` : html`<span class="poster__empty">${w.title}</span>`}
    <span class="poster__caption"><span class="poster__title">${w.title}</span><span class="poster__meta num">${w.year} · ${w.kind === 'series' ? `${w.episodeCount ?? '?'} episodes` : w.kind}</span>${opts.caption ? html`<span class="poster__extra">${opts.caption}</span>` : ''}</span>
  </a>`;
}

export function personCard(p: Person, opts: { caption?: Raw | string } = {}): Raw {
  const n = p.appearances.filter((a) => a.characters.length > 0).length;
  return html`<a class="person-card" href="${personHref(p.id)}">
    ${headshot(p, 'lg')}
    <span class="person-card__name">${p.name}</span>
    <span class="person-card__meta num">${opts.caption ?? (n ? `${n} work${n === 1 ? '' : 's'}` : (p.knownForDepartment ?? ''))}</span>
  </a>`;
}

export function chipList(items: Raw[], emptyText = 'None'): Raw {
  return items.length ? html`<ul class="chips">${items.map((c) => html`<li>${c}</li>`)}</ul>` : html`<p class="muted">${emptyText}</p>`;
}

export const workBySlug = (slug: string) => model.workBySlug.get(slug);
