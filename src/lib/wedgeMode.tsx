import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";

const KEY = "aijentik:wedgeMode";
export const WEDGE_PASSWORD = "password";

// Routes that remain available when Wedge Mode is active.
export const WEDGE_ALLOWED_PATHS = [
  "/app",
  "/app/voice",
  "/app/calls",
  "/app/agents",
  "/app/knowledge",
  "/app/settings",
];

export function isPathAllowedInWedge(pathname: string) {
  // Exact match for /app, prefix match for the rest.
  if (pathname === "/app") return true;
  return WEDGE_ALLOWED_PATHS.some(p => p !== "/app" && (pathname === p || pathname.startsWith(p + "/")));
}

type Ctx = {
  wedgeMode: boolean;
  setWedgeMode: (v: boolean) => void;
};

const WedgeCtx = createContext<Ctx>({ wedgeMode: false, setWedgeMode: () => {} });

export function WedgeModeProvider({ children }: { children: ReactNode }) {
  const [wedgeMode, setWedge] = useState<boolean>(() => {
    try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
  });

  const setWedgeMode = useCallback((v: boolean) => {
    setWedge(v);
    try { localStorage.setItem(KEY, v ? "1" : "0"); } catch {}
    // Notify other tabs/components
    window.dispatchEvent(new CustomEvent("aijentik:wedge-changed", { detail: v }));
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setWedge(e.newValue === "1");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return <WedgeCtx.Provider value={{ wedgeMode, setWedgeMode }}>{children}</WedgeCtx.Provider>;
}

export const useWedgeMode = () => useContext(WedgeCtx);
