-- Tenant-isolation RLS for Realtime broadcast/presence.
-- All client channels follow the convention: venue:{venue_id}:{topic}
-- This policy ensures authenticated users can only join channels for venues they belong to.
-- postgres_changes streams remain independently protected by per-table RLS.

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venue topic isolation read" ON realtime.messages;
DROP POLICY IF EXISTS "venue topic isolation write" ON realtime.messages;

CREATE POLICY "venue topic isolation read"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE 'venue:%:%'
  AND public.is_venue_member(
    auth.uid(),
    NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid
  )
);

CREATE POLICY "venue topic isolation write"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() LIKE 'venue:%:%'
  AND public.is_venue_member(
    auth.uid(),
    NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid
  )
);