'use client';

/** Shared cell for org-defined custom columns (`custom:*` keys). */

import type { ReactNode } from 'react';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import { resolveGridColumnAlign } from '@/design-system/components/grid/grid-header-align';
import { parseCustomFieldDefKey } from '@/lib/tables/custom-field-keys';
import type { CustomFieldValueMap, CustomFieldValueType } from '@/lib/custom-fields/types';
import { cn } from '@/utils/_cn';

interface CustomFieldCellProps {
  column: LedgerGridColumnModel;
  /** Per-row hydrated map keyed by def `key` (no `custom:` prefix). */
  values?: CustomFieldValueMap | null;
  /** Optional type hint when the column model only carries a ColumnType. */
  fieldType?: CustomFieldValueType;
  className?: string;
}

function formatDisplay(
  raw: string | number | boolean | null | undefined,
  fieldType: CustomFieldValueType | undefined,
): string {
  if (raw == null || raw === '') return '—';
  if (fieldType === 'boolean' || typeof raw === 'boolean') {
    return raw === true || raw === 'true' ? 'Yes' : 'No';
  }
  return String(raw);
}

export function CustomFieldCell({
  column,
  values,
  fieldType,
  className,
}: CustomFieldCellProps): ReactNode {
  const defKey = parseCustomFieldDefKey(column.key);
  const align = resolveGridColumnAlign(column);
  const raw = defKey && values ? values[defKey] : null;
  const display = formatDisplay(raw, fieldType);

  if (!defKey) {
    return <span className={className} data-col={column.key} />;
  }

  return (
    <div
      data-col={column.key}
      data-custom-field={defKey}
      className={cn(
        'flex h-full min-w-0 items-center px-2 text-role-caption',
        align === 'end' ? 'justify-end text-right' : 'justify-start text-left',
        className,
      )}
    >
      <span className={cn('truncate', display === '—' && 'text-text-faint')}>{display}</span>
    </div>
  );
}
