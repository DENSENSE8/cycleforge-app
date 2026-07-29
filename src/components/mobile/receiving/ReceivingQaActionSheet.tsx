'use client';

/**
 * ReceivingQaActionSheet
 * ─────────────────────────────────────────────────────────────────────
 * Sticky-bottom launcher on `/m/r/[id]` that lets a tech mark every
 * line on a received carton as PASSED or FAILED (return) from one tap.
 *
 * Behaviour:
 *   • One BottomSheet row per outcome (PASS, FAIL, add note).
 *   • Destructive FAIL opens a stacked ConfirmSheet asking for a reason.
 *   • Each chosen action POSTs `/api/receiving/mark-received` ONCE PER
 *     line in the carton — that endpoint is the official writer for
 *     `receiving_lines.qa_status`.
 *
 * The mobile center scan button never calls this directly; the tech has
 * to be on a specific carton's detail page to fire it. That's the
 * intentional invariant: the scan flow is intent-routing, the action
 * sheet is the deliberate mutation.
 */

import { useState } from 'react';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';
import { BottomSheet, ConfirmSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/design-system/primitives';
import { PhotoPolicyOverrideSheet } from '@/components/receiving/PhotoPolicyOverrideSheet';
import {
  photoPolicyOverrideField,
  readPhotoPolicyBlock,
  readPhotoPolicyWaiver,
} from '@/lib/receiving/photo-policy-override-wire';
import type { PhotoPolicyOverrideCode } from '@/lib/receiving/exception-codes';

export interface ReceivingLineLite {
  id: number;
  sku: string | null;
  workflow_status: string | null;
  qa_status: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  receivingId: number;
  lines: ReceivingLineLite[];
  onMutated?: () => void;
}

async function markAllLines(
  lines: ReceivingLineLite[],
  qaStatus: 'PASSED' | 'FAILED_FUNCTIONAL' | 'FAILED_DAMAGED' | 'FAILED_INCOMPLETE',
  dispositionCode: 'ACCEPT' | 'RTV' | 'HOLD',
  notes: string | null,
  /**
   * Photo-policy waiver for this whole pass, or null for none. REQUIRED at
   * every call site — no default — so adding a third verdict action can't
   * silently inherit a waiver it never asked the operator about.
   */
  photoPolicyOverride: PhotoPolicyOverrideCode | null,
): Promise<{
  ok: number;
  failed: number;
  photoBlockers: string[] | null;
  waived: number;
  /** Lines the gate blocked — the exact set a waived retry replays. */
  blockedLines: ReceivingLineLite[];
}> {
  let ok = 0;
  let failed = 0;
  let waived = 0;
  // First PHOTO_POLICY 409's blockers — the org's photo policy judges the whole
  // carton, so one set of reasons covers every blocked line.
  let photoBlockers: string[] | null = null;
  const blockedLines: ReceivingLineLite[] = [];
  for (const line of lines) {
    try {
      const res = await fetch('/api/receiving/mark-received', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiving_line_id: line.id,
          qa_status: qaStatus,
          disposition_code: dispositionCode,
          condition_grade: qaStatus === 'PASSED' ? 'USED_A' : 'PARTS',
          notes,
          client_event_id: safeRandomUUID(),
          ...(photoPolicyOverride ? photoPolicyOverrideField(photoPolicyOverride) : null),
        }),
      });
      const body = (await res.json().catch(() => null)) as unknown;
      if (res.ok) {
        ok += 1;
        if (readPhotoPolicyWaiver(body)) waived += 1;
      } else {
        failed += 1;
        const block = readPhotoPolicyBlock(res.status, body);
        if (block) {
          blockedLines.push(line);
          if (photoBlockers === null) photoBlockers = block.blockers;
        }
      }
    } catch {
      failed += 1;
    }
  }
  return { ok, failed, photoBlockers, waived, blockedLines };
}

