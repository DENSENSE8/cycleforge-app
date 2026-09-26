/** Mobile scan verdict — the pure map from a {@link LookupPoResolution} to the one-glance outcome a door operator reads off a phone at… */

import type { LookupPoData, LookupPoResolution } from '@/lib/receiving/scan';

/** Outcome class. */
type MobileScanTone = 'matched' | 'expedited' | 'unfound' | 'miss' | 'error';

interface MobileScanVerdict {
  tone: MobileScanTone;
  /** Big glanceable word — sized to be read without stopping work. */
  headline: string;
  /** The scanned value echoed back, so a misread gun is visible immediately. */
  scanned: string;
  /** One line of supporting detail (POs, line count, or the server's reason). */
  detail: string | null;
  poIds: string[];
  lineCount: number;
  /** Carton to open (`/m/r/[id]`), when the scan resolved or created one. */
  receivingId: number | null;
  /** Audio/haptic cue kind for {@link useScanFeedback}. */
  feedback: 'success' | 'reject';
}

// ── defensive readers (LookupPoData is deliberately loose) ───────────────────

function readString(data: LookupPoData, key: string): string | null {
  const v = data[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function readStringArray(data: LookupPoData, key: string): string[] {
  const v = data[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : [];
}

function readCount(data: LookupPoData, key: string): number {
  const v = data[key];
  return Array.isArray(v) ? v.length : 0;
}

function readReceivingId(data: LookupPoData): number | null {
  const n = Number(data.receiving_id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** `"PO-1 · PO-2"`, or null when the response carried no PO identity. */
function poLabel(poIds: string[]): string | null {
  if (poIds.length === 0) return null;
  if (poIds.length <= 2) return poIds.join(' · ');
  return `${poIds.slice(0, 2).join(' · ')} +${poIds.length - 2}`;
}

function pluralLines(n: number): string {
  return `${n} ${n === 1 ? 'line' : 'lines'}`;
}

// ── the branch table ─────────────────────────────────────────────────────────

/**
 * Classify a resolved scan. One switch, one place — the banner and the cue both
 * derive from the result rather than each re-reading the raw response.
 */
export function buildScanVerdict(
  scanned: string,
  resolution: LookupPoResolution,
): MobileScanVerdict {
  const data = resolution.data;
  const poIds = readStringArray(data, 'po_ids');
  const lineCount = readCount(data, 'lines');
  const receivingId = readReceivingId(data);

  const base = { scanned, poIds, lineCount, receivingId };

  if (resolution.kind === 'integration-error') {
    return {
      ...base,
      tone: 'error',
      headline: 'NOT CONNECTED',
      detail: 'PO matched but its items could not load — reconnect the inventory integration.',
      feedback: 'reject',
    };
  }

  if (resolution.kind === 'not_found') {
    return {
      ...base,
      tone: 'miss',
      headline: 'NO MATCH',
      // The server's own reason names WHICH identity missed (order#, ticket#,
      // carrier) — strictly better than a generic client sentence.
      detail: readString(data, 'error') ?? 'Nothing in the system matches this label.',
      feedback: 'reject',
    };
  }

  if (resolution.kind === 'unmatched') {
    const reason = readString(data, 'exception_reason');
    return {
      ...base,
      tone: 'unfound',
      headline: 'UNFOUND',
      // An unmatched door scan is NOT a failure — a carton was created and is
      // now queued for triage. Say so, or the operator re-scans it forever.
      detail: reason
        ? `Carton logged for triage — ${reason}`
        : 'No PO match. Carton logged for triage.',
      feedback: 'reject',
    };
  }

  // Matched. `unbox_verdict === 'expedited'` means a pending customer order is
  // waiting on SKUs inside this carton — the door operator's next move changes,
  // so it gets its own headline instead of reading as a routine match.
  const expedited = data.unbox_verdict === 'expedited';
  const pending = readCount(data, 'pending_order_skus');
  const multiPo = data.multi_po_warning === true;

  const parts = [poLabel(poIds), pluralLines(lineCount)].filter(Boolean) as string[];
  if (expedited && pending > 0) parts.push(`${pending} awaiting an order`);
  if (multiPo) parts.push('multiple POs — triage');

  return {
    ...base,
    tone: expedited ? 'expedited' : 'matched',
    headline: expedited ? 'RUSH' : 'MATCHED',
    detail: parts.length ? parts.join(' · ') : null,
    feedback: 'success',
  };
}

/** The throw path. */
export function scanFailureVerdict(scanned: string, error: unknown): MobileScanVerdict {
  const message = error instanceof Error ? error.message : '';
  return {
    tone: 'error',
    headline: 'SCAN FAILED',
    scanned,
    detail: message || 'Could not reach the server. Scan again once you have signal.',
    poIds: [],
    lineCount: 0,
    receivingId: null,
    feedback: 'reject',
  };
}
