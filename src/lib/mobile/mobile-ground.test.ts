/**
 * The gate behind *"can I be sure I never see that grey background again?"*
 *
 * Runs in verify's **Unit tests** gate, so a screen that paints the desk's
 * canvas plane on a phone root fails before it ships — the same shape as
 * `nav-name-collisions.test.ts`. Two claims, and they are deliberately
 * different strengths:
 *
 *   1. The ported surfaces are at ZERO and stay there. Absolute.
 *   2. The rest of `/m` can only SHRINK from the published baseline.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  auditGroundTokens,
  findMobileGrayGrounds,
  formatMobileGrayGround,
  MOBILE_GRAY_GROUND_BASELINE,
  MOBILE_GRAY_GROUND_ZERO,
} from './mobile-ground';

test('white is pinned at every altitude of the chain', () => {
  // Banning grey only says what the ground is NOT. These four say what it IS —
  // class → house token → phone shell → light-theme hex — so the white cannot
  // be undone from underneath a screen that never changed. The kiosk product
  // stage is one of them on purpose: phone and counter share ONE white.
  const unpinned = auditGroundTokens().filter((pin) => !pin.ok);
  assert.deepEqual(
    unpinned.map((pin) => `${pin.file} — ${pin.what}`),
    [],
  );
});

test('the ported phone surfaces carry no grey ground at all', () => {
  const zero = new Set<string>(MOBILE_GRAY_GROUND_ZERO);
  const offenders = findMobileGrayGrounds().filter((hit) => zero.has(hit.file));
  assert.deepEqual(
    offenders.map(formatMobileGrayGround),
    [],
    'a phone screen is one white sheet — use TOKENS.colors.background, never bg-surface-canvas',
  );
});

test('the remaining grey grounds only shrink', () => {
  const total = findMobileGrayGrounds().length;
  assert.ok(
    total <= MOBILE_GRAY_GROUND_BASELINE,
    `grey grounds on /m rose to ${total} (baseline ${MOBILE_GRAY_GROUND_BASELINE}).\n` +
      findMobileGrayGrounds().map(formatMobileGrayGround).join('\n'),
  );
});

test('the baseline is honest — it is not padded above what is actually there', () => {
  // A baseline left high after a port is a guard that stopped guarding: the
  // next regression fits inside the slack. Re-tighten it in the same commit.
  const total = findMobileGrayGrounds().length;
  assert.equal(
    total,
    MOBILE_GRAY_GROUND_BASELINE,
    `port complete — drop MOBILE_GRAY_GROUND_BASELINE to ${total}`,
  );
});

test('the scanner actually sees the classes it bans', () => {
  // Proves the regex is not silently matching nothing, which is how a green
  // guard can mean "I looked at zero files".
  const hits = findMobileGrayGrounds();
  assert.ok(hits.length > 0, 'the /m tree still has grey grounds; a 0 here means the scan broke');
  assert.ok(
    hits.every((hit) => hit.file.startsWith('src/app/m') || hit.file.startsWith('src/components/mobile')),
    'the scan stays inside the phone tree',
  );
});
