import { useEffect, useState } from 'react';
import { Loader2 } from '@/components/Icons';
import { isNumericKind, passBandLabel, stepValueUnit } from '@/lib/qc/qc-step';
import type { ChecklistStep, UnitResult } from './sku-testing-types';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';



/**
 * Captures a structured value for one execution step (number / percent / enum /
 * text). Numeric kinds submit `valueNum` (the server derives pass/fail from the
 * step's pass band); enum/text submit `valueText`. Shows the pass band as a hint.
 */
export function StepValueControl({
  step,
  result,
  busy,
  onSubmit,
}: {
  step: ChecklistStep;
  result?: UnitResult;
  busy: boolean;
  onSubmit: (raw: string) => void;
}) {
  const kind = step.value_kind ?? '';
  const isNumeric = isNumericKind(kind);
  const recorded =
    result?.value_num != null
      ? String(result.value_num)
      : result?.value_text != null
        ? result.value_text
        : '';
  const [val, setVal] = useState<string>(recorded);
  // Re-sync when the recorded value changes (reload, unit switch).
  useEffect(() => {
    setVal(recorded);
  }, [recorded]);

  const band = passBandLabel(step);

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {kind === 'ENUM' ? (
        <select
          value={val}
          onChange={(e) => {
            setVal(e.target.value);
            onSubmit(e.target.value);
          }}
          disabled={busy}
          className={cn("rounded-md border border-border-soft px-2 py-1 text-role-caption font-medium text-text-default", focusRing('field', 'accent'))}
        >
          <option value="">—</option>
          {(step.value_enum ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <>
          <input
            type={isNumeric ? 'number' : 'text'}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit(val);
            }}
            onBlur={() => {
              if (val !== recorded) onSubmit(val);
            }}
            placeholder={isNumeric ? stepValueUnit(step) ?? 'value' : 'value'}
            disabled={busy}
            className={cn("w-24 rounded-md border border-border-soft px-2 py-1 text-role-caption font-medium text-text-default placeholder:text-text-faint", focusRing('field', 'accent'))}
          />
          {step.value_unit ? (
            <span className="text-role-micro font-semibold text-text-faint">{step.value_unit}</span>
          ) : null}
        </>
      )}
      {band ? (
        <span className="text-role-micro font-medium text-text-faint">pass {band}</span>
      ) : null}
      {busy ? <Loader2 className="h-3 w-3 animate-spin text-text-faint" /> : null}
    </div>
  );
}
