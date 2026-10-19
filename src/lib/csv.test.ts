import { describe, expect, it } from 'vitest';
import {
  detectFile, makeResolver, normalizeCatches, normalizeGoals, normalizeTag, parseCount, parseCsv, parseDateTime,
  parseValue, toCsv,
} from './csv';
import { CATCH_COLUMNS } from './types';

const resolve = makeResolver(['Nidoran♀', 'Nidoran♂', 'Mr. Mime', "Farfetch'd", 'Litwick', 'Chandelure', 'Heatmor', 'Aron', 'Flabébé']);

describe('parseValue', () => {
  it.each([
    ['2M', 2_000_000], ['2.5m', 2_500_000], ['350k', 350_000], ['2,000,000', 2_000_000],
    ['3500000', 3_500_000], [' 4M ', 4_000_000], ['$1.2M', 1_200_000],
  ])('%s -> %d', (s, n) => expect(parseValue(s)).toBe(n));
  it.each(['', 'abc', '2MM', '-5'])('rejects %j', (s) => expect(parseValue(s)).toBeNull());
});

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

describe('CSV round trip', () => {
  it('keeps commas, quotes, line breaks and accents', () => {
    const row = Object.fromEntries(CATCH_COLUMNS.map((c) => [c, ''])) as Record<string, string>;
    row.id = 's001';
    row.species = 'Litwick';
    row.location = 'Tilted, grinding at 4 a.m., "for real" — Pokémon é ♀';
    const text = toCsv([row], CATCH_COLUMNS);
    const back = parseCsv(text).rows[0];
    expect(back.location).toBe(row.location);
    expect(back.species).toBe('Litwick');
  });

  it('reads a Google Sheets / Excel style export with a BOM and old headers', () => {
    const text = '﻿Pokémon,Encounters,Capture Date,Value,Sold?,Thoughts\r\nAron,"26,321","9/23/26, 9:04 PM",2M,No,"My first, honestly"\r\nHeatmor,36178,"9/30/26, 10:59 PM",3500000,Yes,Painful\r\nTOTAL,=SUM(B2:B3),,,,\r\n';
    const parsed = parseCsv(text);
    expect(detectFile(parsed.fields)).toBe('caught');
    const { rows, issues } = normalizeCatches(parsed.rows, resolve);
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 's001', species: 'Aron', encounters: '26321', caught_at: '2026-09-23 21:04', est_value: '2000000', status: 'kept' });
    expect('thoughts' in rows[0]).toBe(false); // old Thoughts column is ignored
    expect(rows[1]).toMatchObject({ id: 's002', species: 'Heatmor', status: 'sold' });
  });
});

describe('normalizeCatches', () => {
  it('flags unknown names and bad numbers instead of dropping rows', () => {
    const { rows, issues } = normalizeCatches([
      { species: 'Litwik', encounters: 'lots', est_value: 'cheap', caught_at: '2026-10-14 04:37', status: 'kept' },
    ], resolve);
    expect(rows).toHaveLength(1);
    expect(issues.join(' ')).toMatch(/Litwik/);
    expect(issues.join(' ')).toMatch(/encounters/);
    expect(issues.join(' ')).toMatch(/est value/);
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
  it('a CSV without a tag column still imports', () => {
    const r = normalizeCatches(parseCsv('species,caught_at\nAron,2026-09-23\n').rows, resolve);
    expect(r.rows[0].tag).toBe('');
  });
});
