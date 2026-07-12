'use client';

/**
 * Operations ▸ Signals — the right-pane body for `?mode=signals`.
 *
 * Timeline (default) and Browse are sub-views (`?signalsView=browse`); the
 * sub-view rail AND the in-context `?q=` filter (local SearchBar) live in
 * OperationsSidebarPanel (SignalsSidebar). The global header pill stays global.
 */

import { useSearchParams } from 'next/navigation';
import { SignalsHistoryWorkspace } from './SignalsHistoryWorkspace';
import { SignalsBrowseWorkspace } from './SignalsBrowseWorkspace';
import { parseSignalsView } from './signals-url';

export function SignalsWorkspace() {
  const searchParams = useSearchParams();
  const signalsView = parseSignalsView(searchParams.get('signalsView'));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        {signalsView === 'browse' ? <SignalsBrowseWorkspace /> : <SignalsHistoryWorkspace />}
      </div>
    </div>
  );
}
