/**
 * Kiosk v2 session store — cart is the session root.
 *
 * Module-scoped `useSyncExternalStore` singleton (same idiom as the deleted
 * `salesCartStore`). Commands (Repair / Retail / Buyback / Pickup) swap the
 * center work surface only — they never clear lines. Customer face is a view
 * layer over the same snapshot.
 */

'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { safeRandomUUID } from '@/lib/safe-uuid';
import type {
  BuybackPayload,
  KioskCartLine,
  KioskLineType,
  RepairPayload,
  RetailPayload,
} from '@/lib/kiosk/cart-line';

/** Center work command — not a siloed mode that owns the session. */
export type KioskCommandId = 'repair' | 'retail' | 'buyback' | 'pickup';

type KioskFace = 'staff' | 'customer';

interface KioskSessionSnapshot {
  lines: KioskCartLine[];
  activeCommand: KioskCommandId;
  face: KioskFace;
  /**
   * When staff manually flips to customer (or back), orientation auto-enter
   * must not fight them until they clear the override.
   */
  faceManualOverride: boolean;
  /** Prefill for pickup lookup from an RS# wedge scan. */
  pickupPrefill: string | null;
  /** Prefill IMEI for buyback evaluate from wedge. */
  buybackImeiPrefill: string | null;
  /** Customer identity shared across the visit (phone unlocks create-or-match). */
  customerPhone: string;
  customerName: string;
  customerEmail: string;
  /** Waiting-for-card started-at (ms). Null when not awaiting Terminal. */
  awaitingCardSinceMs: number | null;
}

const INITIAL: KioskSessionSnapshot = {
  lines: [],
  activeCommand: 'retail',
  face: 'staff',
  faceManualOverride: false,
  pickupPrefill: null,
  buybackImeiPrefill: null,
  customerPhone: '',
  customerName: '',
  customerEmail: '',
  awaitingCardSinceMs: null,
};

let snapshot: KioskSessionSnapshot = INITIAL;
const listeners = new Set<() => void>();

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
    setSnapshot({ ...INITIAL, lines: [] });
  },
  /** Clear lines + identity but keep the active command. */
  clearCart(): void {
    setSnapshot({
      ...snapshot,
      lines: [],
      customerPhone: '',
      customerName: '',
      customerEmail: '',
      awaitingCardSinceMs: null,
      pickupPrefill: null,
      buybackImeiPrefill: null,
    });
  },
  setActiveCommand(command: KioskCommandId): void {
    if (snapshot.activeCommand === command) return;
    setSnapshot({
      ...snapshot,
      activeCommand: command,
      // Command switch never clears lines — that was the silo bug.
    });
  },
  setFace(face: KioskFace, opts?: { manual?: boolean }): void {
    const manual = opts?.manual ?? false;
    setSnapshot({
      ...snapshot,
      face,
      faceManualOverride: manual ? true : snapshot.faceManualOverride,
    });
  },
  clearFaceManualOverride(): void {
    if (!snapshot.faceManualOverride) return;
    setSnapshot({ ...snapshot, faceManualOverride: false });
  },
  setCustomer(fields: {
    phone?: string;
    name?: string;
    email?: string;
  }): void {
    setSnapshot({
      ...snapshot,
      customerPhone: fields.phone ?? snapshot.customerPhone,
      customerName: fields.name ?? snapshot.customerName,
      customerEmail: fields.email ?? snapshot.customerEmail,
    });
  },
  setPickupPrefill(value: string | null): void {
    setSnapshot({ ...snapshot, pickupPrefill: value });
  },
  setBuybackImeiPrefill(value: string | null): void {
    setSnapshot({ ...snapshot, buybackImeiPrefill: value });
  },
  setAwaitingCard(active: boolean): void {
    setSnapshot({
      ...snapshot,
      awaitingCardSinceMs: active ? Date.now() : null,
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
    setSnapshot({ ...snapshot, lines: [...snapshot.lines, line] });
    return line;
  },
  addRetail(input: {
    title: string;
    unitAmountCents: number;
    quantity?: number;
    payload: RetailPayload;
  }): KioskCartLine {
    return kioskSessionStore.addLine({
      type: 'RETAIL',
      title: input.title,
      unitAmountCents: Math.max(0, Math.trunc(input.unitAmountCents)),
      quantity: input.quantity ?? 1,
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
  addBuyback(input: {
    title: string;
    /** Positive offer amount — stored as negative unitAmountCents. */
    offerCents: number;
    payload: BuybackPayload;
  }): KioskCartLine {
    const offer = Math.max(0, Math.trunc(input.offerCents));
    return kioskSessionStore.addLine({
      type: 'BUYBACK',
      title: input.title,
      unitAmountCents: -offer,
      quantity: 1,
      payload: input.payload,
    });
  },
  updateLine(id: string, patch: Partial<Omit<KioskCartLine, 'id' | 'type'>>): void {
    setSnapshot({
      ...snapshot,
      lines: snapshot.lines.map((line) =>
        line.id === id ? { ...line, ...patch, id: line.id, type: line.type } : line,
      ),
    });
  },
  removeLine(id: string): void {
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
      (fields: { phone?: string; name?: string; email?: string }) =>
        kioskSessionStore.setCustomer(fields),
      [],
    ),
    setPickupPrefill: useCallback(
      (v: string | null) => kioskSessionStore.setPickupPrefill(v),
      [],
    ),
    setBuybackImeiPrefill: useCallback(
      (v: string | null) => kioskSessionStore.setBuybackImeiPrefill(v),
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
    addBuyback: useCallback(
      (input: {
        title: string;
        offerCents: number;
        payload: BuybackPayload;
      }) => kioskSessionStore.addBuyback(input),
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
  if (type === 'BUYBACK') return 'Buyback';
  return 'Retail';
}
