/**
 * #/about: what the site is, how it was built, the TMDB notice and logo
 * (required by the TMDB API terms), data freshness, confidence labels,
 * research sources, how to send corrections, keyboard shortcuts and the
 * fan-project disclaimer.
 */
import type { Route } from '../lib/router';
import { html, mountHtml, type Raw } from '../lib/html';
import { model, workHref } from '../data/model';
import type { Confidence } from '../data/types';
import { glyph } from '../components/chips';
import { confidenceBadge, CONFIDENCE_HINT } from './connections';
import { CORRECTION_URL, CONTRIBUTING_URL, REPO_URL } from '../lib/links';
import '../styles/about.css';

/** Required TMDB notice; keep this wording exact. */
const TMDB_NOTICE = 'This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.';

/** The outlets research/*.md leans on most, by citation count (checked 2026-11-02). */
const OUTLETS = [
  'Wikipedia', 'TMDB', 'Netflix Tudum', 'Screen Rant', 'Collider', '/Film', 'Looper', 'TVLine', 'Deadline',
  'Fangoria', 'CinemaBlend', 'TV Insider', 'Den of Geek', 'The Hollywood Reporter', 'Bloody Disgusting', 'Variety', 'IndieWire',
];

const RESEARCH_FILES: { file: string; what: string }[] = [
  { file: 'filmography.md', what: 'Every Flanagan film and series, with credits, platforms and source material.' },
  { file: 'repertory-actors.md', what: 'The actors who keep coming back, and where each one turned up.' },
  { file: 'easter-eggs-and-props.md', what: 'Recurring props, hidden ghosts, name callbacks, cameos and locations, each with its sources.' },
  { file: 'design-references.md', what: 'Reference projects, layout choices, palette and type for this site.' },
];

const CONFIDENCE_ORDER: Confidence[] = ['confirmed', 'reported', 'fan-theory'];

const fmtDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function stat(n: number, label: string): Raw {
  return html`<div class="about-stat"><dt>${label}</dt><dd class="num">${n}</dd></div>`;
}

