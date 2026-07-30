-- Queue tickets can be linked to the attendance created from them.
ALTER TABLE "public"."QueueTicket"
ADD COLUMN IF NOT EXISTS "attendanceId" TEXT;

CREATE INDEX IF NOT EXISTS "QueueTicket_attendanceId_idx"
ON "public"."QueueTicket"("attendanceId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'QueueTicket_attendanceId_fkey'
  ) THEN
    ALTER TABLE "public"."QueueTicket"
    ADD CONSTRAINT "QueueTicket_attendanceId_fkey"
    FOREIGN KEY ("attendanceId") REFERENCES "public"."Attendance"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
