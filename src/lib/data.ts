import {
  CATCH_COLUMNS, CATCH_STATUSES, GOAL_COLUMNS, METHODS, NATURES, NOTE_COLUMNS,
  DEFAULT_PRIORITY, PRIORITIES, SCREENSHOT_NAME, SEASONS, WORTH_COLUMNS, WORTH_ITEMS, type CatchRow, type CatchStatus, type FileKey, type GoalRow, type NoteRow,
  type WorthRow,
} from './types';

// ---------- limits ----------
// Anything past these is either a mistake or hostile; the site refuses or trims instead of hanging.

export const LIMITS = {
  /** Largest file the importer will read. Your real file is a few KB. */
  fileBytes: 1_000_000,
  rows: 5_000,
  /** Longest notes text, in characters. */
  longText: 4_000,
  /** Longest short field (location, ball, IVs, names…). */
  shortText: 120,
  maxCount: 1_000_000_000,
  /** Largest pokeyen value accepted (a trillion). */
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

// ---------- tracker.json ----------
// All of your data lives in one file: { version, caught: [...], goals: [...], notes: [...], worth: {...} }.
// `worth` is an object ({"pokemon": 5000000, "cosmetics": 1200000}); internally it's rows like the rest.
// Blank fields are left out, encounters and odds are numbers. Everything read from it goes
// through the normalizers below, exactly like edits made on the site.

export const FORMAT_VERSION = 1;
export const SECTIONS: readonly FileKey[] = ['caught', 'goals', 'notes', 'worth'];

export interface RawTracker {
  caught: Record<string, string>[];
  goals: Record<string, string>[];
  notes: Record<string, string>[];
  worth: Record<string, string>[];
  issues: string[];
}

export const SECTION_LABEL: Record<FileKey, string> = { caught: 'Caught', goals: 'Goals', notes: 'Notes', worth: 'Worth' };

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Copy only known fields with plain values. Anything nested or unexpected is dropped and reported. */
function flatEntry(raw: unknown, cols: readonly string[], where: string, issues: string[]): Record<string, string> | null {
  if (!isPlainObject(raw)) {
    issues.push(`${where}: isn't an object. Skipped it.`);
    return null;
  }
  const out: Record<string, string> = Object.create(null);
  for (const c of cols) {
    if (!Object.prototype.hasOwnProperty.call(raw, c)) { out[c] = ''; continue; }
    const v = raw[c];
    if (typeof v === 'string') out[c] = v;
    else if (typeof v === 'number' && Number.isFinite(v)) out[c] = String(v);
    else if (v === null || v === undefined) out[c] = '';
    else { issues.push(`${where}: ${c} has an unexpected value. Cleared it.`); out[c] = ''; }
  }
  return out;
}

/** Parse tracker.json text into flat string rows. Not validated yet: run the normalizers next. */
export function parseTracker(text: string): RawTracker {
  if (text.length > LIMITS.fileBytes) {
    throw new ImportError(`That file is ${Math.round(text.length / 1024)} KB. The limit is ${LIMITS.fileBytes / 1_000_000} MB.`);
  }
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new ImportError("That file isn't valid JSON.");
  }
  if (!isPlainObject(data) || !(['caught', 'goals', 'notes'] as const).some((s) => Object.prototype.hasOwnProperty.call(data, s))) {
    throw new ImportError("That doesn't look like a tracker.json (no caught, goals or notes).");
  }
  if ('version' in data && (typeof data.version !== 'number' || data.version > FORMAT_VERSION)) {
    throw new ImportError(`That file is format version ${String(data.version).slice(0, 10)}; this site reads version ${FORMAT_VERSION}.`);
  }
  const issues: string[] = [];
  const out: RawTracker = { caught: [], goals: [], notes: [], worth: [], issues };
  for (const s of SECTIONS) {
    if (!Object.prototype.hasOwnProperty.call(data, s)) continue;
    if (s === 'worth') {
      const w = data.worth;
      if (!isPlainObject(w)) { issues.push('Worth: should be an object like {"pokemon": 5000000}. Ignored it.'); continue; }
      for (const item of WORTH_ITEMS) {
        if (!Object.prototype.hasOwnProperty.call(w, item)) continue;
        const row = flatEntry({ item, value: w[item] }, WORTH_COLUMNS, `Worth ${item}`, issues);
        if (row) out.worth.push(row);
      }
      continue;
    }
    const list = data[s];
    if (!Array.isArray(list)) { issues.push(`${SECTION_LABEL[s]}: should be a list. Ignored it.`); continue; }
    let items = list;
    if (items.length > LIMITS.rows) {
      issues.push(`${SECTION_LABEL[s]}: only the first ${LIMITS.rows.toLocaleString('en-US')} entries were read.`);
      items = items.slice(0, LIMITS.rows);
    }
    items.forEach((raw, i) => {
      const row = flatEntry(raw, READ_COLUMNS[s], `${SECTION_LABEL[s]} entry ${i + 1}`, issues);
      if (row) out[s].push(row);
    });
  }
  return out;
}

