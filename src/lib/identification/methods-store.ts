/**
 * Org-scoped identification_methods rows. Missing table → empty / 503 at the route.
 * Gun classify loads published rows only (load-published.ts).
 */

import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  IdentificationGrammarBody,
  type IdentificationGrammarBody as GrammarBody,
} from '@/lib/schemas/identification-grammar';
import { compileIdentificationGrammar } from './compile-grammar';

export type IdentificationMethodListRow = {
  jobId: string;
  grammar: GrammarBody;
  publishedAt: string | null;
};

function isMissingTable(err: unknown): boolean {
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: unknown }).code) : '';
  if (code === '42P01') return true;
  return /relation ["']?identification_methods["']? does not exist/i.test(String(err));
}

export class IdentificationMethodsUnavailableError extends Error {
  constructor() {
    super('identification_methods table is not applied');
    this.name = 'IdentificationMethodsUnavailableError';
  }
}

export async function listIdentificationMethods(
  organizationId: string,
): Promise<IdentificationMethodListRow[]> {
  const org = String(organizationId ?? '').trim();
  if (!org) return [];
  try {
    const { rows } = await tenantQuery<{
      job_id: string;
      grammar_json: unknown;
      published_at: Date | string | null;
    }>(
      org as OrgId,
      `SELECT job_id, grammar_json, published_at
         FROM identification_methods
        WHERE organization_id = $1
          AND deleted_at IS NULL
        ORDER BY job_id ASC`,
      [org],
    );
    const out: IdentificationMethodListRow[] = [];
    for (const row of rows) {
      const parsed = IdentificationGrammarBody.safeParse(row.grammar_json);
      if (!parsed.success) continue;
      const publishedAt =
        row.published_at == null
          ? null
          : typeof row.published_at === 'string'
            ? row.published_at
            : row.published_at.toISOString();
      out.push({ jobId: row.job_id, grammar: parsed.data, publishedAt });
    }
    return out;
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
}

export async function saveIdentificationMethodDraft(
  organizationId: string,
  raw: unknown,
): Promise<IdentificationMethodListRow> {
  const org = String(organizationId ?? '').trim();
  if (!org) throw new Error('organizationId required');
  const compiled = compileIdentificationGrammar(raw);
  const grammar = compiled.grammar;
  try {
    await withTenantTransaction(org as OrgId, async (client) => {
      await client.query(
        `INSERT INTO identification_methods (organization_id, job_id, grammar_json, published_at, deleted_at)
         VALUES ($1, $2, $3::jsonb, NULL, NULL)
         ON CONFLICT (organization_id, job_id)
         DO UPDATE SET
           grammar_json = EXCLUDED.grammar_json,
           published_at = NULL,
           deleted_at = NULL,
           updated_at = now()`,
        [org, grammar.jobId, JSON.stringify(grammar)],
      );
    });
  } catch (err) {
    if (isMissingTable(err)) throw new IdentificationMethodsUnavailableError();
    throw err;
  }
  return { jobId: grammar.jobId, grammar, publishedAt: null };
}

export async function publishIdentificationMethod(
  organizationId: string,
  jobId: string,
): Promise<IdentificationMethodListRow> {
  const org = String(organizationId ?? '').trim();
  const id = String(jobId ?? '').trim();
  if (!org) throw new Error('organizationId required');
  if (!id) throw new Error('jobId required');
  try {
    const { rows } = await tenantQuery<{
      job_id: string;
      grammar_json: unknown;
      published_at: Date | string | null;
    }>(
      org as OrgId,
      `UPDATE identification_methods
          SET published_at = now(),
              deleted_at = NULL,
              updated_at = now()
        WHERE organization_id = $1
          AND job_id = $2
          AND deleted_at IS NULL
        RETURNING job_id, grammar_json, published_at`,
      [org, id],
    );
    const row = rows[0];
    if (!row) throw new Error('not found');
    const compiled = compileIdentificationGrammar(row.grammar_json);
    const publishedAt =
      row.published_at == null
        ? new Date().toISOString()
        : typeof row.published_at === 'string'
          ? row.published_at
          : row.published_at.toISOString();
    return { jobId: compiled.grammar.jobId, grammar: compiled.grammar, publishedAt };
  } catch (err) {
    if (isMissingTable(err)) throw new IdentificationMethodsUnavailableError();
    throw err;
  }
}
