// Station + floor-mode semantic icon wrappers (nav-icon SoT extension).
//
// Product chrome imports these names — not the underlying primitives — so a
// glyph can be swapped without touching sidebar-navigation, mode rails, or mobile
// nav. Each export documents its layer:
//   • Station*     — data/SoT page icon (MasterNav L1 + SIDEBAR_PAGE_NAV)
//   • *Mode*       — L2 child-page chrome (rails, dropdowns, MRU, header “now”)
//
// Hard law: every MODE glyph key must be unique across floor stations
// (see STATION_GLYPH_KEYS in station-nav-icons.ts). Pages may share a glyph
// with their default mode. Primitives stay generic for timelines / badges
// unless aliased here.
//
// STROKE IS NOT BAKED IN HERE, and must never be again. These exports were
// wrapped in `withNavIconPageStroke` / `withNavIconModeStroke` until 2026-08-19,
// which made a weight travel with the glyph — so the same icon could not be
// drawn at two altitudes, and on the nav beam the wrapper's 2.25 silently beat
// the surface's own 1.5 on emission order. Glyphs ship BARE; the surface
// applies `NAV_ICON_STROKE_CLASS` (icons/nav-weight.tsx). The layer comment
// above is about NAMING and glyph uniqueness, not weight.

import {
  Barcode,
  Box,
  Boxes,
  Package,
  PackageCheck,
  PackageOpen,
  PackageSearch,
  Receipt,
  ShoppingCart,
  Store,
  Truck,
} from './commerce';
import { ClipboardList, Inbox, Printer } from './media';
import { AlertTriangle, ShieldCheck } from './status';
import { DoorOpen, Wrench } from './nav';

type IconComponent = (props: { className?: string }) => JSX.Element;

// ── Station page icons (data / rare non-chrome) ──────────────────────────────

/** Receiving station — default surface `/unbox`. Not rendered in MasterNav L1. */
export const StationReceiving: IconComponent = PackageOpen;

/**
 * Walk-In station subgroup — Local Pickup · Repair (front-desk counter).
 * DoorOpen ≠ ShoppingCart (pickup leaf) ≠ Wrench (repair leaf / Testing page).
 */
export const StationWalkIn: IconComponent = DoorOpen;

/** Testing / QC station — `/test`. Bench repair/tooling (Wrench), not warranty shield. */
export const StationTesting: IconComponent = Wrench;

/** Outbound Shipping station — `/shipping`. Truck = leave-the-building carrier. */
export const StationShipping: IconComponent = Truck;

/** Packing station — `/pack`. Closed package with a completion check. */
export const StationPacking: IconComponent = PackageCheck;

// ── Sales mode mark ──────────────────────────────────────────────────────────

/** Sales mode / sale-line price mark — same Receipt as CHIP_TONES.price. */
export const SalesPrice: IconComponent = Receipt;

/** Front-desk POS (`/counter`) — storefront, not Receipt (Sales Board). */
export const SalesModeCounter: IconComponent = Store;

// ── Receiving L2 modes (chrome — modes own icons) ────────────────────────────

/** PO queue before dock scan. */
export const ReceivingModeIncoming: IconComponent = Inbox;

/**
 * Dock tracking scan (Arrival / triage).
 * Truck = inbound carrier only — never reuse for outbound / Ready to Pack.
 */
export const ReceivingModeArrival: IconComponent = Truck;

/** Unbox workspace — carton opened, serial intake. */
export const ReceivingModeUnbox: IconComponent = PackageOpen;

/** Front-desk local pickup job on the Walk-In rail. */
export const ReceivingModePickup: IconComponent = ShoppingCart;

/** Repair intake on the Walk-In rail — Wrench reserved for repair, not Testing. */
export const ReceivingModeRepair: IconComponent = Wrench;

// ── Testing L2 modes (tech sidebar top row) ─────────────────────────────────

/** QC mode — unit test verdicts. Heavier stroke than the Testing page data icon. */
export const TechModeTesting: IconComponent = ShieldCheck;

/**
 * Picker queue (Urgent · History) — search for a package to pick.
 * PackageSearch ≠ Packing PackageCheck, ≠ Arrival Truck, ≠ Shipping ClipboardList.
 */
export const TechModeShippingQueue: IconComponent = PackageSearch;

// ── Shipping station L2 modes ────────────────────────────────────────────────

/** Label print workspace. */
export const ShippingModeLabels: IconComponent = Printer;

/** Ready-to-ship checklist queue. */
export const ShippingModeReady: IconComponent = ClipboardList;

/** Amazon Prep under Shipping — multi-box Amazon prep. */
export const ShippingModeFba: IconComponent = Boxes;

/** Scan-out / carrier handoff confirm. */
export const ShippingModeScanOut: IconComponent = Barcode;

// ── Packing station L2 modes ─────────────────────────────────────────────────

/** Standard pack bench — same glyph family as the Packing page data icon, mode stroke. */
export const PackingModeStandard: IconComponent = Box;

/** Fragile pack path. */
export const PackingModeFragile: IconComponent = AlertTriangle;

/**
 * Multi-item pack path.
 * Package (closed carton), not Boxes — Boxes is reserved for Shipping FBA mode.
 */
export const PackingModeMulti: IconComponent = Package;
