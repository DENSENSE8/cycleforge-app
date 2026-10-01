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
  /** True when a station scan, rather than browse navigation, opened the carton. */
  scanDriven?: boolean;
  /** Nav state mirrored from the sidebar via `receiving-workspace-nav-state`. */
  nav: NavState | null;
  /** Which workspace mode — `triage` hides unbox-only sections (photos, claim,
   *  label, print·receive, serial scan). Defaults to the full `unbox` editor. */
  variant?: ReceivingWorkspaceVariant;
  /** Whether this open stamps the operator's recents (`receiving_line_views` → the Recent tab). */
  recordView: boolean;
  onClose: () => void;
}

/** Right-pane focused work-item view for a single receiving line. */
export function ReceivingLineWorkspace({
  row,
  staffId,
  accordionBootstrap,
  scanDriven = false,
  nav,
  variant = 'unbox',
  recordView,
  onClose,
}: Props) {
  useSurfacePaintMark('unbox:workspace', variant === 'unbox');
  // Middle carton is P1 LCP. Release the SSR stand-in when this dynamic panel
  // mounts; secondary data can settle behind the already-painted work plane.
  const unboxPrimaryPaint = useUnboxPrimaryPaintOptional();
  useEffect(() => {
    if (variant !== 'unbox') return;
    unboxPrimaryPaint?.onPrimaryPainted();
  }, [variant, unboxPrimaryPaint]);
  // Record this open into the operator's recents (server-backed, per-staff) so the Recent tab can list recently-opened lines.
  useEffect(() => {
    if (!(row.id > 0) || !recordView) return;
    void fetch('/api/receiving-lines/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receiving_line_id: row.id, receiving_id: row.receiving_id ?? null }),
    }).catch(() => {});
  }, [row.id, row.receiving_id, recordView]);

  return (
    // Plain wrapper — NO per-line key/crossfade.
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
            scanDriven={scanDriven}
            // Carton cursor only.
          />
        )}
      </div>
    </div>
  );
}
