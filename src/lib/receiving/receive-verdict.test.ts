import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveReceiveVerdict, type ZohoPoOutcome } from './receive-verdict';

function input(
  outcomes: (ZohoPoOutcome | undefined)[],
  opts: {
    linked?: number[];
    promoted?: number[];
    anyPromotionFailed?: boolean;
  } = {},
) {
  const linked = opts.linked ?? [1];
  return {
    outcomes,
    linkedLineIds: linked,
    promotedLineIds: new Set(opts.promoted ?? linked),
    anyPromotionFailed: opts.anyPromotionFailed ?? false,
  };
}

test('a real post that committed locally is the only "ok"', () => {
  assert.equal(resolveReceiveVerdict(input(['posted'])), 'ok');
  assert.equal(resolveReceiveVerdict(input(['posted', 'posted'])), 'ok');
});

test('a deliberate no-op settles as "skipped", never "ok"', () => {
  // The regression this module exists for: an already-terminal PO, or a PO with
  // no pending quantity, posts NOTHING. It must not print "Confirmed".
  assert.equal(resolveReceiveVerdict(input(['noop'])), 'skipped');
  assert.equal(resolveReceiveVerdict(input(['posted', 'noop'])), 'skipped');
});

test('provider settled but the local promotion did not land is a failure', () => {
  // This is the exact shape that left a row at EXPECTED — and therefore at
  // delivery_state='IN_TRANSIT' — behind a green card.
  assert.equal(
    resolveReceiveVerdict(input(['posted'], { linked: [1], promoted: [] })),
    'failed',
  );
  assert.equal(
    resolveReceiveVerdict(input(['noop'], { linked: [1, 2], promoted: [1] })),
    'failed',
  );
  assert.equal(
    resolveReceiveVerdict(input(['posted'], { anyPromotionFailed: true })),
    'failed',
  );
});

test('an unrecorded outcome counts as a failure, never as a success', () => {
  assert.equal(resolveReceiveVerdict(input([undefined])), 'failed');
  assert.equal(resolveReceiveVerdict(input(['posted', undefined])), 'failed');
});

test('an explicit provider failure is a failure', () => {
  assert.equal(resolveReceiveVerdict(input(['failed'])), 'failed');
  assert.equal(resolveReceiveVerdict(input(['posted', 'failed'])), 'failed');
});

test('nothing linked publishes no verdict at all', () => {
  assert.equal(resolveReceiveVerdict(input([], { linked: [] })), undefined);
});
