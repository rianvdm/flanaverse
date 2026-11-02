/**
 * App shell: header, nav, trail, main mount, footer; route table.
 * Views are lazy modules in src/views/ (see docs/SPEC.md).
 */
import { html, mountHtml } from './lib/html';
import { register, registerNotFound, start, onRoute, beforeRender } from './lib/router';
import { installPaletteShortcuts, openPalette } from './components/palette';
import { mountTrail, renderTrail } from './components/trail';
import { closePeek } from './components/peek';
import './styles/base.css';
import './styles/shell.css';

const NAV: { href: string; label: string; match: RegExp }[] = [
  { href: '#/', label: 'Map', match: /^\/$/ },
  { href: '#/works', label: 'Works', match: /^\/works?\b/ },
  { href: '#/people', label: 'People', match: /^\/(people|person)\b/ },
  { href: '#/grid', label: 'Cast Grid', match: /^\/grid/ },
  { href: '#/connections', label: 'Props & Eggs', match: /^\/connections?\b/ },
  { href: '#/sources', label: 'Sources', match: /^\/sources?\b/ },
  { href: '#/themes', label: 'Themes', match: /^\/themes?\b/ },
  { href: '#/timeline', label: 'Timeline', match: /^\/timeline/ },
  { href: '#/connect', label: 'Connect', match: /^\/connect\b/ },
];

export function mountApp(root: HTMLElement): void {
  mountHtml(root, html`
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="shell-header">
      <a class="brand" href="#/" aria-label="Flanaverse home"><span class="brand__mark" aria-hidden="true"></span><span class="brand__name">Flanaverse</span></a>
      <nav class="shell-nav" aria-label="Primary">
        ${NAV.map((n) => html`<a href="${n.href}" data-match="${n.match.source}">${n.label}</a>`)}
      </nav>
      <button class="btn shell-search" type="button" aria-label="Search (press slash)"><span>Search</span><kbd>/</kbd></button>
    </header>
    <div class="trail" id="trail" hidden></div>
    <main id="main" class="shell-main" tabindex="-1"></main>
    <footer class="shell-footer">
      <p>An unofficial fan map of Mike Flanagan's work. Film data and images from <a href="https://www.themoviedb.org/" rel="noopener">TMDB</a>; this product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB. <a href="#/about">About & credits</a></p>
    </footer>`);

  root.querySelector('.shell-search')!.addEventListener('click', () => openPalette());
  root.querySelector<HTMLAnchorElement>('.skip-link')!.addEventListener('click', (e) => {
    e.preventDefault();                                   // a plain #main would hit the hash router
    root.querySelector<HTMLElement>('#main')!.focus();
  });
  beforeRender(closePeek);
  installPaletteShortcuts();
  mountTrail(root.querySelector<HTMLElement>('#trail')!);

  const navLinks = [...root.querySelectorAll<HTMLAnchorElement>('.shell-nav a')];
  onRoute((route) => {
    renderTrail();
    for (const a of navLinks) {
      const active = new RegExp(a.dataset.match!).test(route.path);
      a.classList.toggle('is-active', active);
      if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
  });

  register('/', () => import('./views/home'));
  register('/works', () => import('./views/works'));
  register('/work/:slug', () => import('./views/work'));
  register('/people', () => import('./views/people'));
  register('/person/:slug', () => import('./views/person'));
  register('/grid', () => import('./views/grid'));
  register('/connections', () => import('./views/connections'));
  register('/connection/:id', () => import('./views/connection'));
  register('/sources', () => import('./views/sources'));
  register('/themes', () => import('./views/themes'));
  register('/timeline', () => import('./views/timeline'));
  register('/connect', () => import('./views/connect'));
  register('/connect/:a/:b', () => import('./views/connect'));
  register('/search', () => import('./views/search'));
  register('/about', () => import('./views/about'));
  registerNotFound(() => import('./views/not-found'));
  start(root.querySelector<HTMLElement>('#main')!);
}
