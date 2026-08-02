'use client';

import { RedesignedMobileShell } from '@/components/mobile/redesign/MobileShell';
import { CaptureUploadDock } from '@/components/station/capture-upload';

export default function MobileShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RedesignedMobileShell>{children}</RedesignedMobileShell>
      {/*
        Capture-upload status — the completion/failure SoT for background photo
        uploads (Station law: a card, not a toast). Mounted here rather than in
        `m/layout.tsx` because every capture studio's `returnHref` lands in this
        group, while the sibling `(immersive)` group IS the fullscreen camera —
        a dock over a live viewfinder would cover the frame being composed.
      */}
      <CaptureUploadDock />
    </>
  );
}
