import Papa from 'papaparse';
import {
  CATCH_COLUMNS, CATCH_STATUSES, GOAL_COLUMNS, NOTE_COLUMNS,
  type CatchRow, type CatchStatus, type FileKey, type GoalRow, type NoteRow,
} from './types';

export interface Parsed {
  fields: string[];
  rows: Record<string, string>[];
}

/** Header cells are matched loosely: "Est. Value" and "est_value" are the same column. */
export const headerKey = (h: string) =>
  h.replace(/^﻿/, '').trim().toLowerCase().replace(/[.?]/g, '').replace(/[\s-]+/g, '_');

const HEADER_ALIASES: Record<string, string> = {
  pokemon: 'species', 'pokémon': 'species', value: 'est_value', estimated_value: 'est_value',
  capture_date: 'caught_at', date: 'caught_at', caught: 'caught_at', sold: 'status',
};

export function parseCsv(text: string): Parsed {
  const result = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => {
      const k = headerKey(h);
      return HEADER_ALIASES[k] ?? k;
    },
  });
  const fields = (result.meta.fields ?? []).filter(Boolean);
  const rows = result.data.map((r) => {
    const out: Record<string, string> = {};
    for (const f of fields) out[f] = (r[f] ?? '').toString().trim();
    return out;
  });
  return { fields, rows };
}

export function detectFile(fields: string[]): FileKey | null {
  const has = (f: string) => fields.includes(f);
  if (has('species') && (has('encounters') || has('caught_at') || has('thoughts'))) return 'caught';
  if (has('species') && (has('priority') || (has('status') && !has('encounters')))) return 'goals';
  if (has('species') && has('notes')) return 'notes';
  return null;
}

export function toCsv(rows: Record<string, string>[], columns: readonly string[]): string {
  return Papa.unparse(
    { fields: [...columns], data: rows.map((r) => columns.map((c) => r[c] ?? '')) },
    { newline: '\n' },
  ) + '\n';
}

// ---------- value parsing ----------

/** "2M", "2.5m", "500k", "2,000,000", "2000000" -> number. Blank or junk -> null. */
export function parseValue(raw: string | undefined): number | null {
  const s = (raw ?? '').trim().toLowerCase().replace(/[,\s$]/g, '');
  if (!s) return null;
  const m = /^(\d+(?:\.\d+)?)([km]?)$/.exec(s);
  if (!m) return null;
  const n = Number.parseFloat(m[1]);
  const mult = m[2] === 'm' ? 1_000_000 : m[2] === 'k' ? 1_000 : 1;
  return Math.round(n * mult);
}

/** Whole numbers only: "26,321" -> 26321. Blank or junk -> null. */
export function parseCount(raw: string | undefined): number | null {
  const s = (raw ?? '').trim().replace(/[,\s]/g, '');
  if (!/^\d+$/.test(s)) return null;
  return Number.parseInt(s, 10);
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Accepts "2026-10-17 19:14", "2026-10-17T19:14", "2026-10-17", "10/17/26, 7:14 PM",
 * "10/17/2026 19:14". Returns "YYYY-MM-DD HH:mm" (or "YYYY-MM-DD" with no time), else null.
 */
export function parseDateTime(raw: string | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/.exec(s);
  if (m) return build(+m[1], +m[2], +m[3], m[4], m[5]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4}),?(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?)?$/i.exec(s);
  if (m) {
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    let hour = m[4];
    if (hour && m[6]) {
      let h = +hour % 12;
      if (/^p/i.test(m[6])) h += 12;
      hour = String(h);
    }
    return build(year, +m[1], +m[2], hour, m[5]);
  }
  return null;

  function build(y: number, mo: number, d: number, h?: string, mi?: string): string | null {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
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

export function normalizeCatches(input: Record<string, string>[], resolve: Resolve): Normalized<CatchRow> {
  const issues: string[] = [];
  const usedIds = new Set<string>();
  const rows: CatchRow[] = [];
  input.forEach((raw, i) => {
    const line = i + 2; // header is line 1
    const row = blankRow(CATCH_COLUMNS);
    for (const c of CATCH_COLUMNS) row[c] = raw[c] ?? '';
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
      else issues.push(`Line ${line}: couldn't read the date "${row[c]}" in ${c}.`);
    }
    for (const c of ['encounters', 'odds'] as const) {
      if (!row[c]) continue;
      const n = parseCount(row[c]);
      if (n === null) issues.push(`Line ${line}: ${c} "${row[c]}" isn't a whole number.`);
      else row[c] = String(n);
    }
    for (const c of ['est_value', 'sold_for'] as const) {
      if (!row[c]) continue;
      const n = parseValue(row[c]);
      if (n === null) issues.push(`Line ${line}: ${c.replace('_', ' ')} "${row[c]}" isn't a number like 2M or 2000000.`);
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

    if (!row.id || usedIds.has(row.id)) row.id = '';
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

export function normalizeGoals(input: Record<string, string>[], resolve: Resolve): Normalized<GoalRow> {
  const issues: string[] = [];
  const seen = new Set<string>();
  const rows: GoalRow[] = [];
  input.forEach((raw, i) => {
    const row = blankRow(GOAL_COLUMNS);
    for (const c of GOAL_COLUMNS) row[c] = raw[c] ?? '';
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
    if (!['planned', 'hunting', 'paused'].includes(row.status)) row.status = 'planned';
    rows.push(row);
  });
  return { rows, issues };
}

export function normalizeNotes(input: Record<string, string>[], resolve: Resolve): Normalized<NoteRow> {
  const issues: string[] = [];
  const bySpecies = new Map<string, NoteRow>();
  input.forEach((raw, i) => {
    if (!raw.species) return;
    const sp = resolve(raw.species);
    if (!sp) { issues.push(`Line ${i + 2}: "${raw.species}" isn't a Pokémon name I recognize.`); return; }
    if (!(raw.notes ?? '').trim()) return;
    bySpecies.set(sp, { species: sp, notes: raw.notes.trim() });
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
