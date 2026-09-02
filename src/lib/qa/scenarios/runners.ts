/**
 * How each named scenario is executed, which suite it belongs to, and which
 * Playwright spec (if any) is the browser counterpart.
 *
 * `deterministic` — no secrets, no live provider. Safe for CI on every change.
 * `qa-org` — needs the QA tenant + DB (fixtures, injections, stored webhooks).
 * `sandbox` — needs a connected provider sandbox (skipped when absent).
 */

import { QA_SCENARIOS } from './registry';

export type ScenarioSuite = 'deterministic' | 'qa-org' | 'sandbox';

export type ScenarioHandlerId =
  | 'ingest-missing-field'
  | 'ingest-duplicate-preview'
  | 'inject-health'
  | 'dry-run-ebay-buyer'
  | 'assert-orders'
  | 'assert-receiving'
  | 'assert-demo'
  | 'assert-zoho-po'
  | 'webhook-normalize-idempotency'
  | 'webhook-replay-twice'
  | 'webhook-replay-out-of-order'
  | 'webhook-authentic-signature'
  | 'zoho-qty-same-line'
  | 'zoho-delete-missing-po'
  | 'refuse-live-label'
  | 'not-wired';

export interface ScenarioRunnerDef {
  handler: ScenarioHandlerId;
  suite: ScenarioSuite;
  releaseRequired: boolean;
  playwright?: { spec: string; project: string };
  injectionProfile?: 'http_401' | 'http_429' | 'http_500';
}

export const QA_SCENARIO_RUNNERS: Record<string, ScenarioRunnerDef> = {
  'ebay.successful-order-import': {
    handler: 'dry-run-ebay-buyer',
    suite: 'sandbox',
    releaseRequired: false,
    playwright: { spec: 'tests/e2e/ebay-connect.spec.ts', project: 'qa-desktop' },
  },
  'ebay.duplicate-order': {
    handler: 'ingest-duplicate-preview',
    suite: 'qa-org',
    releaseRequired: true,
    playwright: { spec: 'tests/e2e/incoming-ebay-zoho-dedup.spec.ts', project: 'qa-desktop' },
  },
  'ebay.expired-token': {
    handler: 'inject-health',
    suite: 'qa-org',
    releaseRequired: true,
    injectionProfile: 'http_401',
  },
  'ebay.missing-required-field': {
    handler: 'ingest-missing-field',
    suite: 'deterministic',
    releaseRequired: true,
  },
  'ebay.provider-rate-limit': {
    handler: 'inject-health',
    suite: 'qa-org',
    releaseRequired: true,
    injectionProfile: 'http_429',
  },
  'ebay.provider-500': {
    handler: 'inject-health',
    suite: 'qa-org',
    releaseRequired: true,
    injectionProfile: 'http_500',
  },
  'zoho.new-purchase-order': {
    handler: 'assert-zoho-po',
    suite: 'qa-org',
    releaseRequired: true,
    playwright: { spec: 'tests/e2e/incoming-ebay-zoho-dedup.spec.ts', project: 'qa-desktop' },
  },
  'zoho.changed-line-quantity': {
    handler: 'zoho-qty-same-line',
    suite: 'deterministic',
    releaseRequired: true,
  },
  'zoho.deleted-item': {
    handler: 'zoho-delete-missing-po',
    suite: 'qa-org',
    releaseRequired: false,
  },
  'zoho.provider-authentic-signature': {
    handler: 'webhook-authentic-signature',
    suite: 'deterministic',
    releaseRequired: true,
  },
  'zoho.duplicate-webhook': {
    handler: 'webhook-normalize-idempotency',
    suite: 'deterministic',
    releaseRequired: true,
  },
  'zoho.out-of-order-webhook': {
    handler: 'webhook-replay-out-of-order',
    suite: 'qa-org',
    releaseRequired: false,
  },
  'shipping.successful-label-purchase': {
    handler: 'refuse-live-label',
    suite: 'deterministic',
    releaseRequired: true,
  },
  'shipping.invalid-address': {
    handler: 'refuse-live-label',
    suite: 'deterministic',
    releaseRequired: true,
  },
  'shipping.carrier-unavailable': {
    handler: 'refuse-live-label',
    suite: 'deterministic',
    releaseRequired: true,
  },
  'shipping.label-purchase-timeout': {
    handler: 'refuse-live-label',
    suite: 'deterministic',
    releaseRequired: true,
  },
  'shipping.duplicate-idempotency-key': {
    handler: 'refuse-live-label',
    suite: 'deterministic',
    releaseRequired: true,
  },
  'fixtures.e2e-outbound': {
    handler: 'assert-orders',
    suite: 'qa-org',
    releaseRequired: true,
    playwright: { spec: 'tests/e2e/pack-placement.spec.ts', project: 'qa-desktop' },
  },
  'fixtures.receiving-carton': {
    handler: 'assert-receiving',
    suite: 'qa-org',
    releaseRequired: true,
    playwright: { spec: 'tests/e2e/unbox-displays-column.spec.ts', project: 'qa-desktop' },
  },
  'fixtures.demo-volume': {
    handler: 'assert-demo',
    suite: 'qa-org',
    releaseRequired: false,
  },
};

export function playwrightCommand(spec: string, project: string): string {
  return `npx playwright test ${spec} --project=${project}`;
}

export function describeScenario(id: string) {
  const scenario = QA_SCENARIOS.find((s) => s.id === id);
  const runner = QA_SCENARIO_RUNNERS[id];
  if (!scenario || !runner) return null;
  return {
    ...scenario,
    ...runner,
    playwrightCommand: runner.playwright
      ? playwrightCommand(runner.playwright.spec, runner.playwright.project)
      : null,
  };
}

export function scenariosInSuite(suite: ScenarioSuite | 'all'): string[] {
  return QA_SCENARIOS.map((s) => s.id).filter((id) => {
    const runner = QA_SCENARIO_RUNNERS[id];
    if (!runner) return false;
    if (suite === 'all') return runner.handler !== 'not-wired';
    if (suite === 'qa-org') return runner.suite === 'qa-org' || runner.suite === 'deterministic';
    return runner.suite === suite;
  });
}
