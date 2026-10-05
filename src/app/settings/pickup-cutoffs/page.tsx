import { PickupCutoffsEditor } from '@/components/settings/PickupCutoffsEditor';
import { SettingsSectionFrame } from '@/components/settings/SettingsSectionHeader';
import { requirePermission } from '@/lib/auth/page-guard';

/** `/settings/pickup-cutoffs` — Carrier pickups (org): each carrier's pickup time per weekday, the Live feed's countdowns. */
export default async function PickupCutoffsSettingsPage() {
  await requirePermission('admin.manage_features', { enforce: true });
  return (
    <SettingsSectionFrame title="Carrier pickups" maxWidth="5xl">
      <PickupCutoffsEditor />
    </SettingsSectionFrame>
  );
}
