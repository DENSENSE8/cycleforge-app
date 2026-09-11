/**
 * Org-scoped `identification.completed` fire. Empty then-actions skip via
 * selectActionsForTrigger; the trigger must still exist for P3 subscribers.
 *
 * Default deps lazy-import applyListingAssignment so unit tests stay DB-free.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { shouldEmitIdentificationCompleted } from '@/lib/identification/completed';
import type { IdentificationResult } from '@/lib/identification/types';
import type { ListingAutomationFacts } from '@/lib/automations/listing-match';

type ApplyListingAssignmentResult = {
  status: 'applied' | 'skipped' | 'failed';
  ruleId: number | null;
  actionsApplied: unknown[];
  reason?: string;
  error?: string;
};

export type EmitIdentificationCompletedArgs = {
  organizationId: string;
  result: IdentificationResult;
  actorStaffId?: number | null;
};

export type EmitIdentificationCompletedDeps = {
  loadFacts: (
    organizationId: OrgId,
    orderId: number,
  ) => Promise<ListingAutomationFacts | null>;
  apply: (input: {
    organizationId: OrgId;
    orderId: number;
    triggerKey: 'identification.completed';
    facts: ListingAutomationFacts;
    actorStaffId?: number | null;
  }) => Promise<ApplyListingAssignmentResult>;
};

async function defaultDeps(): Promise<EmitIdentificationCompletedDeps> {
  const { applyListingAssignment, loadOrderListingFacts } = await import(
    '@/lib/automations/apply-listing-assignment'
  );
  return {
    loadFacts: loadOrderListingFacts,
    apply: (input) => applyListingAssignment(input),
  };
}

export type EmitIdentificationCompletedStatus = 'emitted' | 'skipped';

export async function emitIdentificationCompleted(
  args: EmitIdentificationCompletedArgs,
  deps?: EmitIdentificationCompletedDeps,
): Promise<EmitIdentificationCompletedStatus> {
  const organizationId = String(args.organizationId ?? '').trim();
  if (!organizationId) return 'skipped';
  if (organizationId !== args.result.organizationId) return 'skipped';
  if (!shouldEmitIdentificationCompleted(args.result)) return 'skipped';

  const orderId = Number(args.result.entity.id);
  const resolved = deps ?? (await defaultDeps());
  const facts = await resolved.loadFacts(organizationId as OrgId, orderId);
  if (facts == null) return 'skipped';

  await resolved.apply({
    organizationId: organizationId as OrgId,
    orderId,
    triggerKey: 'identification.completed',
    facts,
    actorStaffId: args.actorStaffId ?? null,
  });
  return 'emitted';
}
