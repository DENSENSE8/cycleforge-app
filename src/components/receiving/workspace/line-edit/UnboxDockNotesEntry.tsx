'use client';

/**
 * Manual-entry escalation for the Unbox dock floor.
 *
 * DenseComposeFields grammar (Claim golden): eyebrow + commit, full-bleed
 * sunken body. No raised chat card / OmnichannelComposerDock.
 *
 * GRAIN: writes `receiving_line.notes` only — never the printed `label_note`.
 * Commit saves + closes notes (returns focus to scan). Does NOT fire the
 * carton Print·Receive terminal — that surface is unmounted during capture.
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  DenseComposeBodyBand,
  DenseComposeBodyTextarea,
  DenseComposeLabel,
} from '@/design-system/components';
import { Button } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

export function UnboxDockNotesEntry({
  value,
  onChange,
  onSave,
  onDone,
  autoFocus = true,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Persist when dirty. Returns true if a write happened. */
  onSave: () => boolean;
  /** After save — close notes mode + return focus to scan. */
  onDone: () => void;
  autoFocus?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!autoFocus) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [autoFocus]);

  const commit = useCallback(() => {
    onSave();
    onDone();
  }, [onSave, onDone]);

  return (
    <div className="flex w-full min-w-0 flex-col" data-unbox-dock-notes-entry>
      <div className="flex h-9 min-w-0 items-center justify-between gap-2 px-2">
        <DenseComposeLabel className="mb-0">Note / Entry</DenseComposeLabel>
        <Button
          size="sm"
          variant="primary"
          onClick={commit}
          data-unbox-dock-notes-commit
        >
          Done
        </Button>
      </div>
      <DenseComposeBodyBand className="min-w-0">
        <DenseComposeBodyTextarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            onSave();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              commit();
              return;
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              commit();
            }
          }}
          placeholder="Item note (not printed)"
          aria-label="Item note"
          rows={3}
          className={cn(
            // Dock escalate — compact sunken band, not Claim's tall sheet body.
            'min-h-[4.5rem] resize-none',
          )}
        />
      </DenseComposeBodyBand>
    </div>
  );
}
