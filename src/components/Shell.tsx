import { useRef, useState, type ReactNode } from 'react';
import { href, type Route } from '../lib/router';
import { LIMITS } from '../lib/data';
import type { FileKey } from '../lib/types';
import { downloadText, useStore, type ImportResult } from '../lib/store';
import { Clock } from './Clock';
import { SparkleIcon } from './ui';

const FILE_NAME = 'tracker.json';

const describe = (c: Record<FileKey, number>) =>
  `${c.caught} ${c.caught === 1 ? 'catch' : 'catches'}, ${c.goals} ${c.goals === 1 ? 'goal' : 'goals'}`;

export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const store = useStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [imported, setImported] = useState<ImportResult | null>(null);
  const section =
    route.page === 'species' || route.page === 'dex' ? 'dex'
      : route.page === 'catch-new' || route.page === 'catch-edit' ? 'caught'
        : route.page;

  const exportFile = () => downloadText(FILE_NAME, store.exportJson());

  async function onFile(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;
    const name = file.name.slice(0, 60);
    // Check the size before reading so a huge file never gets loaded into memory.
    if (file.size > LIMITS.fileBytes) {
      setImported({ ok: false, issues: [`${name}: ${Math.round(file.size / 1024)} KB is over the ${LIMITS.fileBytes / 1_000_000} MB limit.`] });
      return;
    }
    let text: string;
    try { text = await file.text(); } catch { setImported({ ok: false, issues: [`${name}: couldn't read the file.`] }); return; }
    const r = store.importJson(text, (incoming, current) =>
      confirm(`Replace everything (${describe(current)}) with ${name} (${describe(incoming)})?\n\nThis only changes this browser until you export and commit.`));
    if (!r.cancelled) setImported(r);
  }

  const navLink = (key: string, to: string, label: string) => (
    <a href={to} aria-current={section === key ? 'page' : undefined}>{label}</a>
  );

  return (
    <div className="wrap">
      <header className="header">
        <a className="brand" href={href.home()}>
          <span className="brand-mark"><SparkleIcon size={22} /></span>
          <span>
            <span className="brand-name">Shiny Hunting</span>
            <span className="brand-sub">PokeMMO Shiny Log</span>
          </span>
        </a>
        <Clock />
        <nav className="nav" aria-label="Main">
          {navLink('home', href.home(), 'Home')}
          {navLink('caught', href.caught(), 'Owned')}
          {navLink('dex', href.dex(), 'Dex')}
          {navLink('stats', href.stats(), 'Stats')}
          <span className="nav-sep" aria-hidden="true" />
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>Import</button>
          <input ref={fileInput} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => onFile(e.target.files?.[0])} />
          <button type="button" className="btn btn--primary" onClick={exportFile}>
            Export{store.dirty && <span className="pill pill--gold">edited</span>}
          </button>
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
            <p><strong>Some entries in the repo's tracker.json need a look.</strong> They're shown as entered.</p>
            <ul>{store.repoIssues.slice(0, 6).map((i) => <li key={i}>{i}</li>)}</ul>
          </div>
        </div>
      )}

      {store.conflict && (
        <div className="banner banner--warn" role="alert">
          <p>
            <strong>tracker.json changed in the repo</strong> after you started editing here.
            You're seeing your version. Export it and compare before committing, or discard yours to load the repo's.
          </p>
          <div className="row">
            <button type="button" className="btn btn--small" onClick={exportFile}>Export my {FILE_NAME}</button>
            <button type="button" className="btn btn--small btn--danger" onClick={() => confirm(`Discard your edits and load the repo's ${FILE_NAME}?`) && store.discard()}>Use repo's</button>
          </div>
        </div>
      )}

      {store.dirty && !store.conflict && (
        <div className="banner banner--info" role="status">
          <p>
            <strong>Not in the repo yet.</strong> Your edits are saved in this browser only.
            Export {FILE_NAME} and commit it, or send the file to Claude.
          </p>
          <div className="row">
            <button type="button" className="btn btn--small" onClick={exportFile}>Export {FILE_NAME}</button>
            <button type="button" className="btn btn--small btn--ghost" onClick={() => confirm("Discard your edits? This can't be undone.") && store.discard()}>Discard</button>
          </div>
        </div>
      )}

      {imported && (
        <div className={`banner ${!imported.ok || imported.issues.length ? 'banner--warn' : 'banner--ok'}`} role="status">
          <div>
            <p>{imported.ok && imported.counts ? <><strong>Imported</strong>: {describe(imported.counts)}.</> : <strong>Couldn't import that file.</strong>}</p>
            {imported.issues.length > 0 && <ul>{imported.issues.slice(0, 8).map((i) => <li key={i}>{i}</li>)}</ul>}
          </div>
          <button type="button" className="btn btn--small" onClick={() => setImported(null)}>Dismiss</button>
        </div>
      )}

      <main>{children}</main>
    </div>
  );
}
