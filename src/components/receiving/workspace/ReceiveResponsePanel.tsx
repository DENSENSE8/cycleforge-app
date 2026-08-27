'use client';

import { useState } from 'react';
import { ChevronDown, X } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { PhotoPolicyOverrideSheet } from '@/components/receiving/PhotoPolicyOverrideSheet';
import { readPhotoPolicyBlock } from '@/lib/receiving/photo-policy-override-wire';
import type { PhotoPolicyOverrideCode } from '@/lib/receiving/exception-codes';
import { toast } from '@/lib/toast';
import {
  classifyReceiveResponse,
  type ReceiveResponseClassifyInput,
} from './classify-receive-response';

/* ──────────────────────────────────────────────────────────────────────────
 * ReceiveResponsePanel
 *
 * Surfaces the last POST /api/receiving/mark-received-po response below the
 * print preview so operators can see WHY a Zoho receive succeeded, was
 * skipped, or failed. The previous toast-only UX hid critical details
 * (especially "Zoho attempted: 0" — the no-PO-link case — which silently
 * fell through to a generic "Line received" success toast).
 *
 * Verdict mapping (mirrors the server's error_kind taxonomy):
 *   ✓ success      — zoho.attempted ≥ 1, zoho.ok = true, zoho.error null
 *   ⚠ skipped      — zoho.attempted === 0  (no linked PO/line item ids;
 *                                            local DB updated, Zoho untouched)
 *   ✗ rate_limit   — Zoho daily API quota exhausted
 *   ✗ circuit_open — internal circuit breaker tripped from recent failures
 *   ✗ api          — Zoho rejected the request (4xx/5xx with a Zoho code)
 *   ✗ other        — unexpected error / network failure
 *   ✓ verified     — dashboard already DONE but Zoho GET confirms fully received
 *                    (skip_reason zoho_already_fully_received; receive_id null)
 *
 * CHROME is a parameter (2026-08-21). `card` is the standalone face above —
 * its own tone card, headline, chevron and dismiss. `bare` is the DETAIL BODY
 * only: no shell, no headline, no controls, because the host already paints
 * all four. It exists so the welded receive panel can mount this exact verdict
 * body inside its disclosure instead of forking a second copy of the per-PO
 * result list and the raw-response expander — the alternative was a page-local
 * twin of a 240-line panel to delete one border.
 * ────────────────────────────────────────────────────────────────────────── */

export type ReceiveResponsePanelProps = {
  response: ReceiveResponseClassifyInput;
  expanded: boolean;
  onToggle: () => void;
  onDismiss: () => void;
  /**
   * Replay the blocked receive carrying an operator-chosen waiver code. When
   * absent the photo-policy verdict renders read-only — the block stays hard,
   * which is the correct degrade for a host that can't re-run the receive.
   */
  onPhotoPolicyOverride?: (code: PhotoPolicyOverrideCode) => void;
  /**
   * `card` (default) — the standalone tone card with its own headline row,
   * raw-response chevron and dismiss. `bare` — detail body only, for a host
   * that already owns the shell, the verdict line and the controls.
   */
  chrome?: 'card' | 'bare';
};

