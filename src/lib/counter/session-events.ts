/** Counter session events — the pure reducer behind the desk↔iPad shared cart. */

import type { KioskCartLine } from '@/lib/kiosk/cart-line';
import { isBuybackPayload, isLinkedRepairLine, isRepairPayload } from '@/lib/kiosk/cart-line';
import { KIOSK_FALLBACK_COMMAND, type KioskCommandId } from '@/lib/kiosk/commands';
import {
  consultStanceFromFace,
  EMPTY_CONSULT_PRESENTATION,
  type ConsultPresentation,
  type ConsultStance,
} from '@/lib/counter/consult-stance';

export type { ConsultStance };

// ── Session shape ───────────────────────────────────────────────────────────

export const COUNTER_SESSION_STATUSES = ['open', 'parked', 'submitted', 'voided'] as const;

/** Mirrors `counter_sessions_status_chk`. Keep the two in lockstep. */
export type CounterSessionStatus = (typeof COUNTER_SESSION_STATUSES)[number];

export function isCounterSessionStatus(value: string): value is CounterSessionStatus {
  return (COUNTER_SESSION_STATUSES as readonly string[]).includes(value);
}

/** Which side published an event. `server` is the orchestrator, not a device. */
export type CounterSessionActor = 'desk' | 'kiosk' | 'server';

/** Which face the kiosk is showing. The desk decides; the tablet obeys. */
export type CounterSessionFace = 'staff' | 'customer';

export const COUNTER_PAYMENT_STATES = [
  'idle',
  'awaiting_card',
  'approved',
  'declined',
  'canceled',
] as const;

/** Card-present state (SQ2). */
export type CounterPaymentState = (typeof COUNTER_PAYMENT_STATES)[number];

function isCounterPaymentState(value: string): value is CounterPaymentState {
  return (COUNTER_PAYMENT_STATES as readonly string[]).includes(value);
}

/** Terminal states that end a checkout — the cart becomes editable again. */
export function isTerminalPaymentOutcome(state: CounterPaymentState): boolean {
  return state === 'approved' || state === 'declined' || state === 'canceled';
}

/** A staged line, in the session. */
export interface CounterSessionLine extends KioskCartLine {
  sortIndex: number;
  /** ms epoch. Non-null = struck through on the desk, absent for the customer. */
  voidedAtMs: number | null;
  voidReason: string | null;
  voidedByStaffId: number | null;
}

export interface CounterSessionCustomer {
  phone: string;
  name: string;
  email: string;
  address?: string;
}

export interface CounterSessionSnapshot {
  sessionId: number;
  /** Monotonic; bumped by the server on every accepted mutation. */
  version: number;
  status: CounterSessionStatus;
  /** The paired tablet this session is bound to, or null while desk-only. */
  kioskDeviceId: number | null;
  /** Lease holder (plan D4). Null = unclaimed; the tablet runs its local cart. */
  claimedByStaffId: number | null;
  claimedByStaffName: string | null;
  claimExpiresAtMs: number | null;
  activeCommand: KioskCommandId;
  face: CounterSessionFace;
  /** Work · Show · Verify. Face is the projection; this tells Show from Verify. */
  consultStance: ConsultStance;
  /** What Show paints — a cart line id and/or a catalog row not yet a line. */
  presentation: ConsultPresentation;
  customer: CounterSessionCustomer;
  lines: CounterSessionLine[];
  counterTransactionId: number | null;
  /** Card-present state — what both faces are showing about payment (SQ2). */
  paymentState: CounterPaymentState;
  /** Live Square Terminal checkout, or null. The webhook's join key. */
  terminalCheckoutId: string | null;
  /** ms epoch the card prompt went up; drives the customer face's calm wait. */
  awaitingCardSinceMs: number | null;
}

export const EMPTY_CUSTOMER: CounterSessionCustomer = {
  phone: '',
  name: '',
  email: '',
  address: '',
};

/** A fresh, unclaimed, empty session — the SSR / pre-hydrate snapshot. */
export function emptySessionSnapshot(sessionId: number): CounterSessionSnapshot {
  return {
    sessionId,
    version: 0,
    status: 'open',
    kioskDeviceId: null,
    claimedByStaffId: null,
    claimedByStaffName: null,
    claimExpiresAtMs: null,
    activeCommand: KIOSK_FALLBACK_COMMAND,
    face: 'staff',
    consultStance: 'work',
    presentation: { ...EMPTY_CONSULT_PRESENTATION },
    customer: { ...EMPTY_CUSTOMER },
    lines: [],
    counterTransactionId: null,
    paymentState: 'idle',
    terminalCheckoutId: null,
    awaitingCardSinceMs: null,
  };
}

// ── Events ──────────────────────────────────────────────────────────────────

interface CounterSessionEventBase {
  sessionId: number;
  /** The version the session holds AFTER this event is applied. */
  version: number;
  actor: CounterSessionActor;
}

