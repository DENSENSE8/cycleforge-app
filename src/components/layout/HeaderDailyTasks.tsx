'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnchoredLayer, IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Check, ClipboardList, ListChecks, Ticket } from '@/components/Icons';
import { useDailyChecks } from '@/lib/daily-checks/use-daily-checks';
import { useTaskDesk } from '@/features/tasks/useTaskDesk';
import { buildDailyTaskRows } from '@/features/home/grid/daily-task-row';
import {
  bandDailyAgendaRows,
  dailyAgendaFromChecklist,
  dailyAgendaFromTask,
  isDailyAgendaWork,
  sortDailyAgendaRows,
  DAILY_AGENDA_TYPE_LABEL,
  type DailyAgendaRow,
} from '@/lib/daily/daily-agenda-row';
import { getCurrentPSTDateKey } from '@/utils/date';
import { cn } from '@/utils/_cn';
import {
  HeaderChromeMenu,
  HeaderChromeMenuEmpty,
  HeaderChromeMenuItem,
  HeaderChromeMenuLabel,
} from './header-chrome-menu';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  HEADER_ICON_WRAP,
  HEADER_PAGE_MENU_SCROLL_CLASS,
  TOP_CHROME_ICON_FACE,
} from './header-shell';

/** Daily preview for the global header — a DROPDOWN, like its beam siblings. */
export function HeaderDailyTasks() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={wrapRef} className={HEADER_ICON_WRAP} data-header-daily-tasks>
      <HoverTooltip label="Daily tasks" asChild>
        <IconButton
          size="md"
          ariaLabel="Daily tasks"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((value) => !value)}
          className={cn(HEADER_ICON_BTN_CLASS, open && HEADER_ICON_BTN_OPEN_CLASS)}
          icon={<ListChecks className={TOP_CHROME_ICON_FACE} />}
        />
      </HoverTooltip>

      <AnchoredLayer
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={wrapRef}
        placement="bottom-start"
        gap={0}
      >
        {/* Mounted only while open (AnchoredLayer renders nothing closed), so
            the always-visible beam costs no daily-checks request per page. */}
        <DailyTasksPreview onClose={() => setOpen(false)} />
      </AnchoredLayer>
    </div>
  );
}

/** The open panel — today's whole agenda, rendered as banded menu rows. */
function DailyTasksPreview({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const dateKey = getCurrentPSTDateKey();
  const { data, isLoading, isError } = useDailyChecks(dateKey);
  /**
   * `all`, and the SAME query key the desk reads — opening this on `/` costs
   * no request, and a tick there is reflected here without a second fetch.
   */
  const tasks = useTaskDesk('all');

  const doneIds = useMemo(() => new Set(data?.mine.doneItemIds ?? []), [data]);

  const rows = useMemo(
    () =>
      sortDailyAgendaRows([
        ...buildDailyTaskRows(data?.items ?? [], data, doneIds).map(dailyAgendaFromChecklist),
        ...tasks.rows.map(dailyAgendaFromTask),
      ]),
    [data, doneIds, tasks.rows],
  );
  const bands = useMemo(() => bandDailyAgendaRows(rows), [rows]);

  /** The viewer's own checklist denominator — never the org-wide list length. */
  const doneCount = data?.mine.doneCount ?? 0;
  const total = data?.mine.total ?? (data?.items.length ?? 0);

  /** Every row is a door onto Daily. */
  const openDaily = (row?: DailyAgendaRow) => {
    onClose();
    router.push(row && isDailyAgendaWork(row) ? `/?task=${row.id}` : '/');
  };

  return (
    <HeaderChromeMenu
      ariaLabel="Daily tasks"
      className={cn('min-w-[17rem]', HEADER_PAGE_MENU_SCROLL_CLASS)}
    >
      <HeaderChromeMenuItem
        icon={<ListChecks />}
        label={data ? `Open Daily · ${doneCount}/${total}` : 'Open Daily'}
        onClick={() => openDaily()}
      />

      {isLoading || tasks.loading ? (
        <HeaderChromeMenuEmpty>Loading today’s agenda…</HeaderChromeMenuEmpty>
      ) : isError ? (
        <HeaderChromeMenuEmpty>Could not load today’s checks.</HeaderChromeMenuEmpty>
      ) : bands.length === 0 ? (
        <HeaderChromeMenuEmpty>Nothing on the agenda today.</HeaderChromeMenuEmpty>
      ) : (
        bands.map(([band, banded]) => (
          <div key={band}>
            <HeaderChromeMenuLabel>{DAILY_AGENDA_TYPE_LABEL[band]}</HeaderChromeMenuLabel>
            {banded.map((row) => (
              <HeaderChromeMenuItem
                key={row.key}
                icon={<AgendaRowGlyph row={row} />}
                label={row.title}
                aria-label={`${DAILY_AGENDA_TYPE_LABEL[row.type]} — ${row.title} — ${
                  row.done ? 'done' : 'not done'
                }`}
                onClick={() => openDaily(row)}
                // Read-only state mark, in a reserved cell so titles stay on
                // one left edge whether or not the row is ticked. The TICK
                // itself is the Daily surface's control, not the header's.
                trailing={
                  <span className="flex h-3.5 w-3.5 items-center justify-center" aria-hidden>
                    {row.done ? <Check className="h-3.5 w-3.5 text-text-muted" /> : null}
                  </span>
                }
              />
            ))}
          </div>
        ))
      )}
    </HeaderChromeMenu>
  );
}

/**
 * The row's mark. A checklist item may carry an operator-chosen glyph; the two
 * work bands take the band's own icon, so a ticket reads as a ticket at a
 * glance without the caption above it having to be in view.
 */
function AgendaRowGlyph({ row }: { row: DailyAgendaRow }) {
  if (row.type === 'ticket') return <Ticket />;
  if (row.type === 'task') return <ClipboardList />;
  return <ListChecks />;
}
