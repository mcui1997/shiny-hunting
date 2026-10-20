import { describe, expect, it } from 'vitest';
import {
  ImportError, makeResolver, normalizeCatches, normalizeGoals, normalizeNotes, normalizeTag, parseCount, parseDateTime,
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
      goals: [{ species: 'Chandelure', priority: 'P1', status: 'hunting', notes: '' }],
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
  it('dedupes and validates priority', () => {
    const { rows, issues } = normalizeGoals([
      { species: 'chandelure', priority: 'p1', status: '' },
      { species: 'Chandelure', priority: 'P2', status: 'hunting' },
      { species: 'Aron', priority: 'P9', status: 'whenever' },
    ], resolve);
    expect(rows).toEqual([
      { species: 'Chandelure', priority: 'P1', status: 'planned', notes: '' },
      { species: 'Aron', priority: '', status: 'planned', notes: '' },
    ]);
    expect(issues).toHaveLength(2);
  });
});

describe('tags', () => {
  it('normalizes and keeps tags', () => {
    const r = normalizeCatches([
      { species: 'Aron', caught_at: '2026-09-23', tag: ' Utility ' },
      { species: 'Aron', caught_at: '2026-09-24', tag: 'Cosmetic!!' },
      { species: 'Aron', caught_at: '2026-09-25', tag: '' },
    ], resolve);
    expect(r.rows.map((x) => x.tag)).toEqual(['utility', 'cosmetic', '']);
    expect(r.issues).toHaveLength(1);
  });
  it('caps tag length', () => expect(normalizeTag('x'.repeat(50))).toHaveLength(24));
  it('an entry without a tag still imports', () => {
    const r = normalizeCatches(parseTracker('{"caught":[{"species":"Aron","caught_at":"2026-09-23"}]}').caught, resolve);
    expect(r.rows[0].tag).toBe('');
  });
});
