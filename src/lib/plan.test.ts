import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { bestSpot, buildPlan } from './plan';
import { SEASONS, type GameData } from './types';

const game = new Game(JSON.parse(readFileSync(resolvePath(__dirname, '../../public/data/pokemon.json'), 'utf8')) as GameData);

describe('seasonal plan', () => {
  it('pairs two goals in one horde and marks the shared spot as the plan', () => {
    const plan = buildPlan(game, [{ species: 'Drifblim', priority: 's' }, { species: 'Luxray', priority: 'a' }]);
    const drif = plan.Autumn.find((c) => c.name === 'Drifblim')!;
    expect(drif.planned).toBe(true);
    expect(drif.row.area).toBe('Lake Verity');
    expect(drif.times).toEqual(['Night']);
    expect(drif.share).toBe(50);
    expect(drif.partners).toEqual(['Luxray']);
    expect(drif.seasons).toEqual(['Autumn']);
    const lux = plan.Autumn.find((c) => c.name === 'Luxray')!;
    expect(lux.via).toEqual(['Luxio']);
    expect(lux.planned).toBe(true);
    // Drifblim has no 5x horde outside autumn.
    for (const s of SEASONS.filter((x) => x !== 'Autumn')) expect(plan[s].some((c) => c.name === 'Drifblim')).toBe(false);
  });

  it('counts the whole line and lists the rest of the horde', () => {
    const plan = buildPlan(game, [{ species: 'Camerupt', priority: 'hunting' }]);
    const c = plan.Autumn.find((x) => x.name === 'Camerupt')!;
    expect(c.share).toBe(50);
    expect(c.others.length).toBeGreaterThan(0);
    expect(c.others.every((o) => o.name !== 'Numel' && o.name !== 'Camerupt')).toBe(true);
  });

  it('plans each goal exactly once and skips goals with no 5x horde', () => {
    const goals = ['Flygon', 'Sandslash', 'Claydol', 'Wailord', 'Manectric'].map((species) => ({ species, priority: 'b' }));
    const plan = buildPlan(game, goals);
    const planned = SEASONS.flatMap((s) => plan[s].filter((c) => c.planned).map((c) => c.name)).sort();
    expect(planned).toEqual(['Claydol', 'Flygon', 'Manectric', 'Sandslash']);
    expect(SEASONS.some((s) => plan[s].some((c) => c.name === 'Wailord'))).toBe(false);
  });

  it('sorts each season by tier, then name', () => {
    const plan = buildPlan(game, [
      { species: 'Manectric', priority: 'a' }, { species: 'Alakazam', priority: 'hunting' }, { species: 'Psyduck', priority: 'a' },
    ]);
    expect(plan.Winter.map((c) => c.name)).toEqual(['Alakazam', 'Manectric', 'Psyduck']);
  });
});

describe('best spot (tile hover card)', () => {
  it('picks the biggest 5x share, through an earlier stage', () => {
    const s = bestSpot(game, 'Weezing')!;
    expect(s.size).toBe(5);
    expect(s.share).toBe(100);
    expect(s.via).toEqual(['Koffing']);
  });
  it('is null when there is no horde at all', () => {
    expect(bestSpot(game, 'Heatran')).toBeNull();
    expect(bestSpot(game, 'Lapras')).toBeNull();
  });
});
