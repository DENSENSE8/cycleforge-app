'use client';

/**
 * Local settings for receiving-type classify dots.
 *
 * Type colors are code-only in {@link receiving-type-meta} — the types catalog
 * has no `color_hex` column / PATCH field. Platform accents persist on
 * `platforms.color_hex` via `/api/catalog/platforms`. Type swatches can still
 * be retinted here; overrides live in localStorage and feed classify chips.
 */

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'cycleforge.receiving-type-color-hex';
const CHANGE_EVENT = 'cycleforge:receiving-type-colors';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function readTypeColorOverrides(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && HEX_RE.test(value)) {
        out[key.trim().toUpperCase()] = value.toLowerCase();
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function writeTypeColorOverride(
  slug: string,
  hex: string | null,
): Record<string, string> {
  const next = { ...readTypeColorOverrides() };
  const key = slug.trim().toUpperCase();
  if (!key) return next;
  if (hex && HEX_RE.test(hex)) next[key] = hex.toLowerCase();
  else delete next[key];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return next;
}

/** Live map of type-slug → `#rrggbb` local overrides. */
export function useTypeColorOverrides(): {
  colors: Record<string, string>;
  setColor: (slug: string, hex: string | null) => void;
} {
  const [colors, setColors] = useState(readTypeColorOverrides);

  useEffect(() => {
    const sync = () => setColors(readTypeColorOverrides());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setColor = useCallback((slug: string, hex: string | null) => {
    setColors(writeTypeColorOverride(slug, hex));
  }, []);

  return { colors, setColor };
}
