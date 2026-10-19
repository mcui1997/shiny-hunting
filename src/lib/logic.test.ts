import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeResolver, normalizeCatches, parseCsv } from './csv';
import { Game, hordeSpots, shareIn } from './game';
import { goalProgress } from './goals';
import { chanceWithin, DexIndex, poissonAtLeast, summarize } from './stats';
import { CATCH_COLUMNS, type CatchRow, type GameData } from './types';

const game = new Game(JSON.parse(readFileSync(resolvePath(__dirname, '../../public/data/pokemon.json'), 'utf8')) as GameData);
const repoCaught = normalizeCatches(
  parseCsv(readFileSync(resolvePath(__dirname, '../../public/data/caught.csv'), 'utf8')).rows,
  makeResolver(game.names),
);

const make = (over: Partial<CatchRow>): CatchRow => ({ ...(Object.fromEntries(CATCH_COLUMNS.map((c) => [c, ''])) as CatchRow), status: 'kept', ...over });

describe('repo data', () => {
  it('caught.csv parses without issues', () => {
    expect(repoCaught.issues).toEqual([]);
    expect(repoCaught.rows).toHaveLength(9);
  });

  it('matches the totals from the original sheet', () => {
    const s = summarize(repoCaught.rows);
    expect(s.total).toBe(9);
    expect(s.encounters).toBe(164_632);
    expect(s.luck!.toFixed(2)).toBe('1.48');
    expect(s.valueHeld).toBe(20_000_000);
    expect(s.valueSold).toBe(3_500_000);
    expect(s.fastest?.species).toBe('Nidorino');
    expect(s.slowest?.species).toBe('Heatmor');
  });
});

describe('game data matches hunts confirmed in-game', () => {
  const sp = (n: string) => game.byName.get(n)!;
  const rows = (n: string, area: string, season: string) =>
    sp(n).hordes.filter((h) => h.area === area && h.seasons.includes(season as never));

  it('has all 649 species', () => expect(game.list).toHaveLength(649));

  it('Litwick is solo on Celestial Tower 2F in every season', () => {
    for (const season of ['Spring', 'Summer', 'Autumn', 'Winter']) {
      const [h] = rows('Litwick', 'Celestial Tower (2F)', season);
      expect(shareIn(h, 607)).toEqual([100, 100, 100]);
    }
  });

  it('Axew is 40% with Woobat in Spring at Guidance Chamber', () => {
    const [h] = rows('Axew', 'Guidance Chamber', 'Spring');
    expect(h.split[1]).toEqual([[527, 60], [610, 40]]);
  });

  it('Dratini is never more than 20% of a horde', () => {
    expect(Math.max(...hordeSpots(sp('Dratini')).map((s) => s.best))).toBe(20);
  });

  it('Nidorino is solo only on Route 13 on Summer nights', () => {
    const solo = hordeSpots(sp('Nidorino')).filter((s) => s.best === 100);
    expect(solo).toHaveLength(1);
    expect(solo[0].row.area).toBe('Route 13');
    expect(solo[0].row.seasons).toEqual(['Summer']);
    expect(solo[0].bestTimes).toEqual(['Night']);
  });

  it('Weezing is solo only in Spring (Winter hordes are shared)', () => {
    const solo = hordeSpots(sp('Weezing')).filter((s) => s.best === 100);
    expect(solo.map((s) => s.row.seasons)).toEqual([['Spring']]);
    expect(hordeSpots(sp('Weezing'), 'Winter').every((s) => s.best < 100)).toBe(true);
  });

  it('Ponyta has solo spots in Spring, Summer and Autumn, but only shared hordes in Winter', () => {
    for (const season of ['Spring', 'Summer', 'Autumn'] as const) expect(hordeSpots(sp('Ponyta'), season)[0].best).toBe(100);
    const winter = hordeSpots(sp('Ponyta'), 'Winter');
    expect(winter.length).toBeGreaterThan(0);
    expect(winter.every((s) => s.best < 100)).toBe(true);
  });

  it('Larvesta is a wild single encounter, Treecko is lure-only', () => {
    expect(sp('Larvesta').singles.length).toBeGreaterThan(0);
    expect(sp('Treecko').rare.map((r) => r.kind)).toEqual(['Lure']);
  });

  it('knows evolution lines, including branches', () => {
    expect(game.family(608).map((s) => s.name)).toEqual(['Litwick', 'Lampent', 'Chandelure']);
    expect(game.canBecome(280, 475)).toBe(true); // Ralts -> Gallade
    expect(game.canBecome(282, 475)).toBe(false); // Gardevoir -/-> Gallade
    expect(game.path(607, 609)?.map((s) => s.how)).toEqual(['Level 41', 'Dusk Stone']);
  });
});

