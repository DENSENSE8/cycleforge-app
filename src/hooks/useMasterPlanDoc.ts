'use client';

/** Live master-plan doc on the client (ALP-3.2). */

import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyClient } from '@/contexts/AblyContext';
import { getMasterPlanChannel, safeChannelName } from '@/lib/realtime/channels';
import { createMasterPlanYDoc, readMasterPlan } from '@/lib/master-plan/doc';
import { MasterPlanAblyProvider, base64ToU8 } from '@/lib/master-plan/ably-yjs-provider';

export type MasterPlanDocStatus = 'idle' | 'connecting' | 'live' | 'error';

export interface MasterPlanDocState {
  mdx: string;
  status: MasterPlanDocStatus;
  error: string | null;
  /** Staff holds operations.plans.manage → full CRDT peer (publish). */
  canEdit: boolean;
  /** Staff holds operations.plans.view → may see the plan at all. */
  canView: boolean;
}

export function useMasterPlanDoc(): MasterPlanDocState {
  const { user, has } = useAuth();
  const { getClient } = useAblyClient();
  const [mdx, setMdx] = useState('');
  const [status, setStatus] = useState<MasterPlanDocStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const canView = !!user && has('operations.plans.view');
  const canEdit = !!user && has('operations.plans.manage');
  const orgId = user?.organizationId ?? '';
  const channelName = safeChannelName(() => (orgId ? getMasterPlanChannel(orgId) : ''));

  // The doc/provider live for the lifetime of the page; state updates flow out.
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!canView || !channelName) return;
    let alive = true;
    setStatus('connecting');
    setError(null);

    const doc = createMasterPlanYDoc();
    let provider: MasterPlanAblyProvider | null = null;
    let connection: { on: (e: string, cb: () => void) => void; off: (e: string, cb: () => void) => void } | null = null;

    const onDocChange = () => {
      if (alive) setMdx(readMasterPlan(doc));
    };
    doc.on('update', onDocChange);

    // Canonical bootstrap — apply the server snapshot with the PROVIDER as
    // origin so it is NOT re-broadcast (a foreign origin would make every
    // page load re-publish the entire doc to the org channel).
    const bootstrap = async () => {
      const res = await fetch('/api/forge/master-plan', { cache: 'no-store' });
      const body = (await res.json().catch(() => null)) as { success?: boolean; update?: string; error?: string } | null;
      if (!alive) return;
      if (body?.success && body.update) {
        Y.applyUpdate(doc, base64ToU8(body.update), provider ?? 'bootstrap');
        setMdx(readMasterPlan(doc));
        setStatus('live');
      } else {
        setStatus('error');
        setError(body?.error ?? `Bootstrap failed (${res.status})`);
      }
    };

    const onReconnect = () => {
      // After a dropped connection an editor re-asks peers for missed state;
      // a read-only viewer (no publish capability, so no sync request) instead
      // re-bootstraps from the server snapshot so it can't wedge on stale text.
      if (!alive) return;
      if (provider && !provider.readOnly) provider.requestSync().catch(() => {});
      else void bootstrap().catch(() => {});
    };

    (async () => {
      const client = await getClient();
      if (!client || !alive) {
        if (alive) {
          setStatus('error');
          setError('Realtime connection unavailable');
        }
        return;
      }
      const channel = client.channels.get(channelName);
      provider = new MasterPlanAblyProvider(doc, channel, { readOnly: !canEdit });
      await provider.connect();
      connection = client.connection;
      connection?.on('connected', onReconnect);
      await bootstrap();
    })().catch((err) => {
      if (alive) {
        setStatus('error');
        setError(err instanceof Error ? err.message : String(err));
      }
    });

    cleanupRef.current = () => {
      alive = false;
      connection?.off('connected', onReconnect);
      doc.off('update', onDocChange);
      provider?.destroy();
      doc.destroy();
    };
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [canView, canEdit, channelName, getClient]);

  return { mdx, status, error, canEdit, canView };
}
