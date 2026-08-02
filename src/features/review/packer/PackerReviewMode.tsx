'use client';

/**
 * Review · Packing detail — Unbox-family Station Workbench (PackOrderPanel /
 * LineEditPanel anatomy):
 *   StationContextBar + CartonContextCard (bar) + StationMoreDetails
 *   → StationWorkbench → SectionTabsSlider
 *   → StationTerminalDock → SlicedActionDock (Approve · Flag menu)
 *
 * Receiving-only LineEditModals (claim / audit / photo-note) stay on Unbox —
 * Review has no ReceivingLineRow. Overlays still compose *around* the
 * workbench the same way LineEditModals does for Unbox.
 */

import { useMemo, useState } from 'react';
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
  FileText,
  History,
  Loader2,
  Truck,
} from '@/components/Icons';
import { PaneHeaderCloseButton } from '@/components/ui/pane-header';
import { SectionTabsSlider, WorkspaceCard, WORKSPACE_NESTED_FIELD, WORKSPACE_NESTED_FIELD_PAD } from '@/design-system/components';
import {
  buildSectionTabs,
  StationWorkbench,
  WorkspaceTimelineTab,
} from '@/components/station/workbench';
import {
  StationContextBar,
  StationMoreDetails,
} from '@/components/station/entity-context';
import { StationTerminalDock } from '@/components/station/terminal';
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

type ReviewView = 'photos' | 'tracking' | 'note' | 'timeline';

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
  const [reviewView, setReviewView] = useState<ReviewView>('photos');

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

  const tabs = useMemo(
    () =>
      buildSectionTabs([
        {
          id: 'photos',
          label: 'Photos',
          icon: Camera,
          count: photos.length > 0 ? photos.length : undefined,
          content: (
            <WorkspaceCard variant="glass" bodyDensity="nested">
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
                          className="h-28 w-28 rounded-xl border border-border-hairline object-cover"
                          loading="lazy"
                        />
                        {kind ? (
                          <span className="absolute bottom-1 left-1 rounded bg-scrim/70 px-1 py-0.5 text-role-micro uppercase tracking-widest text-white">
                            {kind}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </WorkspaceCard>
          ),
        },
        {
          id: 'tracking',
          label: 'Tracking',
          icon: Truck,
          content: (
            <WorkspaceCard variant="glass" bodyDensity="nested">
              {row.productTitle ? (
                <p className="mb-2 truncate text-role-caption text-text-muted">{row.productTitle}</p>
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
              <p className="mt-3 text-role-micro text-text-faint">
                Captured {formatDateTimePST(row.createdAt)}
              </p>
            </WorkspaceCard>
          ),
        },
        {
          id: 'note',
          label: 'Note',
          icon: FileText,
          content: (
            <WorkspaceCard variant="glass" bodyDensity="nested">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder="What's wrong / what to fix (required when flagging)…"
                className={cn(
                  WORKSPACE_NESTED_FIELD,
                  WORKSPACE_NESTED_FIELD_PAD,
                  'w-full resize-none text-role-caption text-text-default placeholder:text-text-faint',
                  focusRing('field', 'accent'),
                )}
              />
            </WorkspaceCard>
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
      note,
      hasTimelineTab,
      orderId,
      verifyQuery.isFetching,
      verifyQuery.data?.found,
    ],
  );

  const activeView: ReviewView = tabs.some((t) => t.id === reviewView)
    ? reviewView
    : ((tabs[0]?.id as ReviewView) || 'photos');

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
        title: note.trim().length === 0 ? 'Add a note on the Note tab first' : undefined,
        onClick: () => {
          if (flagDisabled) {
            setReviewView('note');
            toast.message('Add a note before flagging.');
            return;
          }
          decide.mutate('REVIEW_FLAGGED');
        },
      },
    ],
  };

  return (
    <motion.div
      key={row.packerLogId}
      initial={cardPresence.initial}
      animate={cardPresence.animate}
      exit={cardPresence.exit}
      transition={cardTransition}
      className="relative flex h-full w-full flex-col bg-surface-canvas"
    >
      <StationContextBar
        identity={
          <motion.div initial="hidden" animate="show" variants={revealContainer}>
            <motion.div variants={revealItem}>
              <ReviewOrderIdentity row={row} />
            </motion.div>
          </motion.div>
        }
        moreDetails={
          <StationMoreDetails>
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
        className="min-h-0 flex-1"
        reserveScrollClearance={false}
        tabs={
          <motion.div initial="hidden" animate="show" variants={revealContainer}>
            <motion.div variants={revealItem}>
              <SectionTabsSlider
                tabs={tabs}
                value={activeView}
                onChange={(id) => setReviewView(id as ReviewView)}
                ariaLabel="Review displays"
              />
            </motion.div>
          </motion.div>
        }
        dock={<StationTerminalDock vm={terminalVm} />}
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
      <span className="inline-flex items-center gap-1 rounded bg-surface-sunken px-1.5 py-0.5 text-role-micro uppercase tracking-widest text-text-muted ring-1 ring-inset ring-border-soft">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking
      </span>
    );
  }
  return found ? (
    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-role-micro uppercase tracking-widest text-emerald-700 ring-1 ring-inset ring-emerald-200">
      <Check className="h-3 w-3" /> Order matched
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-role-micro uppercase tracking-widest text-amber-700 ring-1 ring-inset ring-amber-200">
      <AlertTriangle className="h-3 w-3" /> Not matched
    </span>
  );
}
