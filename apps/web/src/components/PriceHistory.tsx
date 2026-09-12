import { useMemo, useRef } from 'react';
import { PLATFORMS } from '../data/mock';
import { useSize } from '../hooks/useSize';
import type { PlatformSlug, PriceSnapshot } from '../types';

interface Props {
  snapshots: PriceSnapshot[];
  highlight: PlatformSlug;
  /** Best window to shade in mint (10%). */
  band?: { fromAt: string; toAt: string };
}

const H = 220;
const PLOT_TOP = 6;
const PLOT_BOTTOM = 190;
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * 7-day delivered total per platform as inline SVG. Lines only use brand
 * colors; the "now" marker is the accent; the best window is a mint band.
 */
export function PriceHistory({ snapshots, highlight, band }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const { width } = useSize(wrapRef);
  const W = Math.max(280, width || 760);

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
      <div className="chart__svgwrap" ref={wrapRef}>
        <div className="chart__plain">No price history yet.</div>
      </div>
    );
  }

  const { series, t0, t1, lo, hi } = model;
  const x = (iso: string) => ((Date.parse(iso) - t0) / Math.max(1, t1 - t0)) * W;
  const y = (v: number) => PLOT_BOTTOM - ((v - lo) / (hi - lo)) * (PLOT_BOTTOM - PLOT_TOP);
  const path = (rows: PriceSnapshot[]) =>
    rows.map((s, i) => `${i ? 'L' : 'M'}${x(s.capturedAt).toFixed(1)},${y(s.total).toFixed(1)}`).join(' ');

  // Gridlines at 4 round dollar levels.
  const grid: number[] = [];
  const step = Math.max(1, Math.ceil((hi - lo) / 4));
  for (let v = Math.ceil(lo); v <= hi; v += step) grid.push(v);

  // Day ticks at each local midnight.
  const ticks: { x: number; label: string }[] = [];
  const first = series[0].rows;
  let lastDay = -1;
  for (const s of first) {
    const d = new Date(s.capturedAt);
    if (d.getHours() === 0 && d.getDay() !== lastDay) {
      lastDay = d.getDay();
      const tx = x(s.capturedAt);
      if (tx < W - 36) ticks.push({ x: tx, label: DAY[d.getDay()] }); // keep clear of "Now"
    }
  }

  const hl = series.find((s) => s.platform.slug === highlight);
  const last = hl?.rows[hl.rows.length - 1];

  return (
    <div className="chart__svgwrap" ref={wrapRef}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Delivered total over the last 7 days, one line per platform">
        {band && (() => {
          // A 2-hour window is ~1% of the week; widen it so the eye can find it.
          const x0 = x(band.fromAt);
          const x1 = x(band.toAt) + W / 168;
          const minW = 28;
          const w = Math.max(minW, x1 - x0);
          const left = Math.min(Math.max(0, x0 - (w - (x1 - x0)) / 2), W - w);
          return <rect x={left} y={0} width={w} height={PLOT_BOTTOM} fill="var(--win)" opacity={0.1} />;
        })()}
        {grid.map((v) => (
          <g key={v}>
            <line x1={0} y1={y(v)} x2={W} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
            <text className="chart__axis" x={0} y={y(v) - 4}>
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
            strokeWidth={s.platform.slug === highlight ? 2.5 : 1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={s.platform.slug === highlight ? 1 : 0.8}
          />
        ))}
        <line x1={W} y1={0} x2={W} y2={PLOT_BOTTOM} stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 3" />
        {last && hl && (
          <circle cx={W} cy={y(last.total)} r={4} fill={hl.platform.brandColor} stroke="var(--bg)" strokeWidth={2} />
        )}
        {ticks.map((t) => (
          <text key={t.label + t.x} className="chart__axis" x={t.x} y={212}>
            {t.label}
          </text>
        ))}
        <text className="chart__axis" x={W} y={212} textAnchor="end" fill="var(--accent)" style={{ fill: 'var(--accent)' }}>
          Now
        </text>
      </svg>
    </div>
  );
}
