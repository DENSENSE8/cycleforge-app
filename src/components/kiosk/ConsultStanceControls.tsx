'use client';

/** Work · Show · Verify. */

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/design-system/primitives';
import { IntakeCombobox } from '@/components/outbound/orders/intake/IntakeCombobox';
import { elevationClass } from '@/design-system/tokens/shadows';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { DROPDOWN_SHELL_CORNER } from '@/design-system/tokens/radius';
import { KIOSK_POS_TRAIL_CONTROL } from '@/app/kiosk/kiosk-pos-surface';
import { cn } from '@/utils/_cn';
import { CONSULT_STANCES, type ConsultStance } from '@/lib/counter/consult-stance';

const CONSULT_STANCE_LABELS: Record<ConsultStance, string> = {
  work: 'Work',
  show: 'Show',
  verify: 'Verify',
};


/* `layout="rail"` (56px KIOSK_MODE_SPINE_* glyph cells) was deleted 2026-09-13: */

export function ConsultStanceControls({
  value,
  onChange,
  layout = 'inline',
}: {
  value: ConsultStance;
  onChange: (stance: ConsultStance) => void;
  layout?: 'inline' | 'header';
}) {
  if (layout === 'header') {
    return (
      <div
        className="flex h-full shrink-0 items-center"
        role="group"
        aria-label="Consult stance"
        data-testid="kiosk-consult-stance-rail"
      >
        {/* Same ghost-combobox chrome as the command menu and All-products — ONE vocabulary for every word-control on the kiosk row. */}
        <IntakeCombobox
          testId="kiosk-consult-stance-menu"
          ariaLabel="Consult stance"
          triggerVariant="ghost"
          value={value}
          placeholder="Work"
          searchPlaceholder="Search stance"
          emptyMessage="No stance match"
          contentClassName={cn('min-w-40 overflow-hidden', DROPDOWN_SHELL_CORNER)}
          className={cn(KIOSK_POS_TRAIL_CONTROL, 'shrink-0 font-medium text-text-default', focusRing('control', 'neutral'))}
          options={CONSULT_STANCES.map((stance) => ({
            value: stance,
            label: CONSULT_STANCE_LABELS[stance],
          }))}
          optionTestId={(o) => `kiosk-consult-stance-${o.value}`}
          onChange={(next) => onChange(next as ConsultStance)}
        />
      </div>
    );
  }

  return <ConsultStanceInlineChip value={value} onChange={onChange} />;
}

function ConsultStanceInlineChip({
  value,
  onChange,
}: {
  value: ConsultStance;
  onChange: (stance: ConsultStance) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const node = rootRef.current;
      if (node && event.target instanceof Node && !node.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const pick = (stance: ConsultStance) => {
    onChange(stance);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="flex flex-col items-start gap-1" data-testid="kiosk-consult-stance-talk">
      {open
        ? CONSULT_STANCES.filter((stance) => stance !== value).map((stance) => (
            <Button
              key={stance}
              type="button"
              size="lg"
              radius="pill"
              variant="secondary"
              aria-label={`Consult stance · ${CONSULT_STANCE_LABELS[stance]}`}
              onClick={() => pick(stance)}
              className={elevationClass('overlay')}
            >
              {CONSULT_STANCE_LABELS[stance]}
            </Button>
          ))
        : null}
      <Button
        type="button"
        size="lg"
        radius="pill"
        variant="primarySoft"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Consult stance · ${CONSULT_STANCE_LABELS[value]}. ${open ? 'Hide choices' : 'Change face'}`}
        onClick={() => setOpen((next) => !next)}
        className={elevationClass('overlay')}
      >
        {CONSULT_STANCE_LABELS[value]}
      </Button>
    </div>
  );
}
