'use client';

import { useRouter } from 'next/navigation';
import { X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { MobileScanCta } from '@/components/mobile/redesign/mobile-scan-cta';

/** Header control cluster for any page reached by scanning a Data Matrix on the phone (scanned receiving line, receipt, or serial unit): */
export function ScanAgainBar({ className = '' }: { className?: string }) {
  const router = useRouter();
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {/* Exit sits INBOARD. */}
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
