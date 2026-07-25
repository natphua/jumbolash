UPDATE "Room"
SET "timerLimit" =
  CASE
    WHEN "timerLimit" >= 1000000 THEN FLOOR("timerLimit" / 1000000.0)::INTEGER
    WHEN "timerLimit" >= 1000 THEN FLOOR("timerLimit" / 1000.0)::INTEGER
    ELSE "timerLimit"
  END
WHERE "timerLimit" > 120;
