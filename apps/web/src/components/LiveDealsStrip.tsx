import type { Deal } from '../api/client';
import { PLATFORM_BY_SLUG } from '../data/mock';

interface Props {
  deals: Deal[];
  refreshedAt: string | null;
  totalActive: number;
}

const TYPE_WORD: Record<Deal['dealType'], string> = {
  free_delivery: 'Free delivery',
  reduced_delivery_fee: 'Lower delivery fee',
  percent_off: 'Percent off',
  dollar_off: 'Money off',
  bogo: 'Buy one, get one',
  item_discount: 'Item deal',
  promo_code: 'Promo code',
  other: 'Deal',
};

function collectedAgo(iso: string | null): string {
  if (!iso) return 'collected recently';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(minutes)) return 'collected recently';
  if (minutes < 1) return 'collected just now';
  if (minutes < 60) return `collected ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `collected ${hours}h ago`;
  return `collected ${Math.round(hours / 24)}d ago`;
}

/** What the deal is worth, only when the platform actually said so. */
function worth(deal: Deal): string | null {
  if (deal.savingsEstimated) return null;
  const v = deal.value;
  if (v?.percent !== undefined) return `${v.percent}% off`;
  if (v?.dollars !== undefined) return `$${v.dollars.toFixed(2).replace(/\.00$/, '')} off`;
  return null;
}

/**
 * Deals scraped from the delivery platforms, newest run first. Kept visually
 * distinct from DealsStrip, which shows the simulated demo promos: mixing real
 * and simulated evidence in one row would make neither trustworthy.
 */
export function LiveDealsStrip({ deals, refreshedAt, totalActive }: Props) {
  if (deals.length === 0) return null;

  return (
    <section className="deals deals--live" aria-label="Live deals near you">
      <div className="deals__head">
        <h3 className="deals__title">
          Live deals near you <span className="deals__badge">real</span>
        </h3>
        <span className="deals__sub">
          {totalActive} found on DoorDash · {collectedAgo(refreshedAt)}
        </span>
      </div>
      <div className="deals__row">
        {deals.map((deal) => {
          const platform = PLATFORM_BY_SLUG[deal.platform];
          const value = worth(deal);
          const href = deal.deepLink ?? undefined;
          const Card = href ? 'a' : 'div';
          return (
            <Card
              key={deal.id ?? `${deal.platformRestaurantId}-${deal.headline}`}
              {...(href ? { href, target: '_blank', rel: 'noreferrer noopener' } : {})}
              className="dealcard dealcard--live"
            >
              <span className="dealcard__plat" style={{ color: platform?.brandColor }}>
                {platform?.name ?? deal.platform}
              </span>
              <span className="dealcard__code">{deal.restaurantName}</span>
              <span className="dealcard__desc">{deal.headline}</span>
              <span className="dealcard__time">
                {[
                  deal.distanceMi === null ? null : `${deal.distanceMi.toFixed(1)} mi`,
                  value ?? TYPE_WORD[deal.dealType],
                  deal.minOrder === null ? null : `min $${deal.minOrder}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
