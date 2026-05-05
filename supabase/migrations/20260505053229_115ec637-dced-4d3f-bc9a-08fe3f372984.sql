
-- Zones
CREATE TABLE public.zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#f59e0b',
  position int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zones rw" ON public.zones FOR ALL USING (is_venue_member(auth.uid(), venue_id)) WITH CHECK (is_venue_member(auth.uid(), venue_id));

-- Tables (floor plan)
CREATE TABLE public.tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  zone_id uuid REFERENCES public.zones(id) ON DELETE SET NULL,
  label text NOT NULL,
  capacity int NOT NULL DEFAULT 2,
  shape text NOT NULL DEFAULT 'round',
  x numeric NOT NULL DEFAULT 100,
  y numeric NOT NULL DEFAULT 100,
  width numeric NOT NULL DEFAULT 80,
  height numeric NOT NULL DEFAULT 80,
  combinable boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tables rw" ON public.tables FOR ALL USING (is_venue_member(auth.uid(), venue_id)) WITH CHECK (is_venue_member(auth.uid(), venue_id));
CREATE TRIGGER tables_touch BEFORE UPDATE ON public.tables FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Guests CRM
CREATE TABLE public.guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  vip boolean DEFAULT false,
  tags text[] DEFAULT '{}',
  notes text,
  visit_count int DEFAULT 0,
  last_visit timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guests rw" ON public.guests FOR ALL USING (is_venue_member(auth.uid(), venue_id)) WITH CHECK (is_venue_member(auth.uid(), venue_id));
CREATE TRIGGER guests_touch BEFORE UPDATE ON public.guests FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX guests_phone_idx ON public.guests(venue_id, phone);

-- Optional table assignment for bookings
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS table_id uuid REFERENCES public.tables(id) ON DELETE SET NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS guest_id uuid REFERENCES public.guests(id) ON DELETE SET NULL;

-- Realtime
ALTER TABLE public.brain_events REPLICA IDENTITY FULL;
ALTER TABLE public.bookings REPLICA IDENTITY FULL;
ALTER TABLE public.calls REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.insights REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.brain_events;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.insights;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
