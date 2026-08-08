'use client';

/**
 * Review · Packing detail — Unbox-family Station Workbench:
 *   StationScanPaneHost + StationPanelRoot
 *   Centre = Note (flag requires a note — always on the work floor)
 *   Displays = Photos · Tracking · Timeline
 *   StationTerminalDock → Approve · Flag menu
 *
 * Mid-canvas SectionTabsSlider deleted (scan-station Displays SoT Phase F).
 */

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { motion, useReducedMotion, type Variants } from '@/design-system/motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import {
  staggerRevealContainer,
  staggerRevealRiseItem,
  STAGGER_REVEAL_STEP,
} from '@/design-system/primitives/StaggerReveal';
import {
  AlertTriangle,
  Camera,
  Check,
  History,
  Loader2,
  Truck,
} from '@/components/Icons';
import { PaneHeaderCloseButton } from '@/components/ui/pane-header';
import {
  buildSectionTabs,
  StationPanelRoot,
  StationScanPaneHost,
  StationWorkbench,
  WorkspaceTimelineTab,
} from '@/components/station/workbench';
import {
  StationContextBar,
  StationMoreDetails,
} from '@/components/station/entity-context';
import { StationTerminalDock } from '@/components/station/terminal';
import { StationDisplaysPushStack, STATION_DISPLAY_INDEX } from '@/components/station/displays';
import { StationDisplaysEdgeToggle } from '@/components/station/displays';
import { buildReviewDisplayIndexRows } from '@/features/review/packer/review-display-index';
import type { TerminalActionVm } from '@/lib/station-terminal';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { formatDateTimePST } from '@/utils/date';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { useScopedPackerPhotos } from '@/hooks/useScopedPackerPhotos';
import { OutcomeChip } from '@/features/review/OutcomeChip';
import { ReviewOrderIdentity } from '@/features/review/packer/ReviewOrderIdentity';
import type { PackReviewQueueRow } from '@/lib/packing/pack-review-queue-types';
import { PackProfileEditor } from '@/components/packing/PackProfileEditor';
import { Button } from '@/design-system/primitives';
import { Pencil } from '@/components/Icons';
import type { PackTier } from '@/lib/packing/pack-tier-classifier';
import { DEFAULT_TIER_MINUTES } from '@/lib/packing/pack-tier-classifier';

type ReviewDisplayTab = 'photos' | 'tracking' | 'timeline';

/** Displays nav: closed is `null`; open is the Root Index or a content leaf. */
type ReviewDisplayNav = typeof STATION_DISPLAY_INDEX | ReviewDisplayTab;

async function submitDecision(args: {
  packerLogId: number;
  outcome: 'REVIEW_APPROVED' | 'REVIEW_FLAGGED';
  note?: string | null;
}): Promise<{ ok: boolean; status: number }> {
  const res = await fetch('/api/packing/verification/decide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...args, clientEventId: safeRandomUUID() }),
  });
  return { ok: res.ok, status: res.status };
}

