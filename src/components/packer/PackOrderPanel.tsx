'use client';

/**
 * Live pack workspace overlay — SoT chrome (ReceivingStationMoreDetails +
 * ReceivingStationContextBar + CartonContextCard) + StationWorkbench tabs.
 * Sibling to LineEditPanel / TriagePanel; binds PackActiveOrderPane, not
 * ReceivingLineRow.
 */

import { useMemo, useState } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
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
  Camera,
  ClipboardList,
  History,
  Layers,
  MessageSquare,
  Ticket,
} from '@/components/Icons';
import { PaneHeaderCloseButton } from '@/components/ui/pane-header';
import { SectionTabsSlider } from '@/design-system/components';
import {
  buildSectionTabs,
  StationWorkbench,
  WorkspaceTimelineTab,
} from '@/components/station/workbench';
import { OrderPackChecklist } from '@/components/packing/OrderPackChecklist';
import { SupportContextHub } from '@/components/support/context';
import { useOrderPackChecklist } from '@/hooks/useOrderPackChecklist';
import { usePackingPolicy } from '@/hooks/usePackingPolicy';
import type { PackActiveOrderPane } from '@/components/packer/usePackerOrderPane';
import { PackOrderIdentity } from '@/components/packer/PackOrderIdentity';
import { UnitPackPhotoPeek } from '@/components/packer/UnitPackPhotoPeek';
import { ReceivingStationContextBar } from '@/components/receiving/workspace/ReceivingStationContextBar';
import { ReceivingStationMoreDetails } from '@/components/receiving/workspace/ReceivingStationMoreDetails';

type PackView = 'checklist' | 'photos' | 'timeline' | 'ticket' | 'support' | 'rollup';

interface PackOrderPanelProps {
  activeOrder: PackActiveOrderPane;
  onClose: () => void;
}

