import { Archive } from '@/components/Icons';
import { cn } from '@/utils/_cn';

/** Pre-file backup note on the sticky File footer — one line next to the CTA. */
export function ClaimBackupStep({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-none bg-surface-sunken px-3 py-0',
        className,
      )}
      data-testid="claim-backup-section"
    >
      <Archive className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />
      <p className="truncate text-role-caption font-medium text-text-muted">
        Backs up carton photos
      </p>
    </div>
  );
}
