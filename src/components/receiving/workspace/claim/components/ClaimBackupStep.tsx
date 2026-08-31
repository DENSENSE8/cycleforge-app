import { Archive } from '@/components/Icons';
import { cn } from '@/utils/_cn';

/**
 * Pre-file backup note on the sticky File footer — one line next to the CTA.
 *
 * Filing backs up the carton's photos to local storage. That archive is a
 * SERVER-side sweep of the whole carton (`archiveAndStampReceivingClaimPhotos`)
 * and never read the attach picker's selection, so it survived the picker's
 * removal untouched — this line is what still says so.
 *
 * It used to read `Attach 2/7` off the claim's own photo list. Counting meant
 * every claim surface pulled `/api/receiving-photos` just to render a number in
 * the footer, twice over now that the claim mounts in both the rail and the
 * centre. The real count lands after filing, on the Filed step's archive result.
 */
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
