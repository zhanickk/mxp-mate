import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  role: "vp" | "team_leader" | "manager";
  team_id: string | null;
  member_id: string | null;
};

type AuthState = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isVp: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile() {
    const { data, error } = await supabase.rpc("ensure_profile", {});
    if (error) {
      console.error(error);
      setProfile(null);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setProfile((row as Profile) ?? null);
  }

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next?.user) {
        setTimeout(() => {
          void loadProfile().finally(() => setLoading(false));
        }, 0);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        void loadProfile().finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    user: session?.user ?? null,
    session,
    profile,
    loading,
    isVp: profile?.role === "vp",
    refreshProfile: loadProfile,
    signOut: async () => {
      await supabase.auth.signOut();
      setProfile(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
