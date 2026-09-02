import { readPhotoPolicyBlock } from '@/lib/receiving/photo-policy-override-wire';

/**
 * Pure verdict mapping for POST /api/receiving/mark-received-po responses.
 * Kept free of React so Unbox + unit tests share one SoT.
 */

export type ReceiveResponseClassifyInput = {
  at: number;
  durationMs: number;
  httpStatus: number;
  ok: boolean;
  body: unknown;
  networkError?: string;
  /** Client 30s abort while Zoho push may still be running detached. */
  syncTimeoutPending?: boolean;
};

type ZohoResultRow = {
  purchaseorder_id?: string;
  receive_id?: string | null;
  error?: string | null;
  error_kind?: 'rate_limit' | 'circuit_open' | 'api' | 'other' | null;
};

type ReceiveResponseClassification = {
  verdict:
    | 'success'
    | 'skipped'
    | 'rate_limit'
    | 'circuit_open'
    | 'api_error'
    | 'http_error'
    | 'network'
    | 'photo_policy'
    | 'sync_pending';
  headline: string;
  detail: string;
  tone: 'emerald' | 'amber' | 'rose';
};

export function classifyReceiveResponse(
  r: ReceiveResponseClassifyInput,
): ReceiveResponseClassification {
  if (r.syncTimeoutPending) {
    return {
      verdict: 'sync_pending',
      headline: 'Inventory sync still running',
      tone: 'amber',
      detail:
        'Local receive likely saved — refresh if the line stays Unboxed. Do not click Receive again.',
    };
  }
  if (r.networkError) {
    return {
      verdict: 'network',
      headline: 'Network error',
      tone: 'rose',
      detail: r.networkError,
    };
  }
  const body = (r.body || {}) as Record<string, unknown>;
  // Photo-policy insurance gate (WS-PHOTO Plan 5): a 409 with structured
  // blockers from the mark-received routes. Amber, not rose — the fix is at
  // the bench (take the required photos), not a system failure. Blockers come
  // from the shared evaluator, so this copy matches the preflight disabled
  // reason exactly.
  const photoBlock = r.ok ? null : readPhotoPolicyBlock(r.httpStatus, body);
  if (photoBlock) {
    return {
      verdict: 'photo_policy',
      headline: 'Photos required before receive',
      tone: 'amber',
      detail:
        photoBlock.blockers.length > 0
          ? photoBlock.blockers.join(' · ')
          : 'This carton is missing the photos your org requires at receive.',
    };
  }
  if (!r.ok) {
    const zoho = (body.zoho || {}) as {
      attempted?: number;
      ok?: boolean;
      error?: string | null;
      rate_limited?: boolean;
      results?: ZohoResultRow[];
    };
    const errParts: string[] = [];
    if (typeof body.error === 'string' && body.error.trim()) errParts.push(body.error.trim());
    if (typeof zoho.error === 'string' && zoho.error.trim()) errParts.push(zoho.error.trim());
    for (const row of zoho.results ?? []) {
      if (typeof row.error === 'string' && row.error.trim()) {
        errParts.push(row.error.trim());
        break;
      }
    }
    const detail =
      errParts.length > 0
        ? [...new Set(errParts)].join(' · ')
        : 'Request did not complete successfully. Expand Raw response below for details.';
    const http2xx = r.httpStatus >= 200 && r.httpStatus < 300;
    if (http2xx && zoho.rate_limited) {
      return {
        verdict: 'rate_limit',
        headline: 'Inventory sync quota exhausted',
        tone: 'rose',
        detail,
      };
    }
    if (http2xx && Number(zoho.attempted ?? 0) > 0 && zoho.ok === false) {
      return {
        verdict: 'api_error',
        headline: 'Inventory system rejected the purchase receive',
        tone: 'rose',
        detail,
      };
    }
    if (http2xx) {
      return {
        verdict: 'http_error',
        headline: 'Receive failed',
        tone: 'rose',
        detail,
      };
    }
    return {
      verdict: 'http_error',
      headline: `Server error · HTTP ${r.httpStatus}`,
      tone: 'rose',
      detail,
    };
  }
  const zoho = (body.zoho || {}) as {
    attempted?: number;
    ok?: boolean;
    rate_limited?: boolean;
    error?: string | null;
    skip_reason?: string | null;
    results?: ZohoResultRow[];
    circuit?: { isOpen?: boolean; retryAfterMs?: number; consecutiveFailures?: number };
  };
  if (zoho.skip_reason === 'zoho_circuit_open') {
    // Cooldown is recoverable, not a hard failure: the lines committed locally
    // and the background sync replays once Zoho's breaker closes. Amber, with a
    // concrete retry window (surfaced from the server's in-process breaker —
    // this is what replaced the former 3s client-side /api/zoho/health check).
    const secs = Math.max(1, Math.ceil((zoho.circuit?.retryAfterMs ?? 0) / 1000));
    return {
      verdict: 'circuit_open',
      headline: `Inventory sync cooldown — retry in ~${secs}s`,
      tone: 'amber',
      detail: `Circuit breaker open after ${zoho.circuit?.consecutiveFailures ?? 0} recent sync failures. Lines saved locally and stay in Scanned; the PO syncs once the connection recovers.`,
    };
  }
  if (zoho.skip_reason === 'zoho_already_fully_received') {
    return {
      verdict: 'success',
      headline: 'Success — PO has been marked as received',
      tone: 'emerald',
      detail: '',
    };
  }
  if (zoho.skip_reason === 'no_receiving_lines') {
    return {
      verdict: 'skipped',
      headline: 'No lines on this shipment',
      tone: 'amber',
      detail: 'There are no receiving_lines rows for this package yet.',
    };
  }
  if (zoho.skip_reason === 'inventory_not_connected') {
    return {
      verdict: 'skipped',
      headline: 'Inventory NOT updated — reconnect Zoho',
      tone: 'amber',
      detail:
        'Lines were saved locally but no active inventory connection is available. Open Settings → Integrations, reconnect Zoho, then retry Receive on the PO.',
    };
  }
  if (zoho.skip_reason === 'inventory_credentials_unreadable') {
    return {
      verdict: 'api_error',
      headline: 'Could not receive in Zoho Inventory',
      tone: 'rose',
      detail:
        zoho.error ||
        'The Zoho vault row is Connected but this process cannot decrypt it. Local and production must share INTEGRATION_KMS_KEY (or set INTEGRATION_KMS_KEY_PREVIOUS to the other environment’s key), then retry Receive.',
    };
  }
  if (zoho.skip_reason === 'no_zoho_link') {
    return {
      verdict: 'skipped',
      headline: 'Inventory NOT updated — no PO link',
      tone: 'amber',
      detail:
        'No purchase-order link is attached to this package. Click the refresh icon to sync purchase orders first, then try again.',
    };
  }
  if (zoho.skip_reason === 'scan_only') {
    return {
      verdict: 'success',
      headline: 'Success — line marked as scanned',
      tone: 'emerald',
      detail: '',
    };
  }
  if (zoho.skip_reason === 'unreceive') {
    return {
      verdict: 'success',
      headline: 'Success — unmarked as received',
      tone: 'emerald',
      detail: '',
    };
  }
  if (zoho.skip_reason === 'received_local' || zoho.skip_reason === 'unfound_no_po') {
    // Unfound carton received locally — lines are RECEIVED, Zoho is
    // intentionally not touched (there is no PO to reconcile against).
    return {
      verdict: 'success',
      headline: 'Received locally — inventory not updated',
      tone: 'emerald',
      detail: '',
    };
  }
  if (!zoho.attempted) {
    return {
      verdict: 'skipped',
      headline: 'Inventory NOT updated — no PO link',
      tone: 'amber',
      detail:
        'Lines were saved locally but no purchase-order link is attached to this package. Click the refresh icon to sync purchase orders first, then try again.',
    };
  }
  if (zoho.rate_limited) {
    return {
      verdict: 'rate_limit',
      headline: 'Inventory sync quota exhausted',
      tone: 'rose',
      detail:
        'Saved locally, but the inventory purchase receive was rejected with a rate limit. Wait for the daily reset or pause other inventory-sync workflows.',
    };
  }
  const firstErrorKind = zoho.results?.find((x) => x.error_kind)?.error_kind ?? null;
  if (!zoho.ok && firstErrorKind === 'circuit_open') {
    return {
      verdict: 'circuit_open',
      headline: 'Inventory sync circuit breaker tripped',
      tone: 'rose',
      detail:
        zoho.error ||
        'Recent sync failures caused new requests to pause for a cooldown window. Retry in a minute.',
    };
  }
  if (!zoho.ok) {
    return {
      verdict: 'api_error',
      headline: 'Inventory system rejected the receive',
      tone: 'rose',
      detail:
        zoho.error ||
        'The inventory system returned an error — see the raw response below for the exact reason.',
    };
  }
  return {
    verdict: 'success',
    headline: 'Success — PO has been marked as received',
    tone: 'emerald',
    detail: '',
  };
}
