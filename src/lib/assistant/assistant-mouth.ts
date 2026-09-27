/**
 * Which mouth answers one assistant turn — now a single pinned rung.
 *
 * ## 2026-09-08: the ladder was collapsed to the local model
 *
 * Owner decision, on evidence. Iteration 6 of the tool-router fine-tune
 * (Qwen3-4B QLoRA, r32, trained on this app's own tool registry) cleared
 * **all eight gates** on the 133 goldens: tool selection 0.976, pass 0.977,
 * artifact validity 1.000 first try, refusals 1.00, zero tenant leaks, zero
 * invented ids, p95 first token 795 ms. See `evals/cycleforge-v2/LEDGER.md`.
 *
 * A metered generalist is slower and *worse* at this particular job — picking
 * one of ~45 tool names, filling a few typed args, and emitting a valid
 * artifact envelope. So Grok and Anthropic are not "fallbacks" here, they are
 * downgrades that also cost money per turn. Both ties are removed.
 *
 * ## Why unreachable yields `unconfigured` and never a substitution
 *
 * This is the deliberate half of the decision. A silent failover looks exactly
 * like the product working, which is how a mis-wired local path can go
 * unnoticed for an entire iteration — precisely the class of defect that cost
 * this project four data iterations against a broken instrument. An operator
 * who is told the endpoint is down knows to say so. Availability is fixed at
 * the endpoint, not papered over in the router.
 *
 * ## What this deleted
 *
 * - the `grokConfig` rung and its refresh path (`refreshable` is now always
 *   `false`; nothing here holds a rotating OAuth credential);
 * - the `hasAnthropic` rung (`anthropic-tools` / `runAssistantTurn`);
 * - `forceWireFallback` (`ASSISTANT_HERMES_FALLBACK`) — with one rung there is
 *   nothing to force a fallback past;
 * - the `phrasing` shortcut, already dead as a provider carve-out (angle 16
 *   removed it: it answered report questions in prose with no tool and no
 *   artifact on five clouds but not the sixth). Every reachable mouth is
 *   tool-capable now, which is the invariant `mouthCanCallTools` holds.
 *
 * `runAssistantTurn` in `agent-loop.ts` is consequently unreferenced by
 * production code — only its own tests call it. It is left in place rather
 * than torn out in the same pass; deleting it is a separate decision because
 * its tests also cover the `render_artifact` validation chokepoint.
 *
 * ## The invariant that did NOT change
 *
 * **A reachable provider is never answered by a mouth that cannot call a
 * tool.** That is why this is a pure function with a unit test instead of four
 * `if` blocks buried in a 380-line stream closure, which is where it lived
 * when it was false.
 */

import type { OrgAiConfig } from '@/lib/ai/org-provider';

export type AssistantMouth =
  /** The provider-agnostic OpenAI-wire tool loop. */
  | {
      readonly kind: 'wire-tools';
      readonly config: OrgAiConfig;
      /**
       * Whether a mid-loop 401 should be retried against a re-resolved config.
       * True ONLY for Grok, whose access token is a rotating OAuth session. A
       * pinned local endpoint has no credential to refresh and must not be
       * sent through `ensureGrokChatConfig`.
       */
      readonly refreshable: boolean;
    }
  /** No reachable endpoint at all — the operator gets a sentence, not silence. */
  | { readonly kind: 'unconfigured' };

export type AssistantMouthKind = AssistantMouth['kind'];

export interface AssistantMouthInputs {
  /**
   * A refreshed SuperGrok chat session, when the tenant has connected one.
   *
   * Re-attached 2026-09-08 at the owner's request, after the local router
   * mis-answered "show me the open order exceptions, oldest first". Grok is a
   * DIAGNOSTIC rung: it answers the turns the router cannot yet, so the gap is
   * visible as a good answer instead of a dead end, while the traffic that
   * exposes those gaps accumulates in `ai_chat_sessions` for the next dataset.
   */
  readonly grokConfig: OrgAiConfig | null;
  /** Head of the org's resolved chat chain. `local-first` puts the local slot first. */
  readonly chatConfig: OrgAiConfig | null;
  /** Whether {@link chatConfig}'s endpoint answered a probe. */
  readonly chatReachable: boolean;
}

/**
 * A mouth that can call a registered tool — and therefore reach the database
 * under `withAuth` + `tenantQuery` + `recordAudit`, and paint the artifact
 * canvas through `render_artifact`.
 *
 * Trivially true for `wire-tools` now that it is the only answering mouth.
 * Kept as a named predicate because the property it asserts — *a reachable
 * provider is never answered by a mouth that cannot call a tool* — is the one
 * this module exists to guarantee, and a future rung must satisfy it too.
 */
export function mouthCanCallTools(mouth: AssistantMouth): boolean {
  return mouth.kind === 'wire-tools';
}

/**
 * Grok when connected, otherwise the local router, otherwise an honest refusal.
 *
 * ## Why Grok is back (2026-09-08)
 *
 * The ladder was collapsed to the local model earlier today on gate evidence
 * (iteration 6 clears all eight: tool selection 0.976, pass 0.977, artifact
 * 1.000, refusal 1.00, p95 795 ms). Then a real operator turn — *"show me the
 * open order exceptions, oldest first"* — came back "Nothing found" off
 * `get_node_detail`.
 *
 * That turn is NOT a training failure, and the distinction decides the design:
 * **no registered tool answers it.** The registry has no order-exceptions
 * read; the nearest neighbours (`get_roi_gaps`, `get_roi_rank`) rank leaks.
 * No amount of fine-tuning teaches a model to call a verb that does not exist.
 *
 * So Grok is a DIAGNOSTIC rung, not a crutch: it answers what the router
 * cannot, so a registry gap surfaces as a good answer plus a logged question
 * instead of a dead end. The questions accumulate in `ai_chat_sessions`, which
 * is where the next dataset and the next tool both come from.
 *
 * ## Precedence, and why local is second rather than first
 *
 * A connected SuperGrok session is a subscription the tenant already pays for
 * and deliberately attached, so it wins unconditionally — its config was just
 * refreshed, and probing it would only add a round-trip to a turn the operator
 * is watching. Remove the connection and the local router takes every turn
 * again with no code change.
 *
 * Anthropic stays deleted. It was never connected here, and a third rung would
 * make "which brain answered?" ambiguous again — the condition that let a
 * mouth-only path advertise zero tools unnoticed.
 *
 * ## Unchanged: unreachable is `unconfigured`, never a substitution
 *
 * If neither Grok nor the local endpoint answers, the operator is told. A
 * silent failover looks exactly like the product working, which is how a
 * mis-wired local path goes unnoticed for an entire iteration.
 */
export function chooseAssistantMouth(input: AssistantMouthInputs): AssistantMouth {
  if (input.grokConfig !== null) {
    return { kind: 'wire-tools', config: input.grokConfig, refreshable: true };
  }
  const chat = input.chatConfig;
  if (chat !== null && input.chatReachable) {
    return { kind: 'wire-tools', config: chat, refreshable: false };
  }
  return { kind: 'unconfigured' };
}
