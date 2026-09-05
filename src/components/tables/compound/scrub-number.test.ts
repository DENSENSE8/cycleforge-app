import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SUBTITLE_SCRUB_ARM_PX,
  SUBTITLE_SCRUB_FINE_GRACE_MS,
  SUBTITLE_SCRUB_FINE_PX,
  applyScrubFrame,
  commitScrubIfChanged,
  formatScrubCommit,
  formatScrubFace,
  liveScrubFromPointer,
  moneyFigureFromFace,
  nudgeScrubValue,
  parseScrubOrigin,
  scrubTravel,
  scrubValueFromDelta,
  snapScrubValue,
  startScrubFrame,
  subtitleReorderIgnoresScrubTarget,
  subtitleScrubShouldArm,
} from './scrub-number';

const MONEY = {
  step: 1,
  coarseStep: 10,
  fineStep: 0.01,
  min: 0,
  decimals: 2,
  money: true as const,
};

describe('subtitleScrubShouldArm', () => {
  it('stays a click inside the arm threshold', () => {
    assert.equal(subtitleScrubShouldArm(0), false);
    assert.equal(subtitleScrubShouldArm(SUBTITLE_SCRUB_ARM_PX - 1), false);
  });

  it('arms on a horizontal drag of the threshold', () => {
    assert.equal(subtitleScrubShouldArm(SUBTITLE_SCRUB_ARM_PX), true);
    assert.equal(subtitleScrubShouldArm(-SUBTITLE_SCRUB_ARM_PX), true);
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
    assert.equal(scrubTravel(MONEY, { shift: false, ctrl: false }), 1);
    assert.equal(scrubTravel(MONEY, { shift: true, ctrl: false }), 10);
    assert.equal(scrubTravel(MONEY, { shift: false, ctrl: true }), 0.01);
    assert.equal(scrubTravel(MONEY, { shift: true, ctrl: true }), 0.01);
    assert.equal(scrubTravel(MONEY, { shift: false, ctrl: false, alt: true }), 0.01);
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
    assert.equal(liveScrubFromPointer(origin, SUBTITLE_SCRUB_FINE_PX - 1, MONEY, held), 60);
    assert.equal(liveScrubFromPointer(origin, SUBTITLE_SCRUB_FINE_PX, MONEY, held), 60.01);
    assert.equal(liveScrubFromPointer(origin, -SUBTITLE_SCRUB_FINE_PX, MONEY, held), 59.99);
  });

  it('does not damp default drag', () => {
    assert.equal(
      liveScrubFromPointer(60, SUBTITLE_SCRUB_FINE_PX, MONEY, { shift: false, ctrl: false }),
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

describe('formatScrubFace', () => {
  it('paints money with a dollar face and a bare figure otherwise', () => {
    assert.equal(formatScrubFace(49.99, MONEY), '$49.99');
    assert.equal(formatScrubCommit(49.99, 2), '49.99');
    assert.equal(formatScrubFace(4, { ...MONEY, money: false, decimals: 0 }), '4');
  });
});

describe('moneyFigureFromFace', () => {
  it('keeps the $ off the typed figure', () => {
    assert.equal(moneyFigureFromFace('$49.99'), '49.99');
    assert.equal(moneyFigureFromFace('$-'), '-');
    assert.equal(moneyFigureFromFace(''), '-');
  });
});

describe('commitScrubIfChanged', () => {
  it('writes only when the number actually moved', () => {
    const seen: Array<string | null> = [];
    commitScrubIfChanged('49.99', 49.99, 2, (v) => seen.push(v));
    commitScrubIfChanged('49.99', 50.99, 2, (v) => seen.push(v));
    commitScrubIfChanged('', 0, 2, (v) => seen.push(v));
    commitScrubIfChanged('', 1, 2, (v) => seen.push(v));
    assert.deepEqual(seen, ['50.99', '1.00']);
  });
});

describe('snapScrubValue', () => {
  it('snaps to the declared decimals', () => {
    assert.equal(snapScrubValue(1.239, 2), 1.24);
  });
});

describe('subtitleReorderIgnoresScrubTarget', () => {
  it('is false without a DOM host', () => {
    assert.equal(subtitleReorderIgnoresScrubTarget(null), false);
  });
});

describe('applyScrubFrame Control-release grace', () => {
  const none = { shift: false, ctrl: false };
  const fine = { shift: false, ctrl: true };

  it('does not jump to dollars when Control lifts under the pointer', () => {
    let { frame, live } = {
      frame: startScrubFrame(0, 60, fine, MONEY),
      live: 60,
    };
    ({ frame, live } = applyScrubFrame(frame, 80, fine, MONEY, 0));
    assert.equal(live, 60.1);

    ({ frame, live } = applyScrubFrame(frame, 80, none, MONEY, 10));
    assert.equal(live, 60.1, 'Control-up must park, not reread 80px as dollars');
    assert.equal(liveScrubFromPointer(60, 80, MONEY, none), 140);

    ({ frame, live } = applyScrubFrame(frame, 80, none, MONEY, 50));
    assert.equal(live, 60.1, 'still in grace, pointer unmoved');

    ({ frame, live } = applyScrubFrame(
      frame,
      80,
      none,
      MONEY,
      10 + SUBTITLE_SCRUB_FINE_GRACE_MS,
    ));
    assert.equal(live, 60.1, 'grace expiry with no travel is still parked');

    ({ frame, live } = applyScrubFrame(
      frame,
      82,
      none,
      MONEY,
      10 + SUBTITLE_SCRUB_FINE_GRACE_MS + 20,
    ));
    assert.equal(live, 62.1, 'after grace, new pixels are dollars from the park');
  });

  it('keeps a twitch in cents during grace', () => {
    let { frame, live } = {
      frame: startScrubFrame(0, 60, fine, MONEY),
      live: 60,
    };
    ({ frame, live } = applyScrubFrame(frame, 80, fine, MONEY, 0));
    ({ frame, live } = applyScrubFrame(frame, 80, none, MONEY, 10));
    ({ frame, live } = applyScrubFrame(frame, 84, none, MONEY, 40));
    assert.equal(live, 60.1, '4px during grace is still inside FINE_PX');
  });

  it('parks when Control is pressed mid dollar-drag', () => {
    let { frame, live } = {
      frame: startScrubFrame(0, 60, none, MONEY),
      live: 60,
    };
    ({ frame, live } = applyScrubFrame(frame, 20, none, MONEY, 0));
    assert.equal(live, 80);
    ({ frame, live } = applyScrubFrame(frame, 20, fine, MONEY, 30));
    assert.equal(live, 80, 'must not collapse 20px of dollars into cents');
    ({ frame, live } = applyScrubFrame(frame, 20 + SUBTITLE_SCRUB_FINE_PX, fine, MONEY, 40));
    assert.equal(live, 80.01);
  });
});
