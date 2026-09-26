/** Kiosk v2 session store — cart is the session root. */

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
import type { KioskCartSnapshot } from '@/lib/kiosk/kiosk-cart-snapshot';
import type { KioskTicketChoice } from '@/lib/kiosk/repair-ticket-choice';
import { DEFAULT_LINE_REASONS, type KioskLineReasons } from '@/lib/kiosk/price-approval-kinds';

type KioskFace = 'staff' | 'customer';

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
  /** Create a new helpdesk ticket for this visit, or attach it to an existing one. */
  ticketChoice: KioskTicketChoice | null;
  /** The org's comp reason list (`OrgSettings.kiosk`). Survives a reset. */
  lineReasons: KioskLineReasons;
  /**
   * The `kiosk_carts` row this cart is written to (`#42`), or null while it is
   * still empty / not yet created. `useKioskCartSync` owns the network; the
   * store only knows which cart it is. Never set while a desk mirror is up.
   */
  cartId: number | null;
  /** Server version of that row — the `expectedVersion` of the next save. */
  cartVersion: number;
  /**
   * The visit was submitted (`completeCart`). The lines stay on screen for the
   * done face, but the cart is closed: nothing saves it and nothing re-creates
   * it until the next visit starts.
   */
  cartDone: boolean;
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
  lineReasons: DEFAULT_LINE_REASONS,
  cartId: null,
  cartVersion: 0,
  cartDone: false,
};

let snapshot: KioskSessionSnapshot = INITIAL;
const listeners = new Set<() => void>();

/** How a mirrored edit reaches the server. */
export interface KioskSharedWriter {
  addLine(line: KioskCartLine): void | Promise<void>;
  updateLine(id: string, patch: Partial<Omit<KioskCartLine, 'id' | 'type'>>): void | Promise<void>;
  removeLine(id: string): void | Promise<void>;
  setConsultStance?(stance: ConsultStance): void | Promise<void>;
  setPresentation?(presentation: ConsultPresentation): void | Promise<void>;
}

let sharedWriter: KioskSharedWriter | null = null;

/** Has a human picked a command on this tablet? */
let commandChosen = false;

/** The org's opening command once the server has stated it (`OrgSettings.kiosk.defaultCommand`, delivered with the `/kiosk/v2` HTML). */
let defaultCommand: KioskCommandId = KIOSK_FALLBACK_COMMAND;

/** The org's comp reasons once the server has stated them; see `applyLineReasons`. */
let lineReasons: KioskLineReasons = DEFAULT_LINE_REASONS;

/** How a persisted cart ENDED, told to `useKioskCartSync` so the row follows: */
interface KioskCartEnding {
  id: number;
  how: 'done' | 'cleared';
}

const cartEndListeners = new Set<(ending: KioskCartEnding) => void>();

/**
 * Bumped whenever the store moves to a different cart. A create that was in
 * flight across the move must not stamp its new id onto the cart that replaced
 * it — see `attachCart`.
 */
let cartEpoch = 0;

function endCart(how: KioskCartEnding['how']): void {
  // A mirror is the desk's session, not this cart: nothing of ours ends.
  if (snapshot.cartId === null || snapshot.cartDone || snapshot.sharedSessionId !== null) return;
  const ending = { id: snapshot.cartId, how };
  for (const l of cartEndListeners) l(ending);
}

