/**
 * LLM pass over the deterministic triage ranking: reorder and explain, never
 * invent. The model sees the unit context and the candidate steps with their
 * evidence and deterministic confidence, and returns an order of existing keys
 * with a one-line reason each. Unknown keys are dropped, missing ones keep
 * their deterministic order at the end, and confidence stays deterministic.
 */

import { hermesToolCall } from '@/lib/ai/hermes-tool-call';
import type { TriageRankedStep } from '@/lib/qc/triage/rank';
import type { OrgId } from '@/lib/tenancy/constants';

const TOOL_NAME = 'rank_triage_steps';

const SYSTEM_PROMPT = [
  'You help a warehouse QC technician decide what to do next with a returned or',
  'used electronic device on the test bench. You get the unit (SKU, family) and a',
  'list of CANDIDATE steps, already ranked by how often each resolved the same',
  'failure on the same SKU or family, with the evidence behind each.',
  '',
  'Rules:',
  '- Only reorder the given candidates. NEVER invent a step or a key.',
  '- Put cheap, non-destructive checks that can confirm a suspected fault before',
  '  fixes that consume parts, unless history strongly favors the fix.',
  '- A RETEST after a completed repair usually comes first.',
  '- For each step write one short, concrete reason (≤ 140 chars) grounded in the',
  '  evidence shown. Do not restate the confidence number.',
  '',
  `Answer with the \`${TOOL_NAME}\` arguments exactly once, listing every key, and stop.`,
].join('\n');

interface RerankArgs {
  order?: unknown;
}

export interface TriageRerankResult {
  steps: TriageRankedStep[];
  model: string;
}

export async function rerankTriageSteps(
  orgId: OrgId,
  unit: { sku: string | null; family: string | null },
  steps: TriageRankedStep[],
): Promise<TriageRerankResult> {
  const userText = [
    `Unit SKU: ${unit.sku ?? 'unknown'}; family: ${unit.family ?? 'unknown'}`,
    '',
    'Candidates (deterministic order):',
    ...steps.map((s, i) =>
      [
        `${i + 1}. key=${s.key} kind=${s.kind} confidence=${s.confidence}`,
        `   step: ${s.step}`,
        `   why: ${s.why}`,
        `   evidence: ${s.evidence.map((e) => `${e.type}:${e.label}`).join('; ') || 'none'}`,
      ].join('\n'),
    ),
  ].join('\n');

  const { args, model } = await hermesToolCall<RerankArgs>({
    orgId,
    systemPrompt: SYSTEM_PROMPT,
    userText,
    maxTokens: 1500,
    tool: {
      name: TOOL_NAME,
      description: 'Report the reordered candidate keys, best next step first, each with a short reason.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          order: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                key: { type: 'string', enum: steps.map((s) => s.key) },
                why: { type: 'string' },
              },
              required: ['key', 'why'],
            },
          },
        },
        required: ['order'],
      },
    },
  });

  if (!Array.isArray(args.order)) throw new Error(`Model "${model}" returned no order`);
  const byKey = new Map(steps.map((s) => [s.key, s]));
  const ordered: TriageRankedStep[] = [];
  for (const entry of args.order as Array<{ key?: unknown; why?: unknown }>) {
    const step = typeof entry?.key === 'string' ? byKey.get(entry.key) : undefined;
    if (!step) continue;
    byKey.delete(step.key);
    const why = typeof entry.why === 'string' ? entry.why.trim() : '';
    ordered.push(why && why.length <= 400 ? { ...step, why } : step);
  }
  if (ordered.length === 0) throw new Error(`Model "${model}" ordered none of the candidates`);
  // Anything the model skipped keeps its deterministic place after the model's picks.
  return { steps: [...ordered, ...steps.filter((s) => byKey.has(s.key))], model };
}
