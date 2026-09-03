import { Link } from "react-router-dom";
import { Logo } from "../../components/Logo";

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Logo className="h-9 w-auto" />
          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
            <a href="#contact" className="hover:text-navy-900">Contact</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-semibold text-navy-900">Log in</Link>
            <Link to="/register" className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800">
              Open an account
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-teal-50 via-sky-50 to-amber-50">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-teal-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 top-24 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-purple-200/30 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-widest text-teal-700 shadow-sm ring-1 ring-teal-100">
              <Crescent className="h-3.5 w-3.5" /> 100% Interest-Free &middot; Shariah-Compliant
            </span>
            <h1 className="mt-4 font-serif text-4xl font-semibold leading-tight text-navy-900 md:text-5xl">
              Islamic banking, built with{" "}
              <span className="bg-gradient-to-r from-teal-600 via-emerald-600 to-amber-600 bg-clip-text text-transparent">
                compliance in its bloodstream.
              </span>
            </h1>
            <p className="mt-5 text-lg text-slate-600">
              X Bank is a fully interest-free (Riba-free) digital bank. Every account is structured around profit-and-loss
              sharing, every transfer and deposit is screened in real time by our continuous compliance engine — so your
              money grows in a way that's fast, transparent, and ethical.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-4">
            {[
              { value: "0%", label: "Interest (Riba)", accent: "text-rose-600" },
              { value: "100%", label: "Halal Investments", accent: "text-emerald-600" },
              { value: "24/7", label: "Compliance Monitoring", accent: "text-sky-600" },
              { value: "Live", label: "Zakat-Ready Accounts", accent: "text-amber-600" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-white/80 p-4 text-center shadow-sm ring-1 ring-slate-100">
                <div className={`font-serif text-2xl font-bold ${s.accent}`}>{s.value}</div>
                <div className="mt-1 text-xs font-medium text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer id="contact" className="relative overflow-hidden border-t border-slate-200 bg-navy-950 py-10 text-slate-300">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-teal-500 via-amber-500 to-rose-500" />
        <div className="mx-auto max-w-6xl px-6 text-sm">
          <p>X Bank — an interest-free, Islamic digital banking academic thesis prototype. Not a real financial institution.</p>
        </div>
      </footer>
    </div>
  );
}

function Crescent({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path d="M15.5 3.5a8.5 8.5 0 1 0 5 15.4 8.5 8.5 0 0 1 0-15.4 8.4 8.4 0 0 0-5 0Z" fill="currentColor" />
    </svg>
  );
}

