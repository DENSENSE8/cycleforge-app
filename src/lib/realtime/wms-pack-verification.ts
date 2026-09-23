import pool from '@/lib/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { effectivePermissionsForStaff } from '@/lib/auth/role-store';
import { recordPackVerificationEvent } from '@/lib/packing/pack-verification';
import type { PackVerificationOutcome } from '@/lib/packing/pack-verification-outcomes';
import type { OrgId } from '@/lib/tenancy/constants';

export type WmsPackVerificationInput = {
  commandId: string;
  organizationId: string;
  staffId: number;
  packerLogId: number;
  outcome: Extract<
    PackVerificationOutcome,
    'VERIFIED' | 'ERROR_MISSING_TRACKING' | 'ERROR_OCR_FAILED'
  >;
  detectedTracking: string | null;
  detectedOrderId: string | null;
  ocrConfidence: number | null;
  meta: Record<string, unknown> | null;
};

type PackVerificationData = {
  success: true;
  id: number;
  outcome: PackVerificationOutcome;
};

type Deps = {
  assertPermission(staffId: number, organizationId: string): Promise<void>;
  record: typeof recordPackVerificationEvent;
  audit(input: WmsPackVerificationInput, data: PackVerificationData): Promise<void>;
};

const defaultDeps: Deps = {
  async assertPermission(staffId, organizationId) {
    const permissions = await effectivePermissionsForStaff(
      staffId,
      {},
      organizationId as OrgId,
    );
    if (!permissions.has('packing.complete_order')) {
      throw new Error('Permission denied: packing.complete_order is required.');
    }
  },
  record: recordPackVerificationEvent,
  async audit(input, data) {
    await recordAudit(pool, null, null, {
      source: 'wms-socket',
      action: AUDIT_ACTION.PACK_VERIFICATION,
      entityType: AUDIT_ENTITY.PACKER_LOG,
      entityId: input.packerLogId,
      after: { outcome: data.outcome, detectedTracking: input.detectedTracking },
      actorStaffIdOverride: input.staffId,
      organizationIdOverride: input.organizationId,
      extra: { command_id: input.commandId, verification_id: data.id },
    });
  },
};

/** Socket-owned equivalent of POST /api/packing/verification. The append-only
 * domain writer remains the single state-machine and idempotency authority. */
export async function executeWmsPackVerification(
  input: WmsPackVerificationInput,
  deps: Deps = defaultDeps,
): Promise<{ data: PackVerificationData; replayed: boolean }> {
  await deps.assertPermission(input.staffId, input.organizationId);
  const result = await deps.record({
    organizationId: input.organizationId as OrgId,
    packerLogId: input.packerLogId,
    outcome: input.outcome,
    detectedTracking: input.detectedTracking,
    detectedOrderId: input.detectedOrderId,
    ocrConfidence: input.ocrConfidence,
    verifiedByStaffId: input.staffId,
    clientEventId: input.commandId,
    meta: input.meta,
  });
  if (!result.ok) throw new Error(result.error);
  const data: PackVerificationData = {
    success: true,
    id: result.id,
    outcome: result.outcome,
  };
  if (!result.duplicate) await deps.audit(input, data);
  return { data, replayed: result.duplicate };
}
