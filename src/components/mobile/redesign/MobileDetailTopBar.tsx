'use client';

import { ReactNode, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { MobileScanCta } from '@/components/mobile/redesign/mobile-scan-cta';
import { cornerClass } from '@/design-system/tokens/radius';
import { mobileRouteOwnsTopBar } from '@/lib/mobile/host-top-bar';
import { previousMobilePath } from '@/lib/mobile/nav-trail';
import { cn } from '@/utils/_cn';

interface MobileDetailTopBarProps {
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
}

/** **The mobile detail bar** — the one top bar for every mobile screen that shows a single record: */
export function MobileDetailTopBar({
  title,
  subtitle,
  meta,
  mono = false,
  lead,
  backHref,
  close = false,
  right,
}: MobileDetailTopBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  /**
   * The seat is mounted HERE only when nothing above this bar has one.
   * (`mobile-scan-cta`: *"Scan has ONE door"*). Operator 2026-09-15, on
   */
  const ownsScanSeat = mobileRouteOwnsTopBar(pathname);

  const handleBack = useCallback(() => {
    if (!backHref) return router.back();
    if (previousMobilePath() === backHref.split(/[?#]/)[0]) router.back();
    else router.replace(backHref);
  }, [backHref, router]);

  return (
    <header
      className={cn(
        'sticky top-0 z-header flex min-h-14 items-center gap-2 border-b border-border-hairline bg-surface-card/95 pl-2 backdrop-blur supports-[backdrop-filter]:bg-surface-card/80',
        // The scan cell is square and flush to the outer edge (operator
        // 2026-09-24); padding would float it off the corner.
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
      <div className="min-w-0 flex-1">
        {subtitle ? (
          <p className="truncate text-role-micro text-text-soft">
            {subtitle}
          </p>
        ) : null}
        {/* ONE title face, on the CF role scale — `text-role-body` + semibold (14px/600), the same optical size as the list rows beneath it… */}
        <p
          className={cn(
            'truncate text-role-body font-semibold tracking-tight text-text-default',
            mono && 'font-mono',
          )}
        >
          {title}
        </p>
        {meta ? (
          <p className="truncate text-role-caption font-semibold text-text-muted">{meta}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1 self-stretch">
        {right}
        {/* Same corner, same control as the host header — and only when that
            header is absent. See {@link ownsScanSeat}. */}
        {ownsScanSeat ? <MobileScanCta fill /> : null}
      </div>
    </header>
  );
}
