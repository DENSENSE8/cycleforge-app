SELECT (
      WITH shipped_day AS MATERIALIZED (
        SELECT (date_trunc('day', NOW() AT TIME ZONE z.name) AT TIME ZONE z.name) AS lo,
               ((date_trunc('day', NOW() AT TIME ZONE z.name) + INTERVAL '1 day') AT TIME ZONE z.name) AS hi
          FROM (
            SELECT COALESCE((
              SELECT tzn.name
                FROM organizations org
                JOIN pg_timezone_names tzn ON tzn.name = org.settings->>'timezone'
               WHERE org.id = '00000000-0000-0000-0000-000000000001'
               LIMIT 1
            ), 'UTC') AS name
            OFFSET 0
          ) z
      )
      SELECT COUNT(*)::int
        FROM shipped_day d
        JOIN station_activity_logs sal
          ON sal.created_at >= d.lo
         AND sal.created_at < d.hi
       WHERE sal.organization_id = '00000000-0000-0000-0000-000000000001'
         AND sal.station = 'PACK'
    ) AS n
