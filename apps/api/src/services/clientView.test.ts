import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { displayDietaryTags, inferCategory } from './clientView';

describe('inferCategory', () => {
  it('maps Italian and pasta to Italian', () => {
    assert.equal(inferCategory(['Italian']), 'Italian');
    assert.equal(inferCategory(['Pasta', 'Wine']), 'Italian');
  });

  it('maps Sichuan to Chinese and poke to Sushi', () => {
    assert.equal(inferCategory(['Sichuan']), 'Chinese');
    assert.equal(inferCategory(['Poke']), 'Sushi');
  });

  it('falls back to the first cuisine when nothing matches', () => {
    assert.equal(inferCategory(['Syrian']), 'Syrian');
    assert.equal(inferCategory([]), 'All');
  });
});

describe('displayDietaryTags', () => {
  it('normalizes API slugs to the client labels', () => {
    assert.deepEqual(displayDietaryTags(['vegan', 'gluten-free', 'halal']), [
      'Vegan options',
      'Gluten-free options',
      'Halal',
    ]);
  });

  it('leaves already-friendly labels alone', () => {
    assert.deepEqual(displayDietaryTags(['Vegan options']), ['Vegan options']);
  });
});
