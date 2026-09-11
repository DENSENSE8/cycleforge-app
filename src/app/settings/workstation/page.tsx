import { SettingsSectionFrame } from '@/components/settings/SettingsSectionHeader';
import { WorkstationSection } from '@/components/settings/sections/WorkstationSection';

/** `/settings/workstation` — ex-inline `?section=` tab (settings routing
 * unification, 2026-09-06). Same shell the inline renderer wore. */
export default function WorkstationSettingsPage() {
  return (
    <SettingsSectionFrame title="Workstation">
      <WorkstationSection />
    </SettingsSectionFrame>
  );
}
