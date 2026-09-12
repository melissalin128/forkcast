/** Payload round-trip for the gzip archive. Run: npm test */
import assert from 'node:assert/strict';
import test from 'node:test';
import { deserialize, serialize } from 'bson';
import { packPayload, unpackPayload } from './PlatformScrape';

const payload = { store_id: '977564', menu_categories: [{ items: [{ name: 'Pierogi', price_cents: 1299 }] }] };

test('packPayload/unpackPayload survive a BSON round-trip', () => {
  // the driver hands back a Binary, not a Buffer — unpack must cope with both
  const wire = deserialize(serialize(packPayload(payload)));
  assert.equal(wire.payload.constructor.name, 'Binary');
  assert.deepEqual(unpackPayload(wire), payload);
  assert.deepEqual(unpackPayload({ ...packPayload(payload) }), payload);
});

test('unpackPayload passes legacy uncompressed rows straight through', () => {
  assert.deepEqual(unpackPayload({ payload }), payload);
  assert.deepEqual(unpackPayload({ payload, payloadEncoding: 'json' }), payload);
});

test('non-ASCII menu names round-trip byte-exact (real payloads carry CJK)', () => {
  const zh = { items: [{ name: '脏脏真奶 麻婆豆腐', emoji: '🍜\u{1F600}', rtl: 'שלום' }] };
  assert.deepEqual(unpackPayload(deserialize(serialize(packPayload(zh)))), zh);
});

test('JSON-lossy values are detectable, so compressScrapes can refuse them', () => {
  // a BSON Date comes back from JSON as a string; the migration guard relies on this failing
  const lossy = { capturedAt: new Date(0) };
  assert.notDeepEqual(unpackPayload(packPayload(lossy)), lossy);
});
