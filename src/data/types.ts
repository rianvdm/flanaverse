/** Shapes of the generated TMDB data (src/data/generated/*.json). */

export type WorkTier = 'core' | 'early' | 'written' | 'upcoming';
export type WorkKind = 'feature' | 'series' | 'short';

export interface Episode {
  season: number;
  number: number;
  name: string;
  overview: string;
  airDate: string | null;
  runtime: number | null;
  still: string | null;
  directors: number[];
  writers: number[];
  guestStars: { personId: number; character: string }[];
}

export interface Season {
  number: number;
  name: string;
  episodes: Episode[];
}

export interface CastCredit {
  personId: number;
  character: string;
  order: number;
  episodeCount?: number;
}

export interface CrewCredit {
  personId: number;
  job: string;
  department: string;
}

export interface Work {
  slug: string;
  title: string;
  tmdb: { type: 'movie' | 'tv'; id: number };
  year: number;
  tier: WorkTier;
  kind: WorkKind;
  tmdbTitle: string;
  overview: string;
  tagline: string | null;
  releaseDate: string;
  runtime: number | null;
  episodeCount?: number;
  genres: string[];
  certification: string | null;
  voteAverage: number;
  networks?: string[];
  poster: string | null;
  backdrop: string | null;
  backdrops: string[];
  cast: CastCredit[];
  crew: CrewCredit[];
  seasons: Season[];
}

export interface Appearance {
  work: string;
  characters: string[];
  jobs: string[];
  episodeCount: number;
  order: number | null;
}

export interface Person {
  id: number;
  name: string;
  gender: number;
  appearances: Appearance[];
  biography?: string | null;
  birthday?: string | null;
  deathday?: string | null;
  placeOfBirth?: string | null;
  knownForDepartment?: string | null;
  imdbId?: string | null;
  profile: string | null;
  profileLarge: string | null;
}

/** Shapes of the hand-curated data (data/curated/*.json). */

export type ConnectionCategory =
  | 'prop'        // a physical object that recurs (the Lasser Glass)
  | 'egg'         // a hidden visual detail inside one work (hidden ghosts)
  | 'callback'    // a name, line or image deliberately reused across works
  | 'reference'   // a nod to source authors: King, Poe, Jackson, James, Pike
  | 'cameo'       // Flanagan, family and crew on screen
  | 'location'    // reused sets, houses and places
  | 'theme';      // a thematic throughline

export type Confidence = 'confirmed' | 'reported' | 'fan-theory';

export interface ConnectionAppearance {
  work: string;                 // work slug
  episode?: string;             // "S1E3" where known
  note: string;                 // what happens / where to look
}

export interface Connection {
  id: string;                   // kebab-case
  title: string;
  category: ConnectionCategory;
  summary: string;              // one sentence
  description: string;          // a paragraph or two, spoilers allowed
  appearances: ConnectionAppearance[];
  confidence: Confidence;
  sources: { label: string; url: string }[];
  people?: number[];            // TMDB person ids involved, if any
  image?: string | null;        // optional /img/... path
}

export interface WorkMeta {
  slug: string;
  platform: string;                       // Netflix, Prime Video, Relativity…
  flanaganRoles: string[];                // Director, Creator, Writer, Editor
  sourceMaterial: { author: string; title: string; note?: string } | null;
  premise: string;                        // curated, spoiler-friendly paragraph
  whyItMatters: string;                   // one paragraph on its place in the Flanaverse
  trivia: string[];
  wikipedia: string;
  episodeNotes?: Record<string, string>;  // "S1E5" -> note (e.g. the Bent-Neck Lady)
}

export interface PersonMeta {
  id: number;                             // TMDB person id
  profile: string;                        // 2-4 sentence narrative profile
  firstWorkedWith?: string;               // work slug
  funFact?: string;
  sources?: { label: string; url: string }[];
}

export interface Author {
  id: string;                             // 'stephen-king'
  name: string;
  works: { work: string; title: string; note?: string }[];   // which Flanagan works adapt them
  blurb: string;
}
