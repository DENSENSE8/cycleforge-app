/**
 * Top-level mode for the tech sidebar body switch. MasterNav lists Quality
 * Control and Ready to Pack as Scan Stations L1 rows; the header switcher
 * peers them via `stationSubgroup: 'testing'`. Wire ids still `testing` /
 * `shipping`.
 *
 *   testing  → {@link TestingSidebarPanel}
 *   shipping → {@link ShippingSidebarPanel}
 */

export type TechSidebarTopMode = 'testing' | 'shipping';
