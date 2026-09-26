/** Custom-field column keys on LedgerGrid surfaces. */

export const CUSTOM_FIELD_KEY_PREFIX = 'custom:' as const;

export type CustomFieldColumnKey = `${typeof CUSTOM_FIELD_KEY_PREFIX}${string}`;

export function isCustomFieldColumnKey(key: string): key is CustomFieldColumnKey {
  return key.startsWith(CUSTOM_FIELD_KEY_PREFIX) && key.length > CUSTOM_FIELD_KEY_PREFIX.length;
}

export function customFieldColumnKey(defKey: string): CustomFieldColumnKey {
  return `${CUSTOM_FIELD_KEY_PREFIX}${defKey}`;
}

/** Strip the `custom:` prefix; null if not a custom column key. */
export function parseCustomFieldDefKey(columnKey: string): string | null {
  if (!isCustomFieldColumnKey(columnKey)) return null;
  return columnKey.slice(CUSTOM_FIELD_KEY_PREFIX.length);
}
