import { SettingsSectionFrame } from '@/components/settings/SettingsSectionHeader';
import { LegalSection } from '@/components/settings/sections/LegalSection';

/** `/settings/legal` — ex-inline `?section=` tab (settings routing
 * unification, 2026-09-06). Same shell the inline renderer wore. */
export default function LegalSettingsPage() {
  return (
    <SettingsSectionFrame title="Legal & policies">
      <LegalSection />
    </SettingsSectionFrame>
  );
}
