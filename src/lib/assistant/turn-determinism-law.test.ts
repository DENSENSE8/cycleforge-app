/**
 * TURN DETERMINISM — the mechanical half of {@link TURN_DETERMINISM_LAW}.
 *
 * The recall check REPLAYS the real selector over the real goldens, because a
 * grep cannot prove recall. It is the exact probe that found the iteration-5
 * defect, frozen as a ratchet so the same class cannot come back a third time.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  FORBIDDEN_IN_TOOL_PATH,
  PROMPT_PATH_PURE_MODULES,
  SUBSET_RECALL_DEBT,
  TURN_DETERMINISM_ACCEPTANCE,
  TURN_DETERMINISM_LAW,
} from './turn-determinism-law';
import { subsetAdvertisedTools } from './tool-subsetting';
import { listAssistantTools } from './tools';
import { buildWriteTools } from './tools/write-tools';
import { toOpenAiFunctionTool, type OpenAiFunctionTool } from './tools/openai-schema';
import { UI_TOOLS } from './agent-loop';

const REPO = process.cwd();
const read = (rel: string) => readFileSync(path.join(REPO, rel), 'utf8');

describe('turn determinism — the law is quotable and complete', () => {
  it('every invariant states the rule, not just its name', () => {
    for (const [id, text] of Object.entries(TURN_DETERMINISM_LAW)) {
      assert.ok(text.length > 80, `${id}: the law must state the rule, not name it`);
    }
  });

  it('the acceptance test names the replay property', () => {
    assert.match(TURN_DETERMINISM_ACCEPTANCE, /identical|byte/i);
  });
});

describe('turn determinism — the advertisement selector stays a pure leaf', () => {
  it('takes no network, no clock and no randomness', () => {
    for (const rel of PROMPT_PATH_PURE_MODULES) {
      const code = read(rel);
      for (const forbidden of ['fetch(', 'Date.now(', 'new Date(', 'Math.random(', 'process.env']) {
        assert.ok(
          !code.includes(forbidden),
          `${rel} uses ${forbidden} — the advertisement must be a pure function of the turn text, or a replayed golden stops rebuilding the same prompt.`,
        );
      }
    }
  });

  it('imports types only, so nothing it depends on can reach outward', () => {
    for (const rel of PROMPT_PATH_PURE_MODULES) {
      const valueImports = read(rel)
        .split('\n')
        .filter((l) => /^import\s/.test(l) && !/^import\s+type\s/.test(l));
      assert.deepEqual(
        valueImports,
        [],
        `${rel} has a value import — a leaf cannot acquire a dependency that fetches. Keep it type-only:\n${valueImports.join('\n')}`,
      );
    }
  });
});

describe('turn determinism — external data enters by ingest, never by turn', () => {
  it('no web-search SDK appears in the assistant tool path', () => {
    const TOOL_DIR = 'src/lib/assistant/tools';
    const walk = (rel: string): string[] => {
      const abs = path.join(REPO, rel);
      if (!existsSync(abs)) return [];
      return readdirSync(abs).flatMap((entry) => {
        const child = `${rel}/${entry}`;
        if (statSync(path.join(REPO, child)).isDirectory()) return walk(child);
        return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [child] : [];
      });
    };
    const offenders: string[] = [];
    for (const file of walk(TOOL_DIR)) {
      const code = read(file);
      for (const sdk of FORBIDDEN_IN_TOOL_PATH) {
        if (code.includes(sdk)) offenders.push(`${file} → ${sdk}`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      'a web-search provider reached the per-turn tool path. Benchmarks enter by scheduled ingest into a table with a source and an as_of — a live fetch makes the graded prompt non-reproducible and cannot be cited:\n' +
        offenders.join('\n'),
    );
  });
});

describe('turn determinism — the advertisement never evicts its own subject', () => {
  const GOLDENS = 'evals/cycleforge-v2/golden.jsonl';

  const WIDE_PERMS = new Set([
    'dashboard.view', 'studio.view', 'assistant.chat', 'operations.view', 'warranty.view',
    'work_orders.view', 'photos.view', 'receiving.view', 'integrations.google.read',
    'integrations.google.connect', 'integrations.zendesk', 'operations.plans.view',
    'tool_forge.search', 'tool_forge.decide', 'tool_forge.build', 'tool_forge.commit',
  ]);
  const CTX = {
    organizationId: '00000000-0000-0000-0000-000000000002',
    staffId: 1,
    permissions: WIDE_PERMS,
  } as never;

  const toSchema = (t: { name: string; description: string; inputSchema: unknown }) =>
    toOpenAiFunctionTool({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Record<string, unknown>,
    });

  const allTools = (): OpenAiFunctionTool[] => [
    ...listAssistantTools(CTX).map(toSchema),
    ...buildWriteTools(null).map(toSchema),
    ...UI_TOOLS.map((t) =>
      toOpenAiFunctionTool({
        name: t.name,
        description: t.description ?? '',
        input_schema: t.input_schema as unknown as Record<string, unknown>,
      }),
    ),
  ];

  interface Row {
    id: string;
    prompt: string;
    page: string;
    expect_tool?: string | null;
    expect_tools?: string[];
    expect_refusal?: boolean;
  }

  const measureMisses = (): { id: string; missing: string[] }[] => {
    const tools = allTools();
    const rows: Row[] = read(GOLDENS)
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as Row);
    const misses: { id: string; missing: string[] }[] = [];
    for (const row of rows) {
      if (row.expect_refusal) continue;
      const advertised = new Set(
        subsetAdvertisedTools(row.prompt, { page: row.page }, tools).tools.map(
          (t) => t.function.name,
        ),
      );
      const expected = (row.expect_tools ?? [row.expect_tool ?? '']).filter(Boolean) as string[];
      const missing = expected.filter((t) => !advertised.has(t));
      if (missing.length) misses.push({ id: row.id, missing });
    }
    return misses;
  };

  it('render_artifact is advertised on every single turn', () => {
    const tools = allTools();
    const rows: Row[] = read(GOLDENS)
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as Row);
    const without = rows
      .filter(
        (row) =>
          !subsetAdvertisedTools(row.prompt, { page: row.page }, tools).tools.some(
            (t) => t.function.name === 'render_artifact',
          ),
      )
      .map((r) => r.id);
    assert.deepEqual(
      without,
      [],
      'render_artifact left an advertisement. Every data answer lands through it, so dropping it makes the turn unanswerable:\n' +
        without.join('\n'),
    );
  });

  it('the recall debt never grows — a new eviction fails here, not in a graded run', () => {
    const measured = measureMisses().map((m) => m.id).sort();
    const known = SUBSET_RECALL_DEBT.map((d) => d.golden).sort();
    const newMisses = measured.filter((id) => !known.includes(id));
    assert.deepEqual(
      newMisses,
      [],
      'a golden\'s expected tool is no longer advertised. The model will be scored for not calling a tool it was never shown, and a real operator asking that question cannot be answered:\n' +
        newMisses.join('\n'),
    );
  });

  it('every recorded miss is still real — the debt list cannot rot', () => {
    const measured = new Set(measureMisses().map((m) => m.id));
    const fixed = SUBSET_RECALL_DEBT.filter((d) => !measured.has(d.golden)).map((d) => d.golden);
    assert.deepEqual(
      fixed,
      [],
      'these goldens now resolve their tool — delete them from SUBSET_RECALL_DEBT so the ratchet keeps tightening:\n' +
        fixed.join('\n'),
    );
  });

  it('each miss names the phrase that failed, so the fix is a mechanism not an alias', () => {
    for (const d of SUBSET_RECALL_DEBT) {
      assert.ok(
        d.missedPhrase.length > 20,
        `${d.golden}: name the phrase the ranker failed to match, not just the tool`,
      );
    }
  });
});
