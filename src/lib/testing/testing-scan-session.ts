/** Testing-mode scan session: */

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { ResolvedVia } from '@/lib/testing/resolve-testing-scan';

export type TestingScanSessionPhase = 'idle' | 'anchored' | 'confirmed';

export interface TestingScanSession {
  phase: TestingScanSessionPhase;
  /** Tracking / STN that anchored the session (raw scanned value). */
  trackingRef: string | null;
  /** Receiving line opened from the STN (or from a direct unit scan). */
  line: ReceivingLineRow | null;
  /** Unit key confirmed by the second scan (unit_uid / U-handle / serial). */
  unitKey: string | null;
  /** How the most recent scan was classified. */
  lastVia: ResolvedVia | null;
}

export const INITIAL_TESTING_SCAN_SESSION: TestingScanSession = {
  phase: 'idle',
  trackingRef: null,
  line: null,
  unitKey: null,
  lastVia: null,
};

type TestingScanSessionEvent =
  | { type: 'ANCHOR_TRACKING'; trackingRef: string; line: ReceivingLineRow; via: ResolvedVia }
  | { type: 'CONFIRM_UNIT'; unitKey: string; line: ReceivingLineRow; via: ResolvedVia }
  | { type: 'OPEN_LINE'; line: ReceivingLineRow; via: ResolvedVia; value: string }
  | { type: 'RESET' };

/**
 * Does this unit-label scan belong to the STN-anchored line?
 * Matches by receiving_line id, or by shared tracking_number when the unit
 * landed on a sibling line of the same carton.
 */
export function unitBelongsToAnchor(
  anchored: ReceivingLineRow,
  unitLine: ReceivingLineRow,
): boolean {
  if (anchored.id != null && unitLine.id != null && anchored.id === unitLine.id) return true;
  if (
    anchored.receiving_id != null &&
    unitLine.receiving_id != null &&
    anchored.receiving_id === unitLine.receiving_id
  ) {
    return true;
  }
  const aTrk = String(anchored.tracking_number || '').trim();
  const uTrk = String(unitLine.tracking_number || '').trim();
  if (aTrk && uTrk && aTrk === uTrk) return true;
  return false;
}

export function testingScanSessionReducer(
  state: TestingScanSession,
  event: TestingScanSessionEvent,
): TestingScanSession {
  switch (event.type) {
    case 'RESET':
      return INITIAL_TESTING_SCAN_SESSION;

    case 'ANCHOR_TRACKING':
      return {
        phase: 'anchored',
        trackingRef: event.trackingRef,
        line: event.line,
        unitKey: null,
        lastVia: event.via,
      };

    case 'CONFIRM_UNIT': {
      // If we already have an STN anchor, keep it and confirm the unit on
      // (possibly) an updated line row that carries serials.
      if (state.phase === 'anchored' || state.phase === 'confirmed') {
        const ok =
          state.line == null || unitBelongsToAnchor(state.line, event.line);
        return {
          phase: ok ? 'confirmed' : 'confirmed',
          trackingRef: state.trackingRef ?? (String(event.line.tracking_number || '').trim() || null),
          line: event.line,
          unitKey: event.unitKey,
          lastVia: event.via,
        };
      }
      // Direct unit scan with no prior STN — still confirm so the feedback
      // card can show SKU + serials; tracking comes from the line.
      return {
        phase: 'confirmed',
        trackingRef: String(event.line.tracking_number || '').trim() || null,
        line: event.line,
        unitKey: event.unitKey,
        lastVia: event.via,
      };
    }

    case 'OPEN_LINE':
      // Generic line open (PO / SKU / carton) — soft-anchor without a unit.
      return {
        phase: 'anchored',
        trackingRef:
          event.via === 'tracking'
            ? event.value
            : (String(event.line.tracking_number || '').trim() || state.trackingRef),
        line: event.line,
        unitKey: null,
        lastVia: event.via,
      };

    default:
      return state;
  }
}
