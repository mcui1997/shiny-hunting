import { parseCount } from './data';
import { DEFAULT_ODDS, NON_HUNT_METHODS, type CatchRow } from './types';

export const oddsOf = (c: CatchRow) => parseCount(c.odds) ?? DEFAULT_ODDS;

/** Did you encounter this shiny yourself? Traded or bought ones don't count toward luck. */
export const countsForLuck = (c: CatchRow) => !NON_HUNT_METHODS.includes(c.method) && parseCount(c.encounters) !== null;

/** Do you still have it? */
export const isOwned = (c: CatchRow) => c.status === 'kept';

/** The species it is now (after any evolution). */
export const currentSpecies = (c: CatchRow) => c.current_form || c.species;

/** Catches sorted oldest first, so index + 1 is the shiny number. */
export function chronological(rows: CatchRow[]): CatchRow[] {
  return [...rows].sort((a, b) => (a.caught_at || '9999').localeCompare(b.caught_at || '9999') || a.id.localeCompare(b.id));
}

/** P(X >= k) for X ~ Poisson(lambda). */
export function poissonAtLeast(k: number, lambda: number): number {
  if (k <= 0) return 1;
  let term = Math.exp(-lambda);
  let cdf = term;
  for (let i = 1; i < k; i++) {
    term *= lambda / i;
    cdf += term;
  }
  return Math.max(0, Math.min(1, 1 - cdf));
}

/** Chance of seeing at least one shiny within `encounters` at 1/odds. */
export const chanceWithin = (encounters: number, odds: number) => 1 - Math.pow(1 - 1 / odds, encounters);

export interface Summary {
  total: number;          // every row
  kept: number;
  sold: number;
  traded: number;
  fled: number;
  luckCount: number;      // shinies that count toward luck
  encounters: number;     // sum over luck-eligible rows
  expected: number;       // expected shinies for those encounters
  luck: number | null;    // luckCount / expected
  luckierThan: number | null; // fraction of hunters you beat at the same encounter total
  average: number | null; // encounters per luck-eligible shiny
  fastest: CatchRow | null;
  slowest: CatchRow | null;
}

export function summarize(rows: CatchRow[]): Summary {
  const eligible = rows.filter(countsForLuck);
  const encounters = eligible.reduce((s, c) => s + (parseCount(c.encounters) ?? 0), 0);
  const expected = eligible.reduce((s, c) => s + (parseCount(c.encounters) ?? 0) / oddsOf(c), 0);
  const withEnc = eligible.filter((c) => (parseCount(c.encounters) ?? 0) > 0);
  const byEnc = [...withEnc].sort((a, b) => parseCount(a.encounters)! - parseCount(b.encounters)!);
  return {
    total: rows.length,
    kept: rows.filter((c) => c.status === 'kept').length,
    sold: rows.filter((c) => c.status === 'sold').length,
    traded: rows.filter((c) => c.status === 'traded').length,
    fled: rows.filter((c) => c.status === 'fled').length,
    luckCount: eligible.length,
    encounters,
    expected,
    luck: expected > 0 ? eligible.length / expected : null,
    luckierThan: expected > 0 && eligible.length > 0 ? 1 - poissonAtLeast(eligible.length, expected) : null,
    average: eligible.length ? encounters / eligible.length : null,
    fastest: byEnc[0] ?? null,
    slowest: byEnc[byEnc.length - 1] ?? null,
  };
}

/** Where a species stands in your collection. */
export type DexState = 'owned' | 'evolved' | 'gone' | 'line' | 'none';

/** Owned now, or a stage one of your current shinies passed through. */
export const isOwnedState = (s: DexState) => s === 'owned' || s === 'evolved';
/** Any shiny of yours has ever been this species. */
export const isMineState = (s: DexState) => s === 'owned' || s === 'evolved' || s === 'gone';

export interface DexEntry {
  state: DexState;
  /** Catches that were ever this species (caught as, evolved through, or now). Newest first. */
  catches: CatchRow[];
}

/**
 * owned   — you have one right now in this form
 * evolved — one of your shinies was this species and evolved on (Litwick and Lampent, once it's a Chandelure)
 * gone    — your shiny of this species was sold, traded or fled
 * line    — you hold a shiny elsewhere in its evolution family
 */
export class DexIndex {
  private readonly entries = new Map<string, DexEntry>();
  private readonly ownedFamilies = new Set<number>();

  /**
   * `stagesBetween(from, to)` lists the species a shiny passed through when evolving,
   * excluding both ends (Litwick -> Chandelure gives ['Lampent']).
   */
  constructor(
    rows: CatchRow[],
    private readonly familyOf: (name: string) => number | undefined,
    stagesBetween: (from: string, to: string) => string[] = () => [],
  ) {
    const rank: Record<DexState, number> = { none: 0, line: 1, gone: 2, evolved: 3, owned: 4 };
    const get = (n: string) => {
      let e = this.entries.get(n);
      if (!e) { e = { state: 'none', catches: [] }; this.entries.set(n, e); }
      return e;
    };
    const bump = (n: string, s: DexState) => { const e = get(n); if (rank[s] > rank[e.state]) e.state = s; };
    for (const c of [...rows].sort((a, b) => b.caught_at.localeCompare(a.caught_at))) {
      const cur = currentSpecies(c);
      const earlier = cur === c.species ? [] : [c.species, ...stagesBetween(c.species, cur)];
      for (const n of [...earlier, cur]) get(n).catches.push(c);
      if (isOwned(c)) {
        bump(cur, 'owned');
        for (const n of earlier) bump(n, 'evolved');
        const fam = familyOf(cur);
        if (fam !== undefined) this.ownedFamilies.add(fam);
      } else {
        for (const n of [...earlier, cur]) bump(n, 'gone');
      }
    }
  }

  get(name: string): DexEntry {
    const e = this.entries.get(name);
    if (e && e.state !== 'none') return e;
    const fam = this.familyOf(name);
    const state: DexState = fam !== undefined && this.ownedFamilies.has(fam) ? 'line' : 'none';
    return { state, catches: e?.catches ?? [] };
  }
}

export const formatCount = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('en-US'));
