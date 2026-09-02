import { redirect } from 'next/navigation';
import { QaConsole } from '@/components/settings/QaConsole';
import { requirePermission } from '@/lib/auth/page-guard';
import { getOrganization } from '@/lib/tenancy/organizations';
import { getOrganizationEnvironment } from '@/lib/tenancy/settings';
import { resolveQaToolsAccess, QA_TOOL_PERMISSIONS } from '@/lib/qa-tools/access';

export default async function QaSettingsPage() {
  const user = await requirePermission(QA_TOOL_PERMISSIONS.view, { enforce: true });
  const organization = await getOrganization(user.organizationId);
  const access = organization
    ? resolveQaToolsAccess({
        organizationEnvironment: getOrganizationEnvironment(organization.settings),
        permissions: user.permissions,
      })
    : null;

  if (!access?.visible) redirect('/not-authorized');

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-canvas">
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-8 sm:px-10">
          <QaConsole />
        </div>
      </main>
    </div>
  );
}
