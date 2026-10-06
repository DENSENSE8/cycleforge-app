import { NextResponse, type NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { unwrapScannedSerial } from '@/lib/barcode-routing';
import { loadPrepackUnit } from '@/lib/prepack/server';
import type { PrepackUnitLookup } from '@/lib/prepack/types';

/**
 * Resolve an OEM serial, unit label or GS1 (01)/(21) scan. A serial CycleForge
 * has never seen is not an error: it answers `newSerial`, and saving the
 * package creates the unit (`POST /api/prepack/package`).
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
