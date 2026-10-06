'use client';

import { useRef } from 'react';
import { useServerInsertedHTML } from 'next/navigation';
import { TRIAL_BOOT_SCRIPT } from '@/lib/design/trials';
import { THEME_BOOT_SCRIPT } from '@/lib/theme/theme';
import { STATION_SKIN_BOOT_SCRIPT } from '@/lib/theme/station-skin';
import { STATION_DEPTH_BOOT_SCRIPT } from '@/lib/theme/station-depth';

/** Evict leftover Warehouse-OS Workbox CacheFirst on this origin (usav-dev / localhost:3050) so Home CSS can paint. */
const SW_EVICT_BOOT_SCRIPT =
  "(function(){try{if(!('serviceWorker' in navigator))return;navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister();});});if(window.caches){caches.keys().then(function(ks){ks.forEach(function(k){caches.delete(k);});});}}catch(e){}})();";

/** In execution order: URL-only trial flags, then the cached theme / station skin / station depth, then the SW eviction. */
const BOOT_SCRIPTS = [
  TRIAL_BOOT_SCRIPT,
  THEME_BOOT_SCRIPT,
  STATION_SKIN_BOOT_SCRIPT,
  STATION_DEPTH_BOOT_SCRIPT,
  SW_EVICT_BOOT_SCRIPT,
];

/**
 * Pre-paint boot scripts, written into the server HTML stream only.
 *
 * React 19 reports "Encountered a script tag while rendering React component"
 * whenever it creates a `<script>` element on the client — which happens to a
 * root layout's `<head>` the moment React re-renders it client-side (a dev
 * hydration recovery or HMR remount). These scripts only ever matter in the
 * first HTML the browser parses, so they never enter React's tree:
 * `useServerInsertedHTML` lets Next stream them into `<head>` before any body
 * markup, and the client render renders nothing.
 *
 * The callback runs on every streamed flush; the ref keeps it to the first.
 */
export function HeadBootScripts() {
  const inserted = useRef(false);
  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return BOOT_SCRIPTS.map((source, index) => (
      <script key={index} dangerouslySetInnerHTML={{ __html: source }} />
    ));
  });
  return null;
}
