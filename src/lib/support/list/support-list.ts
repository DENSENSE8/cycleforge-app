/**
 * The /support list — pure and client-safe. ONE set of predicates answers the
 * record list, the status chips, the sidebar view counts and the facet counts
 * (`cutSupportList`, `supportListFacetCounts`); the server reads the rows once
 * (`listSupportRows`, support-list-db.ts) and every count goes through here.
 */

import type { SupportContactFace } from '@/lib/support/contact-face';
import {
  SUPPORT_LOCAL_STATUS_LABEL,
  SUPPORT_LOCAL_STATUSES,
  type OrderCheckInState,
  type SupportChannel,
  type SupportItemKind,
  type SupportLifecycle,
  type SupportLocalStatus,
  type SupportPurpose,
  type SupportWorkFlags,
} from '@/lib/support/conversation/model';

// ── Vocabulary ─────────────────────────────────────────────────────────────

export const SUPPORT_LIST_VIEWS = [
  'needs-reply',
  'followed-up',
  'draft-ready',
  'follow-up-due',
  'unclassified',
  'internal',
  'unassigned',
  'sync-failed',
  'check-ins',
] as const;
/** Absent `view` = every Support item. */
export type SupportListView = (typeof SUPPORT_LIST_VIEWS)[number];

export const SUPPORT_LIST_VIEW_LABEL: Readonly<Record<SupportListView, string>> = {
  'needs-reply': 'Needs reply',
  'followed-up': 'Customer followed up',
  'draft-ready': 'Draft ready',
  'follow-up-due': 'Follow-up due',
  unclassified: 'Unclassified',
  internal: 'Internal records',
  unassigned: 'Unassigned',
  'sync-failed': 'Sync failed',
  'check-ins': 'Post-purchase check-ins',
};

/** Default `urgency`. */
export const SUPPORT_LIST_SORTS = ['urgency', 'newest', 'oldest-waiting', 'due'] as const;
export type SupportListSort = (typeof SUPPORT_LIST_SORTS)[number];
export const SUPPORT_LIST_DEFAULT_SORT: SupportListSort = 'urgency';

export const SUPPORT_LIST_SORT_LABEL: Readonly<Record<SupportListSort, string>> = {
  urgency: 'Most urgent first',
  newest: 'Newest activity first',
  'oldest-waiting': 'Longest waiting first',
  due: 'Due soonest first',
};

/** Default `none`. */
export const SUPPORT_LIST_GROUPS = ['none', 'status', 'platform', 'assignee'] as const;
export type SupportListGroup = (typeof SUPPORT_LIST_GROUPS)[number];
export const SUPPORT_LIST_DEFAULT_GROUP: SupportListGroup = 'none';

export const SUPPORT_LIST_GROUP_LABEL: Readonly<Record<SupportListGroup, string>> = {
  none: 'No grouping',
  status: 'Status',
  platform: 'Platform',
  assignee: 'Assignee',
};

// ── Row + filter ───────────────────────────────────────────────────────────

export interface SupportListRow {
  itemId: number;
  taskId: number | null;
  kind: SupportItemKind;
  purpose: SupportPurpose;
  lifecycle: SupportLifecycle;
  status: SupportLocalStatus;
  flags: SupportWorkFlags;
  /** subject_cache, else the first line of the first message. */
  subject: string | null;
  /** support_tickets.provider. */
  transport: SupportChannel;
  externalTicketId: string | null;
  platform: { id: number; label: string } | null;
  /** The platform_accounts row, else support_tickets.account_label. */
  account: { id: number | null; label: string } | null;
  /** NEVER a raw relay address. */
  contact: SupportContactFace;
  primaryOrder: { orderId: number; orderNumber: string | null; platformLabel: string | null } | null;
  assignees: { id: number; name: string }[];
  pendingInboundCount: number;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastActivityAt: string;
  nextFollowUpAt: string | null;
  deadlineAt: string | null;
  urgent: boolean;
  resolvedAt: string | null;
  createdAt: string;
  checkInState: OrderCheckInState | null;
}

export interface SupportListFilter {
  view: SupportListView | null;
  /** The status chips (`status`); empty = every status. */
  statuses: SupportLocalStatus[];
  /** `platform`; empty = every platform. */
  platformIds: number[];
  /** `account` (account labels); empty = every account. */
  accounts: string[];
  /** `assignee` (staff ids, `none` = unowned); empty = everyone. */
  assignees: (number | 'none')[];
  sort: SupportListSort;
  group: SupportListGroup;
}

