/**
 * Board tile payload shaping.
 *
 * `/api/home-board` returns each tile as the RAW result of the registered tool
 * behind it, because that is what keeps the board and the agent honest — one
 * query, one shape, no board-specific projection to drift. The cost is that a
 * tile has to read six different tool shapes, and this module is where that
 * happens: tool result → `{ label, value, hint, question }` rows.
 *
 * Everything here is defensive on purpose. A tool result is server data, not a
 * compile-time contract, and a tile that throws takes the whole rail with it —
 * so an unreadable payload degrades to "nothing to show" rather than a crash.
 */

export interface BoardTilePayload {
  id: string;
  title: string;
  tool: string;
  state: 'ok' | 'denied' | 'error';
  data?: unknown;
  error?: string;
}

export interface BoardRow {
  /** Left-hand label. */
  label: string;
  /** Right-hand figure, already formatted. */
  value: string;
  /** Optional second line under the label (age, why, owner). */
  hint?: string | null;
  /** The question this row seeds into the composer, when it has its own. */
  question?: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

/** "3 days" / "today" — an age an operator reads without doing arithmetic. */
function ageHint(days: unknown): string | null {
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n === 1) return 'oldest 1 day';
  return `oldest ${Math.round(n)} days`;
}

/**
 * The ROI tile. Each gap already carries its own `question`, which is the
 * point of it: the row IS the next action, not a statistic to admire.
 */
function roiGapRows(data: unknown): BoardRow[] {
  return asArray(asRecord(data).gaps).map((entry) => {
    const gap = asRecord(entry);
    const units = Number(gap.units ?? 0);
    return {
      label: text(gap.label, 'Gap'),
      value: `${units.toLocaleString()} ${text(gap.unit, 'units')}`,
      hint: ageHint(gap.oldestDays) ?? (text(gap.why) || null),
      question: text(gap.question) || null,
    };
  });
}

/**
 * get_my_day → the rows to work next, then the station queues behind them.
 *
 * Shape verified live: `{ counts, tasks: [{ title, subtitle, lane, status,
 * queueLabel, deadlineAt }], queueCards: [{ label, count }] }`. The tasks lead
 * because "what do I do next" outranks "how big is the pile".
 */
function myDayRows(data: unknown): BoardRow[] {
  const root = asRecord(data);
  const rows: BoardRow[] = [];
  for (const entry of asArray(root.tasks).slice(0, 12)) {
    const task = asRecord(entry);
    rows.push({
      label: text(task.title, 'Task'),
      value: text(task.status ?? task.lane, ''),
      hint: [text(task.queueLabel), text(task.subtitle)].filter(Boolean).join(' · ') || null,
      question: null,
    });
  }
  for (const entry of asArray(root.queueCards)) {
    const card = asRecord(entry);
    if (Number(card.count ?? 0) <= 0) continue;
    rows.push({
      label: text(card.label, 'Queue'),
      value: Number(card.count).toLocaleString(),
      hint: 'queue',
      question: `What is in the ${text(card.label)} queue?`,
    });
  }
  return rows;
}

/** get_daily_checks → who has and has not run their checks. */
function dailyCheckRows(data: unknown): BoardRow[] {
  const root = asRecord(data);
  const rows: BoardRow[] = [];
  const done = root.totalDone;
  const possible = root.totalPossible;
  if (done != null && possible != null) {
    rows.push({ label: 'Checked today', value: `${text(done)} / ${text(possible)}`, hint: null });
  }
  for (const entry of asArray(root.staff).slice(0, 20)) {
    const person = asRecord(entry);
    const count = person.doneCount ?? person.done;
    const total = person.total;
    rows.push({
      label: text(person.name ?? person.label, 'Staff'),
      value: total == null ? text(count, '0') : `${text(count, '0')} / ${text(total)}`,
      hint: Number(count ?? 0) === 0 ? 'nothing checked' : null,
    });
  }
  return rows;
}

