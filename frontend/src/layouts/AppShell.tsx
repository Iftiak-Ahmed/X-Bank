import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Logo } from "../components/Logo";

interface NavItem {
  label: string;
  to: string;
}

export function AppShell({
  navItems,
  roleLabel,
  badgeColor,
  profilePath,
}: {
  navItems: NavItem[];
  roleLabel: string;
  badgeColor: string;
  profilePath: string;
}) {
  const { logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-64 flex-none flex-col bg-navy-950 text-slate-100 shadow-xl">
        <div className="border-b border-white/10 px-5 py-6">
          <div className="flex justify-center">
            <Logo className="h-7 w-auto" variant="light" />
          </div>
          <div className="mt-3 flex justify-center">
            <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${badgeColor}`}>
              {roleLabel}
            </span>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `relative block rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-teal-400" />}
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <NavLink
            to={profilePath}
            className={({ isActive }) =>
              `mb-2 block rounded-lg px-3 py-2 text-center text-sm font-medium transition ${
                isActive ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`
            }
          >
            My Profile
          </NavLink>
          <button
            onClick={() => logout()}
            className="w-full rounded-lg border border-white/15 px-3 py-2 text-left text-sm font-medium text-slate-200 transition hover:border-white/25 hover:bg-white/5"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-6xl px-6 py-8 md:px-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
