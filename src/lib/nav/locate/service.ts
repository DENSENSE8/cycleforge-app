/**
 * `GET /api/nav/locate` domain — where identifiers live. One locator per
 * section (`./outbound`, `./inbound`); `everywhere` = every locator the caller
 * may read, bucket ids / labels prefixed with the section.
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
import { buildOrdersListSql, readOrdersListSchema } from '@/lib/orders/orders-list';
import type { OrdersListQuery } from '@/lib/orders/orders-list-query';
import { checkZohoReceived, type CheckZohoReceivedRow } from '@/lib/receiving/check-zoho-received';
import { enrichIncomingTrackingIntegrity } from '@/lib/receiving/lines/incoming-integrity';
import { fetchReceivingLinesPage, resolveReceivingLinesReadFlags } from '@/lib/receiving/lines/list-page';
import { parseReceivingLinesQuery } from '@/lib/receiving/lines/query';
import type { InboundFollowup } from '@/lib/receiving/inbound-followups';
import { readInboundFollowups } from '@/lib/receiving/inbound-followups-store';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { reconcileListParams, awaitingTrackingListParams } from '@/lib/receiving/receiving-modes';
import { parseRefList } from '@/lib/receiving/reconcile';
import { isIncomingUniversal } from '@/lib/feature-flags';
import { tenantQuery } from '@/lib/tenancy/db';
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
}

export const defaultNavLocateDeps: NavLocateDeps = {
  run: async (orgId, sql, params) => (await tenantQuery(orgId, sql, params)).rows,
  ordersListSql: async (orgId, query) => buildOrdersListSql(orgId, query, await readOrdersListSchema()),
  inboundCheck: async (orgId, refs) => {
    const result = await checkZohoReceived(orgId, [...refs]);
    if ('error' in result) return [];
    return [...result.received_in_zoho, ...result.not_received_in_zoho, ...result.undetermined];
  },
  inboundLines: async (orgId, refs) => {
    const params = reconcileListParams(refs);
    // Serials are the ledger's column; the verdict never reads them.
    params.delete('include');
    const query = parseReceivingLinesQuery(params);
    const [page, org] = await Promise.all([
      fetchReceivingLinesPage({
        query,
        orgId,
        viewerStaffId: Number.NaN,
        universalIncoming: false,
        ...resolveReceivingLinesReadFlags(query),
      }),
      getOrganization(orgId),
    ]);
    const warehousePostal = org?.settings?.shipFrom?.postalCode ?? '';
    for (const row of page.rows) enrichIncomingTrackingIntegrity(row as Record<string, unknown>, warehousePostal);
    return page.rows as unknown as ReceivingLineRow[];
  },
  inboundAwaiting: async (orgId, refs) => {
    if (refs.length === 0) return [];
    const query = parseReceivingLinesQuery(awaitingTrackingListParams(refs));
    const page = await fetchReceivingLinesPage({
      query,
      orgId,
      viewerStaffId: Number.NaN,
      universalIncoming: await isIncomingUniversal(orgId),
      ...resolveReceivingLinesReadFlags(query),
    });
    return page.rows as unknown as ReceivingLineRow[];
  },
  inboundFollowups: (orgId, keys) => readInboundFollowups(orgId, [...keys]),
};

export type NavLocateInput = { q: string } | { refs: string };

export type NavLocateResult =
  | { ok: true; body: NavLocateResponse }
  | { ok: false; status: 403; error: 'FORBIDDEN'; permission: string };

const LOCATOR_PERMISSION: Readonly<Record<NavLocator, string>> = {
  outbound: OUTBOUND_LOCATE_PERMISSION,
  inbound: INBOUND_LOCATE_PERMISSION,
};

/** The section a bucket belongs to, under `everywhere`. */
const LOCATOR_LABEL: Readonly<Record<NavLocator, string>> = {
  outbound: 'Fulfillment',
  inbound: 'Receiving',
};

interface Selection {
  refs: string[];
  keys: string[];
}

async function runLocator(
  locator: NavLocator,
  caller: { orgId: OrgId; permissions: ReadonlySet<string> },
  input: { q: string } | { selection: Selection },
  deps: NavLocateDeps,
): Promise<{ buckets: NavLocateBucket[]; entries: NavLocateEntry[] }> {
  const { orgId } = caller;
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

  if (scope !== 'everywhere') {
    const answer = await runLocator(scope, caller, located, deps);
    return { ok: true, body: { locator: scope, ...answer, truncated } };
  }

  const locators = (Object.keys(LOCATOR_PERMISSION) as NavLocator[]).filter((locator) =>
    caller.permissions.has(LOCATOR_PERMISSION[locator]),
  );
  const answers = await Promise.all(locators.map((locator) => runLocator(locator, caller, located, deps)));
  const buckets = answers.flatMap((answer, index) =>
    answer.buckets.map((bucket) => ({
      ...bucket,
      id: `${locators[index]}:${bucket.id}`,
      label: `${LOCATOR_LABEL[locators[index]]} · ${bucket.label}`,
    })),
  );
  const refs = 'selection' in located ? located.selection.refs : [];
  const entries = refs.map((ref, row): NavLocateEntry => {
    const parts = answers.map((answer) => answer.entries[row]);
    return {
      ref,
      buckets: parts.flatMap((part, index) => (part ? part.buckets.map((id) => `${locators[index]}:${id}`) : [])),
      title: parts.find((part) => part?.title)?.title ?? null,
      detail: parts.find((part) => part?.detail)?.detail ?? null,
      recordHref: parts.find((part) => part?.recordHref)?.recordHref ?? null,
      facet: parts.find((part) => part?.facet)?.facet ?? null,
    };
  });
  return { ok: true, body: { locator: 'everywhere', buckets, entries, truncated } };
}
