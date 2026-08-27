import { Archive } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import type { ReceivingClaimController } from '../hooks/useReceivingClaimController';

/**
 * Pre-file photo count on the sticky File footer — one line next to the CTA.
 * Filing attaches checked photos and backs up all carton photos locally.
 */
export function ClaimBackupStep({
  c,
  className,
}: {
  c: ReceivingClaimController;
  className?: string;
}) {
  const total = c.photos.photos.length;
  const attaching = c.photos.selectedPhotoIds.size;

  const label =
    total === 0
      ? 'No photos'
      : attaching > 0
        ? `Attach ${attaching}/${total}`
        : `Backup ${total}`;

  return (
    <div
      className={cn(
        'flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-none bg-surface-sunken px-3 py-0',
        className,
      )}
      data-testid="claim-backup-section"
    >
      <Archive className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />
      <p className="truncate text-role-caption font-medium text-text-muted">{label}</p>
    </div>
  );
}
