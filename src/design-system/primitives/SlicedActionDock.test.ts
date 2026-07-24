/**
 * Unit tests for SlicedActionDock placement helpers.
 *
 *   node --import tsx --test src/design-system/primitives/SlicedActionDock.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { slicedActionDockWrapperClass } from './SlicedActionDock';

test('slicedActionDockWrapperClass: embedded carries no dock band geometry', () => {
  // The composer footer owns placement — an embedded track must not add
  // padding, safe-area inset, absolute positioning, or a z band.
  assert.equal(slicedActionDockWrapperClass({ embedded: true }), '');
  assert.equal(slicedActionDockWrapperClass({ embedded: true, docked: true }), '');
  assert.equal(
    slicedActionDockWrapperClass({ embedded: true, docked: false, edge: 'bottom' }),
    '',
  );
});

test('slicedActionDockWrapperClass: docked band is in-flow with safe-area pad', () => {
  const cls = slicedActionDockWrapperClass({ docked: true });
  assert.ok(cls.includes('shrink-0'));
  assert.ok(cls.includes('env(safe-area-inset-bottom)'));
  assert.ok(!cls.includes('absolute'));
});

test('slicedActionDockWrapperClass: floating band is absolute at the host bottom', () => {
  const cls = slicedActionDockWrapperClass({});
  assert.ok(cls.includes('absolute'));
  assert.ok(cls.includes('bottom-0'));
  assert.ok(cls.includes('z-fab'));
  assert.ok(cls.includes('pointer-events-none'));
});
