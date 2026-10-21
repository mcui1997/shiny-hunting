import { SEASONS, TIMES, type GameData, type HordeRow, type Season, type Species } from './types';

export class Game {
  readonly byId = new Map<number, Species>();
  readonly byName = new Map<string, Species>();
  readonly names: string[];
  private readonly children = new Map<number, number[]>();

  constructor(readonly data: GameData) {
    for (const p of data.pokemon) {
      this.byId.set(p.id, p);
      this.byName.set(p.name, p);
      this.children.set(p.id, p.evolvesTo.map((e) => e.id));
    }
    this.names = data.pokemon.map((p) => p.name);
  }

  get list() { return this.data.pokemon; }

  name(id: number) { return this.byId.get(id)?.name ?? `#${id}`; }

  /** Every member of the species' evolution family, first stage first. */
  family(id: number): Species[] {
    const root = this.byId.get(id)?.family ?? id;
    const out: Species[] = [];
    const queue = [root];
    const seen = new Set<number>();
    while (queue.length) {
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const sp = this.byId.get(cur);
      if (sp) out.push(sp);
      queue.push(...(this.children.get(cur) ?? []));
    }
    return out;
  }

  /** All species reachable by evolving `id` (not including itself). */
  descendants(id: number): Species[] {
    const out: Species[] = [];
    const stack = [...(this.children.get(id) ?? [])];
    const seen = new Set<number>();
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const sp = this.byId.get(cur);
      if (sp) out.push(sp);
      stack.push(...(this.children.get(cur) ?? []));
    }
    return out.sort((a, b) => a.id - b.id);
  }

  canBecome(fromId: number, toId: number) {
    return fromId === toId || this.descendants(fromId).some((s) => s.id === toId);
  }

  /** The chain of evolutions from `fromId` to `toId`, with how each step happens. */
  path(fromId: number, toId: number): { id: number; how: string }[] | null {
    if (fromId === toId) return [];
    for (const e of this.byId.get(fromId)?.evolvesTo ?? []) {
      const rest = this.path(e.id, toId);
      if (rest) return [e, ...rest];
    }
    return null;
  }

  /** Has any encounter at all in the game data (wild, horde, or special). */
  hasEncounters(sp: Species) {
    return sp.hordes.length + sp.singles.length + sp.rare.length > 0;
  }
}

/** This species' share of a horde for [morning, day, night]. */
export function shareIn(row: HordeRow, id: number): [number, number, number] {
  return row.split.map((t) => t.find(([sid]) => sid === id)?.[1] ?? 0) as [number, number, number];
}

export interface Spot {
  row: HordeRow;
  shares: [number, number, number];
  best: number;
  bestTimes: string[];
}

/** Horde rows for a species, best share first. Optionally limited to one season. */
export function hordeSpots(sp: Species, season?: Season | null): Spot[] {
  return sp.hordes
    .filter((r) => !season || r.seasons.includes(season))
    .map((row) => {
      const shares = shareIn(row, sp.id);
      const best = Math.max(...shares);
      const bestTimes = TIMES.filter((_, i) => shares[i] === best && best > 0);
      return { row, shares, best, bestTimes: [...bestTimes] };
    })
    .filter((s) => s.best > 0)
    .sort((a, b) =>
      b.best - a.best || b.row.size - a.row.size || b.bestTimes.length - a.bestTimes.length ||
      b.row.seasons.length - a.row.seasons.length || a.row.area.localeCompare(b.row.area));
}

export const seasonsLabel = (seasons: Season[]) =>
  seasons.length === 0 ? 'Any season' : seasons.length === 4 ? 'All seasons' : SEASONS.filter((s) => seasons.includes(s)).join(' · ');

// ---------- hunt summary ----------

export interface SeasonBest {
  /** Best share of a 5x horde this season (100 = solo). */
  share: number;
  /** Times of day that share holds, e.g. ['Night']; all three = all day. */
  times: string[];
  /** One place it happens. */
  area: string;
}

export interface HuntSummary {
  /** Best 5x horde share per season; null = no 5x horde that season. */
  seasons: Record<Season, SeasonBest | null>;
  /** Other ways it shows up: "3x hordes", "Fishing", "Lure"… */
  other: string[];
}

const SINGLE_KIND: Record<string, string> = {
  'Old Rod': 'Fishing', 'Good Rod': 'Fishing', 'Super Rod': 'Fishing',
  Headbutt: 'Headbutt trees', Rocks: 'Rock Smash', 'Honey Tree': 'Honey trees',
};
const OTHER_ORDER = ['3x hordes', 'Single encounters', 'Fishing', 'Headbutt trees', 'Rock Smash', 'Honey trees', 'Lure', 'Special encounters'];

export function huntSummary(sp: Species): HuntSummary {
  const spots = hordeSpots(sp);
  const seasons = {} as HuntSummary['seasons'];
  for (const season of SEASONS) {
    // hordeSpots is sorted best first, so the first 5x row in this season wins.
    const s = spots.find((x) => x.row.size === 5 && x.row.seasons.includes(season));
    seasons[season] = s ? { share: s.best, times: s.bestTimes, area: s.row.area } : null;
  }
  const other = new Set<string>();
  if (spots.some((s) => s.row.size === 3)) other.add('3x hordes');
  for (const r of sp.singles) other.add(SINGLE_KIND[r.type] ?? 'Single encounters');
  for (const r of sp.rare) other.add(r.kind === 'Lure' ? 'Lure' : 'Special encounters');
  return { seasons, other: OTHER_ORDER.filter((o) => other.has(o)) };
}

export const wikiUrl = (name: string) =>
  `https://pokemmo.shoutwiki.com/wiki/${encodeURIComponent(name.replace(/ /g, '_'))}`;
