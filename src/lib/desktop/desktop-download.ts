/**
 * Where an operator gets the desktop shell.
 *
 * One place, because more than one surface will want it — Settings →
 * Workstation (this device) today, and a `/desktop-app` landing page next
 * (`docs/cycle-forge-branding-spec.md` §6.1) — and a download URL that drifts
 * between them sends half the floor to a stale installer.
 *
 * Default target is the GitHub Releases page named in `electron-builder.yml`'s
 * `publish` block, so the download an operator clicks and the feed
 * `electron-updater` polls are the SAME release by construction. Override for a
 * tenant that mirrors installers somewhere else.
 *
 * Deliberately the releases PAGE, not a direct asset URL: assets are per-OS and
 * per-arch (`CycleForge-<version>-arm64.dmg`, `CycleForge-Setup-<version>.exe`),
 * so a single hardcoded link would be wrong for most of the floor. Picking the
 * asset for the visitor needs the release manifest, which is a server round-trip
 * this row does not earn yet.
 */
export const DESKTOP_DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL?.trim() ||
  'https://github.com/DENSENSE8/cycleforge-app/releases/latest';
