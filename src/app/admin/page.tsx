import { redirect } from 'next/navigation';

/**
 * `/admin` — DISSOLVED. Every console section found its one true home; this
 * route is the permanent redirect table. The spine's Admin row is gone with
 * it — permission is `requires` on rows, not a destination.
 *
 * Homes: goals/quality/staff/sync/logs → Operations desk modes;
 * suppliers/models/compatibility → Sourcing modes; locations → Inventory ›
 * Locations `manage` tab; reason_codes/favorites → their own Inventory pages;
 * fba catalog → Shipping › FBA `catalog` mode; po_mailbox → Inbound ›
 * PO Mailbox; station_photos → Settings › Photos & NAS; repair_issues →
 * Settings › Repair issues; connections → Settings › Apps & integrations ›
 * Sync tools; integrations/access/roles were already Settings; architecture →
 * /studio; overview → the monitor desk.
 *
 * This tree has no `/apps` marketplace route, so the integration homes stay
 * under `/settings/integrations` (same reason `settings-sections.ts` does).
 */
const SECTION_HOMES: Record<string, string> = {
  overview: '/operations',
  goals: '/operations?mode=goals',
  quality: '/operations?mode=quality',
  staff_schedule: '/operations?mode=staff',
  staff: '/operations?mode=staff',
  system_sync: '/operations?mode=sync',
  logs: '/operations?mode=logs',
  suppliers: '/sourcing?mode=suppliers',
  bose_models: '/sourcing?mode=models',
  compatibility: '/sourcing?mode=compatibility',
  locations: '/inventory/locations?tab=manage',
  reason_codes: '/inventory/reason-codes',
  favorites: '/inventory/favorites',
  fba: '/shipping/fba?fbaMode=catalog',
  po_mailbox: '/incoming?view=mailbox',
  station_photos: '/settings/photos',
  repair_issues: '/settings/repair-issues',
  connections: '/settings/integrations/sync',
  integrations: '/settings/integrations',
  access: '/settings/access',
  roles: '/settings/roles',
  architecture: '/studio',
};

export default async function AdminRedirect({
  searchParams,
}: {
  searchParams: Promise<{
    section?: string;
    search?: string;
    mode?: string;
    staffId?: string;
    roleId?: string;
    page?: string;
    po_gmail_connected?: string;
    po_gmail_error?: string;
  }>;
}) {
  const params = await searchParams;
  const raw = String(params.section || '').toLowerCase();

  let home = SECTION_HOMES[raw] ?? '/operations';

  // Params worth keeping at their destination.
  const extra = new URLSearchParams();
  if (raw === 'logs' && params.search) extra.set('q', params.search);
  if (raw === 'station_photos' && params.mode) extra.set('mode', params.mode);
  if (raw === 'connections' && params.page) extra.set('page', params.page);
  if (raw === 'access' && params.staffId) extra.set('staffId', params.staffId);
  if (raw === 'roles' && params.roleId) extra.set('roleId', params.roleId);
  if (raw === 'po_mailbox') {
    if (params.po_gmail_connected) extra.set('po_gmail_connected', params.po_gmail_connected);
    if (params.po_gmail_error) extra.set('po_gmail_error', params.po_gmail_error);
  }
  // `architecture` had a `reasons` sub-mode that belongs to Reason Codes.
  if (raw === 'architecture' && params.mode === 'reasons') home = '/inventory/reason-codes';

  const qs = extra.toString();
  const joiner = home.includes('?') ? '&' : '?';
  redirect(qs ? `${home}${joiner}${qs}` : home);
}
