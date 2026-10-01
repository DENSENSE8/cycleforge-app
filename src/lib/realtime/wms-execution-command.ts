import { z } from 'zod';
import {
  completeSession,
  confirmPick,
  recordShortPick,
  type ConfirmPickResult,
  type RecordShortPickResult,
  type ShortPickReason,
} from '@/lib/picking/sessions';
import type { OrgId } from '@/lib/tenancy/constants';
import { executeWmsPutawayAdjust } from '@/lib/realtime/wms-putaway-adjust';
import { executeWmsPackVerification } from '@/lib/realtime/wms-pack-verification';
import { verifyLocationScanProof } from '@/lib/inventory/location-scan-proof';

const CommandBaseSchema = z.object({
  v: z.literal(1),
  commandId: z.string().min(1).max(200),
  // `guid()`, not `uuid()`: the seeded tenants (`…0001` dogfood, `…0002` QA)
  // carry no RFC version nibble, and the identity check below is the authority.
  organizationId: z.guid(),
  staffId: z.number().int().positive(),
  issuedAt: z.string().datetime({ offset: true }),
});

const PickConfirmCommandSchema = CommandBaseSchema.extend({
  name: z.literal('pick.confirm'),
  input: z.object({
    sessionId: z.number().int().positive(),
    allocationId: z.number().int().positive(),
    toteScan: z.string().trim().min(1).max(200),
    completeSession: z.boolean().default(false),
  }).strict(),
}).strict();

const PickShortCommandSchema = CommandBaseSchema.extend({
  name: z.literal('pick.short'),
  input: z.object({
    sessionId: z.number().int().positive(),
    allocationId: z.number().int().positive(),
    pickedQty: z.number().int().nonnegative(),
    plannedQty: z.number().int().positive(),
    reason: z.enum([
      'NOT_FOUND_IN_BIN',
      'DAMAGED',
      'WRONG_CONDITION',
      'MISLABELED',
      'INSUFFICIENT_STOCK',
      'OTHER',
    ]),
    note: z.string().max(2_000).default(''),
  }).strict().superRefine((input, ctx) => {
    if (input.pickedQty >= input.plannedQty) {
      ctx.addIssue({ code: 'custom', message: 'pickedQty must be less than plannedQty' });
    }
    if (input.reason === 'OTHER' && input.note.trim().length === 0) {
      ctx.addIssue({ code: 'custom', message: 'reason OTHER requires a note' });
    }
  }),
}).strict();

const PutawayAdjustCommandSchema = CommandBaseSchema.extend({
  name: z.literal('putaway.adjust'),
  input: z.object({
    barcode: z.string().trim().min(1).max(200),
    sku: z.string().trim().min(1).max(300),
    direction: z.enum(['put', 'take']),
    qty: z.number().int().positive().max(100_000),
    reason: z.string().trim().min(1).max(200),
    reasonCodeId: z.number().int().positive().nullable().default(null),
    notes: z.string().trim().max(2_000).nullable().default(null),
    locationVerificationToken: z.string().min(20).max(4_000),
  }).strict(),
}).strict();

const PackVerifyCommandSchema = CommandBaseSchema.extend({
  name: z.literal('pack.verify'),
  input: z.object({
    packerLogId: z.number().int().positive(),
    outcome: z.enum(['VERIFIED', 'ERROR_MISSING_TRACKING', 'ERROR_OCR_FAILED']),
    detectedTracking: z.string().trim().min(1).max(200).nullable(),
    detectedOrderId: z.string().trim().min(1).max(200).nullable(),
    ocrConfidence: z.number().min(0).max(1).nullable(),
    meta: z.record(z.string(), z.unknown()).nullable(),
  }).strict(),
}).strict();

const WmsExecutionCommandSchema = z.discriminatedUnion('name', [
  PickConfirmCommandSchema,
  PickShortCommandSchema,
  PutawayAdjustCommandSchema,
  PackVerifyCommandSchema,
]);

export const WmsExecutionCommandReceiptSchema = z.object({
  commandId: z.string().min(1),
  name: z.enum(['pick.confirm', 'pick.short', 'putaway.adjust', 'pack.verify']),
  status: z.enum(['committed', 'replayed']),
  completedAt: z.string().datetime({ offset: true }),
  data: z.record(z.string(), z.unknown()),
}).strict();

