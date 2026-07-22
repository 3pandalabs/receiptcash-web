import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as api from "../lib/api";
import { ApiError, type AuthUser } from "../lib/api";

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api
      .getCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  async function signIn(email: string, password: string) {
    try {
      const loggedInUser = await api.login(email, password);
      setUser(loggedInUser);
      return { error: null };
    } catch (err) {
      return { error: err instanceof ApiError ? err.message : "Sign in failed" };
    }
  }

  async function signUp(email: string, password: string, displayName?: string) {
    try {
      const newUser = await api.signup(email, password, displayName?.trim() || undefined);
      setUser(newUser);
      return { error: null };
    } catch (err) {
      return { error: err instanceof ApiError ? err.message : "Sign up failed" };
    }
  }

  async function signOut() {
    await api.logout();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
