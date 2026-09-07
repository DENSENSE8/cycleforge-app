/**
 * Which mouth answers one assistant turn — the ladder, as a pure function.
 *
 * This used to live inline in `POST /api/assistant/chat`, inside a 380-line
 * `ReadableStream.start()` closure, as four `if` blocks reading six locals.
 * Nothing about it could be asserted without booting Next, an auth session and
 * a model, so the one property that actually matters was never checked — and it
 * was false:
 *
 *   **A reachable OpenAI-wire provider was answered MOUTH-ONLY.**
 *
 * `runOpenAiWireTurn` is provider-agnostic (it takes an `AiProviderConfig` and
 * branches only on `isSelfHostedAiRuntime`, never on a vendor name), but the
 * route only handed it two configs: a connected Grok session and a vault
 * `ollama` slot. Every other member of the chain — `ai_gateway`, `openai`,
 * `anthropic`'s OpenAI-compat endpoint, and the `platform` leaf that IS the
 * deployed default — fell through to a bare `/chat/completions` stream with no
 * `tools` array at all.
 *
 * That is not a slower answer, it is a different product. A mouth-only turn
 * cannot call a registered tool, so it cannot emit `render_artifact`, so the
 * assistant's whole right-hand artifact canvas is dead on those providers —
 * and the model, asked for a number it has no tool to read, invents one.
 *
 * So the ladder is extracted, and `mouthCanCallTools` is the invariant a test
 * can hold: outside the deliberate phrasing shortcut, a reachable provider is
 * always given the tool loop.
 *
 * ## What did NOT change
 *
 * Precedence. Grok still wins (the tenant connected it to avoid metered keys),
 * a self-hosted slot still beats a metered Anthropic brain (that is the
 * local-first inversion), and the classified-facts phrasing round still skips
 * tools entirely — it is the sub-two-second path, and its numbers are already
 * in the enriched message. Only the leaf that advertised zero tools moved.
 */

import type { OrgAiConfig } from '@/lib/ai/org-provider';

/**
 * The vault slot for "any OpenAI-compatible server this tenant runs itself"
 * (Ollama, MLX, LM Studio) — see `provider-order.ts`. Distinct from
 * `isSelfHostedAiRuntime`, which is a hostname test the platform leaf can also
 * pass; this is the tenant's declared own box, and it is why it outranks a
 * metered brain.
 */
const SELF_HOSTED_SLOT = 'ollama';

export type AssistantMouth =
  /**
   * One completion, no tools. Reserved for a turn whose facts enrichment
   * already classified and inlined, where a tool round would only add latency.
   */
  | { readonly kind: 'phrasing'; readonly config: OrgAiConfig }
  /** The provider-agnostic OpenAI-wire tool loop. */
  | {
      readonly kind: 'wire-tools';
      readonly config: OrgAiConfig;
      /**
       * Whether a mid-loop 401 should be retried against a re-resolved config.
       * True only for Grok, whose access token is a rotating OAuth session; a
       * pinned endpoint has no credential to refresh and must not be sent
       * through `ensureGrokChatConfig`.
       */
      readonly refreshable: boolean;
    }
  /** Anthropic's native tool-use protocol (`runAssistantTurn`). */
  | { readonly kind: 'anthropic-tools' }
  /** No provider at all — the operator gets a sentence, not a silent failure. */
  | { readonly kind: 'unconfigured' };

export type AssistantMouthKind = AssistantMouth['kind'];

export interface AssistantMouthInputs {
  /** A refreshed SuperGrok chat session, when the tenant has one connected. */
  readonly grokConfig: OrgAiConfig | null;
  /** Whether the org (or the platform) has an Anthropic key for the native loop. */
  readonly hasAnthropic: boolean;
  /** Head of the org's resolved chat chain — `grokConfig` when Grok is connected. */
  readonly chatConfig: OrgAiConfig | null;
  /** Whether {@link chatConfig}'s endpoint answered a probe. */
  readonly chatReachable: boolean;
  /** `ASSISTANT_HERMES_FALLBACK` — take the wire even when Anthropic is present. */
  readonly forceWireFallback: boolean;
  /** Enrichment already resolved this turn's numbers (carton brief / org facts). */
  readonly classifiedFacts: boolean;
}

/**
 * A mouth that can call a registered tool — and therefore reach the database
 * under `withAuth` + `tenantQuery` + `recordAudit`, and paint the artifact
 * canvas through `render_artifact`.
 *
 * `phrasing` cannot, by construction, and that is the whole reason it is
 * narrowed to turns that need no tool.
 */
export function mouthCanCallTools(mouth: AssistantMouth): boolean {
  return mouth.kind === 'wire-tools' || mouth.kind === 'anthropic-tools';
}

export function chooseAssistantMouth(input: AssistantMouthInputs): AssistantMouth {
  const chat = input.chatConfig;
  const reachable = chat !== null && input.chatReachable;
  const selfHosted = reachable && chat.source === SELF_HOSTED_SLOT ? chat : null;

  /**
   * Whether the OpenAI wire is this org's mouth at all. A connected Grok
   * session counts unconditionally — its config was just refreshed, so a probe
   * would only add a round-trip to a turn the operator is watching.
   */
  const wireEligible =
    input.grokConfig !== null || ((input.forceWireFallback || !input.hasAnthropic) && reachable);

  // The speed king, and it must stay first: a classified turn already HAS its
  // numbers, so a tool round buys nothing and costs seconds. It yields to a
  // self-hosted loop only because that one is free and can verify them.
  if (input.classifiedFacts && wireEligible && chat !== null && selfHosted === null) {
    return { kind: 'phrasing', config: chat };
  }

  if (input.grokConfig !== null) {
    return { kind: 'wire-tools', config: input.grokConfig, refreshable: true };
  }

  if (selfHosted !== null) {
    return { kind: 'wire-tools', config: selfHosted, refreshable: false };
  }

  // THE FIX. This leaf was `streamHermesCompletion` — one completion, no
  // `tools` array, no artifact canvas — for `ai_gateway`, `openai`, `anthropic`
  // (OpenAI-compat) and `platform`. The loop always could have run here.
  if (wireEligible && chat !== null) {
    return { kind: 'wire-tools', config: chat, refreshable: false };
  }

  if (input.hasAnthropic) {
    return { kind: 'anthropic-tools' };
  }

  return { kind: 'unconfigured' };
}
