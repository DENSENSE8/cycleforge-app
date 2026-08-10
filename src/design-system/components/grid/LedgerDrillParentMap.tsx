'use client';

/**
 * LedgerGrid drill — left parent map (WMS-wide).
 *
 * Sectioned list of parent keys. Selection orients the right child collection
 * ({@link NAV_ROW} wash — not record pick). Domain supplies titles / keys;
 * row face composes {@link StackedRowIdentity} (title → typed CopyChip keys) —
 * never a hand-rolled `flex-col` title/meta twin.
 *
 * Scroll + more-below lip compose {@link SidebarRailScrollport} — same SoT as
 * station recent rails. Optional `footer` pins a domain filter
 * (`TechRailSearchBar`) below the port.
 */

import type { ReactNode } from 'react';
import { SidebarRailScrollport } from '@/components/sidebar/rail-shell/SidebarRailScrollport';
import { StackedRowIdentity } from '@/components/ui/StackedRowIdentity';
import { NAV_ROW } from '@/components/ui/queue-row-chrome';
import { TABLE_SURFACE_SHEET_CLASS } from '@/design-system/tokens/table-surface';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

export type LedgerDrillParentRow = {
  key: string;
  title: ReactNode;
  /** Second-row keys — prefer `joinStackedIdentityKeys` + CopyChip family. */
  meta?: ReactNode;
};

export type LedgerDrillParentSection = {
  id: string;
  label: ReactNode;
  rows: LedgerDrillParentRow[];
};

export function LedgerDrillParentMap({
  title,
  sections,
  selectedKey,
  onSelect,
  loading = false,
  emptyMessage = 'No records.',
  footer = null,
  className,
  testId = 'ledger-drill-parents',
}: {
  /** Pane eyebrow — e.g. "Purchase orders", "Orders", "Shipments". */
  title: ReactNode;
  sections: LedgerDrillParentSection[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  loading?: boolean;
  emptyMessage?: string;
  /**
   * Optional footer band below the scrollport — same anatomy as station
   * recent rails (scroll + pinned `TechRailSearchBar`). Domain owns the
   * control; this map only seats it.
   */
  footer?: ReactNode;
  className?: string;
  testId?: string;
}) {
  const rowCount = sections.reduce((n, s) => n + s.rows.length, 0);

  return (
    <div
      className={cn(
        TABLE_SURFACE_SHEET_CLASS,
        'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-card',
        className,
      )}
      data-testid={testId}
      data-ledger-drill-parents="1"
    >
      <div className="shrink-0 border-b border-border-soft px-3 py-2">
        <p className="text-role-caption font-semibold uppercase tracking-widest text-text-soft">
          {title}
        </p>
      </div>
      <SidebarRailScrollport>
        {loading && rowCount === 0 ? (
          <p className="px-3 py-6 text-role-caption text-text-soft">Loading…</p>
        ) : rowCount === 0 ? (
          <p className="px-3 py-6 text-role-caption text-text-soft">{emptyMessage}</p>
        ) : (
          sections.map((section) => (
            <section
              key={section.id || 'unknown'}
              className="border-b border-border-faint last:border-b-0"
            >
              <header className="sticky top-0 z-1 bg-surface-card/95 px-3 py-1.5 backdrop-blur-sm">
                <span className="text-role-caption font-semibold uppercase tracking-widest text-text-muted">
                  {section.label}
                </span>
              </header>
              <ul className="flex flex-col">
                {section.rows.map((row) => {
                  const selected = selectedKey === row.key;
                  return (
                    <li key={row.key}>
                      {/*
                        div role=button (not <button>): meta may host CopyChip
                        buttons (tracking / PO). Nested <button> is invalid HTML.
                        Same pattern as station RailRow.
                      */}
                      <div
                        role="button"
                        tabIndex={0}
                        aria-pressed={selected}
                        onClick={() => onSelect(row.key)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelect(row.key);
                          }
                        }}
                        className={cn(
                          'w-full cursor-pointer px-3 py-2 text-left transition-colors',
                          focusRing('control'),
                          selected
                            ? NAV_ROW.selectedClass
                            : 'hover:bg-surface-hover',
                        )}
                      >
                        <StackedRowIdentity
                          title={
                            <span className="truncate text-role-body font-medium text-text-primary">
                              {row.title}
                            </span>
                          }
                          keys={row.meta}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </SidebarRailScrollport>
      {footer != null ? <div className="shrink-0">{footer}</div> : null}
    </div>
  );
}
