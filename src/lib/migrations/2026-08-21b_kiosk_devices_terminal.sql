-- 2026-08-21b_kiosk_devices_terminal.sql
--
-- Pair a Square Terminal (the POS stand) to a kiosk device — per org, per lane.
--
-- Plan: docs/todo/counter-square-enterprise-PLAN.md (SQ3 · gap G3).
--
-- WHAT THIS REPLACES. The Terminal device id came from `SQUARE_TERMINAL_DEVICE_ID`
-- — a single process-wide env var. That means ONE stand per deployment: a shop
-- with two counters cannot run both, and two tenants on one deploy would send
-- each other's customers a card prompt. An env var is deployment config; which
-- stand sits at which counter is TENANT data, and it belongs in a tenant table.
--
-- WHY HERE, on kiosk_devices. The counter already pairs a tablet per lane, and
-- the stand is the other half of that same physical counter — one iPad facing
-- the customer, one card reader beside it. Anything else (a settings blob, a
-- new table) would be a second place to answer "which counter is this?".
--
-- NULLABLE, and that is the honest default: a lane with no stand takes cash or
-- a payment link, and must not inherit another lane's reader. The env var stays
-- as a LAST-RESORT fallback for single-counter deployments (resolved in exactly
-- one function — resolveTerminalDeviceId), never as the source.
--
-- NOT A FOREIGN KEY: the id is Square's, for a device this database has no row
-- for. Validating it means asking Square, which the pairing UI does.
--
-- TENANCY: kiosk_devices is already tenant-isolated (2026-07-17), so an
-- ADD COLUMN inherits FORCE RLS and the canonical policy.
--
-- EXPAND-FIRST: a nullable add, landing before its reader.
--
-- ROLLBACK:
--   alter table kiosk_devices drop column if exists square_terminal_device_id;
--
-- VERIFY:
--   \d+ kiosk_devices

BEGIN;

ALTER TABLE kiosk_devices
  ADD COLUMN IF NOT EXISTS square_terminal_device_id TEXT;

COMMENT ON COLUMN kiosk_devices.square_terminal_device_id IS
  'Square Terminal device id paired to this counter lane. NULL = no stand at this lane (cash / payment link). Resolved by resolveTerminalDeviceId(), which falls back to SQUARE_TERMINAL_DEVICE_ID only for single-counter deployments.';

COMMIT;
