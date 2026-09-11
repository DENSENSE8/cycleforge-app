import { SettingsSectionFrame } from '@/components/settings/SettingsSectionHeader';
import { StationsSection } from '@/components/settings/sections/StationsSection';

/** `/settings/stations` — ex-inline `?section=` tab (settings routing
 * unification, 2026-09-06). Same shell the inline renderer wore. */
export default function StationsSettingsPage() {
  return (
    <SettingsSectionFrame title="Stations">
      <StationsSection />
    </SettingsSectionFrame>
  );
}
