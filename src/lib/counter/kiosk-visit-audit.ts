/** One audit writer for every History act a tablet performs. */

import type { NextRequest } from 'next/server';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { recordAudit, AUDIT_ENTITY } from '@/lib/audit-logs';
import type { KioskAuthContext } from '@/lib/auth/kiosk-context';
import type { OrgId } from '@/lib/tenancy/constants';

export interface KioskVisitAuditArgs {
  action: string;
  /**
   * Which book the row hangs off. History opens counter visits AND standalone
   * repair tickets; a reprint of the latter has no transaction to name, and
   * filing it under one would point the audit trail at another record's id.
   */
  entityType?: string;
  entityId: number;
  /** The PIN-verified staffer, when this act required step-up. */
  actorStaffId?: number | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  extra?: Record<string, unknown>;
}

export async function recordKioskVisitAudit(
  req: Pick<NextRequest, 'headers'>,
  ctx: KioskAuthContext,
  args: KioskVisitAuditArgs,
): Promise<void> {
  try {
    await withTenantTransaction(ctx.organizationId as OrgId, (client) =>
      recordAudit(client, null, req, {
        source: 'kiosk-history',
        action: args.action,
        entityType: args.entityType ?? AUDIT_ENTITY.COUNTER_TRANSACTION,
        entityId: args.entityId,
        organizationIdOverride: ctx.organizationId,
        actorStaffIdOverride: args.actorStaffId ?? null,
        before: args.before ?? null,
        after: args.after ?? null,
        extra: {
          via: `kiosk_device:${ctx.deviceId}`,
          device_label: ctx.deviceLabel,
          principal: 'kiosk',
          stepped_up: args.actorStaffId != null,
          ...(args.extra ?? {}),
        },
      }),
    );
  } catch (err) {
    console.warn('kiosk visit audit skipped:', err);
  }
}