export function PackOrderPanel({ activeOrder, onClose }: PackOrderPanelProps) {
  const reduceMotion = useReducedMotion();
  const cardPresence = useMotionPresence(framerPresence.stationCard);
  const cardTransition = useMotionTransition(framerTransition.stationCardMount);
  const revealContainer = staggerRevealContainer(reduceMotion ? 0 : STAGGER_REVEAL_STEP);
  const revealItem: Variants = reduceMotion
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.001 } } }
    : staggerRevealRiseItem;

  const { data: packingPolicy } = usePackingPolicy();
  const { data: checklist, isLoading } = useOrderPackChecklist({
    orderRowId: activeOrder.orderRowId,
    sku: activeOrder.sku,
    condition: activeOrder.condition,
    productTitle: activeOrder.productTitle,
    enabled: activeOrder.scanType !== 'UNIT',
  });

  const hasUnitPhotos = Number(activeOrder.serialUnitId) > 0;
  const [packView, setPackView] = useState<PackView>(
    activeOrder.scanType === 'UNIT' ? 'photos' : 'checklist',
  );
  const resetKey = activeOrder.serialUnitId
    ? `unit-${activeOrder.serialUnitId}`
    : activeOrder.orderRowId
      ? `row-${activeOrder.orderRowId}`
      : `${activeOrder.sku || activeOrder.tracking}`;

  const hasRollup =
    Boolean(checklist) &&
    (checklist?.orderRowIds.length ?? 0) > 0 &&
    (checklist?.progress.total ?? 0) > 1;

  const timelineSerials = useMemo(() => {
    const fromLines = (checklist?.lines ?? []).flatMap((l) => l.serials ?? []);
    const unitKey = activeOrder.unitKey?.trim();
    const base = [...new Set(fromLines.map((s) => s.trim()).filter(Boolean))];
    if (unitKey && !base.includes(unitKey)) base.push(unitKey);
    return base;
  }, [checklist?.lines, activeOrder.unitKey]);

  const tracking = String(activeOrder.tracking ?? '').trim();
  const orderId = String(activeOrder.orderId ?? '').trim();
  const hasTimelineTab =
    tracking.length > 0 || orderId.length > 0 || timelineSerials.length > 0;

  const tabs = useMemo(
    () =>
      buildSectionTabs([
        {
          id: 'checklist',
          label: 'Checklist',
          icon: ClipboardList,
          visible: activeOrder.scanType !== 'UNIT',
          content: (
            <OrderPackChecklist
              lines={checklist?.lines ?? []}
              enforcement={packingPolicy?.enforcement ?? checklist?.enforcement ?? 'advisory'}
              resetKey={resetKey}
              isLoading={isLoading}
              variant="panel"
            />
          ),
        },
        {
          id: 'photos',
          label: 'Photos',
          icon: Camera,
          visible: hasUnitPhotos,
          content: (
            <div className="space-y-3">
              <p className="text-role-caption font-semibold text-text-muted">
                Packing photos for this prepacked unit — linked to the unit label and
                visible on the timeline.
              </p>
              <UnitPackPhotoPeek
                serialUnitId={Number(activeOrder.serialUnitId)}
                preferSource="packing"
              />
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
              serials={timelineSerials}
            />
          ),
        },
        {
          id: 'support',
          label: 'Support',
          icon: MessageSquare,
          content: (
            <div className="space-y-3">
              <SupportContextHub
                anchor={{
                  order: activeOrder.orderId || undefined,
                  tracking: activeOrder.tracking || undefined,
                }}
                variant="station"
                defaultSegment="team"
                hideCustomerSegment
                hideLinkage
              />
            </div>
          ),
        },
        {
          id: 'ticket',
          label: 'Ticket',
          icon: Ticket,
          content: (
            <div className="space-y-3">
              <SupportContextHub
                anchor={{
                  order: activeOrder.orderId || undefined,
                  tracking: activeOrder.tracking || undefined,
                }}
                variant="station"
                onlySegment="customer"
                hideLinkage
              />
            </div>
          ),
        },
        {
          id: 'rollup',
          label: 'Order rollup',
          icon: Layers,
          visible: hasRollup,
          content: (
            <div className="rounded-2xl border border-border-soft bg-surface-card p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-role-eyebrow uppercase tracking-widest text-text-faint">
                  Order rollup
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 text-role-eyebrow uppercase tracking-widest ring-1 ring-inset tabular-nums ${
                    (checklist?.progress.packedLines ?? 0) >= (checklist?.progress.total ?? 0)
                      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                      : 'bg-amber-50 text-amber-700 ring-amber-200'
                  }`}
                >
                  {checklist?.progress.packedLines ?? 0}/{checklist?.progress.total ?? 0} lines packed
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold text-text-muted">
                Multi-line order — verify each line is packed before sealing.
              </p>
            </div>
          ),
        },
      ]),
    [
      activeOrder.orderId,
      activeOrder.tracking,
      activeOrder.scanType,
      activeOrder.serialUnitId,
      checklist,
      hasRollup,
      hasTimelineTab,
      hasUnitPhotos,
      isLoading,
      orderId,
      packingPolicy?.enforcement,
      resetKey,
      timelineSerials,
      tracking,
    ],
  );

  const activePackView: PackView = tabs.some((t) => t.id === packView)
    ? packView
    : (tabs[0]?.id as PackView) || 'checklist';

  return (
    <motion.div
      key={resetKey}
      initial={cardPresence.initial}
      animate={cardPresence.animate}
      exit={cardPresence.exit}
      transition={cardTransition}
      className="relative flex h-full w-full flex-col bg-surface-canvas"
    >
      <ReceivingStationContextBar
        identity={
          <motion.div initial="hidden" animate="show" variants={revealContainer}>
            <motion.div variants={revealItem}>
              <PackOrderIdentity activeOrder={activeOrder} />
            </motion.div>
          </motion.div>
        }
        moreDetails={
          <ReceivingStationMoreDetails>
            <PaneHeaderCloseButton
              onClick={onClose}
              ariaLabel="Return to pack queue"
              title="Return to pack queue"
            />
          </ReceivingStationMoreDetails>
        }
      />

      <StationWorkbench
        className="min-h-0 flex-1"
        reserveScrollClearance={false}
        scrollClassName="pb-8"
        tabs={
          <motion.div initial="hidden" animate="show" variants={revealContainer}>
            <motion.div variants={revealItem}>
              <SectionTabsSlider
                tabs={tabs}
                value={activePackView}
                onChange={(id) => setPackView(id as PackView)}
                ariaLabel="Packing displays"
              />
            </motion.div>
          </motion.div>
        }
      />
    </motion.div>
  );
}
