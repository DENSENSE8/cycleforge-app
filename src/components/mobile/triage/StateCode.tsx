'use client';

import { LIFECYCLE, STATE_TONE_CLASSES, type LifecycleState, type StateName } from '@/design-system/tokens/lifecycle';
import { INTAKE, type IntakeClass } from '@/design-system/tokens/intake';
import { cn } from '@/utils/_cn';

/**
 * A triage row's lead:
 * mono code (BRIEF §4 triage — "what it is + state code" leads the row). The
 * is shown, the full word is spoken (BRIEF §8). Same face as the `/m/scan`
 */
function StateCode({ code, label, tone }: { code: string; label: string; tone: StateName | null }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-mode border px-1 font-mono text-role-eyebrow font-bold uppercase',
        tone ? cn(STATE_TONE_CLASSES[tone].pill, STATE_TONE_CLASSES[tone].border) : 'border-border-subtle text-text-default',
      )}
    >
      <span aria-hidden>{code}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** A `LIFECYCLE` state's code, in its tone. */
export function LifecycleStateCode({ state }: { state: LifecycleState }) {
  const spec = LIFECYCLE[state];
  return <StateCode code={spec.code} label={spec.label} tone={spec.tone} />;
}

/** An `INTAKE` class's code — neutral ink: what a thing is carries no alarm. */
function IntakeStateCode({ intake }: { intake: IntakeClass }) {
  const spec = INTAKE[intake];
  return <StateCode code={spec.code} label={spec.label} tone={null} />;
}
