import { useEffect, useMemo, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CompareStrip } from '../components/CompareStrip';
import { ExternalIcon, StarIcon } from '../components/Icons';
import { Photo } from '../components/Photo';
import { PlatformLedger } from '../components/PlatformLedger';
import { PriceHistory } from '../components/PriceHistory';
import { TopBar } from '../components/TopBar';
import { PLATFORMS } from '../data/mock';
import { useStore } from '../hooks/useData';
import {
  bestOffer,
  bestTime,
  cheapestMenuPlatform,
  deepLink,
  etaRange,
  menuFor,
  money,
  platformName,
  ratingCount,
  savingsTail,
  windowLabel,
} from '../lib/analysis';
import { countUpPrices } from '../lib/motion';
import { restaurantPhoto } from '../lib/photos';
import type { Restaurant } from '../types';

type Tab = 'menu' | 'prices';

/** No bottom tab bar here: the sticky "Order on …" button is the only bottom element. */
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
      <div className="page page--store">
        <TopBar back={{ title: 'Loading…' }} />
        <div className="notice">Checking three apps…</div>
      </div>
    );
  }

  if (!restaurant || !best) {
    return (
      <div className="page page--store">
        <TopBar back={{ title: 'Not found' }} />
        <div className="notice">
          We could not find that place near you. <Link to="/">Back home</Link>.
        </div>
      </div>
    );
  }

  const r = restaurant;
  const bestName = platformName(best.platformSlug);

  return (
    <div className="page page--store page--cta">
      <TopBar back={{ title: r.name }} />

      <Photo className="cover" src={restaurantPhoto(r)} fallback={r.image} iconSize={40} />

      <header className="store">
        <h1 className="store__name">{r.name}</h1>
        <p className="store__meta">
          <span>
            <StarIcon stroke="var(--fg)" /> <span className="num">{r.rating.toFixed(1)}</span> ({ratingCount(r.ratingCount)})
          </span>
          <span>{r.cuisine.join(', ')}</span>
          <span className="num">{r.distanceMi} mi</span>
          <span className="num">{etaRange(best)}</span>
          <span>open until {r.openUntil}</span>
        </p>
        <CompareStrip restaurant={r} />
        <p className="store__for">For {r.orderLabel}</p>
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
                    <span className="legend__line" style={{ background: p.brandColor }} />
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
            <PriceHistory snapshots={snapshots} highlight={best.platformSlug} band={timing?.best} />
            <p className="card__foot">
              {timing
                ? `Usually cheapest ${windowLabel(timing.best.dow, timing.best.hour)}, around ${money(timing.best.avg)}.`
                : 'We will show the cheapest hours once we have a week of prices.'}
            </p>
          </section>
        </div>
      )}

      <div className="cta">
        <a className="btn btn--accent btn--cta" href={deepLink(best.platformSlug, r)} target="_blank" rel="noopener noreferrer">
          <span>
            Order on {bestName} · <span className="num">{money(best.total)}</span>
          </span>
          <ExternalIcon />
        </a>
      </div>
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
                <span key={p.slug} className={`menu__price num${v === undefined ? ' menu__price--none' : ''}${cheapest === p.slug ? ' menu__price--best' : ''}`}>
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
