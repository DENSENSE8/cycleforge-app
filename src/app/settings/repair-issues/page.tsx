import { RepairIssuesManagementTab } from '@/components/admin/RepairIssuesManagementTab';
import { requirePermission } from '@/lib/auth/page-guard';

/**
 * `/settings/repair-issues` — global repair issue checklist templates
 * (ex-Admin › Repair Issues; admin dissolution W3c, 2026-09-06). Process
 * master data, same family as Platforms & Types: flow-type vocabulary the
 * repair bench consumes but no desk owns. `repair.intake`-gated.
 */
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
