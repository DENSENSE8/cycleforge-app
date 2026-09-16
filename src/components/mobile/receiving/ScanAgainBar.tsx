'use client';

import { useRouter } from 'next/navigation';
import { X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { MobileScanCta } from '@/components/mobile/redesign/mobile-scan-cta';

/**
 * Header control cluster for any page reached by scanning a Data Matrix on the
 * phone (scanned receiving line, receipt, or serial unit): back to the scanner,
 * or out of the flow.
 *
 * The scan half **is** {@link MobileScanCta} — the same component the mobile top
 * bar mounts. Until 2026-08-21 this file hand-rolled its own: a `brand`-variant
 * `rounded-full` "Scan again" pill with a QrCode glyph, doing the identical job
 * (`router.push('/m/scan')`) behind a completely different face. Two faces for
 * one action is the fork the house bans, and it cost more than tidiness — an
 * operator learning the square blue SCAN corner found a round dark pill instead
 * on exactly the screens they land on after a scan.
 *
 * What stays local is the ✕ exit, which is this cluster's own job and has no
 * counterpart in the top bar.
 */
export function ScanAgainBar({ className = '' }: { className?: string }) {
  const router = useRouter();
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {/* Exit sits INBOARD. SCAN owns the outermost corner on every mobile
          surface; a cluster that reverses them here would put a destructive
          "leave the flow" tap exactly where the thumb has learned to find the
          scanner. */}
      <IconButton
        type="button"
        icon={<X className="h-4 w-4" />}
        ariaLabel="Exit to orders"
        onClick={() => router.push('/m/work')}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-sunken text-text-soft active:bg-surface-strong"
      />
      <MobileScanCta />
    </div>
  );
}
