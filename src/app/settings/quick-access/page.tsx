import { SettingsSectionFrame } from '@/components/settings/SettingsSectionHeader';
import { QuickAccessSection } from '@/components/settings/sections/QuickAccessSection';

/** `/settings/quick-access` — ex-inline `?section=` tab (settings routing
 * unification, 2026-09-06). Same shell the inline renderer wore. */
export default function QuickAccessSettingsPage() {
  return (
    <SettingsSectionFrame title="Quick access">
      <QuickAccessSection />
    </SettingsSectionFrame>
  );
}
