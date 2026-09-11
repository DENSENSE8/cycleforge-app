/**
 * Studio waist: barcode grammar AST → compiled classify (Zod + regex).
 * The gun path never calls an LLM; it only runs this compiled function.
 */

import {
  IdentificationClassifyHit,
  IdentificationGrammarBody,
  type IdentificationGrammarBody as GrammarBody,
  type IdentificationClassifyHit as ClassifyHit,
} from '@/lib/schemas/identification-grammar';
import { IDENTIFICATION_JOBS } from './types';
import type { IdentificationJobRecord } from './jobs';

const HOUSE_IDS = new Set<string>(IDENTIFICATION_JOBS);

export class IdentificationGrammarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdentificationGrammarError';
  }
}

export type CompiledIdentificationMethod = {
  record: IdentificationJobRecord;
  grammar: GrammarBody;
  classify: (raw: string) => ClassifyHit | null;
};

function pathFn(template: string): (entityId: string) => string {
  return (entityId: string) =>
    template
      .replaceAll('{entityId}', encodeURIComponent(entityId))
      .replaceAll('{id}', encodeURIComponent(entityId));
}

function compileRegex(source: string): RegExp {
  if (/\(\?/.test(source)) {
    throw new IdentificationGrammarError('regex lookaround / flags in pattern are not allowed');
  }
  if (/\*\+|\+\*|\+\+|\*\*/.test(source)) {
    throw new IdentificationGrammarError('nested quantifiers are not allowed');
  }
  try {
    return new RegExp(source);
  } catch {
    throw new IdentificationGrammarError('invalid regex source');
  }
}

export function compileIdentificationGrammar(raw: unknown): CompiledIdentificationMethod {
  const grammar = IdentificationGrammarBody.parse(raw);
  if (HOUSE_IDS.has(grammar.jobId)) {
    throw new IdentificationGrammarError(`jobId ${grammar.jobId} is a house job`);
  }

  const testers = grammar.patterns.map((pattern) => {
    if (pattern.kind === 'prefix') {
      const prefix = pattern.prefix;
      return (text: string): string | null => {
        if (!text.startsWith(prefix)) return null;
        const rest = text.slice(prefix.length).trim();
        return rest || null;
      };
    }
    const re = compileRegex(pattern.source);
    const group = pattern.entityGroup ?? 1;
    return (text: string): string | null => {
      const m = re.exec(text);
      if (!m) return null;
      const captured = m[group] ?? m[0];
      const entityId = String(captured ?? '').trim();
      return entityId || null;
    };
  });

  const classify = (rawScan: string): ClassifyHit | null => {
    const text = String(rawScan ?? '').trim();
    if (!text) return null;
    for (const test of testers) {
      const entityId = test(text);
      if (!entityId) continue;
      const parsed = IdentificationClassifyHit.safeParse({
        jobId: grammar.jobId,
        entityId,
      });
      if (parsed.success) return parsed.data;
    }
    return null;
  };

  const record: IdentificationJobRecord = {
    id: grammar.jobId,
    origin: 'tenant',
    entityKind: grammar.entityKind,
    mutate: grammar.mutate,
    claimPath: pathFn(grammar.claimPath),
    sessionPath: pathFn(grammar.sessionPath),
  };

  return { record, grammar, classify };
}

export function classifyIdentificationScan(
  raw: string,
  methods: readonly CompiledIdentificationMethod[],
): ClassifyHit | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  for (const method of methods) {
    const hit = method.classify(text);
    if (hit) return hit;
  }
  return null;
}
