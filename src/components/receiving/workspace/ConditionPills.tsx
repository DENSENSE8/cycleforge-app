"use client";

import { useRef, useState } from "react";
import { Pencil, Lock, Tags } from "@/components/Icons";
import { TOP_CHROME_ICON_GLYPH } from "@/components/layout/header-shell";
import {
  CONDITION_GRADES,
  conditionLabel,
  conditionDescription,
  conditionOptions,
  type ConditionLabelVariant,
} from "@/lib/conditions";
import {
  conditionPillClass,
  conditionGradeTone,
  type ConditionPillDensity,
} from "@/lib/condition-tone";
import { HoverTooltip } from "@/components/ui/HoverTooltip";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import { TRIAGE_PANEL_SEGMENT_ENDS } from "@/design-system/tokens/triage-panel";
import { cn } from "@/utils/_cn";

/** Expanded strip layout — scroll (Units / compact hosts) vs full-width distribute. */
type ConditionPillsLayout = "scroll" | "barDistribute";

/** Which corner the expanded strip wears. */
type ConditionPillsCorner = "flush" | "panel";

interface Props {
  value: string | null | undefined;
  /**
   * Grade pick — every press commits that grade (select-never-clear). Callers
   * that need a rare clear do it elsewhere, not via pill re-click.
   */
  onChange: (next: string) => void;
  /** When set, the picker collapses to the Tags square once a grade is selected. */
  collapsible?: boolean;
  /**
   * Controlled expanded state (collapsible mode only). When provided, the
   * parent owns expand/collapse — e.g. SerialCard collapses the picker while a
   * serial is being edited. Leave undefined to let the component self-manage.
   */
  expanded?: boolean;
  onExpandedChange?: (next: boolean) => void;
  /** Collapsible mode only. */
  collapsedLabel?: boolean;
  /**
   * Uncontrolled collapsible only. When true, mount collapsed if a grade is
   * already selected (Tags square) — multi-unit Station PO rows. SerialCard
   * keeps the default (start expanded when empty for a fresh pick).
   */
  startCollapsed?: boolean;
  /** Locked / non-interactive. */
  readOnly?: boolean;
  /**
   * Collapsed Tags square size. `bar` = joined serial-bar instrument (`h-11`).
   * `header` = PO line title+details band (`h-20`), peer of the product thumb.
   */
  faceSize?: "bar" | "header";
  /** Expanded grade label shape from `src/lib/conditions.ts`. */
  labelVariant?: ConditionLabelVariant;
  /**
   * Expanded strip layout. Defaults to `'scroll'` (compact pills + overflow).
   * Progressive Unbox passes `'barDistribute'` — full-width flush cells
   * (`flex-1` / `justify-between`) with no left-clump dead air.
   */
  layout?: ConditionPillsLayout;
  /**
   * Collapsible Tags square press. When set, click runs this instead of
   * expanding the grade strip — hover / focus still expand. Unbox capture
   * uses this to arm the serial field from the leading units/Tags face.
   */
  onCollapsedClick?: () => void;
  /**
   * Corner of the expanded strip. Defaults to `'flush'` — see
   * {@link ConditionPillsCorner}. Triage panels pass `'panel'`.
   */
  corner?: ConditionPillsCorner;
}

// Collapsed / locked faces keep abbreviated pill labels for aria — long
// names never land on the Tags square. Expanded strip builds from
// `conditionOptions(labelVariant)` instead.
const PILL_GRADES = CONDITION_GRADES.map((value) => ({
  value,
  label: conditionLabel(value, "pill"),
}));

/**
 * Collapsed condition face — square flush cell. `bar` joins the serial
 * instrument (`h-11`); `header` peers the PO line product thumb (`h-20`).
 */
const COLLAPSED_ICON_BTN = {
  bar: "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-none transition-colors",
  header:
    "inline-flex h-20 w-20 shrink-0 items-center justify-center rounded-none transition-colors",
} as const;

const COLLAPSED_TAGS_ICON = {
  /** Bar face — same glyph token as TestingStatusPills / InlineNotice faces. */
  bar: TOP_CHROME_ICON_GLYPH,
  header: "h-7 w-7",
} as const;

/**
 * Collapsed condition face — filled square (grade hue) + white Tags icon.
 * Same visual as {@link ConditionPills} collapsible collapse; used by the
 * Unbox capture row when Serial is open (back-to-grading affordance).
 */
