-- Kiosk slot-event history (phase 2 fleet SoT).
-- One row = one physical slot / lane state transition on an enrolled tablet.
-- No Revoke verb on this family — credential revoke stays on kiosk_devices.
--
-- Apply via the usual migration runner. Does not alter kiosk_devices.

CREATE TABLE IF NOT EXISTS kiosk_slot_events (
  id                    bigserial PRIMARY KEY,
  organization_id       uuid NOT NULL REFERENCES organizations(id),
  kiosk_device_id       bigint NOT NULL REFERENCES kiosk_devices(id),
  slot_key              text NOT NULL,
  from_state            text NOT NULL,
  to_state              text NOT NULL,
  dwell_ms              integer,
  hardware_status       text,
  occurred_at           timestamptz NOT NULL DEFAULT now(),
  payload               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kiosk_slot_events_org_occurred_idx
  ON kiosk_slot_events (organization_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS kiosk_slot_events_device_occurred_idx
  ON kiosk_slot_events (kiosk_device_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS kiosk_slot_events_org_slot_idx
  ON kiosk_slot_events (organization_id, slot_key, occurred_at DESC);

COMMENT ON TABLE kiosk_slot_events IS
  'Phase 2 history peer of kiosk_devices — filter/export only; never Revoke.';
