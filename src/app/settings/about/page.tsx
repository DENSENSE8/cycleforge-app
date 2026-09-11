import { SettingsSectionFrame } from '@/components/settings/SettingsSectionHeader';
import { AboutSection } from '@/components/settings/sections/AboutSection';

/** `/settings/about` — ex-inline `?section=` tab (settings routing
 * unification, 2026-09-06). Same shell the inline renderer wore. */
export default function AboutSettingsPage() {
  return (
    <SettingsSectionFrame title="About">
      <AboutSection />
    </SettingsSectionFrame>
  );
}
