'use client';

/**
 * useKioskCartSync — writes the tablet's ONE cart to `kiosk_carts` and keeps the
 * Recent carts list. Mounted once, by `KioskShell`.
 *
 * - A cart gets its `#id` the moment it holds something (a line or a customer
 *   field): POST, then `attachCart`.
 * - Every later change is saved ~500ms after the typing stops (PATCH with the
 *   version it expects).
 * - 409 = another tablet opened this cart since (single writer, see
 *   `kiosk-carts.server`): say so and start a fresh cart — the lines now live
 *   on the other device.
 * - The store announces how a cart ENDS (`onCartEnded`): Clear cart deletes the
 *   row, a submit (`completeCart` / Next customer) closes it as done.
 *
 * Every write goes through ONE queue, so a save can never overtake the create
 * it depends on and a cart switch never races the save of the cart being left
 * (`openCart` / `newCart` flush first). Nothing syncs while a desk mirror holds
 * the tablet: those lines are the desk's session, not a cart of ours.
 *
 * Callers: `KioskShell` (list → `KioskRecentCarts`, count → chrome badge).
 * Affected API: GET/POST `/api/kiosk/carts`, PATCH/DELETE `/api/kiosk/carts/[id]`,
 *   POST `/api/kiosk/carts/[id]/open`, POST `/api/kiosk/carts/[id]/done`
 *   (all `kioskFetchHealed`).
 * Schemas: `kiosk_carts` (2026-09-24d), `KioskCartSnapshot`.
 * User 2026-09-24: "recent carts for juggling multiple customers at the same
 * time, IDed for multiple devices".
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { kioskFetchHealed } from '@/lib/kiosk/kiosk-self-heal';
import { kioskSessionStore, useKioskSession } from '@/lib/kiosk/kiosk-session-store';
import {
  cartSnapshotIsEmpty,
  cartSnapshotOf,
  type KioskCartSnapshot,
} from '@/lib/kiosk/kiosk-cart-snapshot';
import { toast } from '@/lib/toast';

export interface KioskRecentCart {
  id: number;
  label: string | null;
  itemCount: number;
  totalCents: number;
  updatedAt: string;
  heldHere: boolean;
}

/** Long enough to coalesce a burst of taps, short enough that a tablet swap sees them. */
const SAVE_DEBOUNCE_MS = 500;
/** Another tablet's new cart shows up here within this long, without a tap. */
const LIST_POLL_MS = 15_000;

const JSON_HEADERS = { 'content-type': 'application/json' } as const;

