'use client';

/**
 * AssistantProvider — ⌘J / header Sparkles toggle Ask on the ONE
 * {@link StationComposerHost}. No FAB, no popover, no second dock.
 */

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { GlobalDetailStackHost } from '@/components/detail-stacks/GlobalDetailStackHost';
import {
  ASSISTANT_DOCK_CLOSE_EVENT,
  dispatchAssistantDockOpen,
} from '@/utils/events';
import { DetailStackHistoryTracker } from './DetailStackHistoryTracker';
import { requestComposerFocus } from '@/lib/assistant/composer-focus-store';
import { requestComposerSeed } from '@/lib/assistant/composer-seed-store';
import { looksLikeIdentifier } from '@/lib/search/search-hit';
import { looksLikeRetrievalQuestion } from '@/lib/ai/retrieval-question';
import { looksLikeTicketScan } from '@/lib/support/ticket-scan';
import {
  COMPOSER_ASK_EVENT,
  dispatchComposerAskMode,
  isComposerAskLatched,
  readStationComposerModeSession,
  STATION_COMPOSER_MODE_DEFAULT,
  type StationComposerMode,
} from '@/lib/composer/station-composer-mode';

const AssistantDockOpenContext = createContext(false);

export function useAssistantDockOpen(): boolean {
  return useContext(AssistantDockOpenContext);
}

interface AssistantDockControls {
  open: boolean;
  enabled: boolean;
  setOpen: (next: boolean) => void;
  focusComposer: () => void;
  seedComposer: (text: string, opts?: { autoSend?: boolean }) => void;
}

const AssistantDockControlsContext = createContext<AssistantDockControls>({
  open: false,
  enabled: false,
  setOpen: () => {},
  focusComposer: () => {},
  seedComposer: () => {},
});

export function useAssistantDockControls(): AssistantDockControls {
  return useContext(AssistantDockControlsContext);
}

function readAskOpen(): boolean {
  return isComposerAskLatched(readStationComposerModeSession());
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const { user, has } = useAuth();
  const enabled = !!user && has('assistant.chat');
  const [askOpen, setAskOpen] = useState(false);

  useEffect(() => {
    setAskOpen(readAskOpen());
    const onAsk = (event: Event) => {
      const next = (event as CustomEvent<{ mode?: StationComposerMode | 'ask' }>)
        .detail?.mode;
      setAskOpen(next === 'ask');
    };
    window.addEventListener(COMPOSER_ASK_EVENT, onAsk);
    return () => window.removeEventListener(COMPOSER_ASK_EVENT, onAsk);
  }, []);

  const setOpen = useCallback((next: boolean) => {
    const current = readAskOpen();
    if (next) {
      dispatchAssistantDockOpen();
      if (!current) dispatchComposerAskMode('ask');
      requestComposerFocus();
      setAskOpen(true);
      return;
    }
    if (current) dispatchComposerAskMode(STATION_COMPOSER_MODE_DEFAULT);
    setAskOpen(false);
  }, []);

  useEffect(() => {
    const handler = () => {
      if (readAskOpen()) dispatchComposerAskMode(STATION_COMPOSER_MODE_DEFAULT);
      setAskOpen(false);
    };
    window.addEventListener(ASSISTANT_DOCK_CLOSE_EVENT, handler);
    return () => window.removeEventListener(ASSISTANT_DOCK_CLOSE_EVENT, handler);
  }, []);

  const focusComposer = useCallback(() => {
    requestComposerFocus();
  }, []);

  const seedComposer = useCallback(
    (text: string, opts?: { autoSend?: boolean }) => {
      const trimmed = text.trim();
      if (!trimmed) {
        setOpen(true);
        return;
      }
      const autoSend =
        opts?.autoSend ??
        (looksLikeIdentifier(trimmed) ||
          looksLikeTicketScan(trimmed) ||
          looksLikeRetrievalQuestion(trimmed));
      requestComposerSeed({ text: trimmed, autoSend });
      setOpen(true);
    },
    [setOpen],
  );

  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'j') return;
      e.preventDefault();
      setOpen(!askOpen);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, askOpen, setOpen]);

  const controls = useMemo<AssistantDockControls>(
    () => ({ open: askOpen, enabled, setOpen, focusComposer, seedComposer }),
    [askOpen, enabled, setOpen, focusComposer, seedComposer],
  );

  return (
    <AssistantDockControlsContext.Provider value={controls}>
      <AssistantDockOpenContext.Provider value={enabled && askOpen}>
        {children}
        <GlobalDetailStackHost />
        {enabled ? (
          <Suspense fallback={null}>
            <DetailStackHistoryTracker />
          </Suspense>
        ) : null}
      </AssistantDockOpenContext.Provider>
    </AssistantDockControlsContext.Provider>
  );
}
