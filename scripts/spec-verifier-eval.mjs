#!/usr/bin/env node
/**
 * Choose the spec-loop verifier model by evidence, not taste.
 *
 * Runs every candidate over the labelled cases in tools/spec-loop/verifier-cases.json (real
 * spec-loop diffs + adversarial variants), with the production prompt
 * (tools/spec-loop/verifier.mjs). Writes a receipt to .garisek/spec-verifier-eval/<ISO>.json.
 *
 * Selection rule (deterministic, in order):
 *   1. not the writer's family (graders favour their own family's output)
 *   2. reliable: ≤10% unverified (no verdict / provider error) — an absent gate is no gate
 *   3. fewest false confirms (a verifier that waves a bad change through is worse than useless)
 *   4. highest accuracy   5. lowest median seconds   6. lowest cost
 *
 *   node scripts/spec-verifier-eval.mjs [--reps 2] [--models a,b,c] [--writer xai-oauth/grok-4.7]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildVerifierPrompt, parseVerdict, VERIFIER_TOOLS } from '../tools/spec-loop/verifier.mjs';
import { runOmp } from '../tools/spec-loop/omp.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d);
const REPS = Number(opt('reps', '2'));
const WRITER = opt('writer', 'xai-oauth/grok-4.7');
const MODELS = opt(
  'models',
  'anthropic/claude-haiku-4-5,google-antigravity/gemini-3.8-flash,openai-codex/gpt-5.5,zai/glm-5-turbo,xai-oauth/grok-4.7',
).split(',');
const CONCURRENCY = Number(opt('concurrency', '6'));

/** Family = vendor of the weights, not the provider routing them. */
function familyOf(model) {
  const m = model.toLowerCase();
  if (m.includes('grok')) return 'xai';
  if (m.includes('claude') || m.includes('haiku') || m.includes('sonnet') || m.includes('opus')) return 'anthropic';
  if (m.includes('gemini')) return 'google';
  if (m.includes('gpt') || m.includes('codex')) return 'openai';
  return m.split('/')[0];
}

const set = JSON.parse(fs.readFileSync(path.join(REPO, 'tools/spec-loop/verifier-cases.json'), 'utf8'));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = path.join(REPO, '.garisek', 'spec-verifier-eval', stamp);
fs.mkdirSync(dir, { recursive: true });

const jobs = [];
for (const model of MODELS) for (const c of set.cases) for (let rep = 0; rep < REPS; rep++) jobs.push({ model, c, rep });

const results = [];
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const { model, c, rep } = jobs[next++];
    const label = `${model.replace(/[^\w.-]/g, '_')}--${c.id}--${rep}`;
    const promptFile = path.join(dir, `${label}.md`);
    fs.writeFileSync(promptFile, buildVerifierPrompt({ contracts: c.contracts ?? set.contracts, findings: c.findings ?? set.findings, diff: c.diff }));
    const run = await runOmp({ cwd: REPO, model, thinking: 'low', tools: VERIFIER_TOOLS, promptFile, outFile: path.join(dir, `${label}.jsonl`), maxTime: '6m' });
    const { verdict, reasons } = parseVerdict(run.text);
    results.push({ model, case: c.id, expect: c.expect, verdict, correct: verdict === c.expect, seconds: run.seconds, cost: run.cost, reasons });
    process.stdout.write(`${verdict === c.expect ? '✓' : '✗'} ${model.padEnd(30)} ${c.id.padEnd(26)} ${verdict.padEnd(10)} ${run.seconds}s\n`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
const table = MODELS.map((model) => {
  const rows = results.filter((r) => r.model === model);
  return {
    model,
    family: familyOf(model),
    otherFamily: familyOf(model) !== familyOf(WRITER),
    eligible: familyOf(model) !== familyOf(WRITER) && rows.filter((r) => r.verdict === 'unverified').length <= rows.length * 0.1,
    runs: rows.length,
    accuracy: rows.filter((r) => r.correct).length / rows.length,
    falseConfirm: rows.filter((r) => r.expect === 'refute' && r.verdict === 'confirm').length,
    falseRefute: rows.filter((r) => r.expect === 'confirm' && r.verdict === 'refute').length,
    unverified: rows.filter((r) => r.verdict === 'unverified').length,
    medianSeconds: median(rows.map((r) => r.seconds)),
    cost: rows.reduce((n, r) => n + r.cost, 0),
  };
});
const ranked = [...table].sort(
  (a, b) =>
    Number(b.eligible) - Number(a.eligible) ||
    a.falseConfirm - b.falseConfirm ||
    b.accuracy - a.accuracy ||
    a.medianSeconds - b.medianSeconds ||
    a.cost - b.cost,
);
const receipt = { at: new Date().toISOString(), host: os.hostname(), writer: WRITER, reps: REPS, cases: set.cases.map((c) => ({ id: c.id, expect: c.expect })), table: ranked, chosen: ranked.find((r) => r.eligible)?.model ?? null, results };
fs.writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');

process.stdout.write('\nmodel                           family     elig  acc   falseConfirm falseRefute unverified  med_s  cost\n');
for (const r of ranked) {
  process.stdout.write(
    `${r.model.padEnd(31)} ${r.family.padEnd(10)} ${r.eligible ? 'yes ' : 'no  '} ${r.accuracy.toFixed(2)}  ${String(r.falseConfirm).padEnd(12)} ${String(r.falseRefute).padEnd(11)} ${String(r.unverified).padEnd(11)} ${String(r.medianSeconds).padEnd(6)} $${r.cost.toFixed(4)}\n`,
  );
}
process.stdout.write(`\nchosen verifier: ${receipt.chosen}\nreceipt: ${path.join(dir, 'receipt.json')}\n`);
