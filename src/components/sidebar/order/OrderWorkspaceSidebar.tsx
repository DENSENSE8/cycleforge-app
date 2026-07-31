'use client';

/**
 * Order lookup workbench — recently opened orders as the sidebar map.
 *
 * Selecting a row opens that order's ONE shell, `/o/[id]`
 * ({@link orderRecordHref}). Cross-entity / fuzzy lookup lives in the global
 * header pill and `/search` — this panel never mounts its own search band
 * (sidebar-search-bar.guard) and no longer toggles a Search mode rail.
 */

import { useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Box, X } from '@/components/Icons';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useRecentDetailStacks } from '@/hooks/useRecentDetailStacks';
import { removeDetailStack, type DetailStackEntry } from '@/lib/detail-stacks/history-store';
import { formatRelativeTime } from '@/lib/search/search-recents';
import { orderRecordHref } from '@/lib/search/search-hit';
import { cn } from '@/utils/_cn';

function currentOrderIdFromParams(orderIdParam: string | string[] | undefined): string | null {
  if (!orderIdParam) return null;
  const raw = Array.isArray(orderIdParam) ? orderIdParam[0] : orderIdParam;
  const decoded = decodeURIComponent(raw || '').trim();
  return decoded || null;
}

/** Prefer numeric DB id match; also accept human order-number path segments. */
function isSelectedEntry(entry: DetailStackEntry, currentId: string | null): boolean {
  if (!currentId) return false;
  return entry.id === currentId || entry.label.includes(currentId);
}

function relativeOpenedLabel(at: number): string {
  try {
    return formatRelativeTime(new Date(at).toISOString(), Date.now());
  } catch {
    return '';
  }
}

export function OrderWorkspaceSidebar() {
  const router = useRouter();
  const params = useParams<{ orderId?: string }>();
  const currentOrderId = currentOrderIdFromParams(params?.orderId);

  const allStacks = useRecentDetailStacks();
  const orderRecents = useMemo(
    () => allStacks.filter((e) => e.kind === 'order'),
    [allStacks],
  );

  const openOrder = useCallback(
    (id: string) => {
      router.push(orderRecordHref(id));
    },
    [router],
  );

  return (
    <SidebarShell bodyClassName="pt-2 pb-6">
      <RecentOrdersList
        entries={orderRecents}
        currentOrderId={currentOrderId}
        onSelect={(entry) => openOrder(entry.id)}
      />
    </SidebarShell>
  );
}

function RecentOrdersList({
  entries,
  currentOrderId,
  onSelect,
}: {
  entries: DetailStackEntry[];
  currentOrderId: string | null;
  onSelect: (entry: DetailStackEntry) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas inset-empty text-center">
        <Box className="mx-auto mb-2 h-5 w-5 text-text-faint" />
        <p className="text-role-caption font-semibold text-text-muted">No recently opened orders</p>
        <p className="mt-1 text-role-micro font-medium text-text-faint">
          Orders you open here or from the dashboard will appear in this list.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border-hairline" aria-label="Recently opened orders">
      {entries.map((entry) => {
        const selected = isSelectedEntry(entry, currentOrderId);
        const when = relativeOpenedLabel(entry.at);
        return (
          <li key={`${entry.kind}:${entry.id}`}>
            <div
              className={cn(
                'group flex items-center gap-1 rounded-md transition-colors',
                selected ? 'bg-blue-50 ring-1 ring-inset ring-blue-400' : 'hover:bg-surface-hover',
              )}
            >
              {/* ds-raw-button: sidebar row — house list anatomy, not a DS Button */}
              <button
                type="button"
                onClick={() => onSelect(entry)}
                className="min-w-0 flex-1 px-2 py-1.5 text-left"
                aria-current={selected ? 'page' : undefined}
              >
                <p className="truncate text-role-eyebrow font-semibold text-text-default">{entry.label}</p>
                <p className="truncate text-role-micro font-semibold uppercase tracking-widest text-text-faint">
                  {when ? `Opened ${when}` : `Order · ${entry.id}`}
                </p>
              </button>
              <HoverTooltip label="Remove" focusable={false}>
                {/* ds-raw-button: quiet remove affordance */}
                <button
                  type="button"
                  onClick={() => removeDetailStack(entry.kind, entry.id)}
                  aria-label={`Remove ${entry.label}`}
                  className={cn(
                    'mr-1 shrink-0 rounded p-1 text-text-faint hover:text-text-default',
                    selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                  )}
                >
                  <X className="h-3 w-3" />
                </button>
              </HoverTooltip>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
