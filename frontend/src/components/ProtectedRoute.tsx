import { Navigate, useLocation } from "react-router-dom";
import { ReactNode } from "react";
import { useAuth, Role } from "../context/AuthContext";

export function ProtectedRoute({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-500">
        Loading session…
      </div>
    );
  }
  if (!profile) return <Navigate to="/login" replace />;
  if (!roles.includes(profile.role)) return <Navigate to="/login" replace />;
  if (profile.mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  return <>{children}</>;
}
