'use client';

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
  Barcode,
  Camera,
  ClipboardList,
  History,
  Layers,
  MapPin,
  MessageSquare,
  Package,
  Ticket,
} from '@/components/Icons';
import {
  PaneHeader,
  PaneHeaderIconBadge,
  PaneHeaderLabel,
  PaneHeaderCloseButton,
} from '@/components/ui/pane-header';
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
import { getLast4 } from '@/components/ui/CopyChip';
import type { PackActiveOrderPane } from '@/components/packer/usePackerOrderPane';
import { PackingEntityContextHeader } from './PackingEntityContextHeader';
import { UnitPackPhotoPeek } from './UnitPackPhotoPeek';

type PackView = 'checklist' | 'photos' | 'timeline' | 'ticket' | 'support' | 'rollup';

interface ActivePackerWorkspaceProps {
  activeOrder: PackActiveOrderPane;
  onClose: () => void;
}

/**
 * Focused pack work-item view in the /packer right pane. Crossfades over the
 * pack history table when the sidebar scan resolves an order — mirrors
 * ActiveOrderWorkspace on /tech.
 *
 * Unbox-shaped body: entity-context header + SectionTabsSlider (checklist /
 * photos / timeline / support / ticket / rollup) via {@link StationWorkbench}.
 * Packing is registry-exempt for the terminal dock (no sticky CTA here).
 */
export function ActivePackerWorkspace({ activeOrder, onClose }: ActivePackerWorkspaceProps) {
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
  const orderIdDisplay = activeOrder.orderId?.trim() || getLast4(activeOrder.tracking) || '—';
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

  const eyebrow =
    activeOrder.scanType === 'UNIT'
      ? 'Pack · Prepack unit'
      : activeOrder.scanType === 'SKU'
        ? 'Pack · SKU'
        : 'Pack · Order';

  return (
    <motion.div
      key={resetKey}
      initial={cardPresence.initial}
      animate={cardPresence.animate}
      exit={cardPresence.exit}
      transition={cardTransition}
      className="relative flex h-full w-full flex-col bg-surface-canvas"
    >
      <PaneHeader
        className="border-border-soft bg-surface-card"
        rowClassName="px-4"
        leftSlot={
          <>
            <PaneHeaderIconBadge
              Icon={
                activeOrder.scanType === 'UNIT'
                  ? Camera
                  : activeOrder.scanType === 'SKU'
                    ? Package
                    : MapPin
              }
              bg="bg-surface-canvas"
              tint={
                activeOrder.scanType === 'UNIT' || activeOrder.scanType === 'SKU'
                  ? 'text-emerald-600'
                  : 'text-blue-600'
              }
              size="sm"
              rounded="lg"
            />
            <PaneHeaderLabel
              eyebrow={eyebrow}
              value={orderIdDisplay}
              valueTitle={orderIdDisplay}
              valueClassName="truncate text-sm font-black tracking-tight text-text-default"
            />
          </>
        }
        rightSlot={
          <>
            <span className="hidden items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-role-eyebrow uppercase tracking-widest text-emerald-600 ring-1 ring-inset ring-emerald-200 md:inline-flex">
              <Barcode className="h-3 w-3" />
              <span>Scan next</span>
            </span>
            <PaneHeaderCloseButton
              onClick={onClose}
              ariaLabel="Return to history"
              title="Return to history"
            />
          </>
        }
      />

      <StationWorkbench
        className="min-h-0 flex-1"
        reserveScrollClearance={false}
        scrollClassName="pb-8"
        entityContext={
          <motion.div initial="hidden" animate="show" variants={revealContainer}>
            <motion.div variants={revealItem}>
              <PackingEntityContextHeader activeOrder={activeOrder} />
            </motion.div>
          </motion.div>
        }
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
