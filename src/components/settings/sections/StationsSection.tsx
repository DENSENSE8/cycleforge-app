'use client';

/** /settings?section=stations — the backend name → operator nickname map. */

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { packPlacementQuery } from '@/lib/queries/pack-placement-queries';
import { inventoryLocationsHref } from '@/lib/inventory/locations-path';
import { printStationTagFromRow } from '@/lib/print/printSpecialBinLabel';
import { toast } from '@/lib/toast';
import type { PackPlaceableLocation } from '@/lib/packing/pack-placement';

const PRINT_BTN_CLS = cn(
  'shrink-0 rounded-none border border-border-soft inset-chip',
  'text-role-micro text-text-muted',
  'hover:bg-surface-sunken',
  focusRing('control', 'accent'),
);

const NAME_FIELD_CLS = cn(
  'w-full rounded-none border border-border-soft bg-surface-card inset-field',
  'text-role-caption font-semibold text-text-default placeholder:text-text-faint',
  'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-text-faint',
  focusRing('field', 'accent'),
);

/** Room name → the group heading. Falls back to the kind when a bench is loose. */
function groupTitle(row: PackPlaceableLocation): string {
  const room = row.room?.trim();
  if (room) return room;
  return row.locationKind === 'STAGING' ? 'Staging' : 'Stations';
}

export function StationsSection() {
  const queryClient = useQueryClient();
  const benchQuery = useQuery(packPlacementQuery());

  /** Per-row nickname draft, keyed by location id. Absent = not being edited. */
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const groups = useMemo(() => {
    const byRoom = new Map<string, PackPlaceableLocation[]>();
    for (const row of benchQuery.data?.locations ?? []) {
      const title = groupTitle(row);
      const list = byRoom.get(title);
      if (list) list.push(row);
      else byRoom.set(title, [row]);
    }
    return [...byRoom.entries()];
  }, [benchQuery.data]);

  const clearDraft = useCallback((id: number) => {
    setDrafts((d) => {
      const { [id]: _drop, ...rest } = d;
      return rest;
    });
  }, []);

  const save = useCallback(
    async (row: PackPlaceableLocation, next: string) => {
      const trimmed = next.trim();
      const current = row.displayName?.trim() ?? '';
      if (trimmed === current) {
        clearDraft(row.id);
        return;
      }
      // No barcode, no door: the rename route is keyed by barcode. The row says
      // so and disables the field rather than minting a second rename route.
      if (!row.barcode) return;

      setSavingId(row.id);
      setError(null);
      setSaved(null);
      try {
        const res = await fetch(
          `/api/locations/${encodeURIComponent(row.barcode)}/properties`,
          {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            // '' clears the nickname — the writer folds it to NULL, so the
            // canonical name comes back rather than the chip going blank.
            body: JSON.stringify({ displayName: trimmed }),
          },
        );
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            setError(
              "You don't have permission to rename a station. Ask an admin for Manage SKU stock.",
            );
          } else if (res.status === 404) {
            setError('That station no longer exists. Refresh to see the current list.');
          } else {
            setError('Could not save the name. Try again in a moment.');
          }
          return;
        }
        setSaved(trimmed ? `Now showing as “${trimmed}”.` : 'Nickname cleared.');
        clearDraft(row.id);
        // Both ledgers paint the bench face, so both caches go stale on a
        // rename — refetching one would leave the other on the old name.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['orders', 'pack-placement'] }),
          queryClient.invalidateQueries({ queryKey: ['units', 'pack-placement'] }),
        ]);
      } catch {
        setError('Could not reach the server. The name is unchanged.');
      } finally {
        setSavingId(null);
      }
    },
    [clearDraft, queryClient],
  );

  return (
    <div className="space-y-6">
      <header>
        <h2 className="sr-only">Stations</h2>
        <p className="mt-1 text-sm text-text-soft">
          Give each station the name your team actually says out loud. The nickname is
          what shows on To-ship, Ready to Pack, and the bench filter — the warehouse
          name underneath it never changes, so barcodes and bay labels keep working.
        </p>
      </header>

      {benchQuery.isError && (
        <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 inset-empty text-center text-role-caption text-text-danger">
          Could not load stations.{' '}
          <Button variant="ghost" size="sm" onClick={() => void benchQuery.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {benchQuery.isPending && (
        <p className="text-role-caption text-text-soft">Loading stations…</p>
      )}

      {!benchQuery.isPending && !benchQuery.isError && groups.length === 0 && (
        <div className="rounded-xl border border-dashed border-border-soft bg-surface-sunken inset-empty text-center">
          <p className="text-role-caption text-text-soft">
            No stations yet. Add a desk or staging location to create one.
          </p>
          <Link
            href={inventoryLocationsHref({ tab: 'manage' })}
            className={cn(
              'mt-2 inline-block text-role-caption font-semibold text-blue-700',
              'underline-offset-2 hover:underline',
              focusRing('control', 'accent'),
            )}
          >
            Open Inventory → Locations
          </Link>
        </div>
      )}

      {groups.map(([title, rows]) => (
        <section key={title} className="space-y-2">
          <h3 className="text-role-eyebrow text-text-soft">
            {title}
          </h3>
          <ul className="divide-y divide-border-hairline rounded-xl border border-border-soft bg-surface-card">
            {rows.map((row) => {
              const draft = drafts[row.id] ?? row.displayName ?? '';
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center gap-3 inset-cozy"
                  data-testid={`station-row-${row.id}`}
                >
                  {/* Backend name — the thing being mapped FROM. Read-only: it is
                      the warehouse-map identity, not the operator's to retype. */}
                  <span className="w-40 shrink-0 truncate text-role-caption text-text-soft">
                    {row.name}
                  </span>
                  <div className="min-w-[10rem] flex-1">
                    <input
                      type="text"
                      value={draft}
                      placeholder={row.name}
                      disabled={row.barcode == null || savingId === row.id}
                      aria-label={`Display name for ${row.name}`}
                      data-testid={`station-display-name-${row.id}`}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [row.id]: e.target.value }))
                      }
                      onBlur={(e) => void save(row, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.currentTarget.blur();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          clearDraft(row.id);
                        }
                      }}
                      className={NAME_FIELD_CLS}
                    />
                    {row.barcode == null && (
                      <span className="mt-1 block text-role-caption text-text-soft">
                        Needs a barcode before it can be renamed.
                      </span>
                    )}
                  </div>
                  {/* Print is an ACTION, not a destination. */}
                  {row.barcode ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (printStationTagFromRow(row)) {
                          toast.success(`Printing tag for ${row.barcode}`);
                        }
                      }}
                      title={`Print the 2×1 tag for ${row.barcode}`}
                      className={PRINT_BTN_CLS}
                      data-testid={`station-print-${row.id}`}
                    >
                      Print
                    </button>
                  ) : (
                    <Link
                      href={inventoryLocationsHref({ tab: 'manage' })}
                      title={`Create a barcode for ${row.name}`}
                      className={PRINT_BTN_CLS}
                      data-testid={`station-barcode-link-${row.id}`}
                    >
                      Add barcode
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {(error || saved) && (
        <p
          className={cn('text-role-caption', error ? 'text-text-danger' : 'text-text-soft')}
          role="status"
        >
          {error ?? saved}
        </p>
      )}
    </div>
  );
}
