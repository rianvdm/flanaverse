/**
 * Hash router. Routes look like "#/work/:slug?tab=cast".
 * Page navigation = a new history entry; in-view state uses setQuery() (replaceState).
 */
export interface Route {
  path: string;                       // "/work/hush"
  pattern: string;                    // "/work/:slug"
  params: Record<string, string>;
  query: URLSearchParams;
}

export type Cleanup = void | (() => void);
export type ViewFn = (route: Route, mount: HTMLElement) => Cleanup | Promise<Cleanup>;
export type ViewLoader = () => Promise<{ default: ViewFn }>;

interface Entry { pattern: string; regex: RegExp; keys: string[]; load: ViewLoader }

const entries: Entry[] = [];
let current: { route: Route; cleanup: Cleanup } | null = null;
let mountEl: HTMLElement;
let notFound: ViewLoader | null = null;
const listeners = new Set<(r: Route) => void>();
const beforeListeners = new Set<() => void>();
let seq = 0;

function compile(pattern: string): { regex: RegExp; keys: string[] } {
  const keys: string[] = [];
  const src = pattern.replace(/\//g, '\\/').replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
  return { regex: new RegExp(`^${src}$`), keys };
}

export function register(pattern: string, load: ViewLoader): void {
  entries.push({ pattern, ...compile(pattern), load });
}
export function registerNotFound(load: ViewLoader): void { notFound = load; }

export function parseHash(hash = location.hash): { path: string; query: URLSearchParams } {
  const h = hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = h.split('?');
  return { path: path.startsWith('/') ? path : '/' + path, query: new URLSearchParams(qs) };
}

export function href(path: string, query?: Record<string, string | number | undefined>): string {
  const qs = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)])).toString().replace(/%3A/g, ':') : '';
  return '#' + path + (qs ? '?' + qs : '');
}

export function navigate(path: string, query?: Record<string, string | number | undefined>): void {
  location.hash = href(path, query).slice(1);
}

/** Updates the query string of the current route without a history entry or re-render. */
export function setQuery(query: Record<string, string | number | undefined>): void {
  const { path } = parseHash();
  const next = href(path, query);
  history.replaceState(null, '', next);
  if (current) current.route.query = parseHash(next).query;
}

export function currentRoute(): Route | null { return current?.route ?? null; }
export function onRoute(fn: (r: Route) => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }
/** Runs after the old view is cleaned up and before the new one mounts (e.g. close the peek panel). */
export function beforeRender(fn: () => void): () => void { beforeListeners.add(fn); return () => beforeListeners.delete(fn); }

function safeDecode(s: string): string | null {
  try { return decodeURIComponent(s); } catch { return null; }
}

async function resolve(): Promise<void> {
  const token = ++seq;
  const { path, query } = parseHash();
  let match: Entry | undefined;
  let params: Record<string, string> = {};
  for (const e of entries) {
    const m = e.regex.exec(path);
    if (!m) continue;
    const decoded = e.keys.map((k, i) => [k, safeDecode(m[i + 1])] as const);
    if (decoded.some(([, v]) => v == null)) break;           // malformed escape: fall through to not-found
    match = e;
    params = Object.fromEntries(decoded as [string, string][]);
    break;
  }
  const route: Route = { path, pattern: match?.pattern ?? '*', params, query };
  if (current?.cleanup) current.cleanup();
  current = null;
  beforeListeners.forEach((fn) => fn());
  mountEl.replaceChildren();
  mountEl.scrollTop = 0;
  window.scrollTo({ top: 0 });
  const loader = match?.load ?? notFound;
  if (!loader) { mountEl.textContent = 'Not found'; return; }
  const mod = await loader();
  if (token !== seq) return;                                 // a newer navigation won
  const cleanup = await mod.default(route, mountEl);
  if (token !== seq) { if (typeof cleanup === 'function') cleanup(); return; }
  current = { route, cleanup };
  mountEl.focus({ preventScroll: true });
  listeners.forEach((fn) => fn(route));
}

export function start(mount: HTMLElement): void {
  mountEl = mount;
  window.addEventListener('hashchange', () => { void resolve(); });
  void resolve();
}
