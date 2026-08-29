'use client';

/**
 * Right-side slide-in details panel for an unfound-queue row.
 *
 * Topics (email_po only) via {@link DeskInspectorIndexShell}:
 *   • Overview — identity, Zendesk handoff, team notes, timing
 *   • Extract  — LLM-extracted fields editor + Zoho compare + Zoho PO# I
 *                uploaded + free-form notes
 *   • Email    — full Gmail body
 *
 * For non-email_po kinds there is only Overview, so the same shell mounts in
 * the `standalone` stance: one band, one title, no Back to an index that
 * does not exist.
 *
 * Serial numbers were intentionally cut from this surface — they belong
 * on the receiving workspace where the operator scans them during the
 * unbox step. Surfacing them here implied they were editable from the
 * queue, which they aren't.
 *
 * Delete behavior unchanged from prior version (two-step confirm; hidden
 * for unmatched_receiving with a guidance hint).
 *
 * Thin composition shell: interactive logic lives in
 * {@link useUnfoundDetailsPanel}; the tab bodies + shared primitives are
 * presentational components under `./details-panel/`.
 */

import { useCallback, useEffect, useState } from 'react';
import { Copy, ExternalLink } from '@/components/Icons';
import { formatDateTimePST } from '@/utils/date';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import {
  DESK_INSPECTOR_INDEX,
  DeskInspectorIndexShell,
  type DeskInspectorLeaf,
} from '@/components/right-rail/DeskInspectorIndexShell';
import {
  FLOOR_DELETE_PEER_CLASS,
  FloorIconButton,
  InspectorActionFloor,
} from '@/components/right-rail/InspectorActionFloor';
import { InspectorFlushDelete } from '@/components/right-rail/InspectorFlushDelete';
import { PaneHeaderIconBadge } from '@/components/ui/pane-header';
import { useUnfoundDetailsPanel } from './details-panel/useUnfoundDetailsPanel';
import type { DetailsTab, UnfoundQueueDetailsPanelProps } from './details-panel/unfound-details-helpers';
import { OverviewTab } from './details-panel/OverviewTab';
import { ExtractTab } from './details-panel/ExtractTab';
import { EmailTab } from './details-panel/EmailTab';
import { LoadingBlock, ErrorBlock } from './details-panel/details-primitives';

// `UnfoundQueueDetailsRow` moved to ./unfound-triage-types so the hook and this
// panel can share it without importing each other (cycle). Re-exported here.
export type { UnfoundQueueDetailsRow } from './unfound-triage-types';

