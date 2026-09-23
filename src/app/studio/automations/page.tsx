import { requirePermission } from '@/lib/auth/page-guard';
import { AutomationsView } from '@/components/studio/AutomationsView';

/**
 * /studio/automations — the Automations lane's Rules child.
 *
 * Operator ruling 2026-09-23: the designated-tag cron belongs in the sidebar's
 * Automations display, "as a first principles approach to automations". So this
 * page answers the plain question — what runs by itself, when, what turns it on,
 * and did it work — instead of leaving cron health buried in Admin → System sync.
 *
 * `studio.view` gates the door, exactly like `/studio` and `/studio/catalog`.
 * "Run now" is a SEPARATE, stricter gate: `/api/cron-runs/run` is `admin.view`
 * server-side, so the button is only offered to a viewer who holds it — a button
 * that 403s is worse than an absent one.
 */
export const metadata = { title: 'Automation rules' };

export default async function StudioAutomationsPage() {
  const user = await requirePermission('studio.view');
  return <AutomationsView canRunNow={user.permissions.has('admin.view')} />;
}
