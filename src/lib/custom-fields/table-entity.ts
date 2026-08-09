/**
 * Map staff-prefs tableId → custom_field_defs entityType.
 *
 * Only {@link CUSTOM_FIELD_LIVE_ENTITY_TYPES} may return a non-null entity.
 * Unbox History dogfood: receiving / testing → RECEIVING. Orders stays null
 * until ORDER is added to the live allowlist (History-first law).
 */

import type { TableId } from '@/lib/tables/table-columns';
import {
  isCustomFieldEntityLive,
  type CustomFieldEntityType,
} from './types';

const TABLE_ID_TO_ENTITY: Partial<Record<TableId, CustomFieldEntityType>> = {
  receiving: 'RECEIVING',
  testing: 'RECEIVING',
  // orders / shipped → ORDER only after CUSTOM_FIELD_LIVE_ENTITY_TYPES grows.
};

export function customFieldEntityTypeForTableId(
  tableId: TableId,
): CustomFieldEntityType | null {
  const entity = TABLE_ID_TO_ENTITY[tableId];
  if (!entity || !isCustomFieldEntityLive(entity)) return null;
  return entity;
}

/** Derive a snake_case def key from an operator label (Create field form). */
export function labelToCustomFieldKey(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  if (!slug) return 'field';
  if (!/^[a-z]/.test(slug)) return `f_${slug}`.slice(0, 64);
  return slug;
}
