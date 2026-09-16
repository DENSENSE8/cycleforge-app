import { requirePermission } from '@/lib/auth/page-guard';
import { getCurrentUser } from '@/lib/auth/current-user';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { submitCount, approveLine, rejectLine, closeCampaign } from '@/lib/inventory/cycle-count';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button } from '@/design-system/primitives';
import {
  isCycleCountLineOverTolerance,
  type CycleCountLineRow,
} from '@/lib/inventory/cycle-count-line-row';
import { CycleCountLinesTable } from './CycleCountLinesTable';

export const dynamic = 'force-dynamic';

/**
 * /inventory/cycle-counts/[id]
 *
 * Per-campaign detail. Lists every `cycle_count_lines` row on the slot
 * `DataTable` (`cycle-count-lines` PRODUCT_TABLES peer, off `AdminTable`
 * 2026-09-12 / Wave D): header sort, the Fields picker and org-bindable
 * columns arrive from the engine, none of which the seven hand-written column
 * objects it replaced could ever grow. That history — including why the count
 * input and the Approve / Reject buttons left the grid — lives in
 * `@/lib/tables/field-catalog/cycle-count-lines`.
 *
 * Three server actions stay HERE and unchanged; the client island calls them
 * by reference, so every `getCurrentUser()` gate and every `revalidatePath`
 * still runs on the server:
 *   - `submitCountAction` — a row verb that opens `CycleCountLinePlane`
 *     (a `DeskStageOverlay`), because a write whose payload needs a parameter
 *     has no lawful home on a compound row (`inCellEdit` stays false).
 *   - `approveAction` / `rejectAction` — two row verbs on the trailing face,
 *     offered only while the line is `counted`/`pending_review` and the
 *     campaign is open. The raw solid-green Approve `<button>` is gone.
 *
 * Header actions:
 *   - Close campaign (auto-approves remaining 'counted' lines)
 *
 * Filter pill row: all | pending | counted | pending_review | approved |
 * rejected. It stays a SERVER concern — the pills carry per-status counts from
 * `loadStatusCounts` and the filter is a SQL predicate in `loadLines`, not a
 * client narrow.
 */

type StatusFilter = 'all' | 'pending' | 'counted' | 'pending_review' | 'approved' | 'rejected';

interface CampaignRow {
  id: number;
  name: string;
  status: string;
  variance_tol: string;
  created_at: Date;
  closed_at: Date | null;
}

/**
 * The desk's SQL row. `counted_by` / `approved_by` (the staff ids behind the
 * two joined names) are selected so the wire row can carry a real PERSON
 * fact — the retired Action cell printed a bare name, and the compound person
 * face draws its avatar from the id and the absence honestly when the join
 * found nothing.
 *
 * `notes` is selected and painted by NOTHING — there was never a notes cell,
 * tooltip or row expansion. It stays unpainted and does not cross the client
 * boundary; see the catalog docblock.
 */
interface LineRow {
  id: number;
  bin_id: number;
  bin_name: string | null;
  sku: string;
  expected_qty: number;
  counted_qty: number | null;
  variance: number | null;
  status: string;
  counted_by: number | null;
  counted_by_name: string | null;
  counted_at: Date | null;
  approved_by: number | null;
  approved_by_name: string | null;
  approved_at: Date | null;
  notes: string | null;
}

interface StatusCount {
  status: string;
  count: number;
}

function isStatusFilter(v: string | undefined): v is StatusFilter {
  return v === 'all' || v === 'pending' || v === 'counted' || v === 'pending_review' || v === 'approved' || v === 'rejected';
}

