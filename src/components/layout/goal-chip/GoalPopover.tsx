import { AnimatePresence, motion } from '@/design-system/motion';
import { Bell, Check, Clock, RotateCcw, Barcode } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { Button } from '@/design-system/primitives';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import { GOAL_PANEL_SHELL_CLASS, RECUR_INTERVALS, STATION_LABEL, toneFor, type Todo } from './goal-chip-shared';
import { GoalRing } from './GoalRing';
import { TaskList } from './TaskList';
import { TaskListMenu } from './TaskListMenu';
import { NextWorkOrderRow } from './NextWorkOrderRow';
import { GoalPanelHomeCta } from './GoalPanelHomeCta';
import type { NextWorkOrder } from './useNextWorkOrder';
import type { HeaderGoalChipController } from './useHeaderGoalChip';

interface View { target: number; scanCount: number; done: number; total: number; percent: number }
type Tone = ReturnType<typeof toneFor>;
interface ChipCount { value: number; total: number; unit: string }

/**
 * The pace-and-next panel: next work order → goal header → station switcher →
 * the 3 mode panels, closing on the one door out: Home.
 *
 * **The work order leads.** It is the one row here that is a *thing to do next*;
 * everything under it is *how today is going*. An operator opening this button
 * mid-shift is answering the first question far more often than the second, and
 * the goal header directly beneath keeps the pacing a glance away.
 */
