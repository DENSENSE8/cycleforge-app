/**
 * What the assistant knows when it is asked from `/search`: the open record
 * (`?sel=`) and the query (`?q=`). An order also travels as a mention, so the
 * model gets the EXACT `orders.id` to pass to its tools (`buildContextFragment`);
 * every other record kind rides as the page selection (a SKU mention needs the
 * SKU string, which `?sel=sku:<pk>` does not carry).
 */

import type { AssistantMention, AssistantPageContext } from '@/lib/assistant/context-store';
import type { SearchSelection } from '@/lib/search/search-selection';

/** The record the operator has open, as the composer names it. */
export interface SearchAssistantRecord {
  sel: SearchSelection;
  /** Human face of the record — "Order FBA19JY9D8PV", "Unit 83042". */
  label: string;
  /** An order's marketplace number (`orders.order_id`) — NOT its pk; lookups by number take this. */
  orderNumber?: string | null;
}

const SEARCH_SKILL =
  'The operator asked from Search (/search), where one record is open beside this chat. ' +
  'Answer about that record first; call tools with the exact ids given. ' +
  'When you name another record, link it as /search?sel=<type>:<id> (order, unit, receiving, sku, repair, fba) — ' +
  'the link opens it beside the chat, so prefer a link over restating its details.';

/** The open record in words, so an order's pk and its order number are never confused. */
function recordFacts(record: SearchAssistantRecord | null): string {
  if (!record) return '';
  const { entityType, id } = record.sel;
  if (entityType === 'order') {
    const number = record.orderNumber?.trim();
    return number
      ? ` Open record: order number ${number} (orders.id ${id}). Tools that look an order up by its number take "${number}"; tools that take an orders.id take ${id}.`
      : ` Open record: orders.id ${id}.`;
  }
  return ` Open record: ${entityType} id ${id} (${record.label}).`;
}

export function searchAssistantContext(
  record: SearchAssistantRecord | null,
  query: string,
): AssistantPageContext {
  const q = query.trim();
  const mention: AssistantMention | null =
    record?.sel.entityType === 'order'
      ? { kind: 'order', id: String(record.sel.id), label: record.label.slice(0, 120) }
      : null;
  return {
    page: 'search',
    selection: record ? { kind: record.sel.entityType, id: record.sel.id } : null,
    mode: q ? `query "${q}"`.slice(0, 80) : null,
    skill: SEARCH_SKILL + recordFacts(record),
    mentions: mention ? [mention] : null,
  };
}

/** The composer's placeholder, naming what the question is about. */
export function searchAssistantPrompt(record: SearchAssistantRecord | null, query: string): string {
  if (record) return `Ask about ${record.label}…`;
  const q = query.trim();
  return q ? `Ask about the results for “${q}”…` : 'Ask anything about orders, units, cartons…';
}
