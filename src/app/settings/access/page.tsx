import { StaffAccessMatrixTab } from '@/components/admin/StaffAccessMatrixTab';
import { SettingsSectionHeader } from '@/components/settings/SettingsSectionHeader';
import { SETTINGS_FLOOR_CLASS } from '@/components/settings/settings-sections';
import { cn } from '@/utils/_cn';
import { requirePermission } from '@/lib/auth/page-guard';

export default async function SettingsAccessPage() {
  await requirePermission('admin.view', { enforce: true });
  return (
    <div className={cn('flex h-full min-h-0 w-full flex-col', SETTINGS_FLOOR_CLASS)}>
      <div className="px-6 pt-8 sm:px-10">
        <SettingsSectionHeader title="Access" />
      </div>
      <div className="min-h-0 flex-1">
        <StaffAccessMatrixTab />
      </div>
    </div>
  );
}
