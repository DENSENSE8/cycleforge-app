/**
 * The four MCP Gateway tools.
 *
 * They register as ordinary AssistantToolDef entries, which is what makes them
 * MCP tools: src/lib/mcp/tool-server.ts builds tools/list from the same
 * registry and dispatches tools/call through the same runAssistantTool
 * chokepoint (unknown-tool → permission → Zod → run). There is no second
 * gateway and no second tool dialect; a fourth would be the page-local twin the
 * house rules exist to prevent.
 *
 * ─── ORG NEVER COMES FROM THE MODEL ────────────────────────────────────────
 * The specification for this pipeline writes the first tool as
 * `search_tool_registry(prompt, tenant_id)`. That signature inverts this repo's
 * core tenancy invariant — organizationId comes from the authenticated context
 * and never from model or client input, which src/lib/mcp/tool-server.test.ts
 * pins with a literal `// org NOT from client` assertion. A model-supplied
 * tenant id is a cross-tenant read with extra steps.
 *
 * So `tenant_id` is accepted in the schema (a model trained on the documented
 * signature will send it, and rejecting the call outright would just look like
 * a broken tool) and then IGNORED. The response says so explicitly, so the
 * model learns the parameter is inert rather than concluding the search is
 * broken. ctx.organizationId is the only org that reaches SQL.
 */

import { z } from 'zod';
import type { AssistantToolCtx, AssistantToolDef, AssistantToolDeps } from '@/lib/assistant/tools/types';
import { searchToolRegistry } from './dedupe';
import { triageBuildRequest, type DedupeOutcome } from './triage';
import { recordApprovalDecision } from './requests';
import { validateCodePayload, screenPayload, MAX_PAYLOAD_FILES } from './sandbox';
import { handOffToReview } from './handoff';
import {
  AGENT_SUBMITTABLE_REASON_CODES,
  DUPLICATE_DENY_THRESHOLD,
  type AgentSubmittableReasonCode,
} from './constants';

/* ────────────────────────────── 1. search_tool_registry ─────────────────── */

const searchInput = z.object({
  prompt: z.string().min(1).max(4000).describe('The capability the requester is asking for, in their own words.'),
  tenant_id: z
    .string()
    .optional()
    .describe(
      'IGNORED. The organization is taken from the authenticated session, never from this argument. ' +
        'Present only so the documented call signature does not error.',
    ),
});

export const searchToolRegistryTool: AssistantToolDef<typeof searchInput, unknown> = {
  name: 'search_tool_registry',
  description:
    'Check whether a requested capability already exists in this organization\'s tool registry. ' +
    'Returns the closest existing tool and its cosine similarity, plus the verdict the deterministic ' +
    `duplicate gate would reach (anything above ${DUPLICATE_DENY_THRESHOLD * 100}% is denied). ` +
    'Call this before proposing any new tool. The verdict is already final — it is not advice you weigh.',
  permission: 'tool_forge.search',
  inputSchema: searchInput,
  async run(input, ctx: AssistantToolCtx, deps: AssistantToolDeps) {
    const outcome = (await (deps.toolForgeDedupe
      ? deps.toolForgeDedupe(ctx.organizationId, input.prompt)
      : searchToolRegistry(ctx.organizationId, input.prompt))) as DedupeOutcome;

    const decision = triageBuildRequest(outcome);

    return {
      // Stated outright so a model that sent tenant_id learns it did nothing,
      // rather than inferring the search ignored its request.
      tenant_id_ignored: input.tenant_id != null,
      measured: outcome.measured,
      closest_match:
        outcome.measured && outcome.best
          ? {
              tool_id: outcome.best.toolId,
              tool_key: outcome.best.toolKey,
              name: outcome.best.name,
              source_path: outcome.best.sourcePath,
              similarity: outcome.best.similarity,
            }
          : null,
      threshold: DUPLICATE_DENY_THRESHOLD,
      verdict: decision.decision,
      reason_code: decision.reasonCode,
      exact_reason: decision.exactReason,
      duplicate_tool_id: decision.duplicateToolId,
    };
  },
};

/* ─────────────────────────── 2. submit_approval_decision ─────────────────── */

const decisionInput = z.object({
  request_id: z.number().int().positive(),
  decision: z.enum(['approved', 'denied']),
  reason: z.string().min(1).max(2000).describe('The operator-facing explanation. Required for approvals too.'),
  reason_code: z
    .enum(AGENT_SUBMITTABLE_REASON_CODES as unknown as [AgentSubmittableReasonCode, ...AgentSubmittableReasonCode[]])
    .describe(
      'Why. Note duplicate_tool and could_not_measure are NOT available here — those are the ' +
        'deterministic gate\'s own verdicts and cannot be asserted by a caller.',
    ),
  duplicate_id: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional()
    .describe('Reference only. A duplicate denial is recorded by the gate, not through this tool.'),
});

