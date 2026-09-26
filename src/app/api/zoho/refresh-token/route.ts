import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/zoho';
import { withAuth } from '@/lib/auth/withAuth';

export const dynamic = 'force-dynamic';

/** GET /api/zoho/refresh-token */
export const GET = withAuth(async (request: NextRequest) => {
  const authorizeUrl = new URL('/api/zoho/oauth/authorize', request.url);
  return NextResponse.redirect(authorizeUrl);
}, { permission: 'integrations.zoho' });

/** POST /api/zoho/refresh-token */
export const POST = withAuth(async (request: NextRequest, ctx) => {
  try {
    const token = await getAccessToken(ctx.organizationId);
    return NextResponse.json({
      success: true,
      message: 'Zoho access token refreshed successfully.',
      note:
        'Zoho does not return a new refresh_token on refresh_token grants. Use GET /api/zoho/refresh-token to start a new consent flow if you need one stored.',
      authorize_path: new URL('/api/zoho/refresh-token', request.url).pathname,
      access_token_preview: token ? `${token.slice(0, 6)}...` : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to refresh Zoho token';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}, { permission: 'integrations.zoho' });
