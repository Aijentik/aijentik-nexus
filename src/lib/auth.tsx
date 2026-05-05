import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

type Venue = { id: string; name: string; venue_type?: string | null; status?: string | null };

type Ctx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  venue: Venue | null;
  venues: Venue[];
  setActiveVenue: (id: string) => Promise<void>;
  refreshVenues: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>(null as any);

export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venue, setVenue] = useState<Venue | null>(null);

  const refreshVenues = async () => {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) { setVenues([]); setVenue(null); return; }
    const { data: vs } = await supabase.from("venues").select("id,name,venue_type,status").order("created_at", { ascending: true });
    setVenues(vs || []);
    const { data: prof } = await supabase.from("profiles").select("current_venue_id").eq("user_id", u.id).maybeSingle();
    const active = (vs || []).find(v => v.id === prof?.current_venue_id) || (vs || [])[0] || null;
    setVenue(active);
  };

  const setActiveVenue = async (id: string) => {
    const v = venues.find(x => x.id === id);
    if (!v) return;
    setVenue(v);
    const { data: { user: u } } = await supabase.auth.getUser();
    if (u) await supabase.from("profiles").update({ current_venue_id: id }).eq("user_id", u.id);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) setTimeout(refreshVenues, 0);
      else { setVenues([]); setVenue(null); }
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
      if (s?.user) refreshVenues();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <AuthCtx.Provider value={{ user, session, loading, venue, venues, setActiveVenue, refreshVenues, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}
