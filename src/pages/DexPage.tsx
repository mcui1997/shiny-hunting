import { useEffect, useMemo, useRef, useState } from 'react';
import { GoalMenu, MiniTile } from '../components/MiniTile';
import { Pill, SparkleIcon, STATUS_LABEL } from '../components/ui';
import { useDerived } from '../lib/derived';
import { hordeSpots } from '../lib/game';
import { usePref } from '../lib/prefs';
import { formatCount, isOwnedState } from '../lib/stats';
import { PRIORITY_LABEL, type Species } from '../lib/types';

const PAGE = 240;

export function DexPage() {
  const d = useDerived()!;
  const [mode, setMode] = usePref<'shiny' | 'normal'>('sprites', 'shiny');
  const [query, setQuery] = useState('');
  const [soloOnly, setSoloOnly] = useState(false);
  const [finalPref, setFinalPref] = usePref<'all' | 'final'>('dex-forms', 'all');
  const finalOnly = finalPref === 'final';
  const [ownPref, setOwnPref] = usePref<'all' | 'unowned' | 'missing'>('dex-owned', 'all');
  const [limit, setLimit] = useState(PAGE);
  const shiny = mode === 'shiny';

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return d.game.list.filter((sp) => {
      // Final forms: nothing left to evolve into (single-stage Pokémon count).
      if (finalOnly && sp.evolvesTo.length > 0) return false;
      // Unowned: no shiny you still have is this species now (or passed through it).
      // Missing: unowned and not one of your goals either.
      if (ownPref !== 'all' && isOwnedState(d.dex.get(sp.name).state)) return false;
      if (ownPref === 'missing' && d.goals.has(sp.name)) return false;
      if (soloOnly) {
        const spots = hordeSpots(sp);
        if (!spots.length || spots[0].best < 100) return false;
      }
      if (q) {
        const inName = sp.name.toLowerCase().includes(q) || String(sp.id) === q.replace(/^#0*/, '');
        const inArea = q.length >= 3 && [...sp.hordes, ...sp.singles].some((r) => r.area.toLowerCase().includes(q));
        if (!inName && !inArea) return false;
      }
      return true;
    });
  }, [d, query, soloOnly, finalOnly, ownPref]);

  useEffect(() => setLimit(PAGE), [query, soloOnly, finalOnly, ownPref]);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || limit >= list.length) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE); }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [limit, list.length]);

  // Collection totals: every species, and just final forms (nothing left to evolve into).
  const finals = d.game.list.filter((sp) => sp.evolvesTo.length === 0);
  const ownedOf = (xs: Species[]) => xs.filter((sp) => isOwnedState(d.dex.get(sp.name).state)).length;
  const totals = [
    { label: 'All Pokémon', owned: ownedOf(d.game.list), total: d.game.list.length },
    { label: 'Final forms', owned: ownedOf(finals), total: finals.length },
  ];

  return (
    <div className="stack" style={{ gap: 28 }}>

      <section aria-label="Dex" className="stack" style={{ gap: 18 }}>
        <div className="dex-totals">
          {totals.map((t) => (
            <div key={t.label} className="dex-total">
              <span className="eyebrow">{t.label}</span>
              <span className="dex-total-num"><strong className="mono">{t.owned}</strong><span className="muted"> / {formatCount(t.total)} owned</span></span>
              <span className="dex-total-bar" aria-hidden="true"><span style={{ width: `${Math.max(1, (t.owned / t.total) * 100)}%` }} /></span>
              <span className="small muted">{((t.owned / t.total) * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
        <div className="toolbar">
          <div className="field search">
            <label htmlFor="dex-search">Search</label>
            <input id="dex-search" className="input" type="search" placeholder="Pokémon, dex number, or area" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="segmented" role="group" aria-label="Sprite style">
            <button type="button" aria-pressed={shiny} onClick={() => setMode('shiny')}><SparkleIcon size={14} color="currentColor" />Shiny</button>
            <button type="button" aria-pressed={!shiny} onClick={() => setMode('normal')}>Normal</button>
          </div>
        </div>

        <div className="chips">
          <label className="check">
            <input type="checkbox" checked={soloOnly} onChange={(e) => setSoloOnly(e.target.checked)} />
            Solo spots only
          </label>
          <label className="check">
            <input type="checkbox" checked={finalOnly} onChange={(e) => setFinalPref(e.target.checked ? 'final' : 'all')} />
            Final forms only
          </label>
          <div className="segmented segmented--small" role="group" aria-label="Show">
            {([['all', 'All'], ['unowned', 'Unowned'], ['missing', 'Missing']] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={ownPref === k} onClick={() => setOwnPref(k)}
                title={k === 'missing' ? "Not owned and not in your goals" : k === 'unowned' ? 'No shiny you still have' : undefined}>{l}</button>
            ))}
          </div>
          <span className="small muted" style={{ marginLeft: 'auto' }} aria-live="polite">
            Showing {formatCount(list.length)} of {formatCount(d.game.list.length)}
          </span>
        </div>

        {list.length === 0 ? (
          <p className="empty">Nothing matches those filters.</p>
        ) : (
          <div className="mini-grid">
            {list.slice(0, limit).map((sp) => <DexTile key={sp.id} sp={sp} shiny={shiny} />)}
          </div>
        )}
        {limit < list.length && (
          <div ref={sentinel} className="more">
            <button type="button" className="btn" onClick={() => setLimit((l) => l + PAGE)}>Show more</button>
          </div>
        )}
      </section>
    </div>
  );
}

function DexTile({ sp, shiny }: { sp: Species; shiny: boolean }) {
  const d = useDerived()!;
  const entry = d.dex.get(sp.name);
  const goal = d.goals.get(sp.name);
  const progress = d.progress.get(sp.name);
  const latest = entry.catches[0];
  const tone = isOwnedState(entry.state) ? 'owned' : entry.state === 'gone' ? 'gone' : undefined;
  let tag = null;
  if (entry.state === 'owned') tag = <Pill tone="gold">Owned</Pill>;
  else if (entry.state === 'evolved') tag = <Pill tone="gold">Evolved</Pill>;
  else if (entry.state === 'gone') tag = <Pill tone="neutral">{STATUS_LABEL[latest?.status ?? ''] ?? 'Gone'}</Pill>;
  else if (goal && progress?.kind !== 'done') {
    tag = progress?.kind === 'evolve' ? <Pill tone="teal">Have {progress.from}</Pill>
      : <Pill tone={goal.priority === 'hunting' ? 'ember' : 'teal'}>{PRIORITY_LABEL[goal.priority] ?? 'Goal'}</Pill>;
  }
  return <MiniTile sp={sp} shiny={shiny} tone={tone} tags={tag} menu={<GoalMenu species={sp.name} goal={goal} />} />;
}
