'use client';

import { PathChips } from '@/design-system/components/PathChips';
import { noPad, pad2 } from '@/lib/barcode-routing';
import { labelSteps, type LabelKind, type LabelSelection, type LabelStep } from './location-label-model';

/**
 * The label address (Zone › Aisle › Bay › Level › Position) as path chips: each
 * shows its picked value, the open step is solid, a finished chip jumps back to
 * that step, and Position opens once a level is picked.
 */
export function StepPills({
  kind,
  step,
  zoneLetter,
  selection,
  onOpen,
}: {
  kind: LabelKind;
  step: LabelStep;
  zoneLetter?: string;
  selection: LabelSelection;
  onOpen: (step: LabelStep) => void;
}) {
  const values: Record<LabelStep, string | undefined> = {
    zone: zoneLetter ?? (selection.room ? '?' : undefined),
    aisle: selection.aisle != null ? pad2(selection.aisle) : undefined,
    bay: selection.bay != null ? pad2(selection.bay) : undefined,
    level: selection.level != null ? noPad(selection.level) : undefined,
    position: selection.position != null ? pad2(selection.position) : undefined,
  };
  return (
    <PathChips
      ariaLabel="Location address"
      testId="label-step-pills"
      currentId={step}
      chips={labelSteps(kind).map(({ id, label }) => {
        const open = values[id] != null || (id === 'position' && selection.level != null);
        return { id, label, value: values[id], onSelect: open ? () => onOpen(id) : undefined, testId: `label-step-${id}` };
      })}
    />
  );
}
