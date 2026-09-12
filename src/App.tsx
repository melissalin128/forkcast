import { useState, useRef, useCallback } from 'react'

// ─── Data ────────────────────────────────────────────────────────────────────

const DEAL_CARDS = [
  {
    id: 1,
    name: 'Shake Shack',
    dish: 'Shack Burger Combo',
    platform: 'doordash',
    platformLabel: 'DoorDash',
    platformColor: '#E74C3C',
    savings: 4.20,
    originalTotal: 22.49,
    newTotal: 18.29,
    deliveryFee: 2.99,
    etaMinutes: 22,
    eta: '22 min',
    rating: 4.8,
    deal: '40% off first order',
    img: 'https://images.unsplash.com/photo-1541544741938-0af808871cc0?w=400&h=280&fit=crop&auto=format',
  },
  {
    id: 2,
    name: 'Wok to Walk',
    dish: 'Wok Box Large + Spring Rolls',
    platform: 'ubereats',
    platformLabel: 'Uber Eats',
    platformColor: '#06C167',
    savings: 3.15,
    originalTotal: 19.60,
    newTotal: 16.45,
    deliveryFee: 0,
    etaMinutes: 18,
    eta: '18 min',
    rating: 4.6,
    deal: 'Free delivery today',
    img: 'https://images.unsplash.com/photo-1637056930239-3b56a2034cb8?w=400&h=280&fit=crop&auto=format',
  },
  {
    id: 3,
    name: "Roberta's Pizza",
    dish: 'Classic Margherita 12"',
    platform: 'grubhub',
    platformLabel: 'Grubhub',
    platformColor: '#F4511E',
    savings: 5.80,
    originalTotal: 27.30,
    newTotal: 21.50,
    deliveryFee: 3.49,
    etaMinutes: 34,
    eta: '34 min',
    rating: 4.9,
    deal: '$5 off $20+ orders',
    img: 'https://images.unsplash.com/photo-1589010588553-46e8e7c21788?w=400&h=280&fit=crop&auto=format',
  },
  {
    id: 4,
    name: 'Sweetgreen',
    dish: 'Harvest Bowl + Lemonade',
    platform: 'doordash',
    platformLabel: 'DoorDash',
    platformColor: '#E74C3C',
    savings: 2.95,
    originalTotal: 18.90,
    newTotal: 15.95,
    deliveryFee: 1.99,
    etaMinutes: 20,
    eta: '20 min',
    rating: 4.7,
    deal: '20% off with DashPass',
    img: 'https://images.unsplash.com/photo-1576866206724-c696f4c9fa06?w=400&h=280&fit=crop&auto=format',
  },
  {
    id: 5,
    name: 'Momofuku Noodle Bar',
    dish: 'Pork Belly Ramen Bowl',
    platform: 'ubereats',
    platformLabel: 'Uber Eats',
    platformColor: '#06C167',
    savings: 6.40,
    originalTotal: 26.80,
    newTotal: 20.40,
    deliveryFee: 0,
    etaMinutes: 28,
    eta: '28 min',
    rating: 4.9,
    deal: 'Free delivery + 25% off',
    img: 'https://images.unsplash.com/photo-1565895405140-6b9830a88c19?w=400&h=280&fit=crop&auto=format',
  },
  {
    id: 6,
    name: 'Dos Toros Taqueria',
    dish: 'Burrito Bowl + Chips & Guac',
    platform: 'grubhub',
    platformLabel: 'Grubhub',
    platformColor: '#F4511E',
    savings: 3.60,
    originalTotal: 21.10,
    newTotal: 17.50,
    deliveryFee: 0,
    etaMinutes: 15,
    eta: '15 min',
    rating: 4.5,
    deal: 'Free delivery, no minimum',
    img: 'https://images.unsplash.com/photo-1557723434-b7376b3cec47?w=400&h=280&fit=crop&auto=format',
  },
  {
    id: 7,
    name: "Joe's Pizza",
    dish: 'Two Slices + Can of Soda',
    platform: 'doordash',
    platformLabel: 'DoorDash',
    platformColor: '#E74C3C',
    savings: 2.10,
    originalTotal: 13.20,
    newTotal: 11.10,
    deliveryFee: 1.49,
    etaMinutes: 12,
    eta: '12 min',
    rating: 4.8,
    deal: '$2 off with code PIZZA',
    img: 'https://images.unsplash.com/photo-1602273660127-a0000560a4c1?w=400&h=280&fit=crop&auto=format',
  },
  {
    id: 8,
    name: 'Taïm Mediterranean',
    dish: 'Falafel Plate + Hummus',
    platform: 'ubereats',
    platformLabel: 'Uber Eats',
    platformColor: '#06C167',
    savings: 4.75,
    originalTotal: 23.75,
    newTotal: 19.00,
    deliveryFee: 0,
    etaMinutes: 22,
    eta: '22 min',
    rating: 4.7,
    deal: '20% off + free delivery',
    img: 'https://images.unsplash.com/photo-1576866206905-59e0241273b8?w=400&h=280&fit=crop&auto=format',
  },
]

