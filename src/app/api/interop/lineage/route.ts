/** GET /api/interop/lineage — the station procedures as OpenLineage facets. */

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
