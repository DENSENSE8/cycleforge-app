'use client';

/**
 * Station Action Plane — master-detail dossier shell for Displays leaves.
 *
 * Horizontal collapsed rows; Space/Enter expands when expandable. ↑↓ roves
 * between rows; ←→ moves among interactive children inside an expanded row.
 * Aggressive focus chrome. Esc stays on {@link StationDisplaysPushStack}.
 *
 * Law: source-of-truth.md → Station Action vs Context planes.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { ChevronDown, ChevronRight } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

export type StationActionDossierRow = {
  id: string;
  /** Collapsed face — always visible. */
  face: ReactNode;
  /** Expanded body. Omit / null = non-expandable. */
  detail?: ReactNode;
  /** Face stays open; no collapse control. */
  alwaysOpen?: boolean;
};

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function focusableIn(root: HTMLElement): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  return Array.from(nodes).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
  );
}

export function StationActionDossierShell({
  rows,
  className,
  'data-testid': testId = 'station-action-dossier',
  initialFocusId,
}: {
  rows: StationActionDossierRow[];
  className?: string;
  'data-testid'?: string;
  /** Prefer focusing this row on mount / rows change. */
  initialFocusId?: string;
}) {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const detailRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const [focusId, setFocusId] = useState<string | null>(() => {
    if (initialFocusId && rows.some((r) => r.id === initialFocusId)) return initialFocusId;
    return rows[0]?.id ?? null;
  });
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const next = new Set<string>();
    for (const r of rows) {
      if (r.alwaysOpen) next.add(r.id);
    }
    return next;
  });

  // Keep alwaysOpen rows expanded; drop ids that left the list.
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set<string>();
      for (const r of rows) {
        if (r.alwaysOpen || prev.has(r.id)) next.add(r.id);
      }
      return next;
    });
    setFocusId((prev) => {
      if (prev && rows.some((r) => r.id === prev)) return prev;
      if (initialFocusId && rows.some((r) => r.id === initialFocusId)) return initialFocusId;
      return rows[0]?.id ?? null;
    });
  }, [rows, initialFocusId]);

  const focusRow = useCallback((id: string) => {
    setFocusId(id);
    requestAnimationFrame(() => {
      rowRefs.current.get(id)?.focus();
    });
  }, []);

  const toggleExpand = useCallback((row: StationActionDossierRow) => {
    if (row.alwaysOpen || row.detail == null) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  }, []);

  const onRowKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLButtonElement>, row: StationActionDossierRow, index: number) => {
      if (isEditable(e.target)) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = rows[Math.min(rows.length - 1, index + 1)];
        if (next) focusRow(next.id);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = rows[Math.max(0, index - 1)];
        if (prev) focusRow(prev.id);
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        if (rows[0]) focusRow(rows[0].id);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        const last = rows[rows.length - 1];
        if (last) focusRow(last.id);
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const open = expanded.has(row.id) || row.alwaysOpen;
        if (!open) return;
        const detail = detailRefs.current.get(row.id);
        if (!detail) return;
        const focusables = focusableIn(detail);
        if (focusables.length === 0) return;
        e.preventDefault();
        if (e.key === 'ArrowRight') focusables[0]?.focus();
        else focusables[focusables.length - 1]?.focus();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        if (row.alwaysOpen || row.detail == null) return;
        e.preventDefault();
        toggleExpand(row);
      }
    },
    [rows, expanded, focusRow, toggleExpand],
  );

  return (
    <div
      ref={listRef}
      role="list"
      className={cn('flex min-h-0 flex-1 flex-col', className)}
      data-testid={testId}
      data-station-action-dossier=""
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.map((row, index) => {
          const canExpand = row.detail != null && !row.alwaysOpen;
          const isOpen = row.alwaysOpen || expanded.has(row.id);
          const panelId = `${baseId}-${row.id}-panel`;
          const isFocused = focusId === row.id;

          return (
            <div
              key={row.id}
              role="listitem"
              className={cn(
                'border-b border-border-hairline',
                cornerClass('flush'),
                isFocused && 'bg-surface-sunken/80',
              )}
              data-dossier-row={row.id}
            >
              <button
                type="button"
                ref={(el) => {
                  if (el) rowRefs.current.set(row.id, el);
                  else rowRefs.current.delete(row.id);
                }}
                tabIndex={isFocused ? 0 : -1}
                aria-expanded={canExpand ? isOpen : undefined}
                aria-controls={canExpand ? panelId : undefined}
                className={cn(
                  'flex w-full items-center gap-2 px-2 py-1.5 text-left',
                  focusRing('control', 'accent'),
                  'outline-none',
                )}
                onFocus={() => setFocusId(row.id)}
                onClick={() => {
                  setFocusId(row.id);
                  if (canExpand) toggleExpand(row);
                }}
                onKeyDown={(e) => onRowKeyDown(e, row, index)}
              >
                {canExpand ? (
                  isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-soft" aria-hidden />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-soft" aria-hidden />
                  )
                ) : (
                  <span className="inline-block h-3.5 w-3.5 shrink-0" aria-hidden />
                )}
                <div className="min-w-0 flex-1">{row.face}</div>
              </button>
              {row.detail != null && isOpen ? (
                <div
                  id={panelId}
                  ref={(el) => {
                    if (el) detailRefs.current.set(row.id, el);
                    else detailRefs.current.delete(row.id);
                  }}
                  className="border-t border-border-hairline px-2 py-2"
                  data-dossier-detail={row.id}
                >
                  {row.detail}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
