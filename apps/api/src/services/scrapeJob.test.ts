/**
 * The scrape job with fake adapters: matching across platforms, repository
 * writes (restaurant upsert, offer, snapshot), the cheapest column, blocked
 * platforms and the --allow-mock fallback. No browser involved.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BlockedError } from '../adapters/scraperBase';
import type { Cart, PlatformAdapter, PlatformListing } from '../adapters/types';
import type { Offer, PlatformSlug } from '../models/types';
import { MemoryRepository } from '../repo/memory';
import { formatTable, runScrapeJob } from './scrapeJob';

function fake(platform: PlatformSlug, listings: Array<Partial<PlatformListing> & { name: string; address: string }>, fees: Partial<Offer>): PlatformAdapter {
  return {
    platformSlug: platform,
    async searchRestaurants() {
      return listings.map((l, i) => ({ platformSlug: platform, platformRestaurantId: `${platform}-${i}`, cuisine: ['Pizza'], rating: 4.5, ratingCount: 100, ...l }));
    },
    async fetchOffer(id: string, _zip: string, cart: Cart): Promise<Offer> {
      const subtotal = 12;
      return {
        restaurantId: id,
        platformSlug: platform,
        platformRestaurantId: id,
        subtotal,
        serviceFee: 2,
        deliveryFee: 1,
        smallOrderFee: 0,
        tax: 0.84,
        total: 17.64,
        etaMin: 20,
        etaMax: 30,
        fetchedAt: new Date(),
        representativeItem: { name: `${cart[0]?.name} special`, price: subtotal },
        ...fees,
      };
    },
    storeUrl: (id) => `https://example.test/${platform}/${id}`,
  };
}

const blocked = (platform: PlatformSlug): PlatformAdapter => ({
  platformSlug: platform,
  async searchRestaurants() {
    throw new BlockedError(platform, 'HTTP 403');
  },
  async fetchOffer() {
    throw new BlockedError(platform, 'HTTP 403');
  },
  storeUrl: (id) => id,
});

test('runScrapeJob joins platforms, persists offers + snapshots and picks the cheapest', async () => {
  const repo = new MemoryRepository();
  const adapters = {
    doordash: fake('doordash', [{ name: "Pamela's P&G Diner", address: '3703 Forbes Ave' }], { total: 21.5 }),
    ubereats: fake('ubereats', [{ name: 'Pamelas P & G Diner - Oakland', address: '3703 Forbes Ave' }, { name: 'Only On Uber', address: '1 Main St' }], { total: 19.25 }),
    grubhub: fake('grubhub', [{ name: 'Pamelas P&G Diner', address: '3703 Forbes Ave' }], { total: 18.4, locationUnverified: true }),
  };
  const result = await runScrapeJob({ zip: '15213', q: 'pancakes', repo, adapters, limit: 10 });

  assert.equal(result.allFailed, false);
  assert.equal(result.rows.length, 2);
  const pamelas = result.rows[0];
  assert.equal(pamelas.slug, 'pamelas-p-and-g-diner-3703');
  assert.deepEqual(Object.keys(pamelas.offers).sort(), ['doordash', 'grubhub', 'ubereats']);
  assert.equal(pamelas.cheapest, 'grubhub');
  assert.equal(pamelas.savings, 3.1);
  assert.equal(pamelas.offers.grubhub?.locationUnverified, true);
  assert.equal(pamelas.offers.doordash?.deepLink, 'https://example.test/doordash/doordash-0');
  assert.equal(result.rows[1].name, 'Only On Uber');
  assert.equal(result.rows[1].cheapest, 'ubereats');
  assert.equal(result.rows[1].savings, 0);

  // repository side effects
  const saved = await repo.getRestaurant('pamelas-p-and-g-diner-3703');
  assert.ok(saved);
  assert.deepEqual(saved!.platformIds, { doordash: 'doordash-0', ubereats: 'ubereats-0', grubhub: 'grubhub-0' });
  assert.equal(saved!.sampleItem.name, 'pancakes special'); // learned from the first offer
  assert.equal(saved!.sampleItem.menuPrice, 12);
  const offers = await repo.getLatestOffers(saved!.id);
  assert.equal(offers.length, 3);
  const snaps = await repo.listSnapshots(saved!.id, new Date(0));
  assert.equal(snaps.length, 3);
  assert.equal(result.platforms.ubereats?.listings, 2);
  assert.equal(result.platforms.ubereats?.offers, 2);

  const table = formatTable(result);
  assert.match(table, /restaurant\s+\| DoorDash\s+\| Uber Eats\s+\| Grubhub\s+\| cheapest/);
  assert.match(table, /Pamela's P&G Diner.*\$21\.50.*\$19\.25.*\$18\.40\?.*Grubhub \(save \$3\.10\)/);
});

test('runScrapeJob reports blocked platforms and fails only when all fail', async () => {
  const repo = new MemoryRepository();
  const partial = await runScrapeJob({
    zip: '15213',
    q: 'pizza',
    repo,
    adapters: { doordash: blocked('doordash'), ubereats: blocked('ubereats'), grubhub: fake('grubhub', [{ name: 'Genoa Pizza & Bar', address: '111 Market St' }], {}) },
  });
  assert.equal(partial.allFailed, false);
  assert.equal(partial.platforms.doordash?.blocked, true);
  assert.match(partial.platforms.doordash?.error ?? '', /SCRAPER_HEADLESS=false/);
  assert.equal(partial.rows.length, 1);

  const all = await runScrapeJob({ zip: '15213', q: 'pizza', repo, adapters: { doordash: blocked('doordash'), ubereats: blocked('ubereats'), grubhub: blocked('grubhub') } });
  assert.equal(all.allFailed, true);
  assert.equal(all.rows.length, 0);
});

test('runScrapeJob --allow-mock prices a failed platform with the mock adapter', async () => {
  const repo = MemoryRepository.seeded({ historyDays: 1 });
  const result = await runScrapeJob({
    zip: '15213',
    q: 'pizza',
    repo,
    adapters: { doordash: blocked('doordash'), ubereats: blocked('ubereats'), grubhub: blocked('grubhub') },
    platforms: ['grubhub'],
    limit: 3,
    allowMock: true,
  });
  assert.equal(result.allFailed, false);
  assert.equal(result.platforms.grubhub?.mock, true);
  assert.equal(result.platforms.grubhub?.blocked, true);
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0].offers.grubhub?.mock, true);
  assert.match(formatTable(result), /\(mock\)/);
});
