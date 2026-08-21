'use client';

/* ──────────────────────────────────────────────────────────────────────────
 * ReceiveFeedbackRegion
 *
 * The single inline home for receive feedback. On Unbox it co-mounts in the
 * absolute dock float stack above the notes + Print · Receive shell (not the
 * in-flow StationWorkbench footer — an absolute dock would cover that slot).
 * Replaces the old bottom-right toast entirely — feedback lives where the
 * operator's eyes already are.
 *
 * It is WELDED to the composer below it (2026-08-21): one silhouette, square
 * bottom, the dock's top radius flattened via `weldTop`. See
 * {@link WeldedFeedbackPanel} for why the seam matters.
 *
 * FOUR STATES, one panel, from the shared machine in
 * {@link INLINE_ACTION_FEEDBACK_TONE}:
 *
 *   loading  → request in flight, OR the local commit landed and the realtime
 *              `zohoReceive` verdict has not. The status line cycles steps
 *              from {@link receivePhaseSteps} — every one derived from state
 *              the client actually holds, never a scripted ticker.
 *   success  → the receive is settled and clean.
 *   warning  → it committed, but carrying something: a photo-policy waiver, a
 *              skipped inventory push, a cooldown, a background sync failure.
 *   error    → it did not go through.
 *
 * The success checklist is OPTIMISTIC: the three Zoho writes (purchase receive,
 * per-line description PUT, PO notes PUT) run server-side in after(), so the
 * checks render immediately from the response summary. A background failure is
 * reconciled via the realtime `zohoReceive` verdict on the station channel —
 * the panel flips to a retryable warning rather than leaving false checks.
 *
 * WHAT THE ROW HOLDS is one truncated line plus the actions. Everything else —
 * the staggered checklist, the per-PO outcomes, the raw response — lives behind
 * More. That is the trade the weld buys: the panel sits on top of the field the
 * operator is about to type in, so it must cost one line at rest.
 * ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from 'react';
import { AnimatePresence } from '@/design-system/motion';
import { AlertTriangle, Check, Loader2 } from '@/components/Icons';
import { getStationChannelName, safeChannelName } from '@/lib/realtime/channels';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useAuth } from '@/contexts/AuthContext';
import { PhotoPolicyOverrideSheet } from '@/components/receiving/PhotoPolicyOverrideSheet';
import { readPhotoPolicyBlock } from '@/lib/receiving/photo-policy-override-wire';
import { InlineActionFeedbackChecklist } from './InlineActionFeedbackCard';
import {
  INLINE_ACTION_FEEDBACK_TONE,
  toneFromVerdictHue,
  type InlineActionFeedbackTone,
} from './inline-action-feedback-tone';
import { WeldedFeedbackPanel, type WeldedFeedbackCta } from './WeldedFeedbackPanel';
import { ReceiveResponsePanel } from './ReceiveResponsePanel';
import { classifyReceiveResponse } from './classify-receive-response';
import { receivePhaseSteps } from './receive-phase-steps';
import { photoPolicyOverrideLabel } from '@/lib/receiving/photo-policy-override-wire';
import type { PhotoPolicyOverrideCode } from '@/lib/receiving/exception-codes';
import type {
  ReceiveInFlight,
  ReceiveResult,
  ReceiveSummary,
} from './line-edit/hooks/useReceiveAction';

/* ── The settled-success view ────────────────────────────────────────────── */

type ChecklistView = {
  tone: Extract<InlineActionFeedbackTone, 'success' | 'warning'>;
  headline: string;
  /** Lines that earn a staggered check inside More. */
  items: string[];
  /** A muted sub-line that does NOT get a check (informational). */
  note?: string;
};

