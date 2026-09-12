/**
 * Mongoose-backed repository. Documents are read with .lean() and mapped to
 * the plain domain types so routes never see ObjectIds.
 */
import { Types } from 'mongoose';
import {
  DealModel,
  OfferModel,
  PlatformModel,
  PriceSnapshotModel,
  PromoModel,
  RestaurantModel,
  ScrapeRunModel,
  UserModel,
  dealKey,
  type Deal,
  type DietaryTag,
  type NewDeal,
  type NewScrapeRun,
  type Offer,
  type Platform,
  type PlatformSlug,
  type PriceSnapshot,
  type Promo,
  type Restaurant,
  type ScrapeRun,
  type SubscriptionSlug,
  type User,
} from '../models';
import {
  servesZip,
  type DealFilter,
  type DealSeen,
  type DeactivateDealsOptions,
  type NewRestaurant,
  type NewUser,
  type Repository,
  type RestaurantFilter,
  type ScrapeRunFilter,
  type UpsertDealsResult,
} from './types';

const oid = (v: unknown): string => String(v);
const isObjectId = (s: string): boolean => Types.ObjectId.isValid(s) && String(new Types.ObjectId(s)) === s;
const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDoc = Record<string, any>;

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
  sampleItem: { name: d.sampleItem?.name, menuPrice: d.sampleItem?.menuPrice },
  imageUrl: d.imageUrl ?? undefined,
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

const stripUndefined = (o: AnyDoc): AnyDoc => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

const toDeal = (d: AnyDoc): Deal => ({
  id: oid(d._id),
  platform: d.platform,
  restaurantName: d.restaurantName,
  platformRestaurantId: d.platformRestaurantId,
  cuisine: d.cuisine ?? [],
  ...(d.geo && typeof d.geo.lat === 'number' && typeof d.geo.lng === 'number' ? { geo: { lat: d.geo.lat, lng: d.geo.lng } } : {}),
  ...(typeof d.distanceMi === 'number' ? { distanceMi: d.distanceMi } : {}),
  dealType: d.dealType,
  headline: d.headline,
  ...(d.value ? { value: stripUndefined(d.value) } : {}),
  ...(typeof d.minOrder === 'number' ? { minOrder: d.minOrder } : {}),
  ...(d.promoCode ? { promoCode: d.promoCode } : {}),
  addressKey: d.addressKey,
  ...(d.deepLink ? { deepLink: d.deepLink } : {}),
  firstSeenAt: new Date(d.firstSeenAt),
  lastSeenAt: new Date(d.lastSeenAt),
  ...(d.expiresAt ? { expiresAt: new Date(d.expiresAt) } : {}),
  isActive: !!d.isActive,
  ...(d.firstRunId ? { firstRunId: d.firstRunId } : {}),
  ...(d.lastRunId ? { lastRunId: d.lastRunId } : {}),
  ...(d.lastRunKind ? { lastRunKind: d.lastRunKind } : {}),
  ...(d.raw !== undefined && d.raw !== null ? { raw: d.raw } : {}),
});

const toScrapeRun = (d: AnyDoc): ScrapeRun => ({
  id: oid(d._id),
  platform: d.platform,
  addressKey: d.addressKey,
  kind: d.kind,
  ...(d.query ? { query: d.query } : {}),
  actorId: d.actorId,
  ...(d.apifyRunId ? { apifyRunId: d.apifyRunId } : {}),
  ...(d.datasetId ? { datasetId: d.datasetId } : {}),
  startedAt: new Date(d.startedAt),
  ...(d.finishedAt ? { finishedAt: new Date(d.finishedAt) } : {}),
  status: d.status,
  resultsReturned: d.resultsReturned ?? 0,
  dealsExtracted: d.dealsExtracted ?? 0,
  parseFailures: d.parseFailures ?? 0,
  estimatedCost: d.estimatedCost ?? 0,
  ...(typeof d.actualCost === 'number' ? { actualCost: d.actualCost } : {}),
  ...(d.error ? { error: d.error } : {}),
});

/** Optional Deal fields: absent in the parser output means "clear it" on update, mirroring the memory store. */
const DEAL_OPTIONAL_FIELDS = ['geo', 'distanceMi', 'value', 'minOrder', 'promoCode', 'deepLink', 'expiresAt', 'raw'] as const;

