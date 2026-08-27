'use client';

/**
 * Shared cell for org-defined custom columns (`custom:*` keys).
 * Dispatches on CustomFieldValueType / ColumnType — never family-specific JSX.
 */

import { useRef, useState, type ReactNode } from 'react';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import { resolveGridColumnAlign } from '@/design-system/components/grid/grid-header-align';
import { CellTextEditPopover } from '@/components/dashboard/orders-queue/cell-editors';
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
  /** When set, text/number/date cells open the shared Sheets text editor. */
  onCommit?: (defKey: string, next: string) => void;
  saving?: boolean;
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
  onCommit,
  saving = false,
}: CustomFieldCellProps): ReactNode {
  const defKey = parseCustomFieldDefKey(column.key);
  const align = resolveGridColumnAlign(column);
  const raw = defKey && values ? values[defKey] : null;
  const display = formatDisplay(raw, fieldType);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [editing, setEditing] = useState(false);

  const editable = Boolean(onCommit && defKey && fieldType !== 'boolean' && fieldType !== 'select');

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
      {editable ? (
        <>
          <button
            type="button"
            ref={anchorRef}
            className={cn(
              'min-w-0 truncate text-left hover:underline',
              display === '—' && 'text-text-faint',
            )}
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
          >
            {display}
          </button>
          {editing ? (
            <CellTextEditPopover
              anchorRef={anchorRef}
              title={column.label ?? defKey}
              initialValue={raw == null ? '' : String(raw)}
              onCommit={(next) => onCommit?.(defKey, next)}
              onDone={() => setEditing(false)}
              saving={saving}
            />
          ) : null}
        </>
      ) : (
        <span className={cn('truncate', display === '—' && 'text-text-faint')}>{display}</span>
      )}
    </div>
  );
}
