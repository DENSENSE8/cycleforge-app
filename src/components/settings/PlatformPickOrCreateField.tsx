'use client';

/**
 * Pick-or-create platform field (shared form control, 2026-10-07).
 *
 * Lists the org's active platforms by label; "Add platform" creates one
 * through `POST /api/catalog/platforms` and picks it at once — the
 * SupportPlatformField precedent (owner 2026-10-04). `canCreate=false`
 * (caller lacks admin.manage_features) hides the create row instead of
 * dead-ending mid-flow on a 403.
 */

import { useCallback, useMemo, useState } from 'react';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { useInvalidateCatalog, usePlatformCatalog } from '@/hooks/useCatalog';
import { toast } from '@/lib/toast';

export function PlatformPickOrCreateField({
  value,
  onChange,
  canCreate = true,
  label = 'Platform',
  placeholder = 'Pick a platform',
  searchPlaceholder = 'Find or add a platform',
  testId,
}: {
  /** Selected platform id (`platforms.id`), null = nothing picked yet. */
  value: number | null;
  onChange: (platformId: number) => void;
  /** Hide the inline create row (no admin.manage_features). */
  canCreate?: boolean;
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  testId?: string;
}) {
  const { rows, isLoading } = usePlatformCatalog();
  const invalidateCatalog = useInvalidateCatalog();
  // A platform added here shows (and stays picked) before the catalog refetch lands.
  const [added, setAdded] = useState<{ id: number; label: string } | null>(null);
  const [adding, setAdding] = useState(false);

  const options = useMemo(() => {
    // Catalog ids are BIGINT: the wire carries them as strings whatever
    // PlatformRow says — coerce once here (SupportPlatformField note).
    const platforms = rows.filter((r) => r.is_active).map((row) => ({ id: Number(row.id), label: row.label }));
    if (added && !platforms.some((row) => row.id === added.id)) platforms.push(added);
    return platforms.map((row) => ({ value: `p:${row.id}`, label: row.label, data: row.id }));
  }, [rows, added]);

  const addPlatform = useCallback(
    async (label: string) => {
      setAdding(true);
      try {
        const res = await fetch('/api/catalog/platforms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label }),
        });
        const data = (await res.json().catch(() => null)) as { platform?: { id: number; label: string }; error?: string } | null;
        if (!res.ok || !data?.platform) {
          toast.error(
            res.status === 403 ? 'Adding a platform needs the manage-features permission.' : (data?.error ?? 'Could not add that platform.'),
          );
          return;
        }
        const created = { id: Number(data.platform.id), label: data.platform.label };
        setAdded(created);
        onChange(created.id);
        invalidateCatalog();
        toast.success(`Added platform ${created.label}`);
      } catch {
        toast.error('Could not add that platform.');
      } finally {
        setAdding(false);
      }
    },
    [invalidateCatalog, onChange],
  );

  return (
    <SearchableSelectField
      label={label}
      value={value != null ? `p:${value}` : null}
      options={options}
      onChange={(_, option) => {
        if (option?.data != null) onChange(option.data);
      }}
      placeholder={adding ? 'Adding platform…' : placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyMessage={canCreate ? 'No platform by that name' : 'No platform by that name — ask an admin to add it'}
      loading={isLoading && rows.length === 0}
      disabled={adding}
      {...(canCreate ? { create: { label: 'Add platform', onCreate: (name: string) => void addPlatform(name) } } : {})}
      testId={testId}
    />
  );
}
