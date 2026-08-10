'use client';

/**
 * The ONE control that starts a table import.
 *
 * A workbench chrome mounts this with its family's descriptor; the control owns
 * the file input, the parse, and arming `?import=csv` — so a second family
 * never re-implements "pick a file, then open staging", and the entry point
 * stops being hardcoded to one desk's Sync popover.
 *
 * Presentation stays with the caller (label, helper copy, disabled): the Sync
 * popover wants a full-width secondary button, a Band-1 chrome cluster wants a
 * flush pill. Only the MECHANISM is shared.
 */

import { useId, useRef, useState, type ReactNode } from 'react';
import { FileText } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { useTableImportParam } from '@/hooks/useTableImportParam';
import { loadTableImportDraftFromFile } from '@/lib/tables/import/staging-store';
import { isTableImportLive } from '@/lib/tables/import/registry';
import type { TableImportDescriptor } from '@/lib/tables/import/types';

export function TableImportFileButton<TField extends string, TRowView>({
  descriptor,
  label = 'Import from CSV',
  icon = <FileText className="h-3.5 w-3.5" />,
  variant = 'secondary',
  size = 'lg',
  className,
  disabled = false,
  description,
}: {
  descriptor: TableImportDescriptor<TField, TRowView>;
  label?: string;
  icon?: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  disabled?: boolean;
  /** Helper line under the button (what confirming will do). */
  description?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { setActive } = useTableImportParam(descriptor);
  const inputId = useId();

  // The allowlist is the fan-out gate — a descriptor that exists but is not yet
  // mounted must not offer an entry point (`registry.ts`).
  if (!isTableImportLive(descriptor.surfaceId)) return null;

  async function handleFile(file: File) {
    setError(null);
    const outcome = await loadTableImportDraftFromFile(descriptor, file);
    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }
    // Paints the desk on this frame; the soft-replace follows.
    setActive(true);
  }

  return (
    <>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />
      <Button
        variant={variant}
        size={size}
        onClick={() => inputRef.current?.click()}
        icon={icon}
        className={className}
        disabled={disabled}
      >
        {label}
      </Button>
      {description ? (
        <p className="mt-1.5 px-0.5 text-role-micro text-text-faint">{description}</p>
      ) : null}
      {error ? (
        <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-role-eyebrow text-rose-700">
          {error}
        </p>
      ) : null}
    </>
  );
}
