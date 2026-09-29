'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MagneticActionField } from '@/design-system/motion';
import { WELCOME_REPLAY_EVENT } from '@/components/boot/welcome/welcome-events';
import {
  DEFAULT_WELCOME_VARIANT,
  WELCOME_VARIANTS,
  WELCOME_VARIANT_STORAGE_KEY,
  resolveWelcomeVariant,
  type WelcomeVariant,
} from '@/components/boot/welcome/welcome-variant';

/** Share of the pointer offset the button travels toward the cursor. */
const MAGNETIC_PULL = 0.4;

/** Dev-only fixed bottom-right replay button, mounted once by the desktop shell. */
export function WelcomeReplayButton() {
  // Portaled to <body>: #app-root is position:fixed (its own stacking context),
  // so rendered in place the button would sit under the body-portaled overlay.
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const [variant, setVariant] = useState<WelcomeVariant>(DEFAULT_WELCOME_VARIANT);
  useEffect(() => {
    setPortalEl(document.body);
    setVariant(
      resolveWelcomeVariant(
        window.location.search,
        window.localStorage.getItem(WELCOME_VARIANT_STORAGE_KEY),
        true,
      ).variant,
    );
  }, []);
  if (process.env.NODE_ENV === 'production' || !portalEl) return null;
  return createPortal(
    // z-toast (2050) is the first layer above z-splash (2000).
    <MagneticActionField
      pull={MAGNETIC_PULL}
      maxOffset={20}
      fieldClassName="fixed bottom-0 right-0 z-toast p-4"
      contentClassName="flex items-center gap-1.5"
    >
      <Button
        variant="outline"
        size="sm"
        aria-label={`Welcome variant: ${variant}. Switch and replay`}
        title={`Switch ${variant} welcome and replay`}
        onClick={() => {
          const index = WELCOME_VARIANTS.indexOf(variant);
          const next = WELCOME_VARIANTS[(index + 1) % WELCOME_VARIANTS.length];
          window.localStorage.setItem(WELCOME_VARIANT_STORAGE_KEY, next);
          setVariant(next);
          const handled = !window.dispatchEvent(new Event(WELCOME_REPLAY_EVENT, { cancelable: true }));
          if (handled) return;
          const url = new URL(window.location.href);
          url.searchParams.set('welcome', '1');
          url.searchParams.set('welcomeVariant', next);
          window.location.assign(url);
        }}
        className="h-8 rounded-full px-2 text-role-caption opacity-60 hover:opacity-100 focus-visible:opacity-100"
      >
        {variant[0]}
      </Button>
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
    </MagneticActionField>,
    portalEl,
  );
}
