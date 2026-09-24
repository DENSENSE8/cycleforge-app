import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import type { OrgId } from '@/lib/tenancy/constants';
import { readOutboundDocumentBytes } from '@/lib/documents/read-bytes';
import { readManualFilesForZip } from '@/lib/manuals/order-manuals';
import { buildStoreZip, type StoreZipEntry } from '@/lib/zip/store-zip';
import {
  safeZipDownloadBasename,
  safeZipEntryName,
  uniquifyZipEntryNames,
  zipAttachmentHeaders,
} from '@/lib/zip/safe-entry-name';

export const dynamic = 'force-dynamic';

const MAX_ZIP_ENTRIES = 50;

function parseIdList(raw: string | null): number[] {
  const ids = (raw?.trim() ?? '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isFinite(id) && id > 0);
  return [...new Set(ids)];
}

/**
 * GET /api/documents/download-zip?ids=1,2&manualIds=3,4&title=…
 *
 * One ZIP of outbound documents (`ids`, entries `NN_<filename>`) plus SKU
 * manuals (`manualIds`, entries `manual_<name>.pdf`). Combined cap of 50.
 */
export async function GET(request: NextRequest) {
  const gate = await requireRoutePerm(request, 'orders.view');
  if (gate.denied) return gate.denied;

  const documentIds = parseIdList(request.nextUrl.searchParams.get('ids'));
  const manualIds = parseIdList(request.nextUrl.searchParams.get('manualIds'));

  if (documentIds.length === 0 && manualIds.length === 0) {
    return NextResponse.json({ error: 'At least one document or manual id is required' }, { status: 400 });
  }
  if (documentIds.length + manualIds.length > MAX_ZIP_ENTRIES) {
    return NextResponse.json({ error: `Maximum ${MAX_ZIP_ENTRIES} files per ZIP` }, { status: 400 });
  }

  const orgId = gate.ctx.organizationId as OrgId;
  const title = request.nextUrl.searchParams.get('title')?.trim() || 'outbound-documents';

  const rawEntries: StoreZipEntry[] = [];
  for (let i = 0; i < documentIds.length; i++) {
    const documentId = documentIds[i];
    const file = await readOutboundDocumentBytes(orgId, documentId);
    if (!file) continue;

    const name = `${String(i + 1).padStart(2, '0')}_${safeZipEntryName(file.filename, `document-${documentId}.pdf`)}`;
    rawEntries.push({ name, data: file.bytes });
  }

  for (const manual of await readManualFilesForZip(orgId, manualIds)) {
    const name = `manual_${safeZipEntryName(manual.baseName, `manual-${manual.manualId}.pdf`)}`;
    rawEntries.push({ name, data: manual.bytes });
  }

  if (rawEntries.length === 0) {
    return NextResponse.json({ error: 'No downloadable files found' }, { status: 404 });
  }

  const uniqueNames = uniquifyZipEntryNames(rawEntries.map((e) => e.name));
  const entries = rawEntries.map((entry, i) => ({ ...entry, name: uniqueNames[i] }));
  const blob = buildStoreZip(entries);
  const safeTitle = safeZipDownloadBasename(title, 'outbound-documents');

  return new NextResponse(blob, {
    headers: zipAttachmentHeaders(safeTitle, blob.length),
  });
}
