'use client';

/**
 * Work · Show · Verify.
 *
 * Callers: `KioskUtilityCluster` in `KioskTopChrome.tsx`; `CounterWorkspace`
 * (`layout="inline"`). Existing file — not a second stance control. No data files.
 * Affected API: none. Schemas: `ConsultStance`.
 * User: "execute now" / "work show verify should be word and drop downs on the
 * left side of the paper work icon"
 *
 * Rail = 56px glyph cells (`layout="rail"`). Header = ghost word dropdown on
 * the kiosk trail (`layout="header"`). Inline = desk visit chip. Never standing keycaps.
 */

import { useEffect, useRef, useState } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button } from '@/design-system/primitives';
import { IntakeCombobox } from '@/components/outbound/orders/intake/IntakeCombobox';
import { elevationClass } from '@/design-system/tokens/shadows';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { HEADER_ICON_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { CONSULT_STANCES, type ConsultStance } from '@/lib/counter/consult-stance';
import {
  KIOSK_MODE_SPINE_ROW_ACTIVE,
  KIOSK_MODE_SPINE_ROW_IDLE,
  KIOSK_UTILITY_SPINE_ROW,
} from '@/app/kiosk/kiosk-chrome';

export const CONSULT_STANCE_LABELS: Record<ConsultStance, string> = {
  work: 'Work',
  show: 'Show',
  verify: 'Verify',
};

function stanceLetter(stance: ConsultStance): string {
  return CONSULT_STANCE_LABELS[stance].slice(0, 1);
}

export function ConsultStanceControls({
  value,
  onChange,
  layout = 'inline',
}: {
  value: ConsultStance;
  onChange: (stance: ConsultStance) => void;
  layout?: 'rail' | 'inline' | 'header';
}) {
  if (layout === 'header') {
    return (
      <div
        className="flex h-full shrink-0 items-center"
        role="group"
        aria-label="Consult stance"
        data-testid="kiosk-consult-stance-rail"
      >
        <IntakeCombobox
          testId="kiosk-consult-stance-menu"
          ariaLabel="Consult stance"
          triggerVariant="ghost"
          value={value}
          placeholder="Work"
          searchPlaceholder="Search stance"
          emptyMessage="No stance match"
          className={cn('font-medium text-text-default', focusRing('control', 'neutral'))}
          contentClassName={cn('min-w-40 overflow-hidden', HEADER_ICON_CORNER)}
          optionTestId={(opt) => `kiosk-consult-stance-${opt.value}`}
          options={CONSULT_STANCES.map((stance) => ({
            value: stance,
            label: CONSULT_STANCE_LABELS[stance],
          }))}
          onChange={(next) => onChange(next as ConsultStance)}
        />
      </div>
    );
  }

  if (layout === 'rail') {
    return (
      <div
        className="mt-auto flex flex-col"
        role="group"
        aria-label="Consult stance"
        data-testid="kiosk-consult-stance-rail"
      >
        {CONSULT_STANCES.map((stance) => {
          const active = value === stance;
          const label = CONSULT_STANCE_LABELS[stance];
          return (
            <HoverTooltip key={stance} label={label} placement="left">
              <button
                type="button"
                aria-label={label}
                aria-pressed={active}
                data-testid={`kiosk-consult-stance-${stance}`}
                onClick={() => onChange(stance)}
                className={cn(
                  KIOSK_UTILITY_SPINE_ROW,
                  active ? KIOSK_MODE_SPINE_ROW_ACTIVE : KIOSK_MODE_SPINE_ROW_IDLE,
                )}
              >
                <span className="text-sm font-semibold leading-none">{stanceLetter(stance)}</span>
              </button>
            </HoverTooltip>
          );
        })}
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
