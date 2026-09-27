/**
 * A print the chat raised, as the transcript card runs it over the staff print
 * bridge: what to print (the request), and where it is (the phase).
 *
 *   tote labels   `print_handling_unit_labels` (UI tool): existing totes by
 *                 handle, or a COUNT of new totes the station mints and prints
 *                 (the bulk tote run). A big run waits for the operator's tap.
 *   order papers  `print_order_paperwork` (server tool → device action): the
 *                 orders and papers the server resolved; the station prints
 *                 them in one `papers` job and writes `document_print_jobs`.
 *
 * Phases: (confirm) → finding → (pick) → sending → acked (n/total) → printed
 * → recorded (papers: the batch's ledger rows read back), or failed / cancelled.
 */

import { handlingUnitHandle } from '@/lib/barcode-routing';
import { MAX_PAPERWORK_PRINT_ORDERS, MAX_TOTE_PRINT_RUN } from '@/lib/print/labelCopies';
import type { StaffPrintPaperDocument, StaffPrintRole } from '@/lib/print/staff-print-bridge';

/** New tote labels above this count wait for the operator's tap before anything is minted or printed. */
export const TOTE_RUN_CONFIRM_ABOVE = 10;

/** Existing totes one chat call may reprint. */
const MAX_TOTE_REPRINT_CODES = 10;

export interface ChatPaperOrder {
  orderRowId: number;
  orderNumber: string;
  /** What prints for it, in words ("shipping label + packing slip"). */
  papers: string;
}

export type ChatPrintRequest =
  | { kind: 'tote_reprint'; codes: string[] }
  | { kind: 'tote_new'; count: number }
  | { kind: 'papers'; orders: ChatPaperOrder[]; documents: StaffPrintPaperDocument[]; reprint: boolean };

export type ChatPrintPhase =
  | { kind: 'confirm' }
  | { kind: 'finding' }
  | { kind: 'pick'; reason: string }
  | { kind: 'sending'; station: string }
  | { kind: 'acked'; station: string; done: number; total: number }
  | { kind: 'printed'; station: string; count: number }
  | { kind: 'recorded'; station: string; count: number; rows: number; missing: string[] }
  | { kind: 'failed'; reason: string }
  | { kind: 'cancelled' };

export interface ChatPrintJob {
  id: string;
  /** The answer that raised it — the card renders under it. */
  messageId: string;
  request: ChatPrintRequest;
  phase: ChatPrintPhase;
}

const PAPER_DOCUMENTS: Record<string, true> = { shipping_label: true, packing_slip: true, manual: true };

function positiveInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * The print a browser verb asks for, or null for junk. Every value is bounded
 * here: the input came over the wire from the model (tote tool) or the server
 * (device action), and a bad one must print nothing rather than a guess.
 */
export function parseChatPrintRequest(name: string, input: Record<string, unknown>): ChatPrintRequest | null {
  if (name === 'print_handling_unit_labels') {
    if (Array.isArray(input.handlingUnitIds) && input.handlingUnitIds.length > 0) {
      const ids = input.handlingUnitIds.map(positiveInt).filter((v): v is number => v !== null);
      const codes = [...new Set(ids)].slice(0, MAX_TOTE_REPRINT_CODES).map(handlingUnitHandle);
      return codes.length > 0 ? { kind: 'tote_reprint', codes } : null;
    }
    const count = positiveInt(input.count);
    return count !== null && count <= MAX_TOTE_PRINT_RUN ? { kind: 'tote_new', count } : null;
  }
  if (name === 'print_order_paperwork') {
    if (!Array.isArray(input.orders) || !Array.isArray(input.documents)) return null;
    const orders: ChatPaperOrder[] = [];
    for (const raw of input.orders) {
      if (!raw || typeof raw !== 'object') return null;
      const o = raw as Record<string, unknown>;
      const orderRowId = positiveInt(o.orderRowId);
      if (orderRowId === null || orders.some((x) => x.orderRowId === orderRowId)) return null;
      orders.push({
        orderRowId,
        orderNumber: String(o.orderNumber ?? orderRowId).slice(0, 120),
        papers: String(o.papers ?? '').slice(0, 120),
      });
    }
    const documents = input.documents.filter((d): d is StaffPrintPaperDocument => typeof d === 'string' && Object.hasOwn(PAPER_DOCUMENTS, d));
    if (orders.length === 0 || orders.length > MAX_PAPERWORK_PRINT_ORDERS || documents.length === 0) return null;
    return { kind: 'papers', orders, documents: [...new Set(documents)], reprint: input.reprint === true };
  }
  return null;
}

/** A big new-tote run waits for a tap; everything else looks for the station at once. */
export function initialChatPrintPhase(request: ChatPrintRequest): ChatPrintPhase {
  return request.kind === 'tote_new' && request.count > TOTE_RUN_CONFIRM_ABOVE ? { kind: 'confirm' } : { kind: 'finding' };
}

/** Which printer on the station the job needs. */
export function chatPrintRole(request: ChatPrintRequest): StaffPrintRole {
  return request.kind === 'papers' ? 'paper' : 'label';
}

/** "3 labels" / "2 orders" — the unit progress counts in. */
export function chatPrintUnits(request: ChatPrintRequest, n: number): string {
  const unit = request.kind === 'papers' ? 'order' : 'label';
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

/** The card's heading: what this print is, identity first. */
export function chatPrintTitle(request: ChatPrintRequest): string {
  if (request.kind === 'tote_reprint') return `Tote labels · ${request.codes.join(', ')}`;
  if (request.kind === 'tote_new') return `New tote labels · ${request.count}`;
  const orders = request.orders.map((o) => o.orderNumber);
  const shown = orders.length > 3 ? `${orders.slice(0, 3).join(', ')} +${orders.length - 3} more` : orders.join(', ');
  return `${request.reprint ? 'Reprint' : 'Print'} order papers · ${shown}`;
}
