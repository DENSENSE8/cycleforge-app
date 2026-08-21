/**
 * Bench-tester fixtures for the welded receive feedback panel.
 *
 * WHY THIS EXISTS: every state this panel can reach is downstream of a real
 * carton, a real PO link, a live Zoho round trip, or a realtime verdict that
 * arrives seconds later. Refining the paint of "inventory sync cooldown" by
 * provoking an actual circuit-breaker trip is not a workflow. So the states are
 * fixtures, and the panel renders them through exactly the same code path a
 * real receive uses — `ReceiveInFlight` / `ReceiveResult` in, nothing mocked
 * inside the component.
 *
 * THAT IS THE POINT, and it is also the constraint: a scenario is a genuine
 * value of the shipped union, not a "preview mode" branch inside the panel. If
 * a fixture cannot express a state, the state is unreachable in production too
 * — which is information, not an excuse to special-case the renderer.
 *
 * The two verdicts a fixture genuinely cannot reach through the front door
 * (`confirmed`, background-`failed`) come in through `demoStatus`, the one
 * field on `ReceiveResult` that exists only for this file. See its docblock.
 *
 * Pure and dependency-free so the shape stays unit-testable.
 */

import { PHOTO_POLICY_ERROR_CODE } from '@/lib/receiving/photo-policy-override-wire';
import type {
  ReceiveInFlight,
  ReceiveIntent,
  ReceiveResult,
  ReceiveSummary,
} from './line-edit/hooks/useReceiveAction';

export type ReceiveFeedbackScenario = {
  id: string;
  /** Button label on the tester. */
  label: string;
  /** Which tone the panel should land on — the tester asserts nothing; this
   *  is the operator-facing note for what you are about to look at. */
  expect: 'loading' | 'success' | 'warning' | 'error';
  /** One line on what makes this state different. */
  hint: string;
};

export type ReceiveFeedbackState = {
  receiving: ReceiveInFlight | null;
  receiveResult: ReceiveResult | null;
};

const summary = (over: Partial<ReceiveSummary> = {}): ReceiveSummary => ({
  markedReceived: true,
  descriptionsUpdated: 0,
  notesUpdated: false,
  localOnly: false,
  intent: 'zoho_receive',
  isUnfound: false,
  alreadyReceived: false,
  itemDescription: null,
  poNotes: null,
  photoPolicyWaiver: null,
  ...over,
});

const response = (over: Partial<ReceiveResult & { at: number }> = {}, at = 0) => ({
  at,
  durationMs: 812,
  httpStatus: 200,
  ok: true,
  body: { success: true, zoho: { attempted: 1, ok: true } },
  ...(over as object),
});

const success = (
  at: number,
  over: Partial<Extract<ReceiveResult, { kind: 'success' }>>,
): ReceiveResult => ({
  kind: 'success',
  at,
  summary: summary(),
  receivingId: 90210,
  lineIds: [4242],
  reconcile: false,
  response: response({}, at),
  ...over,
});

const diagnostic = (
  at: number,
  intent: ReceiveIntent,
  httpStatus: number,
  body: unknown,
  extra: { networkError?: string; syncTimeoutPending?: boolean; ok?: boolean } = {},
): ReceiveResult => ({
  kind: 'diagnostic',
  intent,
  response: {
    at,
    durationMs: 1_140,
    httpStatus,
    ok: extra.ok ?? false,
    body,
    ...(extra.networkError ? { networkError: extra.networkError } : {}),
    ...(extra.syncTimeoutPending ? { syncTimeoutPending: true } : {}),
  },
});

/**
 * The catalogue, in the order an operator walks a receive: what it looks like
 * while it runs, what it looks like when it lands well, and then every way it
 * can land badly.
 */