export function buildView(summary: ReceiveSummary, failed: boolean): ChecklistView {
  // A waived receive outranks every success headline below: the lines really
  // did commit, but they committed carrying an open exception, and the bench is
  // where the operator who took that call can still read it back. Warning, and
  // the reason is named — never the plain green "Receive complete".
  if (!failed && summary.photoPolicyWaiver) {
    const { blockers } = summary.photoPolicyWaiver;
    return {
      tone: 'warning',
      headline: `Received without photos · ${photoPolicyOverrideLabel(summary.photoPolicyWaiver.reasonCode)}`,
      items: ['Marked as received'],
      note: blockers.length > 0
        ? `Photo policy waived — ${blockers.join(' · ')}. Logged as a receiving exception.`
        : 'Photo policy waived. Logged as a receiving exception.',
    };
  }
  if (failed) {
    return {
      tone: 'warning',
      headline: 'Inventory receive didn’t go through',
      items: [],
      note: 'Saved locally — lines stay Scanned and will retry. Re-run Receive if it doesn’t clear.',
    };
  }
  if (summary.alreadyReceived) {
    return {
      tone: 'success',
      headline: 'Already received in inventory',
      items: ['Local state now matches the dashboard'],
    };
  }
  if (summary.intent === 'unreceive') {
    return {
      tone: 'success',
      headline: 'Unreceived',
      items: ['Cleared received quantities', 'Marked as scanned locally'],
      note: summary.isUnfound
        ? 'Local receive undone — inventory was not updated.'
        : summary.localOnly
          ? 'Local receive undone — no inventory PO linked.'
          : 'Inventory PO marked unreceived in the background.',
    };
  }
  if (summary.intent === 'scan_only' || summary.localOnly) {
    if (summary.isUnfound) {
      return {
        tone: 'success',
        headline: 'Received locally',
        items: ['Marked as received locally'],
        note: 'Unfound carton — label printed, inventory not updated.',
      };
    }
    return {
      tone: 'success',
      headline: 'Marked as scanned locally',
      items: ['Saved quantities as Scanned'],
      note: 'Inventory not updated — run Receive to sync.',
    };
  }
  // Normal Zoho receive — the headline checklist.
  const n = summary.descriptionsUpdated;
  const plural = n === 1 ? '' : 's';
  const items: string[] = ['Marked as received'];
  if (n > 0) {
    items.push(`Updated ${n} product description${plural} with condition & serial number${plural}`);
  }
  if (summary.notesUpdated) {
    items.push('Updated notes in inventory');
  }
  return { tone: 'success', headline: 'Receive complete', items };
}

const clockLabel = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

/* ── In-flight ───────────────────────────────────────────────────────────── */

function ReceiveInFlightPanel({
  receiving,
  moreOpen,
  onToggleMore,
}: {
  receiving: ReceiveInFlight;
  moreOpen: boolean;
  onToggleMore: () => void;
}) {
  const { startedAt, intent } = receiving;
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => {
      setElapsedMs(Math.max(0, Date.now() - startedAt));
    }, 250);
    return () => window.clearInterval(t);
  }, [startedAt]);

  const steps = receivePhaseSteps({ phase: 'in_flight', intent, elapsedMs });

  return (
    <WeldedFeedbackPanel
      tone="loading"
      steps={steps}
      cycling
      edgeProgress
      leading={<Loader2 className="h-3.5 w-3.5 animate-spin" />}
      meta={`${Math.floor(elapsedMs / 1000)}s`}
      moreOpen={moreOpen}
      onToggleMore={onToggleMore}
    >
      {/* No dismiss while a write is in flight — the operator cannot cancel it,
          so a close control would only hide a running mutation. */}
      <p className="text-role-micro font-medium leading-snug text-text-muted">
        POST /api/receiving/mark-received-po · intent {intent}. The lines commit
        locally first; the inventory purchase receive runs server-side after the
        response and confirms over the station channel.
      </p>
    </WeldedFeedbackPanel>
  );
}

/* ── Settled success (with realtime reconcile) ───────────────────────────── */

