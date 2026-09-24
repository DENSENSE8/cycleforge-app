/**
 * Kiosk v2 session store — cart is the session root.
 *
 * Module-scoped `useSyncExternalStore` singleton (same idiom as the deleted
 * `salesCartStore`). Commands (Repair / Retail) swap the
 * center work surface only — they never clear lines. Customer face is a view
 * layer over the same snapshot.
 *
 * ### Two transports, one API (plan P4)
 *
 * **local** (the default, unchanged): the tablet owns its own cart, exactly as
 * before this comment existed.
 *
 * **shared**: a desk has claimed this device, so the cart is a MIRROR of the
 * server's session. `mirrorSharedSession()` writes the projected snapshot in;
 * the local line mutators become no-ops for as long as it is attached.
 *
 * Every existing consumer — `KioskCartLedger`, `KioskCustomerFace`, the panes —
 * keeps calling `useKioskSession()` and the same actions. Nothing in the public
 * API moved, which is the point: the transport changed, not the store.
 *
 * **Mirrored edits WRITE THROUGH (revised 2026-08-20).** The first cut made the
 * local mutators no-ops while mirroring. That was wrong twice over: the counter
 * is a form staff and customer fill at the same time, and a silent no-op is the
 * worst possible way to say no — the tablet's own line editor called
 * `updateLine` and simply did nothing, with no error and no feedback.
 *
 * So a mutator with a shared writer attached applies OPTIMISTICALLY and sends
 * the edit to the server; the next mirror reconciles it. Without a writer it
 * stays local, exactly as before. Money edits are refused server-side (price,
 * void, submit are staff verbs) — the door that matters is the API's, not a
 * disabled button.
 *
 * **The phone is masked in a mirror** (`sharedCustomerPhoneMasked`), and
 * deliberately does NOT land in `customerPhone`. The masked string is display
 * copy; if it reached the identity field, a local submit would post `••• •••
 * 4567` as a customer's phone number.
 */

'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { safeRandomUUID } from '@/lib/safe-uuid';
import {
  faceFromConsultStance,
  type ConsultPresentation,
  type ConsultStance,
  EMPTY_CONSULT_PRESENTATION,
} from '@/lib/counter/consult-stance';
import {
  KIOSK_LINE_MAX_QUANTITY,
  findConsolidatableRetailLine,
  type KioskCartLine,
  type KioskLineType,
  type RepairPayload,
  type RetailPayload,
} from '@/lib/kiosk/cart-line';
import { KIOSK_FALLBACK_COMMAND, type KioskCommandId } from '@/lib/kiosk/commands';
import type { KioskTicketChoice } from '@/lib/kiosk/repair-ticket-choice';
import { DEFAULT_LINE_REASONS, type KioskLineReasons } from '@/lib/kiosk/price-approval-kinds';

type KioskFace = 'staff' | 'customer';

/**
 * A line removed after the customer saw it — Square's "void": it never prints,
 * but it is recorded. The approval route audited it when the PIN was entered;
 * the visit's submit lists it again so History can show it on the visit.
 */
export interface KioskVoidedLine {
  title: string;
  quantity: number;
  unitAmountCents: number;
  reason: string;
  staffId: number;
  staffName: string | null;
  approval: string;
}