async function loadCampaign(id: number, orgId: OrgId): Promise<CampaignRow | null> {
  const r = await tenantQuery<CampaignRow>(
    orgId,
    `SELECT id, name, status::text AS status,
            variance_tol::text AS variance_tol,
            created_at, closed_at
       FROM cycle_count_campaigns WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [id, orgId],
  );
  return r.rows[0] ?? null;
}

async function loadLines(id: number, filter: StatusFilter, orgId: OrgId): Promise<LineRow[]> {
  // org param is always $2; the optional status filter is $3.
  const filters = filter === 'all' ? '' : `AND l.status = $3`;
  const params = filter === 'all' ? [id, orgId] : [id, orgId, filter];
  try {
    const r = await tenantQuery<LineRow>(
      orgId,
      `SELECT l.id, l.bin_id, loc.name AS bin_name,
              l.sku, l.expected_qty, l.counted_qty, l.variance,
              l.status::text AS status,
              l.counted_by, cb.name AS counted_by_name, l.counted_at,
              l.approved_by, ab.name AS approved_by_name, l.approved_at,
              l.notes
         FROM cycle_count_lines l
         LEFT JOIN locations loc ON loc.id = l.bin_id
         LEFT JOIN staff cb ON cb.id = l.counted_by
         LEFT JOIN staff ab ON ab.id = l.approved_by
        WHERE l.campaign_id = $1 AND l.organization_id = $2 ${filters}
        ORDER BY
          CASE l.status
            WHEN 'pending_review' THEN 0
            WHEN 'pending' THEN 1
            WHEN 'counted' THEN 2
            WHEN 'approved' THEN 3
            WHEN 'rejected' THEN 4
            ELSE 9
          END,
          loc.name ASC, l.sku ASC
        LIMIT 500`,
      params,
    );
    return r.rows;
  } catch {
    return [];
  }
}

async function loadStatusCounts(id: number, orgId: OrgId): Promise<StatusCount[]> {
  try {
    const r = await tenantQuery<StatusCount>(
      orgId,
      `SELECT status::text AS status, COUNT(*)::int AS count
         FROM cycle_count_lines
        WHERE campaign_id = $1 AND organization_id = $2
        GROUP BY status`,
      [id, orgId],
    );
    return r.rows;
  } catch {
    return [];
  }
}

// ─── Server actions ────────────────────────────────────────────────────────

async function submitCountAction(formData: FormData): Promise<void> {
  'use server';
  const lineId = Number(formData.get('lineId'));
  const countedQty = Number(formData.get('countedQty'));
  const campaignId = Number(formData.get('campaignId'));
  if (!Number.isFinite(lineId) || lineId <= 0) return;
  if (!Number.isFinite(countedQty) || countedQty < 0) {
    redirect(`/inventory/cycle-counts/${campaignId}?error=invalid_qty`);
  }
  const user = await getCurrentUser();
  if (!user) return;
  try {
    await submitCount({ lineId, countedQty: Math.floor(countedQty), countedByStaffId: user.staffId, organizationId: user.organizationId });
  } catch (err) {
    console.error('[cycle-counts.submit] failed:', err);
  }
  revalidatePath(`/inventory/cycle-counts/${campaignId}`);
}

async function approveAction(formData: FormData): Promise<void> {
  'use server';
  const lineId = Number(formData.get('lineId'));
  const campaignId = Number(formData.get('campaignId'));
  if (!Number.isFinite(lineId) || lineId <= 0) return;
  const user = await getCurrentUser();
  if (!user) return;
  try {
    await approveLine({ lineId, approvedByStaffId: user.staffId, organizationId: user.organizationId });
  } catch (err) {
    console.error('[cycle-counts.approve] failed:', err);
  }
  revalidatePath(`/inventory/cycle-counts/${campaignId}`);
}

async function rejectAction(formData: FormData): Promise<void> {
  'use server';
  const lineId = Number(formData.get('lineId'));
  const campaignId = Number(formData.get('campaignId'));
  if (!Number.isFinite(lineId) || lineId <= 0) return;
  const user = await getCurrentUser();
  if (!user) return;
  try {
    await rejectLine({ lineId, approvedByStaffId: user.staffId, organizationId: user.organizationId });
  } catch (err) {
    console.error('[cycle-counts.reject] failed:', err);
  }
  revalidatePath(`/inventory/cycle-counts/${campaignId}`);
}

async function closeAction(formData: FormData): Promise<void> {
  'use server';
  const campaignId = Number(formData.get('campaignId'));
  if (!Number.isFinite(campaignId) || campaignId <= 0) return;
  const user = await getCurrentUser();
  if (!user) return;
  try {
    await closeCampaign({ campaignId, approvedByStaffId: user.staffId, organizationId: user.organizationId });
  } catch (err) {
    console.error('[cycle-counts.close] failed:', err);
  }
  revalidatePath(`/inventory/cycle-counts/${campaignId}`);
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default async function CycleCountDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const user = await requirePermission('admin.view', { enforce: true });

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id) || id <= 0) {
    redirect('/inventory/cycle-counts');
  }

  const sp = await searchParams;
  const filter: StatusFilter = isStatusFilter(sp.status) ? sp.status : 'all';
  const errorCode = sp.error ?? null;

  const [campaign, lines, statusCounts] = await Promise.all([
    loadCampaign(id, user.organizationId),
    loadLines(id, filter, user.organizationId),
    loadStatusCounts(id, user.organizationId),
  ]);

  if (!campaign) {
    return (
      <div className="min-h-screen bg-surface-canvas p-8">
        <div className="mx-auto max-w-3xl space-y-2">
          <Link href="/inventory/cycle-counts" className="text-sm text-blue-600 hover:underline">
            ← back to campaigns
          </Link>
          <h1 className="text-2xl font-semibold text-text-default">Campaign not found</h1>
        </div>
      </div>
    );
  }

  const isOpen = campaign.status === 'open';
  const byStatus = new Map(statusCounts.map((s) => [s.status, s.count]));
  const totalLines = statusCounts.reduce((sum, s) => sum + s.count, 0);
  /**
   * The wire row for the client island.
   *
   * Three fields are CAMPAIGN facts threaded onto each line, and each one
   * exists because something downstream cannot reach page state:
   *
   * - `varianceTol` / `overTolerance` — the retired Δ cell picked one of three
   *   text colours by comparing `|variance|` against
   *   `campaign.variance_tol × expected_qty`. The row adapter is
   *   `row → CompoundRowView` and closes over nothing, so the comparison
   *   happens HERE (one shared `isCycleCountLineOverTolerance`) and travels on
   *   the line. The adapter then says it in the state pill's word rather than
   *   colouring a number — tone is not a fact.
   * - `campaignOpen` — a row verb's precondition is a predicate over ROW
   *   state, never over the mount (`VERBS_BIND_TO_FIELDS`). The retired cells
   *   read `isOpen` from this scope; the line now answers for itself, and on a
   *   closed campaign the three verbs are ABSENT rather than disabled.
   *
   * `notes` does not cross: it is selected by `loadLines` and painted by
   * nothing. `created_at`-style `Date` objects become ISO strings because the
   * wire row is plain and serializable by contract.
   */
  const lineRows: CycleCountLineRow[] = lines.map((l) => ({
    id: l.id,
    campaignId: campaign.id,
    binId: l.bin_id,
    binName: l.bin_name,
    sku: l.sku,
    expectedQty: l.expected_qty,
    countedQty: l.counted_qty,
    variance: l.variance,
    status: l.status,
    countedByStaffId: l.counted_by,
    countedByName: l.counted_by_name,
    countedAt: l.counted_at ? new Date(l.counted_at).toISOString() : null,
    approvedByStaffId: l.approved_by,
    approvedByName: l.approved_by_name,
    approvedAt: l.approved_at ? new Date(l.approved_at).toISOString() : null,
    varianceTol: campaign.variance_tol,
    overTolerance: isCycleCountLineOverTolerance(
      l.variance,
      l.expected_qty,
      campaign.variance_tol,
    ),
    campaignOpen: isOpen,
  }));

  return (
    <div className="min-h-screen bg-surface-canvas p-8">
      <div className="space-y-6">
        <header className="space-y-1">
          <Link href="/inventory/cycle-counts" className="text-sm text-blue-600 hover:underline">
            ← back to campaigns
          </Link>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-text-default">{campaign.name}</h1>
              <p className="text-xs text-text-soft">
                #{campaign.id} · variance tol {campaign.variance_tol} · created {new Date(campaign.created_at).toLocaleString()}
                {campaign.closed_at ? ` · closed ${new Date(campaign.closed_at).toLocaleString()}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                isOpen ? 'bg-blue-100 text-blue-700' : 'bg-surface-sunken text-text-muted'
              }`}>
                {campaign.status}
              </span>
              {isOpen ? (
                <form action={closeAction}>
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <HoverTooltip label="Auto-approve all 'counted' lines and close the campaign" asChild>
                    <Button type="submit" variant="secondary" size="sm">
                      Close campaign
                    </Button>
                  </HoverTooltip>
                </form>
              ) : null}
            </div>
          </div>
        </header>

        {errorCode ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {errorCode === 'invalid_qty' && 'Counted qty must be a non-negative integer.'}
            {errorCode !== 'invalid_qty' && 'Action failed.'}
          </div>
        ) : null}

        {/* Status filter pills */}
        <nav className="flex flex-wrap gap-2 text-xs">
          {(['all', 'pending', 'counted', 'pending_review', 'approved', 'rejected'] as const).map((s) => {
            const count = s === 'all' ? totalLines : byStatus.get(s) ?? 0;
            return (
              <Link
                key={s}
                href={`/inventory/cycle-counts/${id}?status=${s}`}
                className={`rounded-md px-3 py-1.5 font-medium ${
                  filter === s
                    ? 'bg-blue-600 text-white'
                    : 'border border-border-default bg-surface-card text-text-muted hover:bg-surface-hover'
                }`}
              >
                {s} <span className={filter === s ? 'text-white/80' : 'text-text-faint'}>· {count}</span>
              </Link>
            );
          })}
        </nav>

        {/* Lines table */}
        <section className="space-y-3">
          <header>
            <h2 className="text-base font-medium text-text-default">Lines</h2>
            <p className="mt-1 text-role-caption text-text-soft">
              Pending lines carry a <em>Count…</em> verb. Counted and pending-review lines carry
              the admin decision.
            </p>
          </header>
          {/*
            The desk's TWO settled empty states, preserved. The retired
            `isSearching={filter !== 'all'}` prop picked between them; they are
            now the two props the engine already distinguishes — `emptyMessage`
            for a feed the SERVER narrowed to nothing (`?status=`), and
            `searchEmptyMessage` for the client search box over rows already in
            memory.
          */}
          <CycleCountLinesTable
            rows={lineRows}
            submitCount={submitCountAction}
            approveLine={approveAction}
            rejectLine={rejectAction}
            emptyMessage={
              filter === 'all' ? 'No lines in this campaign yet.' : 'No lines in this view.'
            }
            searchEmptyMessage="No lines match that filter."
          />
        </section>

        <footer className="text-xs text-text-soft">
          Approval writes <code>sku_stock_ledger</code> with reason{' '}
          <code>CYCLE_COUNT_ADJ</code> for the variance delta and updates{' '}
          <code>bin_contents.qty</code> + <code>last_counted</code>. Code path:{' '}
          <code>src/lib/inventory/cycle-count.ts</code>.
        </footer>
      </div>
    </div>
  );
}