export function ReceiveResponsePanel({
  response,
  expanded,
  onToggle,
  onDismiss,
  onPhotoPolicyOverride,
  chrome = 'card',
}: ReceiveResponsePanelProps) {
  const body = (response.body || {}) as Record<string, unknown>;
  const classification = classifyReceiveResponse(response);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const photoBlock = readPhotoPolicyBlock(response.httpStatus, response.body);
  const canOverride = classification.verdict === 'photo_policy' && Boolean(onPhotoPolicyOverride);
  const showApiErrorCallout =
    !response.ok &&
    typeof body.error === 'string' &&
    body.error.trim().length > 0;
  const toneStyles = {
    emerald: {
      bar: 'bg-emerald-500',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      title: 'text-emerald-900',
      dot: 'bg-emerald-500',
    },
    amber: {
      bar: 'bg-amber-500',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      title: 'text-amber-900',
      dot: 'bg-amber-500',
    },
    rose: {
      bar: 'bg-rose-500',
      bg: 'bg-rose-50',
      border: 'border-rose-200',
      title: 'text-rose-900',
      dot: 'bg-rose-500',
    },
  }[classification.tone];

  const zoho = (body.zoho || {}) as {
    attempted?: number;
    ok?: boolean;
    rate_limited?: boolean;
    error?: string | null;
    skip_reason?: string | null;
    results?: Array<{
      purchaseorder_id?: string;
      receive_id?: string | null;
      error?: string | null;
      error_kind?: 'rate_limit' | 'circuit_open' | 'api' | 'other' | null;
    }>;
  };
  const results = zoho.results ?? [];
  const timestamp = new Date(response.at).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const rawJson = JSON.stringify(
    response.body ?? { networkError: response.networkError },
    null,
    2,
  );

  const copyRaw = () => {
    try {
      void navigator.clipboard.writeText(rawJson);
      toast.success('Response copied');
    } catch {
      /* clipboard unavailable */
    }
  };

  /** The per-PO outcome list — the only place a partial failure is legible. */
  const resultRows =
    results.length > 0 && classification.verdict !== 'success' ? (
      <ul className="space-y-0.5">
        {results.map((r, i) => {
          const ok = !r.error;
          return (
            <li key={i} className="flex items-center gap-1.5 text-role-micro leading-tight">
              <span
                className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${ok ? 'bg-emerald-500' : 'bg-rose-500'}`}
                aria-hidden
              />
              <span className="truncate font-mono font-semibold text-text-default">
                PO {r.purchaseorder_id ?? '?'}
              </span>
              <span className="text-text-faint">·</span>
              <span className="truncate text-text-muted">
                {ok
                  ? `receive ${r.receive_id ?? '—'}`
                  : `${r.error_kind ?? 'error'}: ${r.error ?? 'unknown'}`}
              </span>
            </li>
          );
        })}
      </ul>
    ) : null;

  const rawBlock = (
    <>
      <p className="mb-1 text-role-micro uppercase tracking-widest text-text-soft">
        Raw response · /api/receiving/mark-received-po
      </p>
      <pre className="max-h-56 overflow-auto rounded border border-border-soft bg-surface-card p-1.5 font-mono text-role-eyebrow leading-relaxed text-text-muted">
{rawJson}
      </pre>
      <div className="mt-1 flex justify-end">
        <Button variant="secondary" size="sm" onClick={copyRaw}>
          Copy JSON
        </Button>
      </div>
    </>
  );

  // ── bare: detail body only ────────────────────────────────────────────────
  // The host (welded receive panel) already paints the shell, the verdict line,
  // the dismiss and the photo-policy CTA — so none of those render here. What
  // is left is what the row could not hold: the reason, the per-PO outcomes,
  // and the raw payload.
  if (chrome === 'bare') {
    return (
      <div className="space-y-1.5">
        <p className="text-role-eyebrow font-semibold tabular-nums text-text-soft">
          {timestamp} · {response.durationMs}ms · HTTP {response.httpStatus || '—'}
        </p>
        {classification.detail ? (
          <p className="text-role-micro font-medium leading-snug text-text-muted">
            {classification.detail}
          </p>
        ) : null}
        {showApiErrorCallout ? (
          <div className="rounded border border-rose-200 bg-rose-50/90 px-1.5 py-1">
            <p className="text-role-micro uppercase tracking-wide text-rose-800">API response</p>
            <p className="break-words font-mono text-role-micro leading-snug text-rose-950">
              {String(body.error)}
            </p>
          </div>
        ) : null}
        {resultRows}
        <div>{rawBlock}</div>
      </div>
    );
  }

  return (
    <div className={`-mx-2 mt-1.5 border-t ${toneStyles.border} px-2 pt-1.5 pb-2`}>
      <div className={`relative overflow-hidden rounded-md border ${toneStyles.border} ${toneStyles.bg}`}>
        <span className={`absolute inset-y-0 left-0 w-[3px] ${toneStyles.bar}`} aria-hidden />
        <div className="flex items-start gap-2 px-2 py-1.5">
          <span className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${toneStyles.dot}`} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <p className={`text-role-micro uppercase tracking-wider ${toneStyles.title}`}>
                {classification.headline}
              </p>
              {classification.verdict !== 'success' ? (
                <span className="text-role-eyebrow font-semibold tabular-nums text-text-soft">
                  {timestamp} · {response.durationMs}ms · HTTP {response.httpStatus || '—'}
                </span>
              ) : null}
            </div>
            {classification.detail ? (
              <p className="mt-0.5 text-role-micro font-medium leading-snug text-text-muted">
                {classification.detail}
              </p>
            ) : null}
            {canOverride ? (
              // Quiet + secondary on purpose: shooting the missing photos is
              // the primary path out of this state. The override costs the
              // operator a named reason that lands on the carton's exception
              // list, so it must never read as the easy button.
              <div className="mt-1.5">
                <Button variant="secondary" size="sm" onClick={() => setOverrideOpen(true)}>
                  Receive without photos…
                </Button>
              </div>
            ) : null}
            {showApiErrorCallout ? (
              <div className="mt-1.5 rounded border border-rose-200 bg-rose-50/90 px-1.5 py-1">
                <p className="text-role-micro uppercase tracking-wide text-rose-800">API response</p>
                <p className="break-words font-mono text-role-micro leading-snug text-rose-950">
                  {String(body.error)}
                </p>
              </div>
            ) : null}
            {resultRows ? <div className="mt-1.5">{resultRows}</div> : null}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <HoverTooltip label={expanded ? 'Hide raw response' : 'Show raw response'} asChild>
              <IconButton
                onClick={onToggle}
                ariaLabel={expanded ? 'Hide raw response' : 'Show raw response'}
                className="rounded p-0.5 text-text-faint hover:bg-surface-card/60 hover:text-text-muted"
                icon={
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
                  />
                }
              />
            </HoverTooltip>
            <HoverTooltip label="Dismiss" asChild>
              <IconButton
                onClick={onDismiss}
                ariaLabel="Dismiss response"
                className="rounded p-0.5 text-text-faint hover:bg-surface-card/60 hover:text-text-muted"
                icon={<X className="h-3 w-3" />}
              />
            </HoverTooltip>
          </div>
        </div>
        {expanded ? (
          <div className={`border-t ${toneStyles.border} bg-surface-card/70 px-2 py-1.5`}>
            {rawBlock}
          </div>
        ) : null}
      </div>

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
    </div>
  );
}
