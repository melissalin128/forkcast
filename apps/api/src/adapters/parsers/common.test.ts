import assert from 'node:assert/strict';
import { test } from 'node:test';
import { looksBlocked } from '../scraperBase';
import { parseZippopotam } from '../../services/zipGeo';
import { extractAssignedJson, extractScriptJson, findFeeLine, nameMatches, parseEta, parseMoney, parsePromoText, parseRating } from './common';

test('parseMoney', () => {
  assert.equal(parseMoney('$4.99'), 4.99);
  assert.equal(parseMoney('4.99'), 4.99);
  assert.equal(parseMoney('$1,234.50'), 1234.5);
  assert.equal(parseMoney('Free'), 0);
  assert.equal(parseMoney('$0 delivery fee'), 0);
  assert.equal(parseMoney('-$5.00'), -5);
  assert.equal(parseMoney(''), undefined);
  assert.equal(parseMoney('no numbers'), undefined);
});

test('parseEta', () => {
  assert.deepEqual(parseEta('25-40 min'), [25, 40]);
  assert.deepEqual(parseEta('25–40 min'), [25, 40]);
  assert.deepEqual(parseEta('20 to 35 min'), [20, 35]);
  assert.deepEqual(parseEta('35 min'), [35, 45]);
  assert.deepEqual(parseEta('30 minutes'), [30, 40]);
  assert.equal(parseEta('soon'), undefined);
});

test('parseRating', () => {
  assert.deepEqual(parseRating('4.6 (2k+) • Pizza • 27 min'), { rating: 4.6, ratingCount: 2000 });
  assert.deepEqual(parseRating('4.7★ (3,900+) • 0.6 mi'), { rating: 4.7, ratingCount: 3900 });
  assert.deepEqual(parseRating('4.4 (740) • Fast Food'), { rating: 4.4, ratingCount: 740 });
  assert.deepEqual(parseRating('$12.99'), {});
});

test('findFeeLine', () => {
  const text = 'Subtotal $18.99 Delivery Fee $0.99 Service Fee $2.85 Estimated Tax $1.52 Total $24.35';
  assert.equal(findFeeLine(text, /delivery fee/), 0.99);
  assert.equal(findFeeLine(text, /estimated tax/), 1.52);
  assert.equal(findFeeLine('Delivery fee: Free', /delivery fee/), 0);
  assert.equal(findFeeLine(text, /small order fee/), undefined);
});

test('parsePromoText only builds rules it can read', () => {
  const now = new Date('2026-09-12T12:00:00Z');
  assert.deepEqual(parsePromoText('20% off orders $25+', 'WEEKNIGHT20', now)?.rule, { type: 'percent', value: 20, minSubtotal: 25 });
  assert.deepEqual(parsePromoText('$5 off your order of $20 or more', undefined, now)?.rule, { type: 'flat', value: 5, minSubtotal: 20 });
  assert.deepEqual(parsePromoText('Free delivery on $15+', undefined, now)?.rule, { type: 'freeDelivery', value: 0, minSubtotal: 15 });
  assert.equal(parsePromoText('Earn $8 back in Grubhub credit', undefined, now), undefined);
  assert.equal(parsePromoText(undefined), undefined);
});

test('extractScriptJson / extractAssignedJson', () => {
  const html = `<script id="__NEXT_DATA__" type="application/json">{"a":1}</script>
    <script>window.__PRELOADED_STATE__ = {"b":{"c":"x}y"}};</script>`;
  assert.deepEqual(extractScriptJson(html, '__NEXT_DATA__'), { a: 1 });
  assert.deepEqual(extractAssignedJson(html, '__PRELOADED_STATE__'), { b: { c: 'x}y' } });
  assert.equal(extractScriptJson(html, '__NOPE__'), undefined);
});

test('nameMatches', () => {
  assert.equal(nameMatches('The Works Pizza', 'works pizza'), true);
  assert.equal(nameMatches('Large Pepperoni Pizza', 'Pepperoni Pizza (Large)'), true);
  assert.equal(nameMatches('Garlic Knots', 'pizza'), false);
});

test('looksBlocked recognises WAF interstitials and 403s', () => {
  assert.match(looksBlocked(403, 'Just a moment...', 'www.doordash.com Performing security verification') ?? '', /just a moment/i);
  assert.equal(looksBlocked(403, '', 'plain text'), 'HTTP 403');
  assert.equal(looksBlocked(200, 'Food Delivery | Grubhub', 'Papa Johns 4.6 (376) • Pizza'), null);
  assert.match(looksBlocked(200, 'Access Denied', 'You don\'t have permission') ?? '', /access denied/i);
});

test('parseZippopotam', () => {
  const body = '{"post code": "15213", "country": "United States", "places": [{"place name": "Pittsburgh", "longitude": "-79.9552", "latitude": "40.444", "state": "Pennsylvania", "state abbreviation": "PA"}]}';
  assert.deepEqual(parseZippopotam('15213', body), { zip: '15213', lat: 40.444, lng: -79.9552, city: 'Pittsburgh', state: 'PA', label: 'Pittsburgh, PA 15213' });
  assert.equal(parseZippopotam('00000', '{"places": []}'), null);
  assert.equal(parseZippopotam('00000', 'nope'), null);
});
