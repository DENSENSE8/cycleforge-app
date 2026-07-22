'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { safeChannelName, getStationChannelName } from '@/lib/realtime/channels';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import {
  hydratePendingZohoSyncToasts,
  resolvePendingZohoSync,
  expireStalePendingZohoSync,
} from '@/lib/receiving/zoho-sync-toast-tracker';

type ReceivingLogChangedEvent = {
  data?: {
    rowId?: unknown;
    zohoReceive?: unknown;
  };
};

export function ReceivingZohoSyncToaster() {
  const { user } = useAuth();
  const orgId = user?.organizationId ?? null;
  const channel = orgId ? safeChannelName(() => getStationChannelName(orgId)) : null;

  useEffect(() => {
    if (!orgId) return;
    hydratePendingZohoSyncToasts(orgId);
    expireStalePendingZohoSync();
    const t = window.setInterval(() => expireStalePendingZohoSync(), 15_000);
    return () => window.clearInterval(t);
  }, [orgId]);

  useAblyChannel(
    channel || '',
    'receiving-log.changed',
    (msg: ReceivingLogChangedEvent) => {
      if (!orgId) return;
      const verdict = msg?.data?.zohoReceive;
      if (verdict !== 'ok' && verdict !== 'failed' && verdict !== 'skipped') return;
      const rowId = Number(msg?.data?.rowId);
      if (!Number.isFinite(rowId) || rowId <= 0) return;
      // #region agent log
      fetch('http://127.0.0.1:7336/ingest/8bd437e7-bc3e-4c78-9dcf-4ca4496a96b4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '1348cc' },
        body: JSON.stringify({
          sessionId: '1348cc',
          runId: 'pre-fix',
          hypothesisId: 'F',
          location: 'ReceivingZohoSyncToaster.tsx:zohoReceive',
          message: 'Zoho receive verdict toast only (no rail DONE patch)',
          data: { rowId, verdict },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      resolvePendingZohoSync({ orgId, lineId: rowId, verdict });
    },
    Boolean(orgId) && Boolean(channel),
  );

  return null;
}

