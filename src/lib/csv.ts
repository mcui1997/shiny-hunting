import Papa from 'papaparse';
import {
  CATCH_COLUMNS, CATCH_STATUSES, GOAL_COLUMNS, GOAL_STATUSES, METHODS, NATURES, NOTE_COLUMNS,
  SEASONS, type CatchRow, type CatchStatus, type FileKey, type GoalRow, type NoteRow,
} from './types';

// ---------- limits ----------
// Anything past these is either a mistake or hostile; the site refuses or trims instead of hanging.

export const LIMITS = {
  /** Largest CSV the importer will read. Your real files are a few KB. */
  fileBytes: 1_000_000,
  rows: 5_000,
  /** Longest notes text, in characters. */
  longText: 4_000,
  /** Longest short field (location, ball, IVs, names…). */
  shortText: 120,
  maxCount: 1_000_000_000,
  maxValue: 1_000_000_000_000,
  minOdds: 2,
};

export class ImportError extends Error {}

// ---------- text cleaning ----------

// C0/C1 control characters except tab and newline, plus zero-width and bidirectional
// override characters that can make text display differently from what it contains.
const UNSAFE_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]/g;

/** Strip invisible/control characters, normalize line breaks, cap length. */
export function cleanText(raw: unknown, max: number, multiline = false): { text: string; trimmed: boolean } {
  let s = typeof raw === 'string' ? raw : raw === null || raw === undefined ? '' : String(raw);
  s = s.replace(/\r\n?/g, '\n').replace(UNSAFE_CHARS, '').replace(/\t/g, ' ');
  if (!multiline) s = s.replace(/\n+/g, ' ');
  s = s.trim();
  const chars = [...s];
  if (chars.length > max) return { text: chars.slice(0, max).join('').trimEnd(), trimmed: true };
  return { text: s, trimmed: false };
}

// ---------- spreadsheet formula injection ----------
// A cell starting with = + - @ (or a tab / carriage return) runs as a formula when the CSV is
// opened in Google Sheets or Excel, which can fetch URLs and leak the sheet. On export those
// cells get a leading apostrophe so spreadsheets show them as text; on import it's removed again.

const FORMULA_START = /^[=+\-@\t\r]/;
export const escapeCell = (s: string) => (FORMULA_START.test(s) ? `'${s}` : s);
export const unescapeCell = (s: string) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s);

// ---------- parsing ----------

export interface Parsed {
  fields: string[];
  rows: Record<string, string>[];
}

/** Header cells are matched loosely: "Est. Value" and "est_value" are the same column. */
export const headerKey = (h: string) =>
  cleanText(h, 60).text.toLowerCase().replace(/[.?]/g, '').replace(/[\s-]+/g, '_');

const HEADER_ALIASES: Record<string, string> = {
  pokemon: 'species', 'pokémon': 'species', value: 'est_value', estimated_value: 'est_value',
  capture_date: 'caught_at', date: 'caught_at', caught: 'caught_at', sold: 'status',
};

/** Only plain snake_case names are kept as columns; anything else (including `__proto__`) is dropped. */
const SAFE_FIELD = /^[a-z][a-z0-9_]{0,39}$/;
const RESERVED = new Set(['constructor', 'prototype', 'hasownproperty', 'tostring', 'valueof', 'isprototypeof']);

export function parseCsv(text: string): Parsed {
  if (text.length > LIMITS.fileBytes) {
    throw new ImportError(`That file is ${Math.round(text.length / 1024)} KB. The limit is ${LIMITS.fileBytes / 1_000_000} MB.`);
  }
  const result = Papa.parse<Record<string, unknown>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    preview: LIMITS.rows + 1,
    transformHeader: (h) => {
      const k = headerKey(h);
      return HEADER_ALIASES[k] ?? k;
    },
  });
  const fields = [...new Set((result.meta.fields ?? []).filter((f) => SAFE_FIELD.test(f) && !RESERVED.has(f)))];
  const rows = result.data.map((r) => {
    const out: Record<string, string> = Object.create(null);
    for (const f of fields) {
      const v = Object.prototype.hasOwnProperty.call(r, f) ? r[f] : '';
      out[f] = unescapeCell(typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v)).trim();
    }
    return out;
  });
  return { fields, rows };
}

