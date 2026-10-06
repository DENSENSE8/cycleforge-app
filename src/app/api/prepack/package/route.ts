import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { findQcLabelPrintUnit } from '@/lib/labels/qc-labels-queries';
import type { QcLabelPrintUnit } from '@/lib/labels/qc-label-row';
import { PrepackRefusal, finishPrepackPackages } from '@/lib/prepack/finish';
import { PREPACK_CONDITIONS, PREPACK_PROVENANCES, type PrepackSaveResult } from '@/lib/prepack/types';
import { withTenantTransaction } from '@/lib/tenancy/db';

/** One face field: trimmed text, empty → null (prints the default). */
const faceField = (max: number) =>
  z.string().trim().max(max).nullable().transform((value) => value || null);

const SaveBody = z.object({
  skuCatalogId: z.number().int().positive(),
  packages: z.array(z.object({
    serials: z.array(z.string().trim().min(1).max(200)).max(20),
    condition: z.enum(PREPACK_CONDITIONS),
    provenance: z.enum(PREPACK_PROVENANCES),
    label: z.object({
      title: faceField(120),
      color: faceField(40),
      text: faceField(120),
    }),
  })).min(1).max(50),
  contents: z.array(z.object({
    kitPartId: z.number().int().positive(),
    included: z.boolean(),
  })).max(100),
  clientEventId: z.string().trim().min(8).max(160).optional(),
});

/**
 * POST /api/prepack/package — Save every package of one product atomically
 * (`PrepackSaveInput`); answers one print unit per package, in request order,
 * and the client prints one label per package next.
 */
export async function POST(request: NextRequest) {
  const gate = await requireRoutePerm(request, 'tech.scan_serial');
  if (gate.denied) return gate.denied;
  const parsed = SaveBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Choose the product, give every package a condition and provenance, and mark every piece — then print again.' },
      { status: 400 },
    );
  }
  const orgId = gate.ctx.organizationId;

  try {
    const finished = await withTenantTransaction(orgId, (db) =>
      finishPrepackPackages(db, orgId, { ...parsed.data, actorStaffId: gate.ctx.staffId ?? null }),
    );
    const printUnits = await Promise.all(finished.printKeys.map((key) => findQcLabelPrintUnit(orgId, key)));
    if (printUnits.some((unit) => unit == null)) {
      throw new PrepackRefusal('Prepack saved, but a label could not be reloaded — reprint it under QC labels.', 500);
    }
    const result: PrepackSaveResult = { catalog: finished.kit.catalog, printUnits: printUnits as QcLabelPrintUnit[] };
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof PrepackRefusal) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('[prepack save] failed', error);
    return NextResponse.json({ success: false, error: 'Could not save prepack — try Print again.' }, { status: 500 });
  }
}
