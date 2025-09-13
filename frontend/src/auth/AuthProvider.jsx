import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supa } from "../lib/supa";

// Shape: { user, session, loading, signIn, signOut }
const AuthContext = createContext({
  user: null,
  session: null,
  loading: true,
  signIn: async (_email, _password) => ({ error: null }),
  signOut: async () => {},
});

export default function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  // Initial session + auth listener
  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const { data, error } = await supa.auth.getSession();
        if (!isMounted) return;
        if (error) {
          console.warn("getSession error:", error.message);
        } else {
          setSession(data.session ?? null);
          setUser(data.session?.user ?? null);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    const { data: sub } = supa.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
      setUser(newSession?.user ?? null);
    });

    return () => {
      isMounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  async function signIn(email, password) {
    const { data, error } = await supa.auth.signInWithPassword({ email, password });
    if (error) return { error };
    setSession(data.session ?? null);
    setUser(data.user ?? data.session?.user ?? null);
    return { error: null };
  }

  async function signOut() {
    await supa.auth.signOut();
    setSession(null);
    setUser(null);
  }

  const value = useMemo(() => ({ user, session, loading, signIn, signOut }), [user, session, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
