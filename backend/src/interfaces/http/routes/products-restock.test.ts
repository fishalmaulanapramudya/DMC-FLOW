import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateNewStockAfterRestock } from './products';

test('restock adds quantity to current stock', () => {
  assert.equal(calculateNewStockAfterRestock(12, 8), 20);
});

test('restock rejects invalid negative quantities', () => {
  assert.throws(() => calculateNewStockAfterRestock(12, -1), /positive|positif/i);
});
