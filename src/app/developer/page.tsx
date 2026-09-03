/**
 * /developer — QA Console. Sandbox organizations only.
 *
 * Access is authorization (developer.qa_tools.*) plus organizations.environment
 * = sandbox. A customer org never sees this page, even for an admin.
 */

import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/page-guard';
import { loadQaCapability } from '@/lib/qa/assert-capability';
import { QaConsoleClient } from './QaConsoleClient';

export const dynamic = 'force-dynamic';

export default async function DeveloperQaConsolePage() {
  const user = await requirePermission('developer.qa_tools.view');
  const cap = await loadQaCapability(user.organizationId, user.permissions, 'developer.qa_tools.view');
  if (!cap.allowed) redirect('/not-authorized');

  return <QaConsoleClient initialPermissions={cap.permissions} />;
}
