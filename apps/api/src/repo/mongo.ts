/**
 * Mongoose-backed repository. Documents are read with .lean() and mapped to
 * the plain domain types so routes never see ObjectIds.
 */
import { Types } from 'mongoose';
import {
  MenuItemModel,
  OfferModel,
  PlatformModel,
  PriceSnapshotModel,
  PromoModel,
  RestaurantModel,
  UserModel,
  type DietaryTag,
  type MenuItem,
  type Offer,
  type Platform,
  type PlatformSlug,
  type PriceSnapshot,
  type Promo,
  type Restaurant,
  type SubscriptionSlug,
  type User,
} from '../models';
import { servesZip, type NewRestaurant, type NewUser, type Repository, type RestaurantFilter } from './types';

const oid = (v: unknown): string => String(v);
const isObjectId = (s: string): boolean => Types.ObjectId.isValid(s) && String(new Types.ObjectId(s)) === s;
const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDoc = Record<string, any>;

/**
 * Scraped money (menuItems prices, restaurants.sampleItem.menuPrice) is a MIXED
 * column: ingest/apifyPlatforms.ts parseMoney() only divided a raw value by 100
 * when it was an integer > 1000, so $1.00-$10.00 items are still raw integer
 * cents (738), fractional raw cents from Uber Eats were never divided (1567.3
 * for a lasagna), and the rest are already dollars (11.95, 22). Measured over
 * all 133,611 stored menu prices: 0 integers > 1000, integers in [100,1000] are
 * a flat $1-$10 cents distribution, and non-integers >= 400 are all cents (next
 * real value below is a $356 catering tray). Output range after repair: $1-$356.
 * ponytail: read-time repair fitted to the frozen scrape; ~6 fractional-cents
 * rows under 400 (e.g. "Kimchi Salad" 337.5) overlap real catering prices and
 * pass through. The durable fix is a guarded backfill, then this is identity.
 */
export const dollars = (n: unknown): number => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return v >= (Number.isInteger(v) ? 100 : 400) ? Math.round(v) / 100 : v;
};

const toRestaurant = (d: AnyDoc): Restaurant => ({
  id: oid(d._id),
  slug: d.slug,
  name: d.name,
  address: d.address,
  cuisine: d.cuisine ?? [],
  dietaryTags: (d.dietaryTags ?? []) as DietaryTag[],
  rating: d.rating,
  ratingCount: d.ratingCount ?? 0,
  priceTier: d.priceTier,
  location: { zip: d.location?.zip, geo: { lat: d.location?.geo?.lat, lng: d.location?.geo?.lng } },
  platformIds: Object.fromEntries(
    Object.entries(d.platformIds ?? {}).filter(([, v]) => typeof v === 'string' && v.length > 0),
  ) as Partial<Record<PlatformSlug, string>>,
  // Same mixed units as menuItems: 13 rows hold cents (Kung Fu Tea 819), which
  // cartForRestaurant() would otherwise price as an $819 subtotal.
  sampleItem: { name: d.sampleItem?.name, menuPrice: dollars(d.sampleItem?.menuPrice) },
  imageUrl: d.imageUrl ?? undefined,
});

const toMenuItem = (d: AnyDoc): MenuItem => ({
  id: oid(d._id),
  restaurantId: oid(d.restaurantId),
  name: d.name,
  description: d.description ?? undefined,
  category: d.category || 'Menu',
  basePrice: dollars(d.basePrice),
  platformPrices: Object.fromEntries(
    Object.entries(d.platformPrices ?? {})
      .filter(([, v]) => typeof v === 'number')
      .map(([k, v]) => [k, dollars(v)]),
  ) as Partial<Record<PlatformSlug, number>>,
  observedPlatform: d.observedPlatform ?? undefined,
  dietaryTags: (d.dietaryTags ?? []) as DietaryTag[],
  calories: typeof d.calories === 'number' ? d.calories : undefined,
  available: d.available !== false,
});

const toPlatform = (d: AnyDoc): Platform => ({
  id: oid(d._id),
  slug: d.slug,
  name: d.name,
  brandColor: d.brandColor,
  subscriptionName: d.subscriptionName,
  subscriptionSlug: d.subscriptionSlug,
  subscriptionPerks: d.subscriptionPerks ?? [],
});

