import { z } from 'zod';

const qaHealthProviderSchema = z.enum(['amazon', 'ebay', 'zoho', 'google_drive', 'nextiva']);
const qaReplayEventTypeSchema = z.enum([
  'purchaseorder.created',
  'purchaseorder.updated',
  'purchaseorder.deleted',
  'purchasereceive.created',
  'purchasereceive.deleted',
]);

export const QaRunCreateBody = z
  .object({
    action: z.enum(['health_check', 'fixture_reseed', 'webhook_replay']),
    scenario: z.string().trim().min(1).max(120),
    provider: qaHealthProviderSchema.optional(),
    replay: z.object({
      eventId: z.string().trim().regex(/^qa_replay_[A-Za-z0-9_-]{1,80}$/),
      eventType: qaReplayEventTypeSchema,
      objectId: z.string().trim().min(1).max(120),
    }).strict().optional(),
  })
  .strict();

export const QaFixtureResetBody = z
  .object({
    scenario: z.string().trim().min(1).max(120).default('all-fixtures'),
  })
  .strict();
