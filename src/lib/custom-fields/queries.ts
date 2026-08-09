/**
 * Domain helpers for custom_field_defs / custom_field_values.
 * All reads/writes are org-scoped via tenantQuery / withTenantTransaction.
 */

import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type {
  CustomFieldDef,
  CustomFieldEntityType,
  CustomFieldValueMap,
  CustomFieldValueType,
} from './types';

interface DefRow {
  id: number;
  organization_id: string;
  entity_type: CustomFieldEntityType;
  key: string;
  label: string;
  type: CustomFieldValueType;
  options: unknown;
  sort_order: number;
  archived_at: string | null;
}

function mapDef(row: DefRow): CustomFieldDef {
  return {
    id: Number(row.id),
    organizationId: row.organization_id,
    entityType: row.entity_type,
    key: row.key,
    label: row.label,
    type: row.type,
    options: row.options,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at,
  };
}

export async function listCustomFieldDefs(
  orgId: OrgId,
  entityType: CustomFieldEntityType,
  opts?: { includeArchived?: boolean },
): Promise<CustomFieldDef[]> {
  const includeArchived = opts?.includeArchived === true;
  const result = await tenantQuery<DefRow>(
    orgId,
    `SELECT id, organization_id, entity_type, key, label, type, options, sort_order, archived_at
     FROM custom_field_defs
     WHERE organization_id = $1
       AND entity_type = $2
       ${includeArchived ? '' : 'AND archived_at IS NULL'}
     ORDER BY sort_order ASC, key ASC`,
    [orgId, entityType],
  );
  return result.rows.map(mapDef);
}

export async function createCustomFieldDef(
  orgId: OrgId,
  input: {
    entityType: CustomFieldEntityType;
    key: string;
    label: string;
    type: CustomFieldValueType;
    options?: unknown;
    sortOrder?: number;
  },
): Promise<CustomFieldDef> {
  const result = await withTenantTransaction(orgId, async (client) => {
    return client.query<DefRow>(
      `INSERT INTO custom_field_defs (
         organization_id, entity_type, key, label, type, options, sort_order
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       RETURNING id, organization_id, entity_type, key, label, type, options, sort_order, archived_at`,
      [
        orgId,
        input.entityType,
        input.key,
        input.label,
        input.type,
        input.options == null ? null : JSON.stringify(input.options),
        input.sortOrder ?? 0,
      ],
    );
  });
  return mapDef(result.rows[0]!);
}

export async function archiveCustomFieldDef(
  orgId: OrgId,
  defId: number,
): Promise<CustomFieldDef | null> {
  const result = await withTenantTransaction(orgId, async (client) => {
    return client.query<DefRow>(
      `UPDATE custom_field_defs
       SET archived_at = now(), updated_at = now()
       WHERE organization_id = $1 AND id = $2 AND archived_at IS NULL
       RETURNING id, organization_id, entity_type, key, label, type, options, sort_order, archived_at`,
      [orgId, defId],
    );
  });
  const row = result.rows[0];
  return row ? mapDef(row) : null;
}

/**
 * One aggregated read for a virtualized page — never N joins per field.
 * Returns Map<entityId, { [defKey]: value }>.
 */
async function hydrateCustomFieldMaps(
  orgId: OrgId,
  entityType: CustomFieldEntityType,
  entityIds: readonly number[],
): Promise<Map<number, CustomFieldValueMap>> {
  const out = new Map<number, CustomFieldValueMap>();
  if (entityIds.length === 0) return out;

  const result = await tenantQuery<{
    entity_id: number;
    custom_fields: CustomFieldValueMap | null;
  }>(
    orgId,
    `SELECT v.entity_id,
            jsonb_object_agg(
              d.key,
              CASE d.type
                WHEN 'number' THEN to_jsonb(v.value_number)
                WHEN 'date' THEN to_jsonb(v.value_date)
                WHEN 'boolean' THEN to_jsonb(v.value_text = 'true')
                ELSE to_jsonb(v.value_text)
              END
            ) AS custom_fields
     FROM custom_field_values v
     INNER JOIN custom_field_defs d
       ON d.id = v.field_id
      AND d.organization_id = v.organization_id
     WHERE v.organization_id = $1
       AND v.entity_type = $2
       AND v.entity_id = ANY($3::bigint[])
       AND d.archived_at IS NULL
     GROUP BY v.entity_id`,
    [orgId, entityType, entityIds],
  );

  for (const row of result.rows) {
    out.set(Number(row.entity_id), row.custom_fields ?? {});
  }
  return out;
}

export async function upsertCustomFieldValue(
  orgId: OrgId,
  input: {
    fieldId: number;
    entityType: CustomFieldEntityType;
    entityId: number;
    type: CustomFieldValueType;
    value: string | number | boolean | null;
  },
): Promise<void> {
  let valueText: string | null = null;
  let valueNumber: number | null = null;
  let valueDate: string | null = null;

  if (input.value != null && input.value !== '') {
    switch (input.type) {
      case 'number':
        valueNumber = typeof input.value === 'number' ? input.value : Number(input.value);
        if (!Number.isFinite(valueNumber)) {
          throw new Error('Invalid number value');
        }
        break;
      case 'date':
        valueDate = String(input.value).slice(0, 10);
        break;
      case 'boolean':
        valueText = input.value === true || input.value === 'true' ? 'true' : 'false';
        break;
      default:
        valueText = String(input.value);
    }
  } else {
    // Empty → delete the value row (column shows blank).
    await withTenantTransaction(orgId, async (client) => {
      await client.query(
        `DELETE FROM custom_field_values
         WHERE organization_id = $1 AND field_id = $2 AND entity_id = $3`,
        [orgId, input.fieldId, input.entityId],
      );
    });
    return;
  }

  await withTenantTransaction(orgId, async (client) => {
    await client.query(
      `INSERT INTO custom_field_values (
         organization_id, field_id, entity_type, entity_id,
         value_text, value_number, value_date
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::date)
       ON CONFLICT (organization_id, field_id, entity_id) DO UPDATE SET
         value_text = EXCLUDED.value_text,
         value_number = EXCLUDED.value_number,
         value_date = EXCLUDED.value_date,
         updated_at = now()`,
      [
        orgId,
        input.fieldId,
        input.entityType,
        input.entityId,
        valueText,
        valueNumber,
        valueDate,
      ],
    );
  });
}

/** Attach `customFields` onto rows that already have numeric `id`. */
export async function attachCustomFieldsToRows<T extends { id: number }>(
  orgId: OrgId,
  entityType: CustomFieldEntityType,
  rows: T[],
): Promise<Array<T & { customFields?: CustomFieldValueMap }>> {
  if (rows.length === 0) return rows;
  const maps = await hydrateCustomFieldMaps(
    orgId,
    entityType,
    rows.map((r) => r.id),
  );
  return rows.map((row) => {
    const customFields = maps.get(row.id);
    return customFields && Object.keys(customFields).length > 0
      ? { ...row, customFields }
      : row;
  });
}
