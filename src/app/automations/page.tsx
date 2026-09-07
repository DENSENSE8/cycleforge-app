import { Suspense } from 'react';
import { requirePermission } from '@/lib/auth/page-guard';
import { isStudioGated } from '@/lib/billing/studio-gate';
import { AutomationsMarketplace } from '@/components/automations/AutomationsMarketplace';

export const metadata = { title: 'Automations' };

export default async function AutomationsPage() {
  const user = await requirePermission('studio.view');
  const canManage =
    user.permissions.has('studio.manage') && !(await isStudioGated(user.organizationId));
  return (
    <Suspense>
      <AutomationsMarketplace canManage={canManage} />
    </Suspense>
  );
}