const NUMBER_FIELDS = new Set(['encounters', 'odds', 'value']);

/** Blank fields left out; counts written as numbers. */
function compact(row: Record<string, string>, cols: readonly string[]) {
  const o: Record<string, string | number> = {};
  for (const c of cols) {
    const v = row[c] ?? '';
    if (v === '') continue;
    o[c] = NUMBER_FIELDS.has(c) && /^\d{1,13}$/.test(v) ? Number(v) : v;
  }
  return o;
}

/** tracker.json text, one entry per line so GitHub diffs show exactly which catch changed. */
export function toTrackerJson(rows: { caught: CatchRow[]; goals: GoalRow[]; notes: NoteRow[]; worth?: WorthRow[] }): string {
  const list = (s: FileKey) => {
    if (s === 'worth') {
      const w: Record<string, number> = {};
      for (const r of rows.worth ?? []) if (/^\d{1,13}$/.test(r.value)) w[r.item] = Number(r.value);
      return JSON.stringify(w).replace(/,/g, ', ');
    }
    const items = (rows[s] as Record<string, string>[]).map((r) => '    ' + JSON.stringify(compact(r, COLUMNS[s])));
    return items.length ? `[\n${items.join(',\n')}\n  ]` : '[]';
  };
  return `{\n  "version": ${FORMAT_VERSION},\n${SECTIONS.map((s) => `  "${s}": ${list(s)}`).join(',\n')}\n}\n`;
}

// ---------- value parsing ----------

/**
 * Pokeyen amounts: "2500000", "2,500,000", "2.5M", "850k", "1.2b" -> whole number.
 * Blank, junk, negative or over a trillion -> null.
 */
export function parseValue(raw: string | undefined): number | null {
  const s = (raw ?? '').trim().toLowerCase().replace(/[,\s_]/g, '').replace(/^[¥₽$]/, '');
  const m = /^(\d{1,13}(?:\.\d{1,3})?)([kmb])?$/.exec(s);
  if (!m) return null;
  const mult = m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : m[2] === 'b' ? 1e9 : 1;
  if (!m[2] && m[1].includes('.')) return null;
  const n = Math.round(Number(m[1]) * mult);
  return Number.isSafeInteger(n) && n <= LIMITS.maxValue ? n : null;
}