export type WmsExecutionCommandReceipt = z.infer<typeof WmsExecutionCommandReceiptSchema>;

type CommandDeps = {
  confirmPick: typeof confirmPick;
  recordShortPick: typeof recordShortPick;
  completeSession: typeof completeSession;
  executePutawayAdjust: typeof executeWmsPutawayAdjust;
  executePackVerification: typeof executeWmsPackVerification;
};

const defaultDeps: CommandDeps = {
  confirmPick,
  recordShortPick,
  completeSession,
  executePutawayAdjust: executeWmsPutawayAdjust,
  executePackVerification: executeWmsPackVerification,
};

function assertOk(
  result: ConfirmPickResult | RecordShortPickResult | Awaited<ReturnType<typeof completeSession>>,
): asserts result is Extract<typeof result, { ok: true }> {
  if (!result.ok) throw new Error(result.error);
}

/**
 * The authenticated socket identity is the authority. Command identity fields
 * are repeated on the wire only so cross-tenant or cross-staff substitution is
 * rejected before a domain function receives input.
 */
export async function executeWmsExecutionCommand(
  raw: unknown,
  identity: { organizationId: string; staffId: number },
  deps: CommandDeps = defaultDeps,
): Promise<WmsExecutionCommandReceipt> {
  const command = WmsExecutionCommandSchema.parse(raw);
  if (
    command.organizationId !== identity.organizationId
    || command.staffId !== identity.staffId
  ) {
    throw new Error('Authenticated identity does not match WMS command.');
  }
  const orgId = identity.organizationId as OrgId;
  const clientEventId = `wms:${command.commandId}`;

  if (command.name === 'putaway.adjust') {
    verifyLocationScanProof(command.input.locationVerificationToken, {
      organizationId: identity.organizationId,
      staffId: identity.staffId,
      locationCode: command.input.barcode,
    });
    const adjusted = await deps.executePutawayAdjust({
      commandId: command.commandId,
      organizationId: identity.organizationId,
      staffId: identity.staffId,
      barcode: command.input.barcode,
      sku: command.input.sku,
      direction: command.input.direction,
      qty: command.input.qty,
      reason: command.input.reason,
      reasonCodeId: command.input.reasonCodeId,
      notes: command.input.notes,
    });
    return WmsExecutionCommandReceiptSchema.parse({
      commandId: command.commandId,
      name: command.name,
      status: adjusted.replayed ? 'replayed' : 'committed',
      completedAt: new Date().toISOString(),
      data: adjusted.data,
    });
  }

  if (command.name === 'pack.verify') {
    const verified = await deps.executePackVerification({
      commandId: command.commandId,
      organizationId: identity.organizationId,
      staffId: identity.staffId,
      ...command.input,
    });
    return WmsExecutionCommandReceiptSchema.parse({
      commandId: command.commandId,
      name: command.name,
      status: verified.replayed ? 'replayed' : 'committed',
      completedAt: new Date().toISOString(),
      data: verified.data,
    });
  }

  if (command.name === 'pick.confirm') {
    const picked = await deps.confirmPick({
      sessionId: command.input.sessionId,
      allocationId: command.input.allocationId,
      actorStaffId: identity.staffId,
      clientEventId,
      toteScan: command.input.toteScan,
    }, orgId);
    assertOk(picked);

    let stagedTotes: string[] = [];
    if (command.input.completeSession) {
      const completed = await deps.completeSession({
        sessionId: command.input.sessionId,
        actorStaffId: identity.staffId,
      }, orgId);
      assertOk(completed);
      stagedTotes = completed.stagedTotes;
    }

    return WmsExecutionCommandReceiptSchema.parse({
      commandId: command.commandId,
      name: command.name,
      status: 'committed',
      completedAt: new Date().toISOString(),
      data: { ...picked, stagedTotes },
    });
  }

  const short = await deps.recordShortPick({
    sessionId: command.input.sessionId,
    allocationId: command.input.allocationId,
    pickedQty: command.input.pickedQty,
    plannedQty: command.input.plannedQty,
    reason: command.input.reason as ShortPickReason,
    note: command.input.note.trim(),
    actorStaffId: identity.staffId,
    clientEventId,
  }, orgId);
  assertOk(short);
  return WmsExecutionCommandReceiptSchema.parse({
    commandId: command.commandId,
    name: command.name,
    status: 'committed',
    completedAt: new Date().toISOString(),
    data: short,
  });
}
