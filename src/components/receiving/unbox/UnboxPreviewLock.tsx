'use client';

import { Lock } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';

interface UnboxPreviewLockProps {
  /** Leave without opening anything. */
  onDismiss: () => void;
}

/**
 * Preview stance's read-only band over an open carton.
 *
 * The pane beneath it paints exactly as a scanned carton does — identity,
 * middle ops-flow, the Displays column — because that IS the answer to *"what
 * is this?"*. What preview withholds is the **work**: the body is `inert`, so
 * no grade, serial, note or photo can land, and the open wrote nothing (no
 * `receiving_scans` row, no `receiving_unbox.opened_at`, no recents view).
 *
 * The band carries **Close** and nothing else. There is deliberately no
 * commit button: Preview and Scan are two stances that share the bar and
 * nothing else, so neither may flip the other. An operator who decides to open
 * the carton for real switches the stance themselves and scans again.
 *
 * A band + `inert` rather than a `readOnly` prop threaded through the editor:
 * inertness is a property of the whole plane, and a per-control flag would have
 * to be right in ~40 places to be right at all — one missed control is a silent
 * write from a stance whose entire contract is not writing. Same technique the
 * pane already uses for its own overlay.
 */
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