/** 12400000 -> "12.4M", 850000 -> "850K", 1230000000 -> "1.23B". */
export function formatValue(n: number): string {
  const short = (x: number, unit: string) => `${Number(x.toPrecision(3)).toLocaleString('en-US')}${unit}`;
  if (n >= 1e9) return short(n / 1e9, 'B');
  if (n >= 1e6) return short(n / 1e6, 'M');
  if (n >= 1e4) return short(n / 1e3, 'K');
  return n.toLocaleString('en-US');
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

const LONG_FIELDS = new Set(['notes', 'note']);

/** Copy only known columns, cleaned and length-capped. */
function pick<K extends string>(raw: Record<string, unknown>, cols: readonly K[], line: number, issues: string[]) {
  const row = blankRow(cols);
  for (const c of cols) {
    const v = Object.prototype.hasOwnProperty.call(raw, c) ? raw[c] : '';
    const long = LONG_FIELDS.has(c);
    const { text, trimmed } = cleanText(v, long ? LIMITS.longText : LIMITS.shortText, long);
    if (trimmed) issues.push(`Entry ${line}: ${c} was longer than ${long ? LIMITS.longText : LIMITS.shortText} characters and was cut short.`);
    row[c] = text;
  }
  return row;
}

function tooMany(input: unknown[], issues: string[]) {
  if (input.length > LIMITS.rows) {
    issues.push(`Only the first ${LIMITS.rows.toLocaleString('en-US')} entries were read.`);
    return input.slice(0, LIMITS.rows);
  }
  return input;
}

export function normalizeCatches(input: Record<string, unknown>[], resolve: Resolve): Normalized<CatchRow> {
  const issues: string[] = [];
  const usedIds = new Set<string>();
  const rows: CatchRow[] = [];
  (tooMany(input, issues) as Record<string, unknown>[]).forEach((raw, i) => {
    const line = i + 1;
    if (!raw || typeof raw !== 'object') return;
    const row = pick(raw, CATCH_COLUMNS, line, issues);
    if (!row.species && !row.caught_at && !row.encounters) return; // fully blank / totals row
    if (/^total/i.test(row.species)) return;

    const sp = resolve(row.species);
    if (!sp) issues.push(`Entry ${line}: "${row.species}" isn't a Pokémon name I recognize.`);
    else row.species = sp;
    if (row.current_form) {
      const cf = resolve(row.current_form);
      if (!cf) issues.push(`Entry ${line}: current form "${row.current_form}" isn't a Pokémon name I recognize.`);
      else row.current_form = cf === row.species ? '' : cf;
    }

    for (const c of ['caught_at', 'evolved_on', 'sold_on'] as const) {
      if (!row[c]) continue;
      const d = parseDateTime(row[c]);
      if (d) row[c] = d;
      else { issues.push(`Entry ${line}: couldn't read the date "${row[c]}" in ${c}. Cleared it.`); row[c] = ''; }
    }
    if (row.encounters) {
      const n = parseCount(row.encounters);
      if (n === null) { issues.push(`Entry ${line}: encounters "${row.encounters}" isn't a whole number. Cleared it.`); row.encounters = ''; }
      else row.encounters = String(n);
    }
    if (row.value) {
      const n = parseValue(row.value);
      if (n === null) { issues.push(`Entry ${line}: value "${row.value}" isn't an amount like 2500000 or 2.5M. Cleared it.`); row.value = ''; }
      else row.value = String(n);
    }
    if (row.odds) {
      const n = parseCount(row.odds);
      if (n === null || n < LIMITS.minOdds) { issues.push(`Entry ${line}: odds "${row.odds}" should be a number like 27000. Using the default.`); row.odds = ''; }
      else row.odds = String(n);
    }

    // Old sheet used "Sold? Yes/No"; map that onto status.
    const st = row.status.toLowerCase();
    if (st === 'yes') row.status = 'sold';
    else if (st === 'no' || st === '') row.status = 'kept';
    else if ((CATCH_STATUSES as string[]).includes(st)) row.status = st as CatchStatus;
    else {
      issues.push(`Entry ${line}: status "${row.status}" should be kept, sold, traded or fled. Treated as kept.`);
      row.status = 'kept';
    }

    row.method = row.method.toLowerCase();
    if (row.method && !(METHODS as readonly string[]).includes(row.method)) {
      issues.push(`Entry ${line}: method "${row.method}" isn't one of ${METHODS.join(', ')}. Set to other.`);
      row.method = 'other';
    }
    if (row.season) {
      const s = SEASONS.find((x) => x.toLowerCase() === row.season.toLowerCase());
      if (!s) { issues.push(`Entry ${line}: season "${row.season}" isn't Spring, Summer, Autumn or Winter. Cleared it.`); row.season = ''; }
      else row.season = s;
    }
    if (row.nature) {
      const n = NATURES.find((x) => x.toLowerCase() === row.nature.toLowerCase());
      if (!n) { issues.push(`Entry ${line}: nature "${row.nature}" isn't a nature I know. Cleared it.`); row.nature = ''; }
      else row.nature = n;
    }

    if (row.screenshot && !SCREENSHOT_NAME.test(row.screenshot)) {
      issues.push(`Entry ${line}: screenshot "${row.screenshot}" should be a file name like s001-aron.webp. Cleared it.`);
      row.screenshot = '';
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
    const row = pick(raw, GOAL_COLUMNS, i + 1, issues);
    if (!row.species) return;
    const sp = resolve(row.species);
    if (!sp) { issues.push(`Entry ${i + 1}: "${row.species}" isn't a Pokémon name I recognize.`); return; }
    if (seen.has(sp)) { issues.push(`Entry ${i + 1}: ${sp} is listed twice; kept the first.`); return; }
    seen.add(sp);
    row.species = sp;
    // Tiers: hunting, s, a, b. Older files: a hunting status, P1 or "current" -> hunting;
    // P2 or "future" -> s; P3 -> a; blank or "unplanned" -> b.
    const p = row.priority.toLowerCase().replace(/\s*tier$/, '');
    const legacyStatus = Object.prototype.hasOwnProperty.call(raw, 'status') ? String(raw.status).toLowerCase() : '';
    const LEGACY: Record<string, string> = { p1: 'hunting', current: 'hunting', p2: 's', future: 's', p3: 'a', '': 'b', unplanned: 'b' };
    if (legacyStatus === 'hunting') row.priority = 'hunting';
    else if ((PRIORITIES as readonly string[]).includes(p)) row.priority = p;
    else if (p in LEGACY) row.priority = LEGACY[p];
    else {
      issues.push(`Entry ${i + 1}: tier "${row.priority}" should be hunting, s, a or b. Put it in B tier.`);
      row.priority = DEFAULT_PRIORITY;
    }
    rows.push(row);
  });
  return { rows, issues };
}

export function normalizeNotes(input: Record<string, unknown>[], resolve: Resolve): Normalized<NoteRow> {
  const issues: string[] = [];
  const bySpecies = new Map<string, NoteRow>();
  (tooMany(input, issues) as Record<string, unknown>[]).forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') return;
    const row = pick(raw, NOTE_COLUMNS, i + 1, issues);
    if (!row.species) return;
    const sp = resolve(row.species);
    if (!sp) { issues.push(`Entry ${i + 1}: "${row.species}" isn't a Pokémon name I recognize.`); return; }
    if (!row.notes) return;
    bySpecies.set(sp, { species: sp, notes: row.notes });
  });
  return { rows: [...bySpecies.values()], issues };
}

