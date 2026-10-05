/**
 * Support locator — where a Support item lives on /support. One bucket per
 * local status (`SUPPORT_LOCAL_STATUSES`, the page's status chips), each
 * opening `/support?status=<id>`; membership is the row's own
 * `supportLocalStatus`, the same word the chip counts.
 *
 * Both answers read `listSupportRows` — the list's ONE find statement
 * (`SUPPORT_LIST_SQL`: Support #, task id, order id / number, item #, SKU,
 * tracking, provider ticket id, requester, repair #, subject, pasted link
 * reference, platform / account) — never a second search:
 *
 * - `q` (the field's text): per-status counts of every match, plus the best
 *   {@link NAV_LOCATE_MAX_MATCHES} matches as entries (an exact Support #
 *   first, then urgency) so the field's dropdown opens the record; the rest
 *   are `truncated`.
 * - `refs` (a pasted list): each ref is found the same way, one entry per ref.
 *
 * An entry is the record's face: `#<id>`, the subject as title, the contact
 * face · platform · order number as detail — never a raw relay address
 * (`supportContactFace` on the row; the subject is scrubbed).
 */

import { NAV_LOCATE_MAX_MATCHES, type NavLocateBucket, type NavLocateEntry } from '@/lib/nav/context/schema';
import { supportHref } from '@/lib/nav/route-tree';
import { scrubRelayAddresses } from '@/lib/support/contact-face';
import { SUPPORT_LOCAL_STATUS_LABEL, type SupportLocalStatus } from '@/lib/support/conversation/model';
import { supportUrgencyRank, type SupportListRow } from '@/lib/support/list/support-list';
import { supportListSearchTerms } from '@/lib/support/list/support-list-db';
import { SUPPORT_LOCATE_STATUSES } from './support-params';

const TONE: Readonly<Record<SupportLocalStatus, NavLocateBucket['tone']>> = {
  new: 'info',
  open: 'warning',
  pending: 'neutral',
  on_hold: 'neutral',
  solved: 'success',
  closed: 'neutral',
};

/** Pasted refs asked of the list statement at once — a 300-number paste never holds the pool. */
const REFS_CONCURRENCY = 6;

export interface SupportLocateDeps {
  /** `listSupportRows(orgId, { q })` — the list's own find. */
  rows(q: string): Promise<SupportListRow[]>;
}

export interface SupportLocateResult {
  buckets: NavLocateBucket[];
  entries: NavLocateEntry[];
  /** `q`: matches past {@link NAV_LOCATE_MAX_MATCHES}. */
  truncated: number;
}

function bucketsWith(counts: Partial<Record<SupportLocalStatus, number>>): NavLocateBucket[] {
  return SUPPORT_LOCATE_STATUSES.map((status) => ({
    id: status,
    label: SUPPORT_LOCAL_STATUS_LABEL[status],
    tone: TONE[status],
    href: supportHref({ status }),
    count: counts[status] ?? 0,
  }));
}

/** Who · platform · order — the item's status is its bucket, painted beside it. */
function supportLocateDetail(row: SupportListRow): string | null {
  const parts = [
    row.contact.label,
    row.platform?.label ?? row.primaryOrder?.platformLabel ?? null,
    row.primaryOrder?.orderNumber ?? null,
  ];
  return parts.filter((part): part is string => Boolean(part?.trim())).join(' · ') || null;
}

/** One Support item as a locate entry: its face and its own record. */
export function supportLocateEntry(ref: string, row: SupportListRow): NavLocateEntry {
  return {
    ref,
    buckets: [row.status],
    title: row.subject ? scrubRelayAddresses(row.subject) : null,
    detail: supportLocateDetail(row),
    recordHref: supportHref({ item: row.itemId }),
  };
}

/** The exact Support # first, then the loudest work, then the latest activity. */
function rankMatches(rows: readonly SupportListRow[], text: string): SupportListRow[] {
  const exactId = supportListSearchTerms(text)?.exactId ?? null;
  const activity = (row: SupportListRow) => Date.parse(row.lastActivityAt) || 0;
  return [...rows].sort(
    (a, b) =>
      Number(b.itemId === exactId) - Number(a.itemId === exactId) ||
      supportUrgencyRank(a) - supportUrgencyRank(b) ||
      activity(b) - activity(a),
  );
}

/** Counts per status for the field's text, and its best matches as entries. */
export async function locateSupportText(q: string, deps: SupportLocateDeps): Promise<SupportLocateResult> {
  const rows = await deps.rows(q);
  const counts: Partial<Record<SupportLocalStatus, number>> = {};
  for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
  const shown = rankMatches(rows, q).slice(0, NAV_LOCATE_MAX_MATCHES);
  return {
    buckets: bucketsWith(counts),
    entries: shown.map((row) => supportLocateEntry(`#${row.itemId}`, row)),
    truncated: rows.length - shown.length,
  };
}

async function mapLimited<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const at = next++;
      out[at] = await fn(items[at]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** One entry per ref, in paste order; a bucket counts the refs found in it. */
export async function locateSupportRefs(refs: readonly string[], deps: SupportLocateDeps): Promise<SupportLocateResult> {
  const answers = await mapLimited(refs, REFS_CONCURRENCY, (ref) => deps.rows(ref));
  const counts: Partial<Record<SupportLocalStatus, number>> = {};
  const entries = refs.map((ref, index): NavLocateEntry => {
    const rows = rankMatches(answers[index] ?? [], ref);
    const lead = rows[0];
    if (!lead) return { ref, buckets: [], title: null, detail: null, recordHref: null };
    const statuses = SUPPORT_LOCATE_STATUSES.filter((status) => rows.some((row) => row.status === status));
    for (const status of statuses) counts[status] = (counts[status] ?? 0) + 1;
    if (rows.length === 1) return supportLocateEntry(ref, lead);
    return {
      ...supportLocateEntry(ref, lead),
      buckets: statuses,
      detail: `${rows.length} Support items`,
      recordHref: null,
    };
  });
  return { buckets: bucketsWith(counts), entries, truncated: 0 };
}
