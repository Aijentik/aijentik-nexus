ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS twilio_phone_number text;
CREATE UNIQUE INDEX IF NOT EXISTS agents_twilio_phone_number_key
  ON public.agents (twilio_phone_number)
  WHERE twilio_phone_number IS NOT NULL;