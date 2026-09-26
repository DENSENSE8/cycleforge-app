'use client';

/** Issue→fix→toast subscriber (ALP-5.4). */

import { useCallback } from 'react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { getInboxChannelName, safeChannelName } from '@/lib/realtime/channels';

/** Locked copy — do not edit (master plan §0, resolution toast). */
export const ISSUE_RESOLVED_TOAST_COPY =
  'The bug you reported has been fixed! Refresh the page to load the latest version.';

export function UserIssueResolvedToaster() {
  const { user } = useAuth();
  const channel = safeChannelName(() =>
    user ? getInboxChannelName(user.organizationId, user.staffId) : '',
  );

  const onResolved = useCallback((message: { data?: { title?: string } }) => {
    const title = message?.data?.title;
    toast.success(ISSUE_RESOLVED_TOAST_COPY, {
      description: title ? `Fixed: ${title}` : undefined,
      duration: 12_000,
    });
  }, []);

  useAblyChannel(channel, 'issue.resolved', onResolved, !!channel);
  return null;
}
