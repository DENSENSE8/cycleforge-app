import { SettingsSectionFrame } from '@/components/settings/SettingsSectionHeader';
import { SecuritySection } from '@/components/settings/sections/SecuritySection';

/** `/settings/security` — ex-inline `?section=` tab (settings routing
 * unification, 2026-09-06). Same shell the inline renderer wore. */
export default function SecuritySettingsPage() {
  return (
    <SettingsSectionFrame title="Security">
      <SecuritySection />
    </SettingsSectionFrame>
  );
}
