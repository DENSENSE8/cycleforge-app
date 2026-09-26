import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  repairPrintLogEntry,
  type RepairPrintAuditRow,
  type RepairPrintLog,
  type RepairPrintLogEntry,
} from '@/lib/repair/repair-print-log';
import { PRINT_STATION_NAME_MAX } from '@/lib/print/print-station';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

/** /api/repair-service/[id]/print-log — the repair's print history. */

async function repairIdFrom(params: Promise<{ id: string }>): Promise<number | null> {
  const { id } = await params;
  const repairId = Number(id);
  return Number.isInteger(repairId) && repairId > 0 ? repairId : null;
}

async function labelPrintedAt(orgId: OrgId, repairId: number): Promise<{ found: boolean; at: string | null }> {
  const res = await tenantQuery<{ label_printed_at: string | Date | null }>(
    orgId,
    `SELECT label_printed_at FROM repair_service WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [repairId, orgId],
  );
  const row = res.rows[0];
  if (!row) return { found: false, at: null };
  const at = row.label_printed_at;
  return { found: true, at: at instanceof Date ? at.toISOString() : at ?? null };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRoutePerm(request, 'repair.view');
  if (gate.denied) return gate.denied;
  const orgId = gate.ctx.organizationId as OrgId;
  const repairId = await repairIdFrom(params);
  if (repairId == null) {
    return NextResponse.json({ error: 'Valid repair id is required' }, { status: 400 });
  }

  try {
    const repair = await labelPrintedAt(orgId, repairId);
    if (!repair.found) return NextResponse.json({ error: 'Repair not found' }, { status: 404 });

    const rows = await tenantQuery<RepairPrintAuditRow>(
      orgId,
      `SELECT a.id, a.created_at, a.action, a.metadata, s.name AS actor_name
         FROM audit_logs a
         LEFT JOIN staff s ON s.id = a.actor_staff_id AND s.organization_id = a.organization_id
        WHERE a.organization_id = $1
          AND (
            (a.entity_type = $3 AND a.entity_id = $2::text
              AND a.action IN ($4, $5, $6))
            OR (a.entity_type = 'counter_transaction' AND a.action = $6
              AND a.metadata->>'kind' = 'label' AND a.metadata->>'repair_id' = $2::text)
          )
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 50`,
      [
        orgId,
        String(repairId),
        AUDIT_ENTITY.REPAIR_SERVICE,
        AUDIT_ACTION.REPAIR_SERVICE_LABEL_PRINTED,
        AUDIT_ACTION.REPAIR_SERVICE_DOCUMENT_PRINTED,
        AUDIT_ACTION.KIOSK_VISIT_PRINT,
      ],
    );
    const entries = rows.rows
      .map(repairPrintLogEntry)
      .filter((entry): entry is RepairPrintLogEntry => entry != null);
    const body: RepairPrintLog = { labelPrintedAt: repair.at, entries };
    return NextResponse.json(body);
  } catch (err: unknown) {
    console.error('[repair-service/[id]/print-log GET] error:', err);
    return NextResponse.json({ error: 'Failed to read print log' }, { status: 500 });
  }
}

const RecordBody = z.object({
  document: z.enum(['receipt', 'manual']),
  manualId: z.number().int().positive().optional(),
  requestId: z.string().trim().min(1).max(100),
  stationName: z.string().trim().max(PRINT_STATION_NAME_MAX).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRoutePerm(request, 'repair.view');
  if (gate.denied) return gate.denied;
  const orgId = gate.ctx.organizationId as OrgId;
  const repairId = await repairIdFrom(params);
  if (repairId == null) {
    return NextResponse.json({ error: 'Valid repair id is required' }, { status: 400 });
  }
  const parsed = RecordBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (parsed.data.document === 'manual') !== (parsed.data.manualId != null)) {
    return NextResponse.json({ error: 'document (+ manualId for a manual) and requestId are required' }, { status: 400 });
  }
  const { document, manualId, requestId, stationName } = parsed.data;

  try {
    const repair = await labelPrintedAt(orgId, repairId);
    if (!repair.found) return NextResponse.json({ error: 'Repair not found' }, { status: 404 });

    const existing = await tenantQuery<{ id: number }>(
      orgId,
      `SELECT id FROM audit_logs
        WHERE organization_id = $1 AND entity_type = $2 AND entity_id = $3
          AND action = $4 AND metadata->>'request_id' = $5
        LIMIT 1`,
      [orgId, AUDIT_ENTITY.REPAIR_SERVICE, String(repairId), AUDIT_ACTION.REPAIR_SERVICE_DOCUMENT_PRINTED, requestId],
    );
    if (existing.rows[0]) return NextResponse.json({ success: true, recorded: false });

    await recordAudit(pool, gate.ctx, request, {
      source: 'repair-service-print-log',
      action: AUDIT_ACTION.REPAIR_SERVICE_DOCUMENT_PRINTED,
      entityType: AUDIT_ENTITY.REPAIR_SERVICE,
      entityId: repairId,
      extra: {
        document,
        via: 'station',
        request_id: requestId,
        ...(manualId ? { manual_id: manualId } : {}),
        ...(stationName ? { station_name: stationName } : {}),
      },
    });
    return NextResponse.json({ success: true, recorded: true });
  } catch (err: unknown) {
    console.error('[repair-service/[id]/print-log POST] error:', err);
    return NextResponse.json({ error: 'Failed to record print' }, { status: 500 });
  }
}
