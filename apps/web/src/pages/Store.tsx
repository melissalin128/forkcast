import { useEffect, useMemo, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { BottomTabs } from '../components/BottomTabs';
import { CompareStrip } from '../components/CompareStrip';
import { categoryIcon, ExternalIcon, StarIcon } from '../components/Icons';
import { PlatformDot } from '../components/PlatformDot';
import { PlatformLedger } from '../components/PlatformLedger';
import { PriceHistory } from '../components/PriceHistory';
import { TopBar } from '../components/TopBar';
import { PLATFORMS, PROMOS } from '../data/mock';
import { useStore } from '../hooks/useData';
import {
  bestOffer,
  bestTime,
  cheapestMenuPlatform,
  deepLink,
  endsIn,
  menuFor,
  money,
  platformName,
  ratingCount,
  savingsTail,
  windowLabel,
  windowPlain,
} from '../lib/analysis';
import { countUpPrices } from '../lib/motion';
import type { Offer, PlatformSlug, Restaurant } from '../types';

type Tab = 'menu' | 'prices';

export function Store() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'prices' ? 'prices' : 'menu';
  const { restaurant, snapshots } = useStore(id);
  const pricesRef = useRef<HTMLDivElement>(null);

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    if (t === 'prices') next.set('tab', 'prices');
    else next.delete('tab');
    setParams(next, { replace: true });
  };

  const best = restaurant ? bestOffer(restaurant) : undefined;
  const timing = useMemo(() => (best ? bestTime(snapshots, best.platformSlug) : null), [snapshots, best]);

  // The one animation: prices count up when the Prices tab opens.
  useEffect(() => {
    if (tab !== 'prices' || !restaurant) return;
    return countUpPrices(pricesRef.current);
  }, [tab, restaurant]);

  if (restaurant === undefined) {
    return (
      <div className="page">
        <TopBar back={{ title: 'Loading…' }} />
        <div className="notice">Checking three apps…</div>
        <BottomTabs />
      </div>
    );
  }

  if (!restaurant || !best) {
    return (
      <div className="page">
        <TopBar back={{ title: 'Not found' }} />
        <div className="notice">
          We could not find that place near you. <Link to="/">Back home</Link>.
        </div>
        <BottomTabs />
      </div>
    );
  }

  const r = restaurant;
  const Icon = categoryIcon(r.category);
  const bestName = platformName(best.platformSlug);

  return (
    <div className="page page--cta">
      <TopBar back={{ title: r.name }} />

      <div className="cover" style={{ background: r.image }}>
        <Icon size={56} stroke="rgba(255,255,255,0.85)" strokeWidth={1.4} />
      </div>

      <header className="store">
        <h1 className="store__name">{r.name}</h1>
        <p className="store__meta">
          <span>
            <StarIcon stroke="var(--fg)" /> <span className="mono">{r.rating.toFixed(1)}</span> ({ratingCount(r.ratingCount)})
          </span>
          <span>{r.cuisine.join(', ')}</span>
          <span className="mono">{r.distanceMi} mi</span>
          <span className="mono">
            {best.etaMin}–{best.etaMax} min
          </span>
          <span>open until {r.openUntil}</span>
        </p>
        <CompareStrip restaurant={r} />
        <p className="store__line">
          <strong>Cheapest on {bestName}</strong> · {savingsTail(r)}
        </p>
      </header>

      <div className="tabs" role="tablist" aria-label="Store sections">
        <button type="button" role="tab" aria-selected={tab === 'menu'} className={`tabs__tab${tab === 'menu' ? ' tabs__tab--active' : ''}`} onClick={() => setTab('menu')}>
          Menu
        </button>
        <button type="button" role="tab" aria-selected={tab === 'prices'} className={`tabs__tab${tab === 'prices' ? ' tabs__tab--active' : ''}`} onClick={() => setTab('prices')}>
          Prices
        </button>
      </div>

      {tab === 'menu' ? (
        <MenuTab restaurant={r} />
      ) : (
        <div className="prices" ref={pricesRef} role="tabpanel">
          <PlatformLedger restaurant={r} />

          <section className="card" aria-label="Price over the last 7 days">
            <div className="card__head">
              <h3 className="card__title">Price over the last 7 days</h3>
              <div className="legend">
                {PLATFORMS.map((p) => (
                  <span key={p.slug} className="legend__item">
                    <PlatformDot slug={p.slug} />
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
            <PriceHistory snapshots={snapshots} highlight={best.platformSlug} band={timing?.best} />
            <p className="card__foot">
              {timing
                ? `${bestName} was usually cheapest ${windowPlain(timing.best.dow, timing.best.hour)} (around ${money(timing.best.avg)}) and priciest ${windowPlain(timing.worst.dow, timing.worst.hour)} (around ${money(timing.worst.avg)}).`
                : 'We will show the cheapest hours once we have a week of prices.'}
            </p>
          </section>

          <section className="card" aria-label="Best time to order">
            <h3 className="card__title">Best time to order</h3>
            {timing ? (
              <p className="oneliner">
                <strong>{windowLabel(timing.best.dow, timing.best.hour)}</strong> — usually{' '}
                <span className="mono win">{money(timing.best.avg)}</span> on {bestName}
                {timing.saving >= 0.5 ? (
                  <>
                    , about <span className="mono">{money(timing.saving)}</span> ({timing.savingPct}%) less than now.
                  </>
                ) : (
                  <>. Right now is already about as cheap as it gets.</>
                )}
              </p>
            ) : (
              <p className="oneliner">We need a few more days of prices to say.</p>
            )}
          </section>

          <section className="card" aria-label="Deals right now">
            <h3 className="card__title">Deals right now</h3>
            <DealsList restaurant={r} best={best} />
          </section>
        </div>
      )}

      <div className="cta">
        <a className="btn btn--accent btn--cta" href={deepLink(best.platformSlug, r)} target="_blank" rel="noopener noreferrer">
          <span>
            Order on {bestName} · <span className="mono">{money(best.total)}</span>
          </span>
          <ExternalIcon />
        </a>
      </div>

      <BottomTabs />
    </div>
  );
}

// ---------------------------------------------------------------------------

function MenuTab({ restaurant: r }: { restaurant: Restaurant }) {
  const items = menuFor(r);
  const listed = PLATFORMS.filter((p) => r.offers.some((o) => o.platformSlug === p.slug));
  const cols = PLATFORMS;
  return (
    <div className="menu" role="tabpanel">
      <div className="menu__row menu__row--head" aria-hidden="true">
        <span>Item</span>
        {cols.map((p) => (
          <span key={p.slug} className="menu__plat">
            <PlatformDot slug={p.slug} />
            {p.name.replace('Uber Eats', 'Uber')}
          </span>
        ))}
      </div>
      {items.map((item) => {
        const cheapest = listed.length > 1 ? cheapestMenuPlatform(item) : undefined;
        return (
          <div key={item.name} className="menu__row">
            <span className="menu__name">{item.name}</span>
            {cols.map((p) => {
              const v = item.prices[p.slug];
              return (
                <span key={p.slug} className={`menu__price mono${v === undefined ? ' menu__price--none' : ''}${cheapest === p.slug ? ' menu__price--best' : ''}`}>
                  {v === undefined ? '—' : money(v)}
                </span>
              );
            })}
          </div>
        );
      })}
      <p className="card__foot menu__foot">
        Menu prices before fees, tax and tip. Fees change the answer — see the Prices tab.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface Deal {
  key: string;
  slug: PlatformSlug;
  text: string;
  on: boolean;
}

/** One plain line per promo: applied ones first, then the ones you can't use. */
function collectDeals(r: Restaurant, best: Offer): Deal[] {
  const deals: Deal[] = [];
  const seen = new Set<string>();

  for (const o of r.offers) {
    if (!o.promo || o.promoDiscount <= 0) continue;
    seen.add(o.promo.code);
    const applied = o.platformSlug === best.platformSlug;
    deals.push({
      key: o.promo.code,
      slug: o.platformSlug,
      on: true,
      text: `${money(o.promoDiscount)} off${o.promo.rule.type === 'percent' ? ` (${o.promo.rule.value}%)` : ''} with ${o.promo.code}, ${
        applied ? 'included in the cheapest total' : 'included in its total'
      } · ${endsIn(o.promo.endsAt)}`,
    });
  }

  for (const p of Object.values(PROMOS)) {
    if (seen.has(p.code) || p.eligible) continue;
    const offer = r.offers.find((o) => o.platformSlug === p.platformSlug);
    if (!offer) continue;
    const dollars =
      p.rule.type === 'percent'
        ? money(Math.round(offer.subtotal * p.rule.value) / 100)
        : p.rule.type === 'flat'
          ? money(p.rule.value)
          : money(offer.deliveryFee);
    const what = p.rule.type === 'percent' ? `${p.rule.value}% off (${dollars})` : p.rule.type === 'flat' ? `${dollars} off` : 'free delivery';
    deals.push({ key: p.code, slug: p.platformSlug, on: false, text: `${what} — ${p.note ?? 'not available to you'}` });
  }
  return deals;
}

function DealsList({ restaurant, best }: { restaurant: Restaurant; best: Offer }) {
  const deals = collectDeals(restaurant, best);
  if (deals.length === 0) return <p className="oneliner muted">No deals on any app right now.</p>;
  return (
    <ul className="deals">
      {deals.map((d) => (
        <li key={d.key} className={`deal${d.on ? '' : ' deal--off'}`}>
          <PlatformDot slug={d.slug} />
          <span>
            <strong>{platformName(d.slug)}</strong> · {d.text}
          </span>
        </li>
      ))}
    </ul>
  );
}
