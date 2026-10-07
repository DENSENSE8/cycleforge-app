'use client';

/**
 * The docs sheet's left rail — the selected orders (two or more), full
 * numbers, three marks each (label · slip · paperwork). Its head counts the
 * selection's progress ("12 of 31 complete") and filters the rail by what is
 * owed (anything, or one tab). It folds to a narrow strip of marks. Rows
 * reflow with a layout animation when the list changes (a filter, a re-sort
 * after a link). The filter lives here, not in the page sidebar: the sheet is
 * a modal over the Live feed and its rail is its own list.
 */

import { AnimatePresence, motion } from 'motion/react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { motionPresence } from '@/design-system/foundations/motion-presets';
import { springSnappy } from '@/design-system/motion/tokens';
import { FilterDropdownSelect } from '@/design-system/components/FilterDropdownSelect';
import { IconButton } from '@/design-system/primitives/IconButton';
import { focusRing } from '@/design-system/tokens/focus-ring';
import type { OrderPacket } from '@/lib/label-prints/order-packet-contracts';
import { cn } from '@/utils/_cn';
import { DOC_TAB_LABEL, DOC_TABS, docTabState } from './doc-tabs';
import type { RailFilter } from './sheet-model';
import { DocMark } from './DocMark';

function Marks({ packet }: { packet: OrderPacket }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {DOC_TABS.map((tab) => (
        <DocMark key={tab} state={docTabState(packet, tab)} title={`${DOC_TAB_LABEL[tab]}: ${docTabState(packet, tab)}`} />
      ))}
    </span>
  );
}

const FILTER_OPTIONS: Array<{ value: RailFilter; label: string }> = [
  { value: 'owed', label: 'Owing anything' },
  ...DOC_TABS.map((tab) => ({ value: tab, label: `Owing ${DOC_TAB_LABEL[tab].toLowerCase()}` })),
];

export function OrderRail({
  rows,
  activeId,
  onPick,
  filter,
  onFilter,
  complete,
  total,
  folded,
  onFolded,
}: {
  /** The rail's rows (already filtered). */
  rows: readonly OrderPacket[];
  activeId: number;
  onPick: (orderId: number) => void;
  filter: RailFilter;
  onFilter: (next: RailFilter) => void;
  /** Orders of the whole selection with nothing owed. */
  complete: number;
  total: number;
  folded: boolean;
  onFolded: (next: boolean) => void;
}) {
  const layout = useMotionTransition(springSnappy);
  return (
    <aside
      className={cn('flex min-h-0 shrink-0 flex-col border-r border-border-soft', folded ? 'w-16' : 'w-72')}
      aria-label="Selected orders"
      data-testid="docs-rail"
      data-folded={folded ? 'true' : 'false'}
    >
      <div className="flex min-w-0 flex-col gap-1.5 border-b border-border-hairline px-2 py-1.5">
        <div className={cn('flex min-w-0 items-center gap-2', folded && 'flex-col')}>
          <span
            className="min-w-0 flex-1 truncate px-1 text-role-caption font-semibold tabular-nums text-text-muted"
            title={`${complete} of ${total} orders complete`}
            data-testid="docs-rail-progress"
          >
            {folded ? `${complete}/${total}` : `${complete} of ${total} complete`}
          </span>
          <IconButton
            icon={folded ? <PanelLeftOpen /> : <PanelLeftClose />}
            size="sm"
            ariaLabel={folded ? 'Show the order list' : 'Fold the order list'}
            onClick={() => onFolded(!folded)}
            data-testid="docs-rail-fold"
          />
        </div>
        {folded ? null : (
          <FilterDropdownSelect
            label="Show"
            value={filter === 'all' ? null : filter}
            onChange={(next) => onFilter(FILTER_OPTIONS.find((option) => option.value === next)?.value ?? 'all')}
            options={FILTER_OPTIONS}
            emptyOption={{ value: '', label: 'Every order' }}
            ariaLabel="Show orders"
          />
        )}
      </div>
      <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden p-2">
        <AnimatePresence initial={false}>
          {rows.map((packet) => {
            const active = packet.orderId === activeId;
            return (
              <motion.li
                key={packet.orderId}
                layout="position"
                initial={motionPresence.detailStackPush.initial}
                animate={motionPresence.detailStackPush.animate}
                exit={motionPresence.detailStackPush.exit}
                transition={layout}
              >
                {/* ds-raw-button: a full-row two-line order press target (full number · marks · title) — Button is a one-line face. */}
                <button
                  type="button"
                  onClick={() => onPick(packet.orderId)}
                  aria-current={active ? 'true' : undefined}
                  aria-label={folded ? packet.orderRef : undefined}
                  className={cn(
                    'ds-raw-button flex w-full min-w-0 flex-col gap-1 rounded-xl text-left transition-colors',
                    folded ? 'items-center px-1 py-2' : 'px-2.5 py-2',
                    active ? 'bg-surface-selected' : 'hover:bg-surface-hover',
                    focusRing('control'),
                  )}
                  title={packet.orderRef}
                  data-testid={`docs-rail-${packet.orderId}`}
                >
                  {folded ? (
                    <Marks packet={packet} />
                  ) : (
                    <>
                      {/* The FULL order number — the operator reads every digit here, as in the strip beside it. */}
                      <span className="min-w-0 break-all font-mono text-sm font-medium tabular-nums text-text-default">{packet.orderRef}</span>
                      <span className="flex min-w-0 items-center gap-2">
                        <Marks packet={packet} />
                        <span className="min-w-0 truncate text-role-caption text-text-muted">{packet.lines[0]?.title ?? ''}</span>
                      </span>
                    </>
                  )}
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </aside>
  );
}
