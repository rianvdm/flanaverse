/**
 * "Your path": the last six entity pages visited, as chips under the header.
 * Stored in sessionStorage (wrapped: private windows may throw).
 */
import { html, mountHtml } from '../lib/html';
import { glyph, type EntityKind } from './chips';
import './trail.css';

export interface TrailItem { kind: EntityKind; title: string; href: string }
const KEY = 'flanaverse.trail';
const MAX = 6;

function read(): TrailItem[] { try { return JSON.parse(sessionStorage.getItem(KEY) ?? '[]'); } catch { return []; } }
function write(items: TrailItem[]): void { try { sessionStorage.setItem(KEY, JSON.stringify(items)); } catch { /* ignore */ } }

/** Views call this once they know what entity they show. */
export function recordVisit(item: TrailItem): void {
  const items = read().filter((i) => i.href !== item.href);
  items.push(item);
  write(items.slice(-MAX));
  renderTrail();
}

let host: HTMLElement | null = null;
export function mountTrail(el: HTMLElement): void { host = el; renderTrail(); }

export function renderTrail(): void {
  if (!host) return;
  const items = read();
  const current = location.hash;
  host.hidden = items.length < 2;
  mountHtml(host, html`<span class="trail__label">Your path</span>
    <ol class="trail__list">${items.map((i) => html`<li>${i.href === current ? html`<span class="trail__item is-current" aria-current="page">${glyph(i.kind)}${i.title}</span>` : html`<a class="trail__item" href="${i.href}">${glyph(i.kind)}${i.title}</a>`}</li>`)}</ol>`);
}
