'use client';

/**
 * Unbox Location pill → phone: send a `receiving_location_request` to the
 * staffer's paired phone (waiting / answered / unreachable on the house toast,
 * same handshake as photos), and own the station's bare `L` key that does it.
 */

import { useCallback, useEffect, useId, useRef } from 'react';
import { useSendToDevice } from '@/components/station/send-to-device/useSendToDevice';
import { useSendToDeviceToast } from '@/components/station/send-to-device/useSendToDeviceToast';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAnyOverlayOpen } from '@/design-system/hooks/useOverlayStack';
import { useEditableFocus } from '@/hooks/useEditableFocus';
import { isEditableActiveElement } from '@/lib/keyboard/is-editable-key-target';
import { createScanFieldLetterKey } from '@/lib/keyboard/scan-field-letter-key';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import {
  publishReceivingLocationRequest,
  receivingLocationRequestChannel,
} from '@/lib/realtime/receiving-location-request';
import {
  UNBOX_LOCATION_HOTKEY,
  unboxLocationKeyAwake,
  type UnboxLocationTarget,
} from '@/lib/receiving/unbox-location-handoff';
import { toast } from '@/lib/toast';

export function useLocationScanOnPhone(
  target: UnboxLocationTarget | null,
  /** Bind the bare `L` key (Unbox only). */
  hotkey: boolean,
): {
  send: () => void;
  pending: boolean;
  /** `L` would fire right now — paint the keycap. */
  keyAwake: boolean;
} {
  const { getClient } = useAblyClient();
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const staffId = user?.staffId ?? 0;
  const channelName = receivingLocationRequestChannel(orgId, staffId);

  const phone = useSendToDevice('receiving_location');
  useSendToDeviceToast(phone.state, phone.retry);

  const receivingId = target?.receivingId ?? null;
  const lineId = target?.kind === 'line' ? target.lineId : null;

  const send = useCallback(() => {
    if (receivingId == null || phone.pending) return;
    if (!channelName) {
      toast.error('Sign in on your phone to scan a location');
      return;
    }
    void phone.send({
      channelName,
      // The minted id must reach the wire — the phone echoes it back as the ack.
      publish: async (requestId) => {
        const client = await getClient();
        if (!client) throw new Error('No realtime client');
        await publishReceivingLocationRequest(client, orgId, staffId, { receivingId, lineId, requestId });
      },
    });
  }, [channelName, getClient, lineId, orgId, phone, receivingId, staffId]);

  const editableFocused = useEditableFocus();
  const overlayOpen = useAnyOverlayOpen();
  const keyAwake = hotkey && unboxLocationKeyAwake({ target, editableFocused, overlayOpen });

  const live = useRef({ target, send });
  live.current = { target, send };

  // Bare `L`: the station letter-key law — never in a text field (the scan
  // bar, the composer), held one wedge gap so a scanned code starting with
  // `l` reads whole, and a scanner's capitals never fire it.
  useEffect(() => {
    if (!hotkey) return;
    const key = createScanFieldLetterKey({
      letter: UNBOX_LOCATION_HOTKEY,
      scanField: () => null,
      enabled: () =>
        unboxLocationKeyAwake({
          target: live.current.target,
          editableFocused: isEditableActiveElement(),
          overlayOpen: hasOpenOverlay(),
        }),
      onPress: () => live.current.send(),
      giveBack: () => undefined,
    });
    window.addEventListener('keydown', key.onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', key.onKeyDown, true);
      key.dispose();
    };
  }, [hotkey]);

  const overviewId = useId();
  const listed = hotkey && target != null;
  useEffect(() => {
    if (!listed) return;
    return registerShortcutOverviewGroup({
      id: `unbox-location:${overviewId}`,
      title: 'Unbox',
      rows: [{ keys: [UNBOX_LOCATION_HOTKEY.toUpperCase()], label: 'Scan the location on your phone' }],
    });
  }, [listed, overviewId]);

  return { send, pending: phone.pending, keyAwake };
}
