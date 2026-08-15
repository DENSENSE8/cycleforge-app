import { test } from 'node:test';
import { equal, ok } from 'node:assert/strict';
import {
  PRODUCT_UPDATES,
  featureCount,
  latestProductUpdate,
} from './product-updates';

test('catalog is newest-first and exposes the To Ship desk entry', () => {
  ok(PRODUCT_UPDATES.length >= 1);
  const latest = latestProductUpdate();
  ok(latest);
  equal(latest!.id, '2026-08-13-to-ship-desk');
  equal(latest!.name, 'To Ship desk');
  equal(latest!.buildSha, '54a51e955');
  equal(featureCount(latest!), latest!.major.length + latest!.minor.length);
  ok(latest!.major.length >= 3);
  ok(latest!.minor.some((f) => f.id === 'fork-doc'));
});

test('major features omit video until demos land', () => {
  const latest = latestProductUpdate();
  ok(latest);
  for (const feature of latest!.major) {
    equal(feature.video, undefined);
  }
});