describe('luck math', () => {
  it('poisson tail', () => {
    expect(poissonAtLeast(0, 3)).toBe(1);
    expect(poissonAtLeast(1, 1)).toBeCloseTo(1 - Math.exp(-1), 10);
  });
  it('chance within', () => expect(chanceWithin(1397, 27000)).toBeCloseTo(0.0504, 3));

  it('leaves traded and bought shinies out of luck, keeps fled ones', () => {
    const s = summarize([
      make({ id: 'a', encounters: '27000' }),
      make({ id: 'b', encounters: '27000', status: 'fled' }),
      make({ id: 'c', method: 'traded', encounters: '' }),
      make({ id: 'd', method: 'bought', encounters: '5' }),
    ]);
    expect(s.luckCount).toBe(2);
    expect(s.encounters).toBe(54000);
    expect(s.luck).toBeCloseTo(1, 10);
  });

  it('uses each row’s own odds', () => {
    const s = summarize([make({ encounters: '10000', odds: '10000' }), make({ encounters: '27000' })]);
    expect(s.expected).toBeCloseTo(2, 10);
  });

  it('sold value prefers the sale price and flags estimates', () => {
    const s = summarize([
      make({ status: 'sold', est_value: '3000000', sold_for: '3500000' }),
      make({ status: 'sold', est_value: '1000000' }),
    ]);
    expect(s.valueSold).toBe(4_500_000);
    expect(s.soldIsEstimate).toBe(true);
    expect(s.valueHeld).toBe(0);
  });
});

describe('evolutions and goals', () => {
  const litwick = make({ id: 's1', species: 'Litwick', caught_at: '2026-10-14 04:37' });
  const familyOf = (n: string) => game.byName.get(n)?.family;

  it('an unevolved Litwick leaves the Chandelure goal at "evolve to finish"', () => {
    const p = goalProgress({ species: 'Chandelure', priority: 'P1', status: 'planned', notes: '' }, [litwick], game);
    expect(p.kind).toBe('evolve');
    if (p.kind === 'evolve') expect(p.steps.map((s) => game.name(s.id))).toEqual(['Lampent', 'Chandelure']);
  });

  it('evolving completes the goal and moves ownership to the new form', () => {
    const evolved = { ...litwick, current_form: 'Chandelure' };
    expect(goalProgress({ species: 'Chandelure', priority: '', status: 'planned', notes: '' }, [evolved], game).kind).toBe('done');
    const dex = new DexIndex([evolved], familyOf);
    expect(dex.get('Chandelure').state).toBe('owned');
    expect(dex.get('Litwick').state).toBe('caught');
    expect(dex.get('Lampent').state).toBe('line');
    expect(dex.get('Chandelure').catches[0].id).toBe('s1');
  });

  it('a sold or fled shiny never completes a goal', () => {
    for (const status of ['sold', 'fled', 'traded']) {
      const c = { ...litwick, current_form: 'Chandelure', status };
      expect(goalProgress({ species: 'Chandelure', priority: '', status: 'planned', notes: '' }, [c], game).kind).toBe('open');
    }
  });

  it('a Gardevoir cannot finish a Gallade goal', () => {
    const g = make({ species: 'Ralts', current_form: 'Gardevoir' });
    expect(goalProgress({ species: 'Gallade', priority: '', status: 'planned', notes: '' }, [g], game).kind).toBe('open');
  });
});
