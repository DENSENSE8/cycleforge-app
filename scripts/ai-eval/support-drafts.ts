/**
 * `pnpm eval:support-drafts` — the Support draft eval.
 *
 * DETERMINISTIC (default, no network, no DB): each fixture's fixed "model
 * output" runs through the real post-generation pipeline
 * (`suggestSupportReplyCore`: validators → marketplace policy → confidence)
 * and must land exactly as pinned. Exit 1 on any failure — this is a gate.
 *
 * LIVE (`--live`, `pnpm eval:support-drafts:live`): each live fixture context
 * is drafted by the org's AI provider chain (`makeSuggestDeps`: failover via
 * `postToAiProvider`) and scored against the drafting rules:
 *   no placeholders · no unproven claims / invented ids · valid weekday/date
 *   pairs · answers the question (fixture `mustMention`) · nothing forbidden
 *   (`mustNotMention`).
 * Live mode WRITES NOTHING to the database: contexts are fixtures (no DB read
 * of a Support item), retrieval arms are stubbed empty, and usage metering is
 * a no-op sink. The provider chain reads this org's AI config only.
 *
 * Flags: --live  --org <uuid> (default: the dogfood org)  --only <substring>
 *        --min-pass 0..1 (live only; default 0 = report)
 */
import { applyMarketplacePolicy } from '@/lib/support/conversation/marketplace-policy';
import { validateSupportDraft } from '@/lib/support/drafts/validate';
import { suggestSupportReplyCore, type SuggestDeps } from '@/lib/support/suggest-reply-core';
import { DETERMINISTIC_CASES, LIVE_CASES, type DeterministicDraftCase } from './support-drafts-fixtures';

function flag(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? '') : null;
}

const only = flag('only');

function stubDeps(draft: string): SuggestDeps {
  return {
    queryRag: async () => ({ answer: '', sources: [], chunks: [] }),
    searchRecords: async () => [],
    generate: async () => ({ text: draft, model: 'fixture' }),
    applyChannelPolicy: applyMarketplacePolicy,
  };
}

async function runDeterministicCase(c: DeterministicDraftCase): Promise<string[]> {
  const out = await suggestSupportReplyCore({ context: c.context, kind: c.kind, vision: 'local-only' }, stubDeps(c.draft));
  // The validator's own verdict (severity, problems) and the pipeline's final body + confidence.
  const { severe, warnings: problems } = validateSupportDraft({ body: c.draft, kind: c.kind, context: c.context });
  const failures: string[] = [];
  if (severe !== c.expect.severe) failures.push(`severe: expected ${c.expect.severe}, got ${severe} (${problems.join(' | ') || 'no problems'})`);
  for (const re of c.expect.warnings ?? []) {
    if (!problems.some((w) => re.test(w))) failures.push(`missing warning ${re}`);
  }
  if (c.expect.clean && problems.length) failures.push(`expected clean, got: ${problems.join(' | ')}`);
  for (const re of c.expect.missingFacts ?? []) {
    if (!out.missingFacts.some((m) => re.test(m))) failures.push(`missing fact ${re} not reported`);
  }
  for (const re of c.expect.bodyIncludes ?? []) if (!re.test(out.suggestion)) failures.push(`body lacks ${re}`);
  for (const re of c.expect.bodyExcludes ?? []) if (re.test(out.suggestion)) failures.push(`body still has ${re}`);
  if (c.expect.confidence && out.confidence !== c.expect.confidence) failures.push(`confidence ${out.confidence} ≠ ${c.expect.confidence}`);
  return failures;
}

async function runDeterministic(): Promise<number> {
  const cases = DETERMINISTIC_CASES.filter((c) => !only || c.name.includes(only));
  let failed = 0;
  for (const c of cases) {
    const failures = await runDeterministicCase(c);
    if (failures.length) failed += 1;
    console.log(`${failures.length ? '✗' : '✓'} ${c.name}${failures.length ? `\n    ${failures.join('\n    ')}` : ''}`);
  }
  console.log(`\nsupport-drafts deterministic: ${cases.length - failed}/${cases.length} passed`);
  return failed ? 1 : 0;
}

async function runLive(): Promise<number> {
  const [{ makeSuggestDeps }, { DOGFOOD_ORG_ID }] = await Promise.all([
    import('@/lib/support/suggest-reply'),
    import('@/lib/tenancy/constants'),
  ]);
  const orgId = flag('org') || DOGFOOD_ORG_ID;
  const minPass = Number(flag('min-pass') ?? 0);
  const deps: SuggestDeps = {
    ...makeSuggestDeps(orgId, null, () => {}),
    queryRag: async () => ({ answer: '', sources: [], chunks: [] }),
    searchRecords: async () => [],
  };
  const cases = LIVE_CASES.filter((c) => !only || c.name.includes(only));
  let passed = 0;
  for (const c of cases) {
    const started = Date.now();
    try {
      const out = await suggestSupportReplyCore({ context: c.context, kind: c.kind, vision: 'local-only' }, deps);
      const checks: Array<[string, boolean]> = [
        ['no placeholders', !out.warnings.some((w) => /placeholder/.test(w) && !/^Removed/.test(w))],
        ['no unproven claims', !out.warnings.some((w) => /^Says /.test(w))],
        ['no invented ids', !out.warnings.some((w) => /no linked record contains/.test(w))],
        ['no unsupported specifics', !out.warnings.some((w) => /^States "/.test(w))],
        ['no unbacked commitments', !out.warnings.some((w) => /^Commits to /.test(w))],
        ['no contact-us', !out.warnings.some((w) => /^Asks the customer to contact us/.test(w))],
        ['no apology opener / filler', !out.warnings.some((w) => /^Removed (?:apology opener|filler)|^Opens with an apology/.test(w))],
        ['no needless questions', !out.warnings.some((w) => /already linked/.test(w))],
        ['weekday/date valid', !out.warnings.some((w) => /is a \w+day, not a|not a real calendar date|in the past|tomorrow is|today is|yesterday is/.test(w))],
        ['answers the question', c.mustMention.every((re) => re.test(out.suggestion))],
        ['nothing forbidden', !c.mustNotMention.some((re) => re.test(out.suggestion))],
      ];
      const failedChecks = checks.filter(([, ok]) => !ok).map(([n]) => n);
      if (!failedChecks.length) passed += 1;
      console.log(
        `${failedChecks.length ? '✗' : '✓'} ${c.name} · ${out.model} · ${out.confidence} · ${Date.now() - started} ms` +
          `${failedChecks.length ? `\n    failed: ${failedChecks.join(', ')}` : ''}` +
          `${out.warnings.length ? `\n    warnings: ${out.warnings.join(' | ')}` : ''}` +
          `\n    ${out.suggestion.replace(/\n/g, '\n    ')}`,
      );
    } catch (err) {
      console.log(`✗ ${c.name} · error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const ratio = cases.length ? passed / cases.length : 1;
  console.log(`\nsupport-drafts live (org ${orgId}): ${passed}/${cases.length} passed`);
  return ratio < minPass ? 1 : 0;
}

void (process.argv.includes('--live') ? runLive() : runDeterministic()).then((code) => process.exit(code));
