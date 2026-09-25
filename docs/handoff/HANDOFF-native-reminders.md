# HANDOFF — native reminders (SwiftUI + Android)

Tasks (`work_assignments.remind_at` / `deadline_at`) and daily checklist items
(`daily_check_items.due_time` + `remind_offset_minutes`) ring on the phone as
**local notifications** scheduled from one read-only feed. No APNs/FCM
credential is involved today.

Sources of truth: `src/lib/reminders/reminder-contract.ts` (types),
`src/lib/reminders/list-staff-reminders.ts` (rules), OpenAPI
`docs/openapi/cycleforge-v1.json` → `GET /api/v1/reminders`
(`StaffReminder`, `StaffRemindersPayload`). Migration:
`src/lib/migrations/2026-09-25b_task_and_checklist_reminders.sql`.

## Feed contract

`GET /api/v1/reminders?from=<ISO instant>&days=<1..14>` — staff session
(cookie). `from` defaults to now, `days` to 7. Response is `no-store`:

```json
{ "data": { "generatedAt": "…", "staffId": 7, "from": "…", "to": "…",
  "reminders": [ { "id": "task:41", "source": "task", "sourceId": 41,
    "title": "Check the serial", "body": "Order 1234 · from Ana · due Sep 26, 2:00 PM",
    "dueAt": "2026-09-26T21:00:00.000Z", "remindAt": "2026-09-26T21:00:00.000Z",
    "urgent": true, "deepLink": "/m/home?task=41" } ] } }
```

- `400 { "error": { "code": "INVALID_REQUEST", "message" } }` on a bad
  `from`/`days`; `401` without a session.
- Every `remindAt` lies in `[from, to)`; the list is sorted by `remindAt`.
- **Ids are stable** and are the notification identity:
  `task:<work_assignments.id>`, `checklist:<daily_check_items.id>:<YYYY-MM-DD>`
  (a recurring item rings once per warehouse civil day).
- Tasks: the caller's open `FOLLOW_UP` tasks ring at `remind_at`; a task with a
  deadline and no `remind_at` rings **at the deadline**. Task reminders appear
  only when the session holds `work_orders.claim`.
- Checklist: items live that day, owed by the caller (recurring, unowned, or
  owned by them), with a due time and an offset, and not yet ticked by the
  caller that day. Rings at `due_time − offset` in `America/Los_Angeles`
  (DST-correct; clients must NOT recompute — use `remindAt` verbatim).
- `deepLink` is a same-origin `/m/...` path; open it in the app's web surface.

## Scheduling algorithm (both platforms)

On every sync: fetch the feed for `from = now`, `days = 7`, then **replace
all**: cancel every pending notification this app scheduled whose id is not
in the feed, and (re)schedule every feed entry by id. Scheduling the same id
again must overwrite, never duplicate. A ticked checklist day or a finished
task simply drops out of the next feed, so it stops ringing.

### iOS (SwiftUI)

- `UNUserNotificationCenter`; request `.alert, .sound, .badge` once.
- Per reminder: `UNMutableNotificationContent` (`title`, `body ?? ""`,
  `userInfo["deepLink"]`, `interruptionLevel = .timeSensitive` when `urgent`),
  trigger `UNCalendarNotificationTrigger(dateMatching:
  Calendar.current.dateComponents([.year,.month,.day,.hour,.minute,.second], from: remindAt), repeats: false)`,
  `UNNotificationRequest(identifier: reminder.id, …)` — same identifier replaces.
- Replace-all: `getPendingNotificationRequests` → remove identifiers with a
  `task:`/`checklist:` prefix that are absent from the feed
  (`removePendingNotificationRequests(withIdentifiers:)`), then add the feed.
- iOS keeps at most 64 pending requests per app: schedule the first 60 by
  `remindAt` (the feed is already sorted); the next sync tops up.
- Tap: `userNotificationCenter(_:didReceive:)` → route to `deepLink`.

### Android

- `NotificationChannel("reminders", IMPORTANCE_HIGH)` created at startup;
  `POST_NOTIFICATIONS` runtime permission (API 33+).
- Per reminder: `AlarmManager.setExactAndAllowWhileIdle(RTC_WAKEUP,
  remindAt.toEpochMilli(), pendingIntent)` when `canScheduleExactAlarms()`
  (`SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM`), else `setAndAllowWhileIdle`.
  `PendingIntent` → a `BroadcastReceiver` that posts the notification (title,
  body, `PRIORITY_HIGH` when `urgent`, content intent → `deepLink`).
- `requestCode = reminder.id.hashCode()` with `FLAG_UPDATE_CURRENT |
  FLAG_IMMUTABLE`, and the id in the intent's data URI
  (`cycleforge://reminder/<id>`) so a hash collision cannot alias two alarms.
- Replace-all: persist the scheduled id set (DataStore); cancel
  (`alarmManager.cancel(pendingIntent)`) ids absent from the feed, schedule the
  rest, save the new set. Re-schedule from the saved feed on
  `BOOT_COMPLETED` and `TIME_SET`/`TIMEZONE_CHANGED`.

## Sync triggers

App launch, app foreground, the realtime inbox nudge (Ably) the app already
listens to, and after the user edits/completes a task or ticks a checklist item
in-app. Add a periodic background refresh as a floor (iOS `BGAppRefreshTask`,
Android `WorkManager` ~every 6 h) so a 7-day window never runs dry.

## Named gap — server push

Not built: a device registry (`staff_devices`: org, staff, platform, APNs/FCM
token, last seen) plus a sender that runs `listStaffReminders` for due instants
and pushes via APNs / FCM. It would add: reminders reaching a phone that has not
synced since the task was thrown, and cross-device cancel (silent push → sync).
The feed stays its contract; local scheduling stays the offline path.
