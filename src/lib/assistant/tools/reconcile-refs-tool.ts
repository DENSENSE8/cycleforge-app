/**
 * reconcile_refs — "here is a vendor's list, which of these did we get?"
 * (chat-roi row 3). GREEN: org-scoped reads only.
 *
 * The operator pastes tracking / order / PO numbers. The SERVER reads the list
 * out of the message (`ctx.userMessage`) — the model never retypes it, so a
 * 60-line paste costs no decode and cannot lose a digit. Two reads answer it,
 * the same two the Inbound Find uses (`inbound-check-query.ts`):
 *
 *  - the inbound verdict per number: the Unbox station's Check
 *    (`checkZohoReceived`) plus the `view=reconcile` receiving lines, folded by
 *    `reconcileCheck` (physical-first: a dock scan or an unbox is "received");
 *  - `identify()` in batch for the numbers the inbound side does not own — an
 *    outbound order number is PENDING (still to ship) or shipped, and a number
 *    nothing knows is NOT IN SYSTEM.
 *
 * The table rides the panel (`brandReportEnvelope`); the model reads a short
 * summary with the counts and the refs that need a person.
 */

import { z } from 'zod';
import { brandReportEnvelope, type ToolArtifactEnvelope } from '@/lib/assistant/tool-artifact';
import type { ArtifactTable } from '@/lib/assistant/ui-artifacts';
import { identify } from '@/lib/identify/identify';
import { IDENTIFY_MAX_LINES, type IdentifyCandidate, type IdentifyLine, type IdentifyStage } from '@/lib/identify/schema';
import { checkZohoReceived, type CheckZohoReceivedRow } from '@/lib/receiving/check-zoho-received';
import { fetchReceivingLinesPage, resolveReceivingLinesReadFlags } from '@/lib/receiving/lines/list-page';
import { parseReceivingLinesQuery } from '@/lib/receiving/lines/query';
import { reconcileListParams } from '@/lib/receiving/receiving-modes';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  REF_IN_PARAM,
  parseRefList,
  reconcileCheck,
  serializeRefIn,
  type ReconEntry,
  type RefSelection,
} from '@/lib/receiving/reconcile';
import { canonicalizeTrackingKey } from '@/lib/zoho/call-reduction';
import type { OrgId } from '@/lib/tenancy/constants';
import type { AssistantToolDef } from './types';

// ─── Reading the list out of a message (pure) ────────────────────────────────

/** A bullet / list number in front of a pasted value: "1.", "2)", "-", "•". */
const LIST_MARK = /^\s*(?:[-*•·]|\d{1,3}[.)])\s+/;

/**
 * One pasted identifier: carries a digit, 4–40 chars (a 4-digit order # counts), no inner whitespace,
 * starts alphanumeric. Words ("these", "vendor", "PO") never qualify.
 */
function isRefToken(token: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9#._/-]{3,39}$/.test(token) && /\d/.test(token);
}