export function useKioskCartSync() {
  const session = useKioskSession();
  const [carts, setCarts] = useState<KioskRecentCart[]>([]);

  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const saveTimer = useRef<number | null>(null);
  const creating = useRef(false);
  /** What the server holds for the current cart, so an unchanged render saves nothing. */
  const lastSaved = useRef<{ id: number; json: string } | null>(null);

  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(task, task);
    // The chain must survive a failed write, or one network blip stops every later save.
    queue.current = next.catch(() => undefined);
    return next;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await kioskFetchHealed('/api/kiosk/carts', { cache: 'no-store' });
      if (!res.ok) return;
      const body = (await res.json()) as { carts?: KioskRecentCart[] };
      setCarts(body.carts ?? []);
    } catch {
      // The list is a convenience; the next poll or write refreshes it.
    }
  }, []);

  /** This tablet lost the cart it was on: say which one, then start clean. */
  const letGo = useCallback(
    (id: number, message: string) => {
      if (kioskSessionStore.getSnapshot().cartId !== id) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
      lastSaved.current = null;
      toast(message);
      kioskSessionStore.startNewCart();
      void refresh();
    },
    [refresh],
  );

  const saveNow = useCallback(async () => {
    const s = kioskSessionStore.getSnapshot();
    if (s.cartId === null || s.cartDone || s.sharedSessionId !== null) return;
    const id = s.cartId;
    const snapshot = cartSnapshotOf(s);
    const json = JSON.stringify(snapshot);
    if (lastSaved.current?.id === id && lastSaved.current.json === json) return;
    let res: Response;
    try {
      res = await kioskFetchHealed(`/api/kiosk/carts/${id}`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ snapshot, expectedVersion: s.cartVersion }),
      });
    } catch {
      return; // offline: `lastSaved` is unchanged, so the next edit retries
    }
    if (res.ok) {
      const body = (await res.json()) as { version: number };
      lastSaved.current = { id, json };
      kioskSessionStore.setCartVersion(id, body.version);
      return;
    }
    const code = ((await res.json().catch(() => ({}))) as { error?: string }).error;
    if (res.status === 409 && code === 'HELD_ELSEWHERE') {
      letGo(id, `Cart #${id} was opened on another device`);
    } else if (res.status === 409) {
      letGo(id, `Cart #${id} changed on another screen`);
    } else if (res.status === 404) {
      letGo(id, `Cart #${id} was closed on another device`);
    }
  }, [letGo]);

  /** Run the pending save now and wait for every queued write. */
  const flush = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      void enqueue(saveNow);
    }
    await queue.current;
  }, [enqueue, saveNow]);

  /** Bring the server in line with the store: create, schedule a save, or nothing. */
  const sync = useCallback(() => {
    const s = kioskSessionStore.getSnapshot();
    if (s.sharedSessionId !== null || s.cartDone || creating.current) return;
    const snapshot = cartSnapshotOf(s);
    if (s.cartId === null) {
      if (cartSnapshotIsEmpty(snapshot)) return;
      creating.current = true;
      const epoch = kioskSessionStore.cartEpoch();
      const json = JSON.stringify(snapshot);
      void enqueue(async () => {
        try {
          const res = await kioskFetchHealed('/api/kiosk/carts', {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify({ snapshot }),
          });
          if (!res.ok) return false;
          const { id, version } = (await res.json()) as { id: number; version: number };
          // Refused when the tablet moved on mid-create: that row keeps the
          // cart that was left, open in Recent carts.
          if (kioskSessionStore.attachCart({ id, version, epoch })) {
            lastSaved.current = { id, json };
          }
          void refresh();
          return true;
        } catch {
          return false; // offline: the next change tries the create again
        } finally {
          creating.current = false;
        }
        // Edits made while the create was in flight were skipped above; catch up
        // — only after a create that landed, or a dead network would spin here.
      }).then((created) => {
        if (created) sync();
      });
      return;
    }
    if (lastSaved.current?.id === s.cartId && lastSaved.current.json === JSON.stringify(snapshot)) {
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      void enqueue(saveNow);
    }, SAVE_DEBOUNCE_MS);
  }, [enqueue, refresh, saveNow]);

  useEffect(() => {
    sync();
  }, [session, sync]);

  useEffect(
    () =>
      kioskSessionStore.onCartEnded(({ id, how }) => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = null;
        lastSaved.current = null;
        void enqueue(async () => {
          try {
            await kioskFetchHealed(
              how === 'cleared' ? `/api/kiosk/carts/${id}` : `/api/kiosk/carts/${id}/done`,
              { method: how === 'cleared' ? 'DELETE' : 'POST' },
            );
          } catch {
            // An unclosed cart stays in Recent carts, where it can be cleared by hand.
          }
          void refresh();
        });
      }),
    [enqueue, refresh],
  );

  useEffect(() => {
    void refresh();
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, LIST_POLL_MS);
    // A tab closing mid-debounce would otherwise drop the last half-second of edits.
    const onPageHide = () => {
      const s = kioskSessionStore.getSnapshot();
      if (!saveTimer.current || s.cartId === null || s.cartDone || s.sharedSessionId !== null) {
        return;
      }
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      void kioskFetchHealed(`/api/kiosk/carts/${s.cartId}`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ snapshot: cartSnapshotOf(s), expectedVersion: s.cartVersion }),
        keepalive: true,
      }).catch(() => undefined);
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      clearInterval(poll);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [refresh]);

  /**
   * Pick a cart up on this tablet (Recent carts tap). Takes the hold, so the
   * tablet that had it lets go on its next save. False when it could not open.
   */
  const openCart = useCallback(
    async (id: number): Promise<boolean> => {
      const current = kioskSessionStore.getSnapshot();
      if (current.cartId === id && !current.cartDone) return true;
      if (current.sharedSessionId !== null) {
        toast('A desk holds this tablet — carts open again once it lets go');
        return false;
      }
      await flush();
      try {
        const res = await kioskFetchHealed(`/api/kiosk/carts/${id}/open`, { method: 'POST' });
        if (!res.ok) {
          toast(`Cart #${id} is no longer open`);
          void refresh();
          return false;
        }
        const opened = (await res.json()) as {
          id: number;
          version: number;
          snapshot: KioskCartSnapshot;
        };
        kioskSessionStore.loadCart(opened);
        lastSaved.current = {
          id: opened.id,
          json: JSON.stringify(cartSnapshotOf(kioskSessionStore.getSnapshot())),
        };
        void refresh();
        return true;
      } catch {
        toast(`Could not open cart #${id}`);
        return false;
      }
    },
    [flush, refresh],
  );

  /** `+ New cart`: the cart being left is saved and stays open in the list. */
  const newCart = useCallback(async () => {
    await flush();
    kioskSessionStore.startNewCart();
    lastSaved.current = null;
    void refresh();
  }, [flush, refresh]);

  return { carts, refresh, openCart, newCart };
}
