/**
 * Warehouse OS shell — the one always-mounted frame.
 *
 * `app/layout.tsx` imports `ShellRoot` and the two stylesheets from here and
 * nothing else. Everything below this barrel is internal to the shell.
 */

export { ShellRoot } from '@/shell/ShellRoot';
export { useShell, type ShellApi } from '@/shell/useShell';
export { SHELL_THEME_BOOT_SCRIPT } from '@/shell/theme-boot';
