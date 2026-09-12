import { useMemo, useRef } from 'react';
import { PLATFORMS } from '../data/mock';
import { useSize } from '../hooks/useSize';
import type { PlatformSlug, PriceSnapshot } from '../types';

interface Props {
  snapshots: PriceSnapshot[];
  highlight: PlatformSlug;
  /** Cheapest window to shade in mint. */
  band?: { fromAt: string; toAt: string };
}

const H = 190;
const PLOT_TOP = 8;
const PLOT_BOTTOM = 160;
const PAD_L = 34;
const PAD_R = 30;
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * 7-day delivered total per platform as inline SVG. Lines use brand colors;
 * the "now" marker is the accent; the cheapest window is a mint band.
 */
export function PriceHistory({ snapshots, highlight, band }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const { width } = useSize(wrapRef);
  const W = Math.max(280, width || 340);

  const model = useMemo(() => {
    const series = PLATFORMS.map((p) => ({
      platform: p,
      rows: snapshots
        .filter((s) => s.platformSlug === p.slug)
        .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)),
    })).filter((s) => s.rows.length > 1);
    const all = series.flatMap((s) => s.rows);
    if (!all.length) return null;
    const t0 = Math.min(...all.map((s) => Date.parse(s.capturedAt)));
    const t1 = Math.max(...all.map((s) => Date.parse(s.capturedAt)));
    let lo = Math.min(...all.map((s) => s.total));
    let hi = Math.max(...all.map((s) => s.total));
    const pad = Math.max(1, (hi - lo) * 0.12);
    lo -= pad;
    hi += pad;
    return { series, t0, t1, lo, hi };
  }, [snapshots]);

  if (!model) {
    return (
      <div className="chart__wrap" ref={wrapRef}>
        <p className="card__foot">No price history yet.</p>
      </div>
    );
  }

  const { series, t0, t1, lo, hi } = model;
  const plotW = W - PAD_L - PAD_R;
  const x = (iso: string) => PAD_L + ((Date.parse(iso) - t0) / Math.max(1, t1 - t0)) * plotW;
  const y = (v: number) => PLOT_BOTTOM - ((v - lo) / (hi - lo)) * (PLOT_BOTTOM - PLOT_TOP);
  const path = (rows: PriceSnapshot[]) =>
    rows.map((s, i) => `${i ? 'L' : 'M'}${x(s.capturedAt).toFixed(1)},${y(s.total).toFixed(1)}`).join(' ');

  const grid: number[] = [];
  const step = Math.max(1, Math.ceil((hi - lo) / 4));
  for (let v = Math.ceil(lo); v <= hi; v += step) grid.push(v);

  const ticks: { x: number; label: string }[] = [];
  let lastDay = -1;
  for (const s of series[0].rows) {
    const d = new Date(s.capturedAt);
    if (d.getHours() === 0 && d.getDay() !== lastDay) {
      lastDay = d.getDay();
      ticks.push({ x: x(s.capturedAt), label: DAY[d.getDay()] });
    }
  }

  const hl = series.find((s) => s.platform.slug === highlight);
  const last = hl?.rows[hl.rows.length - 1];
  const nowX = PAD_L + plotW;

  return (
    <div className="chart__wrap" ref={wrapRef}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Delivered total over the last 7 days, one line per app"
      >
        {band &&
          (() => {
            const x0 = x(band.fromAt);
            const x1 = x(band.toAt) + plotW / 168;
            const w = Math.max(26, x1 - x0);
            const left = Math.min(Math.max(PAD_L, x0 - (w - (x1 - x0)) / 2), nowX - w);
            return (
              <g>
                <rect x={left} y={PLOT_TOP - 4} width={w} height={PLOT_BOTTOM - PLOT_TOP + 4} fill="var(--babu)" opacity={0.16} rx={3} />
                <text className="chart__axis chart__axis--win" x={left + w / 2} y={PLOT_BOTTOM + 30} textAnchor="middle">
                  cheapest
                </text>
              </g>
            );
          })()}
        {grid.map((v) => (
          <g key={v}>
            <line x1={PAD_L} y1={y(v)} x2={nowX} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
            <text className="chart__axis" x={PAD_L - 6} y={y(v) + 4} textAnchor="end">
              ${v}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <path
            key={s.platform.slug}
            d={path(s.rows)}
            fill="none"
            stroke={s.platform.brandColor}
            strokeWidth={s.platform.slug === highlight ? 2.5 : 1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={s.platform.slug === highlight ? 1 : 0.7}
          />
        ))}
        <line x1={nowX} y1={PLOT_TOP - 4} x2={nowX} y2={PLOT_BOTTOM} stroke="var(--rausch)" strokeWidth={1.5} strokeDasharray="3 3" />
        {last && hl && (
          <circle cx={nowX} cy={y(last.total)} r={4.5} fill={hl.platform.brandColor} stroke="#fff" strokeWidth={2} />
        )}
        {ticks.map((t) => (
          <text key={t.label + t.x} className="chart__axis" x={t.x} y={PLOT_BOTTOM + 16} textAnchor="middle">
            {t.label}
          </text>
        ))}
        <text className="chart__axis chart__axis--accent" x={nowX} y={PLOT_BOTTOM + 16} textAnchor="middle">
          Now
        </text>
      </svg>
    </div>
  );
}
