import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatValue, parseValue } from '../lib/data';
import { useDerived } from '../lib/derived';
import { HUNT_KIND_LABEL, huntSummary, seasonsLabel } from '../lib/game';
import { bestSpot, placeType, timesLabel } from '../lib/plan';
import { currentSpecies, formatCount } from '../lib/stats';
import type { CatchRow, Species } from '../lib/types';
import { STATUS_LABEL } from './ui';

/**
 * Hover card for a Pokémon tile (mouse only; phones keep tap-to-open). For a species you have
 * caught it shows your catch(es) and value; otherwise how and where to hunt it.
 * Drawn in a portal with fixed positioning so tier rows and grids never clip it.
 */
export function TileCard({ sp, anchor }: { sp: Species; anchor: HTMLElement }) {
  const d = useDerived()!;
  const catches = d.dex.get(sp.name).catches;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const card = ref.current;
    if (!card) return;
    const a = anchor.getBoundingClientRect();
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const gap = 8;
    const left = Math.min(Math.max(8, a.left + a.width / 2 - w / 2), window.innerWidth - w - 8);
    const below = a.bottom + gap;
    const top = below + h > window.innerHeight - 8 && a.top - gap - h > 8 ? a.top - gap - h : below;
    setPos({ left, top });
  }, [anchor]);

  return createPortal(
    <div ref={ref} className="tile-card" role="tooltip"
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}>
      <div className="tile-card-name">{sp.name}{catches.length > 1 && <span className="tile-card-count">×{catches.length}</span>}</div>
      {catches.length ? <Catches sp={sp} catches={catches} /> : <Hunt sp={sp} />}
    </div>,
    document.body,
  );
}

function Catches({ sp, catches }: { sp: Species; catches: CatchRow[] }) {
  const values = catches.filter((c) => c.status === 'kept').map((c) => parseValue(c.value)).filter((v): v is number => v !== null);
  return (
    <>
      {catches.map((c) => {
        const now = currentSpecies(c);
        const value = parseValue(c.value);
        const facts: [string, string][] = [
          [now !== sp.name ? 'Now' : c.species !== sp.name ? 'Caught as' : '', now !== sp.name ? now : c.species],
          ['Where', c.location],
          ['Season', c.season],
          ['Method', c.method ? c.method.replace(/^./, (m) => m.toUpperCase()) : ''],
          ['Encounters', c.encounters ? formatCount(Number(c.encounters)) : ''],
          c.status === 'kept' ? ['Value', value !== null ? formatValue(value) : ''] : ['Status', STATUS_LABEL[c.status] ?? c.status],
        ];
        return <Facts key={c.id} facts={facts} />;
      })}
      {values.length > 1 && <div className="tile-card-total"><span>Total value</span><span className="mono">{formatValue(values.reduce((s, v) => s + v, 0))}</span></div>}
    </>
  );
}

function Hunt({ sp }: { sp: Species }) {
  const d = useDerived()!;
  const spot = useMemo(() => bestSpot(d.game, sp.name), [d.game, sp.name]);
  const kind = d.game.huntKind(sp);
  if (!spot) {
    const other = huntSummary(sp).other;
    return <Facts facts={[['Hunt', kind === 'egg' ? 'Breed it (no horde)' : HUNT_KIND_LABEL[kind]], ['Also', other.join(' · ')]]} />;
  }
  const where = [spot.area, spot.region].filter(Boolean).join(', ');
  const type = placeType(spot.type);
  return (
    <Facts facts={[
      ['Hunt', `${spot.size}x horde${type ? ` · ${type}` : ''}`],
      ['Where', where],
      ['Season', seasonsLabel(spot.seasons)],
      ['Time', timesLabel(spot.times)],
      ['Share', `${spot.share}%${spot.via.length ? ` as ${spot.via.join(' / ')}` : ''}`],
    ]} />
  );
}

function Facts({ facts }: { facts: [string, string][] }) {
  return (
    <dl className="tile-card-facts">
      {facts.filter(([k, v]) => k && v).map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}
