import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { Logo } from "../../components/Logo";
import bdGeo from "../../data/bdGeo.json";
import NATIONALITIES from "../../data/nationalities.json";

interface GeoItem {
  id: string;
  name: string;
  bn: string;
}
interface District extends GeoItem {
  divisionId: string;
}
interface Upazila extends GeoItem {
  districtId: string;
}
interface UnionArea extends GeoItem {
  upazilaId: string;
}

const DIVISIONS = bdGeo.divisions as GeoItem[];
const DISTRICTS = bdGeo.districts as District[];
const UPAZILAS = bdGeo.upazilas as Upazila[];
const UNIONS = bdGeo.unions as UnionArea[];

interface AddressSelection {
  divisionId: string;
  districtId: string;
  upazilaId: string;
  unionId: string;
}

const EMPTY_ADDRESS: AddressSelection = { divisionId: "", districtId: "", upazilaId: "", unionId: "" };

const OCCUPATIONS = [
  "Government Service",
  "Private Service",
  "Defence Service",
  "Business",
  "Student",
  "Freelancer",
  "Self-Employed",
];

const initial = {
  fullName: "",
  dateOfBirth: "",
  gender: "",
  email: "",
  phone: "",
  address: "",
  occupation: "",
  nationality: "",
  nidNumber: "",
};