function scrapeRunQuery(f: ScrapeRunFilter): AnyDoc {
  const q: AnyDoc = {};
  if (f.status) q.status = Array.isArray(f.status) ? { $in: f.status } : f.status;
  if (f.kind) q.kind = f.kind;
  if (f.platform) q.platform = f.platform;
  if (f.addressKey) q.addressKey = f.addressKey;
  if (f.query !== undefined) q.query = f.query;
  if (f.since) q.startedAt = { $gte: f.since };
  return q;
}

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
    const docs = await PriceSnapshotModel.find({ restaurantId, capturedAt }).sort({ capturedAt: 1 }).lean();
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

  // --- deals layer ---

  async upsertDeals(deals: NewDeal[], seen: DealSeen): Promise<UpsertDealsResult> {
    // last write wins inside one batch, so two rows with the same key never race on the unique index
    const byKey = new Map<string, NewDeal>();
    for (const d of deals) byKey.set(dealKey(d), d);
    if (byKey.size === 0) return { inserted: 0, updated: 0 };

    const ops = [...byKey.values()].map((d) => {
      const set: AnyDoc = { ...d, lastSeenAt: seen.at, isActive: true };
      if (seen.runId) set.lastRunId = seen.runId;
      if (seen.runKind) set.lastRunKind = seen.runKind;
      const unset: AnyDoc = {};
      for (const f of DEAL_OPTIONAL_FIELDS) {
        if (set[f] === undefined) {
          delete set[f];
          unset[f] = '';
        }
      }
      const setOnInsert: AnyDoc = { firstSeenAt: seen.at };
      if (seen.runId) setOnInsert.firstRunId = seen.runId;
      const update: AnyDoc = { $set: set, $setOnInsert: setOnInsert };
      if (Object.keys(unset).length > 0) update.$unset = unset;
      return {
        updateOne: {
          filter: { platform: d.platform, platformRestaurantId: d.platformRestaurantId, headline: d.headline, addressKey: d.addressKey },
          update,
          upsert: true,
        },
      };
    });
    const res = await DealModel.bulkWrite(ops, { ordered: false });
    return { inserted: res.upsertedCount, updated: res.matchedCount };
  }

  async deactivateDeals(platform: PlatformSlug, addressKey: string, opts: DeactivateDealsOptions): Promise<number> {
    const q: AnyDoc = { platform, addressKey, isActive: true, lastSeenAt: { $lt: opts.lastSeenBefore } };
    if (opts.lastRunKind) q.lastRunKind = opts.lastRunKind;
    const res = await DealModel.updateMany(q, { $set: { isActive: false } });
    return res.modifiedCount;
  }

  async listDeals(f: DealFilter = {}): Promise<Deal[]> {
    const q: AnyDoc = {};
    const and: AnyDoc[] = [];
    if (f.addressKey) q.addressKey = f.addressKey;
    if (f.platform) q.platform = f.platform;
    if (f.dealType) q.dealType = f.dealType;
    if (f.activeOnly !== false) {
      q.isActive = true;
      and.push({ $or: [{ expiresAt: null }, { expiresAt: { $gt: f.now ?? new Date() } }] });
    }
    if (f.maxDistanceMi !== undefined) and.push({ $or: [{ distanceMi: null }, { distanceMi: { $lte: f.maxDistanceMi } }] });
    if (f.q) {
      const re = { $regex: escapeRegex(f.q), $options: 'i' };
      and.push({ $or: [{ restaurantName: re }, { cuisine: { $elemMatch: re } }] });
    }
    if (and.length > 0) q.$and = and;
    const docs = await DealModel.find(q).sort({ lastSeenAt: -1 }).limit(f.limit ?? 500).lean();
    return docs.map(toDeal);
  }

  async createScrapeRun(input: NewScrapeRun): Promise<ScrapeRun> {
    const doc = await ScrapeRunModel.create({ resultsReturned: 0, dealsExtracted: 0, parseFailures: 0, ...stripUndefined(input) });
    return toScrapeRun(doc.toObject());
  }

  async updateScrapeRun(id: string, patch: Partial<Omit<ScrapeRun, 'id'>>): Promise<ScrapeRun | null> {
    if (!isObjectId(id)) return null;
    const doc = await ScrapeRunModel.findByIdAndUpdate(id, { $set: stripUndefined(patch) }, { new: true }).lean();
    return doc ? toScrapeRun(doc) : null;
  }

  async getScrapeRun(id: string): Promise<ScrapeRun | null> {
    if (!isObjectId(id)) return null;
    const doc = await ScrapeRunModel.findById(id).lean();
    return doc ? toScrapeRun(doc) : null;
  }

  async getScrapeRunByApifyId(apifyRunId: string): Promise<ScrapeRun | null> {
    const doc = await ScrapeRunModel.findOne({ apifyRunId }).lean();
    return doc ? toScrapeRun(doc) : null;
  }

  async listScrapeRuns(f: ScrapeRunFilter = {}): Promise<ScrapeRun[]> {
    const docs = await ScrapeRunModel.find(scrapeRunQuery(f)).sort({ startedAt: -1 }).limit(f.limit ?? 100).lean();
    return docs.map(toScrapeRun);
  }

  async countScrapeRuns(f: ScrapeRunFilter = {}): Promise<number> {
    return ScrapeRunModel.countDocuments(scrapeRunQuery(f));
  }

  async sumScrapeRunCost(since?: Date): Promise<number> {
    const match: AnyDoc = { status: { $ne: 'skipped' } };
    if (since) match.startedAt = { $gte: since };
    const rows = await ScrapeRunModel.aggregate<{ total: number }>([
      { $match: match },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$actualCost', '$estimatedCost'] } } } },
    ]);
    return rows[0]?.total ?? 0;
  }
}
