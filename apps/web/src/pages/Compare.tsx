import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getHistory, getRestaurant } from '../api/client';
import { BottomTabs } from '../components/BottomTabs';
import { AlertIcon, ChevronDown } from '../components/Icons';
import { PlatformDot } from '../components/PlatformDot';
import { PlatformLedger } from '../components/PlatformLedger';
import { PriceHistory } from '../components/PriceHistory';
import { TopBar } from '../components/TopBar';
import { PLATFORMS, PROMOS } from '../data/mock';
import {
  bestOffer,
  bestTime,
  comparisonSentence,
  deepLink,
  endsIn,
  money,
  platformName,
  windowPlain,
} from '../lib/analysis';
import { countUpPrices, slideIn } from '../lib/motion';
import type { Offer, PriceSnapshot, Promo, Restaurant } from '../types';

export function Compare() {
  const { id = '' } = useParams();
  const [restaurant, setRestaurant] = useState<Restaurant | null | undefined>(undefined);
  const [snapshots, setSnapshots] = useState<PriceSnapshot[]>([]);
  const [open, setOpen] = useState(false);
  const [revealKey, setRevealKey] = useState(0);
  const answerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setRestaurant(undefined);
    setSnapshots([]);
    setOpen(false);
    setRevealKey(0);
    Promise.all([getRestaurant(id), getHistory(id)]).then(([r, h]) => {
      if (!alive) return;
      setRestaurant(r.data ?? null);
      setSnapshots(h.data);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const best = restaurant ? bestOffer(restaurant) : undefined;

  // Answer block reveal: count the headline total up from $0.
  useEffect(() => {
    if (!restaurant || !best) return;
    const stopSlide = slideIn(Array.from(answerRef.current?.querySelectorAll('.reveal') ?? []), 60);
    const stopCount = countUpPrices(answerRef.current, 120);
    return () => {
      stopSlide();
      stopCount();
    };
  }, [restaurant, best]);

  const timing = useMemo(
    () => (best ? bestTime(snapshots, best.platformSlug) : null),
    [snapshots, best],
  );

  if (restaurant === undefined) {
    return (
      <div className="page has-tabbar">
        <TopBar crumb="Loading…" />
        <div className="notfound">Checking three apps…</div>
        <BottomTabs />
      </div>
    );
  }

  if (!restaurant || !best) {
    return (
      <div className="page has-tabbar">
        <TopBar crumb="Not found" />
        <div className="notfound">
          We could not find that restaurant near you. <Link to="/browse">Back to the list</Link>.
        </div>
        <BottomTabs />
      </div>
    );
  }

  const r = restaurant;
  const bestName = platformName(best.platformSlug);
  const deals = collectDeals(r, best);

  return (
    <div className="page has-tabbar">
      <TopBar crumb={r.name} />

      <div className="compare">
        <div className="compare__main">
          <header className="rhead">
            <div>
              <h1 className="rhead__name">{r.name}</h1>
              <span className="rhead__meta">
                {r.cuisine.join(' · ')} · <span className="mono">{r.rating.toFixed(1)}</span> (
                <span className="mono">{r.ratingCount.toLocaleString()}</span>) ·{' '}
                <span className="mono">{r.distanceMi} mi</span> · Open until {r.openUntil}
              </span>
            </div>
            <button type="button" className="btn" onClick={() => undefined}>
              <AlertIcon />
              <span>
                Alert me under <span className="mono">$20</span>
              </span>
            </button>
          </header>

          <section className="card answer" ref={answerRef} aria-label="Cheapest right now">
            <div className="answer__left">
              <span className="label reveal">Cheapest right now</span>
              <span className="answer__row reveal">
                <PlatformDot slug={best.platformSlug} size="lg" />
                <span className="answer__platform">{bestName}</span>
                <span className="answer__total" data-price={best.total}>
                  {money(best.total)}
                </span>
              </span>
              <span className="answer__why reveal">
                {comparisonSentence(r, ' tonight')}, at your door in about{' '}
                <span className="mono">{best.etaMin} minutes</span>.
              </span>
            </div>
            <a
              className="btn btn--accent btn--big reveal"
              href={deepLink(best.platformSlug, r)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Order on {bestName}
            </a>
          </section>

          <details
            className="howto"
            open={open}
            onToggle={(e) => {
              const isOpen = (e.currentTarget as HTMLDetailsElement).open;
              setOpen(isOpen);
              if (isOpen) setRevealKey((k) => k + 1);
            }}
          >
            <summary>
              <ChevronDown size={16} />
              <span>See how we got this</span>
              <span className="howto__hint">· prices on all three apps and the last week</span>
            </summary>
            <div className="howto__body">
              <PlatformLedger restaurant={r} revealKey={revealKey} />

              <section className="card chart" aria-label="Price over the last week">
                <div className="chart__head">
                  <span className="label">Price over the last week</span>
                  <div className="legend">
                    {PLATFORMS.map((p) => (
                      <span key={p.slug}>
                        <i style={{ background: p.brandColor }} />
                        {p.name}
                      </span>
                    ))}
                  </div>
                </div>
                <PriceHistory snapshots={snapshots} highlight={best.platformSlug} band={timing?.best} />
                <p className="chart__plain" style={{ margin: 0 }}>
                  {timing
                    ? `Usually cheapest ${windowPlain(timing.best.dow, timing.best.hour)}, around ${money(timing.best.avg)} on ${bestName}. ${windowPlain(timing.worst.dow, timing.worst.hour)} is the priciest, around ${money(timing.worst.avg)}.`
                    : 'We will show the cheapest hours once we have a week of prices.'}
                </p>
              </section>
            </div>
          </details>
        </div>

        <aside className="compare__side">
          <section className="card side-card">
            <span className="label">Best time to order</span>
            {timing ? (
              <>
                <span className="side-card__big">{capitalize(windowPlain(timing.best.dow, timing.best.hour))}</span>
                <span className="side-card__text">
                  Usually around <span className="mono win">{money(timing.best.avg)}</span>
                  {timing.saving >= 0.5 ? (
                    <>
                      , about <span className="mono">{money(timing.saving)}</span> (
                      <span className="mono">{timing.savingPct}%</span>) less than tonight.
                    </>
                  ) : (
                    <>. Tonight is already about as cheap as it gets.</>
                  )}
                </span>
              </>
            ) : (
              <span className="side-card__text">We need a few more days of prices to say.</span>
            )}
          </section>

          <section className="card side-card" style={{ padding: 20 }}>
            <span className="label">Deals right now</span>
            {deals.length === 0 && <span className="deal deal--off">No deals on any app tonight.</span>}
            {deals.map((d) => (
              <span key={d.key} className={`deal${d.on ? '' : ' deal--off'}`}>
                <PlatformDot slug={d.slug} />
                <span>{d.text}</span>
              </span>
            ))}
          </section>
        </aside>
      </div>
      <BottomTabs />
    </div>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface Deal {
  key: string;
  slug: Promo['platformSlug'];
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
      text: `${platformName(o.platformSlug)}: ${money(o.promoDiscount)} off${
        o.promo.rule.type === 'percent' ? ` (${o.promo.rule.value}%)` : ''
      }, ${applied ? 'already included above' : 'included in its total'} · ${endsIn(o.promo.endsAt)}`,
    });
  }

  // Platform-wide promos the user cannot use tonight, only for apps that list this place.
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
    const what =
      p.rule.type === 'percent'
        ? `${p.rule.value}% off (${dollars})`
        : p.rule.type === 'flat'
          ? `${dollars} off`
          : 'free delivery';
    deals.push({
      key: p.code,
      slug: p.platformSlug,
      on: false,
      text: `${platformName(p.platformSlug)}: ${what} ${p.note ? `— ${p.note}` : 'not available to you'}`,
    });
  }
  return deals;
}