interface KioskSessionSnapshot {
  lines: KioskCartLine[];
  activeCommand: KioskCommandId;
  face: KioskFace;
  consultStance: ConsultStance;
  presentation: ConsultPresentation;
  /**
   * When staff manually flips to customer (or back), orientation auto-enter
   * must not fight them until they clear the override.
   */
  faceManualOverride: boolean;
  /** Customer identity shared across the visit (phone unlocks create-or-match). */
  customerPhone: string;
  customerName: string;
  customerEmail: string;
  /** Street address for intake + receipt — optional until the customer is on file. */
  customerAddress: string;
  /** Waiting-for-card started-at (ms). Null when not awaiting Terminal. */
  awaitingCardSinceMs: number | null;
  /**
   * Server session id when a desk holds this tablet; null = local transport.
   * Non-null means the lines below are a mirror, not this device's own cart.
   */
  sharedSessionId: number | null;
  /** Server version of the mirrored session — for the "in sync" chrome. */
  sharedVersion: number;
  /** Display-only masked phone from the shared session. Never an identity input. */
  sharedCustomerPhoneMasked: string;
  /** Repair lines the customer still has to sign — the tablet's actual job. */
  sharedAwaitingSignatureLineIds: string[];
  /**
   * Create a new helpdesk ticket for this visit, or attach it to an existing
   * one. `null` = nobody has answered yet, which is what the repair flow's
   * last step gates on (PG6 — see `repair-ticket-choice.ts`).
   *
   * A VISIT fact, like the contact trio above: `ticketWork` is
   * transaction-level on `CounterTransactionInput`, so there is exactly one
   * per submit however many devices the customer dropped off.
   *
   * Local only — deliberately NOT mirrored. A desk-held session's ticket
   * linkage is the desk's to state, and there is no server field for it on
   * `counter_sessions`; a tablet inventing one would be writing a fact the
   * mirror cannot round-trip.
   */
  ticketChoice: KioskTicketChoice | null;
  /**
   * Lines the customer has had on their screen (Show / Verify). Removing one
   * of these is a VOID — reason + PIN — not a quiet delete: "a line the
   * customer already saw is evidence". Local only, like `ticketChoice`.
   */
  customerSeenLineIds: string[];
  /** This visit's voids, submitted with it. Cleared with the cart. */
  voidedLines: KioskVoidedLine[];
  /** The org's comp / void reason lists (`OrgSettings.kiosk`). Survives a reset. */
  lineReasons: KioskLineReasons;
}

const INITIAL: KioskSessionSnapshot = {
  lines: [],
  activeCommand: KIOSK_FALLBACK_COMMAND,
  face: 'staff',
  consultStance: 'work',
  presentation: { ...EMPTY_CONSULT_PRESENTATION },
  faceManualOverride: false,
  customerPhone: '',
  customerName: '',
  customerEmail: '',
  customerAddress: '',
  awaitingCardSinceMs: null,
  sharedSessionId: null,
  sharedVersion: 0,
  sharedCustomerPhoneMasked: '',
  sharedAwaitingSignatureLineIds: [],
  ticketChoice: null,
  customerSeenLineIds: [],
  voidedLines: [],
  lineReasons: DEFAULT_LINE_REASONS,
};

/** `prev`, plus every line in `lines` when a customer-facing stance shows them. */
function seenAfter(
  prev: readonly string[],
  stance: ConsultStance,
  lines: readonly KioskCartLine[],
): string[] {
  if (stance === 'work') return [...prev];
  const seen = new Set(prev);
  for (const line of lines) seen.add(line.id);
  return [...seen];
}

let snapshot: KioskSessionSnapshot = INITIAL;
const listeners = new Set<() => void>();

/**
 * How a mirrored edit reaches the server.
 *
 * Injected by `useKioskSharedSession` rather than imported, so this module stays
 * fetch-free and unit-testable: a test attaches a recording writer and asserts
 * what the tablet TRIED to send, with no network.
 */
export interface KioskSharedWriter {
  addLine(line: KioskCartLine): void | Promise<void>;
  updateLine(id: string, patch: Partial<Omit<KioskCartLine, 'id' | 'type'>>): void | Promise<void>;
  removeLine(id: string): void | Promise<void>;
  setConsultStance?(stance: ConsultStance): void | Promise<void>;
  setPresentation?(presentation: ConsultPresentation): void | Promise<void>;
}

let sharedWriter: KioskSharedWriter | null = null;

/**
 * Has a human picked a command on this tablet? Gates `applyDefaultCommand`:
 * the org's default is a STARTING point, and an operator's pick outranks it
 * for the rest of the visit. Cleared by `resetSession` — the next customer
 * walks up to a counter that has made no choices.
 */
let commandChosen = false;

/**
 * The org's opening command once the server has stated it
 * (`OrgSettings.kiosk.defaultCommand`, delivered with the `/kiosk/v2` HTML).
 * Held here so `resetSession` returns to the ORG's choice rather than to the
 * module fallback — "Next customer" and a fresh page load must agree.
 */
