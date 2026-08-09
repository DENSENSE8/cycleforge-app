/**
 * Browser POST for one custom_field_values upsert (Orders / Receiving cells).
 * Server route owns auth + typed write; this is the fetch waist only.
 */

import type { CustomFieldEntityType } from './types';

export async function commitCustomFieldValueClient(input: {
  fieldId: number;
  entityType: CustomFieldEntityType;
  entityId: number;
  value: string | number | boolean | null;
}): Promise<void> {
  const res = await fetch('/api/custom-fields/values', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(json?.error || 'Failed to save custom field');
  }
}
