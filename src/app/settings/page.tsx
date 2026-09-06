import { redirect } from 'next/navigation';
import { SettingsLanding } from '@/components/settings/SettingsLanding';

/**
 * `/settings` — the landing (2026-09-06 rail removal): a grouped card grid in
 * the /apps visual language. Personal sections collapse into the "Your setup"
 * card → `/settings/me` (one scroll page with anchor pills); org sections group
 * into Workspace / Apps / Access & People / Data & catalogs / Devices /
 * Developer clusters, permission-gated per row.
 *
 * `?section=<id>` (the old inline-tab addressing, and last session's interim
 * route-redirect layer) still resolves — personal sections land on their
 * `/settings/me#<anchor>`, org sections on their routes.
 */
const SECTION_ROUTES: Record<string, string> = {
  hardware: '/settings/me#hardware',
  workstation: '/settings/me#workstation',
  'quick-access': '/settings/me#quick-access',
  appearance: '/settings/me#appearance',
  keyboard: '/settings/me#keyboard',
  receiving: '/settings/me#receiving',
  security: '/settings/me#security',
  about: '/settings/me#about',
  legal: '/settings/me#legal',
  organization: '/settings/organization',
  billing: '/settings/billing',
  integrations: '/apps',
  ai: '/settings/ai',
  catalog: '/settings/catalog',
  stations: '/settings/stations',
  photos: '/settings/photos',
  'repair-issues': '/settings/repair-issues',
  team: '/settings/staff',
  staff: '/settings/staff',
  roles: '/settings/roles',
  access: '/settings/access',
  sessions: '/settings/sessions',
  devices: '/settings/devices',
  audit: '/settings/audit',
  qa: '/settings/qa',
  'operations-log': '/operations?mode=logs',
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const raw = await searchParams;
  const section = String(Array.isArray(raw.section) ? raw.section[0] : raw.section || '')
    .trim()
    .toLowerCase();
  if (section && SECTION_ROUTES[section]) {
    redirect(SECTION_ROUTES[section]);
  }
  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-canvas">
      <main className="flex-1 overflow-y-auto">
        <SettingsLanding />
      </main>
    </div>
  );
}
