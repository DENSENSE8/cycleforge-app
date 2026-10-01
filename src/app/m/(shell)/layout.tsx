'use client';

import { MobileV2Shell } from '@/components/mobile/v2/MobileV2Shell';
import { CaptureUploadDock } from '@/components/station/capture-upload';

export default function MobileShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MobileV2Shell>{children}</MobileV2Shell>
      {/* Capture-upload status — the completion/failure SoT for background photo uploads (Station law: */}
      <CaptureUploadDock />
    </>
  );
}