export function detectFile(fields: string[]): FileKey | null {
  const has = (f: string) => fields.includes(f);
  if (has('species') && (has('encounters') || has('caught_at'))) return 'caught';
  if (has('species') && (has('priority') || (has('status') && !has('encounters')))) return 'goals';
  if (has('species') && has('notes')) return 'notes';
  return null;
}

export function toCsv(rows: Record<string, string>[], columns: readonly string[]): string {
  return Papa.unparse(
    { fields: [...columns], data: rows.map((r) => columns.map((c) => escapeCell(String(r[c] ?? '')))) },
    { newline: '\n', quotes: false, escapeFormulae: false },
  ) + '\n';
}

// ---------- value parsing ----------

/** "2M", "2.5m", "500k", "2,000,000", "2000000" -> number. Blank, junk, or absurd -> null. */
export function parseValue(raw: string | undefined): number | null {
  const s = (raw ?? '').trim().toLowerCase().replace(/[,\s$]/g, '');
  if (!s || s.length > 20) return null;
  const m = /^(\d+(?:\.\d+)?)([km]?)$/.exec(s);
  if (!m) return null;
  const mult = m[2] === 'm' ? 1_000_000 : m[2] === 'k' ? 1_000 : 1;
  const n = Math.round(Number.parseFloat(m[1]) * mult);
  return Number.isSafeInteger(n) && n <= LIMITS.maxValue ? n : null;
}

/** Whole numbers only: "26,321" -> 26321. Blank, junk, or over a billion -> null. */
export function parseCount(raw: string | undefined): number | null {
  const s = (raw ?? '').trim().replace(/[,\s]/g, '');
  if (!/^\d{1,10}$/.test(s)) return null;
  const n = Number.parseInt(s, 10);
  return n <= LIMITS.maxCount ? n : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Accepts "2026-10-17 19:14", "2026-10-17T19:14", "2026-10-17", "10/17/26, 7:14 PM",
 * "10/17/2026 19:14". Returns "YYYY-MM-DD HH:mm" (or "YYYY-MM-DD" with no time), else null.
 * Impossible dates (Feb 30) and years outside 2000–2100 are rejected.
 */
export function parseDateTime(raw: string | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s || s.length > 30) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/.exec(s);
  if (m) return build(+m[1], +m[2], +m[3], m[4], m[5]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4}),?(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?)?$/i.exec(s);
  if (m) {
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    let hour = m[4];
    if (hour && m[6]) {
      if (+hour < 1 || +hour > 12) return null;
      let h = +hour % 12;
      if (/^p/i.test(m[6])) h += 12;
      hour = String(h);
    }
    return build(year, +m[1], +m[2], hour, m[5]);
  }
  return null;

  function build(y: number, mo: number, d: number, h?: string, mi?: string): string | null {
    if (y < 2000 || y > 2100) return null;
    const check = new Date(Date.UTC(y, mo - 1, d));
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
    const date = `${y}-${pad(mo)}-${pad(d)}`;
    if (h === undefined || mi === undefined) return date;
    if (+h > 23 || +mi > 59) return null;
    return `${date} ${pad(+h)}:${pad(+mi)}`;
  }
}

// ---------- species names ----------

export const nameKey = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/♀/g, 'f').replace(/♂/g, 'm')
    .toLowerCase().replace(/[^a-z0-9]/g, '');

export type Resolve = (name: string) => string | null;

export function makeResolver(names: string[]): Resolve {
  const map = new Map(names.map((n) => [nameKey(n), n]));
  const extra: Record<string, string> = { nidoranfemale: 'nidoranf', nidoranmale: 'nidoranm' };
  return (name: string) => {
    if (name.length > 40) return null;
    const k = nameKey(name);
    return map.get(k) ?? map.get(extra[k] ?? '') ?? null;
  };
}