export const SUPPORT_LIST_DEFAULT_FILTER: Readonly<SupportListFilter> = Object.freeze({
  view: null,
  statuses: [],
  platformIds: [],
  accounts: [],
  assignees: [],
  sort: SUPPORT_LIST_DEFAULT_SORT,
  group: SUPPORT_LIST_DEFAULT_GROUP,
});

// ── Parse (URL params on /support and GET /api/support/list) ───────────────

function oneOf<T extends string>(list: readonly T[], raw: unknown): T | null {
  return typeof raw === 'string' && (list as readonly string[]).includes(raw) ? (raw as T) : null;
}

/** The comma list a param carries (`a,b` or repeated params), trimmed, de-duplicated. */
function commaList(raw: string | readonly string[] | null | undefined): string[] {
  if (raw == null) return [];
  const parts = (typeof raw === 'string' ? [raw] : raw).flatMap((v) => v.split(','));
  return [...new Set(parts.map((v) => v.trim()).filter(Boolean))];
}

export function parseSupportListView(raw: unknown): SupportListView | null {
  return oneOf(SUPPORT_LIST_VIEWS, raw);
}

export function parseSupportListSort(raw: unknown): SupportListSort {
  return oneOf(SUPPORT_LIST_SORTS, raw) ?? SUPPORT_LIST_DEFAULT_SORT;
}

export function parseSupportListGroup(raw: unknown): SupportListGroup {
  return oneOf(SUPPORT_LIST_GROUPS, raw) ?? SUPPORT_LIST_DEFAULT_GROUP;
}

/** `status=pending,solved` → the known local statuses, in canonical order. */
export function parseSupportListStatuses(raw: string | readonly string[] | null | undefined): SupportLocalStatus[] {
  const picked = new Set(commaList(raw));
  return SUPPORT_LOCAL_STATUSES.filter((s) => picked.has(s));
}

