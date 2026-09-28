'use client';

/** Turn one capability on / off from Settings — POST /api/capabilities, then repaint the page and the sidebar. */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/design-system/primitives';
import { invalidateCapabilityQueries } from '@/hooks/useOrgCapabilities';

export function CapabilitySwitch({ capabilityId, on }: { capabilityId: string; on: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant={on ? 'secondary' : 'brand'}
        disabled={busy}
        data-capability-switch={on ? 'off' : 'on'}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch('/api/capabilities', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ capabilityId, enable: !on }),
          }).catch(() => null);
          setBusy(false);
          if (!res?.ok) {
            setError('Could not change it — try again.');
            return;
          }
          invalidateCapabilityQueries(queryClient);
          router.refresh();
        }}
      >
        {on ? 'Turn off' : 'Turn on'}
      </Button>
      {error ? <span className="text-role-micro text-text-danger">{error}</span> : null}
    </div>
  );
}
