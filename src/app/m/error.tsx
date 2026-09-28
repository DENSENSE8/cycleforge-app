'use client';

/** Error boundary for every /m/* route. */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/design-system/primitives';

export default function MobileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // Surface the true cause in the device console / logs instead of swallowing
    // it behind a blank screen.
    console.error('[m/error] uncaught mobile render error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-canvas px-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <p className="text-role-micro text-rose-500">
          Something broke
        </p>
        <h1 className="text-lg font-semibold text-text-default">This screen hit an error</h1>
        <p className="max-w-xs text-role-caption font-semibold text-text-soft">
          {error?.message || 'Unexpected error.'}
        </p>
      </div>
      <div className="grid w-full max-w-xs grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => reset()} className="h-12 w-full">
          Try again
        </Button>
        <Button variant="primary" onClick={() => router.push('/m/home')} className="h-12 w-full">
          Back to Daily
        </Button>
      </div>
    </div>
  );
}
