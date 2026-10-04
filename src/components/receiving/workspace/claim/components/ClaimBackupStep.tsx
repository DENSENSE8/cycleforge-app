import { Archive } from '@/components/Icons';

/**
 * Pre-file backup note on the floating File footer — one line next to the CTA.
 * No ground of its own: the footer floats (owner 2026-10-03).
 */
export function ClaimBackupStep() {
  return (
    <div
      className="flex min-h-9 min-w-0 flex-1 items-center gap-2"
      data-testid="claim-backup-section"
    >
      <Archive className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />
      <p className="truncate text-role-caption font-medium text-text-muted">
        Backs up carton photos
      </p>
    </div>
  );
}
