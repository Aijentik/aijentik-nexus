ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reason TEXT DEFAULT 'Message';

CREATE OR REPLACE FUNCTION public.notify_message_external()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
      'reason',     NEW.reason,
      'created_at', NEW.created_at
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );

  RETURN NEW;
END;
$function$;