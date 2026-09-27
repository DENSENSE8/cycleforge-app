'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMagneticPull } from '@/design-system/motion/plus';

/**
 * Cancelable window event: the shell's WelcomeHost (every desktop route) calls
 * preventDefault() and replays in place. Unhandled (no host mounted) → reload
 * this page with the `?welcome=1` handoff.
 */
export const WELCOME_REPLAY_EVENT = 'cf:welcome-replay';

/** Share of the pointer offset the button travels toward the cursor. */
const MAGNETIC_PULL = 0.4;

/** Dev-only fixed bottom-right replay button, mounted once by the desktop shell. */
export function WelcomeReplayButton() {
  // Portaled to <body>: #app-root is position:fixed (its own stacking context),
  // so rendered in place the button would sit under the body-portaled overlay.
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  useEffect(() => setPortalEl(document.body), []);
  // The padded zone is the magnetic field; the button leans toward the pointer inside it.
  const zoneRef = useRef<HTMLDivElement>(null);
  const pull = useMagneticPull(zoneRef, MAGNETIC_PULL);
  if (process.env.NODE_ENV === 'production' || !portalEl) return null;
  return createPortal(
    // z-toast (2050) is the first layer above z-splash (2000).
    <div ref={zoneRef} className="fixed bottom-0 right-0 z-toast p-4">
      <motion.div style={{ x: pull.x, y: pull.y }}>
        <Button
          variant="outline"
          size="icon"
          aria-label="Replay welcome animation"
          title="Replay welcome animation"
          onClick={() => {
            const handled = !window.dispatchEvent(new Event(WELCOME_REPLAY_EVENT, { cancelable: true }));
            if (handled) return;
            const url = new URL(window.location.href);
            url.searchParams.set('welcome', '1');
            window.location.assign(url);
          }}
          className="size-8 rounded-full opacity-60 hover:opacity-100 focus-visible:opacity-100 [&_svg]:size-4"
        >
          <RotateCcw />
        </Button>
      </motion.div>
    </div>,
    portalEl,
  );
}
