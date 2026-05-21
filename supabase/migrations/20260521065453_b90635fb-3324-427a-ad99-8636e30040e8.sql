
-- Email operations schema
CREATE TYPE email_intent AS ENUM (
  'new_booking','modify_booking','cancel_booking','dietary','vip_request',
  'event_enquiry','function_enquiry','general_question','spam','other'
);

CREATE TYPE email_action_status AS ENUM ('proposed','pending_approval','approved','executed','rejected','undone','failed');
CREATE TYPE email_action_kind AS ENUM ('reply','create_booking','update_booking','cancel_booking','flag_vip','tag_dietary','escalate','no_action');
CREATE TYPE email_thread_status AS ENUM ('open','awaiting_guest','awaiting_staff','resolved','archived');

CREATE TABLE public.email_inboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'forwarding',
  forwarding_address text NOT NULL UNIQUE,
  reply_from_name text,
  reply_from_address text,
  auto_send_threshold numeric NOT NULL DEFAULT 0.85,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.email_inboxes(venue_id);

CREATE TABLE public.email_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  inbox_id uuid REFERENCES public.email_inboxes(id) ON DELETE CASCADE,
  subject text,
  guest_email text NOT NULL,
  guest_name text,
  intent email_intent,
  status email_thread_status NOT NULL DEFAULT 'open',
  ai_takeover boolean NOT NULL DEFAULT true,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  message_count integer NOT NULL DEFAULT 0,
  vip boolean NOT NULL DEFAULT false,
  unread boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.email_threads(venue_id, last_message_at DESC);
CREATE INDEX ON public.email_threads(guest_email);

CREATE TABLE public.email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  from_address text NOT NULL,
  to_address text NOT NULL,
  subject text,
  body_text text,
  body_html text,
  ai_generated boolean NOT NULL DEFAULT false,
  sent_by uuid,
  message_provider_id text,
  in_reply_to text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.email_messages(thread_id, created_at);

CREATE TABLE public.email_ai_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL,
  kind email_action_kind NOT NULL,
  status email_action_status NOT NULL DEFAULT 'proposed',
  confidence numeric NOT NULL DEFAULT 0,
  reasoning text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  executed_at timestamptz,
  executed_by uuid,
  reverted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.email_ai_actions(venue_id, status, created_at DESC);
CREATE INDEX ON public.email_ai_actions(thread_id);

CREATE TABLE public.email_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL,
  subject text,
  body_text text NOT NULL,
  confidence numeric NOT NULL DEFAULT 0,
  reasoning text,
  edited_by uuid,
  action_id uuid REFERENCES public.email_ai_actions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.email_drafts(thread_id);

ALTER TABLE public.email_inboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_ai_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_inboxes rw" ON public.email_inboxes FOR ALL
  USING (is_venue_member(auth.uid(), venue_id)) WITH CHECK (is_venue_member(auth.uid(), venue_id));
CREATE POLICY "email_threads rw" ON public.email_threads FOR ALL
  USING (is_venue_member(auth.uid(), venue_id)) WITH CHECK (is_venue_member(auth.uid(), venue_id));
CREATE POLICY "email_messages rw" ON public.email_messages FOR ALL
  USING (is_venue_member(auth.uid(), venue_id)) WITH CHECK (is_venue_member(auth.uid(), venue_id));
CREATE POLICY "email_ai_actions rw" ON public.email_ai_actions FOR ALL
  USING (is_venue_member(auth.uid(), venue_id)) WITH CHECK (is_venue_member(auth.uid(), venue_id));
CREATE POLICY "email_drafts rw" ON public.email_drafts FOR ALL
  USING (is_venue_member(auth.uid(), venue_id)) WITH CHECK (is_venue_member(auth.uid(), venue_id));

CREATE TRIGGER touch_email_inboxes BEFORE UPDATE ON public.email_inboxes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_email_threads BEFORE UPDATE ON public.email_threads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_email_ai_actions BEFORE UPDATE ON public.email_ai_actions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_email_drafts BEFORE UPDATE ON public.email_drafts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_ai_actions;
