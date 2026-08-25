/**
 * Stamps the operator's saved theme on `<html>` BEFORE first paint, so a dark
 * bench never gets a white flash on the way in.
 *
 * It stamps ONLY when there is a saved choice. That absence is load-bearing:
 * with no attribute at all, `tokens.css` resolves the palette from
 * `prefers-color-scheme`, which is the correct answer for an operator who has
 * never touched the setting. Writing `light` by default would override the
 * system preference with a guess.
 *
 * Inlined by `app/layout.tsx` as a blocking `<script>` in `<head>`. Kept as a
 * string, not a module, because it must execute before React exists.
 */

import { THEME_STORAGE_KEY } from '@/shell/model';

export const SHELL_THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
