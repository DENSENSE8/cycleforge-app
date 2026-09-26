import { requirePermission } from '@/lib/auth/page-guard';
import { AutomationsView } from '@/components/studio/AutomationsView';

/**
 * /studio/automations — the Automations lane's Rules child.
 * Operator ruling 2026-09-23: the designated-tag cron belongs in the sidebar's
 */
export const metadata = { title: 'Automation rules' };

export default async function StudioAutomationsPage() {
  const user = await requirePermission('studio.view');
  return <AutomationsView canRunNow={user.permissions.has('admin.view')} />;
}
