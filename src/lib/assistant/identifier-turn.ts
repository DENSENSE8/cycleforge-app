/**
 * The pasted-id / wedge-scan fast path (HANDOFF-search-triage-record, AI track
 * A2 + A6): when the WHOLE message is one identifier — a SKU, FNSKU, UPC/EAN,
 * serial, order #, tracking, LPN, bin, PO, a customer's email or phone — the
 * chat route runs the right read tool itself and shows its record at once.
 * No model round: the model only answers follow-ups (the turn is persisted
 * like any other, so "how many is that in total?" still has its context).
 *
 * ONE classifier for both mouths: the kind comes from `identify()` — the
 * library behind `/api/identify` — imported, not called over HTTP. A question
 * ("where is X?", "who packed order 4899") never takes this path; the shape
 * gate below only admits a message that is nothing but an identifier.
 */

import { classifyIdentifyLine } from '@/lib/identify/classify';
import { identify } from '@/lib/identify/identify';
import type { IdentifyResponse } from '@/lib/identify/schema';
import type { OrgId } from '@/lib/tenancy/constants';
import { isRefListPaste } from '@/lib/assistant/tools/reconcile-refs-tool';

export type IdentifierTurnTool = 'locate_product' | 'list_location_contents' | 'find_records' | 'get_customer' | 'reconcile_refs';

export interface IdentifierTurnPlan {
  tool: IdentifierTurnTool;
  input: Record<string, unknown>;
  /**
   * A shape that is only PROBABLY an identifier (a Title Case name): answer
   * without the model only when the finder actually found it; a miss hands
   * the message to the model as a normal question.
   */
  onlyIfFound: boolean;
}

/** What shape of bare identifier the message is, or null for anything that reads as a question. */
export type BareIdentifierShape = 'token' | 'email' | 'phone' | 'name';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
/** Phone punctuation only, 10–15 digits: `(555) 123-4567`, `+1 555 123 4567`. */
const PHONE_RE = /^\+?[\d\s().-]{10,24}$/;
/** Two or three Title Case words — a customer name typed bare. */
const NAME_RE = /^[A-Z][a-z'’.-]+(?: [A-Z][a-z'’.-]+){1,2}$/;
const LPN_RE = /^H-\d+$/i;

/** Pure shape gate. Only a message that is nothing but one identifier passes. */
export function bareIdentifierShape(message: string): BareIdentifierShape | null {
  const text = message.trim();
  if (text.length < 3 || text.length > 120 || /[\r\n?]/.test(text)) return null;
  if (EMAIL_RE.test(text)) return 'email';
  if (PHONE_RE.test(text) && /\s|[()+]/.test(text)) {
    const digits = text.replace(/\D/g, '').length;
    if (digits >= 10 && digits <= 15) return 'phone';
  }
  if (!/\s/.test(text)) {
    // One token: an identifier when it carries a digit, or when identify's
    // classifier reads it as a machine code (handle, Digital Link, GS1, FNSKU).
    return /\d/.test(text) || classifyIdentifyLine(text).machineIdentifier ? 'token' : null;
  }
  // Several words: a printed handle / GS1 string still counts; a Title Case
  // name is a probable customer; everything else is a question.
  if (classifyIdentifyLine(text).machineIdentifier) return 'token';
  return NAME_RE.test(text) ? 'name' : null;
}

export interface IdentifierTurnDeps {
  identify: (orgId: OrgId, q: string) => Promise<IdentifyResponse>;
}

const defaultDeps: IdentifierTurnDeps = {
  identify: (orgId, q) => identify(orgId, { q, limit: 3 }),
};

/**
 * Decide which read tool answers a bare identifier, or null when the message
 * is not one. The top `identify` candidate picks the reader: a product →
 * where it is stocked; a bin → what it holds; a serialized unit → where that
 * unit is; everything else (orders, tracking, receiving / PO, repairs, FBA,
 * tickets, customers) → the record finder the Search page uses.
 */
export async function planIdentifierTurn(
  orgId: OrgId,
  message: string,
  deps: IdentifierTurnDeps = defaultDeps,
): Promise<IdentifierTurnPlan | null> {
  const text = message.trim();
  // A pasted LIST (several lines of numbers) is reconciled as a whole; the
  // tool reads the list from the message itself.
  if (isRefListPaste(text)) return { tool: 'reconcile_refs', input: {}, onlyIfFound: false };
  const shape = bareIdentifierShape(text);
  if (!shape) return null;
  const find = (query: string, onlyIfFound = false): IdentifierTurnPlan => ({
    tool: 'find_records',
    input: { query },
    onlyIfFound,
  });
  // A caller's phone, email or name → their dossier. A miss is not proof they
  // are unknown (the finder also reads order buyer fields), so it goes to the model.
  if (shape === 'email' || shape === 'phone' || shape === 'name') {
    return { tool: 'get_customer', input: { query: text }, onlyIfFound: true };
  }
  if (LPN_RE.test(text)) return { tool: 'locate_product', input: { query: text }, onlyIfFound: false };

  const identified = await deps.identify(orgId, text);
  const top = identified.lines[0]?.candidates[0];
  switch (top?.kind) {
    case 'sku':
      return { tool: 'locate_product', input: { query: text }, onlyIfFound: false };
    case 'location':
      return { tool: 'list_location_contents', input: { location: text }, onlyIfFound: false };
    case 'unit':
      return { tool: 'locate_product', input: { query: text, kind: 'serial' }, onlyIfFound: false };
    default:
      // identify found no record: a product / bin SHAPE still has its reader
      // (an FNSKU outside the catalog, a bin face identify does not index), so
      // the miss is said by the tool that owns that kind.
      if (/^X00[A-Z0-9]{7}$/i.test(text)) return { tool: 'locate_product', input: { query: text }, onlyIfFound: false };
      if (/^[A-Z]-\d{2}-\d{2}-\d$/i.test(text)) return { tool: 'list_location_contents', input: { location: text }, onlyIfFound: false };
      return find(text);
  }
}

/**
 * The fast path's answer sentence, read off the tool's own result: the
 * operator-facing `answer` a tool built from its data, else its `message`.
 * Null when the result carries neither (the caller then asks the model).
 */
export function identifierTurnAnswer(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as { answer?: unknown; message?: unknown };
  const text = typeof record.answer === 'string' ? record.answer : typeof record.message === 'string' ? record.message : null;
  return text && text.trim() ? text.trim() : null;
}

/** True when a finder result found nothing (`found: false`). */
export function identifierTurnMissed(data: unknown): boolean {
  return Boolean(data && typeof data === 'object' && (data as { found?: unknown }).found === false);
}
