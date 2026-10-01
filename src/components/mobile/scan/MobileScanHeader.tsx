'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { X } from '@/components/Icons';
import { MobileV2AppSwitcher } from '@/components/mobile/v2/MobileV2AppSwitcher';
import { IdentifierToggle } from '@/components/ui/IdentifierToggle';
import { IconButton } from '@/design-system/primitives';
import { previousMobilePath } from '@/lib/mobile/nav-trail';

export type MobileScanMode = 'view' | 'operate';

/** Scan owns this bar. The app shell must never paint a second scan button. */
export function MobileScanHeader({
  title,
  mode,
  onModeChange,
  operationLocked = false,
  exitHref,
}: {
  title: string;
  mode: MobileScanMode;
  onModeChange: (mode: MobileScanMode) => void;
  operationLocked?: boolean;
  /** A contextual scan is a temporary full-screen task, so it closes with X. */
  exitHref?: string | null;
}) {
  const router = useRouter();
  const close = useCallback(() => {
    if (!exitHref) return;
    if (previousMobilePath() === exitHref.split(/[?#]/)[0]) router.back();
    else router.replace(exitHref);
  }, [exitHref, router]);

  return (
    <header
      className="sticky top-0 z-header flex h-14 shrink-0 items-center gap-2 border-b border-border-soft bg-surface-card/95 pr-2 backdrop-blur-xl"
      data-testid="mobile-v2-scan-header"
    >
      {exitHref ? (
        <IconButton
          size="touch"
          radius="surface"
          ariaLabel="Close scanner"
          icon={<X className="h-5 w-5" />}
          onClick={close}
          className="m-1 text-text-default"
        />
      ) : (
        <MobileV2AppSwitcher />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-text-default">{title}</p>
      </div>

      {operationLocked ? (
        <span className="rounded-mode-pill bg-surface-sunken px-2.5 py-1 text-role-caption font-semibold text-text-muted">
          Operate
        </span>
      ) : (
        <IdentifierToggle
          value={mode}
          onChange={onModeChange}
          ariaLabel="Scan behavior"
          options={[
            { value: 'view', label: 'View' },
            { value: 'operate', label: 'Operate' },
          ]}
        />
      )}
    </header>
  );
}