export const submitApprovalDecisionTool: AssistantToolDef<typeof decisionInput, unknown> = {
  name: 'submit_approval_decision',
  description:
    'Record a triage decision on a build request that the deterministic duplicate gate did not already ' +
    'settle. Cannot approve a request the gate denied as a duplicate, and cannot assert the gate\'s own ' +
    'reason codes. Returns the ledger row id.',
  permission: 'tool_forge.decide',
  inputSchema: decisionInput,
  async run(input, ctx: AssistantToolCtx, deps: AssistantToolDeps) {
    const payload = {
      buildRequestId: input.request_id,
      decision: input.decision,
      reasonCode: input.reason_code,
      exactReason: input.reason,
      // A caller may cite a duplicate for context, but it never lands as the
      // structural duplicate pointer: that column forces status='denied' via
      // build_requests_duplicate_is_denied and belongs to the gate alone.
      duplicateToolId: null,
      similarity: null,
      // 'agent', not 'human'. The ledger keeps the distinction so an audit can
      // later ask how many decisions a model made unsupervised.
      decidedBy: 'agent' as const,
      decidedByStaffId: null,
    };

    const res = (await (deps.toolForgeDecide
      ? deps.toolForgeDecide(ctx.organizationId, payload)
      : recordApprovalDecision(ctx.organizationId, payload))) as
      | { ok: true; reviewId: number }
      | { ok: false; error: string };

    if (!res.ok) {
      return { ok: false, error: res.error, cited_duplicate_id: input.duplicate_id ?? null };
    }
    return { ok: true, review_id: res.reviewId, decision: input.decision };
  },
};

/* ──────────────────────────── 3. execute_build_sandbox ──────────────────── */

const sandboxInput = z.object({
  build_request_id: z.number().int().positive(),
  code_payload: z
    .array(z.object({ path: z.string().min(1), contents: z.string() }))
    .min(1)
    .max(MAX_PAYLOAD_FILES)
    .describe('Files only. Commands are fixed by the validator and cannot be supplied here.'),
});

export const executeBuildSandboxTool: AssistantToolDef<typeof sandboxInput, unknown> = {
  name: 'execute_build_sandbox',
  description:
    'Type-check a generated code payload in a disposable VM. Supply files only — the validation commands ' +
    'are frozen in the validator and nothing in the payload can add to or alter them. Returns per-step ' +
    'exit codes and output. A failing check is a normal result, not an error.',
  permission: 'tool_forge.build',
  inputSchema: sandboxInput,
  async run(input, ctx: AssistantToolCtx, deps: AssistantToolDeps) {
    // Screen before anything else so an obviously bad payload never costs a VM.
    const rejection = screenPayload(input.code_payload);
    if (rejection) return { ok: false, rejected: rejection, steps: [] };

    const result = await (deps.toolForgeValidate
      ? deps.toolForgeValidate(ctx.organizationId, input.code_payload)
      : validateCodePayload(ctx.organizationId, input.code_payload));

    return { build_request_id: input.build_request_id, ...(result as object) };
  },
};

/* ─────────────────────────────── 4. commit_to_git ───────────────────────── */

const commitInput = z.object({
  build_request_id: z.number().int().positive(),
  branch_name: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9._\/-]+$/, 'branch names may contain only letters, digits, dot, dash, slash and underscore')
    .describe('Recorded and passed along as a hint. Nothing is branched or pushed by this tool.'),
  file_changes: z.array(z.object({ path: z.string().min(1), contents: z.string() })).min(1).max(MAX_PAYLOAD_FILES),
});

export const commitToGitTool: AssistantToolDef<typeof commitInput, unknown> = {
  name: 'commit_to_git',
  description:
    'Hand a validated change to human code review by filing a labelled GitHub issue, which the existing ' +
    'automation turns into a pull request. This does NOT branch, commit, or push, and merging does not ' +
    'itself deploy. Returns the review reference.',
  permission: 'tool_forge.commit',
  inputSchema: commitInput,
  async run(input, ctx: AssistantToolCtx, deps: AssistantToolDeps) {
    const payload = {
      buildRequestId: input.build_request_id,
      branchName: input.branch_name,
      targetScope: '',
      prompt: '',
      files: input.file_changes,
    };
    const res = (await (deps.toolForgeHandoff
      ? deps.toolForgeHandoff(ctx.organizationId, payload)
      : handOffToReview(ctx.organizationId, payload))) as
      | { ok: true; externalRef: string; mode: string }
      | { ok: false; error: string };

    if (!res.ok) return { ok: false, error: res.error };
    // 'handed_off', never 'deployed' — a merged PR does not ship on its own.
    return { ok: true, status: 'handed_off', external_ref: res.externalRef, mode: res.mode };
  },
};

/** The exact four the gateway exposes. */
export const TOOL_FORGE_GATEWAY_TOOLS = [
  searchToolRegistryTool,
  submitApprovalDecisionTool,
  executeBuildSandboxTool,
  commitToGitTool,
] as const;