function ReceiveSuccessPanel({
  result,
  onDismiss,
  onRetry,
  moreOpen,
  onToggleMore,
}: {
  result: Extract<ReceiveResult, { kind: 'success' }>;
  onDismiss: () => void;
  onRetry?: () => void;
  moreOpen: boolean;
  onToggleMore: () => void;
}) {
  // Reconcile the optimistic checks against the real background verdict. The
  // mark-received-po after() publishes `zohoReceive: 'ok' | 'failed'` per line
  // on the org station channel once the Zoho purchase receive settles.
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const channel = safeChannelName(() => getStationChannelName(orgId!));
  // `demoStatus` is bench-tester only (see its docblock on ReceiveResult) and
  // seeds this directly. The panel remounts per `success-${at}` key, so each
  // scenario activation re-seeds rather than inheriting the last verdict.
  const demo = result.demoStatus ?? null;
  const [status, setStatus] = useState<'pending' | 'confirmed' | 'failed'>(demo ?? 'pending');
  const live = result.reconcile && demo == null;

  // Hard ceiling — if Ably never delivers zohoReceive (or after() hangs on a
  // slow Zoho already-received path), flip to retryable failure instead of
  // holding "waiting for the inventory system" forever.
  useEffect(() => {
    if (!live || status !== 'pending') return;
    const t = window.setTimeout(() => setStatus('failed'), 45_000);
    return () => window.clearTimeout(t);
  }, [live, status]);

  useAblyChannel(
    channel,
    'receiving-log.changed',
    (msg: { data?: { rowId?: unknown; zohoReceive?: unknown } }) => {
      const data = msg?.data;
      const verdict = data?.zohoReceive;
      if (verdict !== 'ok' && verdict !== 'failed') return;
      const rowId = Number(data?.rowId);
      if (!Number.isFinite(rowId) || !result.lineIds.includes(rowId)) return;
      setStatus(verdict === 'ok' ? 'confirmed' : 'failed');
    },
    live && Boolean(orgId) && Boolean(channel),
  );

  const view = buildView(result.summary, status === 'failed');

  // Still waiting on the inventory verdict: this is genuinely a loading state,
  // not a green one. The ticker cycles the writes the server ALREADY reported —
  // facts, held while the confirmation is outstanding.
  const reconciling = result.reconcile && status === 'pending' && view.tone === 'success';

  const tone: InlineActionFeedbackTone = reconciling ? 'loading' : view.tone;
  const steps = reconciling
    ? receivePhaseSteps({ phase: 'reconciling', summary: result.summary })
    : [status === 'confirmed' ? 'Confirmed in inventory' : view.headline];

  const cta: WeldedFeedbackCta | undefined =
    status === 'failed' && onRetry
      ? { label: 'Retry', onClick: onRetry, ariaLabel: 'Re-run receive' }
      : undefined;

  const leading = reconciling ? (
    <Loader2 className="h-3.5 w-3.5 animate-spin" />
  ) : tone === 'warning' ? (
    <AlertTriangle className="h-3.5 w-3.5" />
  ) : (
    <Check className="h-4 w-4" />
  );

  // Key/value rows for the disclosure — real note/description text when
  // present; internal ids (receiving / line ids) stay out.
  const detailRows: Array<[string, string]> = [
    ['Intent', result.summary.intent === 'unreceive' ? 'Unreceive' : result.summary.intent === 'scan_only' ? 'Scan only (local)' : result.summary.intent === 'local_receive' ? 'Received locally' : 'Inventory receive'],
    ...(result.summary.itemDescription
      ? [['Item description', result.summary.itemDescription] as [string, string]]
      : []),
    ...(result.summary.poNotes
      ? [['PO notes', result.summary.poNotes] as [string, string]]
      : []),
    ['Marked received', result.summary.markedReceived ? 'Yes' : 'No'],
    ['Sync', result.reconcile ? status : 'n/a'],
    ['Response', `HTTP ${result.response.httpStatus || '—'} · ${result.response.durationMs}ms`],
  ];

  return (
    <WeldedFeedbackPanel
      tone={tone}
      steps={steps}
      cycling={reconciling}
      edgeProgress={reconciling}
      leading={leading}
      meta={clockLabel(result.at)}
      cta={cta}
      moreOpen={moreOpen}
      onToggleMore={onToggleMore}
      onDismiss={onDismiss}
    >
      {/* The checklist keeps its stagger — it just replays inside the
          disclosure now instead of costing three lines above the composer. */}
      <InlineActionFeedbackChecklist tone={view.tone} items={view.items} />
      {view.note ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-role-micro font-medium leading-snug text-text-muted">
          {view.tone === 'warning' ? (
            <AlertTriangle
              className={`mt-px h-3.5 w-3.5 shrink-0 ${INLINE_ACTION_FEEDBACK_TONE.warning.icon}`}
            />
          ) : null}
          <span className="min-w-0 break-words whitespace-pre-wrap">{view.note}</span>
        </p>
      ) : null}
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded border border-border-soft bg-surface-card/70 px-2 py-1.5">
        {detailRows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-role-micro font-semibold uppercase tracking-wide text-text-faint">
              {k}
            </dt>
            <dd
              className={`min-w-0 break-words text-role-micro font-medium text-text-muted ${
                k === 'Item description' || k === 'PO notes' ? 'whitespace-pre-wrap' : ''
              }`}
            >
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </WeldedFeedbackPanel>
  );
}

/* ── Diagnostic (skip / cooldown / error) ────────────────────────────────── */

