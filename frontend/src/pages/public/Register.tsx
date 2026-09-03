import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { Logo } from "../../components/Logo";

type PublicRole = "client" | "employee" | "compliance" | "admin";

const initial = {
  fullName: "",
  dateOfBirth: "",
  gender: "female",
  email: "",
  phone: "",
  address: "",
  occupation: "",
  nationality: "",
  nidNumber: "",
};

export default function Register() {
  const [role, setRole] = useState<PublicRole>("client");
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(initial);
  const [files, setFiles] = useState<{ nidFront: File | null; nidBack: File | null; signature: File | null }>({
    nidFront: null,
    nidBack: null,
    signature: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ applicationId: string } | null>(null);

  function update<K extends keyof typeof initial>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!files.nidFront || !files.nidBack || !files.signature) {
      setError("NID front, NID back, and signature images are all required.");
      return;
    }
    setSubmitting(true);
    try {
      const data = new FormData();
      Object.entries(form).forEach(([k, v]) => data.append(k, v));
      data.append("nidFront", files.nidFront);
      data.append("nidBack", files.nidBack);
      data.append("signature", files.signature);
      const result = await api.postForm<{ applicationId: string; status: string }>("/api/public/applications", data);
      setSuccess(result);
    } catch (err: any) {
      setError(err.message ?? "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (role !== "client") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md">
          <RoleSelector role={role} onChange={setRole} />
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h1 className="font-serif text-xl font-semibold text-navy-900">Staff accounts are provisioned by an administrator</h1>
            <p className="mt-2 text-sm text-slate-500">
              Employee, Compliance Officer, and Admin accounts aren't self-service. Ask your bank's administrator to
              create your account — you'll receive a User ID and temporary password by email.
            </p>
            <Link to="/login" className="mt-6 block rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800">
              Go to login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="font-serif text-xl font-semibold text-navy-900">Application submitted</h1>
          <p className="mt-2 text-sm text-slate-500">Your application ID is</p>
          <p className="mt-1 font-mono text-lg font-semibold text-teal-700">{success.applicationId}</p>
          <p className="mt-3 text-sm text-slate-500">
            Status: <span className="font-semibold text-amber-700">Pending Approval</span>
          </p>
          <p className="mt-3 text-xs text-slate-400">
            An administrator will review your KYC documents. Once approved, your account number, User ID, and a
            temporary password will be sent to your email.
          </p>
          <Link to="/" className="mt-6 block rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-lg">
        <Link to="/" className="mb-6 flex items-center justify-center">
          <Logo className="h-10 w-auto" />
        </Link>
        <RoleSelector role={role} onChange={setRole} />

        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-2 text-xs font-semibold text-slate-400">
            <Step n={1} active={step === 1} done={step > 1} label="Personal" />
            <div className="h-px flex-1 bg-slate-200" />
            <Step n={2} active={step === 2} done={step > 2} label="KYC" />
            <div className="h-px flex-1 bg-slate-200" />
            <Step n={3} active={step === 3} done={false} label="Review" />
          </div>

          <form onSubmit={handleSubmit}>
            {step === 1 && (
              <div className="space-y-4">
                <Field label="Full name" value={form.fullName} onChange={(v) => update("fullName", v)} />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Date of birth" type="date" value={form.dateOfBirth} onChange={(v) => update("dateOfBirth", v)} />
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Gender</label>
                    <select value={form.gender} onChange={(e) => update("gender", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <Field label="Email" type="email" value={form.email} onChange={(v) => update("email", v)} />
                <Field label="Phone" value={form.phone} onChange={(v) => update("phone", v)} />
                <Field label="Address" value={form.address} onChange={(v) => update("address", v)} />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Occupation" value={form.occupation} onChange={(v) => update("occupation", v)} />
                  <Field label="Nationality" value={form.nationality} onChange={(v) => update("nationality", v)} />
                </div>
                <button type="button" onClick={() => setStep(2)} className="w-full rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800">
                  Continue
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <Field label="NID number" value={form.nidNumber} onChange={(v) => update("nidNumber", v)} />
                <FileField label="NID front photo" file={files.nidFront} onChange={(f) => setFiles((x) => ({ ...x, nidFront: f }))} />
                <FileField label="NID back photo" file={files.nidBack} onChange={(f) => setFiles((x) => ({ ...x, nidBack: f }))} />
                <FileField label="Signature image" file={files.signature} onChange={(f) => setFiles((x) => ({ ...x, signature: f }))} />
                <div className="flex gap-3">
                  <button type="button" onClick={() => setStep(1)} className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Back</button>
                  <button type="button" onClick={() => setStep(3)} className="flex-1 rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800">Continue</button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <dl className="space-y-2 text-sm">
                  {Object.entries(form).map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-slate-100 pb-1">
                      <dt className="capitalize text-slate-500">{k.replace(/([A-Z])/g, " $1")}</dt>
                      <dd className="font-medium text-navy-900">{v || "—"}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <dt className="text-slate-500">Documents</dt>
                    <dd className="font-medium text-navy-900">
                      {files.nidFront && files.nidBack && files.signature ? "3 files attached" : "Missing files"}
                    </dd>
                  </div>
                </dl>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex gap-3">
                  <button type="button" onClick={() => setStep(2)} className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Back</button>
                  <button type="submit" disabled={submitting} className="flex-1 rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-50">
                    {submitting ? "Submitting…" : "Submit application"}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
        <p className="mt-6 text-center text-sm text-slate-500">
          Already registered? <Link to="/login" className="font-semibold text-teal-700">Log in</Link>
        </p>
      </div>
    </div>
  );
}

function RoleSelector({ role, onChange }: { role: PublicRole; onChange: (r: PublicRole) => void }) {
  const options: { value: PublicRole; label: string }[] = [
    { value: "client", label: "Client" },
    { value: "employee", label: "Employee" },
    { value: "compliance", label: "Compliance Officer" },
    { value: "admin", label: "Admin" },
  ];
  return (
    <div className="mb-6">
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">I am opening an account as</label>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-lg border px-2 py-2 text-xs font-semibold ${role === o.value ? "border-navy-900 bg-navy-900 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Step({ n, active, done, label }: { n: number; active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`flex h-5 w-5 items-center justify-center rounded-full ${done ? "bg-teal-600 text-white" : active ? "bg-navy-900 text-white" : "bg-slate-200 text-slate-500"}`}>
        {done ? "✓" : n}
      </span>
      <span className={active ? "text-navy-900" : ""}>{label}</span>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      <input
        type={type}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
      />
    </div>
  );
}

function FileField({ label, file, onChange }: { label: string; file: File | null; onChange: (f: File | null) => void }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      <input
        type="file"
        required
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold"
      />
      {file && <p className="mt-1 text-xs text-teal-700">{file.name}</p>}
    </div>
  );
}
