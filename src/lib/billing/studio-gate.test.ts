/** Operations Studio entitlement gate — decision logic (Part-2 Track 2). */

import { test } from 'node:test';
import { strictEqual } from 'node:assert';

import {
  isStudioGated,
  isStudioExemptOrg,
  DOGFOOD_ORG_ID,
  type StudioGateDeps,
} from './studio-gate';

const ORG = '11111111-1111-1111-1111-111111111111';

/**
 * Build a deps object with sensible defaults (enforcement ON, not exempt, no
 * override, plan HAS studio) so each test overrides only the axis it exercises.
 */
function deps(over: Partial<StudioGateDeps> = {}): StudioGateDeps {
  return {
    enforced: () => true,
    isExempt: (orgId) => orgId === DOGFOOD_ORG_ID,
    readOverrideFlag: async () => null,
    planHasStudio: async () => true,
    ...over,
  };
}

test('enforcement OFF → never gated, even when the plan lacks Studio', async () => {
  const gated = await isStudioGated(
    ORG,
    deps({ enforced: () => false, planHasStudio: async () => false }),
  );
  strictEqual(gated, false);
});

test('enforcement ON + plan has Studio → allowed', async () => {
  const gated = await isStudioGated(ORG, deps({ planHasStudio: async () => true }));
  strictEqual(gated, false);
});

test('enforcement ON + plan lacks Studio + not exempt → GATED', async () => {
  const gated = await isStudioGated(ORG, deps({ planHasStudio: async () => false }));
  strictEqual(gated, true);
});

test('dogfood/internal org is exempt even with enforcement on and no plan feature', async () => {
  const gated = await isStudioGated(
    DOGFOOD_ORG_ID,
    deps({ planHasStudio: async () => false }),
  );
  strictEqual(gated, false);
});

test('per-org override flag = true force-grants regardless of plan', async () => {
  const gated = await isStudioGated(
    ORG,
    deps({ readOverrideFlag: async () => true, planHasStudio: async () => false }),
  );
  strictEqual(gated, false);
});

test('per-org override flag = false does NOT block when the plan still grants Studio', async () => {
  // An explicit-off override is not a revocation: the plan capability still
  // decides. (Override only ever force-GRANTS; it never force-denies.)
  const gated = await isStudioGated(
    ORG,
    deps({ readOverrideFlag: async () => false, planHasStudio: async () => true }),
  );
  strictEqual(gated, false);
});

test('anonymous / unknown org (null) is never gated', async () => {
  const gated = await isStudioGated(null, deps({ planHasStudio: async () => false }));
  strictEqual(gated, false);
});

test('fails open (allowed) when a collaborator throws', async () => {
  const gated = await isStudioGated(
    ORG,
    deps({
      readOverrideFlag: async () => {
        throw new Error('db down');
      },
    }),
  );
  strictEqual(gated, false);
});

test('the dogfood org id is org #1 and isStudioExemptOrg recognizes it', () => {
  strictEqual(isStudioExemptOrg(DOGFOOD_ORG_ID), true);
  strictEqual(isStudioExemptOrg(ORG), false);
  strictEqual(isStudioExemptOrg(null), false);
});
