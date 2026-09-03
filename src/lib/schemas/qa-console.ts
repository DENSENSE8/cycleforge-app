import { z } from 'zod';
import { FAILURE_PROFILES } from '@/lib/qa/failure-profiles';

export const QaHealthCheckBody = z.object({
  provider: z.string().min(1).max(64).optional(),
  scope: z.string().max(128).nullable().optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export const QaFixtureResetBody = z.object({
  scope: z.enum(['scenario', 'demo', 'all']).default('demo'),
  scenarioId: z.string().min(1).max(128).optional(),
  /** Preview is the default. Execute requires fixture_reset + step-up. */
  mode: z.enum(['preview', 'execute']).default('preview'),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export const QaFailureInjectionBody = z.object({
  provider: z.string().min(1).max(64),
  scope: z.string().max(128).nullable().optional(),
  profile: z.enum(FAILURE_PROFILES),
  retryAfterSeconds: z.number().int().min(1).max(3600).optional(),
  remainingUses: z.number().int().min(1).max(20).optional(),
  ttlSeconds: z.number().int().min(30).max(3600).optional(),
  notes: z.string().max(280).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export const QaWebhookReplayBody = z.object({
  eventId: z.string().min(1).max(200).optional(),
  kind: z.enum(['application', 'provider_authentic', 'signature_mismatch']).default('application'),
  /** Fresh event_id through processZohoWebhook, including dispatch. */
  mintFreshEventId: z.boolean().optional(),
  fixture: z.enum(['deleted_missing_po']).optional(),
  mode: z.enum(['once', 'twice', 'out_of_order']).default('once'),
  modifyNonSecretFields: z.boolean().optional(),
  /** Application replay is never presented as provider-authentic. */
  acknowledgeApplicationReplay: z.boolean().optional(),
  acknowledgeProviderAuthentic: z.boolean().optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
}).superRefine((value, ctx) => {
  if (value.kind === 'application' && value.acknowledgeApplicationReplay !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'acknowledgeApplicationReplay must be true — this path is not provider-authentic',
      path: ['acknowledgeApplicationReplay'],
    });
  }
  if (value.kind === 'application' && !value.eventId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'eventId is required for application replay',
      path: ['eventId'],
    });
  }
  if (value.kind === 'provider_authentic' && value.acknowledgeProviderAuthentic !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'acknowledgeProviderAuthentic must be true',
      path: ['acknowledgeProviderAuthentic'],
    });
  }
  if (
    (value.kind === 'provider_authentic' || value.kind === 'signature_mismatch')
    && !value.eventId
    && !value.fixture
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'eventId or fixture is required',
      path: ['eventId'],
    });
  }
});

export const QaDryRunBody = z.object({
  operation: z.enum(['ebay.buyer-import', 'ebay.seller-sync']),
  mode: z.enum(['preview', 'execute']).default('preview'),
  confirmExecute: z.boolean().optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
}).superRefine((value, ctx) => {
  if (value.mode === 'execute' && value.confirmExecute !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'confirmExecute must be true — preview is the default',
      path: ['confirmExecute'],
    });
  }
});

export const QaJobTriggerBody = z.object({
  job: z.string().min(1).max(128),
  intent: z.enum(['trigger_now', 'retry_failed']),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export const QaScenarioRunBody = z.object({
  suite: z.enum(['deterministic', 'qa-org', 'sandbox', 'all']).default('qa-org'),
  scenarioId: z.string().min(1).max(128).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});
