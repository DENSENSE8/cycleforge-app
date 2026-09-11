import { SettingsSectionFrame } from '@/components/settings/SettingsSectionHeader';
import { CatalogSection } from '@/components/settings/sections/CatalogSection';

/** `/settings/catalog` — ex-inline `?section=` tab (settings routing
 * unification, 2026-09-06). Same shell the inline renderer wore. */
export default function CatalogSettingsPage() {
  return (
    <SettingsSectionFrame title="Platforms & types">
      <CatalogSection />
    </SettingsSectionFrame>
  );
}
