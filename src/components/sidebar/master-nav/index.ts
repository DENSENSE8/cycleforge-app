export { MasterNav } from './MasterNav';
export { MasterNavView } from './MasterNavView';
// `MasterNavDropdown` used to be re-exported here. It is gone — the page list is
// no longer a portaled flyout. Its rows live in `SidebarNavList`, which only
// `MasterNavView` mounts (as the spine's body) and so imports directly; putting
// it back in the barrel would just be an unused export.
// `MasterNavHeader` went through `OrgWorkspaceControl` and is now
// `SpineSessionHead`, mounted only from `SidebarNavList` (which only
// `MasterNavView` mounts). `StaffAccountFooter` mounts only from
// `SidebarNavList` too — neither needs a barrel export.
//
// `useActiveSidebarChild` / `useSidebarChildNav` were re-exported here and never
// imported through it (every consumer reaches the concrete file), so knip had
// them baselined as dead under their pre-2026-08-03 names. The vocabulary rename
// surfaced them as "new" findings, which was the prompt to finish the job the
// comment above already argued: `MasterNav` is the only thing this barrel owes
// the app. Import the hooks from their own modules.