// ---------- row normalization ----------

export interface Normalized<T> {
  rows: T[];
  issues: string[];
}

const blankRow = <K extends string>(cols: readonly K[]) =>
  Object.fromEntries(cols.map((c) => [c, ''])) as Record<K, string>;

const LONG_FIELDS = new Set(['notes']);

/** Copy only known columns, cleaned and length-capped. */
function pick<K extends string>(raw: Record<string, unknown>, cols: readonly K[], line: number, issues: string[]) {
  const row = blankRow(cols);
  for (const c of cols) {
    const v = Object.prototype.hasOwnProperty.call(raw, c) ? raw[c] : '';
    const long = LONG_FIELDS.has(c);
    const { text, trimmed } = cleanText(v, long ? LIMITS.longText : LIMITS.shortText, long);
    if (trimmed) issues.push(`Line ${line}: ${c} was longer than ${long ? LIMITS.longText : LIMITS.shortText} characters and was cut short.`);
    row[c] = text;
  }
  return row;
}

function tooMany(input: unknown[], issues: string[]) {
  if (input.length > LIMITS.rows) {
    issues.push(`Only the first ${LIMITS.rows.toLocaleString('en-US')} rows were read.`);
    return input.slice(0, LIMITS.rows);
  }
  return input;
}

export function normalizeCatches(input: Record<string, unknown>[], resolve: Resolve): Normalized<CatchRow> {
  const issues: string[] = [];
  const usedIds = new Set<string>();
  const rows: CatchRow[] = [];
  (tooMany(input, issues) as Record<string, unknown>[]).forEach((raw, i) => {
    const line = i + 2; // header is line 1
    if (!raw || typeof raw !== 'object') return;
    const row = pick(raw, CATCH_COLUMNS, line, issues);
    if (!row.species && !row.caught_at && !row.encounters) return; // fully blank / totals row
    if (/^total/i.test(row.species)) return;

    const sp = resolve(row.species);
    if (!sp) issues.push(`Line ${line}: "${row.species}" isn't a Pokémon name I recognize.`);
    else row.species = sp;
    if (row.current_form) {
      const cf = resolve(row.current_form);
      if (!cf) issues.push(`Line ${line}: current form "${row.current_form}" isn't a Pokémon name I recognize.`);
      else row.current_form = cf === row.species ? '' : cf;
    }

    for (const c of ['caught_at', 'evolved_on', 'sold_on'] as const) {
      if (!row[c]) continue;
      const d = parseDateTime(row[c]);
      if (d) row[c] = d;
      else { issues.push(`Line ${line}: couldn't read the date "${row[c]}" in ${c}. Cleared it.`); row[c] = ''; }
    }
    if (row.encounters) {
      const n = parseCount(row.encounters);
      if (n === null) { issues.push(`Line ${line}: encounters "${row.encounters}" isn't a whole number. Cleared it.`); row.encounters = ''; }
      else row.encounters = String(n);
    }
    if (row.odds) {
      const n = parseCount(row.odds);
      if (n === null || n < LIMITS.minOdds) { issues.push(`Line ${line}: odds "${row.odds}" should be a number like 27000. Using the default.`); row.odds = ''; }
      else row.odds = String(n);
    }
    for (const c of ['est_value', 'sold_for'] as const) {
      if (!row[c]) continue;
      const n = parseValue(row[c]);
      if (n === null) { issues.push(`Line ${line}: ${c.replace('_', ' ')} "${row[c]}" isn't a number like 2M or 2000000. Cleared it.`); row[c] = ''; }
      else row[c] = String(n);
    }

    // Old sheet used "Sold? Yes/No"; map that onto status.
    const st = row.status.toLowerCase();
    if (st === 'yes') row.status = 'sold';
    else if (st === 'no' || st === '') row.status = 'kept';
    else if ((CATCH_STATUSES as string[]).includes(st)) row.status = st as CatchStatus;
    else {
      issues.push(`Line ${line}: status "${row.status}" should be kept, sold, traded or fled. Treated as kept.`);
      row.status = 'kept';
    }

    row.method = row.method.toLowerCase();
    if (row.method && !(METHODS as readonly string[]).includes(row.method)) {
      issues.push(`Line ${line}: method "${row.method}" isn't one of ${METHODS.join(', ')}. Set to other.`);
      row.method = 'other';
    }
    if (row.season) {
      const s = SEASONS.find((x) => x.toLowerCase() === row.season.toLowerCase());
      if (!s) { issues.push(`Line ${line}: season "${row.season}" isn't Spring, Summer, Autumn or Winter. Cleared it.`); row.season = ''; }
      else row.season = s;
    }
    if (row.nature) {
      const n = NATURES.find((x) => x.toLowerCase() === row.nature.toLowerCase());
      if (!n) { issues.push(`Line ${line}: nature "${row.nature}" isn't a nature I know. Cleared it.`); row.nature = ''; }
      else row.nature = n;
    }

    if (!/^[A-Za-z0-9_-]{1,20}$/.test(row.id) || usedIds.has(row.id)) row.id = '';
    else usedIds.add(row.id);
    rows.push(row);
  });

  // Give rows without a unique id the next free sNNN id.
  let next = 1;
  for (const r of rows) {
    if (r.id) continue;
    while (usedIds.has(`s${pad3(next)}`)) next++;
    r.id = `s${pad3(next)}`;
    usedIds.add(r.id);
  }
  return { rows, issues };
}

