import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, signInWithCustomToken, signOut, User } from "firebase/auth";
import { firebaseAuth, authReady } from "../lib/firebase";
import { api } from "../lib/api";

export type Role = "client" | "employee" | "compliance_officer" | "admin";
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
  awaitingApproval: boolean;
  login: (role: LoginRoleOption, userId: string, password: string) => Promise<Profile>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const APPROVAL_POLL_MS = 2000;
const APPROVAL_MAX_POLLS = 160; // ~5.3 minutes, just past the server-side 5 minute timeout

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [awaitingApproval, setAwaitingApproval] = useState(false);

  useEffect(() => {
    let unsubscribe = () => {};
    authReady.then(() => {
      unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
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
    });
    return () => unsubscribe();
  }, []);

  async function login(role: LoginRoleOption, userId: string, password: string): Promise<Profile> {
    const res = await api.post<
      { customToken: string; role: Role; mustChangePassword: boolean } | { pendingApproval: true; requestId: string }
    >("/api/auth/login", { role, userId, password });

    let customToken: string;
    if ("pendingApproval" in res) {
      setAwaitingApproval(true);
      try {
        customToken = await pollForApproval(res.requestId);
      } finally {
        setAwaitingApproval(false);
      }
    } else {
      customToken = res.customToken;
    }

    await authReady;
    await signInWithCustomToken(firebaseAuth, customToken);
    const me = await api.get<Profile>("/api/auth/me");
    setProfile(me);
    return me;
  }

  async function pollForApproval(requestId: string): Promise<string> {
    for (let i = 0; i < APPROVAL_MAX_POLLS; i++) {
      await sleep(APPROVAL_POLL_MS);
      const status = await api.get<{ status: string; customToken?: string }>(`/api/auth/login-requests/${requestId}/status`);
      if (status.status === "approved" && status.customToken) return status.customToken;
      if (status.status === "denied") throw new Error("Your login request was denied by an administrator.");
      if (status.status === "expired") throw new Error("The approval request expired. Please try logging in again.");
    }
    throw new Error("Approval timed out. Please try logging in again.");
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
    <AuthContext.Provider value={{ firebaseUser, profile, loading, awaitingApproval, login, logout, refreshProfile }}>
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
      return "/compliance/dashboard";
    case "admin":
      return "/admin/dashboard";
  }
}
