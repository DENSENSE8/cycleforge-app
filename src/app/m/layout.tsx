'use client';

import { usePathname } from 'next/navigation';
import { PhotoUploadToaster } from '@/components/mobile/receiving/PhotoUploadToaster';
import { WmsRealtimeProvider } from '@/components/mobile/realtime/WmsRealtimeProvider';
import { isClientPublicPath } from '@/contexts/AuthContext';

/**
 * Root mobile layout — shared services only. Tab chrome lives in (shell);
 * fullscreen photo flows live in (immersive).
 */
export default function MobileRootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const content = (
    <>
      {children}
      <PhotoUploadToaster />
    </>
  );
  if (isClientPublicPath(pathname)) return content;
  return (
    <WmsRealtimeProvider>{content}</WmsRealtimeProvider>
  );
}
