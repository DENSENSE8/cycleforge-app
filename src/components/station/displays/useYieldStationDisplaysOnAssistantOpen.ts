'use client';

/** Station AI yield — when the header assistant opens, close Displays. */

import { useEffect, useRef } from 'react';
import { useAssistantDockOpen } from '@/components/assistant/AssistantProvider';
import { ASSISTANT_DOCK_OPEN_EVENT } from '@/utils/events';

export function useYieldStationDisplaysOnAssistantOpen(
  closeDisplays: () => void,
): void {
  const closeRef = useRef(closeDisplays);
  closeRef.current = closeDisplays;

  const assistantOpen = useAssistantDockOpen();
  const prevOpenRef = useRef(false);

  useEffect(() => {
    const onOpen = () => {
      closeRef.current();
    };
    window.addEventListener(ASSISTANT_DOCK_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(ASSISTANT_DOCK_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    const opened = assistantOpen && !prevOpenRef.current;
    prevOpenRef.current = assistantOpen;
    if (!opened) return;
    closeRef.current();
  }, [assistantOpen]);
}
