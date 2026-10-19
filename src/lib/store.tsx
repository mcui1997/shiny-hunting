import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  COLUMNS, detectFile, hashText, makeResolver, nextCatchId, normalizeCatches, normalizeGoals,
  normalizeNotes, parseCsv, toCsv,
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

function readLocal(): LocalEdits {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as LocalEdits;
  } catch { /* storage blocked or corrupt: start clean */ }
  return { rows: {}, baseHash: {} };
}

function writeLocal(l: LocalEdits) {
  try {
    if (Object.keys(l.rows).length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(l));
  } catch { /* storage blocked: edits still live for this visit */ }
}

export interface ImportResult {
  file: FileKey | null;
  count: number;
  issues: string[];
}

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
  importCsv: (text: string) => ImportResult;
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
        // Local edits identical to the repo copy were exported and committed: clear them.
        setLocal((prev) => {
          const next: LocalEdits = { ...prev, rows: { ...prev.rows }, baseHash: { ...prev.baseHash } };
          for (const f of FILES) {
            const mine = next.rows[f];
            if (mine && toCsv(mine as Record<string, string>[], COLUMNS[f]) === toCsv(rows[f] as Record<string, string>[], COLUMNS[f])) {
              delete next.rows[f];
              delete next.baseHash[f];
            }
          }
          writeLocal(next);
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

  const update = useCallback(<K extends FileKey>(file: K, fn: (cur: Rows[K]) => Rows[K]) => {
    setLocal((prev) => {
      const cur = (prev.rows[file] ?? repo[file]) as Rows[K];
      const next: LocalEdits = {
        rows: { ...prev.rows, [file]: fn(cur) },
        baseHash: { ...prev.baseHash, [file]: prev.baseHash[file] ?? repoHash[file] },
        updatedAt: new Date().toISOString(),
      };
      writeLocal(next);
      return next;
    });
  }, [repo, repoHash]);

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
    importCsv: (text) => {
      if (!game) return { file: null, count: 0, issues: ['Still loading.'] };
      const parsed = parseCsv(text);
      const file = detectFile(parsed.fields);
      const resolve = makeResolver(game.names);
      if (file === 'caught') {
        const r = normalizeCatches(parsed.rows, resolve);
        update('caught', () => r.rows);
        return { file, count: r.rows.length, issues: r.issues };
      }
      if (file === 'goals') {
        const r = normalizeGoals(parsed.rows, resolve);
        update('goals', () => r.rows);
        return { file, count: r.rows.length, issues: r.issues };
      }
      if (file === 'notes') {
        const r = normalizeNotes(parsed.rows, resolve);
        update('notes', () => r.rows);
        return { file, count: r.rows.length, issues: r.issues };
      }
      return { file: null, count: 0, issues: ["That file's columns don't match caught.csv, goals.csv or notes.csv."] };
    },
    csvText: (file) => toCsv(rows[file] as Record<string, string>[], COLUMNS[file]),
    discard: (file) => setLocal((prev) => {
      const next: LocalEdits = { ...prev, rows: { ...prev.rows }, baseHash: { ...prev.baseHash } };
      delete next.rows[file];
      delete next.baseHash[file];
      writeLocal(next);
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
