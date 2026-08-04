'use client';

/**
 * AssistantProvider — mounts the global assistant dock on every route
 * (plan §-2.1) and owns its open state + hotkey.
 *
 * Keyboard: cmd/ctrl+J toggles the dock. Opening focuses the chat composer;
 * closing does not. Modifier chord by design: scan-hotkey store owns bare
 * F-keys, CommandBar owns cmd+K.
 *
 * Gated on the signed-in user having the assistant.chat permission; renders
 * children untouched otherwise (public chrome, signed-out, unpermissioned).
 */

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts/AuthContext';
import { GlobalDetailStackHost } from '@/components/detail-stacks/GlobalDetailStackHost';
import { useRegisterRightPanel } from '@/components/right-rail/useRegisterRightPanel';
import { RIGHT_RAIL_PRIORITY } from '@/lib/right-rail/store';
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

const OPEN_KEY = 'assistant:dock-open';

// The dock body (chat UI) is only rendered while the dock is open — split its
// chunk out of the shell bundle so every route stops paying for it up front.
const AssistantDockBody = dynamic(
  () => import('./AssistantDock').then((m) => m.AssistantDockBody),
  { ssr: false },
);

/**
 * Whether the assistant dock is currently open (and permissioned/mounted).
 * `false` outside the provider or for unpermissioned users. StudioShell reads
 * this so it only lets the dock ABSORB the inspector when the dock is actually
 * visible — a closed dock must leave the classic aside/rail in place, else a
 * permissioned user who never opened it would have no inspector at all.
 */
const AssistantDockOpenContext = createContext(false);

export function useAssistantDockOpen(): boolean {
  return useContext(AssistantDockOpenContext);
}

/**
 * Open state + setter for the assistant panel, exposed so the Sparkles entry in
 * GlobalHeaderActions (a provider descendant) can toggle it. `enabled` mirrors
 * the permission gate so the header entry hides entirely for unpermissioned
 * users.
 */
interface AssistantDockControls {
  open: boolean;
  enabled: boolean;
  setOpen: (next: boolean) => void;
  /** Focus the chat composer (caret at end). Safe before the dock has mounted. */
  focusComposer: () => void;
  /**
   * Seed the composer with text from another surface (header search Sparkles).
   * When `autoSend` is true (or omitted and the text looks like an identifier /
   * retrieval question / ticket scan), the dock submits immediately.
   */
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

export function AssistantProvider({ children }: { children: ReactNode }) {
  const { user, has } = useAuth();
  const enabled = !!user && has('assistant.chat');
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(OPEN_KEY) === '1';
      openRef.current = stored;
      setOpen(stored);
    } catch {
      /* storage unavailable — default closed */
    }
  }, []);

  const setAndPersist = useCallback((next: boolean) => {
    // Yield Unbox peers BEFORE mounting the assistant occupant. Opening the
    // dock and clearing `?claimView=` in the same turn lets the App Router
    // replay the claim-bearing URL after RightRailHost registers.
    if (next) dispatchAssistantDockOpen();
    openRef.current = next;
    setOpen(next);
    try {
      window.localStorage.setItem(OPEN_KEY, next ? '1' : '0');
    } catch {
      /* non-fatal */
    }
  }, []);

  // Unbox (and peers) dispatch ASSISTANT_DOCK_CLOSE_EVENT when a station push
  // opens so AI and Ticket cannot both show as full right columns.
  useEffect(() => {
    const handler = () => setAndPersist(false);
    window.addEventListener(ASSISTANT_DOCK_CLOSE_EVENT, handler);
    return () => window.removeEventListener(ASSISTANT_DOCK_CLOSE_EVENT, handler);
  }, [setAndPersist]);

  const focusComposer = useCallback(() => {
    requestComposerFocus();
  }, []);

  const seedComposer = useCallback(
    (text: string, opts?: { autoSend?: boolean }) => {
      const trimmed = text.trim();
      if (!trimmed) {
        focusComposer();
        return;
      }
      const autoSend =
        opts?.autoSend ??
        (looksLikeIdentifier(trimmed) ||
          looksLikeTicketScan(trimmed) ||
          looksLikeRetrievalQuestion(trimmed));
      requestComposerSeed({ text: trimmed, autoSend });
      focusComposer();
    },
    [focusComposer],
  );

  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'j') return;
      e.preventDefault();
      const next = !open;
      setAndPersist(next);
      if (next) focusComposer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, open, setAndPersist, focusComposer]);

  const closeDock = useCallback(() => setAndPersist(false), [setAndPersist]);

  const controls = useMemo<AssistantDockControls>(
    () => ({ open, enabled, setOpen: setAndPersist, focusComposer, seedComposer }),
    [open, enabled, setAndPersist, focusComposer, seedComposer],
  );

  return (
    <AssistantDockControlsContext.Provider value={controls}>
      <AssistantDockOpenContext.Provider value={enabled && open}>
        {children}
        {/* `RightRailHost` moved into `ResponsiveLayout`. It has to be an in-flow
            flex sibling of the content row to PUSH the work surface, and from
            here its DOM parent is `#app-root` — a `flex-col` — where dropping
            `position: fixed` would stack it below the entire app. The
            always-mounted guarantee is unchanged: `ResponsiveLayout` wraps every
            route and is equally permission-independent. */}
        <GlobalDetailStackHost />
        {enabled ? (
          <>
            <AssistantRailRegistrant open={open} onClose={closeDock} />
            <Suspense fallback={null}>
              <DetailStackHistoryTracker />
            </Suspense>
          </>
        ) : null}
      </AssistantDockOpenContext.Provider>
    </AssistantDockControlsContext.Provider>
  );
}

/**
 * Registers the assistant body as the `assistant` occupant of the right rail
 * while the dock is open. Rendering the body up through the store (not here)
 * keeps it mounted under the single RightRailHost, so its chat/draft/scroll
 * state lives in one place.
 */
function AssistantRailRegistrant({ open, onClose }: { open: boolean; onClose: () => void }) {
  useRegisterRightPanel({
    id: 'assistant',
    priority: RIGHT_RAIL_PRIORITY.assistant,
    node: <AssistantDockBody onClose={onClose} />,
    onClose,
    // Ambient chat with its own flush-right dock geometry (no inset card, full
    // height under the header), opened by ⌘J rather than by picking a record.
    // The push grammar is for a picked record's inspector; this is not one.
    // **Kept push:false (2026-08-03 flush follow-up decline):** flipping to true
    // would route AI through `resolveRightRailFrame` + inset-card push chrome and
    // fight `assistantDockAsideStyle` (fixed full-height dock). Mutual yield with
    // Unbox Ticket/Claim/Displays/tool already enforces one right details column.
    push: false,
    enabled: open,
  });
  return null;
}
