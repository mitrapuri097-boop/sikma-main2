import React, { FormEvent, useMemo, useState } from "react";
import { Building2, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Eye, EyeOff, FileCheck2, LockKeyhole, Mail, MapPin, Phone, ShieldCheck, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "./api";

const INSTITUTION_TYPES = [
  "Kementerian / Lembaga",
  "Pemerintah Provinsi",
  "Pemerintah Kabupaten / Kota",
  "UPT / Unit Pelaksana Teknis",
  "Badan Usaha Milik Negara / Daerah",
  "Perguruan Tinggi",
  "Lembaga / Organisasi Resmi",
];

const REQUEST_TIMEOUT_MS = 20000;

interface FormState {
  institutionName: string;
  institutionType: string;
  province: string;
  address: string;
  website: string;
  picName: string;
  position: string;
  email: string;
  phone: string;
  username: string;
  password: string;
  passwordConfirm: string;
  reason: string;
  websiteTrap: string;
}

const initialForm: FormState = {
  institutionName: "",
  institutionType: "",
  province: "",
  address: "",
  website: "",
  picName: "",
  position: "",
  email: "",
  phone: "",
  username: "",
  password: "",
  passwordConfirm: "",
  reason: "",
  websiteTrap: "",
};

const inputClass = "h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10";
const labelClass = "mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-600";

export default function RegistrasiInstansi() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ requestId?: string; message: string } | null>(null);

  const update = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (error) setError("");
  };

  const passwordScore = useMemo(() => {
    let score = 0;
    if (form.password.length >= 8) score++;
    if (/[A-Z]/.test(form.password)) score++;
    if (/[a-z]/.test(form.password)) score++;
    if (/\d/.test(form.password)) score++;
    if (/[^A-Za-z0-9]/.test(form.password)) score++;
    return score;
  }, [form.password]);

  const validateStep = (targetStep: number) => {
    setError("");
    if (targetStep === 2) {
      if (!form.institutionName.trim() || !form.institutionType || !form.province.trim() || !form.address.trim()) {
        setError("Lengkapi data instansi terlebih dahulu.");
        return false;
      }
    }
    if (targetStep === 3) {
      if (!form.picName.trim() || !form.position.trim() || !form.email.trim() || !form.username.trim()) {
        setError("Lengkapi data penanggung jawab dan akun.");
        return false;
      }
      if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
        setError("Format email belum valid.");
        return false;
      }
      if (form.username.trim().length < 4) {
        setError("Username minimal 4 karakter.");
        return false;
      }
      if (form.password.length < 8 || passwordScore < 3) {
        setError("Password minimal 8 karakter dan gunakan kombinasi huruf serta angka.");
        return false;
      }
      if (form.password !== form.passwordConfirm) {
        setError("Konfirmasi password tidak sama.");
        return false;
      }
    }
    return true;
  };

  const next = () => {
    if (step < 3 && validateStep(step + 1)) setStep((prev) => prev + 1);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validateStep(2) || !validateStep(3)) return;
    if (form.websiteTrap) return;

    setLoading(true);
    setError("");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${API_URL}/api/member-registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          institutionName: form.institutionName.trim(),
          institutionType: form.institutionType,
          province: form.province.trim(),
          address: form.address.trim(),
          website: form.website.trim(),
          picName: form.picName.trim(),
          position: form.position.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim(),
          username: form.username.trim(),
          password: form.password,
          reason: form.reason.trim(),
        }),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) throw new Error(result.message || `Registrasi gagal (${response.status}).`);
      setSuccess({ requestId: result.data?.requestId, message: result.message || "Permohonan registrasi berhasil dikirim." });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Server tidak merespons. Silakan coba kembali.");
      } else {
        setError(err instanceof Error ? err.message : "Terjadi kesalahan saat mengirim registrasi.");
      }
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#06171a] text-slate-900">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute -right-40 bottom-[-180px] h-[560px] w-[560px] rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.7) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
      </div>

      <div className="relative z-10 mx-auto grid min-h-screen max-w-[1500px] lg:grid-cols-[.8fr_1.2fr]">
        <section className="hidden flex-col justify-between p-10 lg:flex xl:p-14">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-xl font-black text-white shadow-xl shadow-emerald-500/20">S</div>
            <div>
              <div className="text-xl font-black tracking-tight text-white">SIMITI</div>
              <div className="text-[9px] font-semibold uppercase tracking-[.24em] text-emerald-300">Enterprise GIS</div>
            </div>
          </div>

          <div className="max-w-md">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-[10px] font-bold text-emerald-200">
              <ShieldCheck size={14} /> Institutional Membership
            </div>
            <h1 className="text-4xl font-black leading-tight text-white xl:text-5xl">Bergabung sebagai<br /><span className="text-emerald-400">Member Instansi</span></h1>
            <p className="mt-5 text-sm leading-7 text-slate-400">Akses kolaborasi data, analisis spasial, dashboard risiko, dan layanan GIS SIMITI sesuai kewenangan instansi.</p>
            <div className="mt-8 space-y-3">
              {["Verifikasi oleh administrator", "Hak akses berbasis instansi", "Audit trail & status persetujuan", "Data tetap terisolasi sesuai otorisasi"].map((item) => (
                <div key={item} className="flex items-center gap-3 text-xs text-slate-300"><CheckCircle2 size={15} className="text-emerald-400" />{item}</div>
              ))}
            </div>
          </div>

          <div className="text-[10px] text-slate-600">© 2026 SIMITI Enterprise GIS · Institutional Access</div>
        </section>

        <section className="flex items-center justify-center p-4 sm:p-8 lg:p-10">
          <div className="w-full max-w-3xl">
            <div className="mb-4 flex items-center justify-between text-white lg:hidden">
              <div className="flex items-center gap-2"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 font-black">S</div><div><b>SIMITI</b><div className="text-[8px] uppercase tracking-widest text-emerald-300">Enterprise GIS</div></div></div>
              <button type="button" onClick={() => navigate("/login")} className="text-xs text-slate-400 hover:text-white">Masuk</button>
            </div>

            <div className="overflow-hidden rounded-[28px] border border-white/60 bg-white shadow-2xl shadow-black/30">
              <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-5 sm:px-7">
                <div className="flex items-start justify-between gap-4">
                  <div><div className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-600">Member Registration</div><h2 className="mt-1 text-xl font-black text-slate-900 sm:text-2xl">Registrasi Instansi</h2><p className="mt-1 text-xs text-slate-500">Permohonan akan masuk ke antrean approval administrator.</p></div>
                  <div className="hidden rounded-2xl bg-white p-3 text-emerald-600 shadow-sm sm:block"><Building2 size={23} /></div>
                </div>

                {!success && <div className="mt-6 grid grid-cols-3 gap-2">
                  {[{n:1,t:"Instansi",i:<Building2 size={13}/>},{n:2,t:"PIC & Akun",i:<UserRound size={13}/>},{n:3,t:"Review",i:<ClipboardCheck size={13}/>}].map((s) => (
                    <div key={s.n} className={`rounded-xl border px-3 py-2 ${step === s.n ? "border-emerald-200 bg-emerald-50 text-emerald-700" : step > s.n ? "border-emerald-100 bg-white text-emerald-500" : "border-slate-200 bg-white text-slate-400"}`}><div className="flex items-center gap-2 text-[10px] font-bold">{s.i}<span>{s.n}. {s.t}</span></div></div>
                  ))}
                </div>}
              </div>

              {success ? (
                <div className="p-6 sm:p-8">
                  <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-6 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"><FileCheck2 size={30}/></div>
                    <h3 className="mt-5 text-xl font-black text-slate-900">Permohonan Terkirim</h3>
                    <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">{success.message} Administrator akan memeriksa data instansi sebelum akun diaktifkan.</p>
                    {success.requestId && <div className="mx-auto mt-5 max-w-sm rounded-2xl border border-white bg-white p-4 text-left"><div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Nomor Permohonan</div><div className="mt-1 font-mono text-sm font-black text-emerald-700">{success.requestId}</div></div>}
                    <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row"><button type="button" onClick={() => navigate("/login")} className="h-11 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white hover:bg-emerald-700">Kembali ke Login</button><button type="button" onClick={() => { setSuccess(null); setForm(initialForm); setStep(1); }} className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 hover:bg-slate-50">Registrasi Instansi Lain</button></div>
                  </div>
                </div>
              ) : (
                <form onSubmit={submit} className="p-5 sm:p-7">
                  {error && <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">{error}</div>}

                  {step === 1 && <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2"><label className={labelClass}>Nama Instansi *</label><div className="relative"><Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input className={`${inputClass} pl-10`} value={form.institutionName} onChange={(e) => update("institutionName", e.target.value)} placeholder="Contoh: Dinas Kehutanan Provinsi ..." /></div></div>
                    <div><label className={labelClass}>Jenis Instansi *</label><select className={inputClass} value={form.institutionType} onChange={(e) => update("institutionType", e.target.value)}><option value="">Pilih jenis instansi</option>{INSTITUTION_TYPES.map((x) => <option key={x}>{x}</option>)}</select></div>
                    <div><label className={labelClass}>Provinsi / Wilayah *</label><div className="relative"><MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input className={`${inputClass} pl-10`} value={form.province} onChange={(e) => update("province", e.target.value)} placeholder="Jawa Barat" /></div></div>
                    <div className="sm:col-span-2"><label className={labelClass}>Alamat Instansi *</label><textarea className="min-h-[90px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10" value={form.address} onChange={(e) => update("address", e.target.value)} placeholder="Alamat kantor / unit kerja" /></div>
                    <div className="sm:col-span-2"><label className={labelClass}>Website Instansi</label><input className={inputClass} value={form.website} onChange={(e) => update("website", e.target.value)} placeholder="https://instansi.go.id" /></div>
                  </div>}

                  {step === 2 && <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2 rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><div className="text-[9px] font-black uppercase tracking-wider text-emerald-700">Penanggung Jawab</div><div className="mt-1 text-xs text-slate-600">Gunakan email dinas/organisasi yang dapat diverifikasi.</div></div>
                    <div><label className={labelClass}>Nama PIC *</label><input className={inputClass} value={form.picName} onChange={(e) => update("picName", e.target.value)} placeholder="Nama lengkap" /></div>
                    <div><label className={labelClass}>Jabatan *</label><input className={inputClass} value={form.position} onChange={(e) => update("position", e.target.value)} placeholder="Kepala Seksi / Admin GIS" /></div>
                    <div><label className={labelClass}>Email Dinas *</label><div className="relative"><Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input type="email" className={`${inputClass} pl-10`} value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="nama@instansi.go.id" /></div></div>
                    <div><label className={labelClass}>Nomor Telepon</label><div className="relative"><Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input className={`${inputClass} pl-10`} value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="08xxxxxxxxxx" /></div></div>
                    <div><label className={labelClass}>Username *</label><input className={inputClass} value={form.username} onChange={(e) => update("username", e.target.value)} placeholder="username instansi" autoComplete="username" /></div>
                    <div><label className={labelClass}>Password *</label><div className="relative"><LockKeyhole size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input type={showPassword ? "text" : "password"} className={`${inputClass} pl-10 pr-10`} value={form.password} onChange={(e) => update("password", e.target.value)} placeholder="Minimal 8 karakter" autoComplete="new-password"/><button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div><div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{width:`${passwordScore * 20}%`}}/></div></div>
                    <div><label className={labelClass}>Konfirmasi Password *</label><div className="relative"><input type={showConfirm ? "text" : "password"} className={`${inputClass} pr-10`} value={form.passwordConfirm} onChange={(e) => update("passwordConfirm", e.target.value)} placeholder="Ulangi password" autoComplete="new-password"/><button type="button" onClick={() => setShowConfirm((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{showConfirm ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></div>
                  </div>}

                  {step === 3 && <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between"><div><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Instansi</div><div className="mt-1 font-black text-slate-900">{form.institutionName}</div><div className="mt-1 text-xs text-slate-500">{form.institutionType} · {form.province}</div></div><Building2 className="text-emerald-600" size={22}/></div></div>
                    <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-slate-200 p-4"><div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Penanggung Jawab</div><div className="mt-1 text-sm font-bold">{form.picName}</div><div className="text-xs text-slate-500">{form.position}</div></div><div className="rounded-2xl border border-slate-200 p-4"><div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Akun</div><div className="mt-1 text-sm font-bold">{form.username}</div><div className="text-xs text-slate-500">{form.email}</div></div></div>
                    <div><label className={labelClass}>Tujuan Penggunaan SIMITI</label><textarea className="min-h-[105px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10" value={form.reason} onChange={(e) => update("reason", e.target.value)} placeholder="Jelaskan kebutuhan akses, unit yang akan menggunakan, dan jenis data/analisis yang dibutuhkan." /></div>
                    <input tabIndex={-1} autoComplete="off" value={form.websiteTrap} onChange={(e) => update("websiteTrap", e.target.value)} className="hidden" aria-hidden="true" />
                    <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800"><b>Catatan approval:</b> akun belum aktif setelah submit. Administrator akan melakukan verifikasi instansi dan menentukan role/hak akses sebelum akun dapat digunakan.</div>
                  </div>}

                  <div className="mt-7 flex items-center justify-between border-t border-slate-100 pt-5">
                    <button type="button" onClick={() => step === 1 ? navigate("/login") : setStep((v) => v - 1)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 hover:bg-slate-50"><ChevronLeft size={16}/>{step === 1 ? "Kembali Login" : "Sebelumnya"}</button>
                    {step < 3 ? <button type="button" onClick={next} className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-xs font-black text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700">Lanjut <ChevronRight size={16}/></button> : <button type="submit" disabled={loading} className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-xs font-black text-white shadow-lg shadow-emerald-600/20 disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Mengirim..." : "Kirim Permohonan"}<ShieldCheck size={16}/></button>}
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
