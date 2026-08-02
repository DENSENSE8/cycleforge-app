import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { resolveOrgGs1Identity } from '@/lib/interop/org-gs1';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The tenant's RESOLVED GS1 identity, for the browser.
 *
 * Exists so the warehouse label printers can stop keeping their own copy of the
 * GLN in `localStorage` (see docs/todo/gs1-compliance-onboarding-PLAN.md → P4).
 * That copy was a second source of truth for a per-tenant fact and silently
 * disagreed with `organizations.settings.gs1.gln` — the value everything else,
 * including the print ladder, reads.
 *
 * Two deliberate differences from the admin settings route:
 *
 *  - **Gated by `print.label`, not `admin.view`.** The operator printing bin
 *    stickers is not an admin, and a read they cannot perform is a read that
 *    would send them straight back to a local override. It discloses nothing an
 *    admin needs to protect: a GLN is a *public* identifier, printed on every
 *    label and resolvable by anyone who scans one.
 *  - **RESOLVED, not raw.** `/api/admin/organization/settings` returns the
 *    digits as typed so an admin can edit them; a consumer must get what the
 *    product will actually use, so this goes through `resolveOrgGs1Identity` —
 *    placeholder prefixes and wrong-length GLNs come back absent, exactly as
 *    `encodePrintMatrix` will see them.
 *
 * GET → { gln, companyPrefix }  ('' = this tenant holds none — the common case)
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const identity = await resolveOrgGs1Identity(ctx.organizationId);
  return NextResponse.json({
    gln: identity.gln ?? '',
    companyPrefix: identity.companyPrefix ?? '',
  });
}, { permission: 'print.label' });
