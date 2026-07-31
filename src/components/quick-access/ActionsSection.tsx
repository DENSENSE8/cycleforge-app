'use client';

import { MessageSquare, Monitor, Smartphone } from '@/components/Icons';
import { Row } from './Row';
import type { ActionToggles } from '@/lib/quick-access/types';
import { useAuth } from '@/contexts/AuthContext';
import { openKioskShellPreview } from '@/lib/kiosk/preview-url';

interface ActionsSectionProps {
  actions: ActionToggles;
  onOpenHistoryPopover: () => void;
  /** Opens the report-an-issue feedback popover. */
  onOpenFeedbackPopover?: () => void;
  /** Close the parent quick-access popover after navigating away. */
  onClose?: () => void;
}

/**
 * Secondary quick actions — kept minimal. Navigation lives in Pinned/Recent;
 * system tools (sync, warranty) live in their own surfaces.
 */
export function ActionsSection({
  actions,
  onOpenHistoryPopover,
  onOpenFeedbackPopover,
  onClose,
}: ActionsSectionProps) {
  const { user } = useAuth();
  const showPhoneHistory = !!actions.phoneHistory;
  const showFeedback = !!onOpenFeedbackPopover;

  return (
    <div className="px-2 py-1">
      <div className="space-y-0.5">
        <Row
          icon={<Monitor className="h-3.5 w-3.5" />}
          label="Kiosk shell preview"
          subLabel="Landscape /kiosk/v2"
          onClick={() => {
            openKioskShellPreview(user?.organizationSlug);
            onClose?.();
          }}
        />
        {showPhoneHistory ? (
          <Row
            icon={<Smartphone className="h-3.5 w-3.5" />}
            label="Phone history"
            onClick={onOpenHistoryPopover}
          />
        ) : null}
        {showFeedback ? (
          <Row
            icon={<MessageSquare className="h-3.5 w-3.5" />}
            label="Report an issue"
            onClick={onOpenFeedbackPopover}
          />
        ) : null}
      </div>
    </div>
  );
}
