'use client';

import { ReactNode, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { MobileScanCta } from '@/components/mobile/redesign/mobile-scan-cta';
import { cornerClass } from '@/design-system/tokens/radius';
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
  /** Optional URL to navigate back to. If omitted, `router.back()` is used. */
  backHref?: string;
  /** Slot at the right edge — status pill, network chip, print button. */
  right?: ReactNode;
}

/**
 * **The mobile detail bar** — the one top bar for every mobile screen that shows
 * a single record: receiving carton, PO item, unit, repair, handling unit, pick
 * order.
 *
 * Anatomy, left → right: back chevron (44×44, real `aria-label`) · optional
 * `lead` · eyebrow / title / meta stack · `right` slot · {@link MobileScanCta}.
 * The title block truncates so a long vendor name cannot push the right slot
 * off-screen.
 *
 * ## Why it lives here and answers to this name
 *
 * It was `components/mobile/receiving/MobileTopBar` and served two receiving
 * routes, while five other detail screens — unit, repair, handling unit, pick,
 * receiving history — each hand-rolled the same anatomy with slightly different
 * paddings, chevron sizes and z-indexes. Consolidating them (2026-08-21) both
 * removed those five near-copies and fixed the reason it mattered: the SCAN
 * corner is mounted HERE, so a screen cannot join the app without it. The old
 * name also collided with the shell's own `MobileTopBar`, two files one import
 * typo apart.
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
  right,
}: MobileDetailTopBarProps) {
  const router = useRouter();

  const handleBack = useCallback(() => {
    if (backHref) router.push(backHref);
    else router.back();
  }, [backHref, router]);

  return (
    <header className="sticky top-0 z-header flex min-h-14 items-center gap-2 border-b border-border-hairline bg-surface-card/95 pl-2 pr-4 backdrop-blur supports-[backdrop-filter]:bg-surface-card/80">
      <IconButton
        onClick={handleBack}
        ariaLabel="Back"
        icon={<ChevronLeft className="h-6 w-6 text-text-default" />}
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
        <p
          className={cn(
            'truncate text-base font-semibold tracking-tight text-text-default',
            mono && 'font-mono',
          )}
        >
          {title}
        </p>
        {meta ? (
          <p className="truncate text-role-caption font-semibold text-text-muted">{meta}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {right}
        {/* Same corner, same control as the host header — a detail screen is
            where an operator finishes one item and starts the next, so it is the
            last place SCAN should go missing. */}
        <MobileScanCta />
      </div>
    </header>
  );
}
