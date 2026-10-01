import type { RecordStateFace } from './record';

/** Where one Daily agenda card stands — a checklist item or a task. */
export type AgendaStage = 'open' | 'active' | 'urgent' | 'late' | 'done' | 'withdrawn';

/**
 * Daily agenda — the agenda's own states, not the outbound order lifecycle
 * (owner 2026-09-28: an order's "To pick" must never recolour a checklist).
 * Cards read the tone through their state rail; the record header uses a dot
 * and words rather than a solid lifecycle chip.
 */
export const AGENDA_LIFECYCLE: Readonly<Record<AgendaStage, RecordStateFace>> = {
  open: { id: 'open', code: 'OPEN', label: 'Open', tone: 'info', icon: 'circle-dot' },
  active: { id: 'active', code: 'WIP', label: 'In progress', tone: 'info', icon: 'circle-dot' },
  urgent: { id: 'urgent', code: 'URG', label: 'Urgent', tone: 'warning', icon: 'alarm-clock' },
  late: { id: 'late', code: 'LATE', label: 'Past due', tone: 'warning', icon: 'alarm-clock' },
  done: { id: 'done', code: 'DONE', label: 'Done', tone: 'success', icon: 'check' },
  withdrawn: { id: 'withdrawn', code: 'CXL', label: 'Withdrawn', tone: 'neutral', icon: 'circle-pause' },
};
