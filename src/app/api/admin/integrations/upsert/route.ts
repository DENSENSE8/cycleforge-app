/**
 * POST /api/admin/integrations/upsert
 *
 * Creates or replaces a per-tenant integration credential. Body shape:
 *   { provider: 'zoho', scope?: string, displayLabel?: string, payload: object }
 *
 * `payload` is whatever the integration module expects — see
 * src/lib/integrations/credentials.ts for the per-provider type shapes.
 * It's encrypted server-side with the org's vault key; the client never
 * sees ciphertext.
 *
 * Gated by admin.manage_features (these are global-impact credentials)
 * plus step-up to prevent CSRF-style replays.
 */

import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { logger } from '@/lib/observability/logger';
import {
  getIntegrationCredentials,
  upsertIntegrationCredentials,
  type IntegrationProvider,
} from '@/lib/integrations/credentials';
import {
  wouldExceedIntegrationLimit,
  integrationLimitStatus,
  getConnectionStatus,
} from '@/lib/integrations/connectors/connections';
import {
  VAULT_UPSERT_PROVIDERS,
  parseIntegrationPayloadInput,
} from '@/lib/integrations/credential-schemas';
import { mergeVaultPayload } from '@/lib/integrations/credential-payload';

const Body = z.object({
  provider: z.enum(VAULT_UPSERT_PROVIDERS),
  scope: z.string().max(64).nullable().optional(),
  displayLabel: z.string().max(160).nullable().optional(),
  payload: z.record(z.string(), z.unknown()),
});

export const POST = withAuth(async (req, ctx) => {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_INPUT', detail: err instanceof Error ? err.message : 'bad request' },
      { status: 400 },
    );
  }

  // Entitlement ceiling: connecting a NEW provider can't push the org past its
  // plan's maxIntegrations. Updating an already-connected provider is allowed.
  if (await wouldExceedIntegrationLimit(ctx.organizationId, parsed.provider as IntegrationProvider)) {
    const limit = await integrationLimitStatus(ctx.organizationId);
    return NextResponse.json(
      {
        error: 'INTEGRATION_LIMIT',
        used: limit.used,
        max: limit.max,
        hint: 'Upgrade your plan to connect more integrations.',
      },
      { status: 402 },
    );
  }

  const provider = parsed.provider as IntegrationProvider;
  const scope = parsed.scope ?? null;
  const existingConn = await getConnectionStatus(ctx.organizationId, provider, scope);
  const isUpdate = existingConn?.connected ?? false;

  const existingPayload = isUpdate
    ? await getIntegrationCredentials<Record<string, unknown>>(ctx.organizationId, provider, { scope })
    : null;

  const incomingCheck = parseIntegrationPayloadInput(provider, parsed.payload, { partial: isUpdate });
  if (!incomingCheck.ok) {
    return NextResponse.json(
      {
        error: 'INVALID_CREDENTIALS',
        detail: incomingCheck.error,
        fieldErrors: incomingCheck.fieldErrors,
      },
      { status: 400 },
    );
  }

  const merged = mergeVaultPayload(provider, existingPayload, incomingCheck.payload);
  const validated = parseIntegrationPayloadInput(provider, merged, { partial: false });
  if (!validated.ok) {
    return NextResponse.json(
      {
        error: 'INVALID_CREDENTIALS',
        detail: validated.error,
        fieldErrors: validated.fieldErrors,
      },
      { status: 400 },
    );
  }

  await upsertIntegrationCredentials({
    orgId: ctx.organizationId,
    provider,
    scope,
    displayLabel: parsed.displayLabel ?? null,
    payload: validated.payload,
    createdBy: ctx.staffId,
  });

  // AI provider connected/switched → the org's search docs must re-embed in
  // the new model's embedding space (mixed models poison cosine relevance).
  // Enqueue-only + fire-and-forget; the search-outbox cron drains at its pace.
  if (['ai_gateway', 'openai', 'anthropic', 'ollama'].includes(parsed.provider)) {
    after(async () => {
      try {
        const { enqueueOrgReembed } = await import('@/lib/search/search-outbox-worker');
        const n = await enqueueOrgReembed(ctx.organizationId);
        logger.info(`[integrations] AI provider changed — re-embed enqueued for ${n} docs`);
      } catch (err) {
        console.warn('[integrations] re-embed enqueue failed (non-fatal):', err);
      }
    });
  }
  return NextResponse.json({ status: 'ok' });
}, {
  permission: 'admin.manage_features',
  stepUp: true,
  audit: {
    source: 'admin',
    action: 'integration.upsert',
    entityType: 'integration',
    entityId: ({ body }) => (body as { provider?: string })?.provider ?? null,
  },
});
