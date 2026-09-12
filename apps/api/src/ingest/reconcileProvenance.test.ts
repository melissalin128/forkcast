import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derivedGuess, observedPlatforms, parserFallbacks, stillDerived, type Row } from './reconcileProvenance';

const base: Row = { slug: 'pie-shop-12345', seatCount: 50, imageUrl: 'https://img.cdn4dd.com/x.png' };
const guess = derivedGuess(base);

test('a label is dropped only when the value is provably observed', () => {
  const none = new Set<string>();

  // Untouched guesses keep their label.
  assert.ok(stillDerived('rating', { ...base, rating: guess.rating }, none));
  assert.ok(stillDerived('ratingCount', { ...base, ratingCount: guess.ratingCount }, none));
  assert.ok(stillDerived('priceTier', { ...base, priceTier: guess.priceTier }, none));
  assert.equal(guess.priceTier, 2); // seats win over the hash: 40 <= 50 < 100

  // A scrape overwrote them -> observed, label goes.
  assert.equal(stillDerived('rating', { ...base, rating: guess.rating + 0.3 }, none), false);
  assert.equal(stillDerived('ratingCount', { ...base, ratingCount: guess.ratingCount + 1 }, none), false);
  assert.equal(stillDerived('priceTier', { ...base, priceTier: 3 }, none), false);

  // imageUrl: the stock placeholder vs the real CDN.
  assert.ok(stillDerived('imageUrl', { ...base, imageUrl: 'https://picsum.photos/seed/x/640/400' }, none));
  assert.ok(stillDerived('imageUrl', { ...base, imageUrl: null }, none));
  assert.equal(stillDerived('imageUrl', base, none), false);

  // sampleItem is observed iff it names a menu item we actually scraped.
  const row = { ...base, sampleItem: { name: 'Pepperoni Slice' } };
  assert.ok(stillDerived('sampleItem', row, none));
  assert.equal(stillDerived('sampleItem', row, new Set(['Pepperoni Slice'])), false);

  // The safety polarity: anything undecidable stays labelled as derived.
  assert.ok(stillDerived('cuisine', base, none));
  assert.ok(stillDerived('whateverComesNext', base, none));
});

test('observedOn needs evidence, not just an id on the row', () => {
  const r: Row = { ...base, platformIds: { doordash: 'dd-real', ubereats: 'ue-stale' } };
  assert.deepEqual(observedPlatforms(r, new Set(['doordash:dd-real']), new Set()), ['doordash']);
  // Observed menu items count as evidence on their own, and the list is deduped + sorted.
  assert.deepEqual(
    observedPlatforms(r, new Set(['doordash:dd-real']), new Set(['ubereats', 'doordash'])),
    ['doordash', 'ubereats'],
  );
  assert.deepEqual(observedPlatforms({ ...base }, new Set(), new Set()), []);
});

test('parser defaults on apify-created rows are labelled derived', () => {
  const dd = { store_id: '1', name: 'Pie Shop', rating: 0, price_range: 0, tags: [] };
  const real = { store_id: '1', name: 'Pie Shop', rating: 4.6, price_range: 2, tags: [{ name: 'Pizza' }] };
  assert.deepEqual(parserFallbacks('apify-doordash', new Map([['doordash', dd]])), ['rating', 'priceTier', 'cuisine']);
  assert.deepEqual(parserFallbacks('apify-doordash', new Map([['doordash', real]])), []);
  // A matched Uber rating overwrote the default; tier and cuisine came only from the creator.
  const ue = { uuid: 'u', title: 'Pie Shop', rating: { ratingValue: 4.2 }, priceBucket: '$$', cuisineList: ['Pizza'] };
  assert.deepEqual(parserFallbacks('apify-doordash', new Map<string, Record<string, unknown>>([['doordash', dd], ['ubereats', ue]])), ['priceTier', 'cuisine']);
  assert.deepEqual(parserFallbacks('apify-ubereats', new Map([['ubereats', { ...ue, priceBucket: '' }]])), ['priceTier']);
  // Rows the apify stage did not create, or with no payload, are not judged here.
  assert.deepEqual(parserFallbacks('wprdc', new Map([['doordash', dd]])), []);
  assert.deepEqual(parserFallbacks('apify-doordash', new Map()), []);
});
