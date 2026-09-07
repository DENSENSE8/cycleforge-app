import { redirect } from 'next/navigation';
import { SettingsLanding } from '@/components/settings/SettingsLanding';
import {
  SETTINGS_SECTION_OPTIONS,
  settingsSectionRoute,
} from '@/components/settings/settings-sections';

/**
 * `/settings` — the landing (2026-09-06 rail removal): a grouped card grid in
 * the /apps visual language. Personal sections collapse into the "Your setup"
 * card → `/settings/me` (one scroll page with anchor pills); org sections group
 * into category clusters, permission-gated per row.
 *
 * `?section=<id>` (the old inline-tab addressing) still resolves — DERIVED
 * from the registry (personal → `/settings/me#<anchor>`, org → its route) plus
 * the legacy spellings the registry cannot express. An unknown section value
 * cleans the URL with a redirect to bare `/settings` rather than lingering in
 * the address bar.
 */
const LEGACY_SECTION_ALIASES: Record<string, string> = {
  staff: 'team',
  'operations-log': '/operations?mode=logs',
};

function sectionRoute(id: string): string | null {
  const legacy = LEGACY_SECTION_ALIASES[id];
  if (legacy) return legacy.startsWith('/') ? legacy : sectionRoute(legacy);
  const known = SETTINGS_SECTION_OPTIONS.some((s) => s.id === id);
  if (!known) return null;
  const def = SETTINGS_SECTION_OPTIONS.find((s) => s.id === id)!;
  return def.group === 'Personal'
    ? `/settings/me#${def.id}`
    : settingsSectionRoute(def.id);
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const raw = await searchParams;
  const section = String(Array.isArray(raw.section) ? raw.section[0] : raw.section || '')
    .trim()
    .toLowerCase();
  if (section) {
    redirect(sectionRoute(section) ?? '/settings');
  }
  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-canvas">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SettingsLanding />
      </div>
    </div>
  );
}
