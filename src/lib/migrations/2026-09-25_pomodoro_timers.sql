-- Per-staffer Pomodoro state for assigned tasks and daily checklist instances.
-- Accumulated milliseconds plus a server timestamp retain work across reloads and
-- prevent rounding loss across repeated pauses; cycle_origin_ms resets the 25m
-- countdown without erasing lifetime work. A partial unique index provides a
-- second line of defence for one running record per staff member.
-- SAFETY: the sole writer uses withTenantTransaction and explicitly stamps the
-- authenticated organization_id. Existing rows are untouched. The guarded
-- helper installs the GUC default and FORCE RLS before the first timer write.
-- ROLLBACK: DROP TRIGGER IF EXISTS trg_pomodoro_task_stop ON work_assignments;
--           DROP TRIGGER IF EXISTS trg_pomodoro_check_stop ON daily_check_marks;
--           DROP FUNCTION IF EXISTS fn_pomodoro_task_stop();
--           DROP FUNCTION IF EXISTS fn_pomodoro_check_stop();
--           DROP TRIGGER IF EXISTS trg_pomodoro_timer_session ON pomodoro_timers;
--           DROP FUNCTION IF EXISTS fn_pomodoro_timer_session();
--           DROP TRIGGER IF EXISTS trg_pomodoro_timer_delete ON pomodoro_timers;
--           DROP FUNCTION IF EXISTS fn_pomodoro_timer_delete();
--           DROP TRIGGER IF EXISTS trg_pomodoro_photo_work ON photo_entity_links;
--           DROP TRIGGER IF EXISTS trg_pomodoro_video_work ON entity_videos;
--           DROP FUNCTION IF EXISTS fn_pomodoro_photo_work();
--           DROP FUNCTION IF EXISTS fn_pomodoro_video_work();
--           SELECT relax_tenant_isolation('pomodoro_work_sessions');
--           SELECT relax_tenant_isolation('pomodoro_activity_events');
--           SELECT relax_tenant_isolation('pomodoro_timers');
--           DROP TABLE IF EXISTS pomodoro_work_sessions, pomodoro_activity_events, pomodoro_timers;
-- VERIFY: \d+ pomodoro_timers; \d+ pomodoro_activity_events; npm run tenancy:coverage

