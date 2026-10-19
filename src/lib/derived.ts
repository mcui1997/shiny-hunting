import { useMemo } from 'react';
import { goalProgress, type GoalProgress } from './goals';
import { chronological, DexIndex, summarize } from './stats';
import { useStore } from './store';
import type { GoalRow } from './types';

/** Everything computed from your CSVs + the game data, memoized together. */
export function useDerived() {
  const { game, rows } = useStore();
  return useMemo(() => {
    if (!game) return null;
    const dex = new DexIndex(rows.caught, (n) => game.byName.get(n)?.family);
    const goals = new Map<string, GoalRow>(rows.goals.map((g) => [g.species, g]));
    const progress = new Map<string, GoalProgress>(rows.goals.map((g) => [g.species, goalProgress(g, rows.caught, game)]));
    const order = chronological(rows.caught);
    const shinyNumber = new Map(order.map((c, i) => [c.id, i + 1]));
    const notes = new Map(rows.notes.map((n) => [n.species, n.notes]));
    return { game, dex, goals, progress, summary: summarize(rows.caught), shinyNumber, notes };
  }, [game, rows]);
}