let defaultCommand: KioskCommandId = KIOSK_FALLBACK_COMMAND;

/** The org's comp / void reasons once the server has stated them; see `applyLineReasons`. */
let lineReasons: KioskLineReasons = DEFAULT_LINE_REASONS;

function emit(): void {
  for (const l of listeners) l();
}

function setSnapshot(next: KioskSessionSnapshot): void {
  snapshot = next;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): KioskSessionSnapshot {
  return snapshot;
}

/** Server snapshot for SSR — empty cart, staff face. */
function getServerSnapshot(): KioskSessionSnapshot {
  return INITIAL;
}

export const kioskSessionStore = {
  getSnapshot,
  subscribe,
  /** Reset the whole visit (Done / Next Customer). */
  resetSession(): void {
    commandChosen = false;
    setSnapshot({ ...INITIAL, lines: [], activeCommand: defaultCommand, lineReasons });
  },
  /** Clear lines + identity but keep the active command. */
  clearCart(): void {
    setSnapshot({
      ...snapshot,
      lines: [],
      customerPhone: '',
      customerName: '',
      customerEmail: '',
      customerAddress: '',
      awaitingCardSinceMs: null,
      // The decision belongs to the VISIT it was made for; the next customer's
      // drop-off must not inherit a link to the last one's ticket.
      ticketChoice: null,
      customerSeenLineIds: [],
      voidedLines: [],
    });
  },
  /**
   * Adopt the ORG's comp / void reason lists (`OrgSettings.kiosk`), delivered
   * with the `/kiosk/v2` HTML like the default command. Held module-side so a
   * reset keeps them.
   */
  applyLineReasons(next: KioskLineReasons): void {
    lineReasons = next;
    if (snapshot.lineReasons === next) return;
    setSnapshot({ ...snapshot, lineReasons: next });
  },
  /**
   * VOID lines the customer has seen: they leave the cart, and the void
   * (reason, who, the signed approval that already audited it) stays with the
   * visit so its submit can list it. A mirror never gets here — removal on a
   * desk-held session is the desk's.
   */
  voidLines(
    ids: readonly string[],
    authorized: Pick<KioskVoidedLine, 'reason' | 'staffId' | 'staffName' | 'approval'>,
  ): void {
    const drop = new Set(ids);
    const voided = snapshot.lines
      .filter((line) => drop.has(line.id))
      .map((line) => ({
        title: line.title,
        quantity: line.quantity,
        unitAmountCents: line.unitAmountCents,
        ...authorized,
      }));
    setSnapshot({
      ...snapshot,
      lines: snapshot.lines.filter((line) => !drop.has(line.id)),
      customerSeenLineIds: snapshot.customerSeenLineIds.filter((id) => !drop.has(id)),
      voidedLines: [...snapshot.voidedLines, ...voided],
    });
  },
  setActiveCommand(command: KioskCommandId): void {
    commandChosen = true;
    if (snapshot.activeCommand === command) return;
    setSnapshot({
      ...snapshot,
      activeCommand: command,
      // Command switch never clears lines — that was the silo bug.
      // It also never resets consult stance (Work · Show · Verify).
    });
  },
  /**
   * Adopt the ORG's default command (`OrgSettings.kiosk.defaultCommand`).
   *
   * PRISTINE ONLY. The default answers "what does this counter open on", never
   * "what is it showing now", so it must lose to anything that has already
   * happened: a staffer's own pick, a cart with lines in it, or a desk-held
   * mirror whose command is the server's to state. Without that the setting
   * would yank an operator mid-visit on any re-render that re-ran it.
   */
  applyDefaultCommand(command: KioskCommandId): void {
    // Recorded unconditionally: even when it cannot land NOW (mid-visit, or a
    // desk holds the tablet), `resetSession` must return to the org's choice.
    defaultCommand = command;
    if (commandChosen) return;
    if (snapshot.lines.length > 0) return;
    if (snapshot.sharedSessionId !== null) return;
    if (snapshot.activeCommand === command) return;
    setSnapshot({ ...snapshot, activeCommand: command });
  },
  setConsultStance(stance: ConsultStance, opts?: { manual?: boolean }): void {
    const face = faceFromConsultStance(stance);
    const manual = opts?.manual ?? false;
    const bound = snapshot.sharedSessionId !== null;
    setSnapshot({
      ...snapshot,
      consultStance: stance,
      face,
      faceManualOverride: manual ? true : snapshot.faceManualOverride,
      customerSeenLineIds: seenAfter(snapshot.customerSeenLineIds, stance, snapshot.lines),
    });
    if (bound && sharedWriter?.setConsultStance) {
      void sharedWriter.setConsultStance(stance);
    }
  },
  setPresentation(presentation: ConsultPresentation): void {
    const bound = snapshot.sharedSessionId !== null;
    setSnapshot({ ...snapshot, presentation });
    if (bound && sharedWriter?.setPresentation) {
      void sharedWriter.setPresentation(presentation);
    }
  },
  setFace(face: KioskFace, opts?: { manual?: boolean }): void {
    // Orientation and legacy callers speak face; Verify is what "customer" meant.
    kioskSessionStore.setConsultStance(face === 'staff' ? 'work' : 'verify', opts);
  },
  clearFaceManualOverride(): void {
    if (!snapshot.faceManualOverride) return;
    setSnapshot({ ...snapshot, faceManualOverride: false });
  },
  setCustomer(fields: {
    phone?: string;
    name?: string;
    email?: string;
    address?: string;
  }): void {
    setSnapshot({
      ...snapshot,
      customerPhone: fields.phone ?? snapshot.customerPhone,
      customerName: fields.name ?? snapshot.customerName,
      customerEmail: fields.email ?? snapshot.customerEmail,
      customerAddress: fields.address ?? snapshot.customerAddress,
    });
  },
  /**
   * Record the visit's helpdesk decision (create vs attach).
   *
   * No write-through: see the field's note on the snapshot — there is no
   * mirrored counterpart for it, so a bound tablet keeps it locally rather
   * than posting a fact the server has nowhere to put.
   */
  setTicketChoice(choice: KioskTicketChoice | null): void {
    setSnapshot({ ...snapshot, ticketChoice: choice });
  },
  setAwaitingCard(active: boolean): void {
    setSnapshot({
      ...snapshot,
      awaitingCardSinceMs: active ? Date.now() : null,
    });
  },
  /**
   * Install (or clear) the write-through path for a mirrored session.
   *
   * Cleared on detach so a stale writer cannot post an edit to a session this
   * tablet no longer belongs to.
   */
  attachSharedWriter(writer: KioskSharedWriter | null): void {
    sharedWriter = writer;
  },

  /**
   * Attach the shared transport and write one server projection in.
   *
   * Idempotent by version: an older projection (a poll answering after a newer
   * event already landed) is dropped rather than rolling the customer's screen
   * backwards mid-visit.
   */
  mirrorSharedSession(input: {
    sessionId: number;
    version: number;
    lines: KioskCartLine[];
    customerName: string;
    customerPhoneMasked: string;
    awaitingSignatureLineIds: string[];
    activeCommand?: KioskCommandId;
    /**
     * Card-present state from the server (SQ2). This is what finally drives
     * `awaitingCardSinceMs`, which has existed here since v2 with nothing
     * behind it — the customer face already knows how to render the calm
     * decaying wait, it just never had a real prompt to render.
     */
    awaitingCardSinceMs?: number | null;
    consultStance?: ConsultStance;
    presentation?: ConsultPresentation;
  }): void {
    if (
      snapshot.sharedSessionId === input.sessionId &&
      input.version < snapshot.sharedVersion
    ) {
      return;
    }
    setSnapshot({
      ...snapshot,
      sharedSessionId: input.sessionId,
      sharedVersion: input.version,
      lines: input.lines,
      customerName: input.customerName,
      // Masked display copy only — see the module docblock.
      sharedCustomerPhoneMasked: input.customerPhoneMasked,
      customerPhone: '',
      sharedAwaitingSignatureLineIds: input.awaitingSignatureLineIds,
      activeCommand: input.activeCommand ?? snapshot.activeCommand,
      consultStance: input.consultStance ?? snapshot.consultStance,
      presentation: input.presentation ?? snapshot.presentation,
      face: input.consultStance
        ? faceFromConsultStance(input.consultStance)
        : snapshot.face,
      awaitingCardSinceMs:
        input.awaitingCardSinceMs === undefined
          ? snapshot.awaitingCardSinceMs
          : input.awaitingCardSinceMs,
    });
  },

  /**
   * Return to the local transport — the desk released this tablet, or the visit
   * finished. The mirrored lines go with it: they were never this device's
   * cart, and leaving them on screen would show the next customer the last
   * one's basket.
   */
  detachSharedSession(): void {
    sharedWriter = null;
    if (snapshot.sharedSessionId === null) return;
    setSnapshot({
      ...INITIAL,
      activeCommand: snapshot.activeCommand,
      face: snapshot.face,
      consultStance: snapshot.consultStance,
      presentation: snapshot.presentation,
      faceManualOverride: snapshot.faceManualOverride,
      lineReasons,
    });
  },

  addLine(
    input: Omit<KioskCartLine, 'id'> & { id?: string },
  ): KioskCartLine {
    const line: KioskCartLine = {
      ...input,
      id: input.id ?? safeRandomUUID(),
      quantity: Math.max(1, Math.trunc(input.quantity) || 1),
    };
    // Optimistic either way; when mirrored, the edit also goes to the server and
    // the next projection reconciles it.
    const lines = [...snapshot.lines, line];
    setSnapshot({
      ...snapshot,
      lines,
      // Added while the customer is looking = seen the moment it lands.
      customerSeenLineIds: seenAfter(snapshot.customerSeenLineIds, snapshot.consultStance, [line]),
    });
    if (snapshot.sharedSessionId !== null && sharedWriter) {
      void sharedWriter.addLine(line);
    }
    return line;
  },
  /**
   * Add a sale. A catalog item already on the cart at the same price gains a
   * unit instead of a twin line (Square "Consolidate identical items"), so a
   * repeat tile tap and a repeat barcode scan both read `2 · $8.56`.
   */
  addRetail(input: {
    title: string;
    unitAmountCents: number;
    quantity?: number;
    payload: RetailPayload;
  }): KioskCartLine {
    const unitAmountCents = Math.max(0, Math.trunc(input.unitAmountCents));
    const quantity = Math.max(1, Math.trunc(input.quantity ?? 1) || 1);
    const twin = input.payload.variationId
      ? findConsolidatableRetailLine(snapshot.lines, input.payload.variationId, unitAmountCents)
      : null;
    if (twin) {
      const next = Math.min(KIOSK_LINE_MAX_QUANTITY, twin.quantity + quantity);
      kioskSessionStore.updateLine(twin.id, { quantity: next });
      return { ...twin, quantity: next };
    }
    return kioskSessionStore.addLine({
      type: 'RETAIL',
      title: input.title,
      unitAmountCents,
      quantity,
      payload: input.payload,
    });
  },
  addRepair(input: {
    title: string;
    unitAmountCents: number;
    payload: RepairPayload;
  }): KioskCartLine {
    return kioskSessionStore.addLine({
      type: 'REPAIR',
      title: input.title,
      unitAmountCents: Math.max(0, Math.trunc(input.unitAmountCents)),
      quantity: 1,
      payload: input.payload,
    });
  },
  updateLine(id: string, patch: Partial<Omit<KioskCartLine, 'id' | 'type'>>): void {
    if (snapshot.sharedSessionId !== null && sharedWriter) {
      void sharedWriter.updateLine(id, patch);
    }
    setSnapshot({
      ...snapshot,
      lines: snapshot.lines.map((line) =>
        line.id === id ? { ...line, ...patch, id: line.id, type: line.type } : line,
      ),
    });
  },
  removeLine(id: string): void {
    if (snapshot.sharedSessionId !== null && sharedWriter) {
      // A remove on a mirrored session is a VOID server-side — staff-only, so
      // this will be refused there and the mirror will put the line back. The
      // customer sees it return rather than a button that quietly did nothing.
      void sharedWriter.removeLine(id);
    }
    setSnapshot({
      ...snapshot,
      lines: snapshot.lines.filter((line) => line.id !== id),
    });
  },
  /** Replace a REPAIR line's nested payload + quote in one write. */
  updateRepairLine(
    id: string,
    next: { title?: string; unitAmountCents?: number; payload: RepairPayload },
  ): void {
    setSnapshot({
      ...snapshot,
      lines: snapshot.lines.map((line) => {
        if (line.id !== id || line.type !== 'REPAIR') return line;
        return {
          ...line,
          title: next.title ?? line.title,
          unitAmountCents:
            next.unitAmountCents != null
              ? Math.max(0, Math.trunc(next.unitAmountCents))
              : line.unitAmountCents,
          payload: next.payload,
        };
      }),
    });
  },
};

