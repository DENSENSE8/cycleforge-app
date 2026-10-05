import 'server-only';
import { AiFailoverError, postToAiProvider } from '@/lib/ai/failover';
import { queryNemoClawRag } from '@/lib/ai/nemoclaw-rag';
import { isSelfHostedAiRuntime } from '@/lib/ai/provider';
import { recordAiUsage, type RecordAiUsage } from '@/lib/ai/usage';
import { resolvePhotoAccessUrl } from '@/lib/photos/resolve-access-url';
import { hybridSearch } from '@/lib/search/hybrid-retrieval';
import type { SupportDraftKind } from '@/lib/support/conversation/model';
import { applyMarketplacePolicy } from '@/lib/support/conversation/transport';
import type { SupportDraftContext } from '@/lib/support/drafts/context';
import type { OrgId } from '@/lib/tenancy/constants';
import { resolveSupportReplyPersona } from './reply-persona-deps';
import {
  suggestSupportReplyCore,
  SupportSuggestError,
  type SuggestDeps,
  type SupportSuggestion,
} from './suggest-reply-core';
import { resolveSupportVisionLaneForOrg } from './vision-lane-deps';

/**
 * Server bindings for the Support drafter — the real RAG call, the org's AI
 * provider chain (failover + metering via `postToAiProvider`), and the channel
 * policy. The ONE generation path for station drafts and stored drafts.
 */

/** A drafting call may outlive a short default budget on a cold local model; the worker is in the background anyway. */
const DRAFT_TIMEOUT_MS = 90_000;

/** The record kinds a customer question can be about; tickets (subject-only) and bins add noise. */
const SUPPORT_RECORD_TYPES = ['ORDER', 'SERIAL_UNIT', 'SKU', 'REPAIR', 'WARRANTY_CLAIM', 'RECEIVING'] as const;

function makeGenerate(orgId: OrgId, staffId: number | null, recordUsage: RecordAiUsage): SuggestDeps['generate'] {
  return async ({ system, user, sessionTag, images }) => {
    const content = images?.length
      ? [{ type: 'text', text: user }, ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } }))]
      : user;
    let attempt;
    try {
      attempt = await postToAiProvider(orgId, 'chat', {
        path: '/chat/completions',
        body: null,
        buildBody: (config) => ({
          model: config.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content },
          ],
          stream: false,
          temperature: 0.3,
          max_tokens: 700,
          // A self-hosted reasoning model (vLLM Qwen3) otherwise spends the
          // whole budget thinking: ~50 s and a truncated reply. Managed
          // endpoints 400 on unknown params, so this rides ONLY to local runtimes.
          ...(isSelfHostedAiRuntime(config) ? { chat_template_kwargs: { enable_thinking: false } } : {}),
        }),
        headers: { 'X-Hermes-Session-Id': sessionTag, 'X-Source': 'cycle-forge-support-draft' },
        timeoutMs: DRAFT_TIMEOUT_MS,
        staffId,
        sessionId: sessionTag,
      }, undefined, fetch, recordUsage);
    } catch (err) {
      if (err instanceof AiFailoverError) throw new SupportSuggestError(502, err.message);
      throw err;
    }
    if (!attempt.res.ok) {
      const detail = await attempt.res.text().catch(() => '');
      throw new SupportSuggestError(502, `AI returned ${attempt.res.status}. Is the model gateway reachable?`, detail.slice(0, 300));
    }
    const data = (await attempt.res.json().catch(() => null)) as
      | { choices?: Array<{ message?: { content?: unknown } }>; reply?: unknown }
      | null;
    const raw = data?.choices?.[0]?.message?.content ?? data?.reply ?? '';
    // Strip <think>…</think> reasoning blocks if the model includes them (mirrors /api/ai/chat).
    return {
      text: String(raw).replace(/<think>[\s\S]*?<\/think>/g, '').trim(),
      model: attempt.served.model,
    };
  };
}

export function makeSuggestDeps(
  orgId: OrgId,
  staffId: number | null = null,
  /** Metering sink — the live eval passes a no-op so it writes nothing. */
  recordUsage: RecordAiUsage = recordAiUsage,
): SuggestDeps {
  return {
    queryRag: queryNemoClawRag,
    searchRecords: async (query) =>
      (await hybridSearch(orgId, query, { limit: 5, entityTypes: [...SUPPORT_RECORD_TYPES] })).hits,
    generate: makeGenerate(orgId, staffId, recordUsage),
    applyChannelPolicy: applyMarketplacePolicy,
  };
}

/**
 * Draft over a local context with this org's framing and vision lane. Signed
 * storage URLs are resolved only on the lane permitted to send an image off
 * the tenant's box; an unsigned fallback URL is dropped, never sent.
 */
export async function draftSupportContext(
  orgId: OrgId,
  args: { context: SupportDraftContext; kind: SupportDraftKind; staffId: number | null },
  deps: SuggestDeps = makeSuggestDeps(orgId, args.staffId),
): Promise<SupportSuggestion> {
  // The tenant's OWN framing — never a hardcoded brand — and a lane that is
  // resolved, never assumed, and local-first.
  const [persona, vision] = await Promise.all([
    resolveSupportReplyPersona(orgId),
    resolveSupportVisionLaneForOrg(orgId),
  ]);
  let imageUrls: string[] = [];
  if (vision === 'cloud-multimodal' && args.context.photos.length) {
    const resolved = await Promise.all(
      args.context.photos.map((photo) => resolvePhotoAccessUrl(photo.photoId, orgId, 'full').catch(() => null)),
    );
    imageUrls = resolved.filter((url): url is string => typeof url === 'string' && /^https?:\/\//i.test(url));
  }
  return suggestSupportReplyCore({ context: args.context, kind: args.kind, persona, vision, imageUrls }, deps);
}
