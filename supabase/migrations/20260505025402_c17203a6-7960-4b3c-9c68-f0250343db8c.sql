GRANT EXECUTE ON FUNCTION public.is_venue_member(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_venue(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_venue_role(uuid, uuid, public.app_role) TO authenticated, anon;