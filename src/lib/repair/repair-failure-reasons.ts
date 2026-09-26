/** Repair-failure reason vocabulary — the GLOBAL built-in SoT for repair intake reasons. */

interface RepairFailureReason {
  code: string;
  label: string;
}

export const REPAIR_FAILURE_REASONS: readonly RepairFailureReason[] = [
  // PLEASE_WAIT ("Please wait") and SKIP ("Skip") retired 2026-09-24 — placeholder
  // seeds, not repair reasons (migration 2026-09-24_retire_placeholder_repair_reasons.sql).
  { code: 'NO_SOUND', label: 'No sound' },
  { code: 'SPEAKER_BUZZ', label: 'Speaker Buzz' },
  { code: 'CD_ISSUES', label: 'CD Issues' },
  { code: 'LCD_ISSUES', label: 'LCD Issues' },
];

/** The label list — what ReasonSelector renders/stores when there's no per-SKU template. */
export const REPAIR_FAILURE_LABELS: readonly string[] = REPAIR_FAILURE_REASONS.map((r) => r.label);
