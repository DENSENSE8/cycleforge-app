'use client';

import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { QUEUE_ROW } from '@/components/ui/queue-row-chrome';
import { cn } from '@/utils/_cn';
import type { ReactNode } from 'react';

export interface SidebarSection<TId extends string = string> {
  id: TId;
  label: string;
  description?: string;
  icon?: ReactNode;
  /**
   * Optional override for the leading-icon wrapper color. When set, replaces the
   * default active/inactive blue/faint tokens (e.g. Incoming TILES tone accents).
   */
  iconClassName?: string;
  /** Trailing tabular count — ops facet rails (Incoming, future Media day rows). */
  count?: number;
  /** Escape hatch when count isn't enough (chips, chevrons). Wins over `count`. */
  trailing?: ReactNode;
  /** Optional group label — rows are rendered grouped, with the label shown as a small uppercase heading above the first row of each group. */
  group?: string;
  /** Permission string required to see this row. Filtering is done by the caller. */
  requires?: string;
}

interface SidebarSectionListProps<TId extends string = string> {
  sections: SidebarSection<TId>[];
  active: TId | null;
  onSelect: (id: TId) => void;
  /** Optional aria-label for the nav landmark. */
  ariaLabel?: string;
  /**
   * Horizontal padding for rows + group headers. Defaults to the shared
   * {@link SIDEBAR_GUTTER}. Override (e.g. `px-3`) to line rows up with a
   * OrgWorkspaceControl above the panel. Pass `px-0` when the list sits inside a
   * shell body that already applies {@link SIDEBAR_GUTTER}.
   */
  gutterClassName?: string;
  /**
   * Row register. `comfortable` (default) is the SETTINGS navigator shape —
   * `py-3`, `text-sm`, a hairline under every row; right for Settings / Admin,
   * where the list is the page's whole job and is read once.
   *
   * `ops` is the floor-rail shape: house one-row anatomy (`text-role-caption`,
   * constant `py-1.5`), `divide-y` on the container rather than a border per
   * row, and the canonical `QUEUE_ROW.selectedClass` ring. Use it when the list
   * is a NAVIGATOR beside a working surface (the Media library's facet rail),
   * where vertical budget and scan speed decide, not reading comfort.
   *
   * This exists because the two registers were one, and the ops consumer was
   * paying settings-panel density for a rail it hits dozens of times a shift.
   */
  density?: 'comfortable' | 'ops';
}

interface RenderItem<TId extends string> {
  type: 'group' | 'section';
  group?: string;
  section?: SidebarSection<TId>;
}

function buildRenderList<TId extends string>(sections: SidebarSection<TId>[]): RenderItem<TId>[] {
  const out: RenderItem<TId>[] = [];
  let lastGroup: string | undefined = undefined;
  for (const s of sections) {
    if (s.group && s.group !== lastGroup) {
      out.push({ type: 'group', group: s.group });
      lastGroup = s.group;
    } else if (!s.group) {
      // Reset so a later un-grouped row doesn't suppress a subsequent group header.
      lastGroup = undefined;
    }
    out.push({ type: 'section', section: s });
  }
  return out;
}

export function SidebarSectionList<TId extends string = string>({
  sections,
  active,
  onSelect,
  ariaLabel,
  gutterClassName = SIDEBAR_GUTTER,
  density = 'comfortable',
}: SidebarSectionListProps<TId>) {
  const items = buildRenderList(sections);
  const ops = density === 'ops';

  return (
    <nav
      className={cn(
        // `comfortable` IS the panel body (Settings / Admin), so it owns the
        // height and the scrollport. `ops` is a PINNED block with siblings
        // beneath it (the Media library's outbound chips, the capture-day
        // tree), so it must size to its rows — `h-full` there made it claim the
        // whole column and paint straight over everything below it.
        ops ? 'divide-y divide-border-hairline' : 'h-full overflow-y-auto',
      )}
      aria-label={ariaLabel}
    >
      {items.map((item, idx) => {
        if (item.type === 'group') {
          return (
            <div
              key={`group:${item.group}:${idx}`}
              className={cn(
                'bg-surface-canvas text-role-micro font-semibold uppercase tracking-wide text-text-soft',
                gutterClassName,
                'py-1.5',
                // In `ops` the container owns the rules (`divide-y`).
                !ops && 'border-b border-border-hairline',
              )}
            >
              {item.group}
            </div>
          );
        }
        const s = item.section!;
        const isActive = active === s.id;
        const trailing =
          s.trailing ??
          (typeof s.count === 'number' ? (
            <span
              className={cn(
                'ml-auto shrink-0 tabular-nums text-role-micro uppercase tracking-widest',
                isActive ? 'text-blue-700' : 'text-text-soft',
              )}
            >
              {s.count}
            </span>
          ) : null);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'ds-raw-button group flex w-full text-left transition',
              gutterClassName,
              ops
                ? // House one-row anatomy: constant height, ring selection — never
                  // a size shift between states (ui-design-system.md → One row).
                  'items-center gap-2 py-1.5'
                : 'items-start gap-3 border-b border-border-hairline py-3',
              isActive
                ? ops
                  ? QUEUE_ROW.selectedClass
                  : 'bg-blue-50 text-blue-700'
                : 'text-text-default hover:bg-surface-hover',
            )}
          >
            {s.icon && (
              // Optional leading glyph (e.g. admin L2 sections — modes own icons).
              <span
                className={cn(
                  'flex w-5 shrink-0 justify-center',
                  !ops && 'mt-0.5',
                  s.iconClassName ?? (isActive ? 'text-blue-600' : 'text-text-faint'),
                )}
              >
                {s.icon}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block truncate',
                  ops ? 'text-role-caption font-semibold' : 'text-sm font-semibold',
                )}
              >
                {s.label}
              </span>
              {s.description && (
                <span
                  className={cn(
                    'block truncate font-medium text-text-soft',
                    ops ? 'text-role-eyebrow uppercase tracking-widest' : 'text-role-caption',
                  )}
                >
                  {s.description}
                </span>
              )}
            </span>
            {trailing}
          </button>
        );
      })}
    </nav>
  );
}
