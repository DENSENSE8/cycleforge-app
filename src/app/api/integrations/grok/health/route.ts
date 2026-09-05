import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { grokValidate } from '@/lib/integrations/connectors/grok';

export const dynamic = 'force-dynamic';

/**
 * GET /api/integrations/grok/health
 *
 * Live-checks the stored SuperGrok session against the CLI chat proxy.
 */
export const GET = withAuth(async (_req, ctx) => {
  const result = await grokValidate(ctx.organizationId);
  return NextResponse.json(result, { status: 200 });
}, { permission: 'admin.manage_features' });
