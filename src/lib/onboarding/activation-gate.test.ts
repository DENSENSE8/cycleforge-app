/**
 * Activation gate — decision logic (H1 Phase C).
 *
 * Pins allowlist, blocked/unblocked, and fail-open on probe error DB-free via
 * injected deps. Run: `tsx --test src/lib/onboarding/activation-gate.test.ts`
 */

import { test } from 'node:test';
import { strictEqual } from 'node:assert';

import {
  isActivationBlocked,
  isActivationPathExempt,
  type ActivationGateDeps,
} from './activation-gate';

const ORG = '11111111-1111-1111-1111-111111111111';

function deps(over: Partial<ActivationGateDeps> = {}): ActivationGateDeps & {
  probeCalls: () => number;
} {
  let calls = 0;
  const base: ActivationGateDeps = {
    probeHasActiveWorkflow: async () => {
      calls += 1;
      return false;
    },
  };
  return {
    ...base,
    ...over,
    probeCalls: () => calls,
  };
}

test('exempt paths never block and skip the probe', async () => {
  for (const path of [
    '/onboarding',
    '/onboarding/template',
    '/settings',
    '/apps',
    '/settings/billing',
    '/api/onboarding/stats',
    '/signin',
    '/signup',
    '/not-authorized',
    '/kiosk',
  ]) {
    const d = deps();
    strictEqual(await isActivationBlocked(ORG, path, d), false, path);
    strictEqual(d.probeCalls(), 0, `${path} must not probe`);
  }
});

test('non-exempt sibling prefixes are NOT exempt', () => {
  strictEqual(isActivationPathExempt('/settings-fake'), false);
  strictEqual(isActivationPathExempt('/onboarding-extra'), false);
  strictEqual(isActivationPathExempt('/api-proxy'), false);
});

test('protected path without active workflow → BLOCKED', async () => {
  const d = deps({ probeHasActiveWorkflow: async () => false });
  strictEqual(await isActivationBlocked(ORG, '/incoming', d), true);
  strictEqual(await isActivationBlocked(ORG, '/', d), true);
  strictEqual(await isActivationBlocked(ORG, '/shipping/orders', d), true);
});

test('protected path with active workflow → allowed', async () => {
  let calls = 0;
  const d = deps({
    probeHasActiveWorkflow: async () => {
      calls += 1;
      return true;
    },
  });
  strictEqual(await isActivationBlocked(ORG, '/incoming', d), false);
  strictEqual(calls, 1);
});

test('probe throw → fail-open (never redirect on stats/DB blip)', async () => {
  const d = deps({
    probeHasActiveWorkflow: async () => {
      throw new Error('db down');
    },
  });
  strictEqual(await isActivationBlocked(ORG, '/incoming', d), false);
});
