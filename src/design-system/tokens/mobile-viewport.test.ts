import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appViewport,
  appRootClass,
  mobileAppRootClass,
  mobileTopBarClass,
} from './mobile-viewport';

test('the document declares one edge-to-edge viewport through Next metadata', () => {
  assert.deepEqual(appViewport, {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor: '#ffffff',
  });
});

test('mobile PWA chassis stays in flow so paint and hit-test coordinates agree', () => {
  assert.match(mobileAppRootClass, /\bh-full\b/);
  assert.doesNotMatch(mobileAppRootClass, /\bh-dvh\b|100dvh/);
  assert.doesNotMatch(mobileAppRootClass, /\bfixed\b|\binset-0\b/);
  assert.doesNotMatch(mobileTopBarClass, /\bsticky\b|\bfixed\b|\btop-0\b/);
  assert.equal(appRootClass(true), mobileAppRootClass);
});
