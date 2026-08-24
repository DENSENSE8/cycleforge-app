/**
 * The root route. Renders NOTHING on purpose: `ShellRoot` in `layout.tsx`
 * mounts the whole Warehouse-OS frame for every non-chromeless path and
 * deliberately ignores route children — the canvas, not the URL, decides what
 * is on screen (the URL names at most the focused tile, D2). This file exists
 * so "/" is a real route with a 200 instead of the framework's not-found
 * rendering inside the frame.
 */
export default function Root() {
  return null;
}
