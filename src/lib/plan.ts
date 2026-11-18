import type { Game } from './game';
import { SEASONS, TIMES, type HordeRow, type Season, type Share } from './types';

/**
 * The seasonal plan: for every open goal that can be found in a 5x horde, its best spot in each
 * season, and one spot per goal picked to hunt it.
 *
 * Picking favors hordes where more of the horde is your goals (two goals at 50/50 beat one goal
 * at 50% with filler), then higher tiers, then goals with 5x hordes in fewer seasons, then the
 * season with the fewest picks so far.
 */

export interface PlanGoal { species: string; priority: string }

export interface PlanCard {
  name: string;
  id: number;
  priority: string;
  /** This goal's share of each horde, counting its whole line (e.g. Trapinch for Flygon). */
  share: number;
  row: HordeRow;
  /** Times of day the share and horde hold, e.g. ['Night']. */
  times: string[];
  /** Earlier stages you actually meet, when not the goal itself. */
  via: string[];
  /** Other open goals in the same horde. */
  partners: string[];
  /** Everything else in the horde, biggest first. */
  others: { name: string; share: number }[];
  /** The plan hunts this goal here. */
  planned: boolean;
  /** Seasons this goal has any 5x horde. */
  seasons: Season[];
}

export type Plan = Record<Season, PlanCard[]>;

const WEIGHT: Record<string, number> = { hunting: 8, s: 4, a: 2, b: 1 };
const ORDER: Record<string, number> = { hunting: 0, s: 1, a: 2, b: 3 };

interface Target { name: string; id: number; priority: string; line: Set<number> }
interface Slot { key: string; row: HordeRow; season: Season; time: number; comp: Share[]; shares: Map<string, number> }

const compKey = (comp: Share[]) => comp.map(([id, p]) => `${id}:${p}`).join(',');