/** An empty visit that keeps the command it was on and the org's reasons. */
function emptyVisit(activeCommand: KioskCommandId): KioskSessionSnapshot {
  return {
    ...snapshot,
    lines: [],
    activeCommand,
    presentation: { ...EMPTY_CONSULT_PRESENTATION },
    customerPhone: '',
    customerName: '',
    customerEmail: '',
    customerAddress: '',
    awaitingCardSinceMs: null,
    // The decision belongs to the VISIT it was made for; the next customer's
    // drop-off must not inherit a link to the last one's ticket.
    ticketChoice: null,
    lineReasons,
    cartId: null,
    cartVersion: 0,
    cartDone: false,
  };
}

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
  /**
   * Reset the whole visit (Done / Next Customer). "Next customer" only follows
   * a successful submit, so a cart still open here is closed as done.
   */
  resetSession(): void {
    endCart('done');
    cartEpoch += 1;
    commandChosen = false;
    setSnapshot({ ...INITIAL, lines: [], activeCommand: defaultCommand, lineReasons });
  },
  /** Clear lines + identity but keep the active command. A persisted cart is deleted. */
  clearCart(): void {
    endCart('cleared');
    cartEpoch += 1;
    setSnapshot(emptyVisit(snapshot.activeCommand));
  },
  /**
   * The visit was submitted: close its cart NOW, before the done face, so no
   * tablet can reopen and submit it again while the receipt is still up. The
   * lines stay for that face; `resetSession` starts the next visit.
   */
  completeCart(): void {
    if (snapshot.cartDone) return;
    endCart('done');
    setSnapshot({ ...snapshot, cartDone: true });
  },
  /** `+ New cart`: */
  startNewCart(): void {
    if (snapshot.sharedSessionId !== null) return;
    cartEpoch += 1;
    setSnapshot(emptyVisit(snapshot.activeCommand));
  },
  /**
   * Put a persisted cart on this tablet (Recent carts tap). Replaces the visit
   * fields only — face, stance and the org's reasons are this screen's. The
   * loaded command counts as a pick, so the org default cannot yank it.
   */
  loadCart(input: { id: number; version: number; snapshot: KioskCartSnapshot }): void {
    if (snapshot.sharedSessionId !== null) return;
    cartEpoch += 1;
    commandChosen = true;
    const cart = input.snapshot;
    setSnapshot({
      ...emptyVisit(cart.activeCommand),
      lines: cart.lines,
      customerPhone: cart.customerPhone,
      customerName: cart.customerName,
      customerEmail: cart.customerEmail,
      customerAddress: cart.customerAddress,
      ticketChoice: cart.ticketChoice,
      cartId: input.id,
      cartVersion: input.version,
    });
  },
  /** Which cart the store is on; pass it back to `attachCart`. */
  cartEpoch(): number {
    return cartEpoch;
  },
  /**
   * Name the just-created row as this cart. Refused (false) when the store has
   * moved to another cart since the create began — that row belongs to the
   * cart that was left, which stays in Recent carts.
   */
  attachCart(input: { id: number; version: number; epoch: number }): boolean {
    if (input.epoch !== cartEpoch || snapshot.cartId !== null || snapshot.cartDone) return false;
    if (snapshot.sharedSessionId !== null) return false;
    setSnapshot({ ...snapshot, cartId: input.id, cartVersion: input.version });
    return true;
  },
  /** A save landed: the next one expects this version. */
  setCartVersion(id: number, version: number): void {
    if (snapshot.cartId !== id || snapshot.cartVersion === version) return;
    setSnapshot({ ...snapshot, cartVersion: version });
  },
  /** `useKioskCartSync` listens here to delete / close the row; returns the unsubscribe. */
  onCartEnded(listener: (ending: KioskCartEnding) => void): () => void {
    cartEndListeners.add(listener);
    return () => {
      cartEndListeners.delete(listener);
    };
  },
  /**
   * Adopt the ORG's comp reason list (`OrgSettings.kiosk`), delivered
   * with the `/kiosk/v2` HTML like the default command. Held module-side so a
   * reset keeps it.
   */
  applyLineReasons(next: KioskLineReasons): void {
    lineReasons = next;
    if (snapshot.lineReasons === next) return;
    setSnapshot({ ...snapshot, lineReasons: next });
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
  /** Adopt the ORG's default command (`OrgSettings.kiosk.defaultCommand`). */
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
  /** Record the visit's helpdesk decision (create vs attach). */
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

  /** Attach the shared transport and write one server projection in. */
  mirrorSharedSession(input: {
    sessionId: number;
    version: number;
    lines: KioskCartLine[];
    customerName: string;
    customerPhoneMasked: string;
    awaitingSignatureLineIds: string[];
    activeCommand?: KioskCommandId;
    /** Card-present state from the server (SQ2). */
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

  /** Return to the local transport — the desk released this tablet, or the visit finished. */
  detachSharedSession(): void {
    sharedWriter = null;
    if (snapshot.sharedSessionId === null) return;
    // The mirror replaced whatever cart was here; a create still in flight for
    // it must not land on the empty visit this detach leaves behind.
    cartEpoch += 1;
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
    setSnapshot({ ...snapshot, lines });
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
    completeCart: useCallback(() => kioskSessionStore.completeCart(), []),
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
