import { useEffect, useMemo, useRef, useState } from 'react';
import { Sprite } from '../components/Sprite';
import { Totals } from '../components/Totals';
import { dexNo, formatWhen, SparkleIcon, StatePill } from '../components/ui';
import { useDerived } from '../lib/derived';
import { bestSpotLabel, hordeSpots } from '../lib/game';
import { usePref } from '../lib/prefs';
import { href } from '../lib/router';
import { formatCount } from '../lib/stats';
import { SEASONS, type Season, type Species } from '../lib/types';

type Filter = 'all' | 'mine' | 'goals' | 'missing';
const FILTERS: [Filter, string][] = [['all', 'All'], ['mine', 'Caught'], ['goals', 'Goals'], ['missing', 'Missing']];
const PAGE = 120;

export function DexPage() {
  const d = useDerived()!;
  const [mode, setMode] = usePref<'shiny' | 'normal'>('sprites', 'shiny');
  const [filter, setFilter] = usePref<Filter>('dex-filter', 'all');
  const [query, setQuery] = useState('');
  const [season, setSeason] = useState<Season | null>(null);
  const [soloOnly, setSoloOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const shiny = mode === 'shiny';

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return d.game.list.filter((sp) => {
      const entry = d.dex.get(sp.name);
      const mine = entry.state === 'owned' || entry.state === 'caught';
      if (filter === 'mine' && !mine) return false;
      if (filter === 'goals' && !d.goals.has(sp.name)) return false;
      if (filter === 'missing' && (mine || !sp.obtainable)) return false;
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
  }, [d, filter, query, season, soloOnly]);

  useEffect(() => setLimit(PAGE), [filter, query, season, soloOnly]);

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
      <Totals s={d.summary} />

      <section aria-label="Dex" className="stack" style={{ gap: 18 }}>
        <div className="toolbar">
          <div className="field search">
            <label htmlFor="dex-search">Search</label>
            <input id="dex-search" className="input" type="search" placeholder="Pokémon, dex number, or area" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="chips" role="group" aria-label="Show">
            {FILTERS.map(([key, label]) => (
              <button key={key} type="button" className="chip" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>
            ))}
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
          <span className="small muted" style={{ marginLeft: 'auto' }} aria-live="polite">
            Showing {formatCount(list.length)} of {formatCount(d.game.list.length)}
          </span>
        </div>

        {list.length === 0 ? (
          <p className="empty">Nothing matches those filters.</p>
        ) : (
          <div className="grid">
            {list.slice(0, limit).map((sp) => <DexCard key={sp.id} sp={sp} shiny={shiny} />)}
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

function DexCard({ sp, shiny }: { sp: Species; shiny: boolean }) {
  const d = useDerived()!;
  const entry = d.dex.get(sp.name);
  const goal = d.goals.get(sp.name);
  const progress = d.progress.get(sp.name);
  const mine = entry.state === 'owned' || entry.state === 'caught';
  const latest = entry.catches[0];

  let sub: string | null = null;
  if (latest) {
    const enc = latest.encounters ? `${formatCount(Number(latest.encounters))} enc · ` : '';
    sub = `${enc}${formatWhen(latest.caught_at).date}`;
    if (latest.current_form === sp.name && latest.species !== sp.name) sub = `Caught as ${latest.species}`;
  } else if (progress?.kind === 'evolve') {
    sub = `Have ${progress.from}`;
  } else if (!sp.obtainable && sp.hordes.length + sp.singles.length + sp.rare.length === 0) {
    sub = 'No regular encounter';
  } else {
    const rareOnly = sp.rare.length && sp.rare.every((r) => r.kind === 'Lure') ? 'Lure encounters only' : 'Special encounters only';
    sub = bestSpotLabel(sp) ?? (sp.singles.length ? 'Single encounters only' : sp.rare.length ? rareOnly : 'Not found in the wild');
  }

  const cls = ['card', mine ? 'card--gilt' : '', !sp.obtainable && !mine ? 'card--unobtainable' : ''].filter(Boolean).join(' ');
  return (
    <a className={cls} href={href.species(sp.id)}>
      <div className="card-top">
        <span className="mono small muted">{dexNo(sp.id)}</span>
        <StatePill state={entry.state} goal={goal} progress={progress} />
      </div>
      <div className="card-tile">
        <Sprite id={sp.id} name={sp.name} shiny={shiny} size={104} />
        {mine && shiny && <SparkleIcon className="sparkle" />}
      </div>
      <div>
        <div className="card-name">{sp.name}</div>
        {sub && <div className="card-sub">{sub}</div>}
      </div>
    </a>
  );
}
