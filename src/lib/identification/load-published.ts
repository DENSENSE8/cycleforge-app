/**
 * Org-scoped published identification methods. Missing table → empty
 * (migration not applied yet). Gun path compiles stored grammar JSON, never LLM.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  compileIdentificationGrammar,
  type CompiledIdentificationMethod,
} from './compile-grammar';

type MethodRow = {
  job_id: string;
  grammar_json: unknown;
};

export async function loadPublishedIdentificationMethods(
  organizationId: string,
): Promise<CompiledIdentificationMethod[]> {
  const org = String(organizationId ?? '').trim();
  if (!org) return [];
  try {
    const { rows } = await tenantQuery<MethodRow>(
      org as OrgId,
      `SELECT job_id, grammar_json
         FROM identification_methods
        WHERE organization_id = $1
          AND published_at IS NOT NULL
          AND deleted_at IS NULL
        ORDER BY id ASC`,
      [org],
    );
    const out: CompiledIdentificationMethod[] = [];
    for (const row of rows) {
      try {
        const compiled = compileIdentificationGrammar(row.grammar_json);
        if (compiled.record.id !== row.job_id) continue;
        out.push(compiled);
      } catch {
        // Skip a bad published row rather than stall the gun path.
      }
    }
    return out;
  } catch {
    return [];
  }
}
