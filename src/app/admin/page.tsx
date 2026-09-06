import { RepairIssuesManagementTab } from '@/components/admin/RepairIssuesManagementTab';
import { ConnectionsManagementTab } from '@/components/admin/ConnectionsManagementTab';
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
    po_gmail_connected?: string;
    po_gmail_error?: string;
  }>;
}

function renderTab(
  activeTab: AdminSection,
  args: { searchValue: string; mode?: string },
) {
  switch (activeTab) {
    case 'overview':       return <AdminOverviewTab />;
    case 'connections':    return <ConnectionsManagementTab />;
    case 'repair_issues':  return <RepairIssuesManagementTab />;
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
  // deep link, which belongs to Reason Codes (now /inventory/reason-codes).
  if (rawSection === 'architecture') {
    redirect(params.mode === 'reasons' ? '/inventory/reason-codes' : '/studio');
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

  // Dissolved sections (W0–W3, 2026-09-06) — one redirect table in
  // admin-sections.ts is the single list. `logs` keeps its `?search=` filter
  // (the desk's shared filter band is `q`); `po_mailbox` keeps the Gmail
  // OAuth flash params so its toast still fires at the new home.
  const dissolved = ADMIN_SECTION_REDIRECTS[rawSection];
  if (dissolved) {
    if (rawSection === 'logs' && params.search) {
      redirect(`${dissolved}&q=${encodeURIComponent(params.search)}`);
    }
    if (rawSection === 'station_photos' && params.mode) {
      redirect(`${dissolved}&mode=${encodeURIComponent(params.mode)}`);
    }
    if (rawSection === 'po_mailbox' && (params.po_gmail_connected || params.po_gmail_error)) {
      const flash = params.po_gmail_connected
        ? `po_gmail_connected=${params.po_gmail_connected}`
        : `po_gmail_error=${encodeURIComponent(String(params.po_gmail_error))}`;
      redirect(`${dissolved}&${flash}`);
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
