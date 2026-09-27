/**
 * Pre-loop turn preparation for the assistant: the deterministic answers that
 * need no model (local_ops shipping pace) and the two VOICE briefs (the open
 * carton, workspace packing facts).
 *
 * It used to also stuff every other message with "live workspace data" — an
 * intent-routed context block plus a hybrid-search block. Both are gone: the
 * read tools (`find_records`, `locate_product`, `get_order_lookup`, …) fetch
 * exactly what the question needs, and the stuffed block cost ~0.5–1.3 s of
 * DB work plus prefill on every round, bypassed `findRecords` (a second
 * retrieval path), and polluted the tool subsetter's keyword signal.
 */

import {
  formatAnalysisForPrompt,
  resolveLocalAiAnswer,
  type LocalAiResolution,
} from '@/lib/ai/ops-assistant';
import { isCartonAskQuestion } from '@/lib/assistant/carton-ask-brief';
import {
  classifyOrgChatQuestion,
  fetchOrgChatFacts,
  orgChatFactsDeps,
  type OrgChatKind,
} from '@/lib/assistant/org-chat-facts';
import type { TenantSession } from '@/lib/assistant/tenant-session';
import type { OrgId } from '@/lib/tenancy/constants';

export type EnrichPageContext = {
  page?: string | null;
  selection?: { kind: string; id: string | number } | null;
};
export type EnrichVoice = 'carton' | 'org_chat';

export type EnrichTurnResult =
  | { kind: 'local_ops'; resolution: LocalAiResolution }
  | { kind: 'enriched'; userMessage: string; voice?: EnrichVoice };

export interface EnrichTurnDeps {
  resolveLocal: typeof resolveLocalAiAnswer;
  fetchCarton?: (orgId: OrgId, receivingId: number) => Promise<string>;
  fetchOrgChat?: (args: {
    orgId: OrgId;
    staffId: number | null | undefined;
    message: string;
    kind: OrgChatKind;
  }) => Promise<string>;
  /**
   * The turn's tenant session. When present, the classified facts queries run
   * on ONE connection (§22 H1) — the packing-count question is two queries and
   * used to pay two full BEGIN/COMMIT round trips for them.
   */
  db?: Pick<TenantSession, 'query' | 'runBatch'>;
}

const defaultDeps: EnrichTurnDeps = {
  resolveLocal: resolveLocalAiAnswer,
  fetchCarton: async (orgId, receivingId) => {
    const mod = await import('@/lib/ai/context-fetchers');
    return mod.fetchReceivingCartonContext(orgId, receivingId);
  },
  // fetchOrgChat is deliberately NOT defaulted here: the default lives in
  // orgChatBrief, where it can honour `deps.db`. Defaulting it here would win
  // the `??` and silently drop the turn's tenant session.
};

async function cartonBrief(
  orgId: OrgId,
  receivingId: number,
  trimmed: string,
  deps: EnrichTurnDeps,
): Promise<EnrichTurnResult> {
  const fetchCarton =
    deps.fetchCarton ??
    (async (idOrg: OrgId, id: number) => {
      const mod = await import('@/lib/ai/context-fetchers');
      return mod.fetchReceivingCartonContext(idOrg, id);
    });
  const carton = await fetchCarton(orgId, receivingId).catch((err) => {
    console.error(
      '[ask] carton brief failed:',
      err instanceof Error ? err.message : String(err),
    );
    return null;
  });
  const block =
    carton?.trim() ||
    'The operator has this inbound carton open. Product lines did not load. Ask what they see on the box. Do not cite internal ids.';
  return {
    kind: 'enriched',
    userMessage: `${block}\n\nOperator: ${trimmed}`,
    voice: 'carton',
  };
}

async function orgChatBrief(
  orgId: OrgId,
  staffId: number | null | undefined,
  trimmed: string,
  kind: OrgChatKind,
  deps: EnrichTurnDeps,
): Promise<EnrichTurnResult> {
  const db = deps.db;
  const fetchOrgChat =
    deps.fetchOrgChat ??
    ((args: Parameters<typeof fetchOrgChatFacts>[0]) => {
      const run = () => fetchOrgChatFacts(args, orgChatFactsDeps(db?.query));
      // Short-lived by design: the batch spans the two facts queries only,
      // never a model round trip.
      return db ? db.runBatch(run) : run();
    });
  const block = await fetchOrgChat({
    orgId,
    staffId,
    message: trimmed,
    kind,
  }).catch((err) => {
    console.error(
      '[ask] org chat facts failed:',
      err instanceof Error ? err.message : String(err),
    );
    return null;
  });
  return {
    kind: 'enriched',
    userMessage:
      block?.trim() ||
      `Workspace facts did not load for this organization.\n\nOperator: ${trimmed}`,
    voice: 'org_chat',
  };
}

/**
 * Prepare a user turn for the assistant agent loop.
 * - local_ops → caller should short-circuit (no model).
 * - else → the message as typed, or a voice brief (open carton / packing facts).
 *
 * Carton briefing only runs when the utterance is about the open carton.
 * Workspace packing questions query the signed-in org (and session packer)
 * even if a carton is selected.
 */
export async function enrichAssistantTurn(
  orgId: OrgId,
  message: string,
  /**
   * Partial override — a caller that only wants to supply the tenant session
   * (`{ db }`) does not have to restate the four real collaborators.
   */
  overrides: Partial<EnrichTurnDeps> = {},
  page?: EnrichPageContext | null,
  staffId?: number | null,
): Promise<EnrichTurnResult> {
  const deps: EnrichTurnDeps = { ...defaultDeps, ...overrides };
  const trimmed = message.trim();
  const selection = page?.selection ?? null;
  const receivingId =
    selection?.kind === 'receiving' ? Number(selection.id) : NaN;
  const cartonOpen = Number.isFinite(receivingId) && receivingId > 0;
  if (cartonOpen && isCartonAskQuestion(trimmed)) {
    return cartonBrief(orgId, receivingId, trimmed, deps);
  }

  const orgKind = classifyOrgChatQuestion(trimmed);
  if (orgKind) {
    return orgChatBrief(orgId, staffId, trimmed, orgKind, deps);
  }

  const local = await deps.resolveLocal(trimmed, orgId).catch(() => null);
  if (local) {
    return { kind: 'local_ops', resolution: local };
  }

  return { kind: 'enriched', userMessage: trimmed };
}

/** Format a local_ops resolution as the assistant reply text. */
export function formatLocalOpsReply(resolution: LocalAiResolution): string {
  return resolution.reply;
}

/** Optional structured block for persistence / debugging. */
export function formatLocalOpsContext(resolution: LocalAiResolution): string {
  return formatAnalysisForPrompt(resolution.analysis);
}
