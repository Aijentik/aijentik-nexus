-- Extend integrations table
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'disconnected',
  ADD COLUMN IF NOT EXISTS auth_type text,
  ADD COLUMN IF NOT EXISTS sync_health text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS enabled_modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS integrations_venue_provider_idx
  ON public.integrations(venue_id, provider);

DROP TRIGGER IF EXISTS integrations_touch ON public.integrations;
CREATE TRIGGER integrations_touch BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- integration_events
CREATE TABLE IF NOT EXISTS public.integration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  integration_id uuid REFERENCES public.integrations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  type text NOT NULL,            -- connect | test | sync | error | disconnect | webhook
  status text NOT NULL DEFAULT 'ok', -- ok | warn | error
  message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.integration_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "integration_events read"  ON public.integration_events FOR SELECT USING (public.is_venue_member(auth.uid(), venue_id));
CREATE POLICY "integration_events write" ON public.integration_events FOR ALL    USING (public.is_venue_member(auth.uid(), venue_id)) WITH CHECK (public.is_venue_member(auth.uid(), venue_id));
CREATE INDEX IF NOT EXISTS integration_events_venue_idx ON public.integration_events(venue_id, created_at DESC);

-- sync_logs
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  integration_id uuid REFERENCES public.integrations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  direction text NOT NULL DEFAULT 'inbound', -- inbound | outbound
  status text NOT NULL DEFAULT 'ok',          -- ok | warn | error | retry
  message text,
  records_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sync_logs read"  ON public.sync_logs FOR SELECT USING (public.is_venue_member(auth.uid(), venue_id));
CREATE POLICY "sync_logs write" ON public.sync_logs FOR ALL    USING (public.is_venue_member(auth.uid(), venue_id)) WITH CHECK (public.is_venue_member(auth.uid(), venue_id));
CREATE INDEX IF NOT EXISTS sync_logs_venue_idx ON public.sync_logs(venue_id, created_at DESC);

-- realtime
ALTER TABLE public.integration_events REPLICA IDENTITY FULL;
ALTER TABLE public.sync_logs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.integration_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_logs;