/**
 * `GET|POST /api/nav/locate` domain — where identifiers live. One locator per
 * section (`./outbound`, `./inbound`, `./support`); `everywhere` = every
 * shipping locator the caller may read, bucket ids / labels prefixed with the
 * section. A section locator asks the other readable shipping sections about
 * the pasted refs it holds nowhere, so "found nowhere" is never "not on this
 * page" (`mergeLocated`, one merge). Support is asked on /support only.
 */

import {
  NAV_LOCATE_MAX_REFS,
  type NavLocateBucket,
  type NavLocateEntry,
  type NavLocateResponse,
  type NavLocateScope,
  type NavLocator,
} from '@/lib/nav/context/schema';
import { INBOUND_LOCATE_PERMISSION, locateInbound } from '@/lib/nav/locate/inbound';
import {
  locateOutboundRefs,
  locateOutboundText,
  outboundBucketIds,
} from '@/lib/nav/locate/outbound';
import { OUTBOUND_LOCATE_PERMISSION } from '@/lib/nav/locate/outbound-params';
import { locateSupportRefs, locateSupportText } from '@/lib/nav/locate/support';
import { SUPPORT_LOCATE_PERMISSION } from '@/lib/nav/locate/support-params';
import { buildOrdersListSql, readOrdersListSchema } from '@/lib/orders/orders-list';
import type { OrdersListQuery } from '@/lib/orders/orders-list-query';
import { checkZohoReceived, type CheckZohoReceivedRow } from '@/lib/receiving/check-zoho-received';
import { enrichIncomingTrackingIntegrity } from '@/lib/receiving/lines/incoming-integrity';
import { fetchReceivingLinesPage, resolveReceivingLinesReadFlags } from '@/lib/receiving/lines/list-page';
import { parseReceivingLinesQuery, type ReceivingLinesQuery } from '@/lib/receiving/lines/query';
import type { InboundFollowup } from '@/lib/receiving/inbound-followups';
import { readInboundFollowups } from '@/lib/receiving/inbound-followups-store';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { reconcileListParams, awaitingTrackingListParams } from '@/lib/receiving/receiving-modes';
import { parseRefList } from '@/lib/receiving/reconcile';
import { parseTrackingKeys } from '@/lib/receiving/tracking-paste';
import { listSupportRows } from '@/lib/support/list/support-list-db';
import type { SupportListRow } from '@/lib/support/list/support-list';
import { isIncomingUniversal } from '@/lib/feature-flags';
import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { getOrganization } from '@/lib/tenancy/organizations';
import { canonicalizeTrackingKey } from '@/lib/zoho/call-reduction';

export interface NavLocateDeps {
  /** One tenant-scoped statement → rows. */
  run(orgId: OrgId, sql: string, params: readonly unknown[]): Promise<Array<Record<string, unknown>>>;
  /** `GET /api/orders` SQL for one parsed query. */
  ordersListSql(orgId: OrgId, query: OrdersListQuery): Promise<{ sql: string; params: unknown[] }>;
  /** The Unbox Check (`POST …/check-zoho-received`), every row of its answer. */
  inboundCheck(orgId: OrgId, refs: readonly string[]): Promise<CheckZohoReceivedRow[]>;
  /** `GET /api/receiving-lines?view=reconcile&ref_in=…` rows. */
  inboundLines(orgId: OrgId, refs: readonly string[]): Promise<ReceivingLineRow[]>;
  /** Incoming `?state=AWAITING_TRACKING` rows — the list that bucket opens. */
  inboundAwaiting(orgId: OrgId, refs: readonly string[]): Promise<ReceivingLineRow[]>;
  /** `GET /api/receiving/inbound-followups?keys=…` — the follow-up tags on these keys. */
  inboundFollowups(orgId: OrgId, keys: readonly string[]): Promise<InboundFollowup[]>;
  /** `listSupportRows(orgId, { q })` — the /support list's own find, one statement per text. */
  supportRows(orgId: OrgId, q: string): Promise<SupportListRow[]>;
}

/**
 * The raw receiving-line columns the inbound verdict reads, by the names
 * `normalizeRow` maps: `rowRefKeys` (tracking / PO# / PO id / order id),
 * `reconOfWarehouseRows` + `lineException` (stamps, qty, delivery state), the
 * lead line's PO# and vendor, `carrierFactOf` + `enrichIncomingTrackingIntegrity`
 * (shipment facts), and the placeholder merge's sort stamps. The rest of the
 * ledger row (≈140 decorated columns) is the page's, not the verdict's.
 */
