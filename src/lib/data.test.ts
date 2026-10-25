import { describe, expect, it } from 'vitest';
import {
  formatValue, ImportError, makeResolver, normalizeWorth, parseValue, normalizeCatches, normalizeGoals, normalizeNotes, parseCount, parseDateTime,
  parseTracker, toTrackerJson,
} from './data';
import { CATCH_COLUMNS, type CatchRow } from './types';

const resolve = makeResolver(['Nidoran♀', 'Nidoran♂', 'Mr. Mime', "Farfetch'd", 'Litwick', 'Chandelure', 'Heatmor', 'Aron', 'Flabébé']);

describe('parseCount', () => {
  it('handles commas', () => expect(parseCount('26,321')).toBe(26321));
  it('rejects decimals and junk', () => {
    expect(parseCount('1.5')).toBeNull();
    expect(parseCount('lots')).toBeNull();
  });
});

describe('parseDateTime', () => {
  it.each([
    ['2026-10-17 19:14', '2026-10-17 19:14'],
    ['2026-10-17T19:14', '2026-10-17 19:14'],
    ['2026-10-17T19:14:00', '2026-10-17 19:14'],
    ['2026-10-17', '2026-10-17'],
    ['9/23/26, 9:04 PM', '2026-09-23 21:04'],
    ['10/14/26, 4:37 AM', '2026-10-14 04:37'],
    ['10/2/26, 12:05 AM', '2026-10-02 00:05'],
    ['10/2/26, 12:05 PM', '2026-10-02 12:05'],
    ['10/17/2026 19:14', '2026-10-17 19:14'],
  ])('%s', (input, out) => expect(parseDateTime(input)).toBe(out));
  it('rejects nonsense', () => {
    expect(parseDateTime('13/45/26')).toBeNull();
    expect(parseDateTime('yesterday')).toBeNull();
  });
});

describe('species names', () => {
  it('matches loosely', () => {
    expect(resolve('nidoran f')).toBe('Nidoran♀');
    expect(resolve('Nidoran-M')).toBe('Nidoran♂');
    expect(resolve('nidoran female')).toBe('Nidoran♀');
    expect(resolve('mr mime')).toBe('Mr. Mime');
    expect(resolve('FARFETCHD')).toBe("Farfetch'd");
    expect(resolve('flabebe')).toBe('Flabébé');
    expect(resolve('litwik')).toBeNull();
  });
});

describe('tracker.json round trip', () => {
  const full = (over: Partial<CatchRow>) => ({ ...(Object.fromEntries(CATCH_COLUMNS.map((c) => [c, ''])) as CatchRow), ...over });

  it('keeps commas, quotes, line breaks and accents', () => {
    const row = full({ id: 's001', species: 'Litwick', caught_at: '2026-10-14 04:37', status: 'kept', location: 'Tilted, grinding at 4 a.m., "for real" — Pokémon é ♀' });
    const text = toTrackerJson({ caught: [row], goals: [], notes: [{ species: 'Litwick', notes: 'line one\nline two' }] });
    const raw = parseTracker(text);
    expect(raw.issues).toEqual([]);
    expect(normalizeCatches(raw.caught, resolve).rows).toEqual([row]);
    expect(normalizeNotes(raw.notes, resolve).rows[0].notes).toBe('line one\nline two');
  });

  it('writes counts as numbers, leaves blanks out, one entry per line', () => {
    const text = toTrackerJson({ caught: [full({ id: 's001', species: 'Aron', encounters: '26321', status: 'kept' })], goals: [], notes: [] });
    const data = JSON.parse(text);
    expect(data.version).toBe(1);
    expect(data.caught[0]).toEqual({ id: 's001', species: 'Aron', encounters: 26321, status: 'kept' });
    expect(text.split('\n').filter((l) => l.includes('"species"'))).toHaveLength(1);
  });

  it('reading then writing the same data gives identical text', () => {
    const text = toTrackerJson({
      caught: [full({ id: 's001', species: 'Aron', current_form: 'Aggron', caught_at: '2026-09-23 21:04', encounters: '26321', status: 'kept', tag: 'cosmetic' })],
      goals: [{ species: 'Chandelure', priority: 'hunting', notes: '' }],
      notes: [],
    });
    const raw = parseTracker(text);
    const again = toTrackerJson({
      caught: normalizeCatches(raw.caught, resolve).rows,
      goals: normalizeGoals(raw.goals, resolve).rows,
      notes: normalizeNotes(raw.notes, resolve).rows,
    });
    expect(again).toBe(text);
  });

  it('missing sections read as empty', () => {
    const raw = parseTracker('{"caught":[{"species":"Aron","caught_at":"2026-09-23"}]}');
    expect(raw.caught).toHaveLength(1);
    expect(raw.goals).toEqual([]);
    expect(raw.notes).toEqual([]);
  });
});

