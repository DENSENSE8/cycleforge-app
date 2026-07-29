'use client';

import { motion } from 'framer-motion';
import { ChevronDown, Check } from '@/components/Icons';
import {
  framerPresence,
  framerTransition,
  motionBezier,
} from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { readOptimisticFlag } from '@/lib/receiving/optimistic-serials';
import {
  ConditionGradeChip,
  EmptySkuChipFace,
  SerialChip,
  SerialChipSkeleton,
  SkuScanRefChip,
  UnitPriceChip,
  getLast4,
} from '@/components/ui/CopyChip';
import { SerialChipWithMenu } from '@/components/receiving/workspace/SerialCard';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton, TextField } from '@/design-system/primitives';
import { META_COL } from '@/components/ui/RowMetaColumns';
import { PoLineMetaGrid } from '@/components/receiving/workspace/PoLineMetaGrid';
import {
  PoLineTitleMenu,
  type PoLineSerialSplitContext,
} from '@/components/receiving/workspace/PoLineTitleMenu';
import { cn } from '@/utils/_cn';
import { setSerialEditHandoff } from '@/components/receiving/workspace/serialEditHandoff';
import {
  dispatchSelectLine,
  type ReceivingLineRow,
} from '@/components/station/ReceivingLinesTable';
import { receivingWorkspaceLineTitle } from '@/lib/receiving/po-group-title';
import { ScannedBadge, ProgressBadge } from './PoLineBadges';
import type {
  ActiveRowSerial,
  ActiveRowSlot,
  PoLineSerialActions,
} from './po-lines-accordion-types';

/** Sibling row reorder when the active line changes — softer than the default layout spring. */
const PO_LINE_LAYOUT_SPRING = {
  type: 'spring' as const,
  stiffness: 220,
  damping: 36,
  mass: 0.9,
};

/** Active row body expand/collapse — slower + layout-eased than stationCollapse. */
const PO_LINE_BODY_COLLAPSE = {
  height: {
    type: 'tween' as const,
    duration: 0.4,
    ease: motionBezier.layout,
  },
  opacity: {
    type: 'tween' as const,
    duration: 0.32,
    ease: motionBezier.easeOut,
  },
};

/** Inline item-description editor surface handed down from the accordion shell. */
export interface PoLineDescProps {
  shownId: number | null;
  draft: string;
  savingLineId: number | null;
  inputRef: React.RefObject<HTMLInputElement>;
  toggle: (line: ReceivingLineRow) => void;
  setDraft: (value: string) => void;
  save: (lineId: number) => void;
}

interface Props {
  line: ReceivingLineRow;
  isActive: boolean;
  readOnly: boolean;
  /** Serial-hydration fetch in flight — show the serial-slot skeleton until it lands. */
  serialsLoading?: boolean;
  activeCollapsed: boolean;
  onToggleCollapsed: () => void;
  /**
   * When false, inactive rows keep the chevron track for alignment but omit the
   * decorative glyph (Pending group headers use the same `showChevron={false}`
   * discipline — don't advertise expand that only switches focus).
   */
  showInactiveChevron?: boolean;
  activeConditionOverride?: string | null;
  activeSerialActions?: PoLineSerialActions;
  activeRowSlot?: ActiveRowSlot;
  renderTitleActions?: (line: ReceivingLineRow) => React.ReactNode;
  /** Unmatched-carton serial split (Testing UNLINK) — offered from the title ⋮ menu. */
  serialSplit?: PoLineSerialSplitContext;
  desc: PoLineDescProps;
  /**
   * Enable framer `layout` position tracking. The accordion sets this false
   * while it lives in a hidden tab panel (`display:none`) so the rows don't fly
   * in from the origin when the panel is re-shown; the sibling-reorder layout
   * animation runs only when the panel is actually visible. Defaults to true so
   * standalone callers (testing) are unaffected.
   */
  animateLayout?: boolean;
}

/**
 * One PO-item row. Collapsed sibling rows dispatch `receiving-select-line` on
 * click to re-seed the workspace on that line; the active row renders its
 * chevron toggle, the title ⋮ (item description / unlink), per-serial chip
 * menus, and the expandable body (condition pills / serial adder, or the
 * item-description editor). Purely presentational — mutations are delegated
 * up to the shell's hooks.
 */
