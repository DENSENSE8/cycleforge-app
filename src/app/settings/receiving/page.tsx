'use client';

import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { SettingsSectionFrame } from '@/components/settings/SettingsSectionHeader';

/** `/settings/receiving` — Receiving policy (org). Every receiving registry
 * def is scope: 'org', so the whole page is workspace policy. */
export default function ReceivingSettingsPage() {
  return (
    <SettingsSectionFrame title="Receiving policy">
      <SettingsPanel page="receiving" />
    </SettingsSectionFrame>
  );
}
