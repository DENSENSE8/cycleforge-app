import { ConnectionsManagementTab } from '@/components/admin/ConnectionsManagementTab';
import { FavoritesManagementTab } from '@/components/admin/FavoritesManagementTab';
import { RepairIssuesManagementTab } from '@/components/admin/RepairIssuesManagementTab';
import { ReasonCodesManagementTab } from '@/components/admin/ReasonCodesManagementTab';
import { StationNasFoldersTab } from '@/components/admin/StationNasFoldersTab';
import { PoMailboxAdminSection } from '@/components/admin/PoMailboxAdminSection';
import { BoseModelsManagementTab } from '@/components/admin/sourcing/BoseModelsManagementTab';
import { CompatibilityManagementTab } from '@/components/admin/sourcing/CompatibilityManagementTab';
import { AdminOverviewTab } from '@/components/admin/AdminOverviewTab';
import {
  ADMIN_SECTION_REDIRECTS,
  getAdminSection,
  type AdminSection,
} from '@/components/admin/admin-sections';
import { requirePermission } from '@/lib/auth/page-guard';
import { redirect } from 'next/navigation';

interface AdminPageProps {
  searchParams: Promise<{
    section?: string;
    search?: string;
    mode?: string;
    staffId?: string;
    roleId?: string;
  }>;
}

function renderTab(
  activeTab: AdminSection,
  args: { searchValue: string; mode?: string },
) {
  switch (activeTab) {
    case 'overview':       return <AdminOverviewTab />;
    case 'connections':    return <ConnectionsManagementTab />;
    case 'bose_models':    return <BoseModelsManagementTab />;
    case 'compatibility':  return <CompatibilityManagementTab />;
    case 'reason_codes':   return <ReasonCodesManagementTab />;
    case 'station_photos': return <StationNasFoldersTab mode={args.mode} />;
    case 'po_mailbox':     return <PoMailboxAdminSection />;
    case 'repair_issues':  return <RepairIssuesManagementTab />;
    case 'favorites':      return <FavoritesManagementTab />;
  }
}

function buildSettingsRedirect(
  path: string,
  params: { staffId?: string; roleId?: string },
): string {
  const qs = new URLSearchParams();
  if (params.staffId) qs.set('staffId', params.staffId);
  if (params.roleId) qs.set('roleId', params.roleId);
  const query = qs.toString();
  return query ? `${path}?${query}` : path;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  await requirePermission('admin.view', { enforce: true });

  const params = await searchParams;
  const rawSection = String(params.section || '').toLowerCase();

  // The Operations / architecture board now lives only in /studio (Operations
  // Studio). Redirect the retired admin tab — and its old `reasons` sub-mode
  // deep link, which belongs to Reason Codes now a standalone section again.
  if (rawSection === 'architecture') {
    redirect(params.mode === 'reasons' ? '/admin?section=reason_codes' : '/studio');
  }

  // Moved to Settings — preserve query params where applicable.
  if (rawSection === 'integrations') {
    redirect('/settings/integrations');
  }
  if (rawSection === 'access') {
    redirect(buildSettingsRedirect('/settings/access', { staffId: params.staffId }));
  }
  if (rawSection === 'roles') {
    redirect(buildSettingsRedirect('/settings/roles', { roleId: params.roleId }));
  }
  if (rawSection === 'staff') {
    redirect('/operations?mode=staff');
  }

  // Dissolved sections (W0+W1, 2026-09-06) — one redirect table in
  // admin-sections.ts is the single list. `logs` keeps its `?search=` filter
  // (the desk's shared filter band is `q`).
  const dissolved = ADMIN_SECTION_REDIRECTS[rawSection];
  if (dissolved) {
    if (rawSection === 'logs' && params.search) {
      redirect(`${dissolved}&q=${encodeURIComponent(params.search)}`);
    }
    redirect(dissolved);
  }

  const activeTab = getAdminSection(params.section);
  const sidebarSearch = (params.search || '').trim();

  return (
    <div className="flex h-full w-full bg-surface-canvas">
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="h-full min-h-0 w-full">
          {renderTab(activeTab, { searchValue: sidebarSearch, mode: params.mode })}
        </div>
      </div>
    </div>
  );
}
