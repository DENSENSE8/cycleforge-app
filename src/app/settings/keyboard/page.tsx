import { SettingsSectionFrame } from '@/components/settings/SettingsSectionHeader';
import { KeyboardSection } from '@/components/settings/sections/KeyboardSection';

/** `/settings/keyboard` — ex-inline `?section=` tab (settings routing
 * unification, 2026-09-06). Same shell the inline renderer wore. */
export default function KeyboardSettingsPage() {
  return (
    <SettingsSectionFrame title="Keyboard">
      <KeyboardSection />
    </SettingsSectionFrame>
  );
}