const VERDICT_LINE_COLUMNS = [
  'id',
  'receiving_id',
  'shipment_tracking_number',
  'receiving_tracking_number',
  'zoho_purchaseorder_id',
  'zoho_purchaseorder_number',
  'receiving_zoho_purchaseorder_number',
  'source_order_id',
  'vendor_name',
  'quantity_received',
  'delivery_state',
  'expected_delivery_date',
  'receiving_received_at',
  'receiving_unboxed_at',
  'first_scanned_at',
  'created_at',
  'shipment_status_category',
  'shipment_is_delivered',
  'shipment_delivered_at',
  'shipment_signed_by',
  'shipment_delivery_attempts',
  'shipment_estimated_delivery_at',
  'shipment_last_checked_at',
  'shipment_latest_event_at',
  'shipment_latest_event_postal',
] as const;

/**
 * The reconcile read's columns: the verdict's, plus the pasted list page's
 * row facts (`NavLocateFacts` via `pastedNumberFacts`) — the lead item's
 * title / SKU, the storefront account, qty bought, who unboxed it by staff
 * id, and the line's import source (`duplicatePurchaseLineIds`: an eBay
 * twin of a Zoho PO line counts once) — so the page paints every number off
 * this one read.
 */
const RECONCILE_LINE_COLUMNS = [
  ...VERDICT_LINE_COLUMNS,
  'item_name',
  'catalog_product_title',
  'zoho_item_title',
  'sku',
  'platform_account_label',
  'quantity_expected',
  'inbound_source_type',
  'unboxed_by_name',
  'receiving_unboxed_by',
  'unbox_opened_by_name',
  'receiving_unbox_opened_by',
] as const;

/**
 * A receiving-lines query cut to `refs`: every ref's key by the Check's own
 * splitter, never its paste cap — a paste is capped where it is parsed
 * (`parseRefList`), and the Purchases view asks every purchase in its window
 * in one read. Room for five lines per number (`RECONCILE_ROW_LIMIT`'s ratio).
 */
function refQuery(params: URLSearchParams, refs: readonly string[]): ReceivingLinesQuery {
  const query = parseReceivingLinesQuery(params);
  const refIn = parseTrackingKeys([...refs], Number.MAX_SAFE_INTEGER).keys;
  return { ...query, refIn, limit: Math.max(query.limit, refIn.length * 5) };
}

/**
 * The Unbox Check over `refs`, every row of its answer. `liveZoho: false`
 * answers from our tables alone (the mirror + local state): no live Zoho call
 * for a mirror miss, so the warehouse lines decide it (`reconcileCheck`).
 */
export async function readInboundCheck(
  orgId: OrgId,
  refs: readonly string[],
  options: { liveZoho: boolean },
): Promise<CheckZohoReceivedRow[]> {
  const result = await checkZohoReceived(orgId, [...refs], {
    maxInputs: Number.MAX_SAFE_INTEGER,
    ...(options.liveZoho ? {} : { maxZohoLookups: 0 }),
  });
  if ('error' in result) return [];
  return [...result.received_in_zoho, ...result.not_received_in_zoho, ...result.undetermined];
}

/** `GET /api/receiving-lines?view=reconcile&ref_in=…` rows (serials aside — the verdict never reads them). */
export async function readInboundLines(orgId: OrgId, refs: readonly string[]): Promise<ReceivingLineRow[]> {
  const params = reconcileListParams([]);
  params.delete('include');
  const query = refQuery(params, refs);
  const [page, org] = await Promise.all([
    fetchReceivingLinesPage({
      query,
      orgId,
      viewerStaffId: Number.NaN,
      universalIncoming: false,
      countTotal: false,
      columns: RECONCILE_LINE_COLUMNS,
      ...resolveReceivingLinesReadFlags(query),
    }),
    getOrganization(orgId),
  ]);
  const warehousePostal = org?.settings?.shipFrom?.postalCode ?? '';
  for (const row of page.rows) enrichIncomingTrackingIntegrity(row as Record<string, unknown>, warehousePostal);
  return page.rows as unknown as ReceivingLineRow[];
}

/** Incoming `?state=AWAITING_TRACKING` rows for `refs` — the list that bucket opens. */
export async function readInboundAwaiting(orgId: OrgId, refs: readonly string[]): Promise<ReceivingLineRow[]> {
  if (refs.length === 0) return [];
  const query = refQuery(awaitingTrackingListParams([]), refs);
  const page = await fetchReceivingLinesPage({
    query,
    orgId,
    viewerStaffId: Number.NaN,
    universalIncoming: await isIncomingUniversal(orgId),
    countTotal: false,
    columns: VERDICT_LINE_COLUMNS,
    ...resolveReceivingLinesReadFlags(query),
  });
  return page.rows as unknown as ReceivingLineRow[];
}

