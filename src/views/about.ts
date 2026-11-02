import type { Route } from '../lib/router';
import { html, mountHtml } from '../lib/html';

export default function render(_route: Route, mount: HTMLElement) {
  mountHtml(mount, html`<div class="page"><p class="kicker">Placeholder</p><h1>about</h1><p class="muted">This view has not been built yet.</p></div>`);
}