const pad3 = (n: number) => String(n).padStart(3, '0');

export function nextCatchId(rows: CatchRow[]): string {
  const used = new Set(rows.map((r) => r.id));
  let n = rows.length + 1;
  while (used.has(`s${pad3(n)}`)) n++;
  return `s${pad3(n)}`;
}

export function normalizeGoals(input: Record<string, unknown>[], resolve: Resolve): Normalized<GoalRow> {
  const issues: string[] = [];
  const seen = new Set<string>();
  const rows: GoalRow[] = [];
  (tooMany(input, issues) as Record<string, unknown>[]).forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') return;
    const row = pick(raw, GOAL_COLUMNS, i + 2, issues);
    if (!row.species) return;
    const sp = resolve(row.species);
    if (!sp) { issues.push(`Line ${i + 2}: "${row.species}" isn't a Pokémon name I recognize.`); return; }
    if (seen.has(sp)) { issues.push(`Line ${i + 2}: ${sp} is listed twice; kept the first.`); return; }
    seen.add(sp);
    row.species = sp;
    row.priority = row.priority.toUpperCase();
    if (row.priority && !/^P[1-3]$/.test(row.priority)) {
      issues.push(`Line ${i + 2}: priority "${row.priority}" should be P1, P2 or P3. Cleared it.`);
      row.priority = '';
    }
    row.status = (row.status || 'planned').toLowerCase();
    if (!(GOAL_STATUSES as readonly string[]).includes(row.status)) row.status = 'planned';
    rows.push(row);
  });
  return { rows, issues };
}

export function normalizeNotes(input: Record<string, unknown>[], resolve: Resolve): Normalized<NoteRow> {
  const issues: string[] = [];
  const bySpecies = new Map<string, NoteRow>();
  (tooMany(input, issues) as Record<string, unknown>[]).forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') return;
    const row = pick(raw, NOTE_COLUMNS, i + 2, issues);
    if (!row.species) return;
    const sp = resolve(row.species);
    if (!sp) { issues.push(`Line ${i + 2}: "${row.species}" isn't a Pokémon name I recognize.`); return; }
    if (!row.notes) return;
    bySpecies.set(sp, { species: sp, notes: row.notes });
  });
  return { rows: [...bySpecies.values()], issues };
}

export const COLUMNS: Record<FileKey, readonly string[]> = {
  caught: CATCH_COLUMNS,
  goals: GOAL_COLUMNS,
  notes: NOTE_COLUMNS,
};

/** Small, stable hash used to notice when the repo copy of a CSV changed. */
export function hashText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
