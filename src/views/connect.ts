/**
 * Connection finder (#/connect, #/connect/:a/:b). Each side is a work slug or a
 * person slug. Person ↔ person shows the shared works (or a bridge person one
 * step out); work ↔ work shows the shared cast; person ↔ work shows the role or
 * who links them. Picking both sides navigates, so every result is a URL.
 */
import type { Route } from '../lib/router';
import { navigate } from '../lib/router';
import { html, mountHtml, plural, type Raw } from '../lib/html';
import { model, personHref, workHref, isActing, isKeyCrew, roleIn, sharedWorks, type Edge } from '../data/model';
import type { Work, Person } from '../data/types';
import { headshot, personChip, chipList } from '../components/chips';
import '../styles/connect.css';

type Entity = { kind: 'work'; slug: string; work: Work } | { kind: 'person'; slug: string; person: Person };

/** A step in a rendered chain: a person, one work, or several works side by side. */
type Node =
  | { type: 'person'; person: Person }
  | { type: 'works'; items: { work: Work; lines: string[] }[] };

const SUGGESTIONS: [string, string][] = [
  ['kate-siegel', 'henry-thomas'],
  ['midnight-mass', 'the-fall-of-the-house-of-usher'],
  ['carla-gugino', 'the-life-of-chuck'],
  ['absentia', 'carrie'],
];

const coreSlugs = new Set(model.coreWorks.map((w) => w.slug));

/**
 * Core works a person is credited on, as an actor or in a key crew role. Wider
 * than model.sharedWorks() (acting only) so directors and composers can be
 * connected too.
 */
const creditCache = new Map<number, Set<string>>();
function credits(p: Person): Set<string> {
  let s = creditCache.get(p.id);
  if (!s) {
    s = new Set(p.appearances.filter((a) => coreSlugs.has(a.work) && (isActing(a) || isKeyCrew(a))).map((a) => a.work));
    creditCache.set(p.id, s);
  }
  return s;
}

function shared(a: Person, b: Person, except?: string): Work[] {
  const bs = credits(b);
  return model.coreWorks.filter((w) => w.slug !== except && credits(a).has(w.slug) && bs.has(w.slug));
}

const isPickable = (p: Person) => credits(p).size >= 2;

function pickablePeople(): Person[] {
  return [...model.people.values()].filter(isPickable).sort((a, b) => a.name.localeCompare(b.name));
}

function resolve(slug: string | undefined): Entity | null {
  if (!slug) return null;
  const work = model.workBySlug.get(slug);
  if (work) return { kind: 'work', slug, work };
  const person = model.personBySlug.get(slug);
  return person ? { kind: 'person', slug, person } : null;
}

const entityName = (e: Entity) => (e.kind === 'work' ? e.work.title : e.person.name);
const slugOf = (p: Person) => model.personSlug.get(p.id) ?? String(p.id);

/** "Kate Siegel as Theodora Crain" or "Mike Flanagan, Director". */
function creditLine(p: Person, slug: string): string {
  const a = p.appearances.find((x) => x.work === slug);
  if (!a) return p.name;
  return isActing(a) ? `${p.name} as ${a.characters.join(' / ')}` : `${p.name}, ${a.jobs.slice(0, 2).join(', ')}`;
}

/* ---------- Search ---------- */

/**
 * Two-tier link search: acting links first (castmates, via model.sharedWorks),
 * then any key credit. Without the first tier every bridge would be Mike
 * Flanagan, who is credited on every work.
 */
type Linker = (a: Person, b: Person, except?: string) => Work[];
const actingLink: Linker = (a, b, except) => sharedWorks(a, b).filter((w) => w.slug !== except);
const tiers: Linker[] = [actingLink, shared];

/** Intermediate people between two people (one step out), best first. */
function bridgesBetween(a: Person, b: Person): { via: Person; left: Work[]; right: Work[] }[] {
  for (const link of tiers) {
    const out: { via: Person; left: Work[]; right: Work[] }[] = [];
    for (const c of model.people.values()) {
      if (c.id === a.id || c.id === b.id) continue;
      const left = link(a, c);
      if (!left.length) continue;
      const right = link(c, b);
      if (right.length) out.push({ via: c, left, right });
    }
    if (out.length) {
      return out.sort((x, y) => (y.left.length + y.right.length) - (x.left.length + x.right.length) || credits(y.via).size - credits(x.via).size || x.via.name.localeCompare(y.via.name));
    }
  }
  return [];
}

function edgeBetween(a: string, b: string): Edge | undefined {
  return model.edges.find((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a));
}

