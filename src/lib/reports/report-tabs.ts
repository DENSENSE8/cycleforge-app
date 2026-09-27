/** `/reports` tab vocabulary — the page's `?tab=` and its route param spec share it. */

export const REPORT_TABS = [
  { id: 'staff', label: 'Staff day' },
  /*
   * Packer day arrived 2026-09-16 when `/operations?mode=analytics` was
   * retired. It is a DAY-scoped report like Staff day, which is why it sits
   * beside it rather than at the end with the three SKU families.
   */
  { id: 'packer', label: 'Packer day' },
  { id: 'utilization', label: 'Bin Utilization' },
  { id: 'velocity', label: 'Velocity (30d)' },
  { id: 'dead', label: 'Dead Stock (90d+)' },
  /*
   * Completed tasks arrived 2026-09-22 with the `work_assignments` task desk.
   * It sits last because it is the only tab that is not about stock or a
   * shift: it is the record one staffer's finished follow-ups leave behind.
   */
  { id: 'tasks', label: 'Tasks' },
  { id: 'activity', label: 'Task time / activity' },
] as const;

export type ReportTab = (typeof REPORT_TABS)[number]['id'];

/** `?tab=` → a known tab, or `null` (the page falls back to `staff`). */
export function parseReportTab(raw: string | null | undefined): ReportTab | null {
  return REPORT_TABS.find((t) => t.id === raw)?.id ?? null;
}
