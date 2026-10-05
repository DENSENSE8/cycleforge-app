'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check } from '@/components/Icons';
import { MobileV2ScanInput } from '@/components/mobile/v2/scan/MobileV2ScanInput';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/design-system/primitives';
import { publishPrepackSerialSelected } from '@/lib/realtime/prepack-serial-request';

/**
 * The phone's half of a desk serial request: it sends one or more serials back
 * to the request id. The desk validates each serial, so this screen never
 * writes a unit.
 */
function HandoffFrame({
  title,
  help,
  children,
  sent,
}: {
  title: string;
  help: string;
  children: React.ReactNode;
  sent: string | null;
}) {
  const router = useRouter();
  return (
    <main className="flex min-h-full flex-col bg-mode-panel" data-testid="prepack-handoff">
      <header className="space-y-1 px-mode-page pb-2 pt-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="lg"
            icon={<ArrowLeft />}
            ariaLabel="Back"
            className="min-h-11 w-11 shrink-0 px-0"
            onClick={() => router.back()}
          />
          <h1 className="min-w-0 flex-1 break-words text-role-title font-semibold text-mode-ink">{title}</h1>
        </div>
        <p className="break-words pl-12 text-role-caption text-text-muted">{help}</p>
      </header>
      {sent ? (
        <p role="status" className="flex items-center gap-2 border-y border-emerald-200 bg-emerald-50 px-mode-page py-3 text-role-caption font-semibold text-emerald-800">
          <Check className="size-4 shrink-0" />
          {sent}
        </p>
      ) : null}
      <section className="space-y-4 px-mode-page py-4">{children}</section>
    </main>
  );
}

export function PrepackSerialHandoff({ requestId }: { requestId: string }) {
  const { user } = useAuth();
  const { getClient } = useAblyClient();
  const [busy, setBusy] = useState(false);
  const [sentSerials, setSentSerials] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const send = async (serial: string) => {
    setBusy(true);
    setError(null);
    try {
      await publishPrepackSerialSelected(await getClient(), user?.organizationId, user?.staffId ?? 0, requestId, serial);
      setSentSerials((current) => [...current, serial]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the serial to the desk — scan it again.');
    } finally {
      setBusy(false);
    }
  };

  const last = sentSerials[sentSerials.length - 1];
  return (
    <HandoffFrame
      title="Scan for the desk"
      help="Scan every serial in the package, one after another. The desk adds each one and checks it."
      sent={last ? `${last} sent to the desk${sentSerials.length > 1 ? ` · ${sentSerials.length} serials sent` : ''}. Scan the next one, or tap Done on the desk.` : null}
    >
      <MobileV2ScanInput onDecode={(value) => void send(value)} placeholder="Scan serial or unit label" autoFocus prominentCamera isResolving={busy} />
      {error ? <p role="alert" className="text-role-caption font-semibold text-text-danger">{error}</p> : null}
    </HandoffFrame>
  );
}
