/**
 * GET /api/receiving/unbox-next — arrived, not-yet-opened cartons in the order
 * Unbox should take them: most urgent tier first, shelf by shelf, oldest first
 * within a shelf. `shelvesConfigured: false` is the honest "no urgency shelves
 * configured" state (no active location carries an arrival tier yet).
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { readArrivalShelves, readUnboxNext } from '@/lib/receiving/arrival-shelves';

export const GET = withAuth(
  async (_request, ctx) => {
    const [queue, shelves] = await Promise.all([
      readUnboxNext(ctx.organizationId),
      readArrivalShelves(ctx.organizationId),
    ]);
    return NextResponse.json({
      success: true,
      shelvesConfigured: shelves.shelves.length > 0,
      items: queue.items,
    });
  },
  { permission: 'receiving.view' },
);
