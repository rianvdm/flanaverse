import type { Route } from '../lib/router';
import { html, mountHtml } from '../lib/html';

export default function render(route: Route, mount: HTMLElement) {
  mountHtml(mount, html`<div class="page"><p class="kicker">Not found</p><h1>Nothing lives at ${route.path}</h1><p class="prose">Try the <a href="#/">map</a> or press <kbd>/</kbd> to search.</p></div>`);
}
