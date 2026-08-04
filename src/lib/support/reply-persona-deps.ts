import 'server-only';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import type { SupportReplyPersona } from './reply-persona';

/**
 * Read the tenant's own framing for {@link buildSupportSystemPrompt}.
 *
 * The business name is the org's `name`; the vertical is optional and comes
 * from `organizations.settings.support.vertical` when an admin has set it.
 * Degrades to `{}` — the generic "a reseller" clause — on a missing org, an
 * unparseable settings blob, or a DB hiccup. There is no failure mode where
 * guessing a brand would be better; that is the bug this replaced.
 */
export async function resolveSupportReplyPersona(orgId: OrgId): Promise<SupportReplyPersona> {
  try {
    const { rows } = await tenantQuery<{ name: string | null; settings: unknown }>(
      orgId,
      `SELECT name, settings FROM organizations WHERE id = $1 LIMIT 1`,
      [orgId],
    );
    const row = rows[0];
    if (!row) return {};
    const settings =
      row.settings && typeof row.settings === 'object'
        ? (row.settings as Record<string, unknown>)
        : {};
    const support =
      settings.support && typeof settings.support === 'object'
        ? (settings.support as Record<string, unknown>)
        : {};
    const vertical = typeof support.vertical === 'string' ? support.vertical : null;
    return { businessName: row.name ?? null, vertical };
  } catch {
    return {};
  }
}
