import React, { useState } from "react";
import { API_URL } from "./api";
import { ShieldCheck, KeyRound, Building2, Send, CheckCircle2 } from "lucide-react";

const base = String(API_URL).replace(/\/+$/, "");
const endpoint = base.endsWith("/api")
  ? `${base}/external-registration`
  : `${base}/api/external-registration`;

const scopes = [
  ["mitigation:model:read", "Model mitigasi", "Membaca layanan rekomendasi mitigasi."],
  ["mitigation:locations:read", "Lokasi mitigasi", "Mengakses inventaris lokasi yang diizinkan."],
  ["my-location:assessment", "Penilaian risiko lokasi", "Mengirim lokasi untuk dinilai."],
  ["my-location:proximity", "Analisis kedekatan", "Mengakses analisis kedekatan lokasi."]
];

export default function ExternalApiRegistration() {
  const [form, setForm] = useState({
    applicationName: "", organizationName: "", contactName: "",
    email: "", website: "", purpose: "", environment: "development"
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const update = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(old => ({ ...old, [e.target.name]: e.target.value }));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!selected.length) return setError("Pilih minimal satu layanan API.");
    if (!terms) return setError("Persetujuan penggunaan API wajib dicentang.");
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ...form, requestedScopes: selected })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false)
        throw new Error(data.message || `Pengajuan gagal (HTTP ${response.status}).`);
      setMessage(data.message || "Pengajuan berhasil dikirim dan menunggu verifikasi administrator.");
      setForm({ applicationName: "", organizationName: "", contactName: "", email: "", website: "", purpose: "", environment: "development" });
      setSelected([]);
      setTerms(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Koneksi ke server gagal.");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
  const label = "mb-2 block text-sm font-semibold text-slate-700";

  return <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
    <div className="mx-auto max-w-6xl">
      <header className="mb-7 flex items-center gap-3">
        <div className="rounded-2xl bg-blue-700 p-3 text-white"><Building2 size={25}/></div>
        <div><div className="font-black tracking-widest text-blue-900">SIMITI</div><div className="text-xs text-slate-500">Pro Enterprise · Partner API Portal</div></div>
      </header>

      <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-blue-900 to-blue-700 p-7 text-white shadow-xl sm:p-10">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-blue-100"><ShieldCheck size={18}/> PORTAL INTEGRASI MITRA</div>
        <h1 className="max-w-3xl text-3xl font-black leading-tight sm:text-4xl">Daftarkan aplikasi Anda ke SIMITI API</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-blue-100 sm:text-base">Ajukan akses layanan data dan analisis kebencanaan melalui proses verifikasi yang terkontrol. Akses produksi diberikan setelah persetujuan administrator.</p>
      </section>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <h2 className="text-xl font-bold">Formulir pendaftaran mitra</h2>
          <p className="mb-6 mt-2 text-sm text-slate-500">Kolom bertanda * wajib diisi.</p>

          {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
          {message && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="mr-2 inline" size={18}/>{message}</div>}

          <h3 className="mb-4 font-bold text-slate-900">01 · Informasi aplikasi dan organisasi</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {([
              ["applicationName", "Nama aplikasi *", "Contoh: Portal Mitigasi Daerah", true],
              ["organizationName", "Nama organisasi *", "Instansi atau perusahaan", true],
              ["contactName", "Penanggung jawab *", "Nama kontak teknis", true],
              ["email", "Email aktif *", "admin@organisasi.go.id", true],
              ["website", "Website", "https://organisasi.go.id", false]
            ] as const).map(([name, title, placeholder, required]) =>
              <label key={name} className="block">
                <span className={label}>{title}</span>
                <input className={field} name={name} type={name === "email" ? "email" : name === "website" ? "url" : "text"} value={form[name]} onChange={update} placeholder={placeholder} required={required} maxLength={name === "website" ? 500 : 254}/>
              </label>
            )}
            <label className="block"><span className={label}>Lingkungan integrasi *</span>
              <select className={field} name="environment" value={form.environment} onChange={update}>
                <option value="development">Development</option><option value="staging">Staging / UAT</option><option value="production">Produksi</option>
              </select>
            </label>
          </div>

          <h3 className="mb-4 mt-8 font-bold text-slate-900">02 · Tujuan penggunaan API</h3>
          <label className="block"><span className={label}>Deskripsi integrasi *</span>
            <textarea className={field + " min-h-32 resize-y"} name="purpose" value={form.purpose} onChange={update} minLength={20} maxLength={3000} required placeholder="Jelaskan tujuan integrasi, pengguna aplikasi, data yang dibutuhkan, dan manfaatnya."/>
            <span className="mt-1 block text-xs text-slate-500">{form.purpose.length}/3000 karakter · minimal 20 karakter</span>
          </label>

          <h3 className="mb-4 mt-8 font-bold text-slate-900">03 · Layanan API yang dibutuhkan *</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {scopes.map(([id, title, description]) => <label key={id} className={"flex cursor-pointer gap-3 rounded-xl border p-4 transition " + (selected.includes(id) ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-300")}>
              <input className="mt-1 h-4 w-4 accent-blue-700" type="checkbox" checked={selected.includes(id)} onChange={() => setSelected(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id])}/>
              <span><strong className="block text-sm">{title}</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span><span className="mt-2 block break-all text-xs text-blue-700">{id}</span></span>
            </label>)}
          </div>

          <h3 className="mb-4 mt-8 font-bold text-slate-900">04 · Persetujuan</h3>
          <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            <input className="mt-1 h-4 w-4 accent-blue-700" type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)}/>
            Saya menyatakan informasi benar, akan menggunakan API sesuai izin yang disetujui, dan menjaga kerahasiaan kredensial.
          </label>
          <button disabled={busy} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3.5 font-bold text-white shadow-lg transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60 sm:w-auto">
            {busy ? "Mengirim pengajuan..." : "Kirim pengajuan"} <Send size={17}/>
          </button>
          <p className="mt-3 text-xs text-slate-500"><KeyRound className="mr-1 inline" size={13}/> Jangan masukkan password atau API key ke formulir.</p>
        </form>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="font-bold">Proses pendaftaran</h3>
            {["Kirim formulir permohonan", "Admin memverifikasi organisasi dan kebutuhan", "Admin menyetujui scope dan akses", "Kredensial diterbitkan secara aman"].map((s, i) => <div key={s} className="mt-5 flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">{i + 1}</span><p className="pt-1 text-sm leading-5 text-slate-600">{s}</p></div>)}
          </section>
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h3 className="font-bold text-amber-900">Keamanan API</h3>
            <p className="mt-2 text-sm leading-6 text-amber-900">API key tidak boleh ditanam di frontend, aplikasi publik, atau repositori. Simpan kredensial di backend yang aman.</p>
          </section>
          <p className="px-2 text-xs leading-5 text-slate-500">Pengajuan belum otomatis memberikan akses. Setiap izin perlu diverifikasi oleh administrator.</p>
        </aside>
      </div>
      <footer className="py-7 text-center text-xs text-slate-500">© {new Date().getFullYear()} SIMITI Pro Enterprise · External API Partner Portal</footer>
    </div>
  </div>;
}