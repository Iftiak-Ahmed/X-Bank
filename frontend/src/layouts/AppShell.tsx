import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Logo } from "../components/Logo";

interface NavItem {
  label: string;
  to: string;
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const sidebar = (
    <>
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
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
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
            `block rounded-lg border px-3 py-2 text-center text-sm font-medium transition ${
              isActive
                ? "border-white/25 bg-white/10 text-white"
                : "border-white/15 text-slate-200 hover:border-white/25 hover:bg-white/5"
            }`
          }
        >
          My Profile
        </NavLink>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-navy-950 px-4 py-3 text-slate-100 md:hidden">
        <Logo className="h-6 w-auto" variant="light" />
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="rounded-md p-1.5 text-slate-200 hover:bg-white/10"
        >
          <MenuIcon />
        </button>
      </div>

      {/* Mobile drawer + backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-navy-950 text-slate-100 shadow-xl">
            <div className="flex justify-end px-3 pt-3">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="rounded-md p-1.5 text-slate-300 hover:bg-white/10"
              >
                <CloseIcon />
              </button>
            </div>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-none flex-col bg-navy-950 text-slate-100 shadow-xl md:flex">{sidebar}</aside>

      <main className="min-w-0 flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:px-10 md:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
