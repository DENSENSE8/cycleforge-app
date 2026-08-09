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
 * For non-email_po kinds the panel renders only Overview (no index shell).
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
import { ExternalLink } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { formatDateTimePST } from '@/utils/date';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { DeskRailChromeRow } from '@/components/right-rail/DeskRailChromeRow';
import {
  DESK_INSPECTOR_INDEX,
  DeskInspectorIndexShell,
  type DeskInspectorLeaf,
} from '@/components/right-rail/DeskInspectorIndexShell';
import { InspectorActionFloor } from '@/components/right-rail/InspectorActionFloor';
import { InspectorFlushDelete } from '@/components/right-rail/InspectorFlushDelete';
import {
  PaneHeaderIconBadge,
  PaneHeaderLabel,
} from '@/components/ui/pane-header';
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
    <OverviewTab
      row={row}
      subjectPrefix={c.subjectPrefix}
      poNumbers={c.poNumbers}
      pushing={c.pushing}
      onPushToZendesk={c.handlePushToZendesk}
      detail={detail}
    />
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
        <div className="shrink-0 border-b border-border-hairline bg-surface-card/90 backdrop-blur-xl">
          <DeskRailChromeRow onClose={onClose} closeTitle="Close details" />
          <div className="flex items-center gap-2 px-2 pb-2 pt-1">
            <PaneHeaderIconBadge Icon={Icon} bg={meta.bg} tint="text-white" />
            <PaneHeaderLabel
              eyebrow={
                <>
                  {meta.label.toUpperCase()}{' '}
                  <span className="text-text-soft">
                    · {formatDateTimePST(row.created_at)}
                  </span>
                </>
              }
              value={c.identityLabel}
              valueTitle={c.identityLabel}
            />
          </div>
        </div>

        {isEmailPo ? (
          <DeskInspectorIndexShell
            leaves={leaves}
            activeId={navId}
            onActiveIdChange={onNavChange}
            defaultActiveId="overview"
            ariaLabel="Unfound topics"
            testId="unfound-inspector-index"
            backLabel="Back to topics"
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{overviewBody}</div>
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
          leading={
            <div className="flex items-stretch divide-x divide-border-hairline">
              {c.externalUrl && c.externalLabel ? (
                <a
                  href={c.externalUrl}
                  target={row.kind === 'email_po' ? '_blank' : undefined}
                  rel={row.kind === 'email_po' ? 'noreferrer' : undefined}
                  className="inline-flex h-10 items-center gap-1.5 px-2.5 text-role-micro uppercase tracking-wider text-text-muted hover:bg-surface-hover"
                >
                  <ExternalLink className="h-3 w-3" />
                  {c.externalLabel}
                </a>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void c.handleCopyAll()}
                className="h-10 rounded-none px-2.5 text-role-micro uppercase tracking-wider text-text-muted"
              >
                Copy details
              </Button>
            </div>
          }
          delete={
            c.canHardDelete ? (
              <InspectorFlushDelete
                isArmed={c.confirmingDelete}
                isDeleting={c.deleting}
                onClick={() => void c.handleDelete()}
                label="Delete row"
                confirmLabel="Click again to confirm delete"
                data-testid="unfound-details-delete"
              />
            ) : undefined
          }
        />
      </div>
    </DetailStackRailRegistrar>
  );
}
