/** POST /api/zoho/fulfillment-sync */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { recordAudit } from '@/lib/audit-logs';
import { isAllowedAdminOrigin } from '@/lib/security/allowed-origin';
import { getSyncCursor } from '@/lib/sync-cursors';
import { syncShippedOrdersToZoho } from '@/lib/zoho/fulfillment-sync';
import { getFulfillmentSyncConfig } from '@/lib/zoho/fulfillment-config';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { getInventoryProvider } from '@/lib/integrations/inventory';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const bodySchema = z
  .object({
    reference: z.string().trim().min(1).optional(),
    dryRun: z.boolean().optional(),
    force: z.boolean().optional(),
    limit: z.number().int().positive().max(1000).optional(),
    mode: z.enum(['delta', 'full']).optional(),
  })
  .strict();

export const POST = withAuth(
  async (request: NextRequest, ctx) => {
    if (!isAllowedAdminOrigin(request)) {
      return NextResponse.json({ success: false, error: 'Origin not allowed' }, { status: 403 });
    }

    // Soft-disable: no inventory integration connected → a clean, typed
    // response the UI can teach from, instead of the sync failing deep
    // inside the Zoho client with an opaque 500.
    const inventory = await getInventoryProvider(ctx.organizationId);
    if (!inventory) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          error: 'INVENTORY_NOT_CONNECTED',
          message: 'No inventory integration is connected for this workspace. Connect one in Settings → Integrations.',
        },
        { status: 503 },
      );
    }

    try {
      const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: 'Invalid request body', issues: parsed.error.flatten() },
          { status: 400 }
        );
      }
      const body = parsed.data;

      // Default to dry-run from the UI unless explicitly disabled.
      const dryRun = body.dryRun !== false;
      const mode = body.mode === 'full' ? 'full' : 'delta';
      const config = getFulfillmentSyncConfig();

      let since: Date | null = null;
      if (mode === 'delta' && !body.reference) {
        const cursor = await getSyncCursor('zoho_fulfillment_sync', ctx.organizationId);
        since = cursor ?? new Date(Date.now() - config.bootstrapLookbackDays * 24 * 60 * 60 * 1000);
      }

      const report = await syncShippedOrdersToZoho({
        since,
        dryRun,
        force: body.force === true,
        limit: body.limit,
        referenceNumber: body.reference?.trim() || undefined,
        orgId: ctx.organizationId,
      });

      // Record an audit entry for live (non-dry-run) runs — these create Zoho
      // sales orders / packages / invoices, so we capture who initiated them.
      if (!report.dryRun) {
        // Scope the audit_logs INSERT under the same authenticated tenant used
        // for the fulfillment read and provider writes.
        const orgId: OrgId = ctx.organizationId;
        await withTenantTransaction(orgId, (client) =>
          recordAudit(client, ctx, request, {
            source: 'zoho-fulfillment-sync-manual',
            action: 'zoho_fulfillment_sync.run',
            entityType: 'zoho_fulfillment_sync',
            entityId: body.reference?.trim() || 'batch',
            method: 'manual',
            extra: {
              mode,
              invoiceMode: report.invoiceMode,
              scanned: report.scanned,
              completed: report.completed,
              skipped: report.skipped,
              errored: report.errored,
            },
          })
        );
      }

      return NextResponse.json({ success: true, report });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fulfillment sync failed';
      console.error('[zoho/fulfillment-sync]', error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { permission: 'integrations.zoho' }
);
