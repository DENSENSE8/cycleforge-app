import { requirePermission } from '@/lib/auth/page-guard';
import { StudioShell } from '@/components/studio/StudioShell';
import { StudioUpgradePrompt } from '@/components/studio/StudioUpgradePrompt';
import { isStudioGated } from '@/lib/billing/studio-gate';

/** /studio — the Operations Studio (ST1: */
export const metadata = { title: 'Operations Studio' };

export default async function StudioPage() {
  const user = await requirePermission('studio.view');
  if (await isStudioGated(user.organizationId)) {
    return <StudioUpgradePrompt />;
  }
  return <StudioShell />;
}
