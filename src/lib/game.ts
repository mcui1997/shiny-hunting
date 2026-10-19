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

export const timesLabel = (times: string[]) =>
  times.length === 3 ? 'All day' : times.join(' · ');

export const seasonsLabel = (seasons: Season[]) =>
  seasons.length === 0 ? 'Any season' : seasons.length === 4 ? 'All seasons' : SEASONS.filter((s) => seasons.includes(s)).join(' · ');

/** One-line summary of the best horde spot, e.g. "Route 214 · Spring · 5x · 100% (Morning · Day)". */
export function bestSpotLabel(sp: Species): string | null {
  const s = hordeSpots(sp)[0];
  if (!s) return null;
  const t = s.bestTimes.length === 3 ? '' : ` (${s.bestTimes.join('/').toLowerCase()})`;
  const verdict = s.best >= 100 ? 'solo' : `${s.best}%`;
  return `${s.row.area} · ${seasonsLabel(s.row.seasons)} · ${s.row.size}x ${verdict}${t}`;
}

export function verdictFor(share: number) {
  if (share >= 100) return 'solo' as const;
  if (share >= 50) return 'shared' as const;
  return 'mixed' as const;
}
