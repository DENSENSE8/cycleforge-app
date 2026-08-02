'use client';

import React, { useEffect, useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from '@/design-system/motion';
import { Button } from '@/design-system/primitives';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const presence = useMotionPresence(framerPresence.collapseHeight);
  const transition = useMotionTransition(framerTransition.upNextCollapse);

  useEffect(() => {
    // Initial state
    setIsOffline(!navigator.onLine);

    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          key="offline-banner"
          {...presence}
          transition={transition}
          className="overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-2.5 bg-navy-900 text-white">
            <div className="flex items-center gap-2">
              <WifiOff size={14} className="shrink-0 text-navy-200" />
              <span className="text-role-micro tracking-[0.12em] uppercase font-sans text-navy-100">
                Working offline — scans will sync when reconnected
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw size={12} />}
              onClick={() => window.location.reload()}
              ariaLabel="Retry connection"
              className="h-auto gap-1 px-0 py-0 font-sans text-role-micro uppercase tracking-wide text-navy-300 hover:bg-transparent hover:text-white touch-manipulation"
            >
              Retry
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
