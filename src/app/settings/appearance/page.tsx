import { SettingsSectionFrame } from '@/components/settings/SettingsSectionHeader';
import { AppearanceSection } from '@/components/settings/sections/AppearanceSection';

/** `/settings/appearance` — ex-inline `?section=` tab (settings routing
 * unification, 2026-09-06). Same shell the inline renderer wore. */
export default function AppearanceSettingsPage() {
  return (
    <SettingsSectionFrame title="Appearance">
      <AppearanceSection />
    </SettingsSectionFrame>
  );
}
