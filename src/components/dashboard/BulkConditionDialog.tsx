'use client';

/**
 * One condition grade onto N selected orders — table-foot Condition CTA.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { Button } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  conditionDescription,
  conditionOptions,
  type ConditionGrade,
} from '@/lib/conditions';
import { cn } from '@/utils/_cn';

const GRADES = conditionOptions('full');

interface BulkConditionDialogProps {
  open: boolean;
  count: number;
  saving?: boolean;
  onCancel: () => void;
  onConfirm: (condition: ConditionGrade) => void;
}

export function BulkConditionDialog({
  open,
  count,
  saving = false,
  onCancel,
  onConfirm,
}: BulkConditionDialogProps) {
  const [choice, setChoice] = useState<ConditionGrade | null>(null);

  const close = () => {
    setChoice(null);
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set condition</DialogTitle>
          <DialogDescription>
            {count === 1
              ? 'Applies to 1 selected order.'
              : `Applies to all ${count} selected orders.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col stack-tight" role="radiogroup" aria-label="Condition">
          {GRADES.map((grade) => (
            <button
              key={grade.value}
              type="button"
              role="radio"
              aria-checked={choice === grade.value}
              onClick={() => setChoice(grade.value)}
              className={cn(
                'ds-raw-button flex w-full items-start gap-2 rounded-lg inset-field text-left transition-colors',
                focusRing('control', 'accent'),
                choice === grade.value
                  ? 'bg-surface-accent ring-1 ring-inset ring-border-accent'
                  : 'hover:bg-surface-hover',
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-role-caption font-semibold text-text-default">
                  {grade.label}
                </span>
                <span className="block text-role-micro normal-case tracking-normal text-text-soft">
                  {conditionDescription(grade.value)}
                </span>
              </span>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => choice && onConfirm(choice)}
            disabled={!choice || saving}
            loading={saving}
          >
            {saving ? 'Saving…' : 'Set condition'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
