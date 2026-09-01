/**
 * Incoming PO intake open/draft store — summoned band under the Incoming grid.
 *
 * Supports a **queue of order drafts** (many screenshots → many POs) plus the
 * active draft the form edits. Tiny subscribe/emit + cached snapshot.
 */

import {
  EMPTY_PO_INTAKE_DRAFT,
  canConfirmPoIntake,
  type PoIntakeDraft,
} from '@/lib/inbound/po-intake-draft';

export type PoIntakeQueuedOrder = {
  id: string;
  draft: PoIntakeDraft;
  /** Screenshot / paste name that seeded this order (if any). */
  sourceName: string | null;
  thumbnailDataUrl: string | null;
};

export type PoIntakePendingAttachment = {
  id: string;
  name: string;
  dataUrl: string;
};

export type PoIntakeSnapshot = {
  open: boolean;
  /** One entry per purchase order being triaged. */
  queue: PoIntakeQueuedOrder[];
  activeOrderId: string;
  /** Screenshots staged but not yet assigned / extracting. */
  pendingAttachments: PoIntakePendingAttachment[];
  /** Composer prompt / missing-field question shown above the dock. */
  prompt: string;
  extracting: boolean;
  confirming: boolean;
  error: string | null;
};

type Listener = () => void;

const listeners = new Set<Listener>();

