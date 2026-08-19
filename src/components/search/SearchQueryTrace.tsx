'use client';

/**
 * SearchQueryTrace — what the find dropdown paints while a query is running.
 *
 * Deliberately NOT a skeleton. Grey placeholder bars imply "rows are about to
 * appear here" and say nothing while a slow retrieve is open; operators asked
 * to see what the system is actually doing. So this states the literal query,
 * how it was classified, which arm is running, and where it is looking.
 *
 * Every line is derived from real state — the phase comes from
 * {@link useAiQuickJump}, never a timed fake.
 */

import { Search, Check } from '@/components/Icons';
import { cn } from '@/utils/_cn';

export type SearchTracePhase = 'idle' | 'debouncing' | 'retrieving';

interface SearchQueryTraceProps {
  query: string;
  phase: SearchTracePhase;
  /** Retrieval arm actually in use — the AI retrieve or the classic fallback. */
  arm: 'ai' | 'classic';
  /** True when the query is identifier-shaped (order # / tracking / serial). */
  identifier: boolean;
  /** Route the retrieve is given as page context, when any. */
  pageContext?: string | null;
}

/**
 * Pathname → the surface name an operator would say out loud (`/unbox` →
 * `Unbox`, `/receiving/history` → `Receiving`). The trace names the surface
 * only; the arm and the identifier/NL classification are implementation
 * detail that read as noise above the steps.
 */
function surfaceLabel(pageContext: string | null | undefined): string | null {
  const segment = (pageContext ?? '').split('?')[0].split('/').filter(Boolean)[0];
  if (!segment) return null;
  return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
}

const LABEL = 'text-role-micro uppercase tracking-widest text-text-faint';
const VALUE = 'text-role-caption text-text-default';

/** One step in the trace — done steps tick, the live step pulses. */
function Step({ state, children }: { state: 'done' | 'live'; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      {state === 'done' ? (
        <Check className="h-3 w-3 shrink-0 text-emerald-600" />
      ) : (
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-blue-500" />
      )}
      <span
        className={cn(
          'text-role-caption',
          state === 'done' ? 'text-text-soft' : 'font-semibold text-text-default',
        )}
      >
        {children}
      </span>
    </li>
  );
}

export function SearchQueryTrace({
  query,
  phase,
  arm,
  identifier,
  pageContext,
}: SearchQueryTraceProps) {
  const retrieving = phase === 'retrieving';
  const surface = surfaceLabel(pageContext);

  return (
    <div className="px-3 py-3">
      {/* The literal string being searched — quoted so trailing spaces show. */}
      <div className="flex items-baseline gap-2">
        <Search className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-text-faint" />
        <span className={cn(VALUE, 'min-w-0 break-all font-mono font-semibold')}>
          &ldquo;{query}&rdquo;
        </span>
      </div>

      {surface ? (
        <div className="mt-1 pl-5">
          <span className={LABEL}>{surface}</span>
        </div>
      ) : null}

      <ul className="mt-2.5 space-y-1.5 pl-5">
        <Step state={retrieving ? 'done' : 'live'}>
          {retrieving ? 'Keystrokes settled' : 'Waiting for typing to settle…'}
        </Step>
        {retrieving ? (
          <Step state="live">
            Querying {identifier ? 'exact identifier + fuzzy arms' : 'keyword + semantic arms'}
            {arm === 'classic' ? ' (classic)' : ''}…
          </Step>
        ) : null}
      </ul>
    </div>
  );
}
