import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  COLUMNS, detectFile, hashText, ImportError, LIMITS, makeResolver, nextCatchId, normalizeCatches,
  normalizeGoals, normalizeNotes, parseCsv, toCsv, type Resolve,
} from './csv';
import { Game } from './game';
import type { CatchRow, FileKey, GameData, GoalRow, NoteRow } from './types';

type Rows = { caught: CatchRow[]; goals: GoalRow[]; notes: NoteRow[] };
const FILES: FileKey[] = ['caught', 'goals', 'notes'];
const STORAGE_KEY = 'shiny-hunting:v1';

interface LocalEdits {
  rows: Partial<Rows>;
  /** Hash of the repo file each local copy started from. */
  baseHash: Partial<Record<FileKey, string>>;
  updatedAt?: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Read saved edits defensively. Anything that isn't the expected shape is dropped; the rows
 * themselves are re-checked by the same normalizers as an import once the game data loads.
 */
function readLocal(): LocalEdits {
  const empty: LocalEdits = { rows: {}, baseHash: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw || raw.length > LIMITS.fileBytes * 3) return empty;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !isRecord(parsed.rows)) return empty;
    const out: LocalEdits = { rows: {}, baseHash: {} };
    for (const f of FILES) {
      const rows = parsed.rows[f];
      if (Array.isArray(rows) && rows.every(isRecord)) (out.rows as Record<string, unknown>)[f] = rows;
      const h = isRecord(parsed.baseHash) ? parsed.baseHash[f] : undefined;
      if (typeof h === 'string' && /^[0-9a-f]{1,8}$/.test(h)) out.baseHash[f] = h;
    }
    if (typeof parsed.updatedAt === 'string' && parsed.updatedAt.length < 40) out.updatedAt = parsed.updatedAt;
    return out;
  } catch { /* storage blocked or corrupt: start clean */ }
  return empty;
}

/** Returns false when the browser refused to save (storage full, blocked, private mode). */
function writeLocal(l: LocalEdits): boolean {
  try {
    if (Object.keys(l.rows).length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(l));
    return true;
  } catch {
    return false;
  }
}

export interface ImportResult {
  file: FileKey | null;
  count: number;
  issues: string[];
  cancelled?: boolean;
}

function normalizeWithIssues(file: FileKey, rows: Record<string, unknown>[], resolve: Resolve) {
  if (file === 'caught') return normalizeCatches(rows, resolve);
  if (file === 'goals') return normalizeGoals(rows, resolve);
  return normalizeNotes(rows, resolve);
}

const normalizeFile = (file: FileKey, rows: Record<string, unknown>[], resolve: Resolve) =>
  normalizeWithIssues(file, rows, resolve).rows;

interface Store {
  status: 'loading' | 'ready' | 'error';
  error?: string;
  game: Game | null;
  rows: Rows;
  /** Files with edits made on this site that aren't in the repo yet. */
  dirty: FileKey[];
  /** Files whose repo copy changed after you started editing them here. */
  conflicts: FileKey[];
  /** Problems found while reading the repo's CSV files. */
  repoIssues: string[];
  localUpdatedAt?: string;
  saveCatch: (row: CatchRow) => void;
  deleteCatch: (id: string) => void;
  newCatchId: () => string;
  saveGoal: (row: GoalRow, previousSpecies?: string) => void;
  deleteGoal: (species: string) => void;
  saveNote: (species: string, notes: string) => void;
  /** True when this browser refused to save edits (storage full, blocked, private mode). */
  storageFailed: boolean;
  /** `confirmReplace(file, incoming, current)` is asked before an import replaces a file. */
  importCsv: (text: string, confirmReplace: (file: FileKey, incoming: number, current: number) => boolean) => ImportResult;
  csvText: (file: FileKey) => string;
  discard: (file: FileKey) => void;
}

const Ctx = createContext<Store | null>(null);

const base = import.meta.env.BASE_URL;

