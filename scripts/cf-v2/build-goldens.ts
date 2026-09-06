/**
 * Build evals/cycleforge-v2/golden.jsonl from the LIVE registry + fixtures
 * (train handoff §4). Enumerates ASSISTANT_TOOLS — never memory — so a
 * registry change fails this build loudly instead of silently rotting the
 * eval. v1 ids are kept for the rows that still apply so old and new reports
 * line up.
 *
 * Run: node --import tsx --import ./scripts/register-server-only-shim.cjs scripts/cf-v2/build-goldens.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { ASSISTANT_TOOLS } from '@/lib/assistant/tools';
import { TOOL_FIXTURES, REFUSALS, MULTI_TOOL, ARTIFACT_CASES, EMPTY_RESULT_TOOLS } from './fixtures';

export interface GoldenRow {
  id: string;
  prompt: string;
  page: string;
  category: 'tool' | 'refusal' | 'artifact' | 'multi' | 'empty';
  expect_tool?: string | null;
  expect_tools?: string[];
  expect_refusal?: boolean;
  expect_artifact_kind?: string;
  expect_empty?: boolean;
  /** v1 lineage, when this row continues one of the ten v1 goldens. */
  v1_id?: string;
}

function build(): GoldenRow[] {
  const rows: GoldenRow[] = [];

  // One golden per registered tool, TWO phrasings each (a + b) so macro
  // per-tool grading sees more than one sample of every verb.
  for (const name of ASSISTANT_TOOLS.keys()) {
    const f = TOOL_FIXTURES[name];
    if (!f) {
      throw new Error(`registry tool ${name} has no v2 fixture — add one to scripts/cf-v2/fixtures.ts`);
    }
    const [a, b] = f.questions;
    rows.push({ id: `tool-${name}`, prompt: a, page: f.page, category: 'tool', expect_tool: name });
    rows.push({ id: `tool-${name}-b`, prompt: b ?? a, page: f.page, category: 'tool', expect_tool: name });
  }

  // v1 lineage: the three refusal rows carry their ids; the ROI row survives
  // re-pointed at the real registry's verb for it.
  for (const r of REFUSALS) {
    rows.push({ id: r.id, prompt: r.prompt, page: '/home', category: 'refusal', expect_tool: null, expect_refusal: true });
  }
  const roi = rows.find((r) => r.id === 'tool-get_roi_gaps');
  if (roi) {
    // v1 wf2-roi asked "highest expected ROI price changes" — the phantom
    // repricing tools are gone; the real verb for that intent is get_roi_gaps.
    rows.push({
      id: 'wf2-roi',
      prompt: 'Which operational gaps have the highest expected ROI to fix this week?',
      page: '/home',
      category: 'tool',
      expect_tool: 'get_roi_gaps',
      v1_id: 'wf2-roi',
    });
  }

  for (const c of ARTIFACT_CASES) {
    rows.push({
      id: c.id,
      prompt: c.prompt,
      page: c.page,
      category: 'artifact',
      expect_tool: c.tool,
      expect_artifact_kind: c.kind,
    });
  }

  for (const m of MULTI_TOOL) {
    rows.push({
      id: m.id,
      prompt: m.prompt,
      page: m.page,
      category: 'multi',
      expect_tool: m.steps[0].tool,
      expect_tools: m.steps.map((s) => s.tool),
    });
  }

  for (const tool of EMPTY_RESULT_TOOLS) {
    const f = TOOL_FIXTURES[tool];
    if (!f?.empty) continue;
    rows.push({
      id: `empty-${tool}`,
      prompt: f.questions[0],
      page: f.page,
      category: 'empty',
      expect_tool: tool,
      expect_empty: true,
    });
  }

  return rows;
}

const rows = build();
const outDir = 'evals/cycleforge-v2';
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/golden.jsonl`, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

const byCategory = rows.reduce<Record<string, number>>((acc, r) => {
  acc[r.category] = (acc[r.category] ?? 0) + 1;
  return acc;
}, {});
const tools = new Set(rows.filter((r) => r.category === 'tool').map((r) => r.expect_tool));
console.log(JSON.stringify({ total: rows.length, byCategory, distinctTools: tools.size, registrySize: ASSISTANT_TOOLS.size }, null, 1));
