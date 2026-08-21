'use client';

/**
 * Floating quick-note entry at the absolute bottom of the `/search` rail.
 *
 * **Floating, not docked.** It is absolutely positioned over the rail with a
 * transparent ground — no band, no border, no fill — so the recents list scrolls
 * behind it instead of being cut short by a footer.
 *
 * It posts to the SELECTED record's warehouse thread, which is why it is inert
 * with nothing selected: a note with no anchor has nowhere to go, and silently
 * dropping one would be worse than not offering the field. Same `useThread`
 * post path as the centre `ThreadPanel`, so a note typed here appears there
 * immediately — one thread, two entry points, never two stores.
 *
 * **The composer is {@link ThreadNoteComposer} in its `float` variant**
 * (2026-08-21). This file mounted `OmnichannelComposerDock` raw and hardcoded
 * `visibility: 'internal'` — a one-day-old fork of the component that had just
 * been written to end exactly that. `isOnRecord={false}` is now an explicit
 * declaration on a required prop rather than a literal buried in a mutate call.
 *
 * Team-visibility only. Posting on-record from a rail with no record header in
 * view is too easy to do by accident, so the float renders no toggle — that is
 * the point of the variant, not a stripped fork.
 *
 * **The anchor vocabulary is the SHARED one.** `toDbEntityType` +
 * `isSurfaceEntityType`, never a local map: a hand-written three-key table left
 * `?sel=repair:` and `?sel=fba:` silently inert even though both are real
 * thread anchors. `SKU` is the one selection that stays inert on purpose — it
 * is a `thread_links` discriminator, not an `entity_threads` anchor
 * (`entity_threads_entity_type_chk`), so `POST /api/threads` would 400 on it.
 */

import { useCallback, useMemo, useState } from 'react';
import { ThreadNoteComposer } from '@/components/threads/ThreadNoteComposer';
import { useThread } from '@/hooks/useThread';
import { toDbEntityType } from '@/lib/search/search-hit';
import { isSurfaceEntityType } from '@/lib/surfaces/registry';
import { toast } from '@/lib/toast';
import type { SearchSelection } from '@/lib/search/search-selection';

export function SearchRailQuickNote({ sel }: { sel: SearchSelection | null }) {
  const [body, setBody] = useState('');

  const entityType = useMemo(() => {
    if (!sel) return undefined;
    const dbType = toDbEntityType(sel.entityType);
    return isSurfaceEntityType(dbType) ? dbType : undefined;
  }, [sel]);

  const { postMessage } = useThread(entityType ?? '', entityType ? sel?.id : null);

  const submit = useCallback(() => {
    const text = body.trim();
    if (!text || !entityType) return;
    postMessage.mutate(
      { body: text, visibility: 'internal' },
      {
        onSuccess: () => {
          setBody('');
          toast.success('Note added');
        },
        onError: () => toast.error('Couldn’t add the note — try again.'),
      },
    );
  }, [body, entityType, postMessage]);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-2 pb-2">
      <div className="pointer-events-auto">
        <ThreadNoteComposer
          variant="float"
          value={body}
          onChange={setBody}
          // Fixed, and stated: the float renders no toggle, so this is the
          // whole visibility decision for every note posted from the rail.
          isOnRecord={false}
          onSubmit={submit}
          loading={postMessage.isPending}
          disabled={!entityType}
          placeholder={entityType ? undefined : 'Select a record to note'}
          errorMessage={postMessage.isError ? 'Couldn’t add the note — try again.' : null}
        />
      </div>
    </div>
  );
}