export function useKioskSession(): KioskSessionSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useKioskSessionActions() {
  return {
    resetSession: useCallback(() => kioskSessionStore.resetSession(), []),
    clearCart: useCallback(() => kioskSessionStore.clearCart(), []),
    setActiveCommand: useCallback(
      (c: KioskCommandId) => kioskSessionStore.setActiveCommand(c),
      [],
    ),
    setConsultStance: useCallback(
      (stance: ConsultStance, opts?: { manual?: boolean }) =>
        kioskSessionStore.setConsultStance(stance, opts),
      [],
    ),
    setPresentation: useCallback(
      (presentation: ConsultPresentation) => kioskSessionStore.setPresentation(presentation),
      [],
    ),
    setFace: useCallback(
      (face: KioskFace, opts?: { manual?: boolean }) =>
        kioskSessionStore.setFace(face, opts),
      [],
    ),
    clearFaceManualOverride: useCallback(
      () => kioskSessionStore.clearFaceManualOverride(),
      [],
    ),
    setCustomer: useCallback(
      (fields: { phone?: string; name?: string; email?: string; address?: string }) =>
        kioskSessionStore.setCustomer(fields),
      [],
    ),
    setTicketChoice: useCallback(
      (choice: KioskTicketChoice | null) => kioskSessionStore.setTicketChoice(choice),
      [],
    ),
    setAwaitingCard: useCallback(
      (active: boolean) => kioskSessionStore.setAwaitingCard(active),
      [],
    ),
    addRetail: useCallback(
      (input: {
        title: string;
        unitAmountCents: number;
        quantity?: number;
        payload: RetailPayload;
      }) => kioskSessionStore.addRetail(input),
      [],
    ),
    addRepair: useCallback(
      (input: {
        title: string;
        unitAmountCents: number;
        payload: RepairPayload;
      }) => kioskSessionStore.addRepair(input),
      [],
    ),
    updateLine: useCallback(
      (id: string, patch: Partial<Omit<KioskCartLine, 'id' | 'type'>>) =>
        kioskSessionStore.updateLine(id, patch),
      [],
    ),
    updateRepairLine: useCallback(
      (
        id: string,
        next: { title?: string; unitAmountCents?: number; payload: RepairPayload },
      ) => kioskSessionStore.updateRepairLine(id, next),
      [],
    ),
    removeLine: useCallback((id: string) => kioskSessionStore.removeLine(id), []),
    voidLines: useCallback(
      (
        ids: readonly string[],
        authorized: Pick<KioskVoidedLine, 'reason' | 'staffId' | 'staffName' | 'approval'>,
      ) => kioskSessionStore.voidLines(ids, authorized),
      [],
    ),
    addLine: useCallback(
      (input: Omit<KioskCartLine, 'id'> & { id?: string }) =>
        kioskSessionStore.addLine(input),
      [],
    ),
  };
}

export function lineTypeLabel(type: KioskLineType): string {
  if (type === 'REPAIR') return 'Repair';
  if (type === 'BUYBACK') return 'Trade-in';
  return 'Sale';
}
