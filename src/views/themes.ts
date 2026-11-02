/**
 * #/themes: thematic throughlines (connections with category 'theme').
 * A Themes × Works grid (a mini Cast Grid: sticky headers, filled cell = the
 * theme shows up in that work), then one section per theme with per-work notes.
 */
import type { Route } from '../lib/router';
import { html, mountHtml, plural, type Raw } from '../lib/html';
import { model, connectionHref, workHref } from '../data/model';
import type { Connection, ConnectionAppearance, Work } from '../data/types';
import { glyph, workChip } from '../components/chips';
import { confidenceBadge } from './connections';
import '../styles/themes.css';

const paragraphs = (s: string) => s.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

/** Appearances grouped by work slug, in the order given. */
function appsByWork(t: Connection): Map<string, ConnectionAppearance[]> {
  const m = new Map<string, ConnectionAppearance[]>();
  for (const a of t.appearances) {
    if (!m.has(a.work)) m.set(a.work, []);
    m.get(a.work)!.push(a);
  }
  return m;
}

function noteText(apps: ConnectionAppearance[]): string {
  return apps.map((a) => (a.episode ? `${a.episode}: ${a.note}` : a.note)).join(' / ');
}

function grid(themes: Connection[], works: Work[]): Raw {
  return html`<div class="th-scroll" tabindex="0" role="region" aria-label="Themes by work grid">
    <table class="th-grid" style="--cols:${works.length}">
      <caption class="visually-hidden">Themes (rows) by work (columns). A filled cell means the theme runs through that work.</caption>
      <thead><tr>
        <th scope="col" class="th-corner"><span class="kicker">Theme</span></th>
        ${works.map((w, i) => html`<th scope="col" class="th-col" data-col="${i}">
          <a href="${workHref(w.slug)}" title="${w.title} (${w.year})">${w.poster ? html`<img src="${w.poster}" alt="${w.title}" width="32" height="48" loading="lazy">` : html`<span class="th-col__empty">${w.title}</span>`}</a>
          <span class="th-col__year num">’${String(w.year).slice(2)}</span>
        </th>`)}
        <th scope="col" class="th-total"><span class="kicker">Works</span></th>
      </tr></thead>
      <tbody>${themes.map((t) => {
        const by = appsByWork(t);
        const n = works.filter((w) => by.has(w.slug)).length;
        return html`<tr>
          <th scope="row" class="th-row"><a href="${connectionHref(t.id)}">${t.title}</a></th>
          ${works.map((w, i) => {
            const apps = by.get(w.slug);
            return apps
              ? html`<td data-col="${i}"><a class="th-cell is-on" href="${connectionHref(t.id)}" data-note="${noteText(apps)}" data-work="${w.title}" data-theme="${t.title}" aria-label="${t.title} in ${w.title}: ${noteText(apps)}"></a></td>`
              : html`<td data-col="${i}"><span class="th-cell" aria-hidden="true"></span><span class="visually-hidden">Not in ${w.title}</span></td>`;
          })}
          <td class="th-total num">${n}</td>
        </tr>`;
      })}</tbody>
    </table>
  </div>`;
}

function themeSection(t: Connection, order: Map<string, number>): Raw {
  const by = [...appsByWork(t)].filter(([slug]) => model.workBySlug.has(slug))
    .sort((a, b) => (order.get(a[0]) ?? 0) - (order.get(b[0]) ?? 0));
  return html`<section class="th-theme" id="theme-${t.id}" aria-labelledby="h-${t.id}">
    <header class="th-theme__head">
      <p class="kicker th-theme__kicker">${glyph('theme')}<span>Theme</span>${confidenceBadge(t.confidence)}</p>
      <h2 id="h-${t.id}"><a href="${connectionHref(t.id)}">${t.title}</a></h2>
      <p class="th-theme__summary">${t.summary}</p>
    </header>
    <div class="th-theme__body">
      <div class="th-theme__desc">${paragraphs(t.description).map((p) => html`<p>${p}</p>`)}</div>
      <ul class="th-notes">${by.map(([slug, apps]) => html`<li>
        <div class="th-notes__work">${workChip(model.workBySlug.get(slug)!, { year: true })}</div>
        <div class="th-notes__text">${apps.map((a) => html`<p>${a.episode ? html`<span class="th-notes__ep">${a.episode}</span>` : ''}${a.note}</p>`)}</div>
      </li>`)}</ul>
    </div>
  </section>`;
}