export type CounterSessionEvent = CounterSessionEventBase &
  (
    /** The resync. Carries the whole truth, so it is exempt from the +1 rule. */
    | { type: 'session.snapshot'; snapshot: CounterSessionSnapshot }
    | { type: 'session.claimed'; staffId: number; staffName: string; claimExpiresAtMs: number }
    /** Which tablet this visit drives (P5). */
    | { type: 'session.device_bound'; kioskDeviceId: number | null }
    | { type: 'session.released'; reason: 'done' | 'takeover' | 'expired' }
    | { type: 'line.added'; line: CounterSessionLine }
    | { type: 'line.updated'; line: CounterSessionLine }
    | {
        type: 'line.voided';
        lineId: string;
        voidedAtMs: number;
        voidReason: string | null;
        voidedByStaffId: number | null;
      }
    | { type: 'session.customer_changed'; customer: CounterSessionCustomer }
    | { type: 'session.command_changed'; activeCommand: KioskCommandId }
    | {
        type: 'session.face_changed';
        face: CounterSessionFace;
        /** Present on new writes; omitted on legacy events (inferred from `face`). */
        consultStance?: ConsultStance;
      }
    | { type: 'session.presentation_changed'; presentation: ConsultPresentation }
    | { type: 'session.status_changed'; status: CounterSessionStatus }
    | { type: 'session.submitted'; counterTransactionId: number }
    | {
        type: 'session.payment_changed';
        paymentState: CounterPaymentState;
        terminalCheckoutId: string | null;
        awaitingCardSinceMs: number | null;
      }
  );

/** Every event name a subscriber listens on. One family, deliberately. */
export const COUNTER_SESSION_EVENTS = [
  'session.snapshot',
  'session.claimed',
  'session.device_bound',
  'session.released',
  'line.added',
  'line.updated',
  'line.voided',
  'session.customer_changed',
  'session.command_changed',
  'session.face_changed',
  'session.presentation_changed',
  'session.status_changed',
  'session.submitted',
  'session.payment_changed',
] as const;

/** Why an event was not applied. */
export type CounterSessionRefusal = 'foreign' | 'duplicate' | 'gap';

export type ApplySessionEventResult =
  | { applied: true; snapshot: CounterSessionSnapshot }
  | { applied: false; reason: CounterSessionRefusal; snapshot: CounterSessionSnapshot };

/** The version an event must carry to be accepted next. */
export function nextVersion(snapshot: CounterSessionSnapshot): number {
  return snapshot.version + 1;
}

/** Does this event need a `GET …/session` resync rather than a retry? */
export function needsResync(result: ApplySessionEventResult): boolean {
  return result.applied === false && result.reason === 'gap';
}

/** Fold one event into a snapshot. */
export function applySessionEvent(
  snapshot: CounterSessionSnapshot,
  event: CounterSessionEvent,
): ApplySessionEventResult {
  if (event.sessionId !== snapshot.sessionId) {
    return { applied: false, reason: 'foreign', snapshot };
  }

  // The snapshot event IS the resync path, so it does not obey the +1 rule —
  // but it must never move the session BACKWARD, or a late-delivered old
  // snapshot would undo newer lines the client already applied.
  if (event.type === 'session.snapshot') {
    if (event.snapshot.sessionId !== snapshot.sessionId) {
      return { applied: false, reason: 'foreign', snapshot };
    }
    if (event.snapshot.version < snapshot.version) {
      return { applied: false, reason: 'duplicate', snapshot };
    }
    return { applied: true, snapshot: cloneSnapshot(event.snapshot) };
  }

  if (event.version <= snapshot.version) {
    return { applied: false, reason: 'duplicate', snapshot };
  }
  if (event.version > nextVersion(snapshot)) {
    return { applied: false, reason: 'gap', snapshot };
  }

  const next: CounterSessionSnapshot = { ...snapshot, version: event.version };

  switch (event.type) {
    case 'session.claimed':
      next.claimedByStaffId = event.staffId;
      next.claimedByStaffName = event.staffName;
      next.claimExpiresAtMs = event.claimExpiresAtMs;
      break;

    case 'session.device_bound':
      next.kioskDeviceId = event.kioskDeviceId;
      break;

    case 'session.released':
      next.claimedByStaffId = null;
      next.claimedByStaffName = null;
      next.claimExpiresAtMs = null;
      break;

    case 'line.added':
      // Idempotent by line id: a re-published add must not double the total.
      next.lines = next.lines.some((l) => l.id === event.line.id)
        ? next.lines.map((l) => (l.id === event.line.id ? { ...event.line } : l))
        : sortLines([...next.lines, { ...event.line }]);
      break;

    case 'line.updated':
      next.lines = next.lines.map((l) => (l.id === event.line.id ? { ...event.line } : l));
      break;

    case 'line.voided':
      next.lines = next.lines.map((l) =>
        l.id === event.lineId
          ? {
              ...l,
              voidedAtMs: event.voidedAtMs,
              voidReason: event.voidReason,
              voidedByStaffId: event.voidedByStaffId,
            }
          : l,
      );
      break;

    case 'session.customer_changed':
      next.customer = { ...event.customer };
      break;

    case 'session.command_changed':
      next.activeCommand = event.activeCommand;
      break;

    case 'session.face_changed':
      next.face = event.face;
      next.consultStance = event.consultStance ?? consultStanceFromFace(event.face);
      break;

    case 'session.presentation_changed':
      next.presentation = {
        lineId: event.presentation.lineId,
        catalog: event.presentation.catalog ? { ...event.presentation.catalog } : null,
      };
      break;

    case 'session.status_changed':
      next.status = event.status;
      break;

    case 'session.submitted':
      next.status = 'submitted';
      next.counterTransactionId = event.counterTransactionId;
      break;

    case 'session.payment_changed':
      next.paymentState = event.paymentState;
      next.terminalCheckoutId = event.terminalCheckoutId;
      next.awaitingCardSinceMs = event.awaitingCardSinceMs;
      break;
  }

  return { applied: true, snapshot: next };
}

