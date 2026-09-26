/** POST /api/admin/integrations/upsert */

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
import { modelWarning, probeAiEndpoint } from '@/lib/ai/provider-probe';

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

  // Verify the endpoint ACTUALLY answers before persisting (integration-connector skill:
  let probeNote: string | null = null;
  if (provider === 'ollama') {
    const cfg = validated.payload as Record<string, string | undefined>;
    const probe = await probeAiEndpoint({
      // Probe what RUNTIME will use: tunnelUrl wins over baseUrl, exactly as
      // resolveOrgAiConfig resolves it. Probing the other one would bless a URL
      // no call will ever make.
      baseURL: String(cfg.tunnelUrl || cfg.baseUrl || ''),
      apiKey: cfg.apiKey,
      headers: {
        ...(cfg.cfAccessClientId ? { 'CF-Access-Client-Id': cfg.cfAccessClientId } : {}),
        ...(cfg.cfAccessClientSecret ? { 'CF-Access-Client-Secret': cfg.cfAccessClientSecret } : {}),
      },
    });
    if (!probe.ok) {
      return NextResponse.json(
        { error: 'ENDPOINT_UNREACHABLE', detail: probe.reason },
        { status: 400 },
      );
    }
    probeNote = modelWarning(probe.models, cfg.model) ?? probe.note ?? null;
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
  // `warning` is advisory — the credential IS saved. A named-but-unlisted model
  // must not block the save: the listing can be empty, and a model can be
  // pulled after the endpoint is connected.
  return NextResponse.json({ status: 'ok', ...(probeNote ? { warning: probeNote } : {}) });
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
