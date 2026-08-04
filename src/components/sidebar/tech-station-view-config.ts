/**
 * Top-level mode for the tech sidebar body switch. L2 Testing / Shipping lives
 * in GlobalHeader (`HeaderPageSwitcher` ← SIDEBAR_PAGE_NAV).
 *
 *   testing  → {@link TestingSidebarPanel}
 *   shipping → {@link ShippingSidebarPanel}
 */

export type TechSidebarTopMode = 'testing' | 'shipping';