export default function Register() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(initial);
  const [address, setAddress] = useState<AddressSelection>(EMPTY_ADDRESS);
  const [files, setFiles] = useState<{ ownPhoto: File | null; nidFront: File | null; nidBack: File | null; signature: File | null }>({
    ownPhoto: null,
    nidFront: null,
    nidBack: null,
    signature: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ applicationId: string } | null>(null);

  const isForeignNational = form.nationality.trim() !== "" && form.nationality.trim().toLowerCase() !== "bangladeshi";
  const docType = isForeignNational ? "passport" : "nid";

  function update<K extends keyof typeof initial>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function updateAddress(next: AddressSelection) {
    setAddress(next);
    const division = DIVISIONS.find((d) => d.id === next.divisionId);
    const district = DISTRICTS.find((d) => d.id === next.districtId);
    const upazila = UPAZILAS.find((u) => u.id === next.upazilaId);
    const union = UNIONS.find((u) => u.id === next.unionId);
    update("address", [union?.name, upazila?.name, district?.name, division?.name].filter(Boolean).join(", "));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!files.ownPhoto || !files.nidFront || !files.signature || (!isForeignNational && !files.nidBack)) {
      setError(
        isForeignNational
          ? "Your photo, passport photo, and signature images are all required."
          : "Your photo, NID front, NID back, and signature images are all required."
      );
      return;
    }
    setSubmitting(true);
    try {
      const data = new FormData();
      Object.entries(form).forEach(([k, v]) => data.append(k, v));
      data.append("docType", docType);
      data.append("ownPhoto", files.ownPhoto);
      data.append("nidFront", files.nidFront);
      if (files.nidBack) data.append("nidBack", files.nidBack);
      data.append("signature", files.signature);
      const result = await api.postForm<{ applicationId: string; status: string }>("/api/public/applications", data);
      setSuccess(result);
    } catch (err: any) {
      setError(err.message ?? "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm rounded-xl border border-slate-300 bg-white p-8 text-center shadow-sm">
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

        <div className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm sm:p-8">
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Date of birth" type="date" value={form.dateOfBirth} onChange={(v) => update("dateOfBirth", v)} />
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Gender</label>
                    <select required value={form.gender} onChange={(e) => update("gender", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-400 bg-slate-50 px-3 py-2 text-sm shadow-sm focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-600">
                      <option value="">Select…</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <Field
                  label="Email"
                  type="email"
                  placeholder="example@gmail.com"
                  value={form.email}
                  onChange={(v) => update("email", v)}
                />
                <Field
                  label="Phone"
                  type="tel"
                  placeholder="Insert your mobile number"
                  inputMode="numeric"
                  pattern="[0-9]{11}"
                  maxLength={11}
                  title="Enter an 11-digit mobile number."
                  value={form.phone}
                  onChange={(v) => update("phone", v.replace(/\D/g, "").slice(0, 11))}
                />
                <AddressSelector value={address} onChange={updateAddress} />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Occupation</label>
                    <select
                      required
                      value={form.occupation}
                      onChange={(e) => update("occupation", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-400 bg-slate-50 px-3 py-2 text-sm shadow-sm focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
                    >
                      <option value="">Select occupation…</option>
                      {OCCUPATIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <Field
                      label="Nationality"
                      placeholder="e.g. Bangladeshi"
                      list="nationality-suggestions"
                      inputClassName="nationality-input"
                      value={form.nationality}
                      onChange={(v) => update("nationality", v)}
                    />
                    <datalist id="nationality-suggestions">
                      {NATIONALITIES.map((n) => <option key={n} value={n} />)}
                    </datalist>
                  </div>
                </div>
                <button type="button" onClick={() => setStep(2)} className="w-full rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800">
                  Continue
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <Field
                  label={isForeignNational ? "Passport number" : "NID number"}
                  value={form.nidNumber}
                  onChange={(v) => update("nidNumber", v)}
                />
                <FileField label="Your photo" file={files.ownPhoto} onChange={(f) => setFiles((x) => ({ ...x, ownPhoto: f }))} />
                {isForeignNational ? (
                  <FileField label="Passport photo" file={files.nidFront} onChange={(f) => setFiles((x) => ({ ...x, nidFront: f }))} />
                ) : (
                  <>
                    <FileField label="NID front photo" file={files.nidFront} onChange={(f) => setFiles((x) => ({ ...x, nidFront: f }))} />
                    <FileField label="NID back photo" file={files.nidBack} onChange={(f) => setFiles((x) => ({ ...x, nidBack: f }))} />
                  </>
                )}
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
                      {(() => {
                        const requiredFiles = [files.ownPhoto, files.nidFront, files.signature, ...(isForeignNational ? [] : [files.nidBack])];
                        return requiredFiles.every(Boolean) ? `${requiredFiles.length} files attached` : "Missing files";
                      })()}
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

function AddressSelector({ value, onChange }: { value: AddressSelection; onChange: (next: AddressSelection) => void }) {
  const districts = DISTRICTS.filter((d) => d.divisionId === value.divisionId);
  const upazilas = UPAZILAS.filter((u) => u.districtId === value.districtId);
  const unions = UNIONS.filter((u) => u.upazilaId === value.upazilaId);

  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Address</label>
      <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <select
          required
          value={value.divisionId}
          onChange={(e) => onChange({ divisionId: e.target.value, districtId: "", upazilaId: "", unionId: "" })}
          className="rounded-lg border border-slate-400 bg-slate-50 px-3 py-2 text-sm shadow-sm focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
        >
          <option value="">Division…</option>
          {DIVISIONS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>

        <select
          required
          disabled={!value.divisionId}
          value={value.districtId}
          onChange={(e) => onChange({ ...value, districtId: e.target.value, upazilaId: "", unionId: "" })}
          className="rounded-lg border border-slate-400 bg-slate-50 px-3 py-2 text-sm shadow-sm focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-600 disabled:bg-slate-100 disabled:text-slate-400"
        >
          <option value="">District…</option>
          {districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>

        <select
          required
          disabled={!value.districtId}
          value={value.upazilaId}
          onChange={(e) => onChange({ ...value, upazilaId: e.target.value, unionId: "" })}
          className="rounded-lg border border-slate-400 bg-slate-50 px-3 py-2 text-sm shadow-sm focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-600 disabled:bg-slate-100 disabled:text-slate-400"
        >
          <option value="">Thana / Upazila…</option>
          {upazilas.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>

        <select
          disabled={!value.upazilaId || unions.length === 0}
          value={value.unionId}
          onChange={(e) => onChange({ ...value, unionId: e.target.value })}
          className="rounded-lg border border-slate-400 bg-slate-50 px-3 py-2 text-sm shadow-sm focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-600 disabled:bg-slate-100 disabled:text-slate-400"
        >
          <option value="">{value.upazilaId && unions.length === 0 ? "No unions listed" : "Union…"}</option>
          {unions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
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

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  pattern,
  maxLength,
  inputMode,
  title,
  list,
  inputClassName = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  pattern?: string;
  maxLength?: number;
  inputMode?: "text" | "numeric" | "email" | "tel";
  title?: string;
  list?: string;
  inputClassName?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      <input
        type={type}
        required
        placeholder={placeholder}
        pattern={pattern}
        maxLength={maxLength}
        inputMode={inputMode}
        title={title}
        list={list}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full rounded-lg border border-slate-400 bg-slate-50 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-600 ${inputClassName}`}
      />
    </div>
  );
}

function FileField({ label, file, onChange }: { label: string; file: File | null; onChange: (f: File | null) => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      <div className="mt-1 flex items-center gap-3">
        <div className="flex-1">
          <input
            type="file"
            required
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => onChange(e.target.files?.[0] ?? null)}
            className="w-full rounded-lg border border-slate-400 bg-slate-50 px-3 py-2 text-sm shadow-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-200 file:px-3 file:py-1.5 file:text-xs file:font-semibold"
          />
          {file && <p className="mt-1 text-xs text-teal-700">{file.name}</p>}
        </div>
        {previewUrl && (
          <img
            src={previewUrl}
            alt={`${label} preview`}
            className="h-14 w-14 shrink-0 rounded-lg border border-slate-300 object-cover"
          />
        )}
      </div>
    </div>
  );
}
