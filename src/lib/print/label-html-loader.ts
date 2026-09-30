/**
 * `buildLabelHtml` on demand. The label shell renders its DataMatrix through
 * bwip-js (~1 MB), so a static import put the barcode renderer on the first
 * paint of every page that can show a label preview (Unbox's collapsed Label
 * band included). Previews read {@link loadedBuildLabelHtml} synchronously
 * once the module is in, and ask {@link loadBuildLabelHtml} otherwise.
 */

import type { buildLabelHtml } from './printLabel';

export type BuildLabelHtml = typeof buildLabelHtml;

let loaded: BuildLabelHtml | null = null;
let pending: Promise<BuildLabelHtml> | null = null;

export function loadedBuildLabelHtml(): BuildLabelHtml | null {
  return loaded;
}

export function loadBuildLabelHtml(): Promise<BuildLabelHtml> {
  pending ??= import('./printLabel').then((m) => (loaded = m.buildLabelHtml));
  return pending;
}
