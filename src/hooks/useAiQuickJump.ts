'use client';

/**
 * useAiQuickJump — flag-aware, debounced AI retrieval for workbench search
 * inputs (AI search Phase 2, plan §8.1 "page-level AI search bars").
 *
 * A workbench keeps its own table/list query untouched; this hook rides
 * alongside the same input value and surfaces cross-entity SearchHit rows as
 * a quick-jump list (rendered by AiQuickJumpResults). Everything degrades to
 * nothing: flag off / no permission / endpoint failure → `hits` stays empty
 * and the host surface is byte-identical to the pre-AI experience.
 *
 * Same latency discipline as CommandBar: 250ms debounce, abort-on-retype,
 * 2-char minimum, identifier queries allowed (the server's exact bypass is
 * the fast path for them).
 */

import { useEffect, useRef, useState } from 'react';
import {
  fetchAiSearchEnabled,
  postAiRetrieve,
  type AiSearchHit,
} from '@/lib/search/ai-search-client';

export interface UseAiQuickJumpOpts {
  /** Hard scope for the surface (e.g. ['ORDER'] on the shipped table). */
  entityTypes?: string[];
  /** Soft page-context boost — usually the current pathname. */
  pageContext?: string;
  limit?: number;
  /** Extra gate (e.g. only while the search input is focused/open). */
  enabled?: boolean;
}

export interface UseAiQuickJumpResult {
  /** False until the rollout flag resolves true — hosts render nothing. */
  aiEnabled: boolean;
  hits: AiSearchHit[];
  searching: boolean;
  /**
   * What the retrieve is doing RIGHT NOW, so the dropdown can narrate it
   * instead of painting an opaque skeleton:
   *   idle       — nothing in flight
   *   debouncing — holding for the 250ms keystroke settle
   *   retrieving — POST /api/ai/retrieve is open
   */
  phase: QuickJumpPhase;
}

type QuickJumpPhase = 'idle' | 'debouncing' | 'retrieving';

/**
 * The ONLY debounce between a keystroke and the retrieve POST. The header
 * field feeds `query` immediately (`debounceMs={0}`) precisely so this is the
 * single wait — the two used to stack into ~570ms of dead time before the
 * request even opened.
 */
const RETRIEVE_DEBOUNCE_MS = 180;

export function useAiQuickJump(
  query: string,
  opts: UseAiQuickJumpOpts = {},
): UseAiQuickJumpResult {
  const { entityTypes, pageContext, limit = 6, enabled = true } = opts;
  const [aiEnabled, setAiEnabled] = useState(false);
  const [hits, setHits] = useState<AiSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [phase, setPhase] = useState<QuickJumpPhase>('idle');
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  // Stable key for array deps without re-running on identity churn.
  const entityTypesKey = (entityTypes ?? []).join(',');

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetchAiSearchEnabled().then((on) => {
      if (alive) setAiEnabled(on);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);

  useEffect(() => {
    const q = query.trim();
    if (!aiEnabled || !enabled || q.length < 2) {
      // Abort any in-flight request — without this, a response landing after
      // the input was cleared would repopulate hits for an empty box.
      abortRef.current?.abort();
      setHits([]);
      setSearching(false);
      setPhase('idle');
      return;
    }
    // Clear stale hits immediately on retype so Enter / handoff cannot use a
    // previous query's ORDER id while the new retrieve is still in flight.
    abortRef.current?.abort();
    setHits([]);
    setSearching(true);
    setPhase('debouncing');
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPhase('retrieving');
      try {
        const result = await postAiRetrieve(q, {
          entityTypes: entityTypesKey ? entityTypesKey.split(',') : undefined,
          pageContext,
          limit,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setHits(result.ok ? (result.data.hits ?? []) : []);
          setSearching(false);
          setPhase('idle');
        }
      } catch {
        // AbortError — a newer request owns the state now.
      }
    }, RETRIEVE_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [query, aiEnabled, enabled, entityTypesKey, pageContext, limit]);

  // Unmount: kill any in-flight request outright.
  useEffect(() => () => abortRef.current?.abort(), []);

  return { aiEnabled, hits, searching, phase };
}
