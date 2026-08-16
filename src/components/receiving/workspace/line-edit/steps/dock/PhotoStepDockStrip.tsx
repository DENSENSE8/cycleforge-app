'use client';

/**
 * Band 1 RIGHT recipe for every Unbox photo procedure step:
 *   [ LEFT procedure waist ] | [ Link a photo | Upload photos | Send to phone ]
 *
 * Three equal `flex-1` flush segments inside a `flex-1` strip host (abuts the
 * always-left `UnboxDockScanEntry`), hairline divide, no host gap / padding.
 * Callers own verb wiring (pair popover · dropzone · phone publish) and pass
 * the three segment buttons. Guard: `unbox-dock-one-shell.guard.test.ts`.
 */

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Camera, Images, Upload } from '@/components/Icons';
import { STATION_CONTEXT_PHOTO_TONE } from '@/components/station/entity-context/station-context-action-pill';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/** Shared face for each third — never content-sized chips in air. */
export const PHOTO_STEP_SEGMENT =
  'ds-raw-button inline-flex h-11 min-w-0 flex-1 items-center justify-center px-3 text-role-caption font-semibold transition-colors disabled:cursor-not-allowed disabled:text-text-faint';

/**
 * Send-to-phone third — same blue face as carton Photos chrome
 * ({@link STATION_CONTEXT_PHOTO_FLUSH_CLASS}): `border` + PHOTO_TONE.
 * Tone alone is not enough — without `border`, `border-blue-200` never paints
 * and the third reads as washed card. Geometry stays `flex-1` strip third.
 * Icon = SoT {@link Camera} (same as {@link ReceivingPhotoButton}), never phone.
 */
export const PHOTO_STEP_PHONE_FACE = `border ${STATION_CONTEXT_PHOTO_TONE} disabled:border-border-hairline disabled:bg-surface-sunken disabled:text-text-faint`;

export type PhotoStepSegmentProps = {
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  label: string;
  busy?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  /** Extra attrs (e.g. aria-expanded for the Link popover trigger). */
  buttonProps?: Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'onClick' | 'disabled' | 'aria-label' | 'type' | 'className' | 'children' | 'ref'
  > &
    Record<`data-${string}`, string | boolean | undefined>;
  'data-testid'?: string;
};

function SegmentButton({
  onClick,
  disabled,
  ariaLabel,
  label,
  icon,
  tone,
  buttonRef,
  buttonProps,
  'data-testid': testId,
}: PhotoStepSegmentProps & {
  icon: ReactNode;
  tone: 'card' | 'phone';
}) {
  return (
    // ds-raw-button: photo-step Band 1 equal third
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      data-testid={testId}
      {...buttonProps}
      className={cn(
        PHOTO_STEP_SEGMENT,
        focusRing('control', tone === 'phone' ? 'accent' : 'neutral'),
        tone === 'phone'
          ? PHOTO_STEP_PHONE_FACE
          : 'bg-surface-card text-text-default hover:bg-surface-hover',
        cornerClass('flush'),
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

export function PhotoStepDockStrip({
  link,
  upload,
  phone,
  fileInput,
  rootProps,
  hostMarker,
}: {
  link: PhotoStepSegmentProps;
  upload: PhotoStepSegmentProps;
  phone: PhotoStepSegmentProps;
  fileInput?: ReactNode;
  /** Spread onto the host (e.g. dropzone root props). */
  rootProps?: Record<string, unknown>;
  /**
   * Host data-* marker name without value (e.g. `data-unbox-arrival-photos-dock`).
   * React boolean data attrs paint `="true"` — easier to probe than empty string.
   */
  hostMarker?:
    | 'data-unbox-arrival-photos-dock'
    | 'data-unbox-carton-photo-dock'
    | 'data-unbox-item-photos'
    | 'data-po-line-item-photos';
}) {
  return (
    <div
      className={cn(
        // flex-1 right segment beside the left procedure waist — not full-band alone.
        'flex h-11 min-w-0 flex-1 items-stretch divide-x divide-border-hairline overflow-hidden bg-surface-card',
        cornerClass('flush'),
      )}
      data-unbox-photo-step-dock
      data-unbox-photo-thirds="3"
      {...(hostMarker ? { [hostMarker]: true } : {})}
      {...rootProps}
    >
      <SegmentButton
        {...link}
        tone="card"
        data-testid="unbox-photo-link"
        icon={<Images className="mr-1.5 h-4 w-4 shrink-0" aria-hidden />}
      />
      <SegmentButton
        {...upload}
        tone="card"
        data-testid="unbox-photo-upload"
        icon={<Upload className="mr-1.5 h-4 w-4 shrink-0" aria-hidden />}
      />
      <SegmentButton
        {...phone}
        tone="phone"
        data-testid="unbox-photo-phone"
        icon={<Camera className="mr-1.5 h-4 w-4 shrink-0" aria-hidden />}
      />
      {fileInput}
    </div>
  );
}

/**
 * Procedure keys that mount {@link PhotoStepDockStrip} as the Band 1 **right**
 * segment beside the always-left procedure waist (`UnboxDockScanEntry`).
 */
export const UNBOX_PHOTO_STRIP_KEYS = new Set([
  'arrival_label_photo',
  'arrival_box_photo',
  'shipping_label_photo',
  'box_photo',
  'packing_material',
  'item_photos',
]);