CREATE TABLE IF NOT EXISTS pomodoro_timers (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL,
  staff_id            INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  assignment_id       INTEGER REFERENCES work_assignments(id) ON DELETE CASCADE,
  daily_check_item_id BIGINT REFERENCES daily_check_items(id) ON DELETE CASCADE,
  check_date          DATE,
  accumulated_ms      BIGINT NOT NULL DEFAULT 0 CHECK (accumulated_ms >= 0),
  cycle_origin_ms     BIGINT NOT NULL DEFAULT 0 CHECK (cycle_origin_ms >= 0 AND cycle_origin_ms <= accumulated_ms),
  started_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pomodoro_timers_target_chk CHECK (
    (assignment_id IS NOT NULL AND daily_check_item_id IS NULL AND check_date IS NULL)
    OR (assignment_id IS NULL AND daily_check_item_id IS NOT NULL AND check_date IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_pomodoro_timers_task
  ON pomodoro_timers (organization_id, staff_id, assignment_id)
  WHERE assignment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_pomodoro_timers_check
  ON pomodoro_timers (organization_id, staff_id, daily_check_item_id, check_date)
  WHERE daily_check_item_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_pomodoro_timers_running
  ON pomodoro_timers (organization_id, staff_id)
  WHERE started_at IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('pomodoro_timers');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — pomodoro_timers left without FORCE RLS';
  END IF;
END $$;

-- History is independent of live timer/parent deletion: deleting a task may
-- retire its live timer, but must not rewrite a manager's past activity report.
CREATE TABLE IF NOT EXISTS pomodoro_activity_events (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL,
  staff_id            INTEGER NOT NULL,
  assignment_id       INTEGER,
  daily_check_item_id BIGINT,
  check_date          DATE,
  event_day           DATE NOT NULL,
  event_type          TEXT NOT NULL CHECK (event_type IN ('viewed', 'worked', 'completed')),
  source              TEXT NOT NULL,
  occurred_at         TIMESTAMPTZ NOT NULL,
  duration_ms         BIGINT CHECK (duration_ms IS NULL OR duration_ms >= 0),
  client_event_id     UUID,
  CONSTRAINT pomodoro_activity_events_target_chk CHECK (
    (assignment_id IS NOT NULL AND daily_check_item_id IS NULL AND check_date IS NULL)
    OR (assignment_id IS NULL AND daily_check_item_id IS NOT NULL AND check_date IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_pomodoro_activity_events_report
  ON pomodoro_activity_events (organization_id, event_day, staff_id, occurred_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_pomodoro_activity_events_client
  ON pomodoro_activity_events (organization_id, staff_id, client_event_id)
  WHERE client_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS pomodoro_work_sessions (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL,
  staff_id            INTEGER NOT NULL,
  assignment_id       INTEGER,
  daily_check_item_id BIGINT,
  check_date          DATE,
  started_at          TIMESTAMPTZ NOT NULL,
  ended_at            TIMESTAMPTZ,
  CONSTRAINT pomodoro_work_sessions_bounds_chk CHECK (ended_at IS NULL OR ended_at >= started_at),
  CONSTRAINT pomodoro_work_sessions_target_chk CHECK (
    (assignment_id IS NOT NULL AND daily_check_item_id IS NULL AND check_date IS NULL)
    OR (assignment_id IS NULL AND daily_check_item_id IS NOT NULL AND check_date IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_pomodoro_work_sessions_report
  ON pomodoro_work_sessions (organization_id, started_at, staff_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_pomodoro_work_sessions_running
  ON pomodoro_work_sessions (organization_id, staff_id) WHERE ended_at IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('pomodoro_activity_events');
    PERFORM enforce_tenant_isolation('pomodoro_work_sessions');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — pomodoro history left without FORCE RLS';
  END IF;
END $$;

-- Session boundaries are derived from timer writes in the same transaction.
-- Thus a failed/retried request cannot emit phantom worked minutes.
CREATE OR REPLACE FUNCTION fn_pomodoro_timer_session()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  stop_at TIMESTAMPTZ;
  segment_ms BIGINT;
  previous_started TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    previous_started := OLD.started_at;
  END IF;
  IF previous_started IS NOT NULL
      AND previous_started IS DISTINCT FROM NEW.started_at THEN
    segment_ms := NEW.accumulated_ms - OLD.accumulated_ms;
    stop_at := OLD.started_at + (segment_ms * interval '1 millisecond');
    UPDATE pomodoro_work_sessions
       SET ended_at = stop_at
     WHERE organization_id = NEW.organization_id AND staff_id = NEW.staff_id
       AND ended_at IS NULL;
    INSERT INTO pomodoro_activity_events (
      organization_id, staff_id, assignment_id, daily_check_item_id,
      check_date, event_day, event_type, source, occurred_at, duration_ms
    ) VALUES (
      NEW.organization_id, NEW.staff_id, NEW.assignment_id, NEW.daily_check_item_id,
      NEW.check_date, (stop_at AT TIME ZONE 'America/Los_Angeles')::date,
      'worked', 'focus_end', stop_at, segment_ms
    );
  END IF;

  IF NEW.started_at IS NOT NULL AND previous_started IS DISTINCT FROM NEW.started_at THEN
    INSERT INTO pomodoro_work_sessions (
      organization_id, staff_id, assignment_id, daily_check_item_id, check_date, started_at
    ) VALUES (
      NEW.organization_id, NEW.staff_id, NEW.assignment_id,
      NEW.daily_check_item_id, NEW.check_date, NEW.started_at
    );
    INSERT INTO pomodoro_activity_events (
      organization_id, staff_id, assignment_id, daily_check_item_id,
      check_date, event_day, event_type, source, occurred_at
    ) VALUES (
      NEW.organization_id, NEW.staff_id, NEW.assignment_id, NEW.daily_check_item_id,
      NEW.check_date, (NEW.started_at AT TIME ZONE 'America/Los_Angeles')::date,
      'worked', 'focus_start', NEW.started_at
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pomodoro_timer_session ON pomodoro_timers;
CREATE TRIGGER trg_pomodoro_timer_session
  AFTER INSERT OR UPDATE OF started_at ON pomodoro_timers
  FOR EACH ROW EXECUTE FUNCTION fn_pomodoro_timer_session();

-- Parent deletion cascades the live timer but must close the measured session
-- first; the independent event/session history remains reportable afterward.
CREATE OR REPLACE FUNCTION fn_pomodoro_timer_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  stop_at TIMESTAMPTZ := clock_timestamp();
  segment_ms BIGINT;
BEGIN
  IF OLD.started_at IS NOT NULL THEN
    segment_ms := GREATEST(FLOOR(EXTRACT(EPOCH FROM (stop_at - OLD.started_at)) * 1000)::bigint, 0);
    UPDATE pomodoro_work_sessions
       SET ended_at = stop_at
     WHERE organization_id = OLD.organization_id AND staff_id = OLD.staff_id
       AND ended_at IS NULL;
    INSERT INTO pomodoro_activity_events (
      organization_id, staff_id, assignment_id, daily_check_item_id,
      check_date, event_day, event_type, source, occurred_at, duration_ms
    ) VALUES (
      OLD.organization_id, OLD.staff_id, OLD.assignment_id, OLD.daily_check_item_id,
      OLD.check_date, (stop_at AT TIME ZONE 'America/Los_Angeles')::date,
      'worked', 'focus_end', stop_at, segment_ms
    );
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_pomodoro_timer_delete ON pomodoro_timers;
CREATE TRIGGER trg_pomodoro_timer_delete
  BEFORE DELETE ON pomodoro_timers
  FOR EACH ROW EXECUTE FUNCTION fn_pomodoro_timer_delete();

-- Completion is authoritative even if the browser never requests this API
-- again: stop at the completion/mark instant, not at the next read or pause.
CREATE OR REPLACE FUNCTION fn_pomodoro_task_stop()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  stop_at TIMESTAMPTZ;
  event_at TIMESTAMPTZ;
  actor_staff INTEGER := NULLIF(current_setting('app.current_staff', true), '')::integer;
BEGIN
  IF NEW.status IN ('DONE', 'CANCELED') THEN
    -- Starts on this task lock its parent FOR SHARE before the staff lock;
    -- this UPDATE's row lock orders them before or after the completion.
    stop_at := LEAST(COALESCE(NEW.completed_at, clock_timestamp()), clock_timestamp());
    UPDATE pomodoro_timers p
       SET accumulated_ms = p.accumulated_ms + GREATEST(
             FLOOR(EXTRACT(EPOCH FROM (stop_at - p.started_at)) * 1000)::bigint, 0),
           started_at = NULL,
           updated_at = clock_timestamp()
     WHERE p.organization_id = NEW.organization_id
       AND p.assignment_id = NEW.id
       AND p.started_at IS NOT NULL;
  END IF;
  -- The patch route sets app.current_staff in its transaction, so the event
  -- names the actor, not the assignee. Other legacy writers without that GUC
  -- never forge another staff member's activity.
  IF NEW.work_type = 'FOLLOW_UP' AND actor_staff IS NOT NULL THEN
    IF NEW.status = 'DONE' AND OLD.status IS DISTINCT FROM NEW.status THEN
      -- Completing from OPEN without pressing Start is still an interaction,
      -- not measured focus time. Attribute it to the actual actor.
      INSERT INTO pomodoro_activity_events (
        organization_id, staff_id, assignment_id, event_day, event_type, source, occurred_at
      ) VALUES (
        NEW.organization_id, actor_staff, NEW.id,
        (stop_at AT TIME ZONE 'America/Los_Angeles')::date,
        'worked', 'task_completion_interaction', stop_at
      );
      INSERT INTO pomodoro_activity_events (
        organization_id, staff_id, assignment_id, event_day, event_type, source, occurred_at
      ) VALUES (
        NEW.organization_id, actor_staff, NEW.id,
        (stop_at AT TIME ZONE 'America/Los_Angeles')::date,
        'completed', 'task_status', stop_at
      );
    ELSIF (NEW.status = 'IN_PROGRESS' AND OLD.status IS DISTINCT FROM NEW.status)
      OR (NEW.status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')
          AND NEW.notes IS DISTINCT FROM OLD.notes) THEN
      event_at := clock_timestamp();
      INSERT INTO pomodoro_activity_events (
        organization_id, staff_id, assignment_id, event_day, event_type, source, occurred_at
      ) VALUES (
        NEW.organization_id, actor_staff, NEW.id,
        (event_at AT TIME ZONE 'America/Los_Angeles')::date,
        'worked', CASE WHEN NEW.status = 'IN_PROGRESS' AND OLD.status IS DISTINCT FROM NEW.status
          THEN 'task_started' ELSE 'task_edit' END, event_at
      );
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pomodoro_task_stop ON work_assignments;
CREATE TRIGGER trg_pomodoro_task_stop
  AFTER UPDATE OF status, notes
  ON work_assignments
  FOR EACH ROW EXECUTE FUNCTION fn_pomodoro_task_stop();

CREATE OR REPLACE FUNCTION fn_pomodoro_check_stop()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(974126, NEW.staff_id);
  UPDATE pomodoro_timers p
     SET accumulated_ms = p.accumulated_ms + GREATEST(
           FLOOR(EXTRACT(EPOCH FROM (LEAST(NEW.marked_at, clock_timestamp()) - p.started_at)) * 1000)::bigint, 0),
         started_at = NULL,
         updated_at = clock_timestamp()
   WHERE p.organization_id = NEW.organization_id
     AND p.staff_id = NEW.staff_id
     AND p.daily_check_item_id = NEW.item_id
     AND p.check_date = NEW.marked_on
     AND p.started_at IS NOT NULL;
  INSERT INTO pomodoro_activity_events (
    organization_id, staff_id, daily_check_item_id, check_date,
    event_day, event_type, source, occurred_at
  ) VALUES (
    NEW.organization_id, NEW.staff_id, NEW.item_id, NEW.marked_on,
    (NEW.marked_at AT TIME ZONE 'America/Los_Angeles')::date,
    'completed', 'checklist_mark', NEW.marked_at
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pomodoro_check_stop ON daily_check_marks;
CREATE TRIGGER trg_pomodoro_check_stop
  AFTER INSERT ON daily_check_marks
  FOR EACH ROW EXECUTE FUNCTION fn_pomodoro_check_stop();

-- Image upload inserts a photo catalog row + link in the SAME transaction.
-- Attribute only those fresh uploads to the photographer; attaching an old
-- photo later must not pretend its photographer did that later work.
CREATE OR REPLACE FUNCTION fn_pomodoro_photo_work()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.entity_type = 'WORK_ASSIGNMENT' THEN
    INSERT INTO pomodoro_activity_events (
      organization_id, staff_id, assignment_id, event_day, event_type, source, occurred_at
    )
    SELECT NEW.organization_id, p.taken_by_staff_id, NEW.entity_id,
           (NEW.created_at AT TIME ZONE 'America/Los_Angeles')::date,
           'worked', 'task_photo_upload', NEW.created_at
      FROM photos p
     WHERE p.organization_id = NEW.organization_id AND p.id = NEW.photo_id
       AND p.taken_by_staff_id IS NOT NULL AND p.created_at = NEW.created_at;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pomodoro_photo_work ON photo_entity_links;
CREATE TRIGGER trg_pomodoro_photo_work
  AFTER INSERT ON photo_entity_links
  FOR EACH ROW EXECUTE FUNCTION fn_pomodoro_photo_work();

-- Pending video uploads are not completed work. READY is the precise success
-- edge and carries the original uploader; retries leave status READY unchanged.
CREATE OR REPLACE FUNCTION fn_pomodoro_video_work()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.entity_type = 'WORK_ASSIGNMENT' AND NEW.status = 'ready'
     AND OLD.status IS DISTINCT FROM NEW.status AND NEW.staff_id IS NOT NULL THEN
    INSERT INTO pomodoro_activity_events (
      organization_id, staff_id, assignment_id, event_day, event_type, source, occurred_at
    ) VALUES (
      NEW.organization_id, NEW.staff_id, NEW.entity_id,
      (NEW.uploaded_at AT TIME ZONE 'America/Los_Angeles')::date,
      'worked', 'task_video_upload', NEW.uploaded_at
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pomodoro_video_work ON entity_videos;
CREATE TRIGGER trg_pomodoro_video_work
  AFTER UPDATE OF status ON entity_videos
  FOR EACH ROW EXECUTE FUNCTION fn_pomodoro_video_work();
