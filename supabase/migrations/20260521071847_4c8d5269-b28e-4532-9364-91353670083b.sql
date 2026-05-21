
-- Feature flags on venues
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Order status enum
DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM ('new','confirmed','in_kitchen','ready','out_for_delivery','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_channel AS ENUM ('web','whatsapp','instagram','messenger','sms','phone','in_house');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_fulfillment AS ENUM ('dine_in','takeaway','delivery');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('unpaid','authorized','paid','refunded','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  guest_id uuid,
  guest_name text NOT NULL,
  guest_phone text,
  guest_email text,
  status public.order_status NOT NULL DEFAULT 'new',
  channel public.order_channel NOT NULL DEFAULT 'in_house',
  fulfillment public.order_fulfillment NOT NULL DEFAULT 'takeaway',
  payment_status public.payment_status NOT NULL DEFAULT 'unpaid',
  subtotal_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'GBP',
  notes text,
  pickup_time timestamptz,
  delivery_address text,
  ai_confidence numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL,
  menu_item_id uuid,
  name text NOT NULL,
  qty integer NOT NULL DEFAULT 1,
  unit_price_cents integer NOT NULL DEFAULT 0,
  modifiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_venue_status ON public.orders(venue_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders rw" ON public.orders FOR ALL
  USING (public.is_venue_member(auth.uid(), venue_id))
  WITH CHECK (public.is_venue_member(auth.uid(), venue_id));

CREATE POLICY "order_items rw" ON public.order_items FOR ALL
  USING (public.is_venue_member(auth.uid(), venue_id))
  WITH CHECK (public.is_venue_member(auth.uid(), venue_id));

CREATE TRIGGER orders_touch BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
