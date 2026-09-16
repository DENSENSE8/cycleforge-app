import { requirePermission } from '@/lib/auth/page-guard';
import { getCurrentUser } from '@/lib/auth/current-user';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { createCampaign } from '@/lib/inventory/cycle-count';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/pane-header';
import { Panel, Button } from '@/design-system/primitives';
import type { CycleCountCampaignRow } from '@/lib/inventory/cycle-count-campaign-row';
import { CycleCountsTableSection } from './CycleCountsTableSection';

export const dynamic = 'force-dynamic';

/**
 * /inventory/cycle-counts
 *
 * Campaign list + creation. Each row links to the detail page where
 * counts get submitted and pending_review lines get approved/rejected.
 *
 * The create form is a server action that calls createCampaign() from
 * src/lib/inventory/cycle-count.ts. On success it redirects to the new
 * campaign's detail page.
 */

interface CampaignRow {
  id: number;
  name: string;
  status: string;
  variance_tol: string;
  created_at: Date;
  closed_at: Date | null;
  created_by: number | null;
  created_by_name: string | null;
  total_lines: number;
  counted_lines: number;
  pending_review_lines: number;
  approved_lines: number;
}

async function loadCampaigns(orgId: OrgId): Promise<CampaignRow[]> {
  try {
    const r = await tenantQuery<CampaignRow>(
      orgId,
      `SELECT c.id, c.name, c.status::text AS status,
              c.variance_tol::text AS variance_tol,
              c.created_at, c.closed_at, c.created_by, s.name AS created_by_name,
              COALESCE(stats.total_lines, 0)::int AS total_lines,
              COALESCE(stats.counted_lines, 0)::int AS counted_lines,
              COALESCE(stats.pending_review_lines, 0)::int AS pending_review_lines,
              COALESCE(stats.approved_lines, 0)::int AS approved_lines
         FROM cycle_count_campaigns c
         LEFT JOIN staff s ON s.id = c.created_by
         LEFT JOIN LATERAL (
           SELECT
             COUNT(*)::int AS total_lines,
             COUNT(*) FILTER (WHERE l.status = 'counted')::int AS counted_lines,
             COUNT(*) FILTER (WHERE l.status = 'pending_review')::int AS pending_review_lines,
             COUNT(*) FILTER (WHERE l.status = 'approved')::int AS approved_lines
           FROM cycle_count_lines l WHERE l.campaign_id = c.id
         ) stats ON TRUE
        WHERE c.organization_id = $1
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT 50`,
      [orgId],
    );
    return r.rows;
  } catch {
    return [];
  }
}

async function createCampaignAction(formData: FormData): Promise<void> {
  'use server';
  const name = String(formData.get('name') ?? '').trim();
  const tolRaw = Number(formData.get('variance_tol'));
  const tol = Number.isFinite(tolRaw) && tolRaw >= 0 && tolRaw <= 1 ? tolRaw : 0.05;
  if (!name) {
    redirect('/inventory/cycle-counts?error=missing_name');
  }
  const user = await getCurrentUser();
  if (!user) {
    redirect('/inventory/cycle-counts?error=failed');
  }
  try {
    const { campaignId } = await createCampaign({
      name,
      varianceTol: tol,
      createdByStaffId: user.staffId,
      organizationId: user.organizationId,
    });
    revalidatePath('/inventory/cycle-counts');
    redirect(`/inventory/cycle-counts/${campaignId}`);
  } catch (err) {
    console.error('[cycle-counts.create] failed:', err);
    redirect('/inventory/cycle-counts?error=failed');
  }
}

export default async function CycleCountsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requirePermission('admin.view', { enforce: true });

  const params = await searchParams;
  const errorCode = params.error ?? null;
  const campaigns = await loadCampaigns(user.organizationId);

  /**
   * The wire row for the client island. `closed_at` and `created_by` are
   * selected by the query and were never painted, so they do not cross — the
   * port restores no columns. `created_at` crosses as an ISO string because
   * the row shape is plain and serializable by contract.
   */
  const campaignRows: CycleCountCampaignRow[] = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    varianceTol: c.variance_tol,
    totalLines: c.total_lines,
    countedLines: c.counted_lines,
    pendingReviewLines: c.pending_review_lines,
    approvedLines: c.approved_lines,
    createdAt: new Date(c.created_at).toISOString(),
    createdByName: c.created_by_name,
  }));

  return (
    <div className="min-h-screen bg-surface-canvas">
      <PageHeader backHref="/inventory/health" title="Cycle counts" />
      <div className="space-y-6 p-8">
        <p className="text-sm text-text-muted">
          Campaigns snapshot <code className="rounded bg-surface-sunken px-1 py-0.5 text-xs">bin_contents</code>{' '}
          and route counts through the variance-tolerance gate. Within tolerance auto-approves
          on close; outside tolerance lands in admin review.
        </p>

        {errorCode ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {errorCode === 'missing_name' && 'Campaign name is required.'}
            {errorCode === 'failed' && 'Failed to create campaign — check server logs.'}
            {!['missing_name', 'failed'].includes(errorCode) && 'Action failed.'}
          </div>
        ) : null}

        {/* Create form */}
        <Panel radius="lg" padding="none">
          <header className="border-b border-border-hairline px-6 py-3">
            <h2 className="text-base font-medium text-text-default">Start a new campaign</h2>
          </header>
          <form action={createCampaignAction} className="grid grid-cols-1 gap-3 px-6 py-4 md:grid-cols-[2fr_auto_auto]">
            <div>
              <label htmlFor="name" className="block text-xs font-medium text-text-muted">Name</label>
              <input
                id="name"
                name="name"
                placeholder="e.g. May 2026 month-end"
                className="mt-1 block w-full rounded-md border border-border-default px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="variance_tol" className="block text-xs font-medium text-text-muted">Variance tol (0–1)</label>
              <input
                id="variance_tol"
                name="variance_tol"
                type="number"
                step="0.01"
                min="0"
                max="1"
                defaultValue="0.05"
                className="mt-1 block w-28 rounded-md border border-border-default px-3 py-1.5 font-mono text-xs"
              />
            </div>
            <div className="flex items-end">
              <Button variant="primary" size="sm" type="submit">
                Snapshot + create
              </Button>
            </div>
          </form>
          <p className="border-t border-border-hairline bg-surface-canvas px-6 py-3 text-role-caption text-text-muted">
            Snapshots every <code>bin_contents</code> row with <code>qty &gt; 0</code> or
            never-counted. Default tolerance 0.05 (5%) — counts within that auto-approve on close;
            beyond it routes to <em>pending review</em>.
          </p>
        </Panel>

        {/* Campaign list */}
        <section className="space-y-3">
          <header className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-text-default">Campaigns</h2>
            <span className="text-xs text-text-soft">last 50</span>
          </header>
          <CycleCountsTableSection rows={campaignRows} />
        </section>
      </div>
    </div>
  );
}