function ReceiveDiagnosticPanel({
  result,
  moreOpen,
  onToggleMore,
  onDismiss,
  onRetry,
  onPhotoPolicyOverride,
}: {
  result: Extract<ReceiveResult, { kind: 'diagnostic' }>;
  moreOpen: boolean;
  onToggleMore: () => void;
  onDismiss: () => void;
  onRetry?: () => void;
  onPhotoPolicyOverride?: (code: PhotoPolicyOverrideCode) => void;
}) {
  const [overrideOpen, setOverrideOpen] = useState(false);
  const classification = classifyReceiveResponse(result.response);
  const tone = toneFromVerdictHue(classification.tone);
  const photoBlock = readPhotoPolicyBlock(result.response.httpStatus, result.response.body);
  const canOverride = classification.verdict === 'photo_policy' && Boolean(onPhotoPolicyOverride);

  // The waiver is the CTA only because the operator is already blocked. It
  // stays the panel's ONE verb rather than a button buried under More — but it
  // is never the easy button: confirming costs a named reason that lands on the
  // carton's exception list. Shooting the missing photos is still the way out.
  const cta: WeldedFeedbackCta | undefined = canOverride
    ? {
        label: 'Receive without photos…',
        onClick: () => setOverrideOpen(true),
        ariaLabel: 'Receive without photos, with a waiver reason',
      }
    : onRetry
      ? { label: 'Retry', onClick: onRetry, ariaLabel: 'Re-run receive' }
      : undefined;

  return (
    <>
      <WeldedFeedbackPanel
        tone={tone}
        steps={[classification.headline]}
        leading={<AlertTriangle className="h-3.5 w-3.5" />}
        meta={clockLabel(result.response.at)}
        cta={cta}
        moreOpen={moreOpen}
        onToggleMore={onToggleMore}
        onDismiss={onDismiss}
      >
        <ReceiveResponsePanel
          chrome="bare"
          response={result.response}
          expanded
          onToggle={onToggleMore}
          onDismiss={onDismiss}
        />
      </WeldedFeedbackPanel>

      {canOverride ? (
        <PhotoPolicyOverrideSheet
          open={overrideOpen}
          onClose={() => setOverrideOpen(false)}
          blockers={photoBlock?.blockers ?? []}
          onConfirm={(code) => {
            setOverrideOpen(false);
            onPhotoPolicyOverride?.(code);
          }}
        />
      ) : null}
    </>
  );
}

/* ── Region switcher ─────────────────────────────────────────────────────── */

export function ReceiveFeedbackRegion({
  receiving,
  receiveResult,
  responseExpanded,
  setResponseExpanded,
  onDismiss,
  onRetry,
  onPhotoPolicyOverride,
}: {
  receiving: ReceiveInFlight | null;
  receiveResult: ReceiveResult | null;
  /** Disclosure state. `useReceiveAction` pre-opens it on a hard failure. */
  responseExpanded: boolean;
  setResponseExpanded: (next: boolean) => void;
  onDismiss: () => void;
  /**
   * Re-run the same receive. Optional: a host that can't replay the action
   * simply doesn't offer the verb, and the panel shows no Retry — never a dead
   * button.
   */
  onRetry?: () => void;
  /**
   * Replay the blocked receive with an operator-chosen waiver code. Optional:
   * a host that can't re-run the receive simply doesn't offer the override, and
   * the block stays hard — never a dead button.
   */
  onPhotoPolicyOverride?: (code: PhotoPolicyOverrideCode) => void;
}) {
  const phase: 'progress' | 'success' | 'diagnostic' | 'none' = receiving
    ? 'progress'
    : receiveResult?.kind === 'success'
      ? 'success'
      : receiveResult?.kind === 'diagnostic'
        ? 'diagnostic'
        : 'none';

  // Key the SUCCESS child by its timestamp so a fresh receive replays the
  // stagger; progress / diagnostic are stable. The panel peels once per key,
  // and its status line crossfades within a key — so a receive that moves
  // in-flight → reconciling → confirmed hinges up once and then narrates,
  // rather than slamming the composer's top radius open and shut three times.
  const childKey =
    phase === 'success' && receiveResult?.kind === 'success'
      ? `success-${receiveResult.at}`
      : phase;

  const toggleMore = () => setResponseExpanded(!responseExpanded);

  return (
    <AnimatePresence mode="wait" initial={false}>
      {phase === 'progress' && receiving ? (
        <ReceiveInFlightPanel
          key={childKey}
          receiving={receiving}
          moreOpen={responseExpanded}
          onToggleMore={toggleMore}
        />
      ) : phase === 'success' && receiveResult?.kind === 'success' ? (
        <ReceiveSuccessPanel
          key={childKey}
          result={receiveResult}
          onDismiss={onDismiss}
          onRetry={onRetry}
          moreOpen={responseExpanded}
          onToggleMore={toggleMore}
        />
      ) : phase === 'diagnostic' && receiveResult?.kind === 'diagnostic' ? (
        <ReceiveDiagnosticPanel
          key={childKey}
          result={receiveResult}
          moreOpen={responseExpanded}
          onToggleMore={toggleMore}
          onDismiss={onDismiss}
          onRetry={onRetry}
          onPhotoPolicyOverride={onPhotoPolicyOverride}
        />
      ) : null}
    </AnimatePresence>
  );
}

/* The dev/preview ReceiveUiTestButton was removed by request. To preview the
 * panel states again, drive a real receive or temporarily inject a
 * `ReceiveResult` into `setReceiveResult`. */