const toPromo = (d: AnyDoc): Promo => ({
  id: oid(d._id),
  platformSlug: d.platformSlug,
  code: d.code,
  description: d.description ?? undefined,
  rule: { type: d.rule.type, value: d.rule.value ?? 0, minSubtotal: d.rule.minSubtotal ?? 0 },
  startsAt: new Date(d.startsAt),
  endsAt: new Date(d.endsAt),
});

const toOffer = (d: AnyDoc): Offer => ({
  id: oid(d._id),
  restaurantId: oid(d.restaurantId),
  platformSlug: d.platformSlug,
  platformRestaurantId: d.platformRestaurantId ?? undefined,
  subtotal: d.subtotal,
  serviceFee: d.serviceFee,
  deliveryFee: d.deliveryFee,
  smallOrderFee: d.smallOrderFee ?? 0,
  tax: d.tax,
  total: d.total,
  etaMin: d.etaMin,
  etaMax: d.etaMax,
  promo: d.promo
    ? { code: d.promo.code, description: d.promo.description ?? undefined, rule: d.promo.rule, startsAt: new Date(d.promo.startsAt), endsAt: new Date(d.promo.endsAt) }
    : undefined,
  fetchedAt: new Date(d.fetchedAt),
  ...(d.locationUnverified ? { locationUnverified: true } : {}),
  ...(d.deepLink ? { deepLink: d.deepLink } : {}),
  ...(d.representativeItem?.name ? { representativeItem: { name: d.representativeItem.name, price: d.representativeItem.price } } : {}),
});

const toSnapshot = (d: AnyDoc): PriceSnapshot => ({
  id: oid(d._id),
  restaurantId: oid(d.restaurantId),
  platformSlug: d.platformSlug,
  total: d.total,
  deliveryFee: d.deliveryFee,
  etaMin: d.etaMin,
  promoApplied: !!d.promoApplied,
  capturedAt: new Date(d.capturedAt),
  source: d.source ?? 'modelled',
});

const toUser = (d: AnyDoc): User => ({
  id: oid(d._id),
  zip: d.zip,
  subscriptions: (d.subscriptions ?? []) as SubscriptionSlug[],
  dietaryDefaults: (d.dietaryDefaults ?? []) as DietaryTag[],
  savedRestaurantIds: (d.savedRestaurantIds ?? []).map(oid),
  history: (d.history ?? []).map((h: AnyDoc) => ({
    restaurantId: oid(h.restaurantId),
    platformSlug: h.platformSlug,
    total: h.total,
    orderedAt: new Date(h.orderedAt),
  })),
  createdAt: d.createdAt ? new Date(d.createdAt) : undefined,
});

export class MongoRepository implements Repository {
  readonly kind = 'mongo' as const;

  async listPlatforms(): Promise<Platform[]> {
    const docs = await PlatformModel.find().sort({ slug: 1 }).lean();
    return docs.map(toPlatform);
  }

  async listRestaurants(filter: RestaurantFilter = {}): Promise<Restaurant[]> {
    const q: AnyDoc = {};
    if (filter.minRating !== undefined) q.rating = { $gte: filter.minRating };
    if (filter.cuisine) q.cuisine = { $elemMatch: { $regex: escapeRegex(filter.cuisine), $options: 'i' } };
    if (filter.dietary && filter.dietary.length > 0) q.dietaryTags = { $all: filter.dietary.map((d) => d.toLowerCase()) };
    if (filter.q) {
      const re = { $regex: escapeRegex(filter.q), $options: 'i' };
      q.$or = [{ name: re }, { cuisine: { $elemMatch: re } }, { 'sampleItem.name': re }];
    }
    // zip is a radius-ish rule (servesZip), so apply it in memory after the indexed filters
    const docs = await RestaurantModel.find(q).sort({ rating: -1, name: 1 }).lean();
    return docs.map(toRestaurant).filter((r) => servesZip(r.location.zip, filter.zip));
  }

  async getRestaurant(idOrSlug: string): Promise<Restaurant | null> {
    const doc = isObjectId(idOrSlug)
      ? await RestaurantModel.findById(idOrSlug).lean()
      : await RestaurantModel.findOne({ slug: idOrSlug }).lean();
    return doc ? toRestaurant(doc) : null;
  }

