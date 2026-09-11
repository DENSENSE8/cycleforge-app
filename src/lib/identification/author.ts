/**
 * P4 Studio author — brief → IdentificationGrammarBody (same Zod as a human).
 * The gun path never imports this module. Optional generateJson is the AI waist.
 */

import {
  IDENTIFICATION_JOB_ID_RE,
  IdentificationGrammarBody,
  type IdentificationGrammarBody as GrammarBody,
} from '@/lib/schemas/identification-grammar';
import { compileIdentificationGrammar, IdentificationGrammarError } from './compile-grammar';
import { IDENTIFICATION_JOBS } from './types';

export const IDENTIFICATION_AUTHOR_SYSTEM = `You author Cycle Forge tenant identification barcode grammar.
Return ONLY JSON matching: jobId (snake_case, not scan_out or pick), entityKind "order", mutate null or SHIP_CONFIRM or PICK_CONFIRM, claimPath and sessionPath using /m/id/{jobId}/{entityId}, patterns as prefix or regex.
No lookaround. No nested quantifiers. No markdown.`;

const HOUSE = new Set<string>(IDENTIFICATION_JOBS);

export function authorIdentificationGrammarDeterministic(brief: string): GrammarBody {
  const text = String(brief ?? '').trim();
  if (text.length < 8) {
    throw new IdentificationGrammarError('brief too short');
  }

  const jobMatch = text.match(
    /(?:job(?:\s*id)?|method)\s*[:=]?\s*[`'"]?([a-z][a-z0-9_]{1,62})/i,
  );
  const prefixMatch =
    text.match(/(?:prefix|starts? with|leading)\s+[`'"]?([A-Za-z0-9]{1,16}-)/i) ||
    text.match(/\b([A-Z]{2,12}-)(?:\{|\d|then|the order)/i);

  const prefix = prefixMatch?.[1]?.toUpperCase() ?? null;
  let jobId = (jobMatch?.[1] ?? '').toLowerCase();
  if (!jobId && prefix) {
    const stem = prefix.replace(/-$/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    jobId = stem ? `${stem}_intake` : '';
  }
  if (!IDENTIFICATION_JOB_ID_RE.test(jobId) || HOUSE.has(jobId)) {
    throw new IdentificationGrammarError('could not author a tenant job id from this brief');
  }
  if (!prefix) {
    throw new IdentificationGrammarError('could not author a barcode prefix from this brief');
  }

  return IdentificationGrammarBody.parse({
    jobId,
    entityKind: 'order',
    mutate: null,
    claimPath: `/m/id/${jobId}/{entityId}`,
    sessionPath: `/m/id/${jobId}/{entityId}`,
    patterns: [{ kind: 'prefix', prefix }],
  });
}

export async function authorIdentificationGrammar(
  brief: string,
  generateJson?: (system: string, user: string) => Promise<unknown>,
): Promise<{ grammar: GrammarBody; source: 'ai' | 'deterministic' }> {
  const text = String(brief ?? '').trim();
  if (generateJson) {
    try {
      const raw = await generateJson(IDENTIFICATION_AUTHOR_SYSTEM, text);
      const compiled = compileIdentificationGrammar(raw);
      return { grammar: compiled.grammar, source: 'ai' };
    } catch {
      // Human-publish still needs a valid record — fall back to the local author.
    }
  }
  const grammar = authorIdentificationGrammarDeterministic(text);
  compileIdentificationGrammar(grammar);
  return { grammar, source: 'deterministic' };
}
