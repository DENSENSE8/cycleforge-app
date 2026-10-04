/** `/reports` tab vocabulary — the page's `?tab=` and its route param spec share it. */

export const REPORT_TABS = [
  { id: 'packer', label: 'Packer day' },
  { id: 'activity', label: 'Task time / activity' },
] as const;

export type ReportTab = (typeof REPORT_TABS)[number]['id'];

/** `?tab=` → a known tab, or `null` (the page falls back to `packer`). */
export function parseReportTab(raw: string | null | undefined): ReportTab | null {
  return REPORT_TABS.find((t) => t.id === raw)?.id ?? null;
}
