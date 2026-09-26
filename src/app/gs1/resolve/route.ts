import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { resolveGs1, type ResolverKind } from '@/lib/gs1/resolver';

/** GET /gs1/resolve?url=<full GS1 Digital Link URL OR bare path> */
const ENTITY_BY_KIND: Partial<Record<ResolverKind, string>> = {
  location: AUDIT_ENTITY.BIN,
  'serial-unit': AUDIT_ENTITY.SERIAL_UNIT,
  sku: AUDIT_ENTITY.SKU,
};

export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const rawUrl = req.nextUrl.searchParams.get('url') ?? '';
    const isInternal = ctx.staffId !== null;
    const result = await resolveGs1(rawUrl, { isInternal, orgId: ctx.organizationId ?? undefined });

    // Audit internal resolutions that actually matched something.
    if (isInternal && result.kind !== 'public' && result.kind !== 'fallback') {
      const entityType = ENTITY_BY_KIND[result.kind];
      if (entityType) {
        await recordAudit(pool, ctx, req, {
          source: 'gs1.resolver',
          action: AUDIT_ACTION.GS1_RESOLVE,
          entityType,
          entityId: String(result.entityId ?? ''),
          method: 'scan',
          after: {
            matched_ai: result.matchedAi,
            kind: result.kind,
            redirect: result.redirect,
            raw_url: rawUrl,
          },
        });
      }
    }

    // `result.redirect` is absolute for the public branch (storefront
    // URL) and relative for the internal branch. Resolve both against
    // the current origin so NextResponse.redirect gets a valid URL.
    const dest = /^https?:\/\//i.test(result.redirect)
      ? result.redirect
      : new URL(result.redirect, req.nextUrl.origin).toString();
    return NextResponse.redirect(dest, 302);
  },
  { allowAnonymous: true },
);
