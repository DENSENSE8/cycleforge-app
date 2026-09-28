import type { RecordStateFace } from './industrial-record';

/** Where one Daily agenda row stands — a checklist item or a task. */
export type AgendaStage = 'open' | 'active' | 'urgent' | 'late' | 'done' | 'withdrawn';

/**
 * Daily agenda — the agenda's own states, not the outbound order lifecycle
 * (owner 2026-09-28: an order's "To pick" must never recolour a checklist).
 * Same shape as `STOCK_LIFECYCLE`: `LifecycleCode` / `IndustrialRecord` read it.
 * Each row's code and word come from `agendaRecordState`; this map owns the
 * tone and glyph only.
 */
export const AGENDA_LIFECYCLE: Readonly<Record<AgendaStage, RecordStateFace>> = {
  open: { id: 'open', code: 'OPEN', label: 'Open', tone: 'info', icon: 'circle-dot' },
  active: { id: 'active', code: 'WIP', label: 'In progress', tone: 'info', icon: 'circle-dot' },
  urgent: { id: 'urgent', code: 'URG', label: 'Urgent', tone: 'warning', icon: 'alarm-clock' },
  late: { id: 'late', code: 'LATE', label: 'Past due', tone: 'warning', icon: 'alarm-clock' },
  done: { id: 'done', code: 'DONE', label: 'Done', tone: 'success', icon: 'circle-dot' },
  withdrawn: { id: 'withdrawn', code: 'CXL', label: 'Withdrawn', tone: 'fulfillment', icon: 'circle-pause' },
};
