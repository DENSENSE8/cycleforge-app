import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { findQcLabelPrintUnit } from '@/lib/labels/qc-labels-queries';
import { PrepackRefusal, finishPrepackPackage } from '@/lib/prepack/finish';
import { loadPrepackUnit } from '@/lib/prepack/server';
import { PREPACK_CONDITIONS, PREPACK_PROVENANCES, type PrepackUnit } from '@/lib/prepack/types';
import { withTenantTransaction } from '@/lib/tenancy/db';

const FinishBody = z.object({
  serialUnitIds: z.array(z.number().int().positive()).min(1).max(20),
  skuCatalogId: z.number().int().positive(),
  conditionGrade: z.enum(PREPACK_CONDITIONS),
  refurbProvenance: z.enum(PREPACK_PROVENANCES),
  contents: z.array(z.object({
    kitPartId: z.number().int().positive(),
    included: z.boolean(),
  })).max(100),
  clientEventId: z.string().trim().min(8).max(160).optional(),
});

/** POST /api/prepack/package — Finish one package (one or more serials) atomically; the client prints its one label next. */
export async function POST(request: NextRequest) {
  const gate = await requireRoutePerm(request, 'tech.scan_serial');
  if (gate.denied) return gate.denied;
  const parsed = FinishBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Add a serial, choose the product, condition and provenance, and mark every piece — then print again.' },
      { status: 400 },
    );
  }
  const orgId = gate.ctx.organizationId;

  try {
    const finished = await withTenantTransaction(orgId, (db) =>
      finishPrepackPackage(db, orgId, { ...parsed.data, actorStaffId: gate.ctx.staffId ?? null }),
    );
    const units = (await Promise.all(finished.serials.map((serial) => loadPrepackUnit(orgId, serial))))
      .filter((unit): unit is PrepackUnit => unit != null);
    const printUnit = await findQcLabelPrintUnit(orgId, finished.package?.uid ?? finished.serials[0]!);
    if (units.length !== finished.serials.length || !printUnit) {
      throw new PrepackRefusal('Prepack saved, but the package could not be reloaded — refresh and print again.', 500);
    }
    return NextResponse.json({
      success: true,
      units,
      catalog: finished.kit.catalog,
      printUnit,
    });
  } catch (error) {
    if (error instanceof PrepackRefusal) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('[prepack finish] failed', error);
    return NextResponse.json({ success: false, error: 'Could not finish prepack — try Print again.' }, { status: 500 });
  }
}