let idSeq = 0;
function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSeq}`;
}

function emptyOrder(): PoIntakeQueuedOrder {
  return {
    id: nextId('po'),
    draft: EMPTY_PO_INTAKE_DRAFT(),
    sourceName: null,
    thumbnailDataUrl: null,
  };
}

function initialSnapshot(): PoIntakeSnapshot {
  const first = emptyOrder();
  return {
    open: false,
    queue: [first],
    activeOrderId: first.id,
    pendingAttachments: [],
    prompt: '',
    extracting: false,
    confirming: false,
    error: null,
  };
}

let snapshot: PoIntakeSnapshot = initialSnapshot();

function emit(next: PoIntakeSnapshot): void {
  snapshot = next;
  for (const l of listeners) l();
}

export function getPoIntakeSnapshot(): PoIntakeSnapshot {
  return snapshot;
}

export function subscribePoIntake(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getActivePoIntakeOrder(
  snap: PoIntakeSnapshot = snapshot,
): PoIntakeQueuedOrder {
  return (
    snap.queue.find((o) => o.id === snap.activeOrderId)
    ?? snap.queue[0]
    ?? emptyOrder()
  );
}

export function getActivePoIntakeDraft(
  snap: PoIntakeSnapshot = snapshot,
): PoIntakeDraft {
  return getActivePoIntakeOrder(snap).draft;
}

export function openPoIntake(opts?: { reset?: boolean }): void {
  const reset = opts?.reset !== false;
  if (reset) {
    const first = emptyOrder();
    emit({
      open: true,
      queue: [first],
      activeOrderId: first.id,
      pendingAttachments: [],
      prompt:
        'Paste purchase-order screenshots or text — multi-page and multi-order are both fine.',
      extracting: false,
      confirming: false,
      error: null,
    });
    return;
  }
  emit({
    ...snapshot,
    open: true,
    extracting: false,
    confirming: false,
    error: null,
  });
}

export function closePoIntake(): void {
  emit(initialSnapshot());
}

export function setPoIntakeActiveOrder(orderId: string): void {
  if (!snapshot.queue.some((o) => o.id === orderId)) return;
  emit({ ...snapshot, activeOrderId: orderId, error: null });
}

export function setPoIntakeDraft(draft: PoIntakeDraft): void {
  const queue = snapshot.queue.map((o) =>
    o.id === snapshot.activeOrderId ? { ...o, draft } : o,
  );
  emit({ ...snapshot, queue, error: null });
}

export function patchPoIntakeDraft(patch: Partial<PoIntakeDraft>): void {
  const active = getActivePoIntakeOrder();
  setPoIntakeDraft({ ...active.draft, ...patch });
}

/** Replace the active order's draft after extract (optionally bind thumbnail). */
export function applyExtractedDraftToActive(
  draft: PoIntakeDraft,
  meta?: { sourceName?: string | null; thumbnailDataUrl?: string | null },
): void {
  const queue = snapshot.queue.map((o) =>
    o.id === snapshot.activeOrderId
      ? {
          ...o,
          draft,
          sourceName: meta?.sourceName ?? o.sourceName,
          thumbnailDataUrl: meta?.thumbnailDataUrl ?? o.thumbnailDataUrl,
        }
      : o,
  );
  emit({ ...snapshot, queue, error: null });
}

/**
 * Append a new order seeded from an extract (many documents → many orders).
 * Activates the new entry.
 */
export function appendExtractedPoOrder(
  draft: PoIntakeDraft,
  meta?: { sourceName?: string | null; thumbnailDataUrl?: string | null },
): string {
  const entry: PoIntakeQueuedOrder = {
    id: nextId('po'),
    draft,
    sourceName: meta?.sourceName ?? null,
    thumbnailDataUrl: meta?.thumbnailDataUrl ?? null,
  };
  emit({
    ...snapshot,
    queue: [...snapshot.queue, entry],
    activeOrderId: entry.id,
    error: null,
  });
  return entry.id;
}

/** Prefer replace empty active; otherwise append. Returns the target order id. */
export function placeExtractedPoOrder(
  draft: PoIntakeDraft,
  meta?: { sourceName?: string | null; thumbnailDataUrl?: string | null },
): string {
  const active = getActivePoIntakeOrder();
  const activeEmpty =
    !active.draft.orderId.trim()
    && !active.draft.trackingNumber.trim()
    && active.draft.lines.every(
      (l) => !l.sku.trim() && !l.itemName.trim() && !l.quantity.trim(),
    )
    && !active.thumbnailDataUrl;

  if (activeEmpty) {
    applyExtractedDraftToActive(draft, meta);
    return active.id;
  }
  return appendExtractedPoOrder(draft, meta);
}

export function addEmptyPoOrder(): string {
  const entry = emptyOrder();
  emit({
    ...snapshot,
    queue: [...snapshot.queue, entry],
    activeOrderId: entry.id,
    prompt: 'Fill this order — or paste another screenshot.',
    error: null,
  });
  return entry.id;
}

export function removePoOrder(orderId: string): void {
  if (snapshot.queue.length <= 1) {
    const first = emptyOrder();
    emit({
      ...snapshot,
      queue: [first],
      activeOrderId: first.id,
      error: null,
    });
    return;
  }
  const queue = snapshot.queue.filter((o) => o.id !== orderId);
  const activeOrderId =
    snapshot.activeOrderId === orderId
      ? (queue[0]?.id ?? emptyOrder().id)
      : snapshot.activeOrderId;
  emit({ ...snapshot, queue, activeOrderId, error: null });
}

export function removePoOrders(orderIds: readonly string[]): void {
  const drop = new Set(orderIds);
  const queue = snapshot.queue.filter((o) => !drop.has(o.id));
  if (queue.length === 0) {
    const first = emptyOrder();
    emit({
      ...snapshot,
      queue: [first],
      activeOrderId: first.id,
      error: null,
    });
    return;
  }
  const activeOrderId = drop.has(snapshot.activeOrderId)
    ? (queue[0]?.id ?? snapshot.activeOrderId)
    : snapshot.activeOrderId;
  emit({ ...snapshot, queue, activeOrderId, error: null });
}

export function setPoIntakePendingAttachments(
  pending: PoIntakePendingAttachment[],
): void {
  emit({ ...snapshot, pendingAttachments: pending });
}

export function addPoIntakePendingAttachments(
  files: Array<{ name: string; dataUrl: string }>,
): PoIntakePendingAttachment[] {
  const added = files.map((f) => ({
    id: nextId('att'),
    name: f.name,
    dataUrl: f.dataUrl,
  }));
  emit({
    ...snapshot,
    pendingAttachments: [...snapshot.pendingAttachments, ...added],
  });
  return added;
}

export function removePoIntakePendingAttachment(id: string): void {
  emit({
    ...snapshot,
    pendingAttachments: snapshot.pendingAttachments.filter((a) => a.id !== id),
  });
}

export function clearPoIntakePendingAttachments(): void {
  emit({ ...snapshot, pendingAttachments: [] });
}

export function setPoIntakePrompt(prompt: string): void {
  emit({ ...snapshot, prompt });
}

export function setPoIntakeExtracting(extracting: boolean): void {
  emit({ ...snapshot, extracting, error: extracting ? null : snapshot.error });
}

export function setPoIntakeConfirming(confirming: boolean): void {
  emit({ ...snapshot, confirming });
}

export function setPoIntakeError(error: string | null): void {
  emit({ ...snapshot, error, extracting: false, confirming: false });
}

export function readyPoOrderIds(snap: PoIntakeSnapshot = snapshot): string[] {
  return snap.queue.filter((o) => canConfirmPoIntake(o.draft)).map((o) => o.id);
}
