import type { Summary } from '../lib/stats';
import { formatCount, formatValue } from '../lib/stats';
import { ODDS_LABEL } from '../lib/types';

export function Totals({ s }: { s: Summary }) {
  const parts = [`${s.kept} kept`, s.sold && `${s.sold} sold`, s.traded && `${s.traded} traded`, s.fled && `${s.fled} fled`].filter(Boolean);
  return (
    <section className="tiles" aria-label="Totals">
      <div className="tile">
        <span className="eyebrow">Shinies</span>
        <span className="tile-big">{s.total}</span>
        <span className="tile-sub">{parts.join(' · ') || 'None yet'}</span>
      </div>
      <div className="tile">
        <span className="eyebrow">Encounters</span>
        <span className="tile-big tile-big--mono">{formatCount(s.encounters)}</span>
        <span className="tile-sub">{s.average ? `avg ${formatCount(Math.round(s.average))} per shiny` : 'Log a hunt to start'}</span>
      </div>
      <div className="tile tile--ink">
        <span className="eyebrow">Luck</span>
        <span className="tile-big">{s.luck ? `${s.luck.toFixed(2)}×` : '—'}</span>
        <span className="tile-sub">vs. {ODDS_LABEL}</span>
      </div>
      <div className="tile">
        <span className="eyebrow">Value held</span>
        <span className="tile-big">{formatValue(s.valueHeld)}</span>
        <span className="tile-sub">est.{s.valueSold ? ` · ${formatValue(s.valueSold)} sold` : ''}</span>
      </div>
    </section>
  );
}