function lineTokens(line: string): string[] {
  return line
    .replace(LIST_MARK, '')
    .split(/[\s,;\t]+/)
    .map((t) => t.replace(/^[#"'(]+|["'),.:;]+$/g, ''))
    .filter(Boolean);
}

/** The pasted identifiers in a message, in order — every other word dropped. */
export function extractRefText(message: string): string {
  return message
    .split(/\r?\n/)
    .flatMap((line) => lineTokens(line).filter(isRefToken))
    .join('\n');
}

/**
 * The reconcile fast-path gate: a message that is MOSTLY a pasted list — at
 * least two lines, at least two identifiers, every line but at most two (a
 * "check these:" header, a sign-off) nothing but identifiers. A question, a
 * PO or order paste ("Vendor: Acme", "qty 2") or a CSV with words is not one.
 */
export function isRefListPaste(message: string): boolean {
  const lines = message.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  let refLines = 0;
  let refs = 0;
  for (const line of lines) {
    const tokens = lineTokens(line);
    if (tokens.length > 0 && tokens.every(isRefToken)) {
      refLines += 1;
      refs += tokens.length;
    }
  }
  const otherLines = lines.length - refLines;
  return refs >= 2 && refLines >= 2 && otherLines <= 2 && refLines / lines.length >= 0.6;
}

// ─── Classification (pure) ───────────────────────────────────────────────────

export const REF_GROUPS = ['received', 'not_received', 'not_in_system', 'pending', 'shipped', 'other'] as const;
export type RefGroup = (typeof REF_GROUPS)[number];

export const REF_GROUP_LABELS: Readonly<Record<RefGroup, string>> = {
  received: 'Received',
  not_received: 'Not received',
  not_in_system: 'Not in system',
  pending: 'Pending',
  shipped: 'Shipped',
  other: 'Other record',
};

export interface RefRow {
  ref: string;
  group: RefGroup;
  /** What the number is: inbound delivery, outbound order, … */
  what: string;
  /** Why, in the words the operator acts on. */
  status: string;
  /** PO number (inbound) or order number (outbound). */
  record: string | null;
  /** Vendor (inbound) or the item / channel (outbound). */
  detail: string | null;
}

const STAGE_LABELS: Readonly<Record<IdentifyStage, string>> = {
  exception: 'In exceptions',
  picking: 'Picking',
  to_ship: 'To ship',
  shipped: 'Shipped',
  receiving: 'In receiving',
};

const KIND_LABELS: Readonly<Record<IdentifyCandidate['kind'], string>> = {
  order: 'Outbound order',
  unit: 'Serialized unit',
  receiving: 'Inbound carton',
  sku: 'Product',
  repair: 'Repair',
  fba: 'FBA shipment',
  warranty: 'Warranty claim',
  ticket: 'Support ticket',
  location: 'Bin',
};

/** Check verdicts that mean "no inbound record answered this number". */
const NO_INBOUND_ANSWER: Record<string, true> = { 'No match anywhere': true, 'Lookup failed': true, 'Not checked · Zoho limit': true };

/** An owed number whose only evidence is a local tracking row (no PO, no line). */
function inboundUnowned(entry: ReconEntry): boolean {
  if (entry.status === 'received') return false;
  if (entry.exception && Object.hasOwn(NO_INBOUND_ANSWER, entry.exception.reason)) return true;
  return entry.poNumber === null && (entry.reasonCode === 'in_transit' || entry.reasonCode === 'delivered_not_scanned');
}

/** The order number an identify order candidate carries ("21-15107-47310 · eBay"). */
function orderNumberOf(candidate: IdentifyCandidate): string | null {
  const head = candidate.subtitle?.split(' · ')[0]?.trim();
  return head || null;
}

/**
 * One row per pasted number, in paste order. The inbound verdict wins whenever
 * the inbound side owns the number (a PO, a receiving line, a scan); otherwise
 * identify says what it is.
 */
export function classifyRefs(entries: readonly ReconEntry[], lines: readonly IdentifyLine[]): RefRow[] {
  const byKey = new Map<string, IdentifyLine>();
  for (const line of lines) byKey.set(canonicalizeTrackingKey(line.input), line);
  return entries.map((entry) => {
    if (!inboundUnowned(entry)) {
      return {
        ref: entry.ref,
        group: entry.status === 'received' ? 'received' : 'not_received',
        what: 'Inbound delivery',
        status: entry.detail,
        record: entry.poNumber,
        detail: entry.vendor,
      };
    }
    const candidates = byKey.get(entry.key)?.candidates ?? [];
    const order = candidates.find((c) => c.kind === 'order');
    if (order) {
      return {
        ref: entry.ref,
        group: order.stage === 'shipped' ? 'shipped' : 'pending',
        what: 'Outbound order',
        status: order.stage ? STAGE_LABELS[order.stage] : 'Open, not shipped',
        record: orderNumberOf(order),
        detail: order.title.slice(0, 120) || null,
      };
    }
    const other = candidates[0];
    if (other) {
      return {
        ref: entry.ref,
        group: other.kind === 'receiving' ? 'not_received' : 'other',
        what: KIND_LABELS[other.kind],
        status: other.stage ? STAGE_LABELS[other.stage] : 'On file',
        record: null,
        detail: other.title.slice(0, 120) || null,
      };
    }
    const reason = entry.exception?.reason;
    return {
      ref: entry.ref,
      group: 'not_in_system',
      what: 'Unknown',
      status:
        reason === 'Lookup failed' || reason === 'Not checked · Zoho limit'
          ? `Not found here · ${reason === 'Lookup failed' ? 'Zoho lookup failed' : 'Zoho not checked'}`
          : 'Not found in Zoho, receiving or orders',
      record: null,
      detail: null,
    };
  });
}

export function countGroups(rows: readonly RefRow[]): Record<RefGroup, number> {
  const counts = Object.fromEntries(REF_GROUPS.map((g) => [g, 0])) as Record<RefGroup, number>;
  for (const row of rows) counts[row.group] += 1;
  return counts;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "2 received · 1 not received · 3 not in system" — the four asked-for groups always, the rest when present. */
export function countsLine(counts: Record<RefGroup, number>): string {
  return REF_GROUPS.filter((g) => counts[g] > 0 || g === 'received' || g === 'not_received' || g === 'not_in_system' || g === 'pending')
    .map((g) => `${counts[g]} ${REF_GROUP_LABELS[g].toLowerCase()}`)
    .join(' · ');
}

/** At most `max` refs of one group, "+N more" after. */
function refList(rows: readonly RefRow[], group: RefGroup, max = 8): string {
  const refs = rows.filter((r) => r.group === group).map((r) => r.ref);
  return refs.length > max ? `${refs.slice(0, max).join(', ')} and ${refs.length - max} more` : refs.join(', ');
}

/** The table, the model's summary and the operator's one-liner — from one set of rows. */
export function buildReconcileEnvelope(rows: readonly RefRow[], truncated: number): ToolArtifactEnvelope {
  const counts = countGroups(rows);
  const ordered = REF_GROUPS.flatMap((g) => rows.filter((r) => r.group === g));
  const refIn = serializeRefIn(rows.filter((r) => r.group === 'received' || r.group === 'not_received').map((r) => r.ref));
  const href = `/incoming?${REF_IN_PARAM}=${encodeURIComponent(refIn)}`;
  const artifact: ArtifactTable = {
    kind: 'table',
    title: `Reconciled ${plural(rows.length, 'number')}`,
    columns: ['Group', 'Ref', 'What', 'Status', 'PO / order', 'Vendor / item'],
    rows: ordered.slice(0, 200).map((r) => ({
      Group: REF_GROUP_LABELS[r.group],
      Ref: r.ref,
      What: r.what,
      Status: r.status,
      'PO / order': r.record,
      'Vendor / item': r.detail,
    })),
    entityHint: 'pasted number',
    idColumn: 'Ref',
    identity: {
      title: `${plural(rows.length, 'pasted number')}`,
      subtitle: countsLine(counts).slice(0, 160),
      ids: [],
      chips: REF_GROUPS.filter((g) => counts[g] > 0).map((g) => `${counts[g]} ${REF_GROUP_LABELS[g].toLowerCase()}`).slice(0, 6),
      ...(refIn && href.length <= 300 ? { href } : {}),
    },
  };
  const needs: string[] = [];
  if (counts.not_received) needs.push(`not received: ${refList(rows, 'not_received')}`);
  if (counts.not_in_system) needs.push(`not in system: ${refList(rows, 'not_in_system')}`);
  if (counts.pending) needs.push(`pending (still to ship): ${refList(rows, 'pending')}`);
  const cap = truncated > 0 ? ` Only the first ${rows.length} were checked; ${truncated} more were not.` : '';
  const headline = `${plural(rows.length, 'number')}: ${countsLine(counts)}.`;
  const answer = `${headline}${needs.length ? ` ${needs.map((n) => n.charAt(0).toUpperCase() + n.slice(1)).join('. ')}.` : ''}${cap}`;
  return brandReportEnvelope(
    {
      artifact,
      summary: `${answer} The grouped table is already on screen — do not render it or list every number again. Say the counts and the numbers that need a person; offer to import the ones not in the system.`,
      answer,
    },
    'reconcile_refs',
  );
}

// ─── The tool ────────────────────────────────────────────────────────────────

export interface ReconcileSources {
  check: (orgId: OrgId, refs: string[]) => Promise<CheckZohoReceivedRow[]>;
  lines: (orgId: OrgId, refs: readonly string[]) => Promise<ReceivingLineRow[]>;
  identify: (orgId: OrgId, refs: readonly string[]) => Promise<IdentifyLine[]>;
}

const realSources: ReconcileSources = {
  check: async (orgId, refs) => {
    // The Check folds its three buckets back into one list, as the Inbound Find does.
    const result = await checkZohoReceived(orgId, refs);
    if ('error' in result) throw new Error(result.error);
    return [...result.received_in_zoho, ...result.not_received_in_zoho, ...result.undetermined];
  },
  lines: async (orgId, refs) => {
    const query = parseReceivingLinesQuery(reconcileListParams(refs));
    const page = await fetchReceivingLinesPage({
      query,
      orgId,
      viewerStaffId: 0,
      universalIncoming: false,
      ...resolveReceivingLinesReadFlags(query),
    });
    return page.rows as unknown as ReceivingLineRow[];
  },
  identify: async (orgId, refs) => {
    // identify reads at most IDENTIFY_MAX_LINES lines per call — batch the rest.
    const batches: string[][] = [];
    for (let i = 0; i < refs.length; i += IDENTIFY_MAX_LINES) batches.push(refs.slice(i, i + IDENTIFY_MAX_LINES));
    const answers = await Promise.all(batches.map((b) => identify(orgId, { q: b.join('\n'), limit: 3 })));
    return answers.flatMap((a) => a.lines);
  },
};

let sources: ReconcileSources = realSources;

/** Test seam — swap the three reads; returns a restore function. */
export function setReconcileSourcesForTest(next: ReconcileSources): () => void {
  sources = next;
  return () => {
    sources = realSources;
  };
}

/** Run the three reads for one selection and fold them into rows. */
export async function reconcileSelection(orgId: OrgId, selection: RefSelection): Promise<RefRow[]> {
  const [check, lines, identified] = await Promise.all([
    sources.check(orgId, selection.refs),
    sources.lines(orgId, selection.refs).catch(() => [] as ReceivingLineRow[]),
    sources.identify(orgId, selection.refs).catch(() => [] as IdentifyLine[]),
  ]);
  return classifyRefs(reconcileCheck(selection, check, lines), identified);
}

const reconcileInput = z.object({
  refs: z
    .string()
    .max(20_000)
    .optional()
    .describe('Leave empty: the numbers are read from the operator\'s message. Only pass numbers the operator typed in an EARLIER message.'),
});

export const reconcileRefs: AssistantToolDef<typeof reconcileInput> = {
  name: 'reconcile_refs',
  description:
    'Reconcile a PASTED LIST of tracking / order / PO numbers: which were received, not received, not in the system, or are pending outbound orders. Use for "which of these did we receive", "check this list", a vendor list pasted one per line. Call with no arguments — the list is read from the message; never retype it. Shows the grouped table itself.',
  permission: 'receiving.view',
  inputSchema: reconcileInput,
  run: async (input, ctx) => {
    const text = extractRefText(input.refs?.trim() ? input.refs : ctx.userMessage ?? '');
    const selection = parseRefList(text);
    if (selection.refs.length === 0) {
      return { found: false, message: 'No tracking, order or PO numbers were found in the message to reconcile.' };
    }
    const rows = await reconcileSelection(ctx.organizationId, selection);
    return buildReconcileEnvelope(rows, selection.truncated);
  },
};
