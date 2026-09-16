'use client';

/**
 * Device-authed PIN step-up for kiosk Pay-at-register.
 *
 * Fetches `/api/kiosk/staff-for-stepup` (not the staff-session picker) and
 * composes `StaffPinPad`. Card data never enters this sheet — PIN only
 * authorizes staging the payment hand-off.
 */

import { useCallback, useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { StaffPinPad } from '@/components/auth/StaffPinPad';
import { Button } from '@/design-system/primitives';
import { StaffAvatar } from '@/components/identity';
import { kioskFetchHealed } from '@/lib/kiosk/kiosk-self-heal';
import { Loader2 } from '@/components/Icons';

type KioskStepUpStaff = {
  id: number;
  name: string;
  role: string;
  color_hex?: string;
  avatar_photo_id?: number | null;
};

export type KioskPaymentStepUpResult = {
  staffId: number;
  pin: string;
};

interface KioskPaymentStepUpSheetProps {
  open: boolean;
  onClose: () => void;
  /**
   * Called after PIN entry. Resolve `{ ok: true }` to close, or
   * `{ ok: false; error }` to keep the pad open with an oracle-safe message.
   */
  onAuthorized: (
    creds: KioskPaymentStepUpResult,
  ) => Promise<{ ok: true } | { ok: false; error?: string }>;
  title?: string;
}

export function KioskPaymentStepUpSheet({
  open,
  onClose,
  onAuthorized,
  title = 'Authorize payment',
}: KioskPaymentStepUpSheetProps) {
  const [staff, setStaff] = useState<KioskStepUpStaff[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<KioskStepUpStaff | null>(null);

  useEffect(() => {
    if (!open) {
      setPicked(null);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setPicked(null);
    void (async () => {
      try {
        const r = await kioskFetchHealed('/api/kiosk/staff-for-stepup', { cache: 'no-store' });
        const body = (await r.json().catch(() => ({}))) as {
          staff?: KioskStepUpStaff[];
          error?: string;
        };
        if (cancelled) return;
        if (!r.ok) {
          setLoadError(
            r.status === 401
              ? 'This tablet needs to be paired before payment can be authorized.'
              : 'Could not load staff for authorization.',
          );
          setStaff([]);
          return;
        }
        setStaff(Array.isArray(body.staff) ? body.staff : []);
        if (!body.staff?.length) {
          setLoadError('No staff with payment permission are available. Ask a manager.');
        }
      } catch {
        if (!cancelled) {
          setLoadError('Network issue while loading staff.');
          setStaff([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const submitPin = useCallback(
    async (pin: string) => {
      if (!picked) return { ok: false as const, error: 'Pick a staff member first.' };
      return onAuthorized({ staffId: picked.id, pin });
    },
    [picked, onAuthorized],
  );

  return (
    <BottomSheet open={open} onClose={onClose} title={picked ? undefined : title} maxWidth="28rem">
      {picked ? (
        <StaffPinPad
          staff={picked}
          onSubmit={submitPin}
          onBack={() => setPicked(null)}
          submitLabel="Authorize"
        />
      ) : (
        <div className="space-y-4">
          <p className="text-center text-role-caption text-text-soft">
            A manager PIN authorizes payment at the register. Card details stay off this tablet.
          </p>
          {loading && (
            <div className="flex justify-center py-8 text-text-soft">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          {loadError && !loading && (
            <div className="rounded-lg bg-surface-danger px-3 py-2 text-center text-xs font-medium text-text-danger">
              {loadError}
            </div>
          )}
          {!loading && !loadError && staff.length > 0 && (
            <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
              {staff.map((s) => (
                <li key={s.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex h-auto w-full items-center gap-3 px-3 py-3 text-left"
                    onClick={() => setPicked(s)}
                  >
                    <StaffAvatar
                      staffId={s.id}
                      name={s.name}
                      colorHex={s.color_hex}
                      avatarPhotoId={s.avatar_photo_id ?? null}
                      size="md"
                      ring={false}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-text-default">{s.name}</span>
                      <span className="block text-role-micro uppercase tracking-widest text-text-soft">
                        {s.role.replace(/_/g, ' ')}
                      </span>
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
