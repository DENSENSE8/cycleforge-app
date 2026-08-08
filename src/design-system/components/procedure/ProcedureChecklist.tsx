'use client';

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { StepStateBadge } from './StepStateBadge';
import type { ProcedureStepRow } from './types';

/**
 * Procedure checklist — the station's steps, all of them, at a glance.
 *
 * The house display for "what this station asks of the operator, and where they
 * are in it". Dumb by construction: it takes resolved steps and renders them.
 * Every domain (Unbox, Testing, Triage, Pack) supplies its own vocabulary from
 * its step SoT; this component learns no domain.
 *
 * ## Checklist vs cards — two surfaces, one vocabulary
 *
 * This is the **right-edge reference** display: the whole procedure, in
 * vocabulary order, nothing hidden, so the operator can see the shape of the
 * work and where they are in it *without leaving the step they are on*. Its
 * sibling {@link ProcedureDeck} is the **work surface** — one expanded section
 * at a time, showing that step's evidence. Neither surface carries the step's
 * action button; on Unbox that lives in the bottom dock, which is pinned while
 * both of these scroll.
 *
 * They are not a duplication, and the earlier "exactly ONE procedure surface"
 * rule that deleted this component was reading them as one. They answer
 * different questions from opposite edges: *where am I in the whole job* versus
 * *what do I do right now*. Both render from the SAME resolved
 * `ProcedureStepRow[]`, so they cannot disagree — that, not deletion, is what
 * keeps two views of one procedure honest.
 *
 * ## Order
 *
 * Rows render in the resolved vocabulary order the caller passed. Reorder is
 * allowed **only** when `onReorderSteps` is provided (authoring / dogfood SOP
 * mode); the default remains read-only vocabulary order with click-to-focus.
 *
 * ## Anatomy
 *
 * One row per step: marker → label → summary. House one-row anatomy
 * (`ui-design-system.md`): left-aligned, `truncate`, constant row height,
 * selection is background + ring only — never a size shift.
 */

/**
 * Cozy-row height for preview viewport math: `inset-cozy` (py-1.5) + 16px
 * marker ≈ 40px. Module-private — the only consumer is this file's own
 * `maxVisibleRows` math, and an exported geometry constant is a second place
 * for row height to be declared. Keep in sync with the row anatomy below.
 */
const PROCEDURE_CHECKLIST_ROW_PX = 40;

function StepRowContent({ step }: { step: ProcedureStepRow }) {
  const trailing =
    step.state === 'skipped'
      ? step.skipReason
        ? `Skipped · ${step.skipReason}`
        : 'Skipped'
      : step.summary;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <StepStateBadge state={step.state} position={step.position} />
      <span
        className={cn(
          'truncate text-role-caption font-semibold',
          step.state === 'pending' || step.state === 'skipped'
            ? 'text-text-muted'
            : 'text-text-default',
        )}
      >
        {step.label}
      </span>
      {trailing ? (
        <span className="ml-auto truncate text-role-eyebrow uppercase tracking-widest text-text-soft">
          {trailing}
        </span>
      ) : null}
    </div>
  );
}

