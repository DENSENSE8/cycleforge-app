import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { unwrapScannedSerial } from '@/lib/barcode-routing';
import { createPrepackUnit, loadPrepackUnit } from '@/lib/prepack/server';
import type { PrepackUnitLookup } from '@/lib/prepack/types';

/**
 * Resolve an OEM serial, unit label or GS1 (01)/(21) scan. A serial CycleForge
 * has never seen is not an error: it answers `newSerial` and the form creates
 * it when the operator adds it to a package (POST).
 */
export const GET = withAuth(async (request: NextRequest, ctx) => {
  const scan = request.nextUrl.searchParams.get('scan')?.trim() ?? '';
  if (!scan || scan.length > 512) {
    return NextResponse.json({ success: false, error: 'Type or scan a serial number.' }, { status: 400 });
  }
  const unit = await loadPrepackUnit(ctx.organizationId, scan);
  const lookup: PrepackUnitLookup = unit
    ? { unit, newSerial: null }
    : { unit: null, newSerial: unwrapScannedSerial(scan) };
  return NextResponse.json({ success: true, ...lookup });
}, { permission: 'tech.scan_serial' });

const CreateBody = z.object({
  serial: z.string().trim().min(1).max(200),
  skuCatalogId: z.number().int().positive().nullable().optional(),
});

/** Find-or-create the unit for a serial added to a package (never seen at Unbox is fine). */
export const POST = withAuth(async (request: NextRequest, ctx) => {
  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Type or scan a serial number.' }, { status: 400 });
  }
  const unit = await createPrepackUnit(ctx.organizationId, {
    serial: parsed.data.serial,
    skuCatalogId: parsed.data.skuCatalogId ?? null,
    actorStaffId: ctx.staffId ?? null,
  });
  if (!unit) {
    return NextResponse.json({ success: false, error: 'That serial number is empty — type it again.' }, { status: 400 });
  }
  return NextResponse.json({ success: true, unit });
}, { permission: 'tech.scan_serial' });
