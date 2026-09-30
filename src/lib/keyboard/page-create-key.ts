'use client';

import { useSyncExternalStore } from 'react';

/**
 * A page's own create on bare `C` (the key law, `key-registry.ts`: `C` is
 * create everywhere). With no claim, `C` arms the app-wide Add sequence
 * (`GlobalHeaderAdd`: `C` then S / I / P / R). A desk whose main verb is a
 * create claims `C` for it — the Tasks board's New task — and the Add
 * sequence stands down on that page (the header's Add pill still opens it).
 * The latest claimant wins; unmounting releases it.
 */
export type PageCreate = { label: string; run: () => void };

let claims: PageCreate[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function registerPageCreate(create: PageCreate): () => void {
  claims = [...claims, create];
  emit();
  return () => {
    claims = claims.filter((entry) => entry !== create);
    emit();
  };
}

/** The page create `C` runs right now, if a page claimed it. */
export function currentPageCreate(): PageCreate | null {
  return claims.at(-1) ?? null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePageCreate(): PageCreate | null {
  return useSyncExternalStore(subscribe, currentPageCreate, () => null);
}