export default function render(_route: Route, mount: HTMLElement) {
  document.title = 'Themes · Flanaverse';
  const themes = model.connections.filter((c) => c.category === 'theme');
  const works = model.coreWorks;
  const order = new Map(model.works.map((w, i) => [w.slug, i]));
  // Most widespread first, so the grid reads densest at the top.
  const coverage = (t: Connection) => new Set(t.appearances.map((a) => a.work).filter((s) => works.some((w) => w.slug === s))).size;
  themes.sort((a, b) => coverage(b) - coverage(a) || a.title.localeCompare(b.title));

  mountHtml(mount, html`<div class="page th">
    <header class="th-head">
      <p class="kicker">Themes</p>
      <h1>What the stories keep circling</h1>
      <p class="th-lede">Grief, addiction, faith, family and the stories people tell to survive them. ${themes.length ? html`<span class="num">${plural(themes.length, 'theme')}</span> across <span class="num">${works.length}</span> works; select a filled cell to open the theme.` : ''}</p>
    </header>
    ${themes.length ? html`
      ${grid(themes, works)}
      <p class="th-legend ui"><span class="th-cell is-on" aria-hidden="true"></span> runs through the work <span class="th-cell" aria-hidden="true"></span> absent</p>
      <div class="th-tip" role="tooltip" hidden></div>
      <div class="th-list">${themes.map((t) => themeSection(t, order))}</div>`
    : html`<p class="muted ui">The theme notes are still being written.</p>`}
  </div>`);

  const tip = mount.querySelector<HTMLElement>('.th-tip');
  const table = mount.querySelector<HTMLTableElement>('.th-grid');
  if (!tip || !table) return;
  const cols = [...table.querySelectorAll<HTMLElement>('thead .th-col')];

  const light = (col: string | undefined) => cols.forEach((th) => th.classList.toggle('is-lit', th.dataset.col === col));
  const show = (a: HTMLAnchorElement) => {
    mountHtml(tip, html`<p class="th-tip__head"><strong>${a.dataset.theme}</strong> in ${a.dataset.work}</p><p class="th-tip__note">${a.dataset.note}</p>`);
    tip.hidden = false;
    const r = a.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const left = Math.min(Math.max(r.left + r.width / 2 - tw / 2, 8), window.innerWidth - tw - 8);
    const top = r.top - th - 8 >= 64 ? r.top - th - 8 : r.bottom + 8;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    light(a.closest('td')?.dataset.col);
  };
  const hide = () => { tip.hidden = true; light(undefined); };

  table.querySelectorAll<HTMLAnchorElement>('.th-cell.is-on').forEach((a) => {
    a.addEventListener('mouseenter', () => show(a));
    a.addEventListener('focus', () => show(a));
    a.addEventListener('mouseleave', hide);
    a.addEventListener('blur', hide);
  });
  table.querySelectorAll<HTMLElement>('tbody td[data-col]').forEach((td) => td.addEventListener('mouseenter', () => { if (!td.querySelector('.is-on')) light(td.dataset.col); }));
  table.addEventListener('mouseleave', hide);
  const scroller = mount.querySelector<HTMLElement>('.th-scroll')!;
  scroller.addEventListener('scroll', hide, { passive: true });
  window.addEventListener('scroll', hide, { passive: true });
  return () => window.removeEventListener('scroll', hide);
}
