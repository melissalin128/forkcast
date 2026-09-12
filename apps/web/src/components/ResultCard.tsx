import { Link } from 'react-router-dom';
import { bestOffer, cardSentence, money, platformName, ratingCount } from '../lib/analysis';
import type { Restaurant } from '../types';
import { PlatformDot } from './PlatformDot';

interface Props {
  restaurant: Restaurant;
  compact?: boolean;
}

/**
 * Principle zero: the restaurant, the cheapest platform with its delivered
 * total, and one sentence. Nothing else.
 */
export function ResultCard({ restaurant: r, compact = false }: Props) {
  const best = bestOffer(r);
  const why = cardSentence(r);
  const meta = [
    r.cuisine[0],
    ...r.dietaryTags.filter((t) => (t === 'Halal' || t === 'Vegan options') && t !== r.cuisine[0]).slice(0, 1),
  ];

  if (!best) return null;

  if (compact) {
    return (
      <Link to={`/r/${r.id}`} className="card rcard rcard--compact reveal" data-card>
        <div className="rcard__art" style={{ background: r.image }} />
        <div className="rcard__body">
          <div className="rcard__top">
            <div style={{ minWidth: 0 }}>
              <div className="rcard__name">{r.name}</div>
              <div className="rcard__meta">
                {r.cuisine[0]} · <span className="mono">{r.rating.toFixed(1)}</span> ·{' '}
                <span className="mono">{r.distanceMi} mi</span>
              </div>
            </div>
            <span className="rcard__total" data-price={best.total}>
              {money(best.total)}
            </span>
          </div>
          <div className="rcard__answer">
            <span className="rcard__where">
              <PlatformDot slug={best.platformSlug} />
              {platformName(best.platformSlug)} · <span className="mono">{best.etaMin} min</span>
            </span>
            <span className={`rcard__why ${why.tone}`}>{why.text}</span>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link to={`/r/${r.id}`} className="card rcard reveal" data-card>
      <div className="rcard__art" style={{ background: r.image }} />
      <div className="rcard__body">
        <div>
          <div className="rcard__name">{r.name}</div>
          <div className="rcard__meta">
            {meta.join(' · ')} · <span className="mono">{r.rating.toFixed(1)}</span> (
            <span className="mono">{ratingCount(r.ratingCount)}</span>) ·{' '}
            <span className="mono">{r.distanceMi} mi</span>
          </div>
        </div>
        <div className="rcard__answer">
          <div style={{ minWidth: 0 }}>
            <span className="rcard__where">
              <PlatformDot slug={best.platformSlug} size="md" />
              Cheapest on {platformName(best.platformSlug)}
            </span>
            <div className={`rcard__why ${why.tone}`}>{why.text}</div>
          </div>
          <div className="rcard__right">
            <span className="rcard__total" data-price={best.total}>
              {money(best.total)}
            </span>
            <span className="rcard__eta">
              delivered · <span className="mono">{best.etaMin} min</span>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
