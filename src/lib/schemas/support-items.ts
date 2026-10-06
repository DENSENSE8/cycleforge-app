/** Request bodies for /api/support/items/** (the local Support loop). */
import { z } from 'zod';

import { SUPPORT_MESSAGE_BODY_MAX } from '@/lib/support/conversation/ingest-core';
import { CHECK_IN_OUTCOMES, SUPPORT_CHANNELS } from '@/lib/support/conversation/model';

const id = z.number().int().positive().max(2_147_483_647);
const bigId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const instant = z.string().trim().min(1).max(64).refine((s) => Number.isFinite(Date.parse(s)), 'not an instant');
const body = z.string().trim().min(1).max(SUPPORT_MESSAGE_BODY_MAX);
const clientEventId = z.string().trim().min(8).max(128);
const shortText = (max: number) => z.string().trim().max(max);
const reason = z.string().trim().min(1).max(2000);
const purpose = z.enum(['customer_conversation', 'internal_record']);

const orderLink = z.strictObject({
  orderId: id,
  primary: z.boolean().optional(),
  externalReference: shortText(500).nullable().optional(),
});

/**
 * POST /api/support/items — open a Support item (item + first message + thread + task in one transaction).
 * A customer conversation names the org platform (`platforms.id`, optionally one of its
 * `platform_accounts`); the transport is derived from it server-side. An internal record names none.
 */
export const SupportItemCreateSchema = z
  .strictObject({
    purpose,
    platformId: bigId.nullable().optional(),
    platformAccountId: bigId.nullable().optional(),
    subject: shortText(500).nullable().optional(),
    body,
    requester: z
      .strictObject({
        name: shortText(200).nullable().optional(),
        email: z.string().trim().max(320).email().nullable().optional(),
        handle: shortText(200).nullable().optional(),
      })
      .nullable()
      .optional(),
    orderLinks: z.array(orderLink).max(20).optional(),
    assigneeStaffIds: z.array(id).max(20),
    urgency: z.enum(['urgent', 'normal']).optional(),
    deadlineAt: instant.nullable().optional(),
    clientEventId,
  })
  .refine((b) => b.purpose !== 'customer_conversation' || b.platformId != null, {
    message: 'a customer conversation needs its platform',
    path: ['platformId'],
  })
  .refine((b) => b.purpose !== 'internal_record' || (b.platformId == null && b.platformAccountId == null), {
    message: 'an internal record has no platform',
    path: ['platformId'],
  });
export type SupportItemCreateBody = z.infer<typeof SupportItemCreateSchema>;

/** PATCH /api/support/items/[id] — exactly one staff action. */
export const SupportItemPatchSchema = z.union([
  z.strictObject({ purpose }),
  z.strictObject({
    nextStep: z.enum(['waiting_customer', 'follow_up_later']),
    nextFollowUpAt: instant.nullable().optional(),
  }),
  z.strictObject({ lifecycle: z.literal('snoozed'), snoozedUntil: instant }),
  z.strictObject({ lifecycle: z.literal('open') }),
]);
export type SupportItemPatchBody = z.infer<typeof SupportItemPatchSchema>;

/** POST /api/support/items/[id]/messages — a pasted customer message or an internal update. */
export const SupportItemMessageSchema = z.discriminatedUnion('direction', [
  z.strictObject({
    direction: z.literal('inbound'),
    body,
    occurredAt: instant.optional(),
    channel: z.enum(SUPPORT_CHANNELS).optional(),
    externalMessageId: shortText(200).min(1).optional(),
    clientEventId,
  }),
  z.strictObject({ direction: z.literal('internal'), body, clientEventId }),
]);
export type SupportItemMessageBody = z.infer<typeof SupportItemMessageSchema>;

/** PATCH /api/support/items/[id]/messages/[messageId]. */
export const SupportMessagePatchSchema = z.union([
  z.strictObject({ delivery: z.literal('sent') }),
  z.strictObject({ disposition: z.literal('no_reply_required'), reason }),
]);
export type SupportMessagePatchBody = z.infer<typeof SupportMessagePatchSchema>;

/** POST /api/support/items/[id]/replies. */
export const SupportReplySchema = z
  .strictObject({
    action: z.enum(['send', 'copy_open', 'log']),
    body,
    answersMessageIds: z.array(bigId).max(100).optional(),
    draftId: bigId.optional(),
    contactChannel: z.enum(['message', 'call', 'email', 'note']).optional(),
    nextStep: z
      .strictObject({
        kind: z.enum(['waiting_customer', 'follow_up_later', 'resolve']),
        nextFollowUpAt: instant.nullable().optional(),
        resolutionReason: shortText(2000).nullable().optional(),
      })
      .refine((s) => s.kind !== 'follow_up_later' || s.nextFollowUpAt != null, {
        message: 'follow_up_later needs nextFollowUpAt',
        path: ['nextFollowUpAt'],
      })
      .optional(),
    clientEventId,
  });
export type SupportReplyBody = z.infer<typeof SupportReplySchema>;

/** POST /api/support/items/[id]/resolve. Closing a check-in as `resolved` names how it ended. */
export const SupportResolveSchema = z
  .strictObject({
    reason: shortText(2000).nullable().optional(),
    override: z.boolean().optional(),
    checkInDisposition: z.enum(['resolved', 'no_response_closed']).optional(),
    checkInOutcome: z.enum(CHECK_IN_OUTCOMES).optional(),
  })
  .refine((b) => !b.override || (b.reason?.trim().length ?? 0) > 0, { message: 'an override needs a reason', path: ['reason'] })
  .refine((b) => b.checkInDisposition !== 'no_response_closed' || (b.reason?.trim().length ?? 0) > 0, {
    message: 'closing with no response needs a reason',
    path: ['reason'],
  })
  .refine((b) => b.checkInDisposition !== 'resolved' || b.checkInOutcome != null, {
    message: 'closing a check-in as resolved needs its outcome',
    path: ['checkInOutcome'],
  })
  .refine((b) => b.checkInOutcome == null || b.checkInDisposition === 'resolved', {
    message: 'an outcome only closes a check-in as resolved',
    path: ['checkInOutcome'],
  });
export type SupportResolveBody = z.infer<typeof SupportResolveSchema>;
