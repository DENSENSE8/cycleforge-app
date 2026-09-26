import { RepairIssuesManagementTab } from '@/components/admin/RepairIssuesManagementTab';
import { requirePermission } from '@/lib/auth/page-guard';

/** `/settings/repair-issues` — global repair issue checklist templates (ex-Admin › Repair Issues; admin dissolution). */
export default async function RepairIssuesSettingsPage() {
  await requirePermission('repair.intake', { enforce: true });
  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-canvas">
      <main className="flex-1 overflow-y-auto">
        <RepairIssuesManagementTab />
      </main>
    </div>
  );
}
