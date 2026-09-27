'use client';

/**
 * `DeskRecordViewSwitch` — the staffer's choice of record view, named where the
 * record is read (operator 2026-09-25: "the user should have the choice to view
 * the data how they want to"). Two faces over the desk stage's ONE view
 * state, never a second state:
 *
 * - **In place** — the record takes the list's place at the list's width.
 * - **Split** — a fixed, padded list on the left for finding; the record on the
 *   right, one column (owner 2026-09-26: easily triageable).
 *
 * Renders nothing off a desk stage (station embed, modal host): a dead switch
 * is worse than none. Nor in floor: floor is a face of the LIST, and its
 * records always open in place (owner 2026-09-26).
 */

import { useId } from 'react';
import { ColumnsOne, ColumnsTwo } from '@/components/Icons';
import { LayoutGroup, motion, motionRole, useReducedMotion } from '@/design-system/motion';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { DESK_SPLIT_SHORTCUT_HINT, useDeskStageOptional } from './DeskStageContext';

const VIEWS = [
  { view: 'in-place', label: 'In place', title: `In place — the record opens where the list is (${DESK_SPLIT_SHORTCUT_HINT})`, Icon: ColumnsOne },
  { view: 'split', label: 'Split', title: `Split — the list on the left, the record on the right (${DESK_SPLIT_SHORTCUT_HINT})`, Icon: ColumnsTwo },
] as const;

export function DeskRecordViewSwitch({ className }: { className?: string }) {
  const stage = useDeskStageOptional();
  const groupId = useId();
  const reduce = useReducedMotion();
  if (!stage || stage.view === 'floor') return null;

  const transition = reduce ? { duration: 0 } : motionRole.record.pane.transition;

  return (
    <LayoutGroup id={groupId}>
      <div
        role="radiogroup"
        aria-label="Record view"
        className={cn('inline-flex shrink-0 items-center gap-0.5 rounded-mode-control bg-surface-sunken p-0.5', className)}
      >
        {VIEWS.map(({ view, label, title, Icon }) => {
          const active = stage.view === view;
          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={active}
              title={title}
              onClick={active ? undefined : () => stage.setView(view)}
              className={cn(
                'relative inline-flex h-7 items-center gap-1.5 rounded-mode-control px-2.5 text-role-caption font-medium transition-colors duration-mode-feedback',
                active ? 'text-text-default' : 'text-text-muted hover:text-text-default',
                focusRing('control'),
              )}
            >
              {active ? (
                // The face slides between the two options — the choice reads as
                // one object moving, not two buttons repainting.
                <motion.span
                  layoutId="desk-record-view-face"
                  transition={transition}
                  className="absolute inset-0 rounded-mode-control bg-surface-card shadow-elev-soft"
                  aria-hidden
                />
              ) : null}
              <Icon className="relative size-3.5" />
              <span className="relative">{label}</span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
