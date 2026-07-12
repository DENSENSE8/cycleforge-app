import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import * as Y from 'yjs';
import { withAuth } from '@/lib/auth/withAuth';
import { withMasterPlanDoc } from '@/lib/master-plan/server-doc';
import { readMasterPlan } from '@/lib/master-plan/doc';
import { u8ToBase64 } from '@/lib/master-plan/ably-yjs-provider';
import { scanTicketStatuses, rollupTicketStatuses } from '@/lib/master-plan/ticket-status';
import { syncMasterPlanToOpsPlans } from '@/lib/master-plan/ops-plans-bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/forge/master-plan — canonical CRDT snapshot for client bootstrap.
 *
 * Returns the doc state as a base64 Yjs update (clients apply it verbatim so
 * their local doc shares the canonical CRDT identity — re-inserting the text
 * locally would fork it) plus the plain MDX + ticket rollup for non-CRDT
 * consumers (ops-plans table view). The short server session inside
 * withMasterPlanDoc also seeds an empty room from the starter file, so the
 * first-ever viewer sees the canonical starter rather than a blank plan.
 * Read path is Ably-synced, NOT polled from Neon — the CRDT never lives in
 * the ops DB (locked decision).
 */
export const GET = withAuth(async (_req: NextRequest, _ctx) => {
  try {
    const { result, seeded } = await withMasterPlanDoc(_ctx.organizationId, (doc) => ({
      update: u8ToBase64(Y.encodeStateAsUpdate(doc)),
      mdx: readMasterPlan(doc),
    }));
    const tickets = scanTicketStatuses(result.mdx);
    // Self-healing projection: every plan read refreshes the ops-plans tables
    // (idempotent upserts; edits made in Cursor reach staff tables this way).
    if (tickets.length > 0) {
      after(() =>
        syncMasterPlanToOpsPlans(_ctx.organizationId, result.mdx).catch((err) =>
          console.error('[forge/master-plan] ops-plans bridge sync failed:', err),
        ),
      );
    }
    return NextResponse.json({
      success: true,
      update: result.update,
      mdx: result.mdx,
      rollup: rollupTicketStatuses(tickets),
      seeded,
    });
  } catch (error: unknown) {
    console.error('Error in GET /api/forge/master-plan:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load master plan' },
      { status: 500 },
    );
  }
}, { permission: 'operations.plans.view' });