export function normalizeWorth(input: Record<string, unknown>[]): Normalized<WorthRow> {
  const issues: string[] = [];
  const byItem = new Map<string, WorthRow>();
  for (const raw of tooMany(input, issues) as Record<string, unknown>[]) {
    if (!raw || typeof raw !== 'object') continue;
    const item = typeof raw.item === 'string' ? raw.item : '';
    if (!(WORTH_ITEMS as readonly string[]).includes(item)) continue;
    const v = raw.value === undefined || raw.value === null ? '' : String(raw.value);
    if (v === '') continue;
    const n = parseValue(v);
    if (n === null) { issues.push(`Worth ${item}: "${v.slice(0, 30)}" isn't an amount like 2500000 or 2.5M. Cleared it.`); continue; }
    byItem.set(item, { item, value: String(n) });
  }
  return { rows: WORTH_ITEMS.map((i) => byItem.get(i)).filter((r): r is WorthRow => !!r), issues };
}

export const COLUMNS: Record<FileKey, readonly string[]> = {
  caught: CATCH_COLUMNS,
  goals: GOAL_COLUMNS,
  notes: NOTE_COLUMNS,
  worth: WORTH_COLUMNS,
};

/** Fields read from a file: the current ones plus `status` on goals, kept only to convert old files. */
const READ_COLUMNS: Record<FileKey, readonly string[]> = { ...COLUMNS, goals: [...GOAL_COLUMNS, 'status'] };

/** Small, stable hash used to notice when the repo copy of tracker.json changed. */
export function hashText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
