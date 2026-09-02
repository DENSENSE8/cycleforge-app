import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { assertQaCapability } from '@/lib/qa/assert-capability';
import { previewAsRole, QA_PREVIEW_ROLES } from '@/lib/qa/role-preview';

/**
 * GET /api/developer/qa/role-preview?role=receiver
 * Authorization evaluation only. Does not change the session or accept staff_id.
 */
export const GET = withAuth(async (req, ctx) => {
  const gate = await assertQaCapability(ctx.organizationId, ctx.permissions, 'developer.qa_tools.view');
  if ('denied' in gate) return gate.denied;

  const role = new URL(req.url).searchParams.get('role');
  if (!role) {
    return NextResponse.json({ success: true, roles: QA_PREVIEW_ROLES });
  }
  try {
    const preview = await previewAsRole(role);
    return NextResponse.json({ success: true, preview });
  } catch (err) {
    const status = typeof err === 'object' && err && 'status' in err ? Number((err as { status: number }).status) : 500;
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Role preview failed' },
      { status: Number.isFinite(status) && status >= 400 ? status : 500 },
    );
  }
}, { permission: 'developer.qa_tools.view' });