/** get_project_tasks → the open project inbox, due-first as the tool returns it. */
function projectTaskRows(data: unknown): BoardRow[] {
  return asArray(asRecord(data).tasks)
    .slice(0, 20)
    .map((entry) => {
      const task = asRecord(entry);
      return {
        label: text(task.title, 'Task'),
        value: text(task.status, ''),
        hint: [text(task.assignee), text(task.dueAt ?? task.due_at)].filter(Boolean).join(' · ') || null,
        question: null,
      };
    });
}

/**
 * get_packing_kpi → the shift's numbers.
 *
 * Shape verified live: `{ dayPst, capacity: { packer_headcount,
 * workday_minutes, daily_capacity_minutes, daily_medium_target,
 * daily_large_target }, totals: { small_count, medium_count, large_count,
 * weighted_minutes, total_boxes_packed, remaining_minutes }, by_packer, fba }`
 * — nested, so a flat scan of top-level numbers reads nothing. Totals lead
 * (that is the "are we on pace" answer), then the packers, then capacity.
 */
const PACKING_TOTAL_LABELS: Readonly<Record<string, string>> = {
  total_boxes_packed: 'Boxes packed',
  small_count: 'Small',
  medium_count: 'Medium',
  large_count: 'Large',
  weighted_minutes: 'Weighted minutes',
  remaining_minutes: 'Capacity left (min)',
};

function packingRows(data: unknown): BoardRow[] {
  const root = asRecord(data);
  const rows: BoardRow[] = [];
  const totals = asRecord(root.totals);
  for (const [key, label] of Object.entries(PACKING_TOTAL_LABELS)) {
    const value = totals[key];
    if (typeof value !== 'number') continue;
    rows.push({ label, value: value.toLocaleString(), hint: null, question: null });
  }
  for (const entry of asArray(root.by_packer).slice(0, 12)) {
    const packer = asRecord(entry);
    rows.push({
      label: text(packer.packer_name ?? packer.name ?? packer.staff_name, 'Packer'),
      value: text(packer.total_boxes_packed ?? packer.total ?? packer.boxes, '0'),
      hint: ((): string | null => {
        const minutes = packer.weighted_minutes ?? packer.minutes;
        return typeof minutes === 'number' ? `${Math.round(minutes)} min` : null;
      })(),
      question: null,
    });
  }
  const capacity = asRecord(root.capacity);
  if (typeof capacity.daily_capacity_minutes === 'number') {
    rows.push({
      label: 'Daily capacity',
      value: `${capacity.daily_capacity_minutes.toLocaleString()} min`,
      hint: `${text(capacity.packer_headcount, '?')} packers`,
      question: null,
    });
  }
  return rows;
}

const ROW_READERS: Readonly<Record<string, (data: unknown) => BoardRow[]>> = {
  get_roi_gaps: roiGapRows,
  get_my_day: myDayRows,
  get_daily_checks: dailyCheckRows,
  get_project_tasks: projectTaskRows,
  get_packing_kpi: packingRows,
};

export function boardTileRows(tile: BoardTilePayload): BoardRow[] {
  if (tile.state !== 'ok') return [];
  const reader = ROW_READERS[tile.tool];
  if (!reader) return [];
  try {
    return reader(tile.data).filter((row) => row.label.length > 0);
  } catch {
    // A shape change in one tool must not take the rail down with it.
    return [];
  }
}

/**
 * The headline an operator reads at a glance, before any row. Deliberately the
 * count of things needing attention, not a total — a tile that says "42" when
 * 42 is fine teaches people to ignore tiles.
 */
export function boardTileHeadline(tile: BoardTilePayload): string | null {
  if (tile.state === 'denied') return 'No access';
  if (tile.state === 'error') return 'Unavailable';
  const rows = boardTileRows(tile);
  if (rows.length === 0) return null;
  if (tile.tool === 'get_roi_gaps') return `${rows.length} open`;
  return `${rows.length}`;
}
