import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  armReplaceTrackingIntent,
  consumeReplaceTrackingIntent,
  peekReplaceTrackingIntent,
  resetReplaceTrackingIntentForTests,
  subscribeReplaceTrackingIntent,
} from './replace-tracking-intent';

function reset() {
  resetReplaceTrackingIntentForTests();
}

test('arms and consumes once for a matching order id', () => {
  reset();
  armReplaceTrackingIntent(42);
  assert.deepEqual(peekReplaceTrackingIntent(), { orderId: 42, generation: 1 });
  assert.equal(consumeReplaceTrackingIntent(42), true);
  assert.equal(peekReplaceTrackingIntent(), null);
  assert.equal(consumeReplaceTrackingIntent(42), false);
});

test('does not consume for a different order id', () => {
  reset();
  armReplaceTrackingIntent(42);
  assert.equal(consumeReplaceTrackingIntent(99), false);
  assert.equal(consumeReplaceTrackingIntent(42), true);
});

test('re-arming the same order notifies and is consumable again', () => {
  reset();
  let ticks = 0;
  const unsub = subscribeReplaceTrackingIntent(() => {
    ticks += 1;
  });
  armReplaceTrackingIntent(7);
  assert.equal(ticks, 1);
  assert.equal(consumeReplaceTrackingIntent(7), true);
  armReplaceTrackingIntent(7);
  assert.equal(ticks, 2);
  assert.equal(consumeReplaceTrackingIntent(7), true);
  unsub();
});

test('ignores non-positive ids', () => {
  reset();
  armReplaceTrackingIntent(0);
  armReplaceTrackingIntent(-1);
  armReplaceTrackingIntent(Number.NaN);
  assert.equal(peekReplaceTrackingIntent(), null);
});