function ConditionGradeCircle({
  grade,
  onClick,
  faceSize = "bar",
}: {
  grade: string | null | undefined;
  /** Optional handoff (e.g. expand picker / close serial panel). */
  onClick?: () => void;
  faceSize?: "bar" | "header";
}) {
  const selected = String(grade || "")
    .trim()
    .toUpperCase();
  const selectedGrade = PILL_GRADES.find((g) => g.value === selected) ?? null;
  const faceBtn = COLLAPSED_ICON_BTN[faceSize];
  const tagsIcon = COLLAPSED_TAGS_ICON[faceSize];
  if (!selectedGrade) {
    if (onClick) {
      return (
        <HoverTooltip label="Not graded — back to condition" asChild focusable={false}>
          <button
            type="button"
            onClick={onClick}
            aria-label="Not graded — back to condition"
            data-capture-badge
            className={`ds-raw-button ${faceBtn} bg-surface-card text-text-faint active:scale-[0.98]`}
          >
            <Tags className={tagsIcon} aria-hidden />
          </button>
        </HoverTooltip>
      );
    }
    return (
      <HoverTooltip label="Not graded" asChild focusable={false}>
        <span
          className={`${faceBtn} bg-surface-card text-text-faint`}
          aria-label="Not graded"
        >
          <Tags className={tagsIcon} aria-hidden />
        </span>
      </HoverTooltip>
    );
  }
  const tone = conditionGradeTone(selectedGrade.value);
  const faceClass = `${faceBtn} ${tone.active}`;
  if (onClick) {
    return (
      <HoverTooltip
        label={conditionDescription(selectedGrade.value)}
        asChild
        focusable={false}
      >
        {/* ds-raw-button: condition circle handoff — same face as ConditionPills collapse */}
        <button
          type="button"
          onClick={onClick}
          aria-label={`Condition ${selectedGrade.label} — change`}
          data-capture-badge
          className={`ds-raw-button ${faceClass} active:scale-[0.98]`}
        >
          <Tags className={`${tagsIcon} text-white`} aria-hidden />
        </button>
      </HoverTooltip>
    );
  }
  return (
    <HoverTooltip
      label={conditionDescription(selectedGrade.value)}
      asChild
      focusable={false}
    >
      <span
        className={faceClass}
        aria-label={`Condition ${selectedGrade.label}`}
        role="img"
      >
        <Tags className={`${tagsIcon} text-white`} aria-hidden />
      </span>
    </HoverTooltip>
  );
}

