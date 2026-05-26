-- 1. Prevent privilege escalation via user_roles: only the venue owner can grant the 'owner' role.
DROP POLICY IF EXISTS "manage roles" ON public.user_roles;

CREATE POLICY "manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  public.can_manage_venue(auth.uid(), venue_id)
  AND (
    role <> 'owner'::public.app_role
    OR auth.uid() = (SELECT owner_id FROM public.venues WHERE id = venue_id)
  )
)
WITH CHECK (
  public.can_manage_venue(auth.uid(), venue_id)
  AND (
    role <> 'owner'::public.app_role
    OR auth.uid() = (SELECT owner_id FROM public.venues WHERE id = venue_id)
  )
);

-- 2. Replace always-true INSERT on mixer_debug_log with an authenticated-only check.
DROP POLICY IF EXISTS "authenticated can insert mixer debug" ON public.mixer_debug_log;

CREATE POLICY "authenticated can insert mixer debug"
ON public.mixer_debug_log
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);