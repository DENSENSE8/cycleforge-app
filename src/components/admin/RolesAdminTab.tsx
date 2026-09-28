'use client';

/**
 * /settings/roles — thin shell. Reads ?roleId from URL and renders
 * RoleEditor or an empty state.
 */

import { useSearchParams } from 'next/navigation';
import { RoleEditor } from './roles/RoleEditor';
import { StrictModeReadinessReport } from './roles/StrictModeReadinessReport';

export function RolesAdminTab() {
  const searchParams = useSearchParams();
  const raw = searchParams.get('roleId');
  const roleId = (() => {
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();

  if (roleId == null) {
    return (
      <div className="flex h-full flex-col bg-surface-canvas/30">
        <StrictModeReadinessReport />
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <div className="max-w-md rounded-2xl border border-dashed border-border-default bg-surface-card px-6 py-10 text-center">
            <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface-sunken text-text-soft">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M3 12h18M3 18h18"/>
              </svg>
            </div>
            <h2 className="text-base font-semibold text-text-default">Pick a role</h2>
            <p className="mt-1 text-role-caption text-text-soft">
              Choose a role from the sidebar to edit its permissions, color, and members. Drag to reorder priority. Click + to create a new role.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface-canvas/30">
      <StrictModeReadinessReport />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <RoleEditor key={roleId} roleId={roleId} />
      </div>
    </div>
  );
}
