/**
 * The peek panel: a right-side drawer (desktop) or bottom sheet (mobile) that
 * previews an entity without leaving the current view. One click on a node
 * opens it; "Open page" navigates. Esc closes. Opening again swaps contents.
 */
import { html, mountHtml, type Raw } from '../lib/html';
import type { EntityKind } from './chips';
import { glyph } from './chips';
import './peek.css';

export interface PeekContent {
  kind: EntityKind;
  title: string;
  subtitle?: string;
  image?: string | null;        // headshot or poster path
  imageShape?: 'circle' | 'poster';
  body: Raw;                    // works strip, chips, a paragraph
  href: string;                 // full page
}

let host: HTMLElement | null = null;
let lastFocus: Element | null = null;
const closeListeners = new Set<() => void>();

function ensureHost(): HTMLElement {
  if (host) return host;
  host = document.createElement('aside');
  host.id = 'peek';
  host.className = 'peek';
  host.setAttribute('aria-label', 'Preview');
  host.hidden = true;
  document.body.appendChild(host);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && host && !host.hidden) closePeek(); });
  return host;
}

export function openPeek(c: PeekContent): void {
  const el = ensureHost();
  if (el.hidden) lastFocus = document.activeElement;
  mountHtml(el, html`
    <div class="peek__inner">
      <button class="peek__close" type="button" aria-label="Close preview">×</button>
      <div class="peek__head peek__head--${c.imageShape ?? 'circle'}">
        ${c.image ? html`<img class="peek__img" src="${c.image}" alt="">` : html`<span class="peek__img peek__img--empty">${glyph(c.kind)}</span>`}
        <div>
          <p class="kicker">${glyph(c.kind)} ${c.kind}</p>
          <h2 class="peek__title"><a href="${c.href}">${c.title}</a></h2>
          ${c.subtitle ? html`<p class="peek__sub">${c.subtitle}</p>` : ''}
        </div>
      </div>
      <div class="peek__body">${c.body}</div>
      <a class="btn btn--primary peek__open" href="${c.href}">Open page</a>
    </div>`);
  el.hidden = false;
  document.body.classList.add('has-peek');
  el.querySelector<HTMLButtonElement>('.peek__close')!.addEventListener('click', closePeek);
  el.querySelector<HTMLElement>('.peek__title a')?.focus({ preventScroll: true });
}

export function closePeek(): void {
  if (!host || host.hidden) return;
  host.hidden = true;
  document.body.classList.remove('has-peek');
  closeListeners.forEach((fn) => fn());
  if (lastFocus instanceof HTMLElement) lastFocus.focus({ preventScroll: true });
}

export function isPeekOpen(): boolean { return !!host && !host.hidden; }

/** Views that highlight a selection should clear it when the panel closes. */
export function onPeekClose(fn: () => void): () => void { closeListeners.add(fn); return () => closeListeners.delete(fn); }