  async upsertRestaurant(input: NewRestaurant): Promise<Restaurant> {
    const { platformIds, ...fields } = input;
    const set: AnyDoc = { ...fields };
    for (const [platform, id] of Object.entries(platformIds)) if (id) set[`platformIds.${platform}`] = id;
    const doc = await RestaurantModel.findOneAndUpdate({ slug: input.slug }, { $set: set }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
    return toRestaurant(doc as AnyDoc);
  }

  async listMenuItems(restaurantId: string, opts: { limit?: number; category?: string } = {}): Promise<MenuItem[]> {
    if (!isObjectId(restaurantId)) return [];
    const q: AnyDoc = { restaurantId };
    if (opts.category) q.category = { $regex: `^${escapeRegex(opts.category)}$`, $options: 'i' };
    const docs = await MenuItemModel.find(q).sort({ category: 1, name: 1 }).limit(opts.limit ?? 500).lean();
    return docs.map(toMenuItem);
  }

  async listActivePromos(now: Date, platformSlug?: string): Promise<Promo[]> {
    const q: AnyDoc = { startsAt: { $lte: now }, endsAt: { $gte: now } };
    if (platformSlug) q.platformSlug = platformSlug;
    const docs = await PromoModel.find(q).sort({ endsAt: 1 }).lean();
    return docs.map(toPromo);
  }

  async getLatestOffers(restaurantId: string): Promise<Offer[]> {
    if (!isObjectId(restaurantId)) return [];
    const docs = await OfferModel.find({ restaurantId }).sort({ fetchedAt: -1 }).limit(30).lean();
    const seen = new Set<string>();
    const out: Offer[] = [];
    for (const d of docs) {
      if (seen.has(d.platformSlug)) continue;
      seen.add(d.platformSlug);
      out.push(toOffer(d));
    }
    return out;
  }

  async saveOffer(offer: Offer): Promise<Offer> {
    const { id: _ignored, ...rest } = offer;
    const doc = await OfferModel.create({ ...rest, restaurantId: new Types.ObjectId(offer.restaurantId) });
    return toOffer(doc.toObject());
  }

  async appendSnapshot(snapshot: PriceSnapshot): Promise<void> {
    const { id: _ignored, ...rest } = snapshot;
    await PriceSnapshotModel.updateOne(
      { restaurantId: new Types.ObjectId(snapshot.restaurantId), platformSlug: snapshot.platformSlug, capturedAt: snapshot.capturedAt },
      { $setOnInsert: { ...rest, restaurantId: new Types.ObjectId(snapshot.restaurantId) } },
      { upsert: true },
    );
  }

  async listSnapshots(restaurantId: string, since: Date, until?: Date): Promise<PriceSnapshot[]> {
    if (!isObjectId(restaurantId)) return [];
    const capturedAt: AnyDoc = { $gte: since };
    if (until) capturedAt.$lte = until;
    // Partner-API rows carry a fee, not a checkout total (see ingest/liveQuotes.ts),
    // so they are dropped. What remains still mixes mock-adapter 'modelled' rows
    // with one-off apify-* rows; each keeps its `source` so callers can tell.
    // $nin also keeps rows written before `source` existed.
    const source = { $nin: ['doordash-drive', 'uber-direct'] };
    const docs = await PriceSnapshotModel.find({ restaurantId, capturedAt, source }).sort({ capturedAt: 1 }).lean();
    return docs.map(toSnapshot);
  }

  async createUser(input: NewUser): Promise<User> {
    const doc = await UserModel.create({
      zip: input.zip,
      subscriptions: input.subscriptions ?? [],
      dietaryDefaults: input.dietaryDefaults ?? [],
      savedRestaurantIds: (input.savedRestaurantIds ?? []).filter(isObjectId).map((s) => new Types.ObjectId(s)),
      history: input.history ?? [],
    });
    return toUser(doc.toObject());
  }

  async getUser(id: string): Promise<User | null> {
    if (!isObjectId(id)) return null;
    const doc = await UserModel.findById(id).lean();
    return doc ? toUser(doc) : null;
  }
}
