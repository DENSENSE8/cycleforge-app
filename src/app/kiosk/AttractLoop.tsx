'use client';

import { useEffect, useState } from 'react';

export function AttractLoop({
  mediaUrl,
  brandName,
  logoUrl,
  onWake,
}: {
  mediaUrl: string | null;
  brandName?: string | null;
  logoUrl?: string | null;
  onWake: () => void;
}) {
  const isVideo = Boolean(mediaUrl?.match(/\.(mp4|webm|ogg)$/i));
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const showVideo = isVideo && mediaUrl && !reducedMotion;

  return (
    <div
      role="button"
      tabIndex={0}
      className="fixed inset-0 z-panel flex cursor-pointer flex-col items-center justify-center bg-surface-inverse"
      onClick={onWake}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onWake();
        }
      }}
    >
      {showVideo ? (
        <video
          src={mediaUrl}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover opacity-80"
        />
      ) : mediaUrl && !isVideo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-80"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-surface-inverse px-8">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="max-h-24 max-w-xs object-contain" />
          ) : null}
          <p className="text-center text-3xl font-semibold tracking-tight text-white">
            {brandName?.trim() || 'Welcome'}
          </p>
        </div>
      )}

      <div
        className={cnTapOverlay(reducedMotion)}
      >
        <p className="text-2xl font-medium tracking-wide text-white">Tap anywhere to start</p>
      </div>
    </div>
  );
}

function cnTapOverlay(reducedMotion: boolean): string {
  return [
    'z-10 mb-24 mt-auto rounded-full bg-scrim/40 px-8 py-4 backdrop-blur-md',
    reducedMotion ? '' : 'animate-pulse',
  ]
    .filter(Boolean)
    .join(' ');
}
