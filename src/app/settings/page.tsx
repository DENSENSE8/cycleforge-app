import { redirect } from 'next/navigation';

/**
 * `/settings` — every section is a real route now (settings routing
 * unification, 2026-09-06): /settings/hardware, /settings/appearance, …
 * alongside the org routes that were already paths (billing, apps, photos,
 * team, roles, access, audit, organization, qa, ai).
 *
 * This file is the redirect back-compat layer: `?section=<id>` (the old
 * inline-tab addressing) and the legacy spellings land on their routes.
 * Bare /settings lands on the first Personal section.
 */
const SECTION_ROUTES: Record<string, string> = {
  hardware: '/settings/hardware',
  workstation: '/settings/workstation',
  'quick-access': '/settings/quick-access',
  appearance: '/settings/appearance',
  keyboard: '/settings/keyboard',
  receiving: '/settings/receiving',
  security: '/settings/security',
  about: '/settings/about',
  legal: '/settings/legal',
  organization: '/settings/organization',
  billing: '/settings/billing',
  integrations: '/apps',
  ai: '/settings/ai',
  catalog: '/settings/catalog',
  stations: '/settings/stations',
  photos: '/settings/photos',
  team: '/settings/staff',
  staff: '/settings/staff',
  roles: '/settings/roles',
  access: '/settings/access',
  sessions: '/settings/sessions',
  devices: '/settings/devices',
  audit: '/settings/audit',
  qa: '/settings/qa',
  // Legacy spellings from the old redirect table.
  'operations-log': '/operations?mode=logs',
};

export default async function SettingsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const raw = await searchParams;
  const section = String(Array.isArray(raw.section) ? raw.section[0] : raw.section || '')
    .trim()
    .toLowerCase();
  redirect(SECTION_ROUTES[section] ?? '/settings/hardware');
}
