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
    name: 'Roberta\'s Pizza',
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
    name: 'Joe\'s Pizza',
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

// ─── Sub-components ──────────────────────────────────────────────────────────

function PlatformBadge({ platform, label, color }: { platform: string; label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: 'rgba(255,255,255,0.95)', color: '#17171C', backdropFilter: 'blur(4px)' }}
    >
      <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: color }} />
      {label}
    </span>
  )
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-1 text-sm font-medium" style={{ color: '#17171C' }}>
      <svg width="13" height="13" viewBox="0 0 13 13" fill="#FFE45C">
        <path d="M6.5 0.5l1.545 3.13 3.455.503-2.5 2.435.59 3.44L6.5 8.395l-3.09 1.623.59-3.44L1.5 4.133l3.455-.503L6.5.5z" />
      </svg>
      {rating}
    </span>
  )
}

function DealCard({ card, saved, onToggleSave }: {
  card: typeof DEAL_CARDS[0]
  saved: boolean
  onToggleSave: () => void
}) {
  return (
    <div
      className="transition-lift rounded-[16px] overflow-hidden bg-white cursor-pointer"
      style={{ border: '1px solid #E8E8EC' }}
    >
      <div className="relative">
        <img
          src={card.img}
          alt={card.dish}
          className="w-full object-cover"
          style={{ height: 186 }}
        />
        <div className="absolute top-3 left-3">
          <PlatformBadge platform={card.platform} label={card.platformLabel} color={card.platformColor} />
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSave() }}
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-all"
          style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(4px)' }}
          aria-label={saved ? 'Remove from saved' : 'Save deal'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={saved ? '#E74C3C' : 'none'} stroke={saved ? '#E74C3C' : '#17171C'} strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
        <div
          className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full text-xs font-bold"
          style={{ background: '#FFE45C', color: '#17171C' }}
        >
          Save ${card.savings.toFixed(2)}
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <span className="font-semibold text-sm leading-snug" style={{ color: '#17171C', fontFamily: 'Instrument Sans' }}>{card.name}</span>
          <StarRating rating={card.rating} />
        </div>
        <p className="text-xs mb-3 leading-relaxed" style={{ color: '#63636B' }}>{card.deal}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm line-through" style={{ color: '#63636B' }}>${card.originalTotal.toFixed(2)}</span>
            <span className="text-base font-bold" style={{ color: '#17171C' }}>${card.newTotal.toFixed(2)}</span>
          </div>
          <span className="text-xs" style={{ color: '#63636B' }}>{card.eta}</span>
        </div>
      </div>
    </div>
  )
}