export function ReceivingQaActionSheet({ open, onClose, receivingId, lines, onMutated }: Props) {
  const [confirmFail, setConfirmFail] = useState<null | { reason: string }>(null);
  const [confirmPass, setConfirmPass] = useState(false);
  const [busy, setBusy] = useState(false);
  /**
   * A photo-policy block the operator can consciously waive. Holds the gate's
   * blockers plus the retry that replays the SAME verdict pass carrying the
   * chosen code — so the waiver stays bound to the action that was blocked
   * instead of becoming a mode the next action inherits.
   */
  const [photoBlock, setPhotoBlock] = useState<null | {
    blockers: string[];
    retry: (code: PhotoPolicyOverrideCode) => void;
  }>(null);

  const lineCount = lines.length;

  // `targetLines` narrows a waived retry to the lines the gate actually
  // blocked — re-posting the ones that already went through would be a second
  // verdict write for no reason.
  const runPass = async (
    targetLines: ReceivingLineLite[] = lines,
    photoPolicyOverride: PhotoPolicyOverrideCode | null = null,
  ) => {
    setBusy(true);
    const { ok, failed, photoBlockers, waived, blockedLines } = await markAllLines(
      targetLines,
      'PASSED',
      'ACCEPT',
      null,
      photoPolicyOverride,
    );
    setBusy(false);
    // Blocked and not yet waived: keep the sheet open and offer the override
    // instead of firing a toast the operator can't act on.
    if (photoBlockers && !photoPolicyOverride) {
      setPhotoBlock({
        blockers: photoBlockers,
        retry: (code) => {
          setPhotoBlock(null);
          void runPass(blockedLines, code);
        },
      });
      return;
    }
    setConfirmPass(false);
    onClose();
    if (failed > 0) toast.error(`Marked ${ok} passed · ${failed} failed`);
    else if (waived > 0) toast.warning(`Marked ${ok} as tested PASS · photos waived`);
    else toast.success(`Marked ${ok} line${ok === 1 ? '' : 's'} as tested PASS`);
    onMutated?.();
  };

  // `reason` is threaded as an argument, not read from `confirmFail`: the
  // ConfirmSheet clears that state the moment it fires, so a waived RETRY would
  // otherwise find it null and silently do nothing.
  const runFail = async (
    reason: string | null,
    targetLines: ReceivingLineLite[] = lines,
    photoPolicyOverride: PhotoPolicyOverrideCode | null = null,
  ) => {
    setBusy(true);
    const { ok, failed, photoBlockers, waived, blockedLines } = await markAllLines(
      targetLines,
      'FAILED_FUNCTIONAL',
      'RTV',
      reason,
      photoPolicyOverride,
    );
    setBusy(false);
    if (photoBlockers && !photoPolicyOverride) {
      setPhotoBlock({
        blockers: photoBlockers,
        retry: (code) => {
          setPhotoBlock(null);
          void runFail(reason, blockedLines, code);
        },
      });
      return;
    }
    setConfirmFail(null);
    onClose();
    if (failed > 0) toast.error(`Returned ${ok} · ${failed} failed`);
    else if (waived > 0) toast.warning(`Returned ${ok} · photos waived`);
    else toast.success(`Marked ${ok} line${ok === 1 ? '' : 's'} as FAILED · return`);
    onMutated?.();
  };

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title={`RCV-${receivingId} · ${lineCount} line${lineCount === 1 ? '' : 's'}`}>
        <div className="flex flex-col gap-2">
          {/* ds-raw-button: vibrant emerald gradient success CTA — no success variant in Button */}
          <button
            type="button"
            onClick={() => setConfirmPass(true)}
            disabled={busy || lineCount === 0}
            className="ds-raw-button flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-sm font-semibold uppercase tracking-wider text-white shadow-md shadow-emerald-600/30 transition-transform active:scale-[0.98] disabled:opacity-40"
          >
            Mark tested — PASS
          </button>
          {/* ds-raw-button: vibrant rose gradient CTA, designed twin of the emerald PASS CTA above */}
          <button
            type="button"
            onClick={() => setConfirmFail({ reason: '' })}
            disabled={busy || lineCount === 0}
            className="ds-raw-button flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-rose-700 text-sm font-semibold uppercase tracking-wider text-white shadow-md shadow-rose-600/30 transition-transform active:scale-[0.98] disabled:opacity-40"
          >
            Mark FAILED — return
          </button>
          <Button variant="ghost" onClick={onClose} className="mt-2 h-12 w-full text-text-muted">
            Cancel
          </Button>
        </div>
      </BottomSheet>

      <ConfirmSheet
        open={confirmPass}
        onClose={() => setConfirmPass(false)}
        title={`Mark ${lineCount} line${lineCount === 1 ? '' : 's'} PASSED?`}
        message="Marks each line tested-PASS with disposition ACCEPT. Cannot be undone from this screen."
        confirmLabel={busy ? 'Working…' : 'Yes, mark PASSED'}
        onConfirm={() => void runPass()}
      />

      {confirmFail && (
        <ConfirmSheet
          open={!!confirmFail}
          onClose={() => setConfirmFail(null)}
          title="Mark FAILED — return"
          message="Marks every line tested-FAIL with disposition RTV (return to vendor). Use the note field below to capture the reason."
          confirmLabel={busy ? 'Working…' : 'Yes, return all'}
          destructive
          onConfirm={() => void runFail(confirmFail.reason || null)}
        />
      )}

      {/* Level 2 — above both the action sheet and a stacked ConfirmSheet. */}
      <PhotoPolicyOverrideSheet
        open={photoBlock !== null}
        onClose={() => setPhotoBlock(null)}
        blockers={photoBlock?.blockers ?? []}
        busy={busy}
        level={2}
        onConfirm={(code) => photoBlock?.retry(code)}
      />
    </>
  );
}
