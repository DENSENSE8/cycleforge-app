'use client';

import { Lock } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';

interface UnboxPreviewLockProps {
  /** Leave without opening anything. */
  onDismiss: () => void;
}

/** Preview stance's read-only band over an open carton. */
export function UnboxPreviewLock({ onDismiss }: UnboxPreviewLockProps) {
  return (
    <div
      data-unbox-preview-lock=""
      className={cn(
        PRIMARY_CHROME_ROW_FACE,
        'z-raised flex w-full items-center gap-2 border-b border-border-hairline bg-amber-50 px-3',
      )}
    >
      <Lock className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
      <span className="shrink-0 text-role-eyebrow uppercase tracking-widest text-amber-700">
        Read only
      </span>
      <span className="min-w-0 flex-1 truncate text-role-caption text-text-soft">
        Nothing here is recorded — this carton has not been opened.
      </span>
      <Button variant="ghost" size="sm" onClick={onDismiss} className="shrink-0 rounded-none">
        Close
      </Button>
    </div>
  );
}
