import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brain, Loader2, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useEffect } from "react";

export default function Auth() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const { user } = useAuth();

  useEffect(() => { if (user) nav("/app"); }, [user, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back.");
        nav("/app");
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin + "/app", data: { display_name: name || email.split("@")[0] } },
        });
        if (error) throw error;
        toast.success("Account created. Signing you in…");
        const { error: e2 } = await supabase.auth.signInWithPassword({ email, password });
        if (e2) toast.message("Check your email to confirm, then sign in."); else nav("/onboarding");
      }
    } catch (err: any) {
      toast.error(err.message || "Authentication failed");
    } finally { setBusy(false); }
  };

  const useTestUser = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: "test@test.com", password: "testtest" });
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success("Signed in as Test Operator"); nav("/app"); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div className="absolute -top-20 -left-20 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute bottom-10 right-10 h-96 w-96 rounded-full bg-accent/15 blur-3xl" />

        <Link to="/" className="relative flex items-center gap-2.5">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center shadow-[0_0_30px_hsl(var(--primary)/0.6)]">
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-semibold tracking-tight text-lg">Aijentik</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Hospitality OS</div>
          </div>
        </Link>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="relative space-y-6 max-w-md">
          <h2 className="text-4xl font-semibold tracking-tight leading-tight">
            The voice operating layer that <span className="gradient-text">runs your venue</span>.
          </h2>
          <p className="text-muted-foreground">
            Forward your phone. Watch the AI build your operation in 60 seconds. Every call answered, every booking captured, every decision narrated.
          </p>
          <div className="space-y-2.5 text-sm">
            {["Voice host that answers like your best front-of-house","Live diary, conflicts, and VIP recognition","Overnight insights that improve themselves"].map(t => (
              <div key={t} className="flex items-center gap-2.5"><Sparkles className="h-4 w-4 text-primary" /> {t}</div>
            ))}
          </div>
        </motion.div>

        <div className="relative text-xs text-muted-foreground">© Aijentik · The future of hospitality.</div>
      </div>

      <div className="flex items-center justify-center p-6 md:p-12">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md glass-strong rounded-2xl p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">{mode === "login" ? "Welcome back" : "Create your operating layer"}</h1>
            <p className="text-sm text-muted-foreground mt-1">{mode === "login" ? "Sign in to your venue." : "60 seconds to live."}</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <Label htmlFor="name">Your name</Label>
                <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Alex Carter" className="mt-1.5" />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@venue.com" className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={4} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="mt-1.5" />
            </div>

            <Button type="submit" disabled={busy} className="w-full bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90 shadow-[0_0_20px_hsl(var(--primary)/0.4)]">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
            <div className="flex-1 h-px bg-border" /> or <div className="flex-1 h-px bg-border" />
          </div>

          <Button variant="outline" onClick={useTestUser} disabled={busy} className="w-full border-white/10 hover:bg-secondary/60">
            Try the demo (test@test.com)
          </Button>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "login" ? "New here?" : "Have an account?"}{" "}
            <button onClick={() => setMode(mode === "login" ? "signup" : "login")} className="text-primary hover:underline font-medium">
              {mode === "login" ? "Create one" : "Sign in"}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