export function buildPlan(game: Game, goals: PlanGoal[]): Plan {
  const targets: Target[] = [];
  for (const g of goals) {
    const sp = game.byName.get(g.species);
    if (!sp) continue;
    const line = new Set(game.family(sp.id).filter((f) => game.canBecome(f.id, sp.id)).map((f) => f.id));
    targets.push({ name: sp.name, id: sp.id, priority: g.priority, line });
  }

  // Every 5x horde that holds at least one goal, once each, split into season × time slots.
  const rows = new Map<string, HordeRow>();
  for (const t of targets) {
    for (const id of t.line) {
      for (const row of game.byId.get(id)?.hordes ?? []) {
        if (row.size !== 5) continue;
        rows.set(`${row.region}|${row.area}|${row.type}|${row.seasons.join()}|${JSON.stringify(row.split)}`, row);
      }
    }
  }
  const slots: Slot[] = [];
  for (const [key, row] of rows) {
    for (const season of row.seasons) {
      row.split.forEach((comp, time) => {
        const shares = new Map<string, number>();
        for (const t of targets) {
          const s = comp.reduce((sum, [id, p]) => sum + (t.line.has(id) ? p : 0), 0);
          if (s > 0) shares.set(t.name, s);
        }
        if (shares.size) slots.push({ key, row, season, time, comp, shares });
      });
    }
  }

  const at = new Map(slots.map((s) => [`${s.key}|${s.season}|${s.time}`, s]));
  const slotAt = (key: string, season: Season, time: number) => at.get(`${key}|${season}|${time}`);

  const best = new Map<string, number>();
  const seasonsOf = new Map<string, Set<Season>>();
  for (const s of slots) {
    for (const [n, v] of s.shares) {
      best.set(n, Math.max(best.get(n) ?? 0, v));
      if (!seasonsOf.has(n)) seasonsOf.set(n, new Set());
      seasonsOf.get(n)!.add(s.season);
    }
  }
  const byName = new Map(targets.map((t) => [t.name, t]));
  const sameCache = new Map<Slot, string[]>();
  const sameComp = (s: Slot) => {
    let v = sameCache.get(s);
    if (!v) { const k = compKey(s.comp); v = TIMES.filter((_, i) => compKey(s.row.split[i]) === k); sameCache.set(s, v); }
    return v;
  };

  // Greedy picks until every goal with a 5x horde has a spot.
  const open = new Set([...best.keys()]);
  const picked = new Map<string, { slot: Slot }>();
  const load: Record<Season, number> = { Spring: 0, Summer: 0, Autumn: 0, Winter: 0 };
  while (open.size) {
    let top: { slot: Slot; cover: string[]; rank: number[] } | null = null;
    for (const slot of slots) {
      const mine = [...slot.shares].filter(([n]) => open.has(n));
      if (!mine.length) continue;
      const e = mine.reduce((sum, [, v]) => sum + v, 0);
      const cover = mine.filter(([n, v]) => v >= 0.75 * best.get(n)! || (v >= 40 && e >= 90)).map(([n]) => n);
      if (!cover.length) continue;
      const rank = [
        -e,
        -cover.reduce((sum, n) => sum + (WEIGHT[byName.get(n)!.priority] ?? 1), 0),
        Math.min(...cover.map((n) => seasonsOf.get(n)!.size)),
        load[slot.season],
        -sameComp(slot).length,
      ];
      if (!top || less(rank, top.rank) || (equal(rank, top.rank) && tieKey(slot) < tieKey(top.slot))) top = { slot, cover, rank };
    }
    if (!top) break;
    for (const n of top.cover) { picked.set(n, { slot: top.slot }); open.delete(n); }
    load[top.slot.season]++;
  }

  const card = (t: Target, slot: Slot, times: string[], planned: boolean): PlanCard => {
    const via = new Set<string>();
    const others: { name: string; share: number }[] = [];
    for (const [id, p] of slot.comp) {
      if (t.line.has(id)) { if (id !== t.id) via.add(game.name(id)); } else others.push({ name: game.name(id), share: p });
    }
    return {
      name: t.name, id: t.id, priority: t.priority, share: slot.shares.get(t.name)!, row: slot.row, times,
      via: [...via], partners: sortByTier([...slot.shares.keys()].filter((n) => n !== t.name), byName),
      others: others.sort((a, b) => b.share - a.share), planned,
      seasons: SEASONS.filter((s) => seasonsOf.get(t.name)!.has(s)),
    };
  };

  const plan = {} as Plan;
  for (const season of SEASONS) {
    const cards: PlanCard[] = [];
    for (const t of targets) {
      const pick = picked.get(t.name);
      if (pick && pick.slot.season === season) { cards.push(card(t, pick.slot, sameComp(pick.slot), true)); continue; }
      // Best spot this season: biggest share, then more goals in it, then more of the day.
      let top: { slot: Slot; times: string[]; rank: number[] } | null = null;
      for (const slot of slots) {
        if (slot.season !== season || !slot.shares.has(t.name)) continue;
        const v = slot.shares.get(t.name)!;
        const times = TIMES.filter((_, i) => slotAt(slot.key, season, i)?.shares.get(t.name) === v);
        const rank = [-v, -slot.shares.size, -times.length];
        if (!top || less(rank, top.rank) || (equal(rank, top.rank) && tieKey(slot) < tieKey(top.slot))) top = { slot, times, rank };
      }
      if (top) {
        // Show the first matching time's horde; list only the times that horde holds.
        const first = slotAt(top.slot.key, season, TIMES.indexOf(top.times[0] as (typeof TIMES)[number]))!;
        const times = top.times.filter((tm) => compKey(first.row.split[TIMES.indexOf(tm as (typeof TIMES)[number])]) === compKey(first.comp));
        cards.push(card(t, first, times, false));
      }
    }
    plan[season] = cards.sort((a, b) => (ORDER[a.priority] ?? 3) - (ORDER[b.priority] ?? 3) || a.name.localeCompare(b.name));
  }
  return plan;
}

const tieKey = (s: Slot) => `${s.row.area}|${s.row.region}|${s.row.type}|${s.season}|${s.time}`;
function less(a: number[], b: number[]) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}
const equal = (a: number[], b: number[]) => a.every((v, i) => v === b[i]);
const sortByTier = (names: string[], byName: Map<string, Target>) =>
  names.sort((a, b) => (ORDER[byName.get(a)!.priority] ?? 3) - (ORDER[byName.get(b)!.priority] ?? 3) || a.localeCompare(b));

export const timesLabel = (times: string[]) => (times.length === 3 ? 'Any time' : times.join('/'));
const PLACE_TYPE: Record<string, string> = { Water: 'Surf', 'Dark Grass': 'Dark grass', 'Sweet Scent': 'Sweet Scent' };
export const placeType = (type: string) => PLACE_TYPE[type] ?? '';
export const onlyLabel = (seasons: Season[]) => (seasons.length <= 2 ? `${seasons.join(' + ')} only` : '');

