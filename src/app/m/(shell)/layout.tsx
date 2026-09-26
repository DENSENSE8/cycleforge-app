'use client';

import { RedesignedMobileShell } from '@/components/mobile/redesign/MobileShell';
import { CaptureUploadDock } from '@/components/station/capture-upload';

export default function MobileShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RedesignedMobileShell>{children}</RedesignedMobileShell>
      {/* Capture-upload status — the completion/failure SoT for background photo uploads (Station law: */}
      <CaptureUploadDock />
    </>
  );
}
