import { SettingsSectionFrame } from '@/components/settings/SettingsSectionHeader';
import { HardwareSection } from '@/components/settings/sections/HardwareSection';

/** `/settings/hardware` — ex-inline `?section=` tab (settings routing
 * unification, 2026-09-06). Same shell the inline renderer wore. */
export default function HardwareSettingsPage() {
  return (
    <SettingsSectionFrame title="Hardware">
      <HardwareSection />
    </SettingsSectionFrame>
  );
}
