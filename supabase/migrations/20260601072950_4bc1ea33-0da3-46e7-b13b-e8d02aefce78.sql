
-- Agents: restrict writes to managers/owners
DROP POLICY IF EXISTS "agents write" ON public.agents;
CREATE POLICY "agents insert managers" ON public.agents FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_venue(auth.uid(), venue_id));
CREATE POLICY "agents update managers" ON public.agents FOR UPDATE TO authenticated
  USING (public.can_manage_venue(auth.uid(), venue_id))
  WITH CHECK (public.can_manage_venue(auth.uid(), venue_id));
CREATE POLICY "agents delete managers" ON public.agents FOR DELETE TO authenticated
  USING (public.can_manage_venue(auth.uid(), venue_id));

-- Email inboxes: restrict writes to managers/owners; keep read for any member
DROP POLICY IF EXISTS "email_inboxes rw" ON public.email_inboxes;
CREATE POLICY "email_inboxes read members" ON public.email_inboxes FOR SELECT TO authenticated
  USING (public.is_venue_member(auth.uid(), venue_id));
CREATE POLICY "email_inboxes write managers" ON public.email_inboxes FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_venue(auth.uid(), venue_id));
CREATE POLICY "email_inboxes update managers" ON public.email_inboxes FOR UPDATE TO authenticated
  USING (public.can_manage_venue(auth.uid(), venue_id))
  WITH CHECK (public.can_manage_venue(auth.uid(), venue_id));
CREATE POLICY "email_inboxes delete managers" ON public.email_inboxes FOR DELETE TO authenticated
  USING (public.can_manage_venue(auth.uid(), venue_id));

-- Mixer debug log: remove broad authenticated read access (service role bypasses RLS)
DROP POLICY IF EXISTS "authenticated can read mixer debug" ON public.mixer_debug_log;
DROP POLICY IF EXISTS "authenticated can insert mixer debug" ON public.mixer_debug_log;
