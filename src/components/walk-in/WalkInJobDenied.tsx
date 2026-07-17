'use client';

/**
 * Body stand-in for a Walk-In job the operator may not open. They hold the page
 * gate (`walk_in.view`) but not the job's own permission — today only Repair
 * (`repair.view`, see `WALK_IN_JOB_PERMISSIONS`).
 *
 * Both halves of the station render it (sidebar list + right pane), so a denied
 * job is inert on both. `WalkInJobSwitcher` already drops the pill, so this is
 * the deep-link path (`/pickup?job=repair`, `/repair`), not a clickable one.
 *
 * Copy names the permission via the registry label so an operator can ask their
 * admin for it by name, and so the label can't drift from the registry.
 */

import { permissionLabel } from '@/lib/auth/permission-registry';
import type { PermissionString } from '@/lib/auth/permissions-shared';

export function WalkInJobDenied({ requires }: { requires: PermissionString }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-role-caption font-semibold text-text-soft">
      Requires the “{permissionLabel(requires)}” permission.
    </div>
  );
}