export default function render(_route: Route, mount: HTMLElement) {
  document.title = 'About & credits · Flanaverse';
  const newest = model.works.reduce((a, b) => (b.releaseDate > a.releaseDate ? b : a), model.works[0]);
  const today = new Date().toISOString().slice(0, 10);
  const props = model.connections.filter((c) => c.category !== 'theme').length;

  mountHtml(mount, html`<div class="page about">
    <header class="about-head">
      <p class="kicker">About &amp; credits</p>
      <h1>A fan map of Mike Flanagan's work</h1>
      <p class="about-lede">Flanaverse follows the actors who keep returning across Flanagan's films and series, the props and easter eggs that tie the works together, and the authors he adapts. It's a fan project, made for the fun of it.</p>
      <dl class="about-stats">
        ${stat(model.coreWorks.length, 'Core works')}
        ${stat(model.repertory.length, 'Actors in 2+ works')}
        ${stat(props, 'Props & eggs')}
        ${stat(model.authors.length, 'Authors')}
      </dl>
    </header>

    <div class="about-grid">
      <div class="about-main">
        <section class="about-sec" aria-labelledby="about-built">
          <h2 id="about-built">How it was built</h2>
          <p>Cast, crew, episodes, posters and stills come from the <a href="https://www.themoviedb.org/" target="_blank" rel="noopener">TMDB</a> API, fetched by a script and cached on disk. Everything else (the props, eggs, callbacks, themes, author notes and actor profiles) is hand-curated from published sources, and every entry lists the sources it rests on.</p>
          <p>The site was built in November 2026 with Vite, TypeScript and D3, with no framework. It is static: there is no server and no tracking. The code and the curated data are <a href="${REPO_URL}" target="_blank" rel="noopener">open on GitHub</a>.</p>
          <p class="about-fresh">Data fetched from TMDB in November 2026. The newest dated title in it is <a href="${workHref(newest.slug)}">${newest.title}</a>, ${newest.releaseDate > today ? 'due' : 'released'} ${fmtDate(newest.releaseDate)}. TMDB asks that cached data be refreshed within six months, so the next refresh is due by May 2027.</p>
        </section>

        <section class="about-sec" aria-labelledby="about-conf">
          <h2 id="about-conf">How sure are we?</h2>
          <p>Every prop, egg and theme carries one of three labels. The label is printed as text, and each has its own border style, so it never depends on colour.</p>
          <dl class="about-conf">
            ${CONFIDENCE_ORDER.map((c) => html`<div><dt>${confidenceBadge(c)}</dt><dd>${CONFIDENCE_HINT[c]}.</dd></div>`)}
          </dl>
          <p class="muted">Where sources disagree, the entry says so in its description. The research notes keep a list of open questions still to check frame by frame.</p>
        </section>

        <section class="about-sec" aria-labelledby="about-fix">
          <h2 id="about-fix">Spotted a mistake?</h2>
          <p>A wrong episode number, a misattributed quote, a prop that turns out to be a different prop, or a connection the map is missing: <a href="${CORRECTION_URL}" target="_blank" rel="noopener">suggest a correction</a> on GitHub. You don't need to know any code. Say where on the site the problem is and link a source that shows it, because the labels above depend on who said it.</p>
          <p>If you'd rather make the change yourself, the <a href="${CONTRIBUTING_URL}" target="_blank" rel="noopener">contributing guide</a> explains how the data is laid out and how to open a pull request.</p>
        </section>

        <section class="about-sec" aria-labelledby="about-research">
          <h2 id="about-research">Research and sources</h2>
          <p>The curated layer comes from four research notes in the project's <code>research/</code> folder:</p>
          <ul class="about-files">${RESEARCH_FILES.map((r) => html`<li><code>${r.file}</code><span>${r.what}</span></li>`)}</ul>
          <p>Their main outlets are ${OUTLETS.slice(0, -1).join(', ')} and ${OUTLETS[OUTLETS.length - 1]}, plus interviews with Flanagan, the cast and crew. Individual entries link to their own sources.</p>
        </section>
      </div>

      <aside class="about-side">
        <section class="about-tmdb" aria-labelledby="about-tmdb-h">
          <h2 id="about-tmdb-h" class="about-side__h">Film data</h2>
          <a class="about-tmdb__logo" href="https://www.themoviedb.org/" target="_blank" rel="noopener"><img src="/tmdb.svg" alt="The Movie Database (TMDB)" width="220" height="29"></a>
          <p class="about-tmdb__notice">${TMDB_NOTICE}</p>
          <p class="about-tmdb__more">Posters, stills, headshots and credits are from TMDB and remain the property of their owners. This is a non-commercial project.</p>
        </section>

        <section class="about-keys" aria-labelledby="about-keys-h">
          <h2 id="about-keys-h" class="about-side__h">Keyboard</h2>
          <dl>
            <div><dt><kbd>/</kbd> <span class="muted">or</span> <kbd>⌘</kbd><kbd>K</kbd></dt><dd>Open search</dd></div>
            <div><dt><kbd>↑</kbd><kbd>↓</kbd> <kbd>Enter</kbd></dt><dd>Move through and open results</dd></div>
            <div><dt><kbd>Esc</kbd></dt><dd>Close search or the preview panel</dd></div>
            <div><dt><kbd>Tab</kbd></dt><dd>Every chart has a list or link equivalent</dd></div>
          </dl>
        </section>

        <section class="about-legend" aria-labelledby="about-legend-h">
          <h2 id="about-legend-h" class="about-side__h">Shapes</h2>
          <ul>
            <li>${glyph('work')} Work</li>
            <li>${glyph('person')} Person</li>
            <li>${glyph('prop')} Prop or location</li>
            <li>${glyph('egg')} Easter egg, callback or cameo</li>
            <li>${glyph('author')} Author or reference</li>
            <li>${glyph('theme')} Theme</li>
          </ul>
        </section>
      </aside>
    </div>

    <section class="about-disclaimer" aria-labelledby="about-disc-h">
      <h2 id="about-disc-h" class="about-side__h">Unofficial</h2>
      <p>Flanaverse is an unofficial fan project. It is not affiliated with or endorsed by Mike Flanagan, Intrepid Pictures, Red Room Pictures, Netflix, Amazon MGM Studios or any studio or rights holder. Titles, images and characters belong to their owners and appear here for commentary and reference. Expect spoilers everywhere.</p>
    </section>
  </div>`);
}
