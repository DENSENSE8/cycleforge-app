import { RolesAdminTab } from '@/components/admin/RolesAdminTab';
import { SettingsSectionHeader } from '@/components/settings/SettingsSectionHeader';
import { SETTINGS_FLOOR_CLASS } from '@/components/settings/settings-sections';
import { cn } from '@/utils/_cn';
import { requirePermission } from '@/lib/auth/page-guard';

export default async function SettingsRolesPage() {
  await requirePermission('admin.manage_roles', { enforce: true });
  return (
    <div className={cn('flex h-full min-h-0 w-full flex-col', SETTINGS_FLOOR_CLASS)}>
      <div className="px-6 pt-8 sm:px-10">
        <SettingsSectionHeader title="Roles" />
      </div>
      <div className="min-h-0 flex-1">
        <RolesAdminTab />
      </div>
    </div>
  );
}
