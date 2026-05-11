
CREATE TABLE public.menu_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL,
  section TEXT NOT NULL DEFAULT 'mains',
  name TEXT NOT NULL,
  description TEXT,
  price TEXT,
  image_url TEXT,
  image_source TEXT,
  source_url TEXT,
  tags TEXT[] DEFAULT '{}',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_menu_items_venue ON public.menu_items(venue_id, section, position);

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_items read" ON public.menu_items
FOR SELECT USING (public.is_venue_member(auth.uid(), venue_id));

CREATE POLICY "menu_items write" ON public.menu_items
FOR ALL USING (public.is_venue_member(auth.uid(), venue_id))
WITH CHECK (public.is_venue_member(auth.uid(), venue_id));

CREATE TRIGGER touch_menu_items_updated_at
BEFORE UPDATE ON public.menu_items
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