function NavLink({ children }: { children: React.ReactNode }) {
  return (
    <a href="#" className="text-sm font-medium transition-colors" style={{ color: '#17171C' }}
      onMouseEnter={e => (e.currentTarget.style.color = '#0F5C3F')}
      onMouseLeave={e => (e.currentTarget.style.color = '#17171C')}
    >
      {children}
    </a>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState<'all' | 'doordash' | 'ubereats' | 'grubhub'>('all')
  const [savedCards, setSavedCards] = useState<Set<number>>(new Set())
  const [addressFocused, setAddressFocused] = useState(false)
  const [cravingFocused, setCravingFocused] = useState(false)
  const [addressValue, setAddressValue] = useState('')
  const [cravingValue, setCravingValue] = useState('')
  const [alertPhone, setAlertPhone] = useState('')
  const [sortBy, setSortBy] = useState<'total' | 'fee_dollar' | 'fee_pct' | 'fastest'>('total')

  const filtered = activeTab === 'all' ? DEAL_CARDS : DEAL_CARDS.filter(c => c.platform === activeTab)
  const filteredCards = [...filtered].sort((a, b) => {
    if (sortBy === 'total') return a.newTotal - b.newTotal
    if (sortBy === 'fee_dollar') return a.deliveryFee - b.deliveryFee
    if (sortBy === 'fee_pct') return (a.deliveryFee / a.originalTotal) - (b.deliveryFee / b.originalTotal)
    if (sortBy === 'fastest') return a.etaMinutes - b.etaMinutes
    return 0
  })

  const toggleSave = (id: number) => {
    setSavedCards(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div style={{ fontFamily: 'Instrument Sans, sans-serif', background: '#FFFFFF', color: '#17171C' }}>

      {/* ── Nav ── */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-8 xl:px-16"
        style={{ height: 72, background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #E8E8EC' }}
      >
        {/* Wordmark */}
        <a href="#" className="font-display text-xl font-semibold" style={{ color: '#17171C', fontFamily: 'Bricolage Grotesque, sans-serif', letterSpacing: '-0.02em', textDecoration: 'none' }}>
          Platter
        </a>

        {/* Center links */}
        <nav className="hidden md:flex items-center gap-8">
          <NavLink>Deals</NavLink>
          <NavLink>How it works</NavLink>
          <NavLink>Price alerts</NavLink>
        </nav>

        {/* Auth */}
        <div className="flex items-center gap-3">
          <a href="#"
            className="hidden sm:flex items-center px-5 py-2 rounded-full text-sm font-medium transition-colors"
            style={{ border: '1.5px solid #E8E8EC', color: '#17171C', textDecoration: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#17171C' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8E8EC' }}
          >
            Log in
          </a>
          <a href="#"
            className="flex items-center px-5 py-2 rounded-full text-sm font-semibold transition-all"
            style={{ background: '#0F5C3F', color: '#FFFFFF', textDecoration: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0a4a32' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#0F5C3F' }}
          >
            Sign up
          </a>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="px-8 xl:px-16 pt-16 pb-20 md:pt-20 md:pb-28">
        <div className="max-w-[1280px] mx-auto grid md:grid-cols-2 gap-12 xl:gap-20 items-start">

          {/* Left */}
          <div className="flex flex-col gap-8">

            {/* Search bar */}
            <div
              className="shadow-search flex flex-col sm:flex-row items-stretch rounded-full overflow-hidden p-1.5 gap-1"
              style={{ background: '#FFFFFF', border: '1.5px solid #E8E8EC' }}
            >
              <div className="flex-1 flex items-center gap-3 px-5 py-3 rounded-full transition-all"
                style={{ background: addressFocused ? '#F6F6F4' : 'transparent' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#63636B" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                </svg>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-xs font-semibold" style={{ color: '#17171C' }}>Deliver to</span>
                  <input
                    className="text-sm outline-none bg-transparent w-full"
                    style={{ color: '#17171C' }}
                    placeholder="Enter your address"
                    value={addressValue}
                    onChange={e => setAddressValue(e.target.value)}
                    onFocus={() => setAddressFocused(true)}
                    onBlur={() => setAddressFocused(false)}
                  />
                </div>
              </div>
              <div className="hidden sm:block w-px self-stretch my-2" style={{ background: '#E8E8EC' }} />
              <div className="flex-1 flex items-center gap-3 px-5 py-3 rounded-full transition-all"
                style={{ background: cravingFocused ? '#F6F6F4' : 'transparent' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#63636B" strokeWidth="2">
                  <path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" />
                </svg>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-xs font-semibold" style={{ color: '#17171C' }}>Craving</span>
                  <input
                    className="text-sm outline-none bg-transparent w-full"
                    style={{ color: '#17171C' }}
                    placeholder="Dish or restaurant"
                    value={cravingValue}
                    onChange={e => setCravingValue(e.target.value)}
                    onFocus={() => setCravingFocused(true)}
                    onBlur={() => setCravingFocused(false)}
                  />
                </div>
              </div>
              <button
                className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-all"
                style={{ background: '#0F5C3F' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#0a4a32' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#0F5C3F' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>
            </div>

            {/* Trust stats */}
            <div className="flex flex-wrap gap-6">
              {[
                { value: '$6.40', label: 'average saved per order' },
                { value: '3 apps', label: 'compared in one search' },
                { value: 'Fees', label: 'included in every price' },
              ].map((stat, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: '#17171C' }}>{stat.value}</span>
                  <span className="text-sm" style={{ color: '#63636B' }}>{stat.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Receipt card */}
          <div className="relative">
            <div
              className="shadow-card rounded-[24px] overflow-hidden bg-white"
              style={{ border: '1px solid #E8E8EC' }}
            >
              {/* Fresh pill */}
              <div className="absolute top-4 right-4 z-10">
                <span className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: '#17171C', color: '#FFFFFF' }}>
                  Prices checked 2 min ago
                </span>
              </div>

              {/* Card header */}
              <div className="flex items-center gap-4 px-6 pt-6 pb-5" style={{ borderBottom: '1px solid #E8E8EC' }}>
                <img
                  src="https://images.unsplash.com/photo-1670164747019-3b4d77128a71?w=72&h=72&fit=crop&auto=format"
                  alt="Chicken shawarma bowl"
                  className="w-14 h-14 rounded-[10px] object-cover flex-shrink-0"
                />
                <div>
                  <p className="text-sm font-semibold leading-snug" style={{ color: '#17171C' }}>Chicken shawarma bowl, large</p>
                  <p className="text-xs mt-0.5" style={{ color: '#63636B' }}>Hana Grill · New York, NY</p>
                </div>
              </div>

              {/* Table */}
              <div className="px-6 py-4">
                {/* Table header */}
                <div className="grid grid-cols-4 gap-2 pb-3 mb-1" style={{ borderBottom: '1px solid #E8E8EC' }}>
                  {['Platform', 'Food', 'Fees', 'Total'].map(h => (
                    <span key={h} className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#63636B' }}>{h}</span>
                  ))}
                </div>

                {/* DoorDash row — winner */}
                <div className="grid grid-cols-4 gap-2 py-3.5 rounded-[10px] px-3 -mx-3" style={{ background: 'rgba(255,228,92,0.18)' }}>
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: '#E74C3C' }} />
                      <span className="text-sm font-semibold" style={{ color: '#17171C' }}>DoorDash</span>
                    </div>
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#FFE45C', color: '#17171C' }}>40% off</span>
                    <p className="text-xs mt-1" style={{ color: '#63636B' }}>28 min</p>
                  </div>
                  <div className="flex items-start pt-0.5">
                    <span className="text-sm font-medium" style={{ color: '#17171C' }}>$14.99</span>
                  </div>
                  <div className="flex items-start pt-0.5">
                    <span className="text-sm font-medium" style={{ color: '#17171C' }}>$4.16</span>
                  </div>
                  <div className="flex items-start pt-0.5">
                    <span
                      className="text-sm font-bold px-2 py-0.5 rounded-full"
                      style={{ background: '#FFE45C', color: '#17171C' }}
                    >
                      $13.15
                    </span>
                  </div>
                </div>

                {/* Uber Eats row */}
                <div className="grid grid-cols-4 gap-2 py-3.5 px-3 -mx-3">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: '#06C167' }} />
                      <span className="text-sm font-semibold" style={{ color: '#17171C' }}>Uber Eats</span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: '#63636B' }}>24 min</p>
                  </div>
                  <div className="flex items-start pt-0.5">
                    <span className="text-sm" style={{ color: '#17171C' }}>$15.49</span>
                  </div>
                  <div className="flex items-start pt-0.5">
                    <span className="text-sm" style={{ color: '#17171C' }}>$5.87</span>
                  </div>
                  <div className="flex items-start pt-0.5">
                    <span className="text-sm font-medium" style={{ color: '#17171C' }}>$21.36</span>
                  </div>
                </div>

                {/* Grubhub row */}
                <div className="grid grid-cols-4 gap-2 py-3.5 px-3 -mx-3" style={{ borderBottom: '1px solid #E8E8EC' }}>
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: '#F4511E' }} />
                      <span className="text-sm font-semibold" style={{ color: '#17171C' }}>Grubhub</span>
                    </div>
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#F0FDF4', color: '#0F5C3F' }}>Free delivery</span>
                    <p className="text-xs mt-1" style={{ color: '#63636B' }}>35 min</p>
                  </div>
                  <div className="flex items-start pt-0.5">
                    <span className="text-sm" style={{ color: '#17171C' }}>$14.99</span>
                  </div>
                  <div className="flex items-start pt-0.5">
                    <span className="text-sm" style={{ color: '#17171C' }}>$3.41</span>
                  </div>
                  <div className="flex items-start pt-0.5">
                    <span className="text-sm font-medium" style={{ color: '#17171C' }}>$18.40</span>
                  </div>
                </div>
              </div>

              {/* Card footer */}
              <div className="px-6 pb-6 pt-2 flex flex-col gap-4">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-2xl font-display font-semibold" style={{ fontFamily: 'Bricolage Grotesque, sans-serif', color: '#17171C' }}>
                    You save{' '}
                    <span
                      className="px-2 py-0.5 rounded-lg"
                      style={{ background: '#FFE45C', color: '#17171C' }}
                    >
                      $8.21
                    </span>
                  </span>
                </div>
                <p className="text-xs" style={{ color: '#63636B' }}>vs. the most expensive option today</p>
                <button
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-full text-sm font-semibold transition-all"
                  style={{ background: '#0F5C3F', color: '#FFFFFF' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#0a4a32' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#0F5C3F' }}
                >
                  Order on DoorDash
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Deals ── */}
      <section className="px-8 xl:px-16 py-16 md:py-24">
        <div className="max-w-[1280px] mx-auto">

          {/* Section header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
            <div>
              <h2
                className="font-display font-semibold mb-2"
                style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 34, color: '#17171C', letterSpacing: '-0.02em' }}
              >
                Best deals near you right now
              </h2>
              <p className="text-sm" style={{ color: '#63636B' }}>
                New York, NY 10001 · Sorted by total cost after fees
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Segmented tabs */}
              <div
                className="flex items-center p-1 rounded-full gap-0.5"
                style={{ background: '#F6F6F4', border: '1px solid #E8E8EC' }}
              >
                {([
                  { key: 'all', label: 'All' },
                  { key: 'ubereats', label: 'Uber Eats' },
                  { key: 'grubhub', label: 'Grubhub' },
                  { key: 'doordash', label: 'DoorDash' },
                ] as const).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className="px-4 py-1.5 rounded-full text-sm font-medium transition-all"
                    style={{
                      background: activeTab === tab.key ? '#FFFFFF' : 'transparent',
                      color: activeTab === tab.key ? '#17171C' : '#63636B',
                      boxShadow: activeTab === tab.key ? '0 1px 4px rgba(23,23,28,0.10)' : 'none',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Sort dropdown */}
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as typeof sortBy)}
                className="text-sm font-medium px-4 py-2 rounded-full outline-none cursor-pointer appearance-none pr-8 relative"
                style={{ background: '#F6F6F4', border: '1px solid #E8E8EC', color: '#17171C' }}
              >
                <option value="total">Total price</option>
                <option value="fee_dollar">Delivery fee ($)</option>
                <option value="fee_pct">Delivery fee (%)</option>
                <option value="fastest">Fastest delivery</option>
              </select>
            </div>
          </div>

          {/* Cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {filteredCards.map(card => (
              <DealCard
                key={card.id}
                card={card}
                saved={savedCards.has(card.id)}
                onToggleSave={() => toggleSave(card.id)}
              />
            ))}
          </div>

          {/* Show more */}
          {activeTab === 'all' && (
            <div className="flex justify-center mt-10">
              <button
                className="px-8 py-3 rounded-full text-sm font-semibold transition-all"
                style={{ border: '1.5px solid #17171C', color: '#17171C', background: 'transparent' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#17171C'; e.currentTarget.style.color = '#FFFFFF' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#17171C' }}
              >
                Show 40 more deals
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="px-8 xl:px-16 py-16 md:py-24" style={{ background: '#F6F6F4' }}>
        <div className="max-w-[1280px] mx-auto">
          <div className="text-center mb-14">
            <h2
              className="font-display font-semibold mb-3"
              style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 34, color: '#17171C', letterSpacing: '-0.02em' }}
            >
              Three apps, one search
            </h2>
            <p className="text-base max-w-md mx-auto" style={{ color: '#63636B' }}>
              No switching tabs. No mental math. Just the honest total before you commit.
            </p>
          </div>

          {/* Steps */}
          <div className="grid md:grid-cols-3 gap-6 mb-16">
            {[
              {
                num: '01',
                title: 'Tell us where and what',
                body: 'Enter your address and what you\'re craving — a dish, a cuisine, or a specific restaurant.',
              },
              {
                num: '02',
                title: 'See the real totals',
                body: 'We fetch live prices from all three apps and add up fees, taxes, and any active promos.',
              },
              {
                num: '03',
                title: 'Order in the cheapest app',
                body: 'One tap takes you straight to the cheapest option. No copy-pasting, no price hunting.',
              },
            ].map(step => (
              <div
                key={step.num}
                className="p-7 rounded-[16px] flex flex-col gap-4"
                style={{ background: '#FFFFFF', border: '1px solid #E8E8EC' }}
              >
                <span
                  className="font-display font-semibold text-4xl"
                  style={{ fontFamily: 'Bricolage Grotesque, sans-serif', color: '#E8E8EC', lineHeight: 1 }}
                >
                  {step.num}
                </span>
                <h3 className="text-base font-semibold leading-snug" style={{ color: '#17171C' }}>{step.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: '#63636B' }}>{step.body}</p>
              </div>
            ))}
          </div>

          {/* Big stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 rounded-[24px] overflow-hidden" style={{ border: '1px solid #E8E8EC' }}>
            {[
              { value: '$6.40', label: 'average saved per order', sub: 'Across all platforms and cuisines' },
              { value: '4 min', label: 'average time saved', sub: 'vs. checking each app manually' },
              { value: '62%', label: 'of orders had a cheaper app', sub: 'than the one people opened first' },
            ].map((s, i) => (
              <div
                key={i}
                className="flex flex-col items-center text-center px-8 py-10 gap-2"
                style={{ background: '#FFFFFF', borderRight: i < 2 ? '1px solid #E8E8EC' : 'none' }}
              >
                <span
                  className="font-display font-semibold"
                  style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 44, color: '#0F5C3F', letterSpacing: '-0.03em', lineHeight: 1 }}
                >
                  {s.value}
                </span>
                <span className="text-sm font-semibold" style={{ color: '#17171C' }}>{s.label}</span>
                <span className="text-xs" style={{ color: '#63636B' }}>{s.sub}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Price alerts ── */}
      <section className="px-8 xl:px-16 py-16 md:py-24">
        <div className="max-w-[1280px] mx-auto">
          <div
            className="grid md:grid-cols-2 gap-10 items-center px-10 py-10 rounded-[24px]"
            style={{ border: '1.5px solid #E8E8EC' }}
          >
            <div>
              <h2
                className="font-display font-semibold mb-3"
                style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 28, color: '#17171C', letterSpacing: '-0.02em' }}
              >
                Get a text when your usual spots go on sale
              </h2>
              <p className="text-base" style={{ color: '#63636B' }}>
                Tell us your go-to restaurants, and we'll ping you the moment a deal lands — so you order on the cheap day, not the expensive one.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <div
                className="flex items-center rounded-full overflow-hidden p-1.5 gap-1"
                style={{ background: '#FFFFFF', border: '1.5px solid #E8E8EC' }}
              >
                <div className="flex-1 flex items-center gap-3 px-4">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#63636B" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.9 1.11h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  <input
                    className="flex-1 py-2 text-sm outline-none bg-transparent"
                    style={{ color: '#17171C' }}
                    placeholder="Your phone number"
                    value={alertPhone}
                    onChange={e => setAlertPhone(e.target.value)}
                  />
                </div>
                <button
                  className="flex-shrink-0 px-5 py-2.5 rounded-full text-sm font-semibold transition-all"
                  style={{ background: '#0F5C3F', color: '#FFFFFF' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#0a4a32' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#0F5C3F' }}
                >
                  Turn on alerts
                </button>
              </div>
              <p className="text-xs px-2" style={{ color: '#63636B' }}>
                Two or three texts a week at most. Reply STOP anytime.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        className="px-8 xl:px-16 py-8 flex flex-col sm:flex-row items-center justify-between gap-4"
        style={{ borderTop: '1px solid #E8E8EC' }}
      >
        <p className="text-xs text-center sm:text-left" style={{ color: '#63636B' }}>
          © 2026 Platter. Not affiliated with or endorsed by DoorDash, Uber Eats, or Grubhub.
        </p>
        <nav className="flex items-center gap-6">
          {['About', 'Privacy', 'Terms', 'Contact'].map(link => (
            <a
              key={link}
              href="#"
              className="text-xs transition-colors"
              style={{ color: '#63636B', textDecoration: 'none' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#17171C' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#63636B' }}
            >
              {link}
            </a>
          ))}
        </nav>
      </footer>

    </div>
  )
}
