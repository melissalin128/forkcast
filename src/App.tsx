import { useState } from 'react'

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

type SortKey = 'total' | 'fee_dollar' | 'fee_pct' | 'fastest'
type TabKey = 'explore' | 'saved' | 'alerts'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'total', label: 'Total price' },
  { key: 'fee_dollar', label: 'Delivery fee ($)' },
  { key: 'fee_pct', label: 'Delivery fee (%)' },
  { key: 'fastest', label: 'Fastest' },
]

export default function App() {
  const [savedCards, setSavedCards] = useState<Set<number>>(new Set())
  const [sortBy, setSortBy] = useState<SortKey>('total')
  const [activeTab, setActiveTab] = useState<TabKey>('explore')
  const [searchValue, setSearchValue] = useState('')
  const [platformFilter, setPlatformFilter] = useState<'all' | 'doordash' | 'ubereats' | 'grubhub'>('all')

  const toggleSave = (id: number) => {
    setSavedCards(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const sorted = [...DEAL_CARDS]
    .filter(c => platformFilter === 'all' || c.platform === platformFilter)
    .filter(c => !searchValue || c.name.toLowerCase().includes(searchValue.toLowerCase()) || c.dish.toLowerCase().includes(searchValue.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'total') return a.newTotal - b.newTotal
      if (sortBy === 'fee_dollar') return a.deliveryFee - b.deliveryFee
      if (sortBy === 'fee_pct') return (a.deliveryFee / a.originalTotal) - (b.deliveryFee / b.originalTotal)
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

              {/* Platform filter pills */}
              <div
                className="flex gap-2 overflow-x-auto px-5 mb-4"
                style={{ scrollbarWidth: 'none' }}
              >
                {([
                  { key: 'all', label: 'All' },
                  { key: 'doordash', label: 'DoorDash', color: '#E74C3C' },
                  { key: 'ubereats', label: 'Uber Eats', color: '#06C167' },
                  { key: 'grubhub', label: 'Grubhub', color: '#F4511E' },
                ] as const).map(p => (
                  <button
                    key={p.key}
                    onClick={() => setPlatformFilter(p.key)}
                    className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all"
                    style={{
                      background: platformFilter === p.key ? '#17171C' : '#F6F6F4',
                      color: platformFilter === p.key ? '#FFFFFF' : '#63636B',
                    }}
                  >
                    {p.key !== 'all' && (
                      <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: (p as any).color, verticalAlign: 'middle' }} />
                    )}
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Sort + count row */}
              <div className="flex items-center justify-between px-5 mb-2">
                <span className="text-xs font-medium" style={{ color: '#63636B' }}>{sorted.length} deals</span>
                <div className="flex items-center gap-1.5">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#63636B" strokeWidth="2.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg>
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as SortKey)}
                    className="text-xs font-semibold outline-none bg-transparent cursor-pointer"
                    style={{ color: '#17171C' }}
                  >
                    {SORT_OPTIONS.map(o => (
                      <option key={o.key} value={o.key}>{o.label}</option>
                    ))}
                  </select>
                </div>
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
