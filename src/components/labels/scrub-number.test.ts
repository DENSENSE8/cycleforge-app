import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SCRUB_ARM_PX,
  SCRUB_FINE_GRACE_MS,
  SCRUB_FINE_PX,
  applyScrubFrame,
  liveScrubFromPointer,
  nudgeScrubValue,
  parseScrubOrigin,
  scrubShouldArm,
  scrubTravel,
  scrubValueFromDelta,
  snapScrubValue,
  startScrubFrame,
} from './scrub-number';

const CENTS = {
  step: 1,
  coarseStep: 10,
  fineStep: 0.01,
  min: 0,
  decimals: 2,
};

describe('scrubShouldArm', () => {
  it('stays a click inside the arm threshold', () => {
    assert.equal(scrubShouldArm(0), false);
    assert.equal(scrubShouldArm(SCRUB_ARM_PX - 1), false);
  });

  it('arms on a horizontal drag of the threshold', () => {
    assert.equal(scrubShouldArm(SCRUB_ARM_PX), true);
    assert.equal(scrubShouldArm(-SCRUB_ARM_PX), true);
  });
});

describe('parseScrubOrigin', () => {
  it('reads a typed figure, strips currency, and treats empty as zero', () => {
    assert.equal(parseScrubOrigin('49.99'), 49.99);
    assert.equal(parseScrubOrigin('$1,299.00'), 1299);
    assert.equal(parseScrubOrigin(''), 0);
    assert.equal(parseScrubOrigin('abc'), 0);
  });
});

describe('scrubTravel', () => {
  it('uses step, Shift for coarse, Control for fine (Alt still aliases)', () => {
    assert.equal(scrubTravel(CENTS, { shift: false, ctrl: false }), 1);
    assert.equal(scrubTravel(CENTS, { shift: true, ctrl: false }), 10);
    assert.equal(scrubTravel(CENTS, { shift: false, ctrl: true }), 0.01);
    assert.equal(scrubTravel(CENTS, { shift: true, ctrl: true }), 0.01);
    assert.equal(scrubTravel(CENTS, { shift: false, ctrl: false, alt: true }), 0.01);
  });
});

describe('scrubValueFromDelta', () => {
  it('adds one step per pixel from the origin, like Figma width', () => {
    assert.equal(scrubValueFromDelta(49.99, 10, 1, 2, 0), 59.99);
    assert.equal(scrubValueFromDelta(49.99, -5, 1, 2, 0), 44.99);
  });

  it('does not drop below min', () => {
    assert.equal(scrubValueFromDelta(2, -40, 1, 2, 0), 0);
  });
});

describe('liveScrubFromPointer', () => {
  it('keeps Control-drag near the origin until FINE_PX of travel', () => {
    const origin = 60;
    const held = { shift: false, ctrl: true };
    assert.equal(liveScrubFromPointer(origin, SCRUB_FINE_PX - 1, CENTS, held), 60);
    assert.equal(liveScrubFromPointer(origin, SCRUB_FINE_PX, CENTS, held), 60.01);
    assert.equal(liveScrubFromPointer(origin, -SCRUB_FINE_PX, CENTS, held), 59.99);
  });

  it('does not damp default drag', () => {
    assert.equal(
      liveScrubFromPointer(60, SCRUB_FINE_PX, CENTS, { shift: false, ctrl: false }),
      68,
    );
  });
});

describe('nudgeScrubValue', () => {
  it('steps from the origin without a pointer', () => {
    assert.equal(nudgeScrubValue(49.99, 1, 1, 2, 0), 50.99);
    assert.equal(nudgeScrubValue(49.99, -1, 0.01, 2, 0), 49.98);
  });
});

describe('snapScrubValue', () => {
  it('snaps to the declared decimals', () => {
    assert.equal(snapScrubValue(1.239, 2), 1.24);
  });
});

describe('applyScrubFrame Control-release grace', () => {
  const none = { shift: false, ctrl: false };
  const fine = { shift: false, ctrl: true };

  it('does not jump to whole steps when Control lifts under the pointer', () => {
    let { frame, live } = {
      frame: startScrubFrame(0, 60, fine, CENTS),
      live: 60,
    };
    ({ frame, live } = applyScrubFrame(frame, 80, fine, CENTS, 0));
    assert.equal(live, 60.1);

    ({ frame, live } = applyScrubFrame(frame, 80, none, CENTS, 10));
    assert.equal(live, 60.1, 'Control-up must park, not reread 80px as whole steps');
    assert.equal(liveScrubFromPointer(60, 80, CENTS, none), 140);

    ({ frame, live } = applyScrubFrame(frame, 80, none, CENTS, 50));
    assert.equal(live, 60.1, 'still in grace, pointer unmoved');

    ({ frame, live } = applyScrubFrame(frame, 80, none, CENTS, 10 + SCRUB_FINE_GRACE_MS));
    assert.equal(live, 60.1, 'grace expiry with no travel is still parked');

    ({ frame, live } = applyScrubFrame(frame, 82, none, CENTS, 10 + SCRUB_FINE_GRACE_MS + 20));
    assert.equal(live, 62.1, 'after grace, new pixels are whole steps from the park');
  });

  it('keeps a twitch fine during grace', () => {
    let { frame, live } = {
      frame: startScrubFrame(0, 60, fine, CENTS),
      live: 60,
    };
    ({ frame, live } = applyScrubFrame(frame, 80, fine, CENTS, 0));
    ({ frame, live } = applyScrubFrame(frame, 80, none, CENTS, 10));
    ({ frame, live } = applyScrubFrame(frame, 84, none, CENTS, 40));
    assert.equal(live, 60.1, '4px during grace is still inside FINE_PX');
  });

  it('parks when Control is pressed mid coarse-drag', () => {
    let { frame, live } = {
      frame: startScrubFrame(0, 60, none, CENTS),
      live: 60,
    };
    ({ frame, live } = applyScrubFrame(frame, 20, none, CENTS, 0));
    assert.equal(live, 80);
    ({ frame, live } = applyScrubFrame(frame, 20, fine, CENTS, 30));
    assert.equal(live, 80, 'must not collapse 20px of whole steps into fine steps');
    ({ frame, live } = applyScrubFrame(frame, 20 + SCRUB_FINE_PX, fine, CENTS, 40));
    assert.equal(live, 80.01);
  });
});
