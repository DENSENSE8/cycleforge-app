'use client';

/**
 * useCompanionComposerDesk — desk side of the companion composer.
 *
 * Owns three things and nothing else (PLAN-companion-composer):
 *
 *   1. **Presence** — is a phone signed in as this staff ID sitting on the
 *      `staffstation:{staffId}` bridge right now? Painted as "paired".
 *   2. **Handoff** — `sendContext()` pushes the desk's AssistantPageContext to
 *      the phone through the existing send-to-device handshake (ack or
 *      "unreachable" — never a blind "Sent"). While a phone is present the
 *      context is re-pushed on change with a null request id (no ack wanted).
 *   3. **Sink** — `composer_draft` / `composer_submit` from the phone land in
 *      the ONE desk composer through `seedComposer`. The phone is a mirror of
 *      that field, not a second input.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAssistantContext } from '@/hooks/useAssistantContext';
import { useAssistantDockControls } from '@/components/assistant/AssistantProvider';
import { useSendToDevice } from '@/components/station/send-to-device/useSendToDevice';
import { getStaffStationBridgeChannelName, safeChannelName } from '@/lib/realtime/channels';
import {
  COMPANION_DRAFT_EVENT,
  COMPANION_HANDOFF_EVENT,
  COMPANION_SUBMIT_EVENT,
  buildCompanionContext,
  buildCompanionHandoff,
  createCompanionSeqGuard,
  isCompanionPhoneMember,
  parseCompanionDraft,
  parseCompanionSubmit,
} from '@/lib/realtime/companion-composer';
import type { SendToDeviceState } from '@/lib/realtime/device-handshake';

/** Debounce for the "phone is present, context moved" re-push. */
const CONTEXT_REPUSH_MS = 400;

export interface CompanionDeskModel {
  /** False before auth hydrates or when the operator cannot use the assistant. */
  enabled: boolean;
  /** A phone signed in as this staff ID is on the bridge. */
  phonePresent: boolean;
  /** Handshake state of the last explicit send. */
  sendState: SendToDeviceState;
  pending: boolean;
  sendContext: () => Promise<boolean>;
  retry: () => void;
}

export function useCompanionComposerDesk(): CompanionDeskModel {
  const { user } = useAuth();
  const { getClient } = useAblyClient();
  const assistant = useAssistantDockControls();
  const context = useActiveAssistantContext();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const handshake = useSendToDevice('composer_handoff');

  const orgId = user?.organizationId;
  const staffId = user?.staffId ?? 0;
  const channelName =
    staffId > 0 && orgId ? safeChannelName(() => getStaffStationBridgeChannelName(orgId, staffId)) : '';
  const enabled = !!channelName && assistant.enabled;

  const [phonePresent, setPhonePresent] = useState(false);
  const guardRef = useRef(createCompanionSeqGuard());
  const query = searchParams?.toString() ?? '';
  const route = query ? `${pathname}?${query}` : pathname || '/';

  // ── 1. presence ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) {
      setPhonePresent(false);
      return;
    }
    let disposed = false;
    let channel: any = null;
    const refresh = async () => {
      try {
        const members: Array<{ data?: unknown }> = await channel.presence.get();
        if (!disposed) setPhonePresent(members.some(isCompanionPhoneMember));
      } catch {
        /* presence unavailable — stay unpaired, the explicit send still works */
      }
    };
    const onPresence = () => void refresh();
    getClient()
      .then(async (client) => {
        if (disposed || !client) return;
        channel = client.channels.get(channelName);
        await channel.presence.subscribe(onPresence);
        await refresh();
      })
      .catch(() => {});
    return () => {
      disposed = true;
      try {
        channel?.presence?.unsubscribe(onPresence);
      } catch {}
    };
  }, [channelName, enabled, getClient]);

  // A phone that leaves and comes back starts a fresh seq stream.
  useEffect(() => {
    if (!phonePresent) guardRef.current.reset();
  }, [phonePresent]);

  // ── 2. handoff ───────────────────────────────────────────────────────────
  const publishHandoff = useCallback(
    async (requestId: string | null) => {
      const client = await getClient();
      if (!client || !channelName) throw new Error('realtime unavailable');
      const payload = buildCompanionHandoff(buildCompanionContext(context, route), requestId);
      await client.channels.get(channelName).publish(COMPANION_HANDOFF_EVENT, payload);
    },
    [channelName, context, getClient, route],
  );

  const sendContext = useCallback(
    () => handshake.send({ channelName, publish: (requestId) => publishHandoff(requestId) }),
    [channelName, handshake, publishHandoff],
  );

  // Phone present → keep it looking at what the desk looks at. Debounced so a
  // route transition that re-registers context twice publishes once.
  const publishRef = useRef(publishHandoff);
  publishRef.current = publishHandoff;
  useEffect(() => {
    if (!enabled || !phonePresent) return;
    const t = setTimeout(() => {
      publishRef.current(null).catch(() => {});
    }, CONTEXT_REPUSH_MS);
    return () => clearTimeout(t);
    // `route` and `context` are the inputs that should trigger a re-push.
  }, [enabled, phonePresent, route, context]);

  // ── 3. sink ──────────────────────────────────────────────────────────────
  useAblyChannel(
    channelName,
    COMPANION_DRAFT_EVENT,
    (msg: { data?: unknown }) => {
      const draft = parseCompanionDraft(msg?.data);
      if (!draft || !guardRef.current.accept(draft.seq)) return;
      if (!draft.text.trim()) return; // seed bus ignores blanks; the desk keeps its field
      assistant.seedComposer(draft.text, { autoSend: false });
    },
    enabled,
  );

  useAblyChannel(
    channelName,
    COMPANION_SUBMIT_EVENT,
    (msg: { data?: unknown }) => {
      const submit = parseCompanionSubmit(msg?.data);
      if (!submit || !guardRef.current.accept(submit.seq)) return;
      assistant.seedComposer(submit.text, { autoSend: true });
    },
    enabled,
  );

  return {
    enabled,
    phonePresent,
    sendState: handshake.state,
    pending: handshake.pending,
    sendContext,
    retry: handshake.retry,
  };
}