/** Bare, mobile-first condition picker. */
export function ConditionPills({
  value,
  onChange,
  collapsible = false,
  expanded: expandedProp,
  onExpandedChange,
  collapsedLabel = true,
  readOnly = false,
  startCollapsed = false,
  faceSize = "bar",
  labelVariant = "pill",
  layout = "scroll",
  onCollapsedClick,
  corner = "flush",
}: Props) {
  const selected = String(value || "")
    .trim()
    .toUpperCase();
  const grades = conditionOptions(labelVariant);
  const selectedGrade =
    grades.find((g) => g.value === selected) ??
    PILL_GRADES.find((g) => g.value === selected) ??
    null;
  const distribute = layout === "barDistribute";
  // Round the two END cells, not the container.
  const cornerClassName = corner === "panel" ? TRIAGE_PANEL_SEGMENT_ENDS : "";
  const pillDensity: ConditionPillDensity = distribute
    ? "barDistribute"
    : "pill";
  // The scrollbar is hidden, so without this a mouse wheel scrolls the parent
  // panel vertically and the overflowing grades (USED_C / PARTS) are
  // unreachable in narrow hosts like the shipped details sidebar.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  // Collapsible variant starts EXPANDED on mount (the SerialCard remounts per line, so opening a PO line always shows the full row for…
  const [internalExpanded, setInternalExpanded] = useState(
    () => !(startCollapsed && selectedGrade),
  );
  const expanded = expandedProp ?? internalExpanded;
  const setExpanded = (next: boolean) => {
    onExpandedChange?.(next);
    if (expandedProp === undefined) setInternalExpanded(next);
  };
  // Scroll layout remounts across collapse/expand — re-bind the wheel listener.
  // barDistribute never overflows, so skip the scroll host binding.
  useHorizontalWheelScroll(scrollerRef, expanded && !distribute);

  // Locked: order has shipped, so the grade is frozen. Render just the selected
  // pill (styled active) with a lock affordance — no other grades, no click.
  if (readOnly) {
    return (
      <div
        role="group"
        aria-label="Condition grade (locked after shipping)"
        className="flex w-fit items-center gap-0"
      >
        <HoverTooltip
          label="Condition locked after shipping"
          asChild
          focusable={false}
        >
          <span
            className={`${conditionPillClass(selectedGrade?.value ?? selected, true)} inline-flex cursor-default items-center gap-1`}
          >
            {selectedGrade?.label ?? "Not graded"}
            <Lock className="h-3 w-3 opacity-70" />
          </span>
        </HoverTooltip>
      </div>
    );
  }

  const openStrip = () => setExpanded(true);
  const onTagsPress = onCollapsedClick ?? openStrip;
  // When Tags click arms serial, delay hover-expand so a press lands on the
  // square before the strip replaces it. Clear on leave so a pass-through
  // hover does not expand after the pointer is gone.
  const hoverExpandTimerRef = useRef<number | null>(null);
  const hoverExpandMs = onCollapsedClick ? 280 : 0;
  const clearHoverExpand = () => {
    if (hoverExpandTimerRef.current != null) {
      window.clearTimeout(hoverExpandTimerRef.current);
      hoverExpandTimerRef.current = null;
    }
  };
  const scheduleHoverExpand = () => {
    clearHoverExpand();
    if (hoverExpandMs <= 0) {
      openStrip();
      return;
    }
    hoverExpandTimerRef.current = window.setTimeout(() => {
      hoverExpandTimerRef.current = null;
      openStrip();
    }, hoverExpandMs);
  };

  // Collapsed: filled square (active grade hue) + white Tags icon.
  if (collapsible && !expanded && selectedGrade) {
    return (
      <div
        role="radiogroup"
        aria-label="Condition grade"
        className="flex w-fit items-center gap-0"
        onMouseEnter={scheduleHoverExpand}
        onMouseLeave={clearHoverExpand}
        onFocusCapture={openStrip}
      >
        {collapsedLabel ? (
          <ConditionGradeCircle
            grade={selectedGrade.value}
            onClick={() => {
              clearHoverExpand();
              onTagsPress();
            }}
            faceSize={faceSize}
          />
        ) : (
          <HoverTooltip
            label={`Condition ${selectedGrade.label} — hover to change`}
            asChild
            focusable={false}
          >
            <button
              type="button"
              onClick={() => {
                clearHoverExpand();
                onTagsPress();
              }}
              aria-label={`Condition ${selectedGrade.label} — change`}
              className="ds-raw-button rounded p-0.5 text-text-faint transition-colors hover:bg-surface-sunken hover:text-text-muted"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </HoverTooltip>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-w-0 items-stretch",
        // Collapsible expanded + barDistribute claim full width (progressive
        // Unbox bar / unit-row strip). No trailing confirm cell.
        collapsible || distribute ? "w-full max-w-full" : "w-max max-w-full",
      )}
    >
      <div
        ref={scrollerRef}
        role="radiogroup"
        aria-label="Condition grade"
        className={cn(
          "flex min-w-0 flex-1 items-stretch gap-0",
          cornerClassName,
          distribute
            ? // Full-name progressive bar:
              "justify-between overflow-hidden [&>*+*]:-ml-px"
            : "overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {grades.map((g) => (
          <HoverTooltip
            key={g.value}
            label={conditionDescription(g.value)}
            asChild
            focusable={false}
          >
            {/* ds-raw-button: segmented condition-grade toggle — leave hand-rolled */}
            <button
              type="button"
              role="radio"
              aria-checked={selected === g.value}
              onClick={() => {
                // Select-never-clear: every press commits that grade (including
                // re-affirm). Clearing a grade is not a pill re-click.
                onChange(g.value);
                if (collapsible) setExpanded(false);
              }}
              className={`${conditionPillClass(g.value, selected === g.value, pillDensity)} ds-raw-button`}
            >
              {g.label}
            </button>
          </HoverTooltip>
        ))}
      </div>
    </div>
  );
}