function ChecklistRowShell({
  step,
  onSelectStep,
  dragHandle,
  setNodeRef,
  style,
}: {
  step: ProcedureStepRow;
  onSelectStep?: (key: string) => void;
  dragHandle?: ReactNode;
  setNodeRef?: (node: HTMLElement | null) => void;
  style?: CSSProperties;
}) {
  const isActive = step.state === 'active';
  return (
    <li
      ref={setNodeRef}
      style={style}
      data-procedure-step={step.key}
      data-procedure-state={step.state}
      // Selection never size-shifts: fill + inset ring only, constant py.
      // Fixed min-height keeps the hover-peek viewport honest at N rows.
      className={cn(
        'inset-cozy min-h-10 box-border',
        isActive && 'bg-blue-50 ring-1 ring-inset ring-blue-400',
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {dragHandle}
        {onSelectStep ? (
          <button
            type="button"
            onClick={() => onSelectStep(step.key)}
            className="ds-raw-button block min-w-0 flex-1 text-left"
          >
            <StepRowContent step={step} />
          </button>
        ) : (
          <StepRowContent step={step} />
        )}
      </div>
    </li>
  );
}

function SortableChecklistRow({
  step,
  onSelectStep,
}: {
  step: ProcedureStepRow;
  onSelectStep?: (key: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.key,
  });
  return (
    <ChecklistRowShell
      step={step}
      onSelectStep={onSelectStep}
      setNodeRef={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : undefined,
        position: 'relative',
        zIndex: isDragging ? 1 : undefined,
      }}
      dragHandle={
        // ds-raw-button: dnd-kit drag handle (spreads listeners; IconButton
        // active:scale would fight drag). Handle-only so row click still focuses.
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag to reorder ${step.label}`}
          className="ds-raw-button -ml-0.5 flex h-6 w-5 shrink-0 cursor-grab items-center justify-center text-text-faint transition hover:text-text-soft active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      }
    />
  );
}

export function ProcedureChecklist({
  steps,
  title,
  onSelectStep,
  onReorderSteps,
  className,
  maxVisibleRows,
}: {
  steps: ReadonlyArray<ProcedureStepRow>;
  /** Eyebrow above the list — the station's name for its procedure. */
  title?: string;
  /** Optional: jump to a step. Omit for a read-only checklist. */
  onSelectStep?: (key: string) => void;
  /**
   * When set, rows become sortable (dogfood / authoring). Omit for vocabulary
   * order only — the default for every non-authoring surface.
   */
  onReorderSteps?: (orderedKeys: string[]) => void;
  className?: string;
  /**
   * Cap the visible list to N rows (scroll for the rest). Omit for fit-height
   * surfaces such as the scan-station hover peek.
   */
  maxVisibleRows?: number;
}) {
  const sortable = !!onReorderSteps;
  const sortableIds = useMemo(() => steps.map((s) => s.key), [steps]);

  // House 6px pointer threshold (SwimlaneBoard / OrdersQueue) disambiguates
  // click vs drag; KeyboardSensor gives Space/arrows reorder.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (steps.length === 0) return null;

  const listMaxHeight =
    maxVisibleRows != null && maxVisibleRows > 0
      ? maxVisibleRows * PROCEDURE_CHECKLIST_ROW_PX
      : undefined;

  const handleDragEnd = (event: DragEndEvent) => {
    if (!onReorderSteps) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = sortableIds.indexOf(String(active.id));
    const newIdx = sortableIds.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    onReorderSteps(arrayMove([...sortableIds], oldIdx, newIdx));
  };

  const list = (
    <ol
      className={cn(
        'flex min-w-0 flex-col divide-y divide-border-hairline',
        listMaxHeight != null && 'overflow-y-auto',
      )}
      style={listMaxHeight != null ? { maxHeight: listMaxHeight } : undefined}
    >
      {steps.map((step) =>
        sortable ? (
          <SortableChecklistRow key={step.key} step={step} onSelectStep={onSelectStep} />
        ) : (
          <ChecklistRowShell key={step.key} step={step} onSelectStep={onSelectStep} />
        ),
      )}
    </ol>
  );

  return (
    <section
      className={cn('flex min-w-0 flex-col', className)}
      aria-label={title ?? 'Procedure'}
      // Sibling of `data-procedure-deck`. Both surfaces render the SAME
      // `data-procedure-step` keys — one derivation, two views — so a probe that
      // does not name which view it means silently reads both lists at once.
      data-procedure-checklist
    >
      {title ? (
        <p className="inset-field pb-1 text-role-eyebrow uppercase tracking-widest text-text-soft">
          {title}
        </p>
      ) : null}

      {sortable ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {list}
          </SortableContext>
        </DndContext>
      ) : (
        list
      )}
    </section>
  );
}
