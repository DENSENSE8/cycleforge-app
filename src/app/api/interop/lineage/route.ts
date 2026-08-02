/**
 * GET /api/interop/lineage — the station procedures as OpenLineage facets.
 *
 * READ-ONLY and tenant-independent: this projects the product's own DECLARED
 * table lineage (`ProcedureStep.reads` / `.writes`), which is the same for
 * every org and touches no tenant rows. It is still gated on `interop.read`
 * because it discloses this product's internal relation names and which
 * endpoint writes what — a schema map is not customer data, but it is not
 * public either.
 *
 * Table-level only. See `@/lib/interop/lineage-facets` for why that is a
 * decision rather than a limitation.
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { lineageDocument } from '@/lib/interop/lineage-facets';
import { listProcedures } from '@/lib/stations/procedure';
import { registerStationBuiltins } from '@/lib/stations/index';

export const GET = withAuth(
  async () => {
    // The registry is populated by an explicit registrar, not by import side
    // effects, so a cold lambda must register before reading. Idempotent.
    registerStationBuiltins();

    return NextResponse.json(lineageDocument(listProcedures()));
  },
  { permission: 'interop.read' },
);
