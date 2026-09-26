/** Client-side packer verification flow (plan §2d). */

import type { PackVerificationOutcome } from './pack-verification-outcomes';
import type {
  WmsExecutionCommand,
  WmsExecutionCommandReceipt,
} from '@/components/mobile/realtime/WmsRealtimeProvider';
import { safeRandomUUID } from '@/lib/safe-uuid';

/** The shape GET /api/orders/verify returns for a found order (subset we use). */
interface OrdersVerifyResult {
  found: boolean;
  orderId?: string | null;
  tracking?: string | null;
}

type PackCaptureOutcome = Extract<
  PackVerificationOutcome,
  'VERIFIED' | 'ERROR_MISSING_TRACKING' | 'ERROR_OCR_FAILED'
>;

interface ResolvedPackOutcome {
  outcome: PackCaptureOutcome;
  detectedTracking: string | null;
  detectedOrderId: string | null;
}

/** Map the tracking cross-check to the packer capture outcome (plan §2d): */
export function resolvePackVerifyOutcome(input: {
  tracking: string | null | undefined;
  verify: OrdersVerifyResult | null;
}): ResolvedPackOutcome {
  const tracking = (input.tracking ?? '').trim();
  if (!tracking) {
    return { outcome: 'ERROR_OCR_FAILED', detectedTracking: null, detectedOrderId: null };
  }
  const found = input.verify?.found === true;
  return {
    outcome: found ? 'VERIFIED' : 'ERROR_MISSING_TRACKING',
    detectedTracking: tracking,
    detectedOrderId: (input.verify?.orderId ?? null) || null,
  };
}

/** Pull a tracking-number candidate out of raw slip OCR text (plan §2c). */
export function extractTrackingCandidate(rawText: string | null | undefined): string | null {
  const text = (rawText ?? '').toUpperCase();
  if (!text) return null;
  const ups = text.match(/1Z[0-9A-Z]{16}/);
  if (ups) return ups[0];
  const digitRuns = text.match(/\d{12,22}/g);
  if (digitRuns && digitRuns.length > 0) {
    return digitRuns.reduce((a, b) => (b.length >= a.length ? b : a));
  }
  return null;
}

/** Cross-check one tracking number against the ERP. Best-effort: a non-OK
 *  response or network error resolves to `null` (→ treated as unconfirmable). */
async function fetchOrdersVerify(tracking: string): Promise<OrdersVerifyResult | null> {
  const t = tracking.trim();
  if (!t) return null;
  try {
    const res = await fetch(`/api/orders/verify?tracking=${encodeURIComponent(t)}`);
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (data && typeof data.found === 'boolean') {
      return { found: data.found, orderId: data.orderId ?? null, tracking: data.tracking ?? null };
    }
    return null;
  } catch {
    return null;
  }
}

interface SubmitPackVerificationArgs {
  packerLogId: number;
  /** Confirmed tracking (OCR-detected then operator-confirmed, or manual). */
  tracking: string | null;
  clientEventId?: string | null;
  ocrConfidence?: number | null;
  meta?: Record<string, unknown> | null;
}

interface SubmitPackVerificationResult {
  ok: boolean;
  outcome: PackVerificationOutcome;
  status: number;
  body: unknown;
}

/**
 * The full Done flow: cross-check → resolve outcome → POST the capture event.
 * Returns the resolved outcome regardless of the POST result so the UI can show
 * a prominent warning on ERROR_* and still route the order to the review queue.
 */
export async function submitPackVerification(
  args: SubmitPackVerificationArgs,
  execute: (command: WmsExecutionCommand) => Promise<WmsExecutionCommandReceipt>,
  identity: { organizationId: string; staffId: number },
): Promise<SubmitPackVerificationResult> {
  const tracking = (args.tracking ?? '').trim();
  const verify = tracking ? await fetchOrdersVerify(tracking) : null;
  const resolved = resolvePackVerifyOutcome({ tracking, verify });

  const commandId = args.clientEventId ?? safeRandomUUID();
  const receipt = await execute({
    v: 1,
    commandId,
    organizationId: identity.organizationId,
    staffId: identity.staffId,
    issuedAt: new Date().toISOString(),
    name: 'pack.verify',
    input: {
      packerLogId: args.packerLogId,
      outcome: resolved.outcome,
      detectedTracking: resolved.detectedTracking,
      detectedOrderId: resolved.detectedOrderId,
      ocrConfidence: args.ocrConfidence ?? null,
      meta: args.meta ?? null,
    },
  });
  return { ok: true, outcome: resolved.outcome, status: 200, body: receipt.data };
}