/**
 * Every read here is one round trip (`tenantQueryOneTrip` / the page reader's
 * `countTotal: false` batch); the locators run their arms in parallel.
 */
export const defaultNavLocateDeps: NavLocateDeps = {
  run: async (orgId, sql, params) => (await tenantQueryOneTrip(orgId, sql, params)).rows,
  ordersListSql: async (orgId, query) => buildOrdersListSql(orgId, query, await readOrdersListSchema()),
  inboundCheck: (orgId, refs) => readInboundCheck(orgId, refs, { liveZoho: true }),
  inboundLines: readInboundLines,
  inboundAwaiting: readInboundAwaiting,
  inboundFollowups: (orgId, keys) => readInboundFollowups(orgId, [...keys]),
  supportRows: (orgId, q) => listSupportRows(orgId, { q }),
};

export type NavLocateInput = { q: string } | { refs: string };

export type NavLocateResult =
  | { ok: true; body: NavLocateResponse }
  | { ok: false; status: 403; error: 'FORBIDDEN'; permission: string };

const LOCATOR_PERMISSION: Readonly<Record<NavLocator, string>> = {
  outbound: OUTBOUND_LOCATE_PERMISSION,
  inbound: INBOUND_LOCATE_PERMISSION,
  support: SUPPORT_LOCATE_PERMISSION,
};

/**
 * The sections a pasted shipping number lives in: asked under `everywhere`
 * and for another section's misses. Support is never asked on another
 * section's behalf — its records answer their own page's Find.
 */
const SHARED_LOCATORS: readonly NavLocator[] = ['outbound', 'inbound'];

/** One locator's answer, as it enters the response: the page's own (ids as-is) or another section's (`<locator>:<id>`). */
interface LocatedPart {
  locator: NavLocator;
  prefixed: boolean;
  answer: { buckets: NavLocateBucket[]; entries: NavLocateEntry[] };
}

/**
 * The ONE merge of locator answers into a response: buckets in part order
 * (another section's ids carry the section — `inbound:received` — its LABEL
 * stays the bare status: "Received", never "Receiving · Received"; the client
 * names a section only to tell two same-word statuses apart), one entry per
 * pasted ref in paste order with every part's buckets; title / detail /
 * record / facet from the first part that has one (a facet from a part that
 * found the ref first). A part answers by ref, so
 * a part asked about only some refs (the fall-through) merges the same way.
 */
function mergeLocated(
  refs: readonly string[],
  parts: readonly LocatedPart[],
): { buckets: NavLocateBucket[]; entries: NavLocateEntry[] } {
  const bucketId = (part: LocatedPart, id: string) => (part.prefixed ? `${part.locator}:${id}` : id);
  const buckets = parts.flatMap((part) =>
    part.answer.buckets.map((bucket) => (part.prefixed ? { ...bucket, id: bucketId(part, bucket.id) } : bucket)),
  );
  const byRef = parts.map((part) => new Map(part.answer.entries.map((entry) => [entry.ref, entry])));
  const entries = refs.map((ref): NavLocateEntry => {
    const hits = byRef.map((map) => map.get(ref));
    return {
      ref,
      buckets: hits.flatMap((hit, index) => (hit ? hit.buckets.map((id) => bucketId(parts[index]!, id)) : [])),
      title: hits.find((hit) => hit?.title)?.title ?? null,
      detail: hits.find((hit) => hit?.detail)?.detail ?? null,
      recordHref: hits.find((hit) => hit?.recordHref)?.recordHref ?? null,
      // A part that found the ref names its facet; a found-nowhere part's ("No match anywhere") only when no part found it.
      facet: (hits.find((hit) => hit?.facet && hit.buckets.length > 0) ?? hits.find((hit) => hit?.facet))?.facet ?? null,
      facts: hits.find((hit) => hit?.facts)?.facts ?? null,
    };
  });
  return { buckets, entries };
}

interface Selection {
  refs: string[];
  keys: string[];
}

/** One locator's answer; `truncated` = a `q` answer's matches past its cap. */
interface LocatorAnswer {
  buckets: NavLocateBucket[];
  entries: NavLocateEntry[];
  truncated?: number;
}