async function fetchText(path: string) {
  const res = await fetch(`${base}${path}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Couldn't load ${path} (${res.status})`);
  return res.text();
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Store['status']>('loading');
  const [error, setError] = useState<string>();
  const [game, setGame] = useState<Game | null>(null);
  const [repo, setRepo] = useState<Rows>({ caught: [], goals: [], notes: [] });
  const [repoHash, setRepoHash] = useState<Record<FileKey, string>>({ caught: '', goals: '', notes: '' });
  const [repoIssues, setRepoIssues] = useState<string[]>([]);
  const [local, setLocal] = useState<LocalEdits>(() => readLocal());

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [gameJson, caught, goals, notes] = await Promise.all([
          fetchText('data/pokemon.json'), fetchText('data/caught.csv'),
          fetchText('data/goals.csv'), fetchText('data/notes.csv'),
        ]);
        const g = new Game(JSON.parse(gameJson) as GameData);
        const resolve = makeResolver(g.names);
        const c = normalizeCatches(parseCsv(caught).rows, resolve);
        const gl = normalizeGoals(parseCsv(goals).rows, resolve);
        const n = normalizeNotes(parseCsv(notes).rows, resolve);
        if (!alive) return;
        const rows: Rows = { caught: c.rows, goals: gl.rows, notes: n.rows };
        const hashes = { caught: hashText(caught), goals: hashText(goals), notes: hashText(notes) };
        setGame(g);
        setRepo(rows);
        setRepoHash(hashes);
        setRepoIssues([
          ...c.issues.map((i) => `caught.csv ${i}`),
          ...gl.issues.map((i) => `goals.csv ${i}`),
          ...n.issues.map((i) => `notes.csv ${i}`),
        ]);
        setLocal((prev) => {
          const next: LocalEdits = { ...prev, rows: { ...prev.rows }, baseHash: { ...prev.baseHash } };
          for (const f of FILES) {
            const stored = next.rows[f];
            if (!stored) continue;
            // Saved edits get the same checks as an import, so a tampered or outdated copy
            // can't put anything into the page that a CSV couldn't.
            const mine = normalizeFile(f, stored as unknown as Record<string, unknown>[], resolve);
            // Identical to the repo copy means it was exported and committed: clear it.
            if (toCsv(mine as Record<string, string>[], COLUMNS[f]) === toCsv(rows[f] as Record<string, string>[], COLUMNS[f])) {
              delete next.rows[f];
              delete next.baseHash[f];
            } else {
              (next.rows as Record<string, unknown>)[f] = mine;
            }
          }
          return next;
        });
        setStatus('ready');
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    })();
    return () => { alive = false; };
  }, []);

  const rows: Rows = useMemo(() => ({
    caught: local.rows.caught ?? repo.caught,
    goals: local.rows.goals ?? repo.goals,
    notes: local.rows.notes ?? repo.notes,
  }), [local, repo]);

  // Persist after every change; remember if the browser refused so the page can warn.
  const [storageFailed, setStorageFailed] = useState(false);
  useEffect(() => { setStorageFailed(!writeLocal(local)); }, [local]);

  const update = useCallback(<K extends FileKey>(file: K, fn: (cur: Rows[K]) => Rows[K]) => {
    if (!game) return;
    const resolve = makeResolver(game.names);
    setLocal((prev) => {
      const cur = (prev.rows[file] ?? repo[file]) as Rows[K];
      // Every edit passes through the same normalizer as an import.
      const nextRows = normalizeFile(file, fn(cur) as unknown as Record<string, unknown>[], resolve) as Rows[K];
      return {
        rows: { ...prev.rows, [file]: nextRows },
        baseHash: { ...prev.baseHash, [file]: prev.baseHash[file] ?? repoHash[file] },
        updatedAt: new Date().toISOString(),
      };
    });
  }, [game, repo, repoHash]);

  const store: Store = {
    status, error, game, rows, repoIssues,
    localUpdatedAt: local.updatedAt,
    dirty: FILES.filter((f) => local.rows[f] !== undefined),
    conflicts: FILES.filter((f) => local.rows[f] !== undefined && local.baseHash[f] !== repoHash[f]),
    saveCatch: (row) => update('caught', (cur) => {
      const i = cur.findIndex((r) => r.id === row.id);
      return i === -1 ? [...cur, row] : cur.map((r, j) => (j === i ? row : r));
    }),
    deleteCatch: (id) => update('caught', (cur) => cur.filter((r) => r.id !== id)),
    newCatchId: () => nextCatchId(rows.caught),
    saveGoal: (row, previousSpecies) => update('goals', (cur) => {
      const key = previousSpecies ?? row.species;
      const rest = cur.filter((r) => r.species !== key && r.species !== row.species);
      const i = cur.findIndex((r) => r.species === key);
      if (i === -1) return [...rest, row];
      const out = [...rest];
      out.splice(Math.min(i, out.length), 0, row);
      return out;
    }),
    deleteGoal: (species) => update('goals', (cur) => cur.filter((r) => r.species !== species)),
    saveNote: (species, notes) => update('notes', (cur) => {
      const rest = cur.filter((r) => r.species !== species);
      return notes.trim() ? [...rest, { species, notes: notes.trim() }] : rest;
    }),
    storageFailed,
    importCsv: (text, confirmReplace) => {
      if (!game) return { file: null, count: 0, issues: ['Still loading.'] };
      let parsed;
      try {
        parsed = parseCsv(text);
      } catch (e) {
        return { file: null, count: 0, issues: [e instanceof ImportError ? e.message : "Couldn't read that file as CSV."] };
      }
      const file = detectFile(parsed.fields);
      if (!file) return { file: null, count: 0, issues: ["That file's columns don't match caught.csv, goals.csv or notes.csv."] };
      const r = normalizeWithIssues(file, parsed.rows, makeResolver(game.names));
      if (!confirmReplace(file, r.rows.length, rows[file].length)) return { file, count: 0, issues: [], cancelled: true };
      update(file, () => r.rows as never);
      return { file, count: r.rows.length, issues: r.issues };
    },
    csvText: (file) => toCsv(rows[file] as Record<string, string>[], COLUMNS[file]),
    discard: (file) => setLocal((prev) => {
      const next: LocalEdits = { ...prev, rows: { ...prev.rows }, baseHash: { ...prev.baseHash } };
      delete next.rows[file];
      delete next.baseHash[file];
      return next;
    }),
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
