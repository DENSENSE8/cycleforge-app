"use client";

import { useRef, useState } from "react";
import { Pencil, Lock, Tags } from "@/components/Icons";
import {
  CONDITION_GRADES,
  conditionLabel,
  conditionDescription,
} from "@/lib/conditions";
import { conditionPillClass, conditionGradeTone } from "@/lib/condition-tone";
import { HoverTooltip } from "@/components/ui/HoverTooltip";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";

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
   * grade) and collapses to ONLY the selected control once a grade is chosen.
   * Clicking the icon re-expands the full row.
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
}

// Single flat row of grades, in display order. Used grades (A / B / C) are
// shown bare; retail-ready grades + parts follow — no "USED"/"NEW+" parents.
// Labels come from the shared `pill` variant (src/lib/conditions.ts) so the
// picker copy stays in lockstep with every other grade display.
const GRADES = CONDITION_GRADES.map((value) => ({
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
  bar: "h-4 w-4",
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
  const selectedGrade = GRADES.find((g) => g.value === selected) ?? null;
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
 * mode it folds to a Tags square after a grade is chosen.
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
}: Props) {
  const selected = String(value || "")
    .trim()
    .toUpperCase();
  const selectedGrade = GRADES.find((g) => g.value === selected) ?? null;
  // The scrollbar is hidden, so without this a mouse wheel scrolls the parent
  // panel vertically and the overflowing grades (USED_C / PARTS) are
  // unreachable in narrow hosts like the shipped details sidebar.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  // Collapsible variant starts EXPANDED on mount (the SerialCard remounts per
  // line, so opening a PO line always shows the full row for selection); it
  // collapses to the chosen grade once a grade is picked. Multi-unit Station
  // rows pass startCollapsed so an already-graded unit mounts as the Tags
  // square. The parent may take control via `expanded`/`onExpandedChange`
  // (e.g. collapse while editing a serial); otherwise it's self-managed.
  const [internalExpanded, setInternalExpanded] = useState(
    () => !(startCollapsed && selectedGrade),
  );
  const expanded = expandedProp ?? internalExpanded;
  const setExpanded = (next: boolean) => {
    onExpandedChange?.(next);
    if (expandedProp === undefined) setInternalExpanded(next);
  };
  // The row scroller remounts across collapse/expand, so `expanded` re-binds
  // the wheel listener to the fresh element.
  useHorizontalWheelScroll(scrollerRef, expanded);

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
      ref={scrollerRef}
      role="radiogroup"
      aria-label="Condition grade"
      className="flex w-max max-w-full min-w-0 items-stretch gap-0 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      {GRADES.map((g) => (
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
              if (selected === g.value) {
                onChange("");
                return;
              }
              onChange(g.value);
              if (collapsible) setExpanded(false);
            }}
            className={`${conditionPillClass(g.value, selected === g.value)} ds-raw-button`}
          >
            {g.label}
          </button>
        </HoverTooltip>
      ))}
    </div>
  );
}