export function PackerReviewMode({
  row,
  onClose,
}: {
  row: PackReviewQueueRow;
  /** Optional close (table overlay). Falls back to clearing selection params. */
  onClose?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [activeSideTab, setActiveSideTab] = useState<ReviewDisplayNav | null>(null);
  const [packEditorOpen, setPackEditorOpen] = useState(false);

  const packTierLabel = useMemo(() => {
    const t = (row.packTier || '').toUpperCase();
    if (t === 'SMALL') return 'Small';
    if (t === 'MEDIUM') return 'Medium';
    if (t === 'LARGE') return 'Large';
    return null;
  }, [row.packTier]);

  const packTierForEditor = useMemo((): PackTier | null => {
    const t = (row.packTier || '').toUpperCase();
    if (t === 'SMALL' || t === 'MEDIUM' || t === 'LARGE') return t;
    return null;
  }, [row.packTier]);

  const reduceMotion = useReducedMotion();
  const cardPresence = useMotionPresence(framerPresence.stationCard);
  const cardTransition = useMotionTransition(framerTransition.stationCardMount);
  const revealContainer = staggerRevealContainer(reduceMotion ? 0 : STAGGER_REVEAL_STEP);
  const revealItem: Variants = reduceMotion
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.001 } } }
    : staggerRevealRiseItem;

  const tracking = (row.tracking || row.detectedTracking || '').trim();
  const orderId = (row.orderId || '').trim();
  const { query: photosQuery } = useScopedPackerPhotos(row.packerLogId);
  const photos = photosQuery.data?.photos ?? [];

  const verifyQuery = useQuery({
    queryKey: ['orders-verify', tracking],
    enabled: tracking.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch(`/api/orders/verify?tracking=${encodeURIComponent(tracking)}`, {
        cache: 'no-store',
      });
      if (!res.ok) return null;
      return (await res.json().catch(() => null)) as { found?: boolean; orderId?: string } | null;
    },
  });

  const clearSelection = () => {
    if (onClose) {
      onClose();
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete('packerLogId');
    params.delete('orderId');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  const decide = useMutation({
    mutationFn: (outcome: 'REVIEW_APPROVED' | 'REVIEW_FLAGGED') =>
      submitDecision({ packerLogId: row.packerLogId, outcome, note: note.trim() || null }),
    onSuccess: (res, outcome) => {
      if (!res.ok) {
        toast.error(
          res.status === 409
            ? 'Already decided elsewhere — refreshing.'
            : 'Could not save the decision.',
        );
      } else {
        toast.success(outcome === 'REVIEW_APPROVED' ? 'Approved' : 'Flagged for follow-up');
      }
      queryClient.invalidateQueries({ queryKey: ['pack-review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['pack-review-row'] });
      clearSelection();
    },
    onError: () => toast.error('Could not save the decision.'),
  });

  const hasTimelineTab = tracking.length > 0 || orderId.length > 0;
  const busy = decide.isPending;
  const flagDisabled = busy || note.trim().length === 0;

  /** `←|` Open displays → the Root Index, not a guessed leaf. */
  const openDisplaysIndex = useCallback(() => setActiveSideTab(STATION_DISPLAY_INDEX), []);
  const closeDisplays = useCallback(() => setActiveSideTab(null), []);

  const displayTabs = useMemo(
    () =>
      buildSectionTabs([
        {
          id: 'photos',
          label: 'Photos',
          icon: Camera,
          count: photos.length > 0 ? photos.length : undefined,
          content: (
            <div className="space-y-3">
              {photosQuery.isLoading ? (
                <div className="flex items-center gap-2 text-role-caption text-text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : photos.length === 0 ? (
                <p className="text-role-caption text-text-faint">
                  Guided slip → box capture on `/m/pack` lands here for review.
                </p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {photos.map((p) => {
                    const kind =
                      p.photoType === 'pack_slip'
                        ? 'Slip'
                        : p.photoType === 'pack_box'
                          ? 'Box'
                          : null;
                    return (
                      <div key={p.id} className="relative shrink-0">
                        <img
                          src={p.photoUrl}
                          alt={kind ? `Pack ${kind.toLowerCase()}` : 'Pack photo'}
                          className="h-28 w-28 rounded-none border border-border-hairline object-cover"
                          loading="lazy"
                        />
                        {kind ? (
                          <span className="absolute bottom-1 left-1 rounded-none bg-scrim/70 px-1 py-0.5 text-role-micro uppercase tracking-widest text-white">
                            {kind}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ),
        },
        {
          id: 'tracking',
          label: 'Tracking',
          icon: Truck,
          content: (
            <div className="space-y-2 border border-border-soft bg-surface-card px-3 py-2.5">
              {row.productTitle ? (
                <p className="truncate text-role-caption text-text-muted">{row.productTitle}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-mono text-role-caption font-semibold text-text-default">
                  {tracking || 'No tracking captured'}
                </span>
                <VerifyBadge
                  loading={verifyQuery.isFetching}
                  found={verifyQuery.data?.found ?? null}
                  hasTracking={tracking.length > 0}
                />
              </div>
              <p className="text-role-micro text-text-faint">
                Captured {formatDateTimePST(row.createdAt)}
              </p>
            </div>
          ),
        },
        {
          id: 'timeline',
          label: 'Timeline',
          icon: History,
          visible: hasTimelineTab,
          content: (
            <WorkspaceTimelineTab
              orderId={orderId || null}
              tracking={tracking || null}
              serials={[]}
            />
          ),
        },
      ]),
    [
      photos,
      photosQuery.isLoading,
      tracking,
      row.productTitle,
      row.createdAt,
      hasTimelineTab,
      orderId,
      verifyQuery.isFetching,
      verifyQuery.data?.found,
    ],
  );

  const displayIndexRows = useMemo(
    () =>
      buildReviewDisplayIndexRows({
        photoCount: photos.length,
        trackingPresent: tracking.length > 0,
        hasTimeline: hasTimelineTab,
      }),
    [photos.length, tracking, hasTimelineTab],
  );

  const resolvedSideTab: ReviewDisplayNav | null = useMemo(() => {
    if (!activeSideTab) return null;
    if (activeSideTab === STATION_DISPLAY_INDEX) return STATION_DISPLAY_INDEX;
    if (displayTabs.some((t) => t.id === activeSideTab)) return activeSideTab;
    // Gated-away leaf → the index, never a silent swap to an unrelated display.
    return STATION_DISPLAY_INDEX;
  }, [activeSideTab, displayTabs]);

  const terminalVm: TerminalActionVm = {
    label: 'Approve',
    icon: <Check className="h-4 w-4" />,
    tone: 'emerald',
    onClick: () => decide.mutate('REVIEW_APPROVED'),
    disabled: busy,
    loading: busy && decide.variables === 'REVIEW_APPROVED',
    docked: true,
    fullWidth: true,
    maxWidth: 'max-w-[720px]',
    menuLabel: 'More review actions',
    menuTitle: 'Flag or other actions',
    menu: [
      {
        label: 'Flag for follow-up',
        icon: <AlertTriangle className="h-4 w-4" />,
        disabled: flagDisabled,
        title: note.trim().length === 0 ? 'Add a note in the centre first' : undefined,
        onClick: () => {
          if (flagDisabled) {
            toast.message('Add a note before flagging.');
            return;
          }
          decide.mutate('REVIEW_FLAGGED');
        },
      },
    ],
  };

  const utilityRailBody = (
    <div className="flex flex-col items-center gap-0 pt-0">
      {!activeSideTab ? (
        <StationDisplaysEdgeToggle variant="pane-open" onClick={openDisplaysIndex} />
      ) : null}
    </div>
  );

  return (
    <motion.div
      key={row.packerLogId}
      initial={cardPresence.initial}
      animate={cardPresence.animate}
      exit={cardPresence.exit}
      transition={cardTransition}
      className="relative flex h-full w-full min-h-0 flex-col"
    >
      <StationScanPaneHost
        displaysOpen={Boolean(resolvedSideTab)}
        hostDataAttrs={{ 'data-pack-review-pane-host': true }}
        centerTestId="pack-review-station-center"
        utilityRail={!activeSideTab ? utilityRailBody : null}
        center={
          <StationPanelRoot>
            <StationContextBar
              placement="flow"
              identity={
                <motion.div initial="hidden" animate="show" variants={revealContainer}>
                  <motion.div variants={revealItem}>
                    <ReviewOrderIdentity row={row} />
                  </motion.div>
                </motion.div>
              }
              moreDetails={
                <StationMoreDetails>
                  {packTierLabel ? (
                    <span className="inline-flex items-center gap-1 rounded-none bg-surface-sunken px-1.5 py-0.5 text-role-micro uppercase tracking-widest text-text-muted ring-1 ring-inset ring-border-soft">
                      Pack {packTierLabel}
                      {row.estimatedPackMinutes != null
                        ? ` · ${row.estimatedPackMinutes}m`
                        : packTierForEditor
                          ? ` · ${DEFAULT_TIER_MINUTES[packTierForEditor]}m`
                          : ''}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-none bg-surface-sunken px-1.5 py-0.5 text-role-micro uppercase tracking-widest text-text-faint ring-1 ring-inset ring-border-soft">
                      Pack size unknown
                    </span>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Pencil className="h-3.5 w-3.5" />}
                    onClick={() => setPackEditorOpen(true)}
                  >
                    {row.skuCatalogId != null ? 'Edit pack size' : 'Link catalog'}
                  </Button>
                  <OutcomeChip outcome={row.outcome} />
                  <PaneHeaderCloseButton
                    onClick={clearSelection}
                    ariaLabel="Return to review table"
                    title="Return to review table"
                  />
                </StationMoreDetails>
              }
            />

            <StationWorkbench
              ambientWash={false}
              className="relative z-0 flex-1 bg-transparent"
              reserveScrollClearance={false}
              reserveIdentityClearance={false}
              bodyGap="none"
              dock={<StationTerminalDock vm={terminalVm} />}
            >
              <motion.div initial="hidden" animate="show" variants={revealContainer}>
                <motion.div variants={revealItem}>
                  <div className="border-b border-border-hairline bg-surface-card px-3 py-2">
                    <p className="text-role-eyebrow uppercase tracking-widest text-text-faint">
                      Review note
                    </p>
                    <p className="mt-0.5 text-role-caption text-text-muted">
                      Required when flagging — always on the centre floor.
                    </p>
                  </div>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={6}
                    placeholder="What's wrong / what to fix (required when flagging)…"
                    className={cn(
                      'w-full resize-none rounded-none border-0 bg-surface-card px-3 py-3 text-role-caption text-text-default placeholder:text-text-faint',
                      focusRing('field', 'accent'),
                    )}
                  />
                </motion.div>
              </motion.div>
            </StationWorkbench>
          </StationPanelRoot>
        }
        displays={
          resolvedSideTab ? (
            <StationDisplaysPushStack
              ariaLabel="Pack review displays"
              storageKey="pack-review-displays-push-width"
              testId="pack-review-displays-push"
              resizeTestId="pack-review-displays-push-resize"
              tabs={displayTabs}
              indexRows={displayIndexRows}
              activeTab={resolvedSideTab}
              onTabChange={(id) => setActiveSideTab(id as ReviewDisplayNav)}
              onClose={closeDisplays}
            />
          ) : null
        }
      />

      <PackProfileEditor
        open={packEditorOpen}
        onOpenChange={setPackEditorOpen}
        skuCatalogId={row.skuCatalogId}
        label={[row.itemNumber, row.productTitle].filter(Boolean).join(' · ') || row.orderId}
        initialTier={packTierForEditor}
        initialMinutes={row.estimatedPackMinutes}
      />
    </motion.div>
  );
}

function VerifyBadge({
  loading,
  found,
  hasTracking,
}: {
  loading: boolean;
  found: boolean | null;
  hasTracking: boolean;
}) {
  if (!hasTracking) return null;
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 text-role-micro text-text-faint">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking…
      </span>
    );
  }
  if (found === true) {
    return (
      <span className="rounded-none bg-emerald-50 px-1.5 py-0.5 text-role-micro font-semibold uppercase tracking-widest text-emerald-700 ring-1 ring-inset ring-emerald-200">
        Matched
      </span>
    );
  }
  if (found === false) {
    return (
      <span className="rounded-none bg-amber-50 px-1.5 py-0.5 text-role-micro font-semibold uppercase tracking-widest text-amber-700 ring-1 ring-inset ring-amber-200">
        No order
      </span>
    );
  }
  return null;
}
