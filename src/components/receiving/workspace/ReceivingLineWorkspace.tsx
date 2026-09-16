'use client';

import { useEffect } from 'react';
import { LineEditPanel } from './LineEditPanel';
import { TriagePanel } from '../triage/TriagePanel';
import { useSurfacePaintMark } from '@/lib/observability/paint-timing';
import { useUnboxPrimaryPaintOptional } from '@/components/receiving/unbox/unbox-primary-paint-context';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

/** Which de-coupled right-pane panel to render. */
type ReceivingWorkspaceVariant = 'unbox' | 'triage';

interface NavState {
  currentIndex: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
}

interface Props {
  row: ReceivingLineRow;
  staffId: string;
  accordionBootstrap: 'default' | 'all';
  /** Nav state mirrored from the sidebar via `receiving-workspace-nav-state`. */
  nav: NavState | null;
  /** Which workspace mode — `triage` hides unbox-only sections (photos, claim,
   *  label, print·receive, serial scan). Defaults to the full `unbox` editor. */
  variant?: ReceivingWorkspaceVariant;
  /**
   * Whether this open stamps the operator's recents (`receiving_line_views` →
   * the Recent tab). **Required, deliberately undefaulted** — it decides whether
   * a write claims that this staffer touched this carton, and a default would
   * silently answer for every call site nobody revisited
   * (`backend-patterns.md` → a safety classification is a required parameter).
   */
  recordView: boolean;
  onClose: () => void;
}

/**
 * Right-pane focused work-item view for a single receiving line.
 *
 * Unbox leads with {@link StationContextBar} (identity bookmark synced
 * to the workbench body column; {@link StationMoreDetails} absolute in
 * the corner) inside `LineEditPanel`. Workspace steppers are gone — carton
 * pipeline progress lives in ReceivingDetailsStack only.
 *
 * Closing dispatches `receiving-workspace-close`; the sidebar reacts by
 * clearing its `selectedLine`/`scanMatchedRows`/`poContext` so both panes
 * converge on an empty state.
 */
export function ReceivingLineWorkspace({
  row,
  staffId,
  accordionBootstrap,
  nav,
  variant = 'unbox',
  recordView,
  onClose,
}: Props) {
  useSurfacePaintMark('unbox:workspace', variant === 'unbox');
  // Middle carton is P1 LCP — release the SSR stand-in only once this panel
  // mounts (after the dynamic chunk). Displays bodies stay P3 behind dynamic().
  const unboxPrimaryPaint = useUnboxPrimaryPaintOptional();
  useEffect(() => {
    if (variant !== 'unbox') return;
    unboxPrimaryPaint?.onPrimaryPainted();
  }, [variant, unboxPrimaryPaint]);
  // Record this open into the operator's recents (server-backed, per-staff) so
  // the Recent tab can list recently-opened lines. Fire-and-forget — a failure
  // never blocks the workspace. Upsert keys on (staff, line), so re-opening just
  // bumps viewed_at.
  //
  // `recordView` false = the operator clicked a row on the browse FEED. That is
  // navigation, not work: if every click on a 117-row queue stamped a view,
  // Recent would converge on a copy of the feed and stop answering the only
  // question it exists for — which cartons did I actually open.
  useEffect(() => {
    if (!(row.id > 0) || !recordView) return;
    void fetch('/api/receiving-lines/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receiving_line_id: row.id, receiving_id: row.receiving_id ?? null }),
    }).catch(() => {});
  }, [row.id, row.receiving_id, recordView]);

  return (
    // Plain wrapper — NO per-line key/crossfade. Switching between sibling lines
    // of the same carton must be an in-place update, not a remount: the outer
    // ReceivingRightPane crossfade is keyed on the CARTON (receiving_id), and the
    // controller re-seeds its per-line state on `row.id` change via effects. A
    // `key={row.id}` + enter animation here re-mounted the whole workspace on
    // every line click (the "re-rendering the whole page" jank). Carton→carton
    // transitions still crossfade via the outer AnimatePresence.
    <div
      className="flex h-full w-full flex-col bg-surface-canvas"
      data-testid="receiving-workspace"
      // E2E hook: distinguishes a matched-PO carton ('zoho_po') from an unfound
      // intake carton ('unmatched'), so the scan-resolution spec can assert a
      // scanned PO# opens the PO workspace and never the Unfound flow.
      data-receiving-source={String(row.receiving_source ?? '')}
    >
      {/* overflow-hidden clips scroll children; station chrome hover menus
          sit in a z-10 sibling above the workbench so they paint over it. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {variant === 'triage' ? (
          <TriagePanel
            key="triage"
            row={row}
            staffId={staffId}
            onClose={onClose}
          />
        ) : (
          <LineEditPanel
            key="unbox"
            row={row}
            staffId={staffId}
            itemTotal={nav?.total}
            accordionBootstrap={accordionBootstrap}
            // Carton cursor only. `onClose` is deliberately NOT threaded here:
            // Unbox's carton dismiss is the identity bar's leading `◁`, which
            // dispatches `receiving-workspace-close` — the same close this
            // prop's handler runs. Passing it as well is what put a second,
            // panel-shaped carton-close in the pane's top-right corner
            // (2026-08-02). Triage still takes `onClose` below.
          />
        )}
      </div>
    </div>
  );
}
