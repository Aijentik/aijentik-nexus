
CREATE TABLE public.menus (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Menu',
  is_live boolean NOT NULL DEFAULT true,
  source_url text,
  raw_text text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.menus TO authenticated;
GRANT ALL ON public.menus TO service_role;

ALTER TABLE public.menus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menus read" ON public.menus FOR SELECT
  USING (public.is_venue_member(auth.uid(), venue_id));
CREATE POLICY "menus write" ON public.menus FOR ALL
  USING (public.is_venue_member(auth.uid(), venue_id))
  WITH CHECK (public.is_venue_member(auth.uid(), venue_id));

CREATE TRIGGER menus_touch_updated_at BEFORE UPDATE ON public.menus
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_menus_venue ON public.menus(venue_id);

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS menu_id uuid REFERENCES public.menus(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_menu_items_menu ON public.menu_items(menu_id);