describe('malformed tracker.json', () => {
  it.each([
    ['not JSON', '{caught: [}'],
    ['an array', '[1,2,3]'],
    ['no sections', '{"version":1,"pokemon":[]}'],
    ['a newer version', '{"version":2,"caught":[]}'],
    ['a text version', '{"version":"1","caught":[]}'],
  ])('refuses %s', (_, text) => expect(() => parseTracker(text)).toThrow(ImportError));

  it('reports a section that is not a list', () => {
    const raw = parseTracker('{"caught":{"species":"Aron"},"goals":[]}');
    expect(raw.caught).toEqual([]);
    expect(raw.issues.join(' ')).toMatch(/Caught: should be a list/);
  });

  it('skips entries that are not objects and clears nested values', () => {
    const raw = parseTracker('{"caught":[5,"x",null,["a"],{"species":"Aron","caught_at":"2026-09-23","location":{"a":1},"ball":[1],"odds":true}]}');
    expect(raw.caught).toHaveLength(1);
    expect(raw.caught[0]).toMatchObject({ species: 'Aron', location: '', ball: '', odds: '' });
    expect(raw.issues.filter((i) => /isn't an object/.test(i))).toHaveLength(4);
    expect(raw.issues.filter((i) => /unexpected value/.test(i))).toHaveLength(3);
  });

  it('accepts counts written as text or numbers', () => {
    const raw = parseTracker('{"caught":[{"species":"Aron","caught_at":"2026-09-23","encounters":"26,321"},{"species":"Aron","caught_at":"2026-09-24","encounters":26321}]}');
    expect(normalizeCatches(raw.caught, resolve).rows.map((r) => r.encounters)).toEqual(['26321', '26321']);
  });

  it('ignores a byte-order mark', () => {
    expect(parseTracker('\uFEFF{"goals":[]}').issues).toEqual([]);
  });
});

describe('normalizeCatches', () => {
  it('flags unknown names and bad numbers instead of dropping rows', () => {
    const { rows, issues } = normalizeCatches([
      { species: 'Litwik', encounters: 'lots', odds: 'cheap', caught_at: '2026-10-14 04:37', status: 'kept' },
    ], resolve);
    expect(rows).toHaveLength(1);
    expect(issues.join(' ')).toMatch(/Litwik/);
    expect(issues.join(' ')).toMatch(/encounters/);
    expect(issues.join(' ')).toMatch(/odds/);
  });

  it('keeps unique ids, replaces duplicates, and clears a current form equal to species', () => {
    const { rows } = normalizeCatches([
      { id: 's002', species: 'Aron', caught_at: '2026-09-23' },
      { id: 's002', species: 'Litwick', current_form: 'litwick', caught_at: '2026-10-14' },
      { species: 'Litwick', current_form: 'chandelure', caught_at: '2026-10-15' },
    ], resolve);
    expect(rows.map((r) => r.id)).toEqual(['s002', 's001', 's003']);
    expect(rows[1].current_form).toBe('');
    expect(rows[2].current_form).toBe('Chandelure');
  });

  it('accepts fled and normalizes status case', () => {
    const { rows, issues } = normalizeCatches([{ species: 'Aron', status: 'FLED', caught_at: '2026-10-01' }], resolve);
    expect(issues).toEqual([]);
    expect(rows[0].status).toBe('fled');
  });
});

describe('normalizeGoals', () => {
  it('dedupes and validates the tier', () => {
    const { rows, issues } = normalizeGoals([
      { species: 'chandelure', priority: 'S' },
      { species: 'Chandelure', priority: 'a' },
      { species: 'Aron', priority: 'someday' },
      { species: 'Litwick', priority: 'A tier' },
      { species: 'Heatmor' },
    ], resolve);
    expect(rows).toEqual([
      { species: 'Chandelure', priority: 's', notes: '' },
      { species: 'Aron', priority: 'b', notes: '' },
      { species: 'Litwick', priority: 'a', notes: '' },
      { species: 'Heatmor', priority: 'b', notes: '' },
    ]);
    expect(issues).toHaveLength(2);
  });

  it('converts current / future / unplanned to tiers', () => {
    const { rows, issues } = normalizeGoals([
      { species: 'Aron', priority: 'current' }, { species: 'Litwick', priority: 'future' }, { species: 'Heatmor', priority: '' },
    ], resolve);
    expect(issues).toEqual([]);
    expect(rows.map((r) => r.priority)).toEqual(['hunting', 's', 'b']);
  });

  it('converts old P1–P3 and hunting goals', () => {
    const { rows, issues } = normalizeGoals([
      { species: 'Aron', priority: 'P1', status: 'planned' },
      { species: 'Litwick', priority: '', status: 'hunting' },
      { species: 'Heatmor', priority: 'P3', status: 'hunting' },
      { species: 'Chandelure', priority: 'P2', status: 'paused' },
      { species: 'Mr. Mime', priority: '', status: 'planned' },
    ], resolve);
    expect(issues).toEqual([]);
    expect(rows.map((r) => [r.species, r.priority])).toEqual([
      ['Aron', 'hunting'], ['Litwick', 'hunting'], ['Heatmor', 'hunting'], ['Chandelure', 's'], ['Mr. Mime', 'b'],
    ]);
    expect(rows.every((r) => !('status' in r))).toBe(true);
  });

  it('an old tracker.json with goal status still reads', () => {
    const raw = parseTracker('{"goals":[{"species":"Aron","priority":"P1","status":"hunting"}]}');
    expect(normalizeGoals(raw.goals, resolve).rows[0]).toEqual({ species: 'Aron', priority: 'hunting', notes: '' });
  });
});

describe('screenshots, notes and old tags', () => {
  it('keeps plain screenshot file names and clears anything else', () => {
    const r = normalizeCatches([
      { species: 'Aron', caught_at: '2026-09-23', screenshot: 's001-aron.webp' },
      { species: 'Aron', caught_at: '2026-09-24', screenshot: '../../etc/passwd' },
      { species: 'Aron', caught_at: '2026-09-25', screenshot: 'https://evil.example/x.png' },
      { species: 'Aron', caught_at: '2026-09-26', screenshot: 'Shot One.PNG' },
    ], resolve);
    expect(r.rows.map((x) => x.screenshot)).toEqual(['s001-aron.webp', '', '', '']);
    expect(r.issues).toHaveLength(3);
  });
  it('keeps a multi-line note', () => {
    const r = normalizeCatches([{ species: 'Aron', caught_at: '2026-09-23', note: 'Sturdy lead\nfor False Swipe' }], resolve);
    expect(r.rows[0].note).toBe('Sturdy lead\nfor False Swipe');
  });
  it('old files with tags still import; the tag is dropped', () => {
    const raw = parseTracker('{"caught":[{"species":"Aron","caught_at":"2026-09-23","tag":"utility"}]}');
    const r = normalizeCatches(raw.caught, resolve);
    expect(r.issues).toEqual([]);
    expect('tag' in r.rows[0]).toBe(false);
  });
});

describe('values and net worth', () => {
  it.each([
    ['2500000', 2500000], ['2,500,000', 2500000], ['2.5M', 2500000], ['2.5m', 2500000],
    ['850k', 850000], ['1.2b', 1200000000], ['¥3m', 3000000], ['0', 0],
  ])('reads %s', (raw, n) => expect(parseValue(raw)).toBe(n));
  it.each(['', 'lots', '-5', '2.5', '1e6', '2..5m', '9999b', '1.2345m'])('rejects %j', (raw) => expect(parseValue(raw)).toBeNull());
  it('formats short', () => {
    expect(formatValue(12400000)).toBe('12.4M');
    expect(formatValue(850000)).toBe('850K');
    expect(formatValue(1230000000)).toBe('1.23B');
    expect(formatValue(9500)).toBe('9,500');
    expect(formatValue(0)).toBe('0');
  });
  it('a catch value is stored as a number and written as one', () => {
    const r = normalizeCatches([{ species: 'Aron', caught_at: '2026-09-23', value: '2.5M' }], resolve);
    expect(r.rows[0].value).toBe('2500000');
    const text = toTrackerJson({ caught: r.rows, goals: [], notes: [] });
    expect(JSON.parse(text).caught[0].value).toBe(2500000);
    const bad = normalizeCatches([{ species: 'Aron', caught_at: '2026-09-23', value: 'a lot' }], resolve);
    expect(bad.rows[0].value).toBe('');
    expect(bad.issues.join(' ')).toMatch(/value/);
  });
  it('worth round-trips as an object and only keeps known items', () => {
    const raw = parseTracker('{"caught":[],"worth":{"pokemon":"5m","cosmetics":1200000,"pokeyen":"850k","house":9}}');
    const w = normalizeWorth(raw.worth);
    expect(w.rows).toEqual([{ item: 'pokemon', value: '5000000' }, { item: 'cosmetics', value: '1200000' }, { item: 'pokeyen', value: '850000' }]);
    const text = toTrackerJson({ caught: [], goals: [], notes: [], worth: w.rows });
    expect(JSON.parse(text).worth).toEqual({ pokemon: 5000000, cosmetics: 1200000, pokeyen: 850000 });
  });
  it('a file without worth still reads, and bad worth is reported', () => {
    expect(parseTracker('{"caught":[]}').worth).toEqual([]);
    expect(parseTracker('{"caught":[],"worth":[1,2]}').issues.join(' ')).toMatch(/Worth/);
    expect(normalizeWorth([{ item: 'pokemon', value: 'tons' }]).issues).toHaveLength(1);
  });
});
