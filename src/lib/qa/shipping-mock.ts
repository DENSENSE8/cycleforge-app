/**
 * Carrier sandbox/mock label purchase for the QA Console.
 *
 * Uses the same LabelPurchaseResult shape production maps from ShipStation.
 * Never calls a carrier. Live production postage is refused here — a "live
 * production test" is not a normal console feature.
 */

import type { LabelPurchaseResult } from '@/lib/shipping/shipstation/types';

export const QA_LABEL_MOCK_OUTCOMES = [
  'success',
  'invalid_address',
  'carrier_unavailable',
  'timeout',
  'duplicate_idempotency',
] as const;

export type QaLabelMockOutcome = (typeof QA_LABEL_MOCK_OUTCOMES)[number];

export interface QaLabelPurchaseInput {
  outcome: QaLabelMockOutcome;
  /** Caller-claimed carrier environment. Production is always refused. */
  environment: 'sandbox' | 'mock' | 'production';
  idempotencyKey?: string;
}

export interface QaLabelPurchaseResult {
  livePostage: false;
  refusedLive: boolean;
  ok: boolean;
  errorClass: string | null;
  result: LabelPurchaseResult | null;
  notes: string[];
}

const IDEMPOTENCY = new Map<string, LabelPurchaseResult>();

function mockLabel(overrides: Partial<LabelPurchaseResult> = {}): LabelPurchaseResult {
  return {
    labelId: 'qa-mock-label-1',
    status: 'completed',
    engineShipmentId: 'qa-mock-shp-1',
    trackingNumber: '9400100000000000000000',
    carrierCode: 'usps',
    carrierId: 'se-qa-mock',
    serviceCode: 'usps_priority',
    shipDate: '2026-09-02',
    cost: 0,
    currency: 'USD',
    labelDownload: { pdf: 'https://qa.cycleforge.local/mock-label.pdf' },
    ...overrides,
  };
}

export function purchaseMockLabel(input: QaLabelPurchaseInput): QaLabelPurchaseResult {
  const notes = [
    'Mock carrier. Cost is 0. No ShipStation / UPS / FedEx / USPS call.',
    'Live production postage is refused on this surface.',
  ];

  if (input.environment === 'production') {
    return {
      livePostage: false,
      refusedLive: true,
      ok: false,
      errorClass: 'LivePostageRefused',
      result: null,
      notes: [
        ...notes,
        'Environment is production. QA Console will not buy live postage.',
      ],
    };
  }

  if (input.outcome === 'invalid_address') {
    return {
      livePostage: false,
      refusedLive: false,
      ok: false,
      errorClass: 'AddressInvalid',
      result: null,
      notes: [...notes, 'Mock classified this as AddressInvalid — same error class a sandbox carrier should return.'],
    };
  }
  if (input.outcome === 'carrier_unavailable') {
    return {
      livePostage: false,
      refusedLive: false,
      ok: false,
      errorClass: 'ProviderUnavailable',
      result: null,
      notes: [...notes, 'Mock classified this as ProviderUnavailable (carrier 5xx).'],
    };
  }
  if (input.outcome === 'timeout') {
    return {
      livePostage: false,
      refusedLive: false,
      ok: false,
      errorClass: 'ProviderTimeout',
      result: null,
      notes: [...notes, 'Mock classified this as ProviderTimeout.'],
    };
  }

  const key = input.idempotencyKey ?? 'qa-label-default';
  const existing = IDEMPOTENCY.get(key);
  if (input.outcome === 'duplicate_idempotency' && existing) {
    return {
      livePostage: false,
      refusedLive: false,
      ok: true,
      errorClass: null,
      result: existing,
      notes: [...notes, `Idempotent replay of ${existing.labelId} — no second purchase.`],
    };
  }

  const result = mockLabel({
    labelId: existing?.labelId ?? `qa-mock-label-${key.slice(0, 12)}`,
  });
  IDEMPOTENCY.set(key, result);
  return {
    livePostage: false,
    refusedLive: false,
    ok: true,
    errorClass: null,
    result,
    notes: [
      ...notes,
      input.outcome === 'duplicate_idempotency'
        ? 'First purchase stored under the idempotency key.'
        : 'Sandbox/mock label stored in memory only — not written to shipments.',
    ],
  };
}

/** Test helper — the in-memory idempotency map is process-local. */
export function resetMockLabelIdempotency(): void {
  IDEMPOTENCY.clear();
}
