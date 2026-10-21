import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  hashText, ImportError, LIMITS, makeResolver, nextCatchId, normalizeCatches, normalizeGoals,
  normalizeNotes, normalizeWorth, parseTracker, SECTION_LABEL, SECTIONS, toTrackerJson, type RawTracker, type Resolve,
} from './data';
import { Game } from './game';
import type { CatchRow, FileKey, GameData, GoalRow, NoteRow, WorthRow } from './types';

export type Rows = { caught: CatchRow[]; goals: GoalRow[]; notes: NoteRow[]; worth: WorthRow[] };
const STORAGE_KEY = 'shiny-hunting:v2';
/** Edits saved before the switch to tracker.json, one list per old CSV file. */
const LEGACY_KEY = 'shiny-hunting:v1';

interface LocalEdits {
  /** Your edited data; absent when you haven't changed anything here. Sections may be missing until merged. */
  rows?: Partial<Rows>;
  /** Hash of the repo's tracker.json when you started editing; absent for edits carried over from the CSV era. */
  baseHash?: string;
  updatedAt?: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Read saved edits defensively. Anything that isn't the expected shape is dropped; the rows
 * themselves are re-checked by the same normalizers as an import once the game data loads.
 */
function readLocal(): LocalEdits {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_KEY);
    if (!raw || raw.length > LIMITS.fileBytes * 3) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !isRecord(parsed.rows)) return {};
    const rows: Partial<Rows> = {};
    for (const f of SECTIONS) {
      const list = parsed.rows[f];
      if (Array.isArray(list) && list.every(isRecord)) (rows as Record<string, unknown>)[f] = list;
    }
    if (Object.keys(rows).length === 0) return {};
    const out: LocalEdits = { rows };
    if (typeof parsed.baseHash === 'string' && /^[0-9a-f]{1,8}$/.test(parsed.baseHash)) out.baseHash = parsed.baseHash;
    if (typeof parsed.updatedAt === 'string' && parsed.updatedAt.length < 40) out.updatedAt = parsed.updatedAt;
    return out;
  } catch { /* storage blocked or corrupt: start clean */ }
  return {};
}

/** Returns false when the browser refused to save (storage full, blocked, private mode). */
function writeLocal(l: LocalEdits): boolean {
  try {
    window.localStorage.removeItem(LEGACY_KEY);
    if (!l.rows) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(l));
    return true;
  } catch {
    return false;
  }
}

/** Run every section through its normalizer; issues are prefixed with the section name. */
function normalizeAll(raw: Partial<Record<FileKey, unknown[]>>, resolve: Resolve, fallback: Rows) {
  const issues: string[] = [];
  const run = <T,>(f: FileKey, fn: (rows: Record<string, unknown>[], r: Resolve) => { rows: T[]; issues: string[] }) => {
    const input = raw[f];
    if (!input) return fallback[f] as unknown as T[];
    const r = fn(input as Record<string, unknown>[], resolve);
    issues.push(...r.issues.map((i) => `${SECTION_LABEL[f]} ${i.charAt(0).toLowerCase()}${i.slice(1)}`));
    return r.rows;
  };
  const rows: Rows = {
    caught: run('caught', normalizeCatches),
    goals: run('goals', normalizeGoals),
    notes: run('notes', normalizeNotes),
    worth: run('worth', (r) => normalizeWorth(r)),
  };
  return { rows, issues };
}

const EMPTY: Rows = { caught: [], goals: [], notes: [], worth: [] };

export interface ImportResult {
  ok: boolean;
  counts?: Record<FileKey, number>;
  issues: string[];
  cancelled?: boolean;
}

interface Store {
  status: 'loading' | 'ready' | 'error';
  error?: string;
  game: Game | null;
  rows: Rows;
  /** True when edits made on this site aren't in the repo yet. */
  dirty: boolean;
  /** True when the repo's tracker.json changed after you started editing here. */
  conflict: boolean;
  /** Problems found while reading the repo's tracker.json. */
  repoIssues: string[];
  localUpdatedAt?: string;
  saveCatch: (row: CatchRow) => void;
  deleteCatch: (id: string) => void;
  newCatchId: () => string;
  saveGoal: (row: GoalRow, previousSpecies?: string) => void;
  deleteGoal: (species: string) => void;
  saveNote: (species: string, notes: string) => void;
  /** Set the manual net-worth amounts (pokeyen, as typed; blank clears). */
  saveWorth: (values: Partial<Record<string, string>>) => void;
  /** True when this browser refused to save edits (storage full, blocked, private mode). */
  storageFailed: boolean;
  /** `confirmReplace(incoming, current)` is asked before an import replaces your data. */
  importJson: (text: string, confirmReplace: (incoming: Record<FileKey, number>, current: Record<FileKey, number>) => boolean) => ImportResult;
  exportJson: () => string;
  discard: () => void;
}

const Ctx = createContext<Store | null>(null);

const base = import.meta.env.BASE_URL;

async function fetchText(path: string) {
  const res = await fetch(`${base}${path}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Couldn't load ${path} (${res.status})`);
  return res.text();
}

const countsOf = (r: Rows): Record<FileKey, number> => ({ caught: r.caught.length, goals: r.goals.length, notes: r.notes.length, worth: r.worth.length });

