import { parseCount, parseValue } from './csv';
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
  valueHeld: number;
  valueSold: number;
  soldIsEstimate: boolean;
}

export function summarize(rows: CatchRow[]): Summary {
  const eligible = rows.filter(countsForLuck);
  const encounters = eligible.reduce((s, c) => s + (parseCount(c.encounters) ?? 0), 0);
  const expected = eligible.reduce((s, c) => s + (parseCount(c.encounters) ?? 0) / oddsOf(c), 0);
  const withEnc = eligible.filter((c) => (parseCount(c.encounters) ?? 0) > 0);
  const byEnc = [...withEnc].sort((a, b) => parseCount(a.encounters)! - parseCount(b.encounters)!);
  let soldIsEstimate = false;
  const valueSold = rows.filter((c) => c.status === 'sold').reduce((s, c) => {
    const actual = parseValue(c.sold_for);
    if (actual === null) soldIsEstimate = true;
    return s + (actual ?? parseValue(c.est_value) ?? 0);
  }, 0);
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
    valueHeld: rows.filter(isOwned).reduce((s, c) => s + (parseValue(c.est_value) ?? 0), 0),
    valueSold,
    soldIsEstimate,
  };
}

/** Where a species stands in your collection. */
export type DexState = 'owned' | 'caught' | 'line' | 'none';

export interface DexEntry {
  state: DexState;
  /** Catches whose current form is this species, or that were caught as it. Newest first. */
  catches: CatchRow[];
}

/**
 * owned  — you have one right now in this form
 * caught — you caught one as this species (since evolved, sold, traded or fled)
 * line   — you hold a shiny elsewhere in its evolution family
 */
export class DexIndex {
  private readonly entries = new Map<string, DexEntry>();
  private readonly ownedFamilies = new Set<number>();

  constructor(rows: CatchRow[], private readonly familyOf: (name: string) => number | undefined) {
    const rank: Record<DexState, number> = { none: 0, line: 1, caught: 2, owned: 3 };
    const get = (n: string) => {
      let e = this.entries.get(n);
      if (!e) { e = { state: 'none', catches: [] }; this.entries.set(n, e); }
      return e;
    };
    const bump = (n: string, s: DexState) => { const e = get(n); if (rank[s] > rank[e.state]) e.state = s; };
    for (const c of [...rows].sort((a, b) => b.caught_at.localeCompare(a.caught_at))) {
      const cur = currentSpecies(c);
      get(c.species).catches.push(c);
      if (cur !== c.species) get(cur).catches.push(c);
      bump(c.species, 'caught');
      if (isOwned(c)) {
        bump(cur, 'owned');
        const fam = familyOf(cur);
        if (fam !== undefined) this.ownedFamilies.add(fam);
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

/** Format 2000000 as "2.0M", 3500000 as "3.5M", 350000 as "350K". */
export function formatValue(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export const formatCount = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('en-US'));
