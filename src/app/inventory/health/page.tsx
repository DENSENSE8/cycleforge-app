import { requirePermission } from '@/lib/auth/page-guard';
import { PageHeader } from '@/components/ui/pane-header';
import { loadInventoryAdminData } from './_inventory-admin/inventory-admin-data';
import { LookupForms } from './_inventory-admin/LookupForms';
import {
  FlagsSection,
  PreflightSection,
  QuickLinks,
  SchemaSection,
  BackfillSection,
} from './_inventory-admin/StatusSections';
import {
  DriftAlertsSection,
  DriftSection,
  AllocationsSection,
  RecentEventsSection,
} from './_inventory-admin/TableSections';

export const dynamic = 'force-dynamic';

/** /inventory/health — Operations dashboard for the inventory v2 rollout. */
export default async function InventoryAdminPage() {
  const user = await requirePermission('admin.view', { enforce: true });
  const data = await loadInventoryAdminData(user.organizationId);

  return (
    <div className="min-h-screen w-full bg-surface-canvas">
      <PageHeader title="Inventory" />
      <div className="space-y-8 p-8">
        <p className="text-sm text-text-muted">
          Operations dashboard for the state-machine inventory migration. Read-only.
          See <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-xs">context/inventory_system_upgrade_plan.md</code> for the full plan.
        </p>

        <LookupForms />

        <FlagsSection flags={data.flags} allFlagsOff={data.allFlagsOff} />
        <PreflightSection preflight={data.preflight} preflightAllOk={data.preflightAllOk} />
        <QuickLinks />
        <DriftAlertsSection openDriftAlerts={data.openDriftAlerts} />
        <SchemaSection schema={data.schema} schemaAllOk={data.schemaAllOk} />
        <BackfillSection backfill={data.backfill} />
        <DriftSection drift={data.drift} driftClean={data.driftClean} />
        <AllocationsSection allocations={data.allocations} />
        <RecentEventsSection events={data.events} />

        <footer className="pt-2 text-xs text-text-soft">
          <p>
            To flip a flag, set the corresponding env var to <code className="rounded bg-surface-sunken px-1 py-0.5">true</code>
            on Vercel and redeploy. The flag reads on every request — no warm-up needed.
          </p>
        </footer>
      </div>
    </div>
  );
}