export function UnfoundQueueDetailsPanel(props: UnfoundQueueDetailsPanelProps) {
  const { row, onClose } = props;
  const c = useUnfoundDetailsPanel(props);
  const { meta, Icon, detailQuery, detail, isEmailPo } = c;

  /** Index | leaf — stub-opens on Overview; Back → topics. */
  const [navId, setNavId] = useState<string>('overview');
  useEffect(() => {
    setNavId('overview');
  }, [row.source_id, row.kind]);

  const onNavChange = useCallback(
    (id: string) => {
      setNavId(id);
      if (id !== DESK_INSPECTOR_INDEX) {
        c.setActiveTab(id as DetailsTab);
      }
    },
    [c.setActiveTab],
  );

  const overviewBody = (
    <>
      {/* Identity in the BODY, not a second header line (2026-08-21). This
          was a `PaneHeaderLabel` band above the shell — kind + arrival time as
          an eyebrow over the subject — which made a leaf read as two stacked
          headers and put the host's absolute `⤢ ✕` over a row that had no cell
          reserved for them. It opens Overview instead, where the rest of the
          row's facts already are. */}
      <div className="mb-5 flex items-start gap-2">
        <PaneHeaderIconBadge Icon={Icon} bg={meta.bg} tint="text-white" />
        <div className="min-w-0">
          <p
            className="truncate text-role-caption text-text-primary"
            title={c.identityLabel}
          >
            {c.identityLabel}
          </p>
          <p className="text-role-micro uppercase tracking-widest text-text-soft">
            {meta.label}{' '}
            <span className="text-text-faint">· {formatDateTimePST(row.created_at)}</span>
          </p>
        </div>
      </div>

      <OverviewTab
        row={row}
        subjectPrefix={c.subjectPrefix}
        poNumbers={c.poNumbers}
        pushing={c.pushing}
        onPushToZendesk={c.handlePushToZendesk}
        detail={detail}
      />
    </>
  );

  const leaves: DeskInspectorLeaf[] = !isEmailPo
    ? []
    : [
        {
          id: 'overview',
          label: 'Overview',
          content: (
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{overviewBody}</div>
          ),
        },
        {
          id: 'extract',
          label: 'Extract',
          content: (
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {detailQuery.isLoading && !detail ? (
                <LoadingBlock />
              ) : detailQuery.error ? (
                <ErrorBlock message={detailQuery.error.message} />
              ) : detail ? (
                <ExtractTab
                  detail={detail}
                  rowId={row.source_id}
                  patchTriage={c.patchTriage}
                  onRowUpdated={c.updateTriageRow}
                />
              ) : null}
            </div>
          ),
        },
        {
          id: 'email',
          label: 'Email',
          content: (
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {detailQuery.isLoading && !detail ? (
                <LoadingBlock />
              ) : detailQuery.error ? (
                <ErrorBlock message={detailQuery.error.message} />
              ) : detail ? (
                <EmailTab detail={detail} />
              ) : null}
            </div>
          ),
        },
      ];

  return (
    // STABLE occupant id, and deliberately NOT the `detail:claim:` namespace it
    // used to share with the Repair inspector — two unrelated surfaces on one id
    // prefix is a reopen/exclusivity bug waiting to happen. Non-modal so the
    // unfound queue underneath stays live; the caller re-keys this component per
    // row, so every editor re-seeds on the swap.
    <DetailStackRailRegistrar
      id="detail:unfound"
      onClose={onClose}
      modal={false}
      ariaLabel={`Unfound ${c.identityLabel} details`}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {/* ONE band, and it is the TOP row of the card — the host paints its
            `⤢ ✕` absolutely at `top-0 right-0`, so nothing may sit above the
            row that reserves that cell. */}
        {isEmailPo ? (
          <DeskInspectorIndexShell
            stance="index"
            title="Unfound"
            headerRightSlot={<InspectorColumnDisplayButton />}
            leaves={leaves}
            activeId={navId}
            onActiveIdChange={onNavChange}
            defaultActiveId="overview"
            ariaLabel="Unfound topics"
            testId="unfound-inspector-index"
            backLabel="Back to topics"
          />
        ) : (
          // Non-`email_po` kinds have exactly one body and no topics above it,
          // so they owe no Back and say so — rather than shipping a bare
          // scroll port with the host's window controls floating over it.
          <DeskInspectorIndexShell
            stance="standalone"
            title="Unfound"
            headerRightSlot={<InspectorColumnDisplayButton />}
            ariaLabel="Unfound row"
            testId="unfound-inspector-index"
            body={<div className="px-6 py-5">{overviewBody}</div>}
          />
        )}

        <InspectorActionFloor
          above={
            c.canHardDelete ? undefined : (
              <p className="px-3 py-3 text-center text-role-micro text-text-soft">
                Unmatched receiving rows can have attached lines. Use the{' '}
                <span className="font-semibold text-text-muted">Check</span> toggle
                to clear from the queue, or open the workspace to delete carefully.
              </p>
            )
          }
        >
          {c.externalUrl && c.externalLabel ? (
            <FloorIconButton
              icon={<ExternalLink />}
              label={c.externalLabel}
              href={c.externalUrl}
              hrefTarget={row.kind === 'email_po' ? '_blank' : undefined}
              hrefRel={row.kind === 'email_po' ? 'noreferrer' : undefined}
              data-testid="unfound-details-external"
            />
          ) : null}
          <FloorIconButton
            icon={<Copy />}
            label="Copy details"
            onClick={() => void c.handleCopyAll()}
            data-testid="unfound-details-copy"
          />
          {c.canHardDelete ? (
            <InspectorFlushDelete
              isArmed={c.confirmingDelete}
              isDeleting={c.deleting}
              onClick={() => void c.handleDelete()}
              label="Delete row"
              confirmLabel="Click again to confirm delete"
              data-testid="unfound-details-delete"
              className={FLOOR_DELETE_PEER_CLASS}
            />
          ) : null}
        </InspectorActionFloor>
      </div>
    </DetailStackRailRegistrar>
  );
}
