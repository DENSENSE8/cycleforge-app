# CycleForge Mobile navigation

React Navigation owns the native route tree. The levels are explicit:

- **L1**: `GlobalNavigator` — bottom tabs on small screens, drawer/left rail on tablets.
- **L2**: `SessionList` — the module's chronological queue.
- **L3**: `ActiveWorkspace` — the touch-first task surface.
- **L4**: `ContextPanel` — a right-sliding modal for metadata and settings.

`routes.ts` is the only mobile route map. `ModuleNavigator` is a mobile-only
composition primitive; it is not imported by the Next.js app.

The scanner bridge listens to `cycleforge.hardwareScanner.input`. The
`emitMockHardwareScan` helper emits that same event for simulator and unit
smoke testing.
