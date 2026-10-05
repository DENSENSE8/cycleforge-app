'use client';

/**
 * The Support item's Platform field (owner 2026-10-04: "first class platform,
 * including text … immediately add your own platform"). Lists the org's active
 * platforms by their own text label, then each active account as
 * "Platform · Account"; "Add platform" creates one through
 * `POST /api/catalog/platforms` and picks it at once. Mounts the house
 * SearchableSelectField (sign-in floating label, list anchored under the field).
 */

import { useCallback, useMemo, useState } from 'react';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { useInvalidateCatalog, usePlatformAccountCatalog, usePlatformCatalog } from '@/hooks/useCatalog';
import { toast } from '@/lib/toast';

/** A Platform / account pick: an org platform alone, or one of its accounts. */
export interface PlatformPick {
  platformId: number;
  accountId: number | null;
}

export function SupportPlatformField({ value, onChange }: { value: PlatformPick | null; onChange: (next: PlatformPick | null) => void }) {
  const platforms = usePlatformCatalog();
  const accounts = usePlatformAccountCatalog();
  const invalidateCatalog = useInvalidateCatalog();
  // A platform added here shows (and stays picked) before the catalog refetch lands.
  const [added, setAdded] = useState<{ id: number; label: string } | null>(null);
  const [adding, setAdding] = useState(false);

  const options = useMemo((): Array<{ value: string; label: string; group: string; data: PlatformPick }> => {
    // Catalog ids are BIGINT: the wire carries them as strings whatever PlatformRow says — coerce once here.
    const rows = platforms.rows.map((row) => ({ id: Number(row.id), label: row.label }));
    if (added && !rows.some((row) => row.id === added.id)) rows.push(added);
    const labelById = new Map(rows.map((row) => [row.id, row.label]));
    const platformRows = rows.map((row) => ({
      value: `p:${row.id}`,
      label: row.label,
      group: 'Platform',
      data: { platformId: row.id, accountId: null },
    }));
    const accountRows = accounts.rows.flatMap((row) => {
      const platformId = Number(row.platform_id);
      const platformLabel = labelById.get(platformId);
      // An account named like its platform (Ecwid · Ecwid) is the platform itself.
      if (!platformLabel || row.label.trim().toLowerCase() === platformLabel.trim().toLowerCase()) return [];
      return [
        {
          value: `a:${row.id}`,
          label: `${platformLabel} · ${row.label}`,
          group: 'Account',
          data: { platformId, accountId: Number(row.id) },
        },
      ];
    });
    return [...platformRows, ...accountRows];
  }, [accounts.rows, added, platforms.rows]);

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
        onChange({ platformId: created.id, accountId: null });
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
      label="Platform"
      value={value ? (value.accountId != null ? `a:${value.accountId}` : `p:${value.platformId}`) : null}
      options={options}
      onChange={(_, option) => onChange(option?.data ?? null)}
      placeholder={adding ? 'Adding platform…' : 'Where did the customer write?'}
      searchPlaceholder="Find or add a platform"
      emptyMessage="No platform or account by that name"
      loading={platforms.isLoading && platforms.rows.length === 0}
      disabled={adding}
      create={{ label: 'Add platform', onCreate: (name) => void addPlatform(name) }}
      testId="support-item-platform"
    />
  );
}
