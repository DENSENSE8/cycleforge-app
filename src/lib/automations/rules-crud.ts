/**
 * CRUD for automation_rules — listing→staff OMS automations.
 */

import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { normalizeItemNumber } from '@/lib/automations/listing-match';
import type {
  AutomationRuleCreateBody,
  AutomationRuleUpdateBody,
} from '@/lib/schemas/automations';
import { AUTOMATION_TRIGGER_KEYS } from '@/lib/schemas/automations';

export type AutomationRuleDto = {
  id: number;
  name: string;
  description: string | null;
  enabled: boolean;
  priority: number;
  triggerKeys: string[];
  when: Record<string, unknown>;
  then: unknown[];
  createdAt: string;
  updatedAt: string;
};

type RuleRow = {
  id: number;
  name: string;
  description: string | null;
  enabled: boolean;
  priority: number;
  trigger_keys: string[] | null;
  when_json: Record<string, unknown> | null;
  then_json: unknown;
  created_at: string | Date;
  updated_at: string | Date;
};

function mapRow(row: RuleRow): AutomationRuleDto {
  return {
    id: Number(row.id),
    name: String(row.name),
    description: row.description == null ? null : String(row.description),
    enabled: Boolean(row.enabled),
    priority: Number(row.priority) || 100,
    triggerKeys: Array.isArray(row.trigger_keys) ? row.trigger_keys.map(String) : [],
    when: (row.when_json && typeof row.when_json === 'object' ? row.when_json : {}) as Record<
      string,
      unknown
    >,
    then: Array.isArray(row.then_json) ? row.then_json : [],
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function normalizeWhen(when: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (when.item_number != null) {
    out.item_number = normalizeItemNumber(String(when.item_number));
  }
  if (when.sku_catalog_id != null) {
    out.sku_catalog_id = String(when.sku_catalog_id);
  }
  if (when.sku != null && String(when.sku).trim()) {
    out.sku = String(when.sku).trim();
  }
  if (when.account_source != null && String(when.account_source).trim()) {
    out.account_source = String(when.account_source).trim().toLowerCase();
  }
  return out;
}

const DEFAULT_TRIGGERS = [...AUTOMATION_TRIGGER_KEYS];

export async function listAutomationRules(
  organizationId: OrgId,
  opts: { includeDisabled?: boolean } = {},
): Promise<AutomationRuleDto[]> {
  const r = await tenantQuery<RuleRow>(
    organizationId,
    `SELECT id, name, description, enabled, priority, trigger_keys, when_json, then_json,
            created_at, updated_at
       FROM automation_rules
      WHERE organization_id = $1
        AND deleted_at IS NULL
        ${opts.includeDisabled ? '' : 'AND enabled = true'}
      ORDER BY priority ASC, id ASC`,
    [organizationId],
  );
  return r.rows.map(mapRow);
}

export async function getAutomationRule(
  organizationId: OrgId,
  id: number,
): Promise<AutomationRuleDto | null> {
  const r = await tenantQuery<RuleRow>(
    organizationId,
    `SELECT id, name, description, enabled, priority, trigger_keys, when_json, then_json,
            created_at, updated_at
       FROM automation_rules
      WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL
      LIMIT 1`,
    [organizationId, id],
  );
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}

export async function createAutomationRule(
  organizationId: OrgId,
  body: AutomationRuleCreateBody,
  staffId: number | null,
): Promise<AutomationRuleDto> {
  const when = normalizeWhen(body.when as Record<string, unknown>);
  const triggerKeys = body.triggerKeys?.length ? body.triggerKeys : DEFAULT_TRIGGERS;
  const r = await tenantQuery<RuleRow>(
    organizationId,
    `INSERT INTO automation_rules (
       organization_id, name, description, enabled, priority, trigger_keys,
       when_json, then_json, created_by_staff_id, updated_by_staff_id
     ) VALUES (
       $1, $2, $3, $4, $5, $6::text[], $7::jsonb, $8::jsonb, $9, $9
     )
     RETURNING id, name, description, enabled, priority, trigger_keys, when_json, then_json,
               created_at, updated_at`,
    [
      organizationId,
      body.name,
      body.description ?? null,
      body.enabled ?? true,
      body.priority ?? 100,
      triggerKeys,
      JSON.stringify(when),
      JSON.stringify(body.then),
      staffId,
    ],
  );
  return mapRow(r.rows[0]);
}

export async function updateAutomationRule(
  organizationId: OrgId,
  id: number,
  body: AutomationRuleUpdateBody,
  staffId: number | null,
): Promise<AutomationRuleDto | null> {
  const existing = await getAutomationRule(organizationId, id);
  if (!existing) return null;

  const when =
    body.when != null
      ? normalizeWhen(body.when as Record<string, unknown>)
      : existing.when;
  const then = body.then != null ? body.then : existing.then;
  const triggerKeys = body.triggerKeys ?? existing.triggerKeys;

  const r = await tenantQuery<RuleRow>(
    organizationId,
    `UPDATE automation_rules
        SET name = $3,
            description = $4,
            enabled = $5,
            priority = $6,
            trigger_keys = $7::text[],
            when_json = $8::jsonb,
            then_json = $9::jsonb,
            updated_by_staff_id = $10,
            updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      RETURNING id, name, description, enabled, priority, trigger_keys, when_json, then_json,
                created_at, updated_at`,
    [
      id,
      organizationId,
      body.name ?? existing.name,
      body.description === undefined ? existing.description : body.description,
      body.enabled ?? existing.enabled,
      body.priority ?? existing.priority,
      triggerKeys,
      JSON.stringify(when),
      JSON.stringify(then),
      staffId,
    ],
  );
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}

export async function softDeleteAutomationRule(
  organizationId: OrgId,
  id: number,
  staffId: number | null,
): Promise<boolean> {
  return withTenantTransaction(organizationId, async (client) => {
    const r = await client.query(
      `UPDATE automation_rules
          SET deleted_at = NOW(),
              updated_by_staff_id = $3,
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
        RETURNING id`,
      [id, organizationId, staffId],
    );
    return (r.rowCount ?? 0) > 0;
  });
}
