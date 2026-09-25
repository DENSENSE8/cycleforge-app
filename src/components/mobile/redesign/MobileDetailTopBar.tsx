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
  /**
   * Where Back lands. When the operator just came from there, Back pops the
   * history (so that screen's own Back still reaches where they were before);
   * otherwise it REPLACES this entry. Never a push — a pushed parent whose Back
   * is `router.back()` returns here, and the two bounce forever. Omitted:
   * `router.back()`.
   */
  backHref?: string;
  /**
   * Paint the leading control as an **X** ("Close") instead of a back chevron.
   * For a record opened FROM a job (an order from the pick queue): the operator
   * is peeking at the record and returning to the job, not walking up a tree.
   * Navigation is identical — `backHref` still decides where it lands.
   */
  close?: boolean;
  /** Slot at the right edge — status pill, network chip, print button. */
  right?: ReactNode;
}

/**
 * **The mobile detail bar** — the one top bar for every mobile screen that shows
 * a single record: receiving carton, PO item, unit, repair, handling unit, pick
 * order.
 *
 * Anatomy, left → right: back chevron (44×44, real `aria-label`) · optional
 * `lead` · eyebrow / title / meta stack · `right` slot · {@link MobileScanCta}
 * **when this bar is the screen's only chrome**. The title block truncates so a
 * long vendor name cannot push the right slot off-screen.
 *
 * ## Why it lives here and answers to this name
 *
 * It was `components/mobile/receiving/MobileTopBar` and served two receiving
 * routes, while five other detail screens — unit, repair, handling unit, pick,
 * receiving history — each hand-rolled the same anatomy with slightly different
 * paddings, chevron sizes and z-indexes. Consolidating them (2026-08-21) both
 * removed those five near-copies and fixed the reason it mattered: the SCAN
 * corner is mounted HERE, so a screen the host header withholds its bar from
 * cannot join the app without one. On a route that KEEPS the host header, that
 * header owns the corner and this bar paints no seat — see `ownsScanSeat`. The
 * old name also collided with the shell's own `MobileTopBar`, two files one
 * import typo apart.
 *
 * The prop surface is deliberately slot-shaped (`lead` · `meta` · `right`)
 * rather than flag-shaped. Seven surfaces with genuinely different record
 * furniture share one geometry; encoding each one's furniture as a boolean is
 * how a shared bar turns back into five.
 */
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
   *
   * On a route the host header withholds (`/m/u/`, `/m/t/`, `/m/pick/[id]`, …)
   * this bar is the screen's only chrome and must carry SCAN — a detail screen
   * is where an operator finishes one item and starts the next. On a route that
   * KEEPS the host header, that header already owns the top-right corner, and
   * a second seat here is a duplicate door to one destination
   * (`mobile-scan-cta`: *"Scan has ONE door"*). Operator 2026-09-15, on
   * `/m/pair`: *"remove the scan button from the same header with the text pair
   * location."*
   *
   * Derived from the route, never a prop: a boolean would let any screen drop
   * the app's primary action by accident, which is the failure the shared
   * predicate exists to make impossible.
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
          <p className="truncate text-role-micro uppercase tracking-[0.18em] text-text-soft">
            {subtitle}
          </p>
        ) : null}
        {/*
          ONE title face, on the CF role scale — `text-role-body` + semibold
          (14px/600), the same optical size as the list rows beneath it
          (`ITEM_RECORD_MOBILE_TITLE.face`).

          It was raw `text-base` (16px): a Tailwind family size, off the role
          scale entirely, landing between `role-body` (14) and `role-title`
          (18) — so it could not be compared with any content on the screen and
          simply came out biggest. With `mono` it also came out WIDER at the
          same px. On a record screen that reads as the subject; on a triage
          screen, where the title is a PAGE NAME the operator already knows,
          it outranked the product titles they are there to read (operator
          2026-09-15: *"the hierarchy of the pair location is way too big
          compared to the rest of the text"*).

          `mono` now switches the FAMILY only — identifier vs prose — never the
          size. A bar earns emphasis from its ground and its position, not from
          being the one string on the screen off the scale.
        */}
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
