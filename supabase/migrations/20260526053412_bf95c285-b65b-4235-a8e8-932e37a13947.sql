DROP POLICY IF EXISTS "integrations read" ON public.integrations;
DROP POLICY IF EXISTS "integrations write" ON public.integrations;

CREATE POLICY "integrations read"
  ON public.integrations
  FOR SELECT
  USING (public.can_manage_venue(auth.uid(), venue_id));

CREATE POLICY "integrations write"
  ON public.integrations
  FOR ALL
  USING (public.can_manage_venue(auth.uid(), venue_id))
  WITH CHECK (public.can_manage_venue(auth.uid(), venue_id));