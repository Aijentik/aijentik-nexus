import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

type Venue = { id: string; name: string; venue_type?: string | null; status?: string | null; features?: unknown };

type Ctx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  venuesLoaded: boolean;
  venue: Venue | null;
  venues: Venue[];
  setActiveVenue: (id: string) => Promise<void>;
  refreshVenues: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);
let venueRefreshPromise: Promise<void> | null = null;

export const useAuth = () => {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [venuesLoaded, setVenuesLoaded] = useState(false);
  const lastLoadedUserIdRef = useRef<string | null>(null);

  const refreshVenues = async () => {
    if (venueRefreshPromise) return venueRefreshPromise;
    venueRefreshPromise = (async () => {
      // Use the cached session user instead of getUser() to avoid an extra
      // network round-trip that can fail with transient "Load failed" errors
      // right after sign-in and leave us in a half-loaded state.
      const { data: { session: s } } = await supabase.auth.getSession();
      const u = s?.user ?? null;
      if (!u) { setVenues([]); setVenue(null); setVenuesLoaded(true); return; }
      // Retry once on transient failure so we never wipe state from a flaky request.
      const fetchVenues = async () => {
        for (let i = 0; i < 2; i++) {
          const { data, error } = await supabase
            .from("venues")
            .select("id,name,venue_type,status,features")
            .order("created_at", { ascending: true });
          if (!error) return data || [];
          await new Promise(r => setTimeout(r, 400));
        }
        return null; // signal failure (vs empty)
      };
      const vs = await fetchVenues();
      if (vs === null) {
        // Transient failure — keep prior state; just mark loaded so UI doesn't spin forever.
        setVenuesLoaded(true);
        return;
      }
      setVenues(vs);
      const { data: prof } = await supabase
        .from("profiles").select("current_venue_id").eq("user_id", u.id).maybeSingle();
      const active = vs.find(v => v.id === prof?.current_venue_id) || vs[0] || null;
      setVenue(active);
      setVenuesLoaded(true);
    })().catch(() => { setVenuesLoaded(true); }).finally(() => { venueRefreshPromise = null; });
    return venueRefreshPromise;
  };

  const setActiveVenue = async (id: string) => {
    const v = venues.find(x => x.id === id);
    if (!v) return;
    setVenue(v);
    const { data: { user: u } } = await supabase.auth.getUser();
    if (u) await supabase.from("profiles").update({ current_venue_id: id }).eq("user_id", u.id);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "INITIAL_SESSION") return;
      const nextUser = s?.user ?? null;
      setSession(s);
      setUser(nextUser);
      if (nextUser) {
        if (event === "TOKEN_REFRESHED" || lastLoadedUserIdRef.current === nextUser.id) return;
        lastLoadedUserIdRef.current = nextUser.id;
        setVenuesLoaded(false);
        setTimeout(() => { refreshVenues().finally(() => setLoading(false)); }, 0);
      } else {
        lastLoadedUserIdRef.current = null;
        setVenues([]); setVenue(null); setVenuesLoaded(false); setLoading(false);
      }
    });
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        lastLoadedUserIdRef.current = s.user.id;
        await refreshVenues();
      }
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <AuthCtx.Provider value={{ user, session, loading, venuesLoaded, venue, venues, setActiveVenue, refreshVenues, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}
