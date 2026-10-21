import { useEffect, useMemo, useRef, useState } from 'react';
import { GoalMenu, MiniTile } from '../components/MiniTile';
import { Pill, SparkleIcon, STATUS_LABEL } from '../components/ui';
import { useDerived } from '../lib/derived';
import { hordeSpots } from '../lib/game';
import { usePref } from '../lib/prefs';
import { formatCount, isOwnedState } from '../lib/stats';
import { PRIORITY_LABEL, SEASONS, type Season, type Species } from '../lib/types';

const PAGE = 240;

export function DexPage() {
  const d = useDerived()!;
  const [mode, setMode] = usePref<'shiny' | 'normal'>('sprites', 'shiny');
  const [query, setQuery] = useState('');
  const [season, setSeason] = useState<Season | null>(null);
  const [soloOnly, setSoloOnly] = useState(false);
  const [finalPref, setFinalPref] = usePref<'all' | 'final'>('dex-forms', 'all');
  const finalOnly = finalPref === 'final';
  const [ownPref, setOwnPref] = usePref<'all' | 'unowned'>('dex-owned', 'all');
  const unownedOnly = ownPref === 'unowned';
  const [limit, setLimit] = useState(PAGE);
  const shiny = mode === 'shiny';

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return d.game.list.filter((sp) => {
      // Final forms: nothing left to evolve into (single-stage Pokémon count).
      if (finalOnly && sp.evolvesTo.length > 0) return false;
      // Unowned: no shiny you still have is this species now (or passed through it).
      if (unownedOnly && isOwnedState(d.dex.get(sp.name).state)) return false;
      if (season || soloOnly) {
        const spots = hordeSpots(sp, season);
        if (!spots.length) return false;
        if (soloOnly && spots[0].best < 100) return false;
      }
      if (q) {
        const inName = sp.name.toLowerCase().includes(q) || String(sp.id) === q.replace(/^#0*/, '');
        const inArea = q.length >= 3 && [...sp.hordes, ...sp.singles].some((r) => r.area.toLowerCase().includes(q));
        if (!inName && !inArea) return false;
      }
      return true;
    });
  }, [d, query, season, soloOnly, finalOnly, unownedOnly]);

  useEffect(() => setLimit(PAGE), [query, season, soloOnly, finalOnly, unownedOnly]);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || limit >= list.length) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE); }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [limit, list.length]);

  return (
    <div className="stack" style={{ gap: 28 }}>

      <section aria-label="Dex" className="stack" style={{ gap: 18 }}>
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
          <span className="chips-label">Horde in</span>
          {SEASONS.map((s) => (
            <button key={s} type="button" className="chip chip--season" aria-pressed={season === s} onClick={() => setSeason(season === s ? null : s)}>{s}</button>
          ))}
          <label className="check" style={{ marginLeft: 8 }}>
            <input type="checkbox" checked={soloOnly} onChange={(e) => setSoloOnly(e.target.checked)} />
            Solo spots only
          </label>
          <label className="check">
            <input type="checkbox" checked={finalOnly} onChange={(e) => setFinalPref(e.target.checked ? 'final' : 'all')} />
            Final forms only
          </label>
          <label className="check">
            <input type="checkbox" checked={unownedOnly} onChange={(e) => setOwnPref(e.target.checked ? 'unowned' : 'all')} />
            Unowned
          </label>
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
      : <Pill tone={goal.priority === 'current' ? 'ember' : 'teal'}>{PRIORITY_LABEL[goal.priority] === 'Unplanned' ? 'Goal' : PRIORITY_LABEL[goal.priority]}</Pill>;
  }
  return <MiniTile sp={sp} shiny={shiny} tone={tone} tags={tag} menu={<GoalMenu species={sp.name} goal={goal} />} />;
}
