import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyDeal, parseMinOrder, parseMoney, parsePercent, parsePromoCode } from './common';

test('parseMoney reads dollar amounts and refuses non-numbers', () => {
  assert.equal(parseMoney('$12.50'), 12.5);
  assert.equal(parseMoney('12.50'), 12.5);
  assert.equal(parseMoney('$1,250'), 1250);
  assert.equal(parseMoney('$0'), 0);
  assert.equal(parseMoney('Free'), undefined);
  assert.equal(parseMoney(''), undefined);
  assert.equal(parseMoney(null), undefined);
});

test('parsePercent and parsePromoCode', () => {
  assert.equal(parsePercent('20% off'), 20);
  assert.equal(parsePercent('Save 15 % today'), 15);
  assert.equal(parsePercent('150%'), undefined, 'out of range');
  assert.equal(parsePercent('no percent here'), undefined);
  assert.equal(parsePromoCode('Use code SAVE20 at checkout'), 'SAVE20');
  assert.equal(parsePromoCode('code: welcome10'), 'WELCOME10');
  assert.equal(parsePromoCode('20% OFF TODAY'), undefined, 'not every uppercase word is a code');
});

test('parseMinOrder reads the threshold, not every dollar amount', () => {
  assert.equal(parseMinOrder('$5 off $20+'), 20);
  assert.equal(parseMinOrder('20% off orders over $15'), 15);
  assert.equal(parseMinOrder('Free delivery on orders $15+'), 15);
  assert.equal(parseMinOrder('Spend $30, save $8'), 30);
  assert.equal(parseMinOrder('min. $12'), 12);
  assert.equal(parseMinOrder('$5 off'), undefined, 'no threshold stated');
});

test('classifyDeal: delivery deals', () => {
  assert.deepEqual(classifyDeal('Free delivery'), { dealType: 'free_delivery', value: { deliveryFee: 0 } });
  assert.deepEqual(classifyDeal('$0 delivery fee'), { dealType: 'free_delivery', value: { deliveryFee: 0 } });
  assert.deepEqual(classifyDeal('Free delivery on orders $15+'), {
    dealType: 'free_delivery',
    value: { deliveryFee: 0 },
    minOrder: 15,
  });
  assert.deepEqual(classifyDeal('$1.99 delivery fee'), { dealType: 'reduced_delivery_fee', value: { deliveryFee: 1.99 } });
});

test('classifyDeal: dollar off, percent off and bogo', () => {
  assert.deepEqual(classifyDeal('$5 off $20+'), { dealType: 'dollar_off', value: { dollars: 5 }, minOrder: 20 });
  assert.deepEqual(classifyDeal('20% off orders $25+'), { dealType: 'percent_off', value: { percent: 20 }, minOrder: 25 });
  assert.equal(classifyDeal('Buy 1, get 1 free').dealType, 'bogo');
  assert.equal(classifyDeal('BOGO entrees').dealType, 'bogo');
  assert.deepEqual(classifyDeal('Save $8 when you spend $30, use code PITT8'), {
    dealType: 'dollar_off',
    value: { dollars: 8 },
    minOrder: 30,
    promoCode: 'PITT8',
  });
});

test('classifyDeal: a struck-through price becomes an item discount with derived savings', () => {
  assert.deepEqual(classifyDeal('Pepperoni Pizza', { originalPrice: 20, salePrice: 15 }), {
    dealType: 'item_discount',
    value: { originalPrice: 20, salePrice: 15, dollars: 5, percent: 25 },
  });
  // structural numbers the actor gave win over anything derived
  assert.deepEqual(classifyDeal('Special', { originalPrice: 10, salePrice: 8, percent: 22 }).value, {
    originalPrice: 10,
    salePrice: 8,
    percent: 22,
    dollars: 2,
  });
});

test('classifyDeal: free item, bare code, and unreadable text', () => {
  assert.equal(classifyDeal('Free garlic knots with any order').dealType, 'item_discount');
  assert.equal(classifyDeal('Enter code WELCOME at checkout').dealType, 'promo_code');
  assert.deepEqual(classifyDeal('Deal available'), { dealType: 'other' });
  assert.deepEqual(classifyDeal('   '), { dealType: 'other' }, 'blank text is never invented into a value');
});