export const RECEIVE_FEEDBACK_SCENARIOS: ReceiveFeedbackScenario[] = [
  {
    id: 'in_flight',
    label: 'In flight',
    expect: 'loading',
    hint: 'Spinner, live elapsed counter, sweep on the weld seam. One step — a single round trip has no sub-stages to narrate.',
  },
  {
    id: 'in_flight_slow',
    label: 'In flight · slow',
    expect: 'loading',
    hint: 'Past the 6s threshold, so a second step exists and the ticker cycles. Watch the crossfade.',
  },
  {
    id: 'reconciling',
    label: 'Reconciling',
    expect: 'loading',
    hint: 'Committed locally; waiting on the inventory verdict. The ticker cycles the writes the server already reported.',
  },
  {
    id: 'confirmed',
    label: 'Confirmed',
    expect: 'success',
    hint: 'The realtime zohoReceive verdict came back ok.',
  },
  {
    id: 'complete',
    label: 'Receive complete',
    expect: 'success',
    hint: 'Clean settle, no reconcile. Three checks live behind More.',
  },
  {
    id: 'already_received',
    label: 'Already received',
    expect: 'success',
    hint: 'Zoho was already fully received; local state caught up.',
  },
  {
    id: 'scan_only',
    label: 'Scanned locally',
    expect: 'success',
    hint: 'Quantities saved as Scanned. Inventory deliberately untouched.',
  },
  {
    id: 'unreceived',
    label: 'Unreceived',
    expect: 'success',
    hint: 'Full undo — quantities cleared, PO reversed in the background.',
  },
  {
    id: 'unfound_local',
    label: 'Received locally',
    expect: 'success',
    hint: 'Unfound carton. Label printed, no PO to reconcile against.',
  },
  {
    id: 'waived',
    label: 'Waived photos',
    expect: 'warning',
    hint: 'It committed, but carrying an open exception. Amber outranks the green headline.',
  },
  {
    id: 'sync_failed',
    label: 'Background sync failed',
    expect: 'warning',
    hint: 'Optimistic checks reconciled against a failed verdict. Retry CTA appears.',
  },
  {
    id: 'photo_policy',
    label: 'Photos required',
    expect: 'warning',
    hint: 'Hard 409. The CTA is the waiver sheet — the long path (shoot the photos) is still the right one.',
  },
  {
    id: 'no_po_link',
    label: 'No PO link',
    expect: 'warning',
    hint: 'Saved locally, inventory skipped. Long headline — check that it truncates rather than shoving the actions off.',
  },
  {
    id: 'cooldown',
    label: 'Sync cooldown',
    expect: 'warning',
    hint: 'Circuit breaker open. Recoverable: the PO replays once the connection recovers.',
  },
  {
    id: 'sync_pending',
    label: 'Sync timeout',
    expect: 'warning',
    hint: 'Client aborted at 30s while the push may still be running detached.',
  },
  {
    id: 'rate_limit',
    label: 'Quota exhausted',
    expect: 'error',
    hint: 'Daily inventory API quota gone.',
  },
  {
    id: 'api_error',
    label: 'Inventory rejected',
    expect: 'error',
    hint: 'Zoho returned an error. Per-PO outcomes live behind More.',
  },
  {
    id: 'network',
    label: 'Network error',
    expect: 'error',
    hint: 'Never reached the server.',
  },
];

/**
 * Resolve a scenario to the props the region takes.
 *
 * `now` is a PARAMETER, not `Date.now()` inside — the fixtures are a pure
 * function of it, so they stay testable, and every activation re-stamps `at`
 * so the panel remounts and replays its peel instead of silently reusing the
 * previous scenario's mounted state.
 */
