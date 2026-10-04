'use client';

import { ReactNode, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, ChevronLeft, X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { MobileV2ScanCta } from './MobileV2ScanCta';
import { cornerClass } from '@/design-system/tokens/radius';
import { mobileRouteOwnsTopBar } from '@/lib/mobile/host-top-bar';
import { previousMobilePath } from '@/lib/mobile/nav-trail';
import { cn } from '@/utils/_cn';

interface MobileV2DetailTopBarProps {
  /** The record's identity — the one line that says which thing this is. */
  title: string;
  /**
   * Eyebrow above the title. `ReactNode`, not `string`, so a domain can tint
   * its own word (repair orange) without this bar growing a tone prop.
   */
  subtitle?: ReactNode;
  /** Third line under the title — customer, product, whatever names the record. */
  meta?: ReactNode;
  /** Render the title mono. Identifiers are mono (house law); prose is not. */
  mono?: boolean;
  /** Slot between the back button and the title block — a domain glyph, an avatar. */
  lead?: ReactNode;
  /** Where Back lands. */
  backHref?: string;
  /** Paint the leading control as an **X** ("Close") instead of a back chevron. */
  close?: boolean;
  /** Slot at the right edge — status pill, network chip, print button. */
  right?: ReactNode;
  /** Route for the bar's scan seat when this record owns a specialized job. */
  scanHref?: string;
  /** False when the screen's body carries its own `MobileCaptureWindow` — then THAT is the one scan door. */
  scanSeat?: boolean;
  /**
   * Makes the whole title block one ≥44px control with a chevron-down
   * affordance — the record's identity opens its chooser (the location
   * record's ordinal picker). Omit for a static title.
   */
  onTitlePress?: () => void;
  /** Accessible name of the title control (defaults to its visible text). */
  titlePressLabel?: string;
}

/** **The mobile detail bar** — the one top bar for every mobile screen that shows a single record: */
export function MobileV2DetailTopBar({
  title,
  subtitle,
  meta,
  mono = false,
  lead,
  backHref,
  close = false,
  right,
  scanHref,
  scanSeat = true,
  onTitlePress,
  titlePressLabel,
}: MobileV2DetailTopBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  /**
   * The seat is mounted HERE only when nothing above this bar has one.
   * (`mobile-scan-cta`: *"Scan has ONE door"*). Operator 2026-09-15, on
   */
  const ownsScanSeat = scanSeat && mobileRouteOwnsTopBar(pathname);

  const handleBack = useCallback(() => {
    if (!backHref) return router.back();
    if (previousMobilePath() === backHref.split(/[?#]/)[0]) router.back();
    else router.replace(backHref);
  }, [backHref, router]);

  return (
    <header
      className={cn(
        'sticky top-0 z-header flex min-h-14 items-center gap-2 border-b border-border-hairline bg-surface-card/95 pl-2 backdrop-blur supports-[backdrop-filter]:bg-surface-card/80',
        // V2 chrome uses the same inset rounded control as the application
        // header. The record identity keeps the remaining width.
        ownsScanSeat ? 'pr-0' : 'pr-4',
      )}
    >
      <IconButton
        onClick={handleBack}
        ariaLabel={close ? 'Close' : 'Back'}
        icon={close ? <X className="h-6 w-6 text-text-default" /> : <ChevronLeft className="h-6 w-6 text-text-default" />}
        className={cn(
          '-ml-1 flex h-11 w-11 shrink-0 items-center justify-center transition-colors hover:bg-surface-hover',
          cornerClass('flush'),
        )}
      />
      {lead}
      {onTitlePress ? (
        <button
          type="button"
          onClick={onTitlePress}
          aria-haspopup="dialog"
          aria-label={titlePressLabel}
          className={cn(
            'flex min-h-11 min-w-0 flex-1 items-center gap-1 self-stretch text-left transition-colors hover:bg-surface-hover active:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-accent',
            cornerClass('flush'),
          )}
          data-testid="detail-top-bar-title-press"
        >
          <TitleBlock title={title} subtitle={subtitle} meta={meta} mono={mono} />
          <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
        </button>
      ) : (
        <TitleBlock title={title} subtitle={subtitle} meta={meta} mono={mono} />
      )}
      <div className="flex shrink-0 items-center gap-1 self-stretch">
        {right}
        {/* Same V2 face as the host header — and only when that header is
            absent. See {@link ownsScanSeat}. */}
        {ownsScanSeat ? <MobileV2ScanCta rounded destination={scanHref} /> : null}
      </div>
    </header>
  );
}

/** Spans, not `<p>`: the block must be valid phrasing content inside the title `<button>`. */
function TitleBlock({ title, subtitle, meta, mono }: Pick<MobileV2DetailTopBarProps, 'title' | 'subtitle' | 'meta'> & { mono: boolean }) {
  return (
    <span className="block min-w-0 flex-1">
      {subtitle ? (
        <span className="block truncate text-role-micro text-text-soft">
          {subtitle}
        </span>
      ) : null}
      {/* ONE title face, on the CF role scale — `text-role-body` + semibold (14px/600), the same optical size as the list rows beneath it… */}
      <span
        className={cn(
          'block truncate text-role-body font-semibold tracking-tight text-text-default',
          mono && 'font-mono',
        )}
      >
        {title}
      </span>
      {meta ? (
        <span className="block truncate text-role-caption font-semibold text-text-muted">{meta}</span>
      ) : null}
    </span>
  );
}