const HOT_PICKS = [1, 5, 3, 7].map(id => DEAL_CARDS.find(c => c.id === id)!)

// ─── Sub-components ──────────────────────────────────────────────────────────

// ─── Trend data ──────────────────────────────────────────────────────────────

type RangeKey = 'day' | 'month' | 'historical'
type MetricKey = 'total' | 'fee' | 'time'

const RANGE_DATA: Record<RangeKey, {
  labels: string[]
  labelStep: number
  total: { doordash: number[]; ubereats: number[]; grubhub: number[] }
  fee:   { doordash: number[]; ubereats: number[]; grubhub: number[] }
  time:  { doordash: number[]; ubereats: number[]; grubhub: number[] }
}> = {
  day: {
    labels: ['12am','2am','4am','6am','8am','10am','12pm','2pm','4pm','6pm','8pm','10pm'],
    labelStep: 2,
    total: {
      doordash: [16.2,15.8,16.1,16.9,17.8,19.4,20.1,19.7,18.9,21.3,20.5,18.8],
      ubereats:  [18.5,18.1,18.4,19.2,20.1,21.8,22.9,22.4,21.3,23.7,22.8,21.2],
      grubhub:   [17.4,17.0,17.3,18.0,18.9,20.5,21.3,21.0,20.1,22.4,21.6,20.0],
    },
    fee: {
      doordash: [1.99,1.49,1.49,1.99,2.49,2.99,3.49,2.99,2.49,3.99,3.49,2.99],
      ubereats:  [2.99,2.49,2.49,2.99,3.49,4.49,4.99,4.49,3.99,4.99,4.49,3.99],
      grubhub:   [0.99,0.49,0.49,0.99,1.49,1.99,2.49,1.99,1.49,2.99,2.49,1.99],
    },
    time: {
      doordash: [18,16,15,17,22,25,28,27,24,30,28,24],
      ubereats:  [22,20,19,21,26,29,32,31,28,34,32,28],
      grubhub:   [15,13,12,14,19,22,25,24,21,27,25,21],
    },
  },
  month: {
    labels: ['Oct 1','Oct 4','Oct 7','Oct 10','Oct 13','Oct 16','Oct 19','Oct 22','Oct 25','Oct 28','Oct 31'],
    labelStep: 2,
    total: {
      doordash: [18.4,17.9,19.2,16.8,18.1,20.5,19.3,16.9,18.7,20.1,17.8],
      ubereats:  [20.8,20.1,21.5,19.3,20.4,22.9,21.7,19.6,20.2,21.8,19.4],
      grubhub:   [19.5,18.8,20.4,18.1,19.3,21.6,20.1,18.3,19.0,20.4,18.2],
    },
    fee: {
      doordash: [2.49,2.99,1.99,2.49,2.99,3.49,2.49,1.99,2.99,3.49,2.49],
      ubereats:  [3.99,3.49,4.49,3.99,4.49,4.99,3.99,3.49,4.49,4.99,3.99],
      grubhub:   [1.49,0.99,1.99,1.49,1.99,2.49,1.49,0.99,1.49,1.99,0.99],
    },
    time: {
      doordash: [24,22,26,21,23,28,25,20,24,27,22],
      ubereats:  [28,26,29,25,27,31,29,24,27,30,25],
      grubhub:   [21,19,23,18,21,25,22,18,21,24,19],
    },
  },
  historical: {
    labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    labelStep: 2,
    total: {
      doordash: [17.2,17.8,18.1,18.9,19.4,20.2,19.8,18.4,18.9,19.5,20.1,21.3],
      ubereats:  [19.5,20.1,20.6,21.3,22.0,22.8,22.2,20.8,21.4,22.1,22.9,24.2],
      grubhub:   [18.3,18.9,19.3,20.0,20.6,21.5,21.0,19.5,20.1,20.8,21.4,22.7],
    },
    fee: {
      doordash: [2.49,2.49,2.99,2.99,3.49,3.49,2.99,2.49,2.99,3.49,3.49,3.99],
      ubereats:  [3.49,3.49,3.99,3.99,4.49,4.99,4.49,3.99,4.49,4.99,4.99,5.49],
      grubhub:   [1.49,1.49,1.99,1.99,1.49,1.99,1.49,0.99,1.49,1.99,1.99,2.49],
    },
    time: {
      doordash: [22,23,24,25,26,27,26,24,24,25,26,28],
      ubereats:  [26,27,28,29,30,31,30,28,28,29,30,32],
      grubhub:   [19,20,21,22,23,24,23,21,21,22,23,25],
    },
  },
}