export function receiveFeedbackState(id: string, now: number): ReceiveFeedbackState {
  const none: ReceiveFeedbackState = { receiving: null, receiveResult: null };

  switch (id) {
    case 'in_flight':
      return { receiving: { startedAt: now, intent: 'zoho_receive' }, receiveResult: null };

    case 'in_flight_slow':
      // Started 8s ago — past SLOW_RECEIVE_MS, so a second step exists.
      return { receiving: { startedAt: now - 8_000, intent: 'zoho_receive' }, receiveResult: null };

    case 'reconciling':
      return {
        receiving: null,
        receiveResult: success(now, {
          reconcile: true,
          demoStatus: 'pending',
          summary: summary({ descriptionsUpdated: 3, notesUpdated: true }),
        }),
      };

    case 'confirmed':
      return {
        receiving: null,
        receiveResult: success(now, {
          reconcile: true,
          demoStatus: 'confirmed',
          summary: summary({ descriptionsUpdated: 1, notesUpdated: true }),
        }),
      };

    case 'complete':
      return {
        receiving: null,
        receiveResult: success(now, {
          summary: summary({
            descriptionsUpdated: 2,
            notesUpdated: true,
            itemDescription: 'SN: C02X1234JGH5 · Grade B — light scuffing on the lid',
            poNotes: 'Received at the Unbox bench. 2 of 2 lines.',
          }),
        }),
      };

    case 'already_received':
      return {
        receiving: null,
        receiveResult: success(now, { summary: summary({ alreadyReceived: true }) }),
      };

    case 'scan_only':
      return {
        receiving: null,
        receiveResult: success(now, {
          summary: summary({ intent: 'scan_only', localOnly: true, markedReceived: false }),
        }),
      };

    case 'unreceived':
      return {
        receiving: null,
        receiveResult: success(now, {
          summary: summary({ intent: 'unreceive', markedReceived: false }),
        }),
      };

    case 'unfound_local':
      return {
        receiving: null,
        receiveResult: success(now, {
          summary: summary({ intent: 'local_receive', localOnly: true, isUnfound: true }),
        }),
      };

    case 'waived':
      return {
        receiving: null,
        receiveResult: success(now, {
          summary: summary({
            photoPolicyWaiver: {
              reasonCode: 'PHOTO_WAIVED_NO_DEVICE',
              blockers: ['No carton photo', 'No serial photo'],
            },
          }),
        }),
      };

    case 'sync_failed':
      return {
        receiving: null,
        receiveResult: success(now, {
          reconcile: true,
          demoStatus: 'failed',
          summary: summary({ descriptionsUpdated: 2 }),
        }),
      };

    case 'photo_policy':
      return {
        receiving: null,
        receiveResult: diagnostic(now, 'zoho_receive', 409, {
          error: PHOTO_POLICY_ERROR_CODE,
          blockers: ['Carton photo required', 'Serial photo required'],
        }),
      };

    case 'no_po_link':
      return {
        receiving: null,
        receiveResult: diagnostic(
          now,
          'zoho_receive',
          200,
          { success: true, zoho: { attempted: 0, ok: true, skip_reason: 'no_zoho_link' } },
          { ok: true },
        ),
      };

    case 'cooldown':
      return {
        receiving: null,
        receiveResult: diagnostic(
          now,
          'zoho_receive',
          200,
          {
            success: true,
            zoho: {
              attempted: 0,
              ok: true,
              skip_reason: 'zoho_circuit_open',
              circuit: { isOpen: true, retryAfterMs: 42_000, consecutiveFailures: 5 },
            },
          },
          { ok: true },
        ),
      };

    case 'sync_pending':
      return {
        receiving: null,
        receiveResult: diagnostic(now, 'zoho_receive', 0, null, { syncTimeoutPending: true }),
      };

    case 'rate_limit':
      return {
        receiving: null,
        receiveResult: diagnostic(
          now,
          'zoho_receive',
          200,
          {
            success: true,
            zoho: {
              attempted: 1,
              ok: false,
              rate_limited: true,
              error: 'Zoho API daily call limit reached for this organization.',
            },
          },
          { ok: true },
        ),
      };

    case 'api_error':
      return {
        receiving: null,
        receiveResult: diagnostic(
          now,
          'zoho_receive',
          200,
          {
            success: true,
            zoho: {
              attempted: 2,
              ok: false,
              error: 'Invalid value passed for purchaseorder_id.',
              results: [
                { purchaseorder_id: '4471000001234567', receive_id: '4471000009876543' },
                {
                  purchaseorder_id: '4471000007654321',
                  receive_id: null,
                  error: 'Invalid value passed for purchaseorder_id.',
                  error_kind: 'api' as const,
                },
              ],
            },
          },
          { ok: true },
        ),
      };

    case 'network':
      return {
        receiving: null,
        receiveResult: diagnostic(now, 'zoho_receive', 0, null, {
          networkError: 'Failed to fetch — the request never reached the server.',
        }),
      };

    default:
      return none;
  }
}
