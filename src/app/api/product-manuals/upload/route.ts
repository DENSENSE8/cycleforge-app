import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { ManualFileError } from '@/lib/manuals/manual-file-store';
import { uploadProductManual } from '@/lib/manuals/manual-upload';

// LibreOffice conversion runs in a Vercel Sandbox and can take several
// seconds (longer on a cold sandbox), so we need Node + a generous ceiling.
export const runtime = 'nodejs';
export const maxDuration = 120;

/** POST /api/product-manuals/upload */
export const POST = withAuth(
  async (request, ctx) => {
    // The by-id replace read (ownership gate) and the upsert/update writes all
    // GUC-wrap and scope to this org.
    const orgId = ctx.organizationId;
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ success: false, error: 'multipart body required' }, { status: 400 });
    }

    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'file is required' }, { status: 400 });
    }
    // Optional companion thumbnail — generated client-side from page 1 of the PDF so the sidebar can render visual cards.
    const thumbnail = form.get('thumbnail');
    const idRaw = form.get('id');
    const id = idRaw != null && idRaw !== '' ? Number(idRaw) : null;
    if (idRaw != null && idRaw !== '' && (!Number.isFinite(id) || id! <= 0)) {
      return NextResponse.json({ success: false, error: 'invalid id' }, { status: 400 });
    }
    const statusRaw = String(form.get('status') || '').trim();

    try {
      const { manual, blobUrl } = await uploadProductManual(orgId, {
        file,
        thumbnail: thumbnail instanceof File ? thumbnail : null,
        replaceId: id,
        folderPath: String(form.get('folderPath') || ''),
        displayName: String(form.get('displayName') || ''),
        type: String(form.get('type') || ''),
        sku: String(form.get('sku') || ''),
        itemNumber: String(form.get('itemNumber') || ''),
        status: statusRaw === 'assigned' || statusRaw === 'archived' ? statusRaw : 'unassigned',
      });
      return NextResponse.json({ success: true, manual, blobUrl });
    } catch (err: unknown) {
      if (err instanceof ManualFileError) {
        return NextResponse.json({ success: false, error: err.message }, { status: err.status });
      }
      const message = err instanceof Error ? err.message : 'upload failed';
      console.error('[product-manuals/upload] error:', err);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { permission: 'product_manuals.manage' },
);
