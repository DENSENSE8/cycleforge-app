/**
 * Top-level mode for the tech sidebar body switch. L2 Quality Control / Ready
 * to Pack lives in GlobalHeader (`HeaderPageSwitcher` ← SIDEBAR_PAGE_NAV;
 * child labels Quality Control + Ready to Pack; wire ids still `testing` /
 * `shipping`).
 *
 *   testing  → {@link TestingSidebarPanel}
 *   shipping → {@link ShippingSidebarPanel}
 */

export type TechSidebarTopMode = 'testing' | 'shipping';
