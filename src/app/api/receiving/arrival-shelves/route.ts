/**
 * GET /api/receiving/arrival-shelves — the org's urgency shelves (active
 * locations with `arrival_priority_tier`), most urgent first, and how many
 * unopened cartons sit on each. None tiered → `shelves: []`.
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { readArrivalShelves } from '@/lib/receiving/arrival-shelves';

export const GET = withAuth(
  async (_request, ctx) => {
    const { shelves } = await readArrivalShelves(ctx.organizationId);
    return NextResponse.json({ success: true, shelves });
  },
  { permission: 'receiving.view' },
);
