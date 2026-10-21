import type { Game } from './game';
import { currentSpecies, isOwned } from './stats';
import type { CatchRow, GoalRow } from './types';

export type GoalProgress =
  | { kind: 'done'; catchRow: CatchRow }
  | { kind: 'evolve'; catchRow: CatchRow; from: string; steps: { id: number; how: string }[] }
  | { kind: 'open' };

/**
 * A goal is done when you own a shiny that is that species right now.
 * If you own one earlier in the line that can still evolve into it, the goal says so.
 * Sold, traded and fled shinies never complete a goal.
 */
export function goalProgress(goal: GoalRow, catches: CatchRow[], game: Game): GoalProgress {
  const target = game.byName.get(goal.species);
  if (!target) return { kind: 'open' };
  const owned = catches.filter(isOwned);
  const exact = owned.find((c) => currentSpecies(c) === target.name);
  if (exact) return { kind: 'done', catchRow: exact };
  for (const c of owned) {
    const from = game.byName.get(currentSpecies(c));
    if (!from) continue;
    const steps = game.path(from.id, target.id);
    if (steps && steps.length) return { kind: 'evolve', catchRow: c, from: from.name, steps };
  }
  return { kind: 'open' };
}

const PRIORITY_ORDER: Record<string, number> = { P1: 0, P2: 1, P3: 2, '': 3 };

export function sortGoals(goals: GoalRow[]): GoalRow[] {
  return [...goals].sort((a, b) =>
    (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3) ||
    a.species.localeCompare(b.species));
}