function positiveId(raw: string): number | null {
  if (!/^\d{1,15}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function parseSupportListPlatformIds(raw: string | readonly string[] | null | undefined): number[] {
  return [...new Set(commaList(raw).map(positiveId).filter((id): id is number => id != null))];
}

export function parseSupportListAssignees(raw: string | readonly string[] | null | undefined): (number | 'none')[] {
  const out: (number | 'none')[] = [];
  for (const part of commaList(raw)) {
    const value = part === 'none' ? 'none' : positiveId(part);
    if (value != null && !out.includes(value)) out.push(value);
  }
  return out;
}

/** What a Next.js page receives or what a route builds from `req.nextUrl`. */
export type SupportListSearchParams =
  | URLSearchParams
  | Readonly<Record<string, string | readonly string[] | undefined>>;

function paramOf(params: SupportListSearchParams, key: string): string | readonly string[] | undefined {
  if (params instanceof URLSearchParams) {
    const all = params.getAll(key);
    return all.length === 0 ? undefined : all;
  }
  return params[key];
}

function firstOf(raw: string | readonly string[] | undefined): string | undefined {
  return typeof raw === 'string' ? raw : raw?.[0];
}

/** The URL params `view`, `status`, `platform`, `account`, `assignee`, `sort`, `group` → the filter. */
export function parseSupportListFilter(params: SupportListSearchParams): SupportListFilter {
  return {
    view: parseSupportListView(firstOf(paramOf(params, 'view'))),
    statuses: parseSupportListStatuses(paramOf(params, 'status')),
    platformIds: parseSupportListPlatformIds(paramOf(params, 'platform')),
    accounts: commaList(paramOf(params, 'account')),
    assignees: parseSupportListAssignees(paramOf(params, 'assignee')),
    sort: parseSupportListSort(firstOf(paramOf(params, 'sort'))),
    group: parseSupportListGroup(firstOf(paramOf(params, 'group'))),
  };
}

// ── Predicates (the ONE set) ───────────────────────────────────────────────

type ViewFacts = Pick<SupportListRow, 'flags' | 'purpose' | 'kind'>;

/** Whether a row belongs to a view; `null` = every Support item. */
export function supportListViewMatches(row: ViewFacts, view: SupportListView | null): boolean {
  switch (view) {
    case null:
      return true;
    case 'needs-reply':
      return row.flags.needs_reply;
    case 'followed-up':
      return row.flags.customer_followed_up;
    case 'draft-ready':
      return row.flags.draft_ready;
    case 'follow-up-due':
      return row.flags.follow_up_due;
    case 'unclassified':
      return row.flags.unclassified;
    case 'internal':
      return row.purpose === 'internal_record';
    case 'unassigned':
      return row.flags.unassigned;
    case 'sync-failed':
      return row.flags.sync_failed;
    case 'check-ins':
      return row.kind === 'post_purchase_check_in';
  }
}

/** The facet param keys, as they appear on the URL and in {@link SupportListFacetCounts}. */
export type SupportListFacet = 'platform' | 'account' | 'assignee';

/** The value(s) a row offers each facet: platform id, account label, assignee ids (`none` when unowned). */
export function supportListFacetValues(row: SupportListRow, facet: SupportListFacet): string[] {
  switch (facet) {
    case 'platform':
      return row.platform ? [String(row.platform.id)] : [];
    case 'account':
      return row.account ? [row.account.label] : [];
    case 'assignee':
      return row.assignees.length === 0 ? ['none'] : row.assignees.map((a) => String(a.id));
  }
}

function facetSelection(filter: SupportListFilter, facet: SupportListFacet): string[] {
  switch (facet) {
    case 'platform':
      return filter.platformIds.map(String);
    case 'account':
      return filter.accounts;
    case 'assignee':
      return filter.assignees.map(String);
  }
}

const SUPPORT_LIST_FACETS: readonly SupportListFacet[] = ['platform', 'account', 'assignee'];

function facetMatches(row: SupportListRow, filter: SupportListFilter, facet: SupportListFacet): boolean {
  const picked = facetSelection(filter, facet);
  if (picked.length === 0) return true;
  return supportListFacetValues(row, facet).some((v) => picked.includes(v));
}

interface ScopeOptions {
  /** Skip the status chips (chip counts count what tapping them shows). */
  ignoreStatus?: boolean;
  /** Skip one facet (each facet counts with its own param removed). */
  ignoreFacet?: SupportListFacet;
}

function inScope(row: SupportListRow, filter: SupportListFilter, opts: ScopeOptions = {}): boolean {
  if (!supportListViewMatches(row, filter.view)) return false;
  if (!opts.ignoreStatus && filter.statuses.length > 0 && !filter.statuses.includes(row.status)) return false;
  for (const facet of SUPPORT_LIST_FACETS) {
    if (facet !== opts.ignoreFacet && !facetMatches(row, filter, facet)) return false;
  }
  return true;
}

// ── Sort ───────────────────────────────────────────────────────────────────

/**
 * Lower = more urgent. Live work by its loudest flag — follow-up due,
 * customer followed up, needs reply, draft ready, unclassified — then other
 * live items (new / open), then pending, on-hold, solved, closed.
 */
export function supportUrgencyRank(row: Pick<SupportListRow, 'flags' | 'status'>): number {
  const live = row.status !== 'solved' && row.status !== 'closed';
  if (live) {
    if (row.flags.follow_up_due) return 0;
    if (row.flags.customer_followed_up) return 1;
    if (row.flags.needs_reply) return 2;
    if (row.flags.draft_ready) return 3;
    if (row.flags.unclassified) return 4;
  }
  switch (row.status) {
    case 'new':
    case 'open':
      return 5;
    case 'pending':
      return 6;
    case 'on_hold':
      return 7;
    case 'solved':
      return 8;
    case 'closed':
      return 9;
  }
}

function ms(iso: string | null): number | null {
  if (iso == null) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Ascending, nulls last. */
function ascNullsLast(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

/** Rows owed a reply first, oldest inbound first; then the rest, oldest activity first. */
function byOldestWaiting(a: SupportListRow, b: SupportListRow): number {
  const aw = a.pendingInboundCount > 0;
  const bw = b.pendingInboundCount > 0;
  if (aw !== bw) return aw ? -1 : 1;
  if (aw) {
    const d = ascNullsLast(ms(a.lastInboundAt), ms(b.lastInboundAt));
    if (d !== 0) return d;
  }
  return ascNullsLast(ms(a.lastActivityAt), ms(b.lastActivityAt));
}

function dueMs(row: SupportListRow): number | null {
  const times = [ms(row.nextFollowUpAt), ms(row.deadlineAt)].filter((t): t is number => t != null);
  return times.length === 0 ? null : Math.min(...times);
}

function comparatorFor(sort: SupportListSort): (a: SupportListRow, b: SupportListRow) => number {
  switch (sort) {
    case 'urgency':
      return (a, b) => supportUrgencyRank(a) - supportUrgencyRank(b) || byOldestWaiting(a, b) || a.itemId - b.itemId;
    case 'newest':
      return (a, b) => (ms(b.lastActivityAt) ?? 0) - (ms(a.lastActivityAt) ?? 0) || b.itemId - a.itemId;
    case 'oldest-waiting':
      return (a, b) => byOldestWaiting(a, b) || a.itemId - b.itemId;
    case 'due':
      return (a, b) => ascNullsLast(dueMs(a), dueMs(b)) || a.itemId - b.itemId;
  }
}

// ── Group ──────────────────────────────────────────────────────────────────

export interface SupportListGroupKey {
  /** Stable key: the status id, the platform / staff id, or `none`. */
  key: string;
  label: string;
  /** Group order: status order; then by label; `none` last. */
  order: number;
}

/** The group a row falls in (assignee = its first owner). Null for `none`. */
export function supportListGroupOf(row: SupportListRow, group: SupportListGroup): SupportListGroupKey | null {
  switch (group) {
    case 'none':
      return null;
    case 'status':
      return { key: row.status, label: SUPPORT_LOCAL_STATUS_LABEL[row.status], order: SUPPORT_LOCAL_STATUSES.indexOf(row.status) };
    case 'platform':
      return row.platform
        ? { key: String(row.platform.id), label: row.platform.label, order: 0 }
        : { key: 'none', label: 'No platform', order: 1 };
    case 'assignee': {
      const first = row.assignees[0];
      return first ? { key: String(first.id), label: first.name, order: 0 } : { key: 'none', label: 'Unassigned', order: 1 };
    }
  }
}

function byGroup(group: SupportListGroup): ((a: SupportListRow, b: SupportListRow) => number) | null {
  if (group === 'none') return null;
  return (a, b) => {
    const ga = supportListGroupOf(a, group)!;
    const gb = supportListGroupOf(b, group)!;
    return ga.order - gb.order || (group === 'status' ? 0 : ga.label.localeCompare(gb.label)) || ga.key.localeCompare(gb.key);
  };
}

// ── The cut ────────────────────────────────────────────────────────────────

/**
 * The visible list for a filter, sorted (grouped rows stay together in group
 * order, sorted within). `statusCounts` count the view + facet scope IGNORING
 * the status chips; `total` is that scope's size (the sum of `statusCounts`).
 * `nowMs` is the clock the rows' statuses and flags were computed against.
 */
export function cutSupportList(
  rows: SupportListRow[],
  filter: SupportListFilter,
  nowMs: number,
): { rows: SupportListRow[]; statusCounts: Record<SupportLocalStatus, number>; total: number } {
  void nowMs; // statuses and flags are stamped on the row against the same clock.
  const statusCounts = Object.fromEntries(SUPPORT_LOCAL_STATUSES.map((s) => [s, 0])) as Record<SupportLocalStatus, number>;
  let total = 0;
  const visible: SupportListRow[] = [];
  for (const row of rows) {
    if (!inScope(row, filter, { ignoreStatus: true })) continue;
    statusCounts[row.status] += 1;
    total += 1;
    if (filter.statuses.length === 0 || filter.statuses.includes(row.status)) visible.push(row);
  }
  const sort = comparatorFor(filter.sort);
  const group = byGroup(filter.group);
  visible.sort(group ? (a, b) => group(a, b) || sort(a, b) : sort);
  return { rows: visible, statusCounts, total };
}

/** Counts per facet value (platform id, account label, assignee id / `none`). */
export type SupportListFacetCounts = Record<SupportListFacet, Record<string, number>>;

/**
 * Facet counts through the same predicates as the list: each facet counted
 * with its own param removed (view, status chips and the other facets apply),
 * so a count equals the rows shown when that one value is picked.
 */
export function supportListFacetCounts(rows: SupportListRow[], filter: SupportListFilter, nowMs: number): SupportListFacetCounts {
  void nowMs;
  const counts: SupportListFacetCounts = { platform: {}, account: {}, assignee: {} };
  for (const facet of SUPPORT_LIST_FACETS) {
    const bucket = counts[facet];
    for (const row of rows) {
      if (!inScope(row, filter, { ignoreFacet: facet })) continue;
      for (const value of supportListFacetValues(row, facet)) bucket[value] = (bucket[value] ?? 0) + 1;
    }
  }
  return counts;
}
