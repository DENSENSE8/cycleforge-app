"use client";

import { useRef, useState } from "react";
import { Pencil, Lock, Tags, Check } from "@/components/Icons";
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
import { cornerClass } from "@/design-system/tokens/radius";
import { cn } from "@/utils/_cn";

/** Expanded strip layout — scroll (Units / compact hosts) vs full-width distribute. */
type ConditionPillsLayout = "scroll" | "barDistribute";

interface Props {
  value: string | null | undefined;
  /**
   * Grade pick, or `''` to clear/remove the selected grade (re-click active
   * pill). Callers must accept empty — Units display + ReceivingUnitRows wire
   * clear through unit + serial grade writers.
   */
  onChange: (next: string) => void;
  /**
   * When set, the picker starts as the full row (PO just opened → pick a
   * grade) with a trailing confirm that collapses to ONLY the selected
   * control. Clicking the Tags face re-expands the full row.
   */
  collapsible?: boolean;
  /**
   * Controlled expanded state (collapsible mode only). When provided, the
   * parent owns expand/collapse — e.g. SerialCard collapses the picker while a
   * serial is being edited. Leave undefined to let the component self-manage.
   */
  expanded?: boolean;
  onExpandedChange?: (next: boolean) => void;
  /**
   * Collapsible mode only. When false, the collapsed state renders JUST the edit
   * pencil (no selected-grade control) — used where another surface already shows
   * the chosen grade (e.g. the PO-line meta row's condition chip). When true,
   * collapses to a filled square (condition hue) with a white Tags icon.
   * Defaults to true.
   */
  collapsedLabel?: boolean;
  /**
   * Uncontrolled collapsible only. When true, mount collapsed if a grade is
   * already selected (Tags square) — multi-unit Station PO rows. SerialCard
   * keeps the default (start expanded when empty for a fresh pick).
   */
  startCollapsed?: boolean;
  /**
   * Locked / non-interactive. Renders only the selected grade as a single static
   * pill with a lock affordance — no other grades, no edit, no `onChange`. Used
   * once an order has shipped (condition is frozen). Takes precedence over
   * `collapsible`.
   */
  readOnly?: boolean;
  /**
   * Collapsed Tags square size. `bar` = joined serial-bar instrument (`h-11`).
   * `header` = PO line title+details band (`h-20`), peer of the product thumb.
   */
  faceSize?: "bar" | "header";
  /**
   * Expanded grade label shape from `src/lib/conditions.ts`. Defaults to
   * `'pill'` (NEW · L-New · …). Progressive Unbox passes `'full'`
   * (Brand New · Like New · …). Collapsed Tags face never paints these
   * strings — only the expanded strip does.
   */
  labelVariant?: ConditionLabelVariant;
  /**
   * Expanded strip layout. Defaults to `'scroll'` (compact pills + overflow).
   * Progressive Unbox passes `'barDistribute'` — full-width flush cells
   * (`flex-1` / `justify-between`) with no left-clump dead air.
   */
  layout?: ConditionPillsLayout;
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
 * Read-only collapsed condition face — filled square (grade hue) + white Tags.
 * Same visual as {@link ConditionPills} collapsible collapse; no expand/edit.
 */
function ConditionGradeCircle({
  grade,
  onClick,
  faceSize = "bar",
}: {
  grade: string | null | undefined;
  /** Optional handoff (e.g. open Units display). */
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

/**
 * Bare, mobile-first condition picker. Renders every grade as a single
 * horizontally-scrolling row of pills — no nested parents. In `collapsible`
 * mode a trailing confirm folds the strip to a Tags square. Progressive
 * Unbox opts into `labelVariant="full"` + `layout="barDistribute"` for a
 * flush edge-to-edge full-name bar.
 */
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
  const pillDensity: ConditionPillDensity = distribute
    ? "barDistribute"
    : "pill";
  // The scrollbar is hidden, so without this a mouse wheel scrolls the parent
  // panel vertically and the overflowing grades (USED_C / PARTS) are
  // unreachable in narrow hosts like the shipped details sidebar.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  // Collapsible variant starts EXPANDED on mount (the SerialCard remounts per
  // line, so opening a PO line always shows the full row for selection); the
  // trailing confirm collapses to the Tags square. Multi-unit Station rows
  // pass startCollapsed so an already-graded unit mounts collapsed. The
  // parent may take control via `expanded`/`onExpandedChange` (e.g. collapse
  // while editing a serial); otherwise it's self-managed.
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

  // Collapsed: filled square (active grade hue) + white Tags icon.
  // Click expands the full grade row — no separate edit pencil.
  // When `collapsedLabel` is off, the grade is already shown elsewhere (the meta
  // row chip), so collapse to just a change control (pencil) with no duplicate icon.
  if (collapsible && !expanded && selectedGrade) {
    return (
      <div
        role="radiogroup"
        aria-label="Condition grade"
        className="flex w-fit items-center gap-0"
      >
        {collapsedLabel ? (
          <ConditionGradeCircle
            grade={selectedGrade.value}
            onClick={() => setExpanded(true)}
            faceSize={faceSize}
          />
        ) : (
          <HoverTooltip
            label={`Condition ${selectedGrade.label} — change`}
            asChild
            focusable={false}
          >
            <button
              type="button"
              onClick={() => setExpanded(true)}
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
        // Collapsible expanded: grades fill; trailing confirm owns a fixed cell.
        // barDistribute always claims full width (progressive Unbox bar).
        collapsible || distribute ? "w-full max-w-full" : "w-max max-w-full",
      )}
    >
      <div
        ref={scrollerRef}
        role="radiogroup"
        aria-label="Condition grade"
        className={cn(
          "flex min-w-0 flex-1 items-stretch gap-0",
          distribute
            ? // Full-name progressive bar: even share across the row — no
              // left-clump + dead air before the confirm ✓.
              "justify-between overflow-hidden"
            : "overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {grades.map((g) => (
          <HoverTooltip
            key={g.value}
            label={
              selected === g.value
                ? `${conditionDescription(g.value)} — click again to clear`
                : conditionDescription(g.value)
            }
            asChild
            focusable={false}
          >
            {/* ds-raw-button: segmented condition-grade toggle — leave hand-rolled */}
            <button
              type="button"
              role="radio"
              aria-checked={selected === g.value}
              onClick={() => {
                // Re-click active pill clears the grade (Units + editing surfaces).
                // Collapse only via the trailing confirm — keep the strip open
                // until the operator accepts the pick.
                if (selected === g.value) {
                  onChange("");
                  return;
                }
                onChange(g.value);
              }}
              className={`${conditionPillClass(g.value, selected === g.value, pillDensity)} ds-raw-button`}
            >
              {g.label}
            </button>
          </HoverTooltip>
        ))}
      </div>
      {collapsible ? (
        <HoverTooltip
          label={
            selectedGrade
              ? `Confirm ${selectedGrade.label}`
              : "Pick a condition first"
          }
          asChild
        >
          {/* ds-raw-button: confirm + collapse expanded grade strip */}
          <button
            type="button"
            aria-label={
              selectedGrade
                ? `Confirm condition ${selectedGrade.label}`
                : "Pick a condition first"
            }
            disabled={!selectedGrade}
            onClick={() => setExpanded(false)}
            className={cn(
              "ds-raw-button inline-flex w-11 shrink-0 self-stretch items-center justify-center border-l border-border-soft transition-colors",
              cornerClass("flush"),
              selectedGrade
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "cursor-not-allowed bg-surface-strong text-text-faint",
            )}
          >
            <Check className="h-4 w-4" aria-hidden />
          </button>
        </HoverTooltip>
      ) : null}
    </div>
  );
}
