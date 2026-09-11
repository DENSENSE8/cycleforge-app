import { OrganizationSection } from '@/components/settings/sections/OrganizationSection';
import { SettingsSectionFrame } from '@/components/settings/SettingsSectionHeader';
import { requirePermission } from '@/lib/auth/page-guard';

export default async function OrganizationSettingsPage() {
  await requirePermission('admin.view', { enforce: true });
  return (
    <SettingsSectionFrame title="Organization">
      <OrganizationSection />
    </SettingsSectionFrame>
  );
}
