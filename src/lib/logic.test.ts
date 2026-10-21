import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeResolver, normalizeCatches, normalizeGoals, normalizeNotes, parseTracker, toTrackerJson } from './data';
import { Game, hordeSpots, huntSummary, shareIn } from './game';
import { goalProgress } from './goals';
import { chanceWithin, DexIndex, poissonAtLeast, summarize } from './stats';
import { CATCH_COLUMNS, type CatchRow, type GameData } from './types';

const game = new Game(JSON.parse(readFileSync(resolvePath(__dirname, '../../public/data/pokemon.json'), 'utf8')) as GameData);
const trackerText = readFileSync(resolvePath(__dirname, '../../public/data/tracker.json'), 'utf8');
const repoRaw = parseTracker(trackerText);
const repoCaught = normalizeCatches(repoRaw.caught, makeResolver(game.names));
const repoGoals = normalizeGoals(repoRaw.goals, makeResolver(game.names));
const repoNotes = normalizeNotes(repoRaw.notes, makeResolver(game.names));

const make = (over: Partial<CatchRow>): CatchRow => ({ ...(Object.fromEntries(CATCH_COLUMNS.map((c) => [c, ''])) as CatchRow), status: 'kept', ...over });

describe('repo data', () => {
  it('tracker.json reads without issues', () => {
    expect(repoRaw.issues).toEqual([]);
    expect(repoCaught.issues).toEqual([]);
    expect(repoGoals.issues).toEqual([]);
    expect(repoNotes.issues).toEqual([]);
    expect(repoCaught.rows).toHaveLength(9);
    expect(repoGoals.rows).toHaveLength(55);
  });

  it('tracker.json is exactly what the site would export', () => {
    expect(toTrackerJson({ caught: repoCaught.rows, goals: repoGoals.rows, notes: repoNotes.rows })).toBe(trackerText);
  });

  it('matches the totals from the original sheet', () => {
    const s = summarize(repoCaught.rows);
    expect(s.total).toBe(9);
    expect(s.encounters).toBe(164_632);
    expect(s.luck!.toFixed(2)).toBe('1.48');
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

describe('hunt summary (best 5x share per season)', () => {
  const sp = (n: string) => game.byName.get(n)!;
  const strip = (n: string) => {
    const h = huntSummary(sp(n));
    return Object.fromEntries(Object.entries(h.seasons).map(([k, v]) => [k, v ? v.share : null]));
  };

  it('Aron: 50/50 with Boldore in Spring at Mistralton Cave (2F), solo in Autumn', () => {
    expect(strip('Aron')).toEqual({ Spring: 50, Summer: 60, Autumn: 100, Winter: 50 });
    expect(huntSummary(sp('Aron')).seasons.Autumn?.area).toBe('Mistralton Cave (2F)');
  });
  it('Litwick is solo every season', () => expect(strip('Litwick')).toEqual({ Spring: 100, Summer: 100, Autumn: 100, Winter: 100 }));
  it('Dratini tops out at 20%', () => expect(Math.max(...Object.values(strip('Dratini')).map((v) => v ?? 0))).toBe(20));
  it('Nidorino is solo only in Summer', () => expect(strip('Nidorino').Summer).toBe(100));
  it('Weezing is solo only in Spring', () => {
    const s = strip('Weezing');
    expect(s.Spring).toBe(100);
    expect([s.Summer, s.Autumn, s.Winter].every((v) => v === null || v < 100)).toBe(true);
  });
  it('a solo that only holds at night says so', () => {
    expect(huntSummary(sp('Ponyta')).seasons.Autumn).toMatchObject({ share: 100, times: ['Night'], area: 'Kindle Road' });
  });
  it('no 5x hordes: Larvesta (single), Treecko (lure)', () => {
    expect(Object.values(huntSummary(sp('Larvesta')).seasons).every((v) => v === null)).toBe(true);
    expect(huntSummary(sp('Treecko')).other).toEqual(['Lure']);
  });
});

describe('dex facts', () => {
  const dex = (n: string) => game.byName.get(n)!.dex;
  const hidden = (n: string) => dex(n).abilities.find((a) => a.hidden)?.name ?? null;

  it('marks known hidden abilities', () => {
    expect(hidden('Litwick')).toBe('Infiltrator');
    expect(hidden('Abra')).toBe('Magic Guard');
    expect(hidden('Ditto')).toBe('Imposter');
    expect(hidden('Eevee')).toBe('Anticipation');
    expect(hidden('Torkoal')).toBe('Shell Armor');
    expect(hidden('Larvesta')).toBe('Swarm');
  });
  it('no duplicate or placeholder abilities', () => {
    expect(dex('Magikarp').abilities.map((a) => a.name)).toEqual(['Swift Swim', 'Rattled']);
    expect(dex('Gastly').abilities.map((a) => a.name)).toEqual(['Levitate']);
    expect(dex('Shedinja').abilities.map((a) => [a.name, a.hidden])).toEqual([['Wonder Guard', false]]);
    for (const p of game.list) expect(p.dex.abilities.some((a) => a.name === '--')).toBe(false);
  });
  it('base stats and gender', () => {
    expect(dex('Chandelure').stats).toEqual([60, 55, 90, 145, 90, 80]);
    expect(dex('Bulbasaur').female).toBe(12.5);
    expect(dex('Abra').female).toBe(25);
    expect(dex('Chansey').female).toBe(100);
    expect(dex('Gallade').female).toBe(0);
    expect(dex('Magnemite').female).toBeNull();
  });
});

describe('ability text', () => {
  it('every ability has an effect, field effects where PokeMMO has one', () => {
    for (const p of game.list) for (const a of p.dex.abilities) expect(a.effect.length).toBeGreaterThan(5);
    const flame = game.byName.get('Litwick')!.dex.abilities.find((a) => a.name === 'Flame Body')!;
    expect(flame.field).toMatch(/50% faster/);
    expect(game.byName.get('Butterfree')!.dex.abilities.some((a) => a.name === 'Compound Eyes')).toBe(true);
  });
});

describe('uses tags', () => {
  const uses = (n: string) => game.byName.get(n)!.uses;
  const tags = (n: string) => uses(n).map((u) => u.tag);
  const item = (n: string, tag: string, name: string) => uses(n).find((u) => u.tag === tag)?.items.find((i) => i.name === name);

  it('egg hatchers, Synchronize at PokeMMO\'s 20%', () => {
    expect(tags('Litwick')).toContain('egg');
    expect(tags('Torkoal')).not.toContain('egg'); // White Smoke / Drought / Shell Armor
    expect(item('Abra', 'sync', 'Synchronize')?.effect).toMatch(/20%/);
  });
  it('abilities with no out-of-battle effect in PokeMMO get no tag', () => {
    for (const p of game.list) {
      for (const u of p.uses) for (const i of u.items) expect(['Compound Eyes', 'Static']).not.toContain(i.name);
    }
    expect(item('Magnemite', 'more', 'Magnet Pull')).toBeUndefined();
  });
  it('moves learned only as an earlier stage say so', () => {
    expect(item('Breloom', 'sleep', 'Spore')?.how).toBe('as Shroomish, Lv 40');
    expect(item('Shroomish', 'sleep', 'Spore')?.how).toBe('Lv 40');
  });
  it('a use from a hidden ability is labeled', () => {
    const swarm = item('Larvesta', 'more', 'Swarm');
    expect(swarm).toMatchObject({ how: 'hidden ability', hidden: true });
  });
  it('Sweet Scent and False Swipe', () => {
    expect(tags('Oddish')).toContain('scent');
    expect(item('Gallade', 'swipe', 'False Swipe')?.how).toBe('Lv 23');
    expect(tags('Smeargle')).toEqual(['sketch']);
  });
  it('sleep moves are listed most accurate first, Yawn last', () => {
    const names = uses('Eevee').find((u) => u.tag === 'sleep')!.items.map((i) => i.name);
    expect(names[names.length - 1]).toBe('Yawn');
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

});

describe('evolutions and goals', () => {
  const litwick = make({ id: 's1', species: 'Litwick', caught_at: '2026-10-14 04:37' });
  const familyOf = (n: string) => game.byName.get(n)?.family;

  it('an unevolved Litwick leaves the Chandelure goal at "evolve to finish"', () => {
    const p = goalProgress({ species: 'Chandelure', priority: 'P1', status: 'planned', notes: '' }, [litwick], game);
    expect(p.kind).toBe('evolve');
    if (p.kind === 'evolve') expect(p.steps.map((s) => game.name(s.id))).toEqual(['Lampent', 'Chandelure']);
  });

  const stagesBetween = (from: string, to: string) =>
    (game.path(game.byName.get(from)!.id, game.byName.get(to)!.id) ?? []).slice(0, -1).map((s) => game.name(s.id));

  it('evolving completes the goal and marks every stage it passed through', () => {
    const evolved = { ...litwick, current_form: 'Chandelure' };
    expect(goalProgress({ species: 'Chandelure', priority: '', status: 'planned', notes: '' }, [evolved], game).kind).toBe('done');
    const dex = new DexIndex([evolved], familyOf, stagesBetween);
    expect(dex.get('Chandelure').state).toBe('owned');
    expect(dex.get('Lampent').state).toBe('evolved');
    expect(dex.get('Litwick').state).toBe('evolved');
    for (const n of ['Litwick', 'Lampent', 'Chandelure']) expect(dex.get(n).catches[0].id).toBe('s1');
  });

  it('a one-step evolution marks only the two ends', () => {
    const dex = new DexIndex([{ ...litwick, current_form: 'Lampent' }], familyOf, stagesBetween);
    expect(dex.get('Lampent').state).toBe('owned');
    expect(dex.get('Litwick').state).toBe('evolved');
    expect(dex.get('Chandelure').state).toBe('line');
  });

  it('a sold shiny is "gone" at every stage, not owned', () => {
    const dex = new DexIndex([make({ species: 'Aron', current_form: 'Aggron', status: 'sold' })], familyOf, stagesBetween);
    for (const n of ['Aron', 'Lairon', 'Aggron']) expect(dex.get(n).state).toBe('gone');
  });

  it('your tracker.json: every evolution chain is valid', () => {
    for (const c of repoCaught.rows.filter((r) => r.current_form)) {
      expect(game.canBecome(game.byName.get(c.species)!.id, game.byName.get(c.current_form)!.id)).toBe(true);
    }
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