const METRIC_META: Record<MetricKey, { label: string; unit: string; prefix: string }> = {
  total: { label: 'Total Price',    unit: '',     prefix: '$' },
  fee:   { label: 'Delivery Fee',   unit: '',     prefix: '$' },
  time:  { label: 'Delivery Time',  unit: ' min', prefix: ''  },
}

// Validated categorical palette slots 1–3 (all-pairs safe for 3 series)
// Relief: direct endpoint labels ship for aqua (#1baf7a) which is sub-3:1
const CHART_COLORS = {
  doordash: '#2a78d6',
  grubhub:  '#eb6834',
  ubereats: '#1baf7a',
}

const PLATFORMS = [
  { key: 'doordash' as const, label: 'DoorDash' },
  { key: 'ubereats' as const, label: 'Uber Eats' },
  { key: 'grubhub' as const, label: 'Grubhub' },
]

function TrendsChart() {
  const [metric, setMetric] = useState<MetricKey>('total')
  const [range, setRange] = useState<RangeKey>('month')
  const [crosshairIdx, setCrosshairIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const rd = RANGE_DATA[range]
  const series = rd[metric]
  const labels = rd.labels
  const n = labels.length

  const allVals = [...series.doordash, ...series.ubereats, ...series.grubhub]
  const minVal = Math.min(...allVals)
  const maxVal = Math.max(...allVals)
  const pad = (maxVal - minVal) * 0.08

  const W = 350, H = 200
  const ml = 38, mr = 46, mt = 12, mb = 28
  const chartW = W - ml - mr
  const chartH = H - mt - mb

  const xPos = (i: number) => ml + (i / (n - 1)) * chartW
  const yPos = (v: number) => mt + chartH - ((v - (minVal - pad)) / ((maxVal + pad) - (minVal - pad) || 1)) * chartH

  const makePath = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(v).toFixed(1)}`).join(' ')

  const gridSteps = 4
  const gridVals = Array.from({ length: gridSteps + 1 }, (_, i) =>
    minVal + (i / gridSteps) * (maxVal - minVal)
  )

  const { prefix, unit } = METRIC_META[metric]
  const fmt = (v: number) => `${prefix}${metric === 'time' ? v.toFixed(0) : v.toFixed(2)}${unit}`
  const fmtAxis = (v: number) => `${prefix}${metric === 'time' ? v.toFixed(0) : v.toFixed(0)}`

  const handleMove = useCallback((e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const x = (clientX - rect.left) * (W / rect.width) - ml
    const idx = Math.round((x / chartW) * (n - 1))
    setCrosshairIdx(Math.max(0, Math.min(n - 1, idx)))
  }, [chartW, n])

  const ci = crosshairIdx

  return (
    <div className="flex flex-col gap-3">
      {/* Range selector */}
      <div className="flex items-center p-0.5 rounded-[10px] gap-0.5" style={{ background: '#F0F0EE' }}>
        {([
          { key: 'day', label: '1D' },
          { key: 'month', label: '1M' },
          { key: 'historical', label: 'All' },
        ] as const).map(r => (
          <button
            key={r.key}
            onClick={() => { setRange(r.key); setCrosshairIdx(null) }}
            className="flex-1 py-1.5 rounded-[8px] text-xs font-semibold transition-all"
            style={{
              background: range === r.key ? '#FFFFFF' : 'transparent',
              color: range === r.key ? '#17171C' : '#63636B',
              boxShadow: range === r.key ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Metric pills */}
      <div className="flex gap-2">
        {([
          { key: 'total', label: 'Total Price' },
          { key: 'fee', label: 'Delivery Fee' },
          { key: 'time', label: 'Delivery Time' },
        ] as const).map(m => (
          <button
            key={m.key}
            onClick={() => { setMetric(m.key); setCrosshairIdx(null) }}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={{
              background: metric === m.key ? '#17171C' : '#F6F6F4',
              color: metric === m.key ? '#FFFFFF' : '#63636B',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Chart card */}
      <div className="rounded-[18px] overflow-hidden" style={{ background: '#FAFAF8', border: '1px solid #EBEBEB' }}>
        {/* Tooltip strip */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2" style={{ minHeight: 40 }}>
          {ci !== null ? (
            <>
              <span className="text-xs font-semibold" style={{ color: '#63636B' }}>{labels[ci]}</span>
              <div className="flex items-center gap-3">
                {PLATFORMS.map(p => (
                  <span key={p.key} className="flex items-center gap-1 text-xs font-semibold" style={{ color: '#17171C' }}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CHART_COLORS[p.key] }} />
                    {fmt(series[p.key][ci])}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <span className="text-xs" style={{ color: '#ADADB8' }}>Touch to compare</span>
          )}
        </div>

        {/* SVG chart */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: 'block', touchAction: 'none', cursor: 'crosshair' }}
          onMouseMove={handleMove}
          onTouchMove={handleMove}
          onMouseLeave={() => setCrosshairIdx(null)}
          onTouchEnd={() => setCrosshairIdx(null)}
        >
          {/* Grid lines + Y axis labels */}
          {gridVals.map((v, i) => (
            <g key={i}>
              <line x1={ml} x2={W - mr} y1={yPos(v).toFixed(1)} y2={yPos(v).toFixed(1)} stroke="#E8E8E4" strokeWidth="1" />
              <text x={ml - 5} y={yPos(v)} textAnchor="end" dominantBaseline="middle"
                fontSize="9" fill="#ADADB8" fontFamily="system-ui,sans-serif"
                style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmtAxis(v)}
              </text>
            </g>
          ))}

          {/* X axis labels */}
          {labels.map((lbl, i) => i % rd.labelStep === 0 && (
            <text key={i} x={xPos(i)} y={H - 6} textAnchor="middle"
              fontSize="9" fill="#ADADB8" fontFamily="system-ui,sans-serif">
              {lbl}
            </text>
          ))}

          {/* Lines */}
          {PLATFORMS.map(p => (
            <path key={p.key} d={makePath(series[p.key])}
              fill="none" stroke={CHART_COLORS[p.key]}
              strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          ))}

          {/* Endpoint labels — relief for aqua sub-3:1 */}
          {PLATFORMS.map(p => (
            <text key={p.key}
              x={xPos(n - 1) + 4} y={yPos(series[p.key][n - 1])}
              dominantBaseline="middle" fontSize="8.5" fontWeight="600"
              fill={CHART_COLORS[p.key]} fontFamily="system-ui,sans-serif">
              {p.label.split(' ')[0]}
            </text>
          ))}

          {/* Crosshair */}
          {ci !== null && (
            <g>
              <line x1={xPos(ci)} x2={xPos(ci)} y1={mt} y2={mt + chartH}
                stroke="#17171C" strokeWidth="1" strokeDasharray="3 3" opacity="0.3" />
              {PLATFORMS.map(p => (
                <circle key={p.key} cx={xPos(ci)} cy={yPos(series[p.key][ci])}
                  r="4" fill="#FFFFFF" stroke={CHART_COLORS[p.key]} strokeWidth="2" />
              ))}
            </g>
          )}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4">
        {PLATFORMS.map(p => (
          <div key={p.key} className="flex items-center gap-1.5">
            <div className="w-5 h-0.5 rounded-full" style={{ background: CHART_COLORS[p.key] }} />
            <span className="text-xs font-medium" style={{ color: '#63636B' }}>{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5 text-xs font-semibold" style={{ color: '#17171C' }}>
      <svg width="11" height="11" viewBox="0 0 13 13" fill="#FFE45C">
        <path d="M6.5 0.5l1.545 3.13 3.455.503-2.5 2.435.59 3.44L6.5 8.395l-3.09 1.623.59-3.44L1.5 4.133l3.455-.503L6.5.5z" />
      </svg>
      {rating}
    </span>
  )
}

function HotPickCard({ card, saved, onToggleSave }: {
  card: typeof DEAL_CARDS[0]
  saved: boolean
  onToggleSave: () => void
}) {
  return (
    <div
      className="flex-shrink-0 rounded-[18px] overflow-hidden relative cursor-pointer"
      style={{ width: 160, height: 200, border: '1px solid rgba(0,0,0,0.06)' }}
    >
      <img src={card.img} alt={card.dish} className="w-full h-full object-cover" />
      {/* gradient overlay */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0) 50%)' }} />
      {/* save button */}
      <button
        onClick={e => { e.stopPropagation(); onToggleSave() }}
        className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(6px)' }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill={saved ? '#E74C3C' : 'none'} stroke={saved ? '#E74C3C' : '#17171C'} strokeWidth="2.5">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>
      {/* savings badge */}
      <div
        className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full text-xs font-bold"
        style={{ background: '#FFE45C', color: '#17171C' }}
      >
        Save ${card.savings.toFixed(2)}
      </div>
      {/* bottom info */}
      <div className="absolute bottom-0 left-0 right-0 px-3 pb-3">
        <p className="text-white text-xs font-semibold leading-tight truncate">{card.name}</p>
        <div className="flex items-center justify-between mt-1">
          <span className="text-white text-sm font-bold">${card.newTotal.toFixed(2)}</span>
          <span className="text-xs font-medium px-1.5 py-0.5 rounded-full" style={{ background: card.platformColor, color: '#fff' }}>
            {card.platformLabel.split(' ')[0]}
          </span>
        </div>
      </div>
    </div>
  )
}

function DealRow({ card, saved, onToggleSave }: {
  card: typeof DEAL_CARDS[0]
  saved: boolean
  onToggleSave: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 active:bg-gray-50 cursor-pointer" style={{ borderBottom: '1px solid #F2F2F2' }}>
      <img src={card.img} alt={card.dish} className="w-16 h-16 rounded-[12px] object-cover flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-sm font-semibold truncate" style={{ color: '#17171C' }}>{card.name}</span>
          <StarRating rating={card.rating} />
        </div>
        <p className="text-xs truncate mb-1.5" style={{ color: '#63636B' }}>{card.deal}</p>
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ background: card.platformColor + '18', color: card.platformColor }}
          >
            {card.platformLabel}
          </span>
          <span className="text-xs" style={{ color: '#63636B' }}>{card.eta}</span>
          {card.deliveryFee === 0
            ? <span className="text-xs font-semibold" style={{ color: '#0F5C3F' }}>Free delivery</span>
            : <span className="text-xs" style={{ color: '#63636B' }}>${card.deliveryFee.toFixed(2)} fee</span>
          }
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <span className="text-base font-bold" style={{ color: '#17171C' }}>${card.newTotal.toFixed(2)}</span>
        <span className="text-xs line-through" style={{ color: '#ADADB8' }}>${card.originalTotal.toFixed(2)}</span>
        <button
          onClick={e => { e.stopPropagation(); onToggleSave() }}
          className="w-6 h-6 rounded-full flex items-center justify-center"
          style={{ background: saved ? '#FFF0F0' : '#F6F6F4' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill={saved ? '#E74C3C' : 'none'} stroke={saved ? '#E74C3C' : '#ADADB8'} strokeWidth="2.5">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type SortKey = 'total' | 'fee_dollar' | 'fastest'
type TabKey = 'explore' | 'trends' | 'saved' | 'alerts'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'total', label: 'Total Price' },
  { key: 'fee_dollar', label: 'Delivery Fee ($)' },
  { key: 'fastest', label: 'Delivery Time' },
]

export default function App() {
  const [savedCards, setSavedCards] = useState<Set<number>>(new Set())
  const [sortBy, setSortBy] = useState<SortKey>('total')
  const [activeTab, setActiveTab] = useState<TabKey>('explore')
  const [searchValue, setSearchValue] = useState('')

  const toggleSave = (id: number) => {
    setSavedCards(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const sorted = [...DEAL_CARDS]
    .filter(c => !searchValue || c.name.toLowerCase().includes(searchValue.toLowerCase()) || c.dish.toLowerCase().includes(searchValue.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'total') return a.newTotal - b.newTotal
      if (sortBy === 'fee_dollar') return a.deliveryFee - b.deliveryFee
      if (sortBy === 'fastest') return a.etaMinutes - b.etaMinutes
      return 0
    })

  const savedList = DEAL_CARDS.filter(c => savedCards.has(c.id))

  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{ background: '#E8E8EC', fontFamily: 'Instrument Sans, sans-serif' }}
    >
      {/* iPhone shell */}
      <div
        className="relative overflow-hidden flex flex-col"
        style={{
          width: 390,
          height: 844,
          background: '#FFFFFF',
          borderRadius: 52,
          boxShadow: '0 32px 80px rgba(0,0,0,0.28), 0 0 0 1px rgba(0,0,0,0.08)',
        }}
      >
        {/* Status bar */}
        <div className="flex items-center justify-between px-8 pt-4 pb-1 flex-shrink-0" style={{ paddingTop: 16 }}>
          <span className="text-xs font-semibold" style={{ color: '#17171C' }}>9:41</span>
          <div className="w-28 h-7 rounded-full" style={{ background: '#17171C' }} />
          <div className="flex items-center gap-1.5">
            <svg width="16" height="12" viewBox="0 0 16 12" fill="#17171C"><rect x="0" y="4" width="3" height="8" rx="1"/><rect x="4.5" y="2.5" width="3" height="9.5" rx="1"/><rect x="9" y="1" width="3" height="11" rx="1"/><rect x="13.5" y="0" width="2.5" height="12" rx="1" opacity="0.3"/></svg>
            <svg width="16" height="12" viewBox="0 0 24 24" fill="none" stroke="#17171C" strokeWidth="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="#17171C"/></svg>
            <svg width="25" height="12" viewBox="0 0 25 12" fill="none"><rect x="0.5" y="0.5" width="21" height="11" rx="3.5" stroke="#17171C" strokeOpacity="0.35"/><rect x="1.5" y="1.5" width="16" height="9" rx="2.5" fill="#17171C"/><path d="M23 4v4a2 2 0 0 0 0-4z" fill="#17171C" fillOpacity="0.4"/></svg>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 80 }}>

          {activeTab === 'explore' && (
            <>
              {/* Header */}
              <div className="px-5 pt-3 pb-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs font-medium" style={{ color: '#63636B' }}>Delivering to</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#17171C" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      <span className="text-sm font-semibold" style={{ color: '#17171C' }}>New York, NY 10001</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#63636B" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
                    </div>
                  </div>
                  <div className="w-9 h-9 rounded-full overflow-hidden" style={{ background: '#F6F6F4', border: '1.5px solid #E8E8EC' }}>
                    <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=72&h=72&fit=crop&auto=format" className="w-full h-full object-cover" alt="profile" />
                  </div>
                </div>

                {/* Search bar */}
                <div
                  className="flex items-center gap-3 px-4 rounded-[14px]"
                  style={{ background: '#F6F6F4', height: 46 }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ADADB8" strokeWidth="2.5">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input
                    className="flex-1 text-sm outline-none bg-transparent"
                    style={{ color: '#17171C' }}
                    placeholder="Search restaurants or dishes"
                    value={searchValue}
                    onChange={e => setSearchValue(e.target.value)}
                  />
                </div>
              </div>

              {/* Hot Picks */}
              <div className="mb-5">
                <div className="flex items-center justify-between px-5 mb-3">
                  <h2 className="text-base font-bold" style={{ color: '#17171C', fontFamily: 'Bricolage Grotesque, sans-serif', letterSpacing: '-0.02em' }}>
                    🔥 Hot Picks
                  </h2>
                  <span className="text-xs font-medium" style={{ color: '#0F5C3F' }}>See all</span>
                </div>
                <div
                  className="flex gap-3 overflow-x-auto"
                  style={{ paddingLeft: 20, paddingRight: 20, scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
                >
                  {HOT_PICKS.map(card => (
                    <HotPickCard
                      key={card.id}
                      card={card}
                      saved={savedCards.has(card.id)}
                      onToggleSave={() => toggleSave(card.id)}
                    />
                  ))}
                </div>
              </div>

              {/* Sort pills */}
              <div className="flex gap-2 px-5 mb-4">
                {SORT_OPTIONS.map(o => (
                  <button
                    key={o.key}
                    onClick={() => setSortBy(o.key)}
                    className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all"
                    style={{
                      background: sortBy === o.key ? '#17171C' : '#F6F6F4',
                      color: sortBy === o.key ? '#FFFFFF' : '#63636B',
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              {/* Count row */}
              <div className="px-5 mb-2">
                <span className="text-xs font-medium" style={{ color: '#63636B' }}>{sorted.length} deals</span>
              </div>

              {/* Deal rows */}
              <div style={{ borderTop: '1px solid #F2F2F2' }}>
                {sorted.map(card => (
                  <DealRow
                    key={card.id}
                    card={card}
                    saved={savedCards.has(card.id)}
                    onToggleSave={() => toggleSave(card.id)}
                  />
                ))}
                {sorted.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 gap-2">
                    <span style={{ fontSize: 36 }}>🍽️</span>
                    <p className="text-sm font-medium" style={{ color: '#63636B' }}>No deals found</p>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'trends' && (
            <div className="px-5 pt-5 pb-4">
              <div className="mb-5">
                <h2 className="text-xl font-bold" style={{ color: '#17171C', fontFamily: 'Bricolage Grotesque, sans-serif', letterSpacing: '-0.02em' }}>
                  Price Trends
                </h2>
                <p className="text-xs mt-1" style={{ color: '#63636B' }}>12-week platform comparison</p>
              </div>
              <TrendsChart />
            </div>
          )}

          {activeTab === 'saved' && (
            <div className="px-5 pt-6">
              <h2 className="text-xl font-bold mb-5" style={{ color: '#17171C', fontFamily: 'Bricolage Grotesque, sans-serif', letterSpacing: '-0.02em' }}>Saved</h2>
              {savedList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <span style={{ fontSize: 40 }}>🤍</span>
                  <p className="text-sm font-medium" style={{ color: '#63636B' }}>Tap ♥ on any deal to save it</p>
                </div>
              ) : (
                <div style={{ borderTop: '1px solid #F2F2F2' }}>
                  {savedList.map(card => (
                    <DealRow key={card.id} card={card} saved onToggleSave={() => toggleSave(card.id)} />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'alerts' && (
            <div className="px-5 pt-6">
              <h2 className="text-xl font-bold mb-2" style={{ color: '#17171C', fontFamily: 'Bricolage Grotesque, sans-serif', letterSpacing: '-0.02em' }}>Price Alerts</h2>
              <p className="text-sm mb-6" style={{ color: '#63636B' }}>Get notified when your spots go on sale.</p>
              <div className="rounded-[18px] overflow-hidden p-5 flex flex-col gap-4" style={{ background: '#F6F6F4' }}>
                <div
                  className="flex items-center rounded-[12px] overflow-hidden p-1 gap-1"
                  style={{ background: '#FFFFFF', border: '1.5px solid #E8E8EC' }}
                >
                  <div className="flex-1 flex items-center gap-2 px-3">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#63636B" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.9 1.11h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    <input className="flex-1 py-2 text-sm outline-none bg-transparent" style={{ color: '#17171C' }} placeholder="Your phone number" />
                  </div>
                  <button className="flex-shrink-0 px-4 py-2 rounded-[10px] text-xs font-semibold" style={{ background: '#0F5C3F', color: '#FFFFFF' }}>
                    Turn on
                  </button>
                </div>
                <p className="text-xs" style={{ color: '#63636B' }}>2–3 texts per week max. Reply STOP anytime.</p>
              </div>
            </div>
          )}
        </div>

        {/* Bottom tab bar */}
        <div
          className="absolute bottom-0 left-0 right-0 flex items-end justify-around px-6"
          style={{
            height: 83,
            background: 'rgba(255,255,255,0.94)',
            backdropFilter: 'blur(20px)',
            borderTop: '1px solid rgba(0,0,0,0.08)',
            paddingBottom: 24,
          }}
        >
          {([
            {
              key: 'explore', label: 'Explore',
              icon: (active: boolean) => (
                <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? '#17171C' : 'none'} stroke={active ? '#17171C' : '#ADADB8'} strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              )
            },
            {
              key: 'trends', label: 'Trends',
              icon: (active: boolean) => (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#17171C' : '#ADADB8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
              )
            },
            {
              key: 'saved', label: 'Saved',
              icon: (active: boolean) => (
                <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? '#E74C3C' : 'none'} stroke={active ? '#E74C3C' : '#ADADB8'} strokeWidth="2">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              )
            },
            {
              key: 'alerts', label: 'Alerts',
              icon: (active: boolean) => (
                <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? '#17171C' : 'none'} stroke={active ? '#17171C' : '#ADADB8'} strokeWidth="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
              )
            },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex flex-col items-center gap-1"
            >
              {tab.icon(activeTab === tab.key)}
              <span
                className="text-[10px] font-semibold"
                style={{ color: activeTab === tab.key ? '#17171C' : '#ADADB8' }}
              >
                {tab.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
