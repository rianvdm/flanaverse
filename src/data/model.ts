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

export interface Model {
  works: Work[];                              // chronological
  coreWorks: Work[];
  workBySlug: Map<string, Work>;
  people: Map<number, Person>;
  actors: Person[];                           // people with at least one acting credit, by appearance count desc
  repertory: Person[];                        // actors in 2+ works
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

export function buildModel(): Model {
  const works = (worksJson as Work[]).slice().sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
  const people = new Map<number, Person>(Object.values(peopleJson as Record<string, Person>).map((p) => [p.id, p]));
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
    actors,
    repertory: actors.filter((p) => p.appearances.filter(isActing).length >= 2),
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
