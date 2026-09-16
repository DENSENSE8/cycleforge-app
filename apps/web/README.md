# CycleForge web boundary

The desktop Next.js application currently lives in the repository root `src/` tree. This package is the workspace boundary for the staged extraction of that app into `apps/web` without mixing it with the Expo application.

## Ownership

- `apps/web`: Next.js routes, desktop shell, dense tables, keyboard navigation, and scanner-wedge UI.
- `apps/mobile`: Expo routes, touch workflows, camera/native scanner UI, and mobile-only navigation.
- `packages/shared`: Supabase client factories, tenant-safe query hooks, pure domain types, and state helpers only.

The web and mobile packages must not import each other's components. Shared code must remain platform-neutral.
