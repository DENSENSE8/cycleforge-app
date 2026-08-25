/**
 * GET /api/admin/integrations/[provider]/summary
 *
 * Safe connection metadata for the integration detail page — never returns secrets.
 */
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getIntegrationSummary } from '@/lib/integrations/integration-summary';
import type { IntegrationProvider } from '@/lib/integrations/credentials';
import { PROVIDER_CATALOG } from '@/lib/integrations/provider-catalog';

export const GET = withAuth(async (req, ctx) => {
  const segments = req.nextUrl.pathname.split('/').filter(Boolean);
  const provider = segments[segments.indexOf('integrations') + 1] ?? '';
  const scope = req.nextUrl.searchParams.get('scope');

  const known = PROVIDER_CATALOG.some((p) => p.key === provider);
  if (!known) {
    return NextResponse.json({ error: 'UNKNOWN_PROVIDER' }, { status: 404 });
  }

  const summary = await getIntegrationSummary(
    ctx.organizationId,
    provider as IntegrationProvider,
    scope,
  );

  if (!summary) {
    return NextResponse.json({ error: 'UNKNOWN_PROVIDER' }, { status: 404 });
  }

  return NextResponse.json(summary);
}, { permission: 'admin.view' });