function sortLines(lines: CounterSessionLine[]): CounterSessionLine[] {
  return [...lines].sort((a, b) => a.sortIndex - b.sortIndex);
}

function cloneSnapshot(snapshot: CounterSessionSnapshot): CounterSessionSnapshot {
  return {
    ...snapshot,
    customer: { ...snapshot.customer },
    presentation: {
      lineId: snapshot.presentation.lineId,
      catalog: snapshot.presentation.catalog ? { ...snapshot.presentation.catalog } : null,
    },
    lines: snapshot.lines.map((l) => ({ ...l })),
  };
}

// ── Device-principal projection (D6) ────────────────────────────────────────

/** What a kiosk device is allowed to see. */
export interface DeviceSessionProjection {
  sessionId: number;
  version: number;
  status: CounterSessionStatus;
  activeCommand: KioskCommandId;
  face: CounterSessionFace;
  consultStance: ConsultStance;
  presentation: ConsultPresentation;
  /** Wire-shape lines (D9) — voided lines and internal payload fields removed. */
  lines: KioskCartLine[];
  customerName: string;
  /** Last four only. A full number on an idle screen is a stranger's to read. */
  customerPhoneMasked: string;
  /** REPAIR lines still waiting on a signature — the tablet's only real job. */
  awaitingSignatureLineIds: string[];
  /**
   * Card-present state. The one field on this projection that exists to make
   * the customer's screen say something, rather than to describe the cart.
   */
  paymentState: CounterPaymentState;
  /** ms epoch the prompt went up — the calm decaying wait, never a bounce. */
  awaitingCardSinceMs: number | null;
}

/** Mask all but the last four digits: `5551234567` → `••• ••• 4567`. */
export function maskPhone(raw: string): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length < 4) return '';
  return `••• ••• ${digits.slice(-4)}`;
}

export function projectForDevicePrincipal(
  snapshot: CounterSessionSnapshot,
): DeviceSessionProjection {
  const visible = snapshot.lines.filter((l) => l.voidedAtMs === null);

  return {
    sessionId: snapshot.sessionId,
    version: snapshot.version,
    status: snapshot.status,
    activeCommand: snapshot.activeCommand,
    face: snapshot.face,
    consultStance: snapshot.consultStance ?? consultStanceFromFace(snapshot.face),
    presentation: snapshot.presentation ?? { ...EMPTY_CONSULT_PRESENTATION },
    lines: visible.map(projectLine),
    customerName: snapshot.customer.name,
    customerPhoneMasked: maskPhone(snapshot.customer.phone),
    // A linked repair was signed for when its ticket was written.
    awaitingSignatureLineIds: visible
      .filter(
        (l) =>
          l.type === 'REPAIR' &&
          isRepairPayload(l.payload) &&
          !isLinkedRepairLine(l) &&
          !l.payload.signatureDataUrl,
      )
      .map((l) => l.id),
    paymentState: snapshot.paymentState,
    awaitingCardSinceMs: snapshot.awaitingCardSinceMs,
    // NOTE: `terminalCheckoutId` is deliberately NOT projected. The tablet has
    // no use for it and it is a handle into the tenant's Square account.
  };
}

/** Strip a line to what belongs on a customer-facing screen. */
function projectLine(line: CounterSessionLine): KioskCartLine {
  const base = {
    id: line.id,
    type: line.type,
    title: line.title,
    quantity: line.quantity,
    unitAmountCents: line.unitAmountCents,
  };

  if (isRepairPayload(line.payload)) {
    return {
      ...base,
      payload: {
        productType: line.payload.productType ?? null,
        productModel: line.payload.productModel,
        repairReasons: line.payload.repairReasons ?? [],
        serialNumber: line.payload.serialNumber,
        price: line.payload.price,
        signatureDataUrl: line.payload.signatureDataUrl ?? null,
        // The ticket number is what the customer quotes; it is on their receipt.
        linkedRepairId: line.payload.linkedRepairId ?? null,
        linkedTicketNumber: line.payload.linkedTicketNumber ?? null,
      },
    };
  }

  if (isBuybackPayload(line.payload)) {
    return { ...base, payload: { imei: line.payload.imei } };
  }

  return { ...base, payload: { variationId: null, sku: line.payload.sku } };
}