export function StoreProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Store['status']>('loading');
  const [error, setError] = useState<string>();
  const [game, setGame] = useState<Game | null>(null);
  const [repo, setRepo] = useState<Rows>(EMPTY);
  const [repoHash, setRepoHash] = useState('');
  const [repoIssues, setRepoIssues] = useState<string[]>([]);
  const [local, setLocal] = useState<LocalEdits>(() => readLocal());

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [gameJson, trackerText] = await Promise.all([fetchText('data/pokemon.json'), fetchText('data/tracker.json')]);
        const g = new Game(JSON.parse(gameJson) as GameData);
        const resolve = makeResolver(g.names);
        let parsed: RawTracker;
        try {
          parsed = parseTracker(trackerText);
        } catch (e) {
          throw new Error(`tracker.json: ${e instanceof Error ? e.message : String(e)}`);
        }
        const r = normalizeAll(parsed, resolve, EMPTY);
        if (!alive) return;
        const hash = hashText(trackerText);
        setGame(g);
        setRepo(r.rows);
        setRepoHash(hash);
        setRepoIssues([...parsed.issues, ...r.issues]);
        setLocal((prev) => {
          if (!prev.rows) return prev;
          // Saved edits get the same checks as an import, so a tampered or outdated copy
          // can't put anything into the page that a file couldn't. Missing sections come from the repo.
          const mine = normalizeAll(prev.rows as Partial<Record<FileKey, unknown[]>>, resolve, r.rows).rows;
          // Identical to the repo copy means it was exported and committed: clear it.
          if (toTrackerJson(mine) === toTrackerJson(r.rows)) return {};
          // Edits from before tracker.json have no base to compare with; start tracking from this copy.
          return { ...prev, rows: mine, baseHash: prev.baseHash ?? hash };
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

  const rows: Rows = useMemo(() => ({ ...repo, ...local.rows }), [local, repo]);

  // Persist after every change; remember if the browser refused so the page can warn.
  const [storageFailed, setStorageFailed] = useState(false);
  useEffect(() => { setStorageFailed(!writeLocal(local)); }, [local]);

  const update = useCallback((fn: (cur: Rows) => Partial<Record<FileKey, unknown[]>>) => {
    if (!game) return;
    const resolve = makeResolver(game.names);
    setLocal((prev) => {
      const cur: Rows = { ...repo, ...prev.rows };
      // Every edit passes through the same normalizers as an import.
      const next = normalizeAll(fn(cur), resolve, cur).rows;
      return { rows: next, baseHash: prev.baseHash ?? repoHash, updatedAt: new Date().toISOString() };
    });
  }, [game, repo, repoHash]);

  const store: Store = {
    status, error, game, rows, repoIssues,
    localUpdatedAt: local.updatedAt,
    dirty: !!local.rows,
    conflict: !!local.rows && local.baseHash !== repoHash,
    saveCatch: (row) => update((cur) => {
      const i = cur.caught.findIndex((r) => r.id === row.id);
      return { caught: i === -1 ? [...cur.caught, row] : cur.caught.map((r, j) => (j === i ? row : r)) };
    }),
    deleteCatch: (id) => update((cur) => ({ caught: cur.caught.filter((r) => r.id !== id) })),
    newCatchId: () => nextCatchId(rows.caught),
    saveGoal: (row, previousSpecies) => update((cur) => {
      const key = previousSpecies ?? row.species;
      const rest = cur.goals.filter((r) => r.species !== key && r.species !== row.species);
      const i = cur.goals.findIndex((r) => r.species === key);
      if (i === -1) return { goals: [...rest, row] };
      const out = [...rest];
      out.splice(Math.min(i, out.length), 0, row);
      return { goals: out };
    }),
    deleteGoal: (species) => update((cur) => ({ goals: cur.goals.filter((r) => r.species !== species) })),
    saveWorth: (values) => update((cur) => {
      const next = new Map(cur.worth.map((w) => [w.item, w.value]));
      for (const [item, v] of Object.entries(values)) next.set(item, (v ?? '').trim());
      return { worth: [...next.entries()].map(([item, value]) => ({ item, value })) };
    }),
    saveNote: (species, notes) => update((cur) => {
      const rest = cur.notes.filter((r) => r.species !== species);
      return { notes: notes.trim() ? [...rest, { species, notes: notes.trim() }] : rest };
    }),
    storageFailed,
    importJson: (text, confirmReplace) => {
      if (!game) return { ok: false, issues: ['Still loading.'] };
      let parsed: RawTracker;
      try {
        parsed = parseTracker(text);
      } catch (e) {
        return { ok: false, issues: [e instanceof ImportError ? e.message : "Couldn't read that file."] };
      }
      // An import replaces everything, so a missing section means an empty one.
      const r = normalizeAll(parsed, makeResolver(game.names), EMPTY);
      const counts = countsOf(r.rows);
      if (!confirmReplace(counts, countsOf(rows))) return { ok: false, issues: [], cancelled: true };
      update(() => r.rows);
      return { ok: true, counts, issues: [...parsed.issues, ...r.issues] };
    },
    exportJson: () => toTrackerJson(rows),
    discard: () => setLocal({}),
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
