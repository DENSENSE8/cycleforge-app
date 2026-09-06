import { NextRequest, NextResponse } from 'next/server';
import { upsertProductManual } from '@/lib/product-manuals';
import { assertSafeExternalUrl } from '@/lib/security/safe-external-url';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';

async function handlePost(request: NextRequest, ctx: AuthContext) {
  try {
    const body = await request.json();

    // `sourceUrl` becomes a server-side fetch target and a 302 sink in
    // /api/product-manuals/[id]/content — reject SSRF/open-redirect targets
    // here so the caller gets a clean 400 instead of a generic 500.
    // (`upsertProductManual` re-asserts this; this is the explicit surface.)
    const sourceUrlRaw = String(body?.sourceUrl || body?.source_url || '').trim();
    if (sourceUrlRaw) assertSafeExternalUrl(sourceUrlRaw);

    // Thread orgId so the upsert GUC-wraps the write, scopes the existing-row
    // lookup to this org's sku_catalog children, and resolves sku_catalog_id
    // within this org (no cross-tenant catalog linkage).
    const orgId = ctx.organizationId ?? undefined;
    const manual = await upsertProductManual({
      itemNumber: String(body?.itemNumber || body?.item_number || ''),
      productTitle: String(body?.productTitle || body?.product_title || ''),
      displayName: String(body?.displayName || body?.display_name || ''),
      googleDocIdOrUrl: String(body?.googleDocId || body?.google_file_id || body?.googleLinkOrFileId || ''),
      sourceUrl: String(body?.sourceUrl || body?.source_url || ''),
      relativePath: String(body?.relativePath || body?.relative_path || ''),
      folderPath: String(body?.folderPath || body?.folder_path || ''),
      fileName: String(body?.fileName || body?.file_name || ''),
      status: body?.status,
      assignedBy: String(body?.assignedBy || body?.assigned_by || ''),
      type: body?.type,
    }, orgId);

    return NextResponse.json({ success: true, manual }, { status: 201 });
  } catch (error: any) {
    const message = error?.message || 'Failed to upsert product manual';
    const status = /required|valid/i.test(message) ? 400 : 500;

    console.error('Error upserting product manual:', error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export const POST = withAuth(handlePost, { permission: 'product_manuals.manage' });