async function runLocator(
  locator: NavLocator,
  caller: { orgId: OrgId; permissions: ReadonlySet<string> },
  input: { q: string } | { selection: Selection },
  deps: NavLocateDeps,
): Promise<LocatorAnswer> {
  const { orgId } = caller;
  if (locator === 'support') {
    const support = { rows: (q: string) => deps.supportRows(orgId, q) };
    return 'q' in input ? locateSupportText(input.q, support) : locateSupportRefs(input.selection.refs, support);
  }
  if (locator === 'inbound') {
    // The field's text is answered as one ref, on the paste path.
    const selection = 'q' in input ? { refs: [input.q], keys: [canonicalizeTrackingKey(input.q)] } : input.selection;
    const answer = await locateInbound(selection, {
      check: (refs) => deps.inboundCheck(orgId, refs),
      lines: (refs) => deps.inboundLines(orgId, refs),
      awaiting: (refs) => deps.inboundAwaiting(orgId, refs),
      // The field's answer is buckets only — no entry carries a tag.
      followups: 'q' in input ? async () => [] : (keys) => deps.inboundFollowups(orgId, keys),
    });
    return 'q' in input ? { buckets: answer.buckets, entries: [] } : answer;
  }
  const ids = outboundBucketIds(caller.permissions);
  const run = (sql: string, params: readonly unknown[]) => deps.run(orgId, sql, params);
  return 'q' in input
    ? locateOutboundText(orgId, ids, input.q, { run, ordersListSql: (query) => deps.ordersListSql(orgId, query) })
    : locateOutboundRefs(orgId, ids, input.selection.refs, { run });
}

export async function getNavLocate(
  caller: { orgId: OrgId; permissions: ReadonlySet<string> },
  scope: NavLocateScope,
  input: NavLocateInput,
  deps: NavLocateDeps = defaultNavLocateDeps,
): Promise<NavLocateResult> {
  if (scope !== 'everywhere' && !caller.permissions.has(LOCATOR_PERMISSION[scope])) {
    return { ok: false, status: 403, error: 'FORBIDDEN', permission: LOCATOR_PERMISSION[scope] };
  }
  let truncated = 0;
  let located: { q: string } | { selection: Selection };
  if ('q' in input) {
    located = { q: input.q };
  } else {
    // The Check's splitter and cap (`parseRefList`) — one paste, one answer.
    const parsed = parseRefList(input.refs);
    const refs = parsed.refs.slice(0, NAV_LOCATE_MAX_REFS);
    truncated = parsed.truncated + (parsed.refs.length - refs.length);
    located = { selection: { refs, keys: parsed.keys.slice(0, refs.length) } };
  }

  const others = SHARED_LOCATORS.filter(
    (locator) => locator !== scope && caller.permissions.has(LOCATOR_PERMISSION[locator]),
  );
  const refs = 'selection' in located ? located.selection.refs : [];

  if (scope === 'everywhere') {
    const answers = await Promise.all(others.map((locator) => runLocator(locator, caller, located, deps)));
    const merged = mergeLocated(
      refs,
      answers.map((answer, index) => ({ locator: others[index]!, prefixed: true, answer })),
    );
    return { ok: true, body: { locator: 'everywhere', ...merged, truncated } };
  }

  const { truncated: matchesPast = 0, ...page } = await runLocator(scope, caller, located, deps);
  // Only a `q` answer lists matches past a cap; only a paste drops refs past one.
  truncated += matchesPast;
  if (!('selection' in located) || others.length === 0) {
    return { ok: true, body: { locator: scope, ...page, truncated } };
  }
  // A pasted ref this section does not hold is asked of every other section
  // the caller may read (one parallel pass, only those refs): "Not found" means
  // found nowhere the caller can see, never "not on this page".
  const { selection } = located;
  const missed = selection.refs.flatMap((_ref, row) => (page.entries[row]?.buckets.length ? [] : [row]));
  if (missed.length === 0) {
    return { ok: true, body: { locator: scope, ...page, truncated } };
  }
  const rest = {
    selection: { refs: missed.map((row) => selection.refs[row]!), keys: missed.map((row) => selection.keys[row]!) },
  };
  const elsewhere = await Promise.all(others.map((locator) => runLocator(locator, caller, rest, deps)));
  const merged = mergeLocated(refs, [
    { locator: scope, prefixed: false, answer: page },
    // Another section's bucket is listed only when it holds one of the refs.
    ...elsewhere.map((answer, index) => ({
      locator: others[index]!,
      prefixed: true,
      answer: { ...answer, buckets: answer.buckets.filter((bucket) => bucket.count > 0) },
    })),
  ]);
  return { ok: true, body: { locator: scope, ...merged, truncated } };
}
