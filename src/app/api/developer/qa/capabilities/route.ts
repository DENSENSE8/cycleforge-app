import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { loadQaCapability } from '@/lib/qa/assert-capability';

/**
 * GET /api/developer/qa/capabilities — whether this session may use the QA Console.
 * Authenticated; returns allowed:false for customer orgs rather than 404 so the
 * client can hide chrome. Mutations still 404 customer orgs.
 */
export const GET = withAuth(async (_req, ctx) => {
  const cap = await loadQaCapability(ctx.organizationId, ctx.permissions, 'developer.qa_tools.view');
  return NextResponse.json({
    success: true,
    allowed: cap.allowed,
    reason: cap.reason,
    environment: cap.environment,
    permissions: cap.permissions,
  });
});
