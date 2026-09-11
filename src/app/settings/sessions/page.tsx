import { SettingsSectionFrame } from '@/components/settings/SettingsSectionHeader';
import { SessionsSection } from '@/components/settings/sections/SessionsSection';

/** `/settings/sessions` — ex-inline `?section=` tab (settings routing
 * unification, 2026-09-06). Same shell the inline renderer wore. */
export default function SessionsSettingsPage() {
  return (
    <SettingsSectionFrame title="Active sessions">
      <SessionsSection />
    </SettingsSectionFrame>
  );
}
