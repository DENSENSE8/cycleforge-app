'use client';

import { useEffect, useRef } from 'react';
import { toast } from '@/lib/toast';
import { useUploadQueue } from '@/components/mobile/receiving/PhotoUploadQueue';
// One copy of the error ladder, shared with the card that owns this job now.
import { humanizeUploadError } from '@/components/station/capture-upload/capture-upload-model';

/**
 * **Demoted to a failure ECHO (P0, 2026-08-01).** The completion/failure SoT is
 * now `CaptureUploadStatus` — the bottom-anchored card mounted by
 * `CaptureUploadDock` in `m/(shell)`, which shows queued / uploading / failed /
 * committed for all three capture domains and carries the **Retry** this file
 * never could. Station law wanted that all along: pass/fail is a card the
 * operator can read at ~3 ft, not a four-second corner toast
 * (`.claude/rules/display/station.md` §6).
 *
 * What is left here, and why it is not a twin:
 *
 *   • **success toast — REMOVED.** The card now shows "N photos saved" and
 *     holds it. Toasting the same fact beside it is two shapes for one job,
 *     which is the drift the SoT rules exist to stop.
 *   • **failure toast — KEPT.** It is the one thing the card cannot do: reach
 *     an operator who has already walked away from the shell (or is deep in a
 *     fullscreen `(immersive)` camera, where the dock deliberately does not
 *     mount). The card remains the durable, retryable record; this is a nudge
 *     toward it.
 *
 * If a later phase gives the immersive group its own status surface, delete
 * this file rather than growing it back.
 */
export function PhotoUploadToaster() {
  const entries = useUploadQueue();

  // Per-entry terminal-state dedupe so each failure toasts exactly once.
  const notifiedFailed = useRef<Set<string>>(new Set());

  // Coalesce buffer + flush timer.
  const pendingFailed = useRef<string[]>([]);
  const failTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let sawFailed = false;

    for (const e of entries) {
      if (e.state === 'failed' && !notifiedFailed.current.has(e.id)) {
        notifiedFailed.current.add(e.id);
        pendingFailed.current.push(e.error || 'Upload failed');
        sawFailed = true;
      }
    }

    if (sawFailed) {
      if (failTimer.current) clearTimeout(failTimer.current);
      failTimer.current = setTimeout(() => {
        const reasons = pendingFailed.current;
        pendingFailed.current = [];
        if (reasons.length === 0) return;
        const n = reasons.length;
        toast.error(
          n === 1 ? 'Photo upload failed' : `${n} photo uploads failed`,
          {
            description: humanizeUploadError(reasons[0]),
            position: 'top-center',
            duration: 8000,
          },
        );
      }, 500);
    }
  }, [entries]);

  // Clear timer on unmount.
  useEffect(() => {
    return () => {
      if (failTimer.current) clearTimeout(failTimer.current);
    };
  }, []);

  return null;
}