export function GoalPopover({
  g,
  view,
  tone,
  chipCount,
  hasSwitch,
  workOrder,
  onNavigate,
  surface,
}: {
  g: HeaderGoalChipController;
  view: View;
  tone: Tone;
  chipCount: ChipCount;
  hasSwitch: boolean;
  /** Absent when there is none, or when the operator is already on its record. */
  workOrder?: NextWorkOrder | null;
  onNavigate?: () => void;
  /**
   * WHICH host is rendering this — required, no default. `popover` is the
   * desktop anchor under the header button; `sheet` is the phone's full-width
   * bottom sheet, where every row and menu item takes a 44px touch target. A
   * panel that guessed its own density got it wrong the moment a second host
   * mounted it.
   */
  surface: 'popover' | 'sheet';
}) {
  const active = g.active!;
  const goals = g.goals!;
  const touch = surface === 'sheet';
  const listMax = touch ? 'max-h-[52vh]' : g.mode === 'recurring' ? 'max-h-[200px]' : 'max-h-[230px]';

  return (
    <motion.div
      initial={touch ? false : { opacity: 0, y: -6, scale: 0.98 }}
      animate={touch ? undefined : { opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      className={touch ? 'w-full' : GOAL_PANEL_SHELL_CLASS}
    >
      {workOrder ? <NextWorkOrderRow top={workOrder} onNavigate={onNavigate} /> : null}

      {/* header: title + Switch (only when there are secondary stations) */}
      <div className="flex items-center justify-between gap-2 border-b border-border-hairline px-3.5 py-3">
        <div className="flex items-center gap-2.5">
          <GoalRing percent={view.percent} color={tone.ring} size={38} />
          <div className="leading-tight">
            <p className="text-role-data font-semibold tracking-tight text-text-default">Today&apos;s {STATION_LABEL[active]} goal</p>
            <p className="mt-0.5 flex items-center gap-1.5">
              <span className="text-role-micro font-semibold tabular-nums text-text-soft">
                <AnimatedStat value={chipCount.value} speed="fast" className="inline" /> /{' '}
                <AnimatedStat value={chipCount.total} speed="fast" className="inline" />
              </span>
              <span className={cn('rounded-none px-1.5 py-px text-role-micro uppercase ring-1', tone.chip)}>
                {tone.label}
              </span>
            </p>
          </div>
        </div>
        {hasSwitch && (
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw className="h-3 w-3" />}
            onClick={() => g.setSwitching((s) => !s)}
            className={cn('shrink-0', g.switching && 'bg-blue-50 text-blue-600')}
          >
            Switch
          </Button>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {g.switching && hasSwitch ? (
          <motion.div
            key="switch"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="p-2"
          >
            <p className="px-2 pb-1.5 pt-1 text-role-eyebrow uppercase tracking-wider text-text-faint">Your stations</p>
            {goals.map((gg) => {
              const pct = gg.target <= 0 ? 0 : Math.round((gg.scanCount / gg.target) * 100);
              const gt = toneFor(pct, gg.scanCount);
              const on = gg.station === active;
              return (
                // ds-raw-button — multi-line text-left station row
                <button
                  key={gg.station}
                  type="button"
                  onClick={() => g.onSelectStation(gg.station)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-none px-2 text-left transition-colors',
                    touch ? 'min-h-[52px] py-3' : 'py-2',
                    on ? 'bg-blue-50/70' : 'hover:bg-surface-hover',
                  )}
                >
                  <GoalRing percent={pct} color={gt.ring} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-role-caption font-semibold text-text-default">
                      {STATION_LABEL[gg.station]}
                      {gg.isPrimary && <span className="ml-1.5 text-role-micro uppercase text-blue-500">primary</span>}
                    </span>
                    <span className="text-role-micro tabular-nums text-text-soft">{gg.scanCount}/{gg.target} scans</span>
                  </span>
                  {on && <Check className="h-3.5 w-3.5 text-blue-600" />}
                </button>
              );
            })}
          </motion.div>
        ) : (
          <motion.div
            key="body"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          >
            {/* mode toggle: Scans · Auto / Recurring / To-do */}
            <div className="px-3 pt-3">
              <div className="flex w-full items-center gap-0.5 rounded-none bg-surface-sunken p-0.5 ring-1 ring-border-soft">
                {(['scans', 'recurring', 'todo'] as const).map((m) => (
                  // ds-raw-button — segmented mode toggle
                  <button
                    key={m}
                    type="button"
                    onClick={() => g.changeMode(m)}
                    className={cn(
                      'relative flex-1 rounded-none px-1.5 transition-colors',
                      touch ? 'min-h-[44px] text-role-caption' : 'py-1.5 text-role-micro',
                      g.mode === m ? 'bg-surface-card text-text-default shadow-sm ring-1 ring-border-soft' : 'text-text-soft hover:text-text-default',
                    )}
                  >
                    {m === 'scans' ? 'Scans · auto' : m === 'recurring' ? 'Recurring' : 'To-do'}
                    {m === 'recurring' && g.recurDue && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-rose-500 align-middle" />}
                  </button>
                ))}
              </div>
            </div>

            {g.mode === 'scans' ? (
              <div className="px-3.5 py-3.5">
                <div className="flex items-end justify-between">
                  <span className="text-3xl font-semibold leading-none tabular-nums text-text-default">
                    <AnimatedStat value={view.scanCount} />
                  </span>
                  <span className="pb-0.5 text-role-caption font-semibold tabular-nums text-text-faint">
                    of <AnimatedStat value={view.target} className="inline" />
                  </span>
                </div>
                <div className="mt-2.5 h-2 w-full overflow-hidden rounded-none bg-surface-sunken ring-1 ring-border-soft">
                  <motion.div
                    className="h-full"
                    style={{ backgroundColor: tone.ring }}
                    animate={{ width: `${Math.min(100, view.percent)}%` }}
                    transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
                <p className="mt-2 flex items-center gap-1 text-role-micro text-text-soft">
                  <Barcode className="h-3 w-3" />
                  Live deduped scans for this station.
                </p>
                <p className="mt-1 text-role-micro tabular-nums" style={{ color: tone.ring }}>
                  <AnimatedStat value={Math.max(0, view.target - view.scanCount)} className="inline" /> scans left to hit goal
                </p>
              </div>
            ) : g.mode === 'recurring' ? (
              <div>
                {/* whole-list reset interval */}
                <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
                  <span className="flex items-center gap-1 text-role-eyebrow uppercase tracking-wider text-text-faint">
                    <Clock className="h-3 w-3" /> Resets every
                  </span>
                  <div className="flex gap-0.5 rounded-none bg-surface-sunken p-0.5 ring-1 ring-border-soft">
                    {RECUR_INTERVALS.map((opt) => (
                      // ds-raw-button — segmented interval toggle
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => g.changeInterval(opt.ms)}
                        className={cn(
                          'rounded-none px-1.5 transition-colors',
                          touch ? 'min-h-[40px] min-w-[44px] text-role-caption' : 'py-0.5 text-role-micro',
                          g.intervalMs === opt.ms ? 'bg-surface-card text-text-default shadow-sm ring-1 ring-border-soft' : 'text-text-soft hover:text-text-default',
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {g.recurDue && (
                  <p className="mt-1.5 flex items-center gap-1 px-3.5 text-role-micro text-rose-600">
                    <Bell className="h-3 w-3" /> Due now — re-check these tasks.
                  </p>
                )}

                <ListHead
                  label="Recurring"
                  items={g.recurItems}
                  onNavigate={onNavigate}
                  touch={touch}
                  onClear={g.clearDoneRecur}
                  onDeleteAll={g.deleteAllRecur}
                />

                <div className={cn('mt-1 overflow-y-auto px-2 pb-2', listMax)}>
                  <TaskList
                    items={g.recurItems}
                    onToggle={g.toggleRecur}
                    onRemove={g.removeRecur}
                    onRename={g.renameRecur}
                    touch={touch}
                    adding={g.adding}
                    draft={g.draft}
                    onDraft={g.setDraft}
                    onAdd={g.onAddRecur}
                    onStartAdd={g.onStartAdd}
                    onCancelAdd={g.onCancelAdd}
                    emptyHint="No recurring tasks yet. These reset on the interval above."
                    placeholder="New recurring task…"
                    addLabel="Add recurring task"
                  />
                </div>
              </div>
            ) : (
              <div>
                <ListHead
                  label="To-do"
                  items={g.todoItems}
                  onNavigate={onNavigate}
                  touch={touch}
                  onClear={g.clearDoneTodos}
                  onDeleteAll={g.deleteAllTodos}
                />
                <div className={cn('overflow-y-auto px-2 pb-2', listMax)}>
                  <TaskList
                    items={g.todoItems}
                    onToggle={g.toggleTodo}
                    onRemove={g.removeTodo}
                    onRename={g.renameTodo}
                    touch={touch}
                    adding={g.adding}
                    draft={g.draft}
                    onDraft={g.setDraft}
                    onAdd={g.onAddTodo}
                    onStartAdd={g.onStartAdd}
                    onCancelAdd={g.onCancelAdd}
                    emptyHint="No tasks yet. Add your to-dos."
                    placeholder="New task…"
                    addLabel="Add a task"
                  />
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <GoalPanelHomeCta onNavigate={onNavigate} />
    </motion.div>
  );
}

/**
 * One list's head: what it is on the left, its `⋯` on the right. The dots sit
 * at the same right edge as every row's, so scope is read from position alone.
 */
function ListHead({
  label,
  items,
  onNavigate,
  touch,
  onClear,
  onDeleteAll,
}: {
  label: string;
  items: Todo[];
  onNavigate?: () => void;
  touch: boolean;
  onClear: () => void;
  onDeleteAll: () => void;
}) {
  const doneCount = items.filter((t) => t.done).length;
  return (
    <div className={cn('flex items-center justify-between gap-2', touch ? 'px-3 pt-2' : 'px-3.5 pt-2')}>
      <span className="flex items-center gap-1.5 text-role-eyebrow uppercase tracking-wider text-text-faint">
        {label}
        <span className="tabular-nums">
          {doneCount}/{items.length}
        </span>
      </span>
      <TaskListMenu
        listLabel={label}
        doneCount={doneCount}
        total={items.length}
        onNavigate={onNavigate}
        onClearCompleted={onClear}
        onDeleteAll={onDeleteAll}
        touch={touch}
      />
    </div>
  );
}
