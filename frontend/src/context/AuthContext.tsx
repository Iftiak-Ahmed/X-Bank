import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, signInWithCustomToken, signOut, User } from "firebase/auth";
import { firebaseAuth } from "../lib/firebase";
import { api } from "../lib/api";

export type Role = "client" | "employee" | "compliance_officer" | "compliance_manager" | "admin";
export type LoginRoleOption = "client" | "employee" | "compliance" | "admin";

interface Profile {
  uid: string;
  email: string;
  role: Role;
  status: string;
  userId: string | null;
  fullName: string | null;
  mustChangePassword: boolean;
  customer: { id: string; fullName: string; customerCode: string; kycStatus: string } | null;
}

interface AuthState {
  firebaseUser: User | null;
  profile: Profile | null;
  loading: boolean;
  login: (role: LoginRoleOption, userId: string, password: string) => Promise<Profile>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(firebaseAuth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const me = await api.get<Profile>("/api/auth/me");
          setProfile(me);
        } catch {
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
  }, []);

  async function login(role: LoginRoleOption, userId: string, password: string): Promise<Profile> {
    const res = await api.post<{ customToken: string; role: Role; mustChangePassword: boolean }>("/api/auth/login", {
      role,
      userId,
      password,
    });
    await signInWithCustomToken(firebaseAuth, res.customToken);
    const me = await api.get<Profile>("/api/auth/me");
    setProfile(me);
    return me;
  }

  async function refreshProfile() {
    const me = await api.get<Profile>("/api/auth/me");
    setProfile(me);
  }

  async function logout() {
    await api.post("/api/auth/logout").catch(() => {});
    await signOut(firebaseAuth);
    setProfile(null);
  }

  return (
    <AuthContext.Provider value={{ firebaseUser, profile, loading, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function dashboardPathForRole(role: Role): string {
  switch (role) {
    case "client":
      return "/dashboard";
    case "employee":
      return "/employee/dashboard";
    case "compliance_officer":
    case "compliance_manager":
      return "/compliance/dashboard";
    case "admin":
      return "/admin/dashboard";
  }
}
