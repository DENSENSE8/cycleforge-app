/** Polymorphic parents the schema / CHECK constraint knows (storage vocabulary). */
export const CUSTOM_FIELD_ENTITY_TYPES = ['ORDER', 'RECEIVING'] as const;
export type CustomFieldEntityType = (typeof CUSTOM_FIELD_ENTITY_TYPES)[number];

/** Entity types allowed to paint / create / hydrate custom columns **in product**. */
const CUSTOM_FIELD_LIVE_ENTITY_TYPES = ['RECEIVING'] as const satisfies readonly CustomFieldEntityType[];

type CustomFieldLiveEntityType = (typeof CUSTOM_FIELD_LIVE_ENTITY_TYPES)[number];

export function isCustomFieldEntityLive(
  entityType: string,
): entityType is CustomFieldLiveEntityType {
  return (CUSTOM_FIELD_LIVE_ENTITY_TYPES as readonly string[]).includes(entityType);
}

export const CUSTOM_FIELD_VALUE_TYPES = [
  'text',
  'number',
  'date',
  'select',
  'boolean',
] as const;
export type CustomFieldValueType = (typeof CUSTOM_FIELD_VALUE_TYPES)[number];

export interface CustomFieldDef {
  id: number;
  organizationId: string;
  entityType: CustomFieldEntityType;
  key: string;
  label: string;
  type: CustomFieldValueType;
  /** Select options only — `{ label, value }[]` or string[]. */
  options: unknown;
  sortOrder: number;
  archivedAt: string | null;
}

/** Hydrated per-row map: def `key` → display/JSON value. */
export type CustomFieldValueMap = Record<string, string | number | boolean | null>;
