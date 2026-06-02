
-- Enable pg_net if not already (usually pre-enabled on Supabase)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 1. Add column
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS external_booking_webhook_url TEXT;

-- 2. Booking trigger function
CREATE OR REPLACE FUNCTION public.notify_booking_external()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  webhook_url TEXT;
  db_source TEXT;
BEGIN
  SELECT external_booking_webhook_url INTO webhook_url
  FROM public.agents
  WHERE venue_id = NEW.venue_id
    AND kind = 'voice'
    AND external_booking_webhook_url IS NOT NULL
  LIMIT 1;

  IF webhook_url IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    db_source := 'create';
  ELSE
    db_source := 'amend';
  END IF;

  PERFORM net.http_post(
    url := webhook_url,
    body := jsonb_build_object(
      'db_source',    db_source,
      'id',           NEW.id,
      'venue_id',     NEW.venue_id,
      'guest_name',   NEW.guest_name,
      'guest_phone',  NEW.guest_phone,
      'guest_email',  NEW.guest_email,
      'party_size',   NEW.party_size,
      'booking_time', NEW.booking_time,
      'status',       NEW.status,
      'source',       NEW.source,
      'notes',        NEW.notes,
      'created_at',   NEW.created_at,
      'updated_at',   NEW.updated_at
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_external_sync ON public.bookings;
CREATE TRIGGER booking_external_sync
  AFTER INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_booking_external();

-- 3. Message trigger function
CREATE OR REPLACE FUNCTION public.notify_message_external()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  webhook_url TEXT;
BEGIN
  IF NEW.direction IS DISTINCT FROM 'inbound' THEN
    RETURN NEW;
  END IF;

  SELECT external_booking_webhook_url INTO webhook_url
  FROM public.agents
  WHERE venue_id = NEW.venue_id
    AND kind = 'voice'
    AND external_booking_webhook_url IS NOT NULL
  LIMIT 1;

  IF webhook_url IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := webhook_url,
    body := jsonb_build_object(
      'db_source',  'message',
      'id',         NEW.id,
      'venue_id',   NEW.venue_id,
      'channel',    NEW.channel,
      'direction',  NEW.direction,
      'contact',    NEW.contact,
      'body',       NEW.body,
      'status',     NEW.status,
      'created_at', NEW.created_at
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS message_external_sync ON public.messages;
CREATE TRIGGER message_external_sync
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_message_external();