/** People credited on `work` who share another work with `p`, castmates first. */
function linksToWork(p: Person, work: Work): { via: Person; through: Work[] }[] {
  for (const link of tiers) {
    const out: { via: Person; through: Work[] }[] = [];
    for (const c of model.people.values()) {
      if (c.id === p.id) continue;
      const inWork = c.appearances.some((a) => a.work === work.slug && (link === actingLink ? isActing(a) : isActing(a) || isKeyCrew(a)));
      if (!inWork) continue;
      const through = link(p, c, work.slug);
      if (through.length) out.push({ via: c, through });
    }
    if (out.length) return out.sort((x, y) => y.through.length - x.through.length || credits(y.via).size - credits(x.via).size || x.via.name.localeCompare(y.via.name));
  }
  return [];
}

const titlesShort = (ws: Work[], max = 2) => ws.slice(0, max).map((w) => w.title).join(', ') + (ws.length > max ? ` +${ws.length - max}` : '');

/* ---------- Rendering ---------- */

function personNode(p: Person): Raw {
  const n = credits(p).size;
  return html`<a class="cn-node cn-node--person" href="${personHref(p.id)}">
    ${headshot(p, 'md')}
    <span class="cn-node__name">${p.name}</span>
    <span class="cn-node__meta num">${plural(n, 'work')}</span>
  </a>`;
}

function workNode(w: Work, lines: string[]): Raw {
  return html`<div class="cn-work">
    <a class="cn-work__poster" href="${workHref(w.slug)}">
      ${w.poster ? html`<img src="${w.poster}" alt="" loading="lazy" width="84" height="126">` : html`<span class="cn-work__empty">${w.title}</span>`}
      <span class="cn-work__title">${w.title}</span>
      <span class="cn-work__year num">${w.year}</span>
    </a>
    ${lines.length ? html`<ul class="cn-work__roles">${lines.map((l) => html`<li>${l}</li>`)}</ul>` : ''}
  </div>`;
}

function chain(nodes: Node[], label: string): Raw {
  return html`<ol class="cn-chain" aria-label="${label}">${nodes.map((n) => html`<li class="cn-step cn-step--${n.type}">${
    n.type === 'person' ? personNode(n.person) : html`<div class="cn-works ${n.items.length > 1 ? 'cn-works--many' : ''}">${n.items.map((i) => workNode(i.work, i.lines))}</div>`
  }</li>`)}</ol>`;
}

const verdict = (text: Raw | string, tone: 'yes' | 'near' | 'no' = 'yes') => html`<p class="cn-verdict cn-verdict--${tone}">${text}</p>`;
const pairLink = (a: string, b: string, text: Raw | string) => html`<a href="#/connect/${a}/${b}">${text}</a>`;

function personPerson(a: Person, b: Person): Raw {
  const works = shared(a, b);
  if (works.length) {
    return html`
      ${verdict(html`<strong>${a.name}</strong> and <strong>${b.name}</strong> share ${plural(works.length, 'work')}.`)}
      ${chain([
        { type: 'person', person: a },
        { type: 'works', items: works.map((w) => ({ work: w, lines: [creditLine(a, w.slug), creditLine(b, w.slug)] })) },
        { type: 'person', person: b },
      ], `${a.name} to ${b.name}`)}`;
  }
  const bridges = bridgesBetween(a, b);
  if (!bridges.length) return verdict(html`<strong>${a.name}</strong> and <strong>${b.name}</strong> are not connected within two steps.`, 'no');
  const best = bridges[0];
  return html`
    ${verdict(html`No shared work; connected through <a href="${personHref(best.via.id)}">${best.via.name}</a>.`, 'near')}
    ${chain([
      { type: 'person', person: a },
      { type: 'works', items: [{ work: best.left[0], lines: [creditLine(a, best.left[0].slug), creditLine(best.via, best.left[0].slug)] }] },
      { type: 'person', person: best.via },
      { type: 'works', items: [{ work: best.right[0], lines: [creditLine(best.via, best.right[0].slug), creditLine(b, best.right[0].slug)] }] },
      { type: 'person', person: b },
    ], `${a.name} to ${b.name} through ${best.via.name}`)}
    ${bridges.length > 1 ? html`<section class="cn-more">
      <h2 class="cn-more__head">Also connected through ${plural(bridges.length - 1, 'other person', 'other people')}</h2>
      ${chipList(bridges.slice(1, 25).map((x) => personChip(x.via, { role: `${x.left[0].title} → ${x.right[0].title}` })))}
    </section>` : ''}`;
}

