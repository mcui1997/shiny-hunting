import { HUNT_KIND_LABEL, type HuntKind } from '../lib/game';
import type { ReactNode } from 'react';

export function SparkleIcon({ size = 18, color = 'var(--sparkle)', className }: { size?: number; color?: string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z" fill={color} />
    </svg>
  );
}

/** Goes back in history when there is somewhere to go back to, else to `href`. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="back" href={href} onClick={(e) => { if (window.history.length > 1) { e.preventDefault(); window.history.back(); } }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
      {children}
    </a>
  );
}

export const dexNo = (id: number) => `#${String(id).padStart(3, '0')}`;

export function Pill({ tone, children }: { tone: 'gold' | 'ember' | 'teal' | 'solid' | 'neutral' | 'ghost'; children: ReactNode }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

export const STATUS_LABEL: Record<string, string> = { kept: 'Kept', sold: 'Sold', traded: 'Traded', fled: 'Fled' };

export function catchStatusPill(status: string) {
  const tone = status === 'kept' ? 'gold' : status === 'fled' ? 'ember' : 'neutral';
  return <Pill tone={tone}>{STATUS_LABEL[status] ?? status}</Pill>;
}

/** "2026-10-17 19:14" -> { date: "Oct 17, 2026", time: "7:14 PM" } */
export function formatWhen(s: string): { date: string; time: string | null } {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(s ?? '');
  if (!m) return { date: s || '—', time: null };
  const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = m[4] ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null;
  return { date, time };
}

/** Tiny badge for how you'd get it: 5x / 3x horde, egg, or other. */
export function HuntBadge({ kind }: { kind: HuntKind }) {
  const label = HUNT_KIND_LABEL[kind];
  return (
    <span className={`hunt-badge hunt-badge--${kind}`} title={label} aria-label={label}>
      {kind === 'egg' ? (
        <svg width="9" height="11" viewBox="0 0 18 22" aria-hidden="true"><path d="M9 1C4.5 1 1 8.2 1 13.2 1 18 4.6 21 9 21s8-3 8-7.8C17 8.2 13.5 1 9 1z" fill="currentColor" /></svg>
      ) : kind === 'other' ? '?' : kind}
    </span>
  );
}
