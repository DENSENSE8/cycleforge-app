/** Assistant context registry — the module-scope store behind useAssistantContext (plan §-2 "Context injection is a registry hook, not… */

import type { DocumentOcrEvidence } from '@/lib/document-intake/contract';

/**
 * An entity the operator picked with `@` in the composer. Per-turn, never page
 * state: the composer sends it on one message and the server names the exact
 * id to the model (`buildContextFragment`).
 */
export interface AssistantMention {
  kind: 'order' | 'sku' | 'bin';
  /** The entity's own id: orders.id, the SKU string, the bin barcode. */
  id: string;
  /** What the composer inserted after `@`, e.g. "order 4899". */
  label: string;
}

/**
 * A file dropped on the composer, already uploaded. Per-message like a
 * mention: `id` is the stored row (`product_manuals.id` for `product_manual`).
 */
export interface AssistantAttachment {
  id: number;
  kind: 'product_manual';
  name: string;
  mime: string;
  /** Server-derived only. The client schema never accepts an OCR transcript. */
  ocr?: DocumentOcrEvidence;
}

export interface AssistantPageContext {
  /** Route/page identity, e.g. 'operations', 'studio', 'packer-station'. */
  page: string;
  /** Station identity when the page is a bench, e.g. 'PACKING'. */
  station?: string | null;
  /** Durable selection on the page (id + kind), e.g. { kind: 'receiving', id: 42 }. */
  selection?: { kind: string; id: string | number } | null;
  /** Current URL mode/view param, e.g. 'analytics'. */
  mode?: string | null;
  /**
   * Skill fragment: prompt text teaching the assistant this page's vocabulary
   * and jobs. Injected server-side into the system prompt for this request.
   */
  skill?: string | null;
  /** `@` references on THIS message only — see {@link AssistantMention}. */
  mentions?: AssistantMention[] | null;
  /** Files uploaded for THIS message only — see {@link AssistantAttachment}. */
  attachments?: AssistantAttachment[] | null;
}

interface RegisteredContext {
  id: number;
  ctx: AssistantPageContext;
}

const stack: RegisteredContext[] = [];
const listeners = new Set<() => void>();
let nextId = 1;
/** Cached snapshot — useSyncExternalStore requires referential stability. */
let snapshot: AssistantPageContext | null = null;

function emit(): void {
  snapshot = stack.length > 0 ? stack[stack.length - 1].ctx : null;
  listeners.forEach((l) => l());
}

/** Last-registered-wins; returns the unregister fn (call on unmount). */
export function registerAssistantContext(ctx: AssistantPageContext): () => void {
  const entry: RegisteredContext = { id: nextId++, ctx };
  stack.push(entry);
  emit();
  return () => {
    const idx = stack.findIndex((e) => e.id === entry.id);
    if (idx >= 0) stack.splice(idx, 1);
    emit();
  };
}

export function getAssistantContext(): AssistantPageContext | null {
  return snapshot;
}

export function subscribeAssistantContext(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
