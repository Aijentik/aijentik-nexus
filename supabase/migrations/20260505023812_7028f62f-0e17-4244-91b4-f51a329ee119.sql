
-- Enums
CREATE TYPE public.app_role AS ENUM ('owner','manager','staff','viewer');
CREATE TYPE public.agent_kind AS ENUM ('voice','booking','ops','marketing','concierge');
CREATE TYPE public.agent_status AS ENUM ('idle','active','training','paused');
CREATE TYPE public.booking_status AS ENUM ('pending','confirmed','seated','completed','cancelled','no_show');
CREATE TYPE public.call_outcome AS ENUM ('booking','enquiry','complaint','transfer','voicemail','other');
CREATE TYPE public.brain_severity AS ENUM ('info','success','warn','critical');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  current_venue_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Venues
CREATE TABLE public.venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,
  venue_type TEXT,
  cuisine TEXT,
  phone TEXT,
  website TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  capacity INT DEFAULT 60,
  hours JSONB DEFAULT '{}'::jsonb,
  brand_voice TEXT DEFAULT 'warm, professional, concise',
  description TEXT,
  logo_url TEXT,
  cover_url TEXT,
  forwarded_number TEXT,
  status TEXT DEFAULT 'live',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

-- Roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, venue_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer helpers
CREATE OR REPLACE FUNCTION public.has_venue_role(_user UUID, _venue UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user AND venue_id=_venue AND role=_role);
$$;

CREATE OR REPLACE FUNCTION public.is_venue_member(_user UUID, _venue UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user AND venue_id=_venue)
      OR EXISTS (SELECT 1 FROM public.venues WHERE id=_venue AND owner_id=_user);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_venue(_user UUID, _venue UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.venues WHERE id=_venue AND owner_id=_user)
      OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user AND venue_id=_venue AND role IN ('owner','manager'));
$$;

-- Agents
CREATE TABLE public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  kind public.agent_kind NOT NULL,
  name TEXT NOT NULL,
  voice_id TEXT,
  prompt TEXT,
  status public.agent_status NOT NULL DEFAULT 'idle',
  config JSONB DEFAULT '{}'::jsonb,
  elevenlabs_agent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Knowledge base
CREATE TABLE public.knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;

-- Bookings
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  guest_name TEXT NOT NULL,
  guest_phone TEXT,
  guest_email TEXT,
  party_size INT NOT NULL DEFAULT 2,
  booking_time TIMESTAMPTZ NOT NULL,
  status public.booking_status NOT NULL DEFAULT 'pending',
  source TEXT DEFAULT 'ai_voice',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Calls
CREATE TABLE public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  caller TEXT,
  duration_seconds INT DEFAULT 0,
  outcome public.call_outcome DEFAULT 'other',
  transcript JSONB DEFAULT '[]'::jsonb,
  summary TEXT,
  booking_id UUID,
  agent_id UUID,
  conversation_id TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- Brain events
CREATE TABLE public.brain_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  agent_id UUID,
  title TEXT NOT NULL,
  reason TEXT,
  severity public.brain_severity NOT NULL DEFAULT 'info',
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.brain_events ENABLE ROW LEVEL SECURITY;

-- Insights
CREATE TABLE public.insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT,
  impact TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;

-- Messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  channel TEXT DEFAULT 'sms',
  direction TEXT DEFAULT 'outbound',
  contact TEXT,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'sent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Integrations
CREATE TABLE public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  connected BOOLEAN DEFAULT false,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- Onboarding runs
CREATE TABLE public.onboarding_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  venue_id UUID,
  input JSONB,
  steps JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'running',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.onboarding_runs ENABLE ROW LEVEL SECURITY;

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER t_profiles_u BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_venues_u BEFORE UPDATE ON public.venues FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_agents_u BEFORE UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_kb_u BEFORE UPDATE ON public.knowledge_base FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_bookings_u BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies
CREATE POLICY "own profile read" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own roles read" ON public.user_roles FOR SELECT USING (auth.uid() = user_id OR public.can_manage_venue(auth.uid(), venue_id));
CREATE POLICY "manage roles" ON public.user_roles FOR ALL USING (public.can_manage_venue(auth.uid(), venue_id)) WITH CHECK (public.can_manage_venue(auth.uid(), venue_id));

CREATE POLICY "venue read" ON public.venues FOR SELECT USING (auth.uid() = owner_id OR public.is_venue_member(auth.uid(), id));
CREATE POLICY "venue insert" ON public.venues FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "venue update" ON public.venues FOR UPDATE USING (auth.uid() = owner_id OR public.has_venue_role(auth.uid(), id, 'manager'));
CREATE POLICY "venue delete" ON public.venues FOR DELETE USING (auth.uid() = owner_id);

-- Generic policies for venue-scoped tables
DO $$ DECLARE t TEXT; BEGIN
  FOR t IN SELECT unnest(ARRAY['agents','knowledge_base','bookings','calls','brain_events','insights','messages','integrations']) LOOP
    EXECUTE format('CREATE POLICY "%s read" ON public.%I FOR SELECT USING (public.is_venue_member(auth.uid(), venue_id))', t, t);
    EXECUTE format('CREATE POLICY "%s write" ON public.%I FOR ALL USING (public.is_venue_member(auth.uid(), venue_id)) WITH CHECK (public.is_venue_member(auth.uid(), venue_id))', t, t);
  END LOOP;
END $$;

CREATE POLICY "onboarding own" ON public.onboarding_runs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.brain_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.onboarding_runs;
ALTER TABLE public.brain_events REPLICA IDENTITY FULL;
ALTER TABLE public.bookings REPLICA IDENTITY FULL;
ALTER TABLE public.calls REPLICA IDENTITY FULL;
ALTER TABLE public.agents REPLICA IDENTITY FULL;
ALTER TABLE public.onboarding_runs REPLICA IDENTITY FULL;

-- Indexes
CREATE INDEX idx_brain_venue_time ON public.brain_events(venue_id, created_at DESC);
CREATE INDEX idx_bookings_venue_time ON public.bookings(venue_id, booking_time);
CREATE INDEX idx_calls_venue_time ON public.calls(venue_id, started_at DESC);
CREATE INDEX idx_kb_venue ON public.knowledge_base(venue_id);
CREATE INDEX idx_agents_venue ON public.agents(venue_id);