export function PoLineRow({
  line,
  isActive,
  readOnly,
  serialsLoading = false,
  activeCollapsed,
  onToggleCollapsed,
  showInactiveChevron = false,
  activeConditionOverride,
  activeSerialActions,
  activeRowSlot,
  renderTitleActions,
  serialSplit,
  desc,
  animateLayout = true,
}: Props) {
  const rowBodyCollapse = useMotionPresence(framerPresence.collapseHeight);
  const rowBodyTransition = useMotionTransition(PO_LINE_BODY_COLLAPSE);
  const rowLayoutTransition = useMotionTransition(PO_LINE_LAYOUT_SPRING);
  const lineTitle = receivingWorkspaceLineTitle(line);
  const chevronTransition = useMotionTransition(framerTransition.stationChevron);

  const descShown = desc.shownId === line.id;

  return (
    <motion.li
      layout={animateLayout ? 'position' : false}
      transition={rowLayoutTransition}
      aria-current={isActive ? 'true' : undefined}
      className={`relative min-w-0 overflow-hidden rounded-xl border transition-colors ${
        isActive
          ? 'border-blue-300 bg-blue-50/60'
          : 'border-border-soft bg-surface-card hover:bg-surface-hover'
      }`}
    >
      {/* Click area = title + meta. Kept as a <div role="button"> so
          interactive children (condition pills) can render inside
          the bubble without producing nested <button> markup. */}
      <div
        role={!readOnly && !isActive ? 'button' : undefined}
        tabIndex={!readOnly && !isActive ? 0 : -1}
        onClick={() => {
          if (!readOnly && !isActive) dispatchSelectLine(line);
        }}
        onKeyDown={(e) => {
          if (readOnly || isActive) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            dispatchSelectLine(line);
          }
        }}
        className={`w-full min-w-0 px-3 pb-1 pt-1 text-left ${
          !readOnly && !isActive ? 'cursor-pointer' : ''
        }`}
      >
        {/* RowTitle contract: disclosure chevron in a fixed track on the
            title row; meta chips indent under the title text (META_COL),
            not under the chevron — same layout as ReceivingLineOrderRow. */}
        <div className="flex min-w-0 items-center">
          {!readOnly ? (
            <span
              className={cn(
                'flex shrink-0 items-center justify-center',
                META_COL.dotTrackWide,
              )}
            >
              {isActive ? (
                // Active row: the chevron is a real toggle — click to
                // collapse/expand the row body (condition pills, unit
                // rows). Essential on multi-qty lines where the expanded
                // body is taller than the viewport.
                <motion.button
                  type="button"
                  aria-expanded={!activeCollapsed}
                  aria-label={
                    activeCollapsed ? 'Expand item details' : 'Collapse item details'
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleCollapsed();
                  }}
                  animate={{ rotate: activeCollapsed ? -90 : 0 }}
                  transition={chevronTransition}
                  className="ds-raw-button flex items-center justify-center rounded-md p-0.5 text-text-faint transition-colors hover:bg-blue-100 hover:text-text-muted"
                >
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                </motion.button>
              ) : showInactiveChevron ? (
                <ChevronDown
                  className="h-3.5 w-3.5 -rotate-90 text-text-faint transition-transform"
                  aria-hidden
                />
              ) : (
                // Empty track — inactive click switches focus; don't advertise expand.
                <span className="h-3.5 w-3.5" aria-hidden />
              )}
            </span>
          ) : null}
          {/* Title is sourced from the listing/PO line — not editable as
              text. ds-allow-title: native tooltip shows full value when
              truncated. Item description / unlink open from the title ⋮. */}
          <p
            className="min-w-0 flex-1 truncate text-role-caption font-semibold text-text-default"
            title={lineTitle}
          >
            {lineTitle}
          </p>
          {!readOnly ? (
            <PoLineTitleMenu
              line={line}
              descShown={descShown}
              onToggleDesc={() => desc.toggle(line)}
              serialSplit={serialSplit}
            />
          ) : null}
          {!readOnly ? renderTitleActions?.(line) : null}
        </div>
        {/* Meta row — fixed columns for vertical scan alignment. */}
        <PoLineMetaGrid
          indent={readOnly ? undefined : META_COL.indentWide}
          qty={
            readOnly ? (
              <ScannedBadge expected={line.quantity_expected} />
            ) : (
              <ProgressBadge
                received={line.quantity_received}
                expected={line.quantity_expected}
              />
            )
          }
          sku={
            (line.sku || '').trim() ? (
              <SkuScanRefChip
                value={line.sku as string}
                display={getLast4(line.sku)}
                dense
              />
            ) : (
              <EmptySkuChipFace dense />
            )
          }
          condition={
            <ConditionGradeChip
              grade={
                isActive && activeConditionOverride
                  ? activeConditionOverride
                  : line.condition_grade
              }
              dense
            />
          }
          serial={
            Array.isArray(line.serials) && line.serials.length > 0 ? (
              <span className="flex min-w-0 flex-wrap items-center gap-1">
                {line.serials.map((s, i) => {
                  const sn = (s.serial_number || '').trim();
                  if (!sn) return null;
                  const serialRecord: ActiveRowSerial = {
                    id: s.id,
                    serial_number: sn,
                    condition_grade:
                      (s as { condition_grade?: string | null }).condition_grade ?? null,
                    _optimistic: readOptimisticFlag(s as { _optimistic?: 'adding' | 'removing' }),
                  };
                  if (!readOnly && (activeSerialActions?.onEdit || activeSerialActions?.onDelete)) {
                    const { onEdit, onDelete } = activeSerialActions;
                    return (
                      <SerialChipWithMenu
                        key={`${sn}-${i}`}
                        serial={serialRecord}
                        dense
                        isEditing={isActive && activeSerialActions.editingSerialId === s.id}
                        onEdit={
                          onEdit
                            ? (target) => {
                                if (isActive) {
                                  onEdit(target, line.id);
                                } else {
                                  setSerialEditHandoff(line.id, target);
                                  dispatchSelectLine(line);
                                }
                              }
                            : undefined
                        }
                        onDelete={
                          onDelete ? (target) => onDelete(target, line.id) : undefined
                        }
                      />
                    );
                  }
                  return (
                    <SerialChip
                      key={`${sn}-${i}`}
                      value={sn}
                      width="w-fit max-w-full"
                      dense
                      pending={readOptimisticFlag(s as { _optimistic?: 'adding' | 'removing' })}
                    />
                  );
                })}
              </span>
            ) : serialsLoading ? (
              // Serials for this line haven't streamed in yet — a skeleton keeps
              // the slot reading as "loading" (not "no serial") and reserves the
              // chip footprint so the row doesn't reflow when they land.
              <SerialChipSkeleton width="w-fit max-w-full" dense />
            ) : undefined
          }
          price={
            line.unit_price != null && Number(line.unit_price) > 0 ? (
              <UnitPriceChip amount={line.unit_price} dense />
            ) : undefined
          }
        />
      </div>
      {/* Active row only — the 2nd row. By default it holds the
          condition pills + serial adder (activeRowSlot). The notes icon
          toggles this same row to the Zoho item-description editor
          (descShown) — full-width entry, green check all the way right.
          Hidden while the chevron has collapsed the row. Read-only
          (triage) never renders this body — `activeRowSlot` returns null
          there, which would otherwise leave a stray empty `border-t`. */}
      {!readOnly && isActive && (activeRowSlot || descShown) ? (
        <motion.div
          initial={false}
          layout={animateLayout ? 'position' : false}
          animate={
            activeCollapsed
              ? rowBodyCollapse.exit
              : rowBodyCollapse.animate
          }
          transition={rowBodyTransition}
          className="min-w-0 overflow-hidden border-t border-blue-200/60"
          aria-hidden={activeCollapsed}
        >
          <div className="min-w-0 px-3 pb-1 pt-1">
            {descShown ? (
              <div className="flex items-center gap-2">
                <TextField
                  ref={desc.inputRef}
                  label="Item description"
                  value={desc.draft}
                  onChange={desc.setDraft}
                  tone="blue"
                  className="min-w-0 flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') desc.save(line.id);
                  }}
                />
                <HoverTooltip label="Save item description" asChild>
                  <IconButton
                    ariaLabel="Save item description"
                    onClick={() => desc.save(line.id)}
                    disabled={desc.savingLineId === line.id}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white ring-1 ring-inset ring-emerald-700 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                    icon={<Check className="h-4 w-4" aria-hidden />}
                  />
                </HoverTooltip>
              </div>
            ) : typeof activeRowSlot === 'function'
              ? activeRowSlot({ serials: line.serials ?? [] })
              : activeRowSlot}
          </div>
        </motion.div>
      ) : null}
    </motion.li>
  );
}