function workWork(a: Work, b: Work): Raw {
  const edge = edgeBetween(a.slug, b.slug);
  const actors = (edge?.actors ?? []).map((id) => model.people.get(id)!).filter(Boolean)
    .sort((x, y) => credits(y).size - credits(x).size || x.name.localeCompare(y.name));
  const crew = (edge?.people ?? []).filter((id) => !edge!.actors.includes(id)).map((id) => model.people.get(id)!).filter(Boolean);
  const rolePair = (p: Person) => `${roleIn(p, a.slug)} / ${roleIn(p, b.slug)}`;
  if (actors.length || crew.length) {
    return html`
      ${verdict(html`<strong>${a.title}</strong> and <strong>${b.title}</strong> share ${plural(actors.length, 'actor')}${crew.length ? html` and ${plural(crew.length, 'key crew member')}` : ''}.`)}
      <div class="cn-pair">
        ${workNode(a, [])}
        <div class="cn-pair__link" aria-hidden="true"><span class="num">${actors.length}</span><span>shared</span></div>
        ${workNode(b, [])}
      </div>
      ${actors.length ? html`<section class="cn-more"><h2 class="cn-more__head">In both (${a.title} / ${b.title})</h2>${chipList(actors.map((p) => personChip(p, { role: rolePair(p) })))}</section>` : ''}
      ${crew.length ? html`<section class="cn-more"><h2 class="cn-more__head">Behind the camera on both</h2>${chipList(crew.map((p) => personChip(p, { role: rolePair(p) })))}</section>` : ''}`;
  }
  // One step out: a third work sharing cast with both.
  let best: { via: Work; left: Person; right: Person; score: number } | null = null;
  for (const w of model.coreWorks) {
    if (w === a || w === b) continue;
    const l = edgeBetween(a.slug, w.slug)?.actors ?? [], r = edgeBetween(w.slug, b.slug)?.actors ?? [];
    if (l.length && r.length && (!best || l.length + r.length > best.score)) {
      best = { via: w, left: model.people.get(l[0])!, right: model.people.get(r[0])!, score: l.length + r.length };
    }
  }
  if (!best) return verdict(html`<strong>${a.title}</strong> and <strong>${b.title}</strong> are not connected within two steps.`, 'no');
  return html`
    ${verdict(html`No shared cast; connected through <a href="${workHref(best.via.slug)}">${best.via.title}</a>.`, 'near')}
    ${chain([
      { type: 'works', items: [{ work: a, lines: [creditLine(best.left, a.slug)] }] },
      { type: 'person', person: best.left },
      { type: 'works', items: [{ work: best.via, lines: [creditLine(best.left, best.via.slug), creditLine(best.right, best.via.slug)] }] },
      { type: 'person', person: best.right },
      { type: 'works', items: [{ work: b, lines: [creditLine(best.right, b.slug)] }] },
    ], `${a.title} to ${b.title} through ${best.via.title}`)}`;
}

function personWork(p: Person, w: Work, personFirst: boolean): Raw {
  const app = p.appearances.find((x) => x.work === w.slug && (isActing(x) || x.jobs.length > 0));
  if (app) {
    const what = isActing(app) ? html`plays <strong>${app.characters.join(' / ')}</strong> in` : html`is ${app.jobs.join(', ')} on`;
    const nodes: Node[] = [{ type: 'person', person: p }, { type: 'works', items: [{ work: w, lines: [creditLine(p, w.slug)] }] }];
    return html`
      ${verdict(html`<strong>${p.name}</strong> ${what} <a href="${workHref(w.slug)}">${w.title}</a>.`)}
      ${chain(personFirst ? nodes : nodes.reverse(), `${p.name} in ${w.title}`)}`;
  }
  const links = linksToWork(p, w);
  if (!links.length) return verdict(html`<strong>${p.name}</strong> is not in ${w.title} and is not connected to it within two steps.`, 'no');
  const best = links[0], via = best.through[0];
  const nodes: Node[] = [
    { type: 'person', person: p },
    { type: 'works', items: [{ work: via, lines: [creditLine(p, via.slug), creditLine(best.via, via.slug)] }] },
    { type: 'person', person: best.via },
    { type: 'works', items: [{ work: w, lines: [creditLine(best.via, w.slug)] }] },
  ];
  return html`
    ${verdict(html`<strong>${p.name}</strong> is not in ${w.title}; connected through <a href="${personHref(best.via.id)}">${best.via.name}</a>.`, 'near')}
    ${chain(personFirst ? nodes : nodes.reverse(), `${p.name} to ${w.title} through ${best.via.name}`)}
    ${links.length > 1 ? html`<section class="cn-more">
      <h2 class="cn-more__head">${plural(links.length - 1, 'other person', 'other people')} in ${w.title} who worked with ${p.name}</h2>
      ${chipList(links.slice(1, 30).map((x) => personChip(x.via, { role: `via ${titlesShort(x.through)}` })))}
    </section>` : ''}`;
}

