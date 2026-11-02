/**
 * The in-memory model: generated TMDB data joined with curated content, plus
 * the indexes every view needs (people by id, co-appearance edges, the
 * actor x work matrix). Built once at startup; views only read from it.
 */
import type { Work, Person, Connection, WorkMeta, PersonMeta, Author, Appearance } from './types';
import worksJson from './generated/works.json';
import peopleJson from './generated/people.json';
import connectionsJson from '../../data/curated/connections.json';
import workMetaJson from '../../data/curated/works-meta.json';
import personMetaJson from '../../data/curated/people-meta.json';
import authorsJson from '../../data/curated/authors.json';

export interface Edge {
  source: string;        // work slug
  target: string;        // work slug
  people: number[];      // shared people (acting or key crew)
  actors: number[];      // shared actors only
}

export interface Era { id: string; name: string; from: number; to: number; blurb: string }

export const ERAS: Era[] = [
  { id: 'early', name: 'Early work', from: 2000, to: 2010, blurb: 'Student films and the short that became Oculus.' },
  { id: 'independent', name: 'Independent & Intrepid films', from: 2011, to: 2017, blurb: 'Absentia to Gerald\'s Game: the Intrepid Pictures years and the first Stephen King adaptation.' },
  { id: 'netflix', name: 'The Netflix years', from: 2018, to: 2023, blurb: 'Hill House to Usher: five series that built the repertory company.' },
  { id: 'amazon', name: 'Amazon & beyond', from: 2024, to: 2030, blurb: 'The Life of Chuck, Carrie, and the projects still to come.' },
];

export const eraFor = (year: number): Era => ERAS.find((e) => year >= e.from && year <= e.to) ?? ERAS[ERAS.length - 1];

export interface Model {
  works: Work[];                              // chronological
  coreWorks: Work[];                          // tier 'core': the map, grid and stats use these
  workBySlug: Map<string, Work>;
  people: Map<number, Person>;
  personSlug: Map<number, string>;
  personBySlug: Map<string, Person>;
  actors: Person[];                           // people with at least one acting credit, by appearance count desc
  repertory: Person[];                        // actors in 2+ core works
  edges: Edge[];
  connections: Connection[];
  connectionById: Map<string, Connection>;
  connectionsByWork: Map<string, Connection[]>;
  workMeta: Map<string, WorkMeta>;
  personMeta: Map<number, PersonMeta>;
  authors: Author[];
}

export const isActing = (a: Appearance) => a.characters.length > 0;
export const isKeyCrew = (a: Appearance) =>
  a.jobs.some((j) => ['Director', 'Writer', 'Screenplay', 'Creator', 'Director of Photography', 'Original Music Composer', 'Editor', 'Production Design', 'Producer'].includes(j));

function buildEdges(works: Work[], people: Map<number, Person>): Edge[] {
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const edges = new Map<string, Edge>();
  for (const p of people.values()) {
    const apps = p.appearances.filter((a) => isActing(a) || isKeyCrew(a));
    for (let i = 0; i < apps.length; i++) {
      for (let j = i + 1; j < apps.length; j++) {
        const [a, b] = [apps[i], apps[j]];
        const k = key(a.work, b.work);
        let e = edges.get(k);
        if (!e) {
          const [source, target] = k.split('|');
          e = { source, target, people: [], actors: [] };
          edges.set(k, e);
        }
        e.people.push(p.id);
        if (isActing(a) && isActing(b)) e.actors.push(p.id);
      }
    }
  }
  const order = new Map(works.map((w, i) => [w.slug, i]));
  return [...edges.values()].sort((x, y) => (order.get(x.source)! - order.get(y.source)!) || (order.get(x.target)! - order.get(y.target)!));
}

export function slugify(s: string): string {
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function buildPersonSlugs(people: Map<number, Person>): Map<number, string> {
  const taken = new Map<string, number>();
  const out = new Map<number, string>();
  for (const p of [...people.values()].sort((a, b) => b.appearances.length - a.appearances.length || a.id - b.id)) {
    const base = slugify(p.name) || `person-${p.id}`;
    const slug = taken.has(base) ? `${base}-${p.id}` : base;
    taken.set(base, p.id);
    out.set(p.id, slug);
  }
  return out;
}

export function buildModel(): Model {
  const works = (worksJson as Work[]).slice().sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
  const people = new Map<number, Person>(Object.values(peopleJson as Record<string, Person>).map((p) => [p.id, p]));
  const personSlug = buildPersonSlugs(people);
  const coreSlugs = new Set(works.filter((w) => w.tier === 'core').map((w) => w.slug));
  const actors = [...people.values()]
    .filter((p) => p.appearances.some(isActing))
    .sort((a, b) => b.appearances.filter(isActing).length - a.appearances.filter(isActing).length || a.name.localeCompare(b.name));
  const connections = connectionsJson as Connection[];
  const connectionsByWork = new Map<string, Connection[]>();
  for (const c of connections) {
    for (const app of c.appearances) {
      if (!connectionsByWork.has(app.work)) connectionsByWork.set(app.work, []);
      const list = connectionsByWork.get(app.work)!;
      if (!list.includes(c)) list.push(c);
    }
  }
  return {
    works,
    coreWorks: works.filter((w) => w.tier === 'core'),
    workBySlug: new Map(works.map((w) => [w.slug, w])),
    people,
    personSlug,
    personBySlug: new Map([...personSlug].map(([id, slug]) => [slug, people.get(id)!])),
    actors,
    repertory: actors.filter((p) => p.appearances.filter((a) => isActing(a) && coreSlugs.has(a.work)).length >= 2),
    edges: buildEdges(works, people),
    connections,
    connectionById: new Map(connections.map((c) => [c.id, c])),
    connectionsByWork,
    workMeta: new Map((workMetaJson as WorkMeta[]).map((m) => [m.slug, m])),
    personMeta: new Map((personMetaJson as PersonMeta[]).map((m) => [m.id, m])),
    authors: authorsJson as Author[],
  };
}

export const model: Model = buildModel();

/* Route helpers: slugs in URLs, never TMDB ids. */
export const workHref = (slug: string) => `#/work/${slug}`;
export const personHref = (id: number) => `#/person/${model.personSlug.get(id) ?? id}`;
export const connectionHref = (id: string) => `#/connection/${id}`;

/** Core works a person acts in, chronological. */
export function actingWorks(p: Person): Work[] {
  return p.appearances.filter(isActing).map((a) => model.workBySlug.get(a.work)).filter((w): w is Work => !!w && w.tier === 'core')
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
}

/** Cast of a work who also act in at least one other core work, most-travelled first. */
export function recurringCast(work: Work): { person: Person; character: string; others: Work[] }[] {
  return work.cast
    .map((c) => ({ person: model.people.get(c.personId)!, character: c.character }))
    .filter((x) => x.person)
    .map((x) => ({ ...x, others: actingWorks(x.person).filter((w) => w.slug !== work.slug) }))
    .filter((x) => x.others.length > 0)
    .sort((a, b) => b.others.length - a.others.length);
}

/** Core works two people both act in. */
export function sharedWorks(a: Person, b: Person): Work[] {
  const bs = new Set(actingWorks(b).map((w) => w.slug));
  return actingWorks(a).filter((w) => bs.has(w.slug));
}

/** The character(s) a person plays in a work, or their job if crew only. */
export function roleIn(p: Person, slug: string): string {
  const a = p.appearances.find((x) => x.work === slug);
  if (!a) return '';
  return a.characters.length ? a.characters.join(' / ') : a.jobs.join(', ');
}
