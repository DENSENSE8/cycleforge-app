import 'server-only';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import type { SupportReplyPersona } from './reply-persona';

/** Read the tenant's own framing for {@link buildSupportSystemPrompt}. */
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
