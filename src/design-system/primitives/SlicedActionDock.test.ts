/**
 * Unit tests for SlicedActionDock placement helpers.
 *
 *   node --import tsx --test src/design-system/primitives/SlicedActionDock.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  slicedActionDockWrapperClass,
  slicedActionDockSegmentOrder,
  slicedActionDockTrackClass,
  slicedActionDockToneInk,
} from './SlicedActionDock';

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

test('slicedActionDockSegmentOrder: composer pill puts the chevron on the far right', () => {
  assert.equal(
    slicedActionDockSegmentOrder({ embedded: true, embeddedChrome: 'pill' }),
    'primary,menu',
  );
});

test('slicedActionDockSegmentOrder: desk header puts the chevron on the far right', () => {
  assert.equal(
    slicedActionDockSegmentOrder({ embedded: true, embeddedChrome: 'header' }),
    'primary,menu',
  );
});

test('slicedActionDockSegmentOrder: flush and floating docks keep the left chevron', () => {
  assert.equal(
    slicedActionDockSegmentOrder({ embedded: true, embeddedChrome: 'flush' }),
    'menu,primary',
  );
  assert.equal(slicedActionDockSegmentOrder({ embedded: true }), 'menu,primary');
  assert.equal(slicedActionDockSegmentOrder({}), 'menu,primary');
  assert.equal(
    slicedActionDockSegmentOrder({ embedded: false, embeddedChrome: 'pill' }),
    'menu,primary',
  );
});

test('slicedActionDockToneInk: colour tracks paint white ink', () => {
  for (const tone of ['accent', 'blue', 'emerald', 'gray'] as const) {
    const ink = slicedActionDockToneInk(tone);
    assert.equal(ink.text, 'text-white');
    assert.equal(ink.divider, 'border-white/20');
    assert.equal(ink.ring, '');
  }
});

test('slicedActionDockToneInk: surface is the quiet track (ink text, hairline)', () => {
  // Two pills side by side (Print + Location) must not both shout accent —
  // and the quiet one needs a ring, or a white fill has no edge at all.
  const ink = slicedActionDockToneInk('surface');
  assert.equal(ink.text, 'text-text-default');
  assert.ok(!ink.text.includes('white'));
  assert.ok(!ink.divider.includes('white'));
  assert.ok(ink.ring.includes('ring-'));
  assert.ok(!ink.focus.includes('white'));
});

test('composer-footer pills carry no drop shadow', () => {
  // Location and Print sit INSIDE the notes bubble; a shadow there paints a
  // second raised plane on an already-raised surface.
  const composer = slicedActionDockTrackClass({ embedded: true, embeddedChrome: 'pill' });
  assert.match(composer, /shadow-none/);
  assert.doesNotMatch(composer, /shadow-lg/);
  assert.match(composer, /rounded-2xl/);
});

test('the free-floating dock keeps its elevation', () => {
  // It genuinely hovers over the work surface, so it is the one that casts.
  assert.match(slicedActionDockTrackClass({ embedded: false }), /shadow-lg/);
});

test('embedded flush chrome stays square and flat', () => {
  const flush = slicedActionDockTrackClass({ embedded: true, embeddedChrome: 'flush' });
  assert.match(flush, /rounded-none/);
  assert.match(flush, /shadow-none/);
});

test('desk header split CTA uses the pill corner token, not the composer 2xl', () => {
  const header = slicedActionDockTrackClass({ embedded: true, embeddedChrome: 'header' });
  assert.match(header, /rounded-full/);
  assert.doesNotMatch(header, /rounded-2xl/);
  assert.match(header, /shadow-none/);
});

test('industrial bar segment is square, flat, and keeps the chevron on the far right', () => {
  const segment = slicedActionDockTrackClass({ embedded: true, embeddedChrome: 'segment' });
  assert.match(segment, /rounded-none/);
  assert.match(segment, /shadow-none/);
  assert.doesNotMatch(segment, /ring-1/);
  assert.equal(
    slicedActionDockSegmentOrder({ embedded: true, embeddedChrome: 'segment' }),
    'primary,menu',
  );
});
