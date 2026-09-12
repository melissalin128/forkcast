import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchKey, matchRestaurants, nameSimilarity, normalizeName, streetNumber } from './restaurantMatcher';
import type { PlatformListing } from '../adapters/types';

const listing = (platformSlug: PlatformListing['platformSlug'], name: string, address: string, id = `${platformSlug}-${name}`): PlatformListing => ({
  platformSlug,
  platformRestaurantId: id,
  name,
  address,
  cuisine: [],
});

test('normalizeName strips punctuation, case, filler words and possessive apostrophes', () => {
  assert.equal(normalizeName("The Pamela's P&G Diner"), 'pamelas p g diner');
  assert.equal(normalizeName('Sichuan Gourmet Restaurant'), 'sichuan gourmet');
  assert.equal(normalizeName('Mineo’s Pizza House - Squirrel Hill'), 'mineos pizza house');
  assert.equal(normalizeName('Café Moulin'), 'cafe moulin');
});

test('streetNumber pulls the house number and matchKey combines both', () => {
  assert.equal(streetNumber('3703 Forbes Ave'), '3703');
  assert.equal(streetNumber('  221 Schenley Dr, Pittsburgh, PA 15213'), '221');
  assert.equal(streetNumber('Forbes Ave'), '');
  assert.equal(matchKey("Pamela's P&G Diner", '3703 Forbes Ave'), 'pamelas p g diner|3703');
});

test('the same restaurant spelled differently on three platforms collapses into one', () => {
  const groups = matchRestaurants([
    listing('doordash', "Pamela's P&G Diner", '3703 Forbes Ave'),
    listing('ubereats', 'Pamelas P & G Diner (Oakland)', '3703 Forbes Avenue, Pittsburgh'),
    listing('grubhub', "The Pamela's P&G Diner Restaurant", '3703 Forbes Ave'),
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(Object.keys(groups[0].platformIds).sort(), ['doordash', 'grubhub', 'ubereats']);
});

test('same name at a different street number stays separate (two locations)', () => {
  const groups = matchRestaurants([
    listing('doordash', "Pamela's Diner", '3703 Forbes Ave'),
    listing('ubereats', "Pamela's Diner", '5527 Walnut St'),
  ]);
  assert.equal(groups.length, 2);
});

test('different restaurants at the same address do not merge', () => {
  const groups = matchRestaurants([
    listing('doordash', 'Bangkok Balcony', '5846 Forbes Ave'),
    listing('ubereats', 'Kiin Lao & Thai Eatery', '5846 Forbes Ave'),
  ]);
  assert.equal(groups.length, 2);
});

test('fuzzy merge needs the same street number and a similar name', () => {
  assert.ok(nameSimilarity('Primanti Bros.', 'Primanti Bros Oakland') >= 0.6);
  const groups = matchRestaurants([
    listing('doordash', 'Primanti Bros.', '3803 Forbes Ave'),
    listing('grubhub', 'Primanti Bros - Oakland', '3803 Forbes Ave'),
    listing('ubereats', 'Primanti Brothers Oakland', '3803 Forbes Ave'), // "brothers" != "bros" -> below threshold
  ]);
  assert.equal(groups.length, 2);
  const merged = groups.find((g) => g.platformIds.doordash);
  assert.ok(merged?.platformIds.grubhub);
});

test('a platform never appears twice in one group', () => {
  const groups = matchRestaurants([
    listing('doordash', "Aiello's Pizza", '2112 Murray Ave', 'a'),
    listing('doordash', "Aiello's Pizza", '2112 Murray Ave', 'b'),
  ]);
  assert.equal(groups.length, 2);
});