function result(a: Entity | null, b: Entity | null, params: Record<string, string>): Raw {
  if (params.a && !a) return verdict(html`Nothing called “${params.a}” here. Pick from the list instead.`, 'no');
  if (params.b && !b) return verdict(html`Nothing called “${params.b}” here. Pick from the list instead.`, 'no');
  if (!a || !b) {
    const valid = SUGGESTIONS.map(([x, y]) => [resolve(x), resolve(y)] as const).filter((s): s is readonly [Entity, Entity] => !!s[0] && !!s[1]);
    return html`<div class="cn-empty">
      <p class="muted">Pick two works or two people, or one of each. Or try one of these:</p>
      <ul class="cn-suggest">${valid.map(([x, y]) => html`<li>${pairLink(x.slug, y.slug, html`${entityName(x)} <span aria-hidden="true">↔</span><span class="visually-hidden">and</span> ${entityName(y)}`)}</li>`)}</ul>
    </div>`;
  }
  if (a.slug === b.slug) return verdict('Those are the same. Pick two different things.', 'no');
  if (a.kind === 'person') return b.kind === 'person' ? personPerson(a.person, b.person) : personWork(a.person, b.work, true);
  return b.kind === 'work' ? workWork(a.work, b.work) : personWork(b.person, a.work, false);
}

function picker(id: string, label: string, current: Entity | null, people: Person[]): Raw {
  // Keep a deep-linked person who isn't in the list selectable.
  const extra = current?.kind === 'person' && !people.includes(current.person) ? [current.person] : [];
  const sel = (slug: string) => (current?.slug === slug ? 'selected' : '');
  return html`<label class="cn-picker" for="${id}">
    <span class="kicker">${label}</span>
    <select id="${id}">
      <option value="" ${current ? '' : 'selected'}>Choose a work or person…</option>
      <optgroup label="Works">${model.coreWorks.map((w) => html`<option value="${w.slug}" ${sel(w.slug)}>${w.title} (${w.year})</option>`)}</optgroup>
      <optgroup label="People">${[...extra, ...people].map((p) => html`<option value="${slugOf(p)}" ${sel(slugOf(p))}>${p.name}</option>`)}</optgroup>
    </select>
  </label>`;
}

export default function render(route: Route, mount: HTMLElement) {
  const a = resolve(route.params.a), b = resolve(route.params.b);
  const people = pickablePeople();

  mountHtml(mount, html`<div class="page cn-page">
    <header class="cn-head">
      <p class="kicker">Connect</p>
      <h1>How are these connected?</h1>
    </header>
    <form class="cn-form filters" aria-label="Choose two things to connect">
      ${picker('cn-a', 'From', a, people)}
      <button type="button" class="btn cn-swap" data-act="swap" aria-label="Swap the two sides"><span aria-hidden="true">⇄</span><span class="cn-swap__label">Swap</span></button>
      ${picker('cn-b', 'To', b, people)}
      <button type="button" class="btn cn-surprise" data-act="surprise">Surprise me</button>
    </form>
    <section class="cn-result" aria-live="polite">${result(a, b, route.params)}</section>
  </div>`);

  const selA = mount.querySelector<HTMLSelectElement>('#cn-a')!;
  const selB = mount.querySelector<HTMLSelectElement>('#cn-b')!;
  const go = (x: string, y: string) => { if (x && y) navigate(`/connect/${x}/${y}`); };

  mount.querySelector('form')!.addEventListener('change', () => go(selA.value, selB.value));
  mount.querySelector('form')!.addEventListener('submit', (e) => e.preventDefault());
  mount.querySelector('form')!.addEventListener('click', (e) => {
    const act = (e.target as Element).closest<HTMLButtonElement>('[data-act]')?.dataset.act;
    if (act === 'swap') {
      [selA.value, selB.value] = [selB.value, selA.value];
      go(selA.value, selB.value);
    } else if (act === 'surprise') {
      const pool = model.repertory.filter((p) => credits(p).size >= 2);
      const i = Math.floor(Math.random() * pool.length);
      let j = Math.floor(Math.random() * (pool.length - 1));
      if (j >= i) j += 1;
      go(slugOf(pool[i]), slugOf(pool[j]));
    }
  });
}
