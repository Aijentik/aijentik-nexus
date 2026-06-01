// Returns menu items that should be visible to the AI for ordering.
// If the venue has any menus rows, only items from live menus are returned.
// If no menus exist yet (legacy data), returns all items as a fallback.
export async function fetchLiveMenuItems(
  sb: any,
  venueId: string,
  columns = "name,price,section,description",
  limit = 200,
) {
  const { data: menus } = await sb.from("menus").select("id,is_live").eq("venue_id", venueId);
  if (menus && menus.length) {
    const liveIds = menus.filter((m: any) => m.is_live).map((m: any) => m.id);
    if (!liveIds.length) return [];
    const { data } = await sb
      .from("menu_items")
      .select(columns)
      .eq("venue_id", venueId)
      .in("menu_id", liveIds)
      .order("position")
      .limit(limit);
    return data || [];
  }
  const { data } = await sb
    .from("menu_items")
    .select(columns)
    .eq("venue_id", venueId)
    .order("position")
    .limit(limit);
  return data || [];
}
