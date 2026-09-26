/** POST /api/receiving-lines/incoming/match-email — incoming-todo Phase 4a. */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { withTenantTransaction, tenantQuery } from '@/lib/tenancy/db';
import { ApiError, errorResponse } from '@/lib/api';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';

export const dynamic = 'force-dynamic';

const Body = z.object({
  // email_missing_purchase_orders.id is a UUID — validate here so a malformed
  // id is a clean 400, not a PG uuid-cast error surfacing as a 500.
  emailId: z.string().trim().uuid(),
  poNumber: z.string().trim().min(1).max(120),
});

/** Same normalization as zoho_po_mirror.zoho_purchaseorder_number_norm. */
function normalizePoNumber(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

interface MirrorPo {
  zoho_purchaseorder_id: string;
  zoho_purchaseorder_number: string;
}

interface EmailRow {
  id: string;
  pile: string;
  po_numbers: string[] | null;
  zoho_uploaded_po_number: string | null;
  resolved_at: string | null;
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const orgId = ctx.organizationId;
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0]?.message ?? 'invalid body');
    }
    const { emailId, poNumber } = parsed.data;
    const norm = normalizePoNumber(poNumber);
    if (!norm) throw ApiError.badRequest('poNumber must contain letters or digits');

    // The PO must already exist in the local Zoho mirror — this route links,
    // it never creates. Match by PO number (normalized) or reference number.
    const poRes = await tenantQuery<MirrorPo>(
      orgId,
      `SELECT zoho_purchaseorder_id, zoho_purchaseorder_number
         FROM zoho_po_mirror
        WHERE organization_id = $1
          AND (
                zoho_purchaseorder_number_norm = $2
             OR NULLIF(upper(regexp_replace(COALESCE(reference_number, ''), '[^A-Za-z0-9]', '', 'g')), '') = $2
          )
        ORDER BY last_synced_at DESC
        LIMIT 1`,
      [orgId, norm],
    );
    const po = poRes.rows[0];
    if (!po) throw ApiError.notFound('zoho_po_mirror', poNumber);

    const result = await withTenantTransaction(orgId, async (client) => {
      // Lock the email row so a concurrent match/check-off serializes.
      const existing = await client.query<EmailRow>(
        `SELECT id, pile, po_numbers, zoho_uploaded_po_number, resolved_at
           FROM email_missing_purchase_orders
          WHERE id = $1
            AND organization_id = $2
          FOR UPDATE`,
        [emailId, orgId],
      );
      const row = existing.rows[0];
      if (!row) return { kind: 'not_found' as const };

      if (row.pile === 'done') {
        // Already resolved: same PO → idempotent success; different PO → 409.
        const already = normalizePoNumber(row.zoho_uploaded_po_number ?? '');
        if (already && already === norm) return { kind: 'idempotent' as const, row };
        return { kind: 'conflict' as const, row };
      }

      const upd = await client.query<EmailRow>(
        `UPDATE email_missing_purchase_orders
            SET pile = 'done',
                zoho_uploaded_po_number = $3,
                zoho_uploaded_at = COALESCE(zoho_uploaded_at, NOW()),
                resolved_at = COALESCE(resolved_at, NOW())
          WHERE id = $1
            AND organization_id = $2
          RETURNING id, pile, po_numbers, zoho_uploaded_po_number, resolved_at`,
        [emailId, orgId, po.zoho_purchaseorder_number],
      );

      await recordAudit(client, ctx, req, {
        source: 'receiving.incoming.match-email',
        action: AUDIT_ACTION.RECEIVING_EMAIL_MATCHED,
        entityType: AUDIT_ENTITY.EMAIL_MISSING_PO,
        entityId: emailId,
        extra: {
          poNumber: po.zoho_purchaseorder_number,
          zohoPurchaseOrderId: po.zoho_purchaseorder_id,
        },
      });

      return { kind: 'matched' as const, row: upd.rows[0] };
    });

    if (result.kind === 'not_found') {
      throw ApiError.notFound('email_missing_purchase_orders', emailId);
    }
    if (result.kind === 'conflict') {
      return NextResponse.json(
        {
          success: false,
          error: `Email is already matched to PO ${result.row.zoho_uploaded_po_number ?? '(unknown)'} — re-point it from the admin triage UI.`,
        },
        { status: 409 },
      );
    }

    // NOTE (deferred):

    return NextResponse.json({
      success: true,
      matched: result.kind === 'matched',
      idempotent: result.kind === 'idempotent' ? true : undefined,
      po: {
        zoho_purchaseorder_id: po.zoho_purchaseorder_id,
        zoho_purchaseorder_number: po.zoho_purchaseorder_number,
      },
      row: result.row,
    });
  } catch (error) {
    return errorResponse(error, 'POST /api/receiving-lines/incoming/match-email');
  }
}, { permission: 'receiving.match_email' });
