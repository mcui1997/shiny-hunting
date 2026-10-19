import { useRef, useState, type ReactNode } from 'react';
import { href, type Route } from '../lib/router';
import { LIMITS } from '../lib/csv';
import { downloadText, useStore, type ImportResult } from '../lib/store';
import type { FileKey } from '../lib/types';
import { SparkleIcon } from './ui';

const FILE_NAME: Record<FileKey, string> = { caught: 'caught.csv', goals: 'goals.csv', notes: 'notes.csv' };

export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const store = useStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [imported, setImported] = useState<ImportResult[] | null>(null);
  const section =
    route.page === 'species' || route.page === 'dex' ? 'dex'
      : route.page === 'catch-new' || route.page === 'catch-edit' ? 'caught'
        : route.page;

  const exportFile = (f: FileKey) => downloadText(FILE_NAME[f], store.csvText(f));

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const results: ImportResult[] = [];
    for (const file of Array.from(files).slice(0, 3)) {
      const name = file.name.slice(0, 60);
      // Check the size before reading so a huge file never gets loaded into memory.
      if (file.size > LIMITS.fileBytes) {
        results.push({ file: null, count: 0, issues: [`${name}: ${Math.round(file.size / 1024)} KB is over the ${LIMITS.fileBytes / 1_000_000} MB limit.`] });
        continue;
      }
      let text: string;
      try { text = await file.text(); } catch { results.push({ file: null, count: 0, issues: [`${name}: couldn't read the file.`] }); continue; }
      const r = store.importCsv(text, (f, incoming, current) =>
        confirm(`Replace ${FILE_NAME[f]} (${current} rows now) with ${incoming} rows from ${name}?\n\nThis only changes this browser until you export and commit.`));
      if (r.cancelled) continue;
      results.push({ ...r, issues: r.issues.map((i) => `${name}: ${i}`) });
    }
    setImported(results.length ? results : null);
    if (fileInput.current) fileInput.current.value = '';
  }

  const navLink = (key: string, to: string, label: string) => (
    <a href={to} aria-current={section === key ? 'page' : undefined}>{label}</a>
  );

  return (
    <div className="wrap">
      <header className="header">
        <a className="brand" href={href.dex()}>
          <span className="brand-mark"><SparkleIcon size={22} /></span>
          <span>
            <span className="brand-name">Shiny Hunting</span>
            <span className="brand-sub">PokeMMO · personal log</span>
          </span>
        </a>
        <nav className="nav" aria-label="Main">
          {navLink('dex', href.dex(), 'Dex')}
          {navLink('caught', href.caught(), 'Caught')}
          {navLink('goals', href.goals(), 'Goals')}
          {navLink('stats', href.stats(), 'Stats')}
          <span className="nav-sep" aria-hidden="true" />
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>Import CSV</button>
          <input ref={fileInput} type="file" accept=".csv,text/csv" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => onFiles(e.target.files)} />
          <ExportMenu onExport={exportFile} dirty={store.dirty} />
        </nav>
      </header>

      {store.storageFailed && (
        <div className="banner banner--warn" role="alert">
          <p><strong>This browser isn't saving your edits</strong> (storage is full, blocked, or in private mode). Export before you close the tab.</p>
        </div>
      )}

      {store.repoIssues.length > 0 && (
        <div className="banner banner--warn" role="status">
          <div>
            <p><strong>Some rows in the repo's CSV files need a look.</strong> They're shown as entered.</p>
            <ul>{store.repoIssues.slice(0, 6).map((i) => <li key={i}>{i}</li>)}</ul>
          </div>
        </div>
      )}

      {store.conflicts.length > 0 && (
        <div className="banner banner--warn" role="alert">
          <p>
            <strong>{store.conflicts.map((f) => FILE_NAME[f]).join(', ')} changed in the repo</strong> after you started editing here.
            You're seeing your version. Export it and compare before committing, or discard yours to load the repo's.
          </p>
          <div className="row">
            {store.conflicts.map((f) => (
              <span key={f} className="row">
                <button type="button" className="btn btn--small" onClick={() => exportFile(f)}>Export my {FILE_NAME[f]}</button>
                <button type="button" className="btn btn--small btn--danger" onClick={() => confirm(`Discard your edits to ${FILE_NAME[f]} and load the repo's copy?`) && store.discard(f)}>Use repo's</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {store.dirty.filter((f) => !store.conflicts.includes(f)).length > 0 && (
        <div className="banner banner--info" role="status">
          <p>
            <strong>Not in the repo yet:</strong> {store.dirty.filter((f) => !store.conflicts.includes(f)).map((f) => FILE_NAME[f]).join(', ')}.
            Your edits are saved in this browser only. Export and commit them, or send the file to Claude.
          </p>
          <div className="row">
            {store.dirty.filter((f) => !store.conflicts.includes(f)).map((f) => (
              <span key={f} className="row">
                <button type="button" className="btn btn--small" onClick={() => exportFile(f)}>Export {FILE_NAME[f]}</button>
                <button type="button" className="btn btn--small btn--ghost" onClick={() => confirm(`Discard your edits to ${FILE_NAME[f]}? This can't be undone.`) && store.discard(f)}>Discard</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {imported && (
        <div className={`banner ${imported.some((r) => !r.file || r.issues.length) ? 'banner--warn' : 'banner--ok'}`} role="status">
          <div>
            {imported.map((r, i) => (
              <p key={i}>{r.file ? <><strong>Loaded {FILE_NAME[r.file]}</strong>: {r.count} rows.</> : <strong>Couldn't tell which file that is.</strong>}</p>
            ))}
            {imported.some((r) => r.issues.length) && (
              <ul>{imported.flatMap((r) => r.issues).slice(0, 8).map((i) => <li key={i}>{i}</li>)}</ul>
            )}
          </div>
          <button type="button" className="btn btn--small" onClick={() => setImported(null)}>Dismiss</button>
        </div>
      )}

      <main>{children}</main>
    </div>
  );
}

function ExportMenu({ onExport, dirty }: { onExport: (f: FileKey) => void; dirty: FileKey[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="btn btn--primary" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        Export CSV
      </button>
      {open && (
        <div role="menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 14, padding: 6, boxShadow: '0 10px 30px rgba(22,32,29,.12)', zIndex: 10, minWidth: 210 }}>
          {(['caught', 'goals', 'notes'] as FileKey[]).map((f) => (
            <button key={f} type="button" role="menuitem" className="btn btn--ghost" style={{ width: '100%', justifyContent: 'space-between' }}
              onClick={() => { onExport(f); setOpen(false); }}>
              {FILE_NAME[f]}
              {dirty.includes(f) && <span className="pill pill--gold">edited</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
