'use client';

/** Band 1 RIGHT recipe for every Unbox photo procedure step: */

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Camera, Images, Upload } from '@/components/Icons';
import { STATION_CONTEXT_PHOTO_TONE } from '@/components/station/entity-context/station-context-action-pill';
import { Button } from '@/design-system/primitives/Button';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/** Shared face for each segment — never content-sized chips in air. */
const PHOTO_STEP_SEGMENT =
  'ds-raw-button inline-flex h-11 min-w-0 flex-1 items-center justify-center px-3 text-role-caption font-semibold transition-colors disabled:cursor-not-allowed disabled:text-text-faint';

/** Send-to-phone segment — same blue face as carton Photos chrome: */
const PHOTO_STEP_PHONE_FACE = `border ${STATION_CONTEXT_PHOTO_TONE} disabled:border-border-hairline disabled:bg-surface-sunken disabled:text-text-faint`;

type PhotoStepSegmentProps = {
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  label: string;
  busy?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  /** Extra attrs such as aria-expanded or data markers. */
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
    <Button
      ref={buttonRef}
      type="button"
      variant="ghost"
      size="lg"
      radius="flush"
      onClick={onClick}
      disabled={disabled}
      ariaLabel={ariaLabel}
      data-testid={testId}
      {...buttonProps}
      className={cn(
        PHOTO_STEP_SEGMENT,
        tone === 'phone'
          ? PHOTO_STEP_PHONE_FACE
          : 'bg-surface-card text-text-default hover:bg-surface-hover',
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Button>
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
  /** Unbox only: link an existing carton photo (Displays › Photos › Link). */
  link?: PhotoStepSegmentProps;
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
      data-unbox-photo-segments={link ? '3' : '2'}
      {...(hostMarker ? { [hostMarker]: true } : {})}
      {...rootProps}
    >
      {link ? (
        <SegmentButton
          {...link}
          tone="card"
          data-testid="unbox-photo-link"
          icon={<Images className="mr-1.5 h-4 w-4 shrink-0" aria-hidden />}
        />
      ) : null}
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
