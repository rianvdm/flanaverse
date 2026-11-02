/**
 * #/sources: the authors Flanagan adapts, one section per author (anchor id =
 * author.id; authorChip and search link to "#/sources?author=<id>"), a summary table,
 * and a note on the original stories.
 */
import type { Route } from '../lib/router';
import { setQuery } from '../lib/router';
import { html, mountHtml, plural, type Raw } from '../lib/html';
import { model } from '../data/model';
import type { Author, Connection, Work } from '../data/types';
import { glyph, posterCard, workChip, chipList, connectionChip } from '../components/chips';
import { appearsInStrip } from '../components/strip';
import '../styles/sources.css';

/** Used when works-meta.json has no entries yet. Oculus grew out of Flanagan's own short. */
const ORIGINALS_FALLBACK = ['absentia', 'oculus', 'before-i-wake', 'hush', 'ouija-origin-of-evil', 'midnight-mass'];

interface AuthorRow { author: Author; works: (Work | undefined)[]; years: string }

function yearsOf(works: Work[]): string {
  if (!works.length) return 'Not yet made';
  const ys = works.map((w) => w.year);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}

function originalWorks(): Work[] {
  const fromMeta = model.coreWorks.filter((w) => model.workMeta.get(w.slug)?.sourceMaterial === null);
  if (model.workMeta.size > 0) return fromMeta;
  return ORIGINALS_FALLBACK.map((s) => model.workBySlug.get(s)).filter((w): w is Work => !!w);
}

/** Reference entries that name this author: full name anywhere, or surname in the title. */
function referencesTo(a: Author): Connection[] {
  const surname = a.name.split(/\s+/).pop() ?? a.name;
  const word = new RegExp(`\\b${surname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  return model.connections.filter((c) => c.category === 'reference'
    && (`${c.title} ${c.summary} ${c.description}`.includes(a.name) || word.test(c.title)));
}

function authorSection(row: AuthorRow): Raw {
  const { author: a } = row;
  const made = row.works.filter((w): w is Work => !!w);
  const notes = Object.fromEntries(a.works.filter((x) => model.workBySlug.has(x.work)).map((x) => [x.work, x.title]));
  const refs = referencesTo(a);
  return html`<section class="src-author" id="${a.id}" aria-labelledby="h-${a.id}" tabindex="-1">
    <header class="src-author__head">
      <h2 id="h-${a.id}">${glyph('author')}<span>${a.name}</span></h2>
      <p class="src-author__meta ui num">${plural(a.works.length, 'adaptation')} · ${row.years}</p>
    </header>
    <div class="src-author__body">
      <p class="src-author__blurb">${a.blurb}</p>
      ${made.length > 1 ? html`<div class="src-author__strip">${appearsInStrip(made.map((w) => w.slug), { compact: true, notes })}</div>` : ''}
    </div>
    <ul class="src-works ${a.works.length === 1 ? 'src-works--single' : ''}">
      ${a.works.map((x, i) => {
        const w = row.works[i];
        const caption = html`<span class="src-works__orig"><em>${x.title}</em></span>${x.note ? html`<span class="src-works__note">${x.note}</span>` : ''}`;
        return html`<li>${w ? posterCard(w, { size: 'sm', caption }) : html`<div class="src-unmade">
          <span class="src-unmade__img">${glyph('author')}<span>${x.title}</span></span>
          <span class="poster__caption"><span class="poster__title">${x.title}</span><span class="poster__meta">Not yet made</span>${x.note ? html`<span class="poster__extra">${x.note}</span>` : ''}</span>
        </div>`}</li>`;
      })}
    </ul>
    ${refs.length ? html`<div class="src-author__refs"><h3 class="src-subhead">Nods elsewhere</h3>${chipList(refs.map(connectionChip))}</div>` : ''}
  </section>`;
}

function scrollToAuthor(id: string, smooth: boolean): void {
  const el = document.getElementById(id);
  if (!el?.classList.contains('src-author')) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: smooth && !reduce ? 'smooth' : 'auto', block: 'start' });
  el.focus({ preventScroll: true });
}

export default function render(route: Route, mount: HTMLElement) {
  document.title = 'Sources · Flanaverse';
  const rows: AuthorRow[] = model.authors.map((author) => {
    const works = author.works.map((x) => model.workBySlug.get(x.work));
    return { author, works, years: yearsOf(works.filter((w): w is Work => !!w)) };
  });
  // Earliest adaptation first; unmade-only authors last.
  const firstYear = (r: AuthorRow) => Math.min(...r.works.filter((w): w is Work => !!w).map((w) => w.year), 9999);
  rows.sort((a, b) => firstYear(a) - firstYear(b) || b.author.works.length - a.author.works.length);
  const originals = originalWorks();
  const adaptedCount = new Set(rows.flatMap((r) => r.works.filter((w): w is Work => !!w).map((w) => w.slug))).size;

  mountHtml(mount, html`<div class="page src">
    <header class="src-head">
      <p class="kicker">Sources</p>
      <h1>The authors he adapts</h1>
      <p class="src-lede">Most of Flanagan's work starts on someone else's page. ${rows.length ? html`These are the ${plural(rows.length, 'writer')} he has adapted, earliest first, with the original titles under each poster.` : ''}</p>
    </header>

    ${rows.length ? html`<div class="src-summary">
      <table class="src-table">
        <caption class="visually-hidden">Adapted authors, number of works and years</caption>
        <thead><tr><th scope="col">Author</th><th scope="col" class="src-count">Works</th><th scope="col">Years</th></tr></thead>
        <tbody>${rows.map((r) => html`<tr>
          <th scope="row"><a class="src-jump" href="#/sources?author=${r.author.id}" data-target="${r.author.id}">${glyph('author')}<span>${r.author.name}</span></a></th>
          <td class="src-count num">${r.author.works.length}</td>
          <td class="num">${r.years}</td>
        </tr>`)}</tbody>
      </table>
      <aside class="src-originals" aria-labelledby="src-originals-h">
        <h2 id="src-originals-h" class="src-subhead">Original stories</h2>
        <p>${originals.length ? html`<span class="num">${originals.length}</span> core works have no novel or story behind them; <span class="num">${adaptedCount}</span> adapt the writers below.` : 'Every core work in the data has source material.'}</p>
        ${chipList(originals.map((w) => workChip(w, { year: true })))}
      </aside>
    </div>` : html`<p class="muted ui">The author notes are still being written.</p>`}

    ${rows.map(authorSection)}
  </div>`);

  // In-page jumps update the query without a re-render or a history entry.
  mount.querySelectorAll<HTMLAnchorElement>('.src-jump').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    setQuery({ author: a.dataset.target });
    scrollToAuthor(a.dataset.target!, true);
  }));

  // Deep link: "#/sources?author=stephen-king" (authorChip, search results).
  const target = route.query.get('author');
  if (target) requestAnimationFrame(() => scrollToAuthor(target, false));
}

