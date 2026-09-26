'use client';

/** The ONE control that starts a table import. */

import { useId, useRef, useState, type ReactNode } from 'react';
import { FileText } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { useTableImportParam } from '@/hooks/useTableImportParam';
import { loadTableImportDraftFromFile } from '@/lib/tables/import/staging-store';
import { isTableImportLive } from '@/lib/tables/import/registry';
import type { TableImportDescriptor } from '@/lib/tables/import/types';

/**
 * File-pick mechanism for a table import — shared by the labeled button and
 * by ingest-rail / chrome callers. Presentation stays with the caller.
 */
export function useTableImportFilePicker<TField extends string, TRowView>(
  descriptor: TableImportDescriptor<TField, TRowView>,
): {
  live: boolean;
  error: string | null;
  clearError: () => void;
  input: ReactNode;
  open: () => void;
} {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { setActive } = useTableImportParam(descriptor);
  const inputId = useId();
  const live = isTableImportLive(descriptor.surfaceId);

  async function handleFile(file: File) {
    setError(null);
    const outcome = await loadTableImportDraftFromFile(descriptor, file);
    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }
    setActive(true);
  }

  const input = live ? (
    <input
      ref={inputRef}
      id={inputId}
      type="file"
      accept=".csv,.tsv,text/csv,text/tab-separated-values"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void handleFile(file);
        e.target.value = '';
      }}
    />
  ) : null;

  return {
    live,
    error,
    clearError: () => setError(null),
    input,
    open: () => inputRef.current?.click(),
  };
}

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
  const { live, error, input, open } = useTableImportFilePicker(descriptor);
  // The allowlist is the fan-out gate — a descriptor that exists but is not yet
  // mounted must not offer an entry point (`registry.ts`).
  if (!live) return null;

  return (
    <>
      {input}
      <Button
        variant={variant}
        size={size}
        onClick={open}
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
