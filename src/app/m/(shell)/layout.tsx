'use client';

import { MobileV2Shell } from '@/components/mobile/v2/MobileV2Shell';
import { CaptureUploadDock } from '@/components/station/capture-upload';
import { useWarmCameraOwner } from '@/hooks/useBarcodeScanner';

export default function MobileShellLayout({ children }: { children: React.ReactNode }) {
  // The shell owns the warm lens: capture windows park it between screens
  // (scan → location → scan) and leaving /m releases it.
  useWarmCameraOwner();
  return (
    <>
      <MobileV2Shell>{children}</MobileV2Shell>
      {/* Capture-upload status — the completion/failure SoT for background photo uploads (Station law: */}
      <CaptureUploadDock />
    </>
  );
}
