import React, { useMemo, useState } from "react";
import { API_URL } from "../../../api";
import {
  ArrowRight, Check, CheckCircle2, ChevronRight, CircleHelp, Code2,
  FileCheck2, Globe2, KeyRound, Layers3, LockKeyhole, Mail, MapPin,
  ShieldCheck, Sparkles, Building2, UserRound, LoaderCircle,
} from "lucide-react";

/**
 * Halaman publik pendaftaran mitra API SIMITI.
 * Backend perlu menyediakan POST /api/external-registration (tanpa login admin),
 * melakukan validasi server-side, menyimpan status pending, dan membatasi scope.
 */
const ROOT = String(API_URL).replace(/\/+$/, "");
const REGISTRATION_URL = ROOT.endsWith("/api")
  ? `${ROOT}/external-management/applications`
  : `${ROOT}/api/external-management/applications`;

const SCOPE_OPTIONS = [
  { id: "mitigation:model:read", title: "Model Mitigasi", description: "Membaca layanan/model rekomendasi mitigasi.", icon: Layers3 },
  { id: "mitigation:locations:read", title: "Inventarisasi Lokasi Mitigasi", description: "Membaca inventaris lokasi mitigasi yang diizinkan.", icon: MapPin },
  { id: "my-location:assessment", title: "My Lokasi — Assessment", description: "Mengirim lokasi untuk mendapatkan hasil penilaian risiko.", icon: ShieldCheck },
  { id: "my-location:proximity", title: "My Lokasi — Proximity", description: "Mengakses analisis kedekatan lokasi sesuai izin.", icon: Globe2 },
];

type FormState = {
  applicationName: string;
  organizationName: string;
  contactName: string;
  email: string;
  website: string;
  purpose: string;
  environment: "development" | "staging" | "production";
  scopes: string[];
  acceptedTerms: boolean;
};

const INITIAL_FORM: FormState = {
  applicationName: "", organizationName: "", contactName: "", email: "",
  website: "", purpose: "", environment: "development", scopes: [], acceptedTerms: false,
};

export default function ExternalApiRegistration() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ message: string; reference?: string } | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const selectedScopeLabels = useMemo(
    () => SCOPE_OPTIONS.filter((scope) => form.scopes.includes(scope.id)).map((scope) => scope.title),
    [form.scopes],
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleScope(scopeId: string) {
    setForm((current) => ({
      ...current,
      scopes: current.scopes.includes(scopeId)
        ? current.scopes.filter((scope) => scope !== scopeId)
        : [...current.scopes, scopeId],
    }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess(null);
    if (form.scopes.length === 0) {
      setError("Pilih minimal satu layanan API yang dibutuhkan.");
      return;
    }
    if (!form.acceptedTerms) {
      setError("Centang persetujuan penggunaan API sebelum mengirim pengajuan.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(REGISTRATION_URL, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationName: form.applicationName.trim(),
          organizationName: form.organizationName.trim(),
          contactName: form.contactName.trim(),
          email: form.email.trim(),
          website: form.website.trim() || null,
          purpose: form.purpose.trim(),
          environment: form.environment,
          requestedScopes: form.scopes,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        throw new Error(data.message || (response.status === 404
          ? "Layanan pendaftaran belum tersedia di backend. Admin perlu mengaktifkan endpoint pendaftaran mitra."
          : `Pengajuan gagal dikirim (HTTP ${response.status}).`));
      }
      setSuccess({
        message: data.message || "Pengajuan berhasil dikirim dan menunggu pemeriksaan admin.",
        reference: data.application?.id ? String(data.application.id) : data.applicationId ? String(data.applicationId) : undefined,
      });
      setForm(INITIAL_FORM);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tidak dapat mengirim pengajuan. Periksa koneksi lalu coba kembali.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="simiti-reg">
      <style>{`
        .simiti-reg{--navy:#102a43;--blue:#175cd3;--blue2:#1849a9;--ink:#172b4d;--muted:#667085;--line:#e4eaf2;--pale:#f4f8ff;min-height:100%;background:#f5f7fb;color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:clamp(12px,2.8vw,32px)}
        .simiti-reg *{box-sizing:border-box}.sr-shell{max-width:1180px;margin:0 auto}.sr-top{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:24px}.sr-brand{display:flex;align-items:center;gap:12px;min-width:0}.sr-logo{width:46px;height:46px;display:grid;place-items:center;flex:none;border-radius:14px;color:white;background:linear-gradient(145deg,#175cd3,#0e9384);box-shadow:0 8px 20px #175cd32b}.sr-brandname{font-weight:850;letter-spacing:.07em;font-size:13px;color:#102a43}.sr-brandcaption{font-size:12px;color:#667085;margin-top:3px}.sr-toplink{display:inline-flex;align-items:center;gap:7px;text-decoration:none;color:#344054;font-size:13px;font-weight:650;padding:10px 13px;border:1px solid #d8e0eb;background:#fff;border-radius:10px;white-space:nowrap}.sr-hero{position:relative;overflow:hidden;border-radius:24px;padding:clamp(24px,4vw,48px);color:#fff;background:radial-gradient(ellipse at 92% 0%,#2e90fa5c,transparent 36%),linear-gradient(120deg,#102a43 0%,#123f70 56%,#175cd3 100%);box-shadow:0 18px 45px #173b6720}.sr-hero:after{content:"";position:absolute;width:240px;height:240px;border:1px solid #ffffff20;border-radius:50%;right:-70px;bottom:-145px;box-shadow:0 0 0 30px #ffffff08,0 0 0 60px #ffffff06;pointer-events:none}.sr-eyebrow{display:inline-flex;align-items:center;gap:7px;color:#d1e9ff;background:#ffffff13;border:1px solid #ffffff24;border-radius:999px;padding:7px 11px;font-size:11px;letter-spacing:.1em;font-weight:800}.sr-hero h1{font-size:clamp(28px,4.3vw,45px);line-height:1.12;letter-spacing:-.035em;max-width:700px;margin:18px 0 14px}.sr-hero p{color:#d7e7f8;line-height:1.7;max-width:680px;margin:0;font-size:clamp(14px,1.4vw,16px)}.sr-highlights{display:flex;gap:18px;flex-wrap:wrap;margin-top:25px}.sr-highlight{display:flex;align-items:center;gap:8px;font-size:12px;color:#edf6ff}.sr-highlight svg{color:#7ee7c1}.sr-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:22px;align-items:start;margin-top:22px}.sr-card{background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:0 5px 20px #173b6708;min-width:0}.sr-formhead{padding:25px 26px 20px;border-bottom:1px solid #edf0f5}.sr-kicker{font-size:11px;letter-spacing:.11em;font-weight:800;color:#175cd3;text-transform:uppercase}.sr-formhead h2{font-size:22px;letter-spacing:-.025em;margin:8px 0 7px}.sr-formhead p{color:var(--muted);font-size:13px;line-height:1.6;margin:0}.sr-formbody{padding:24px 26px 28px}.sr-section{margin-bottom:27px}.sr-section:last-of-type{margin-bottom:20px}.sr-sectiontitle{display:flex;align-items:center;gap:10px;margin-bottom:16px}.sr-step{width:29px;height:29px;display:grid;place-items:center;border-radius:9px;background:#eaf2ff;color:#175cd3;font-size:12px;font-weight:850;flex:none}.sr-sectiontitle h3{font-size:14px;margin:0;font-weight:800}.sr-sectiontitle p{font-size:12px;color:var(--muted);margin:3px 0 0}.sr-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.sr-field{min-width:0}.sr-field.full{grid-column:1/-1}.sr-label{display:flex;align-items:center;gap:5px;font-size:12px;font-weight:750;color:#344054;margin-bottom:7px}.sr-required{color:#d92d20}.sr-input,.sr-select,.sr-textarea{width:100%;min-width:0;border:1px solid #d0d9e5;border-radius:10px;background:#fff;padding:11px 12px;color:#101828;font:inherit;font-size:13px;outline:none;transition:border-color .15s,box-shadow .15s}.sr-input,.sr-select{height:43px}.sr-textarea{resize:vertical;min-height:108px;line-height:1.6}.sr-input::placeholder,.sr-textarea::placeholder{color:#98a2b3}.sr-input:focus,.sr-select:focus,.sr-textarea:focus{border-color:#528bff;box-shadow:0 0 0 3px #175cd314}.sr-help{font-size:11px;line-height:1.5;color:#667085;margin-top:6px}.sr-scopegrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.sr-scope{display:flex;align-items:flex-start;gap:11px;padding:14px;border:1px solid #dfe6ef;border-radius:12px;cursor:pointer;transition:border-color .15s,background .15s;min-width:0}.sr-scope:hover{border-color:#84adff}.sr-scope.active{border-color:#528bff;background:#f3f7ff;box-shadow:inset 0 0 0 1px #528bff24}.sr-scopeicon{width:34px;height:34px;display:grid;place-items:center;flex:none;border-radius:10px;background:#eef4ff;color:#175cd3}.sr-scopecopy{min-width:0;flex:1}.sr-scopecopy strong{display:block;font-size:12px;line-height:1.45}.sr-scopecopy span{display:block;color:#667085;font-size:11px;line-height:1.5;margin-top:4px}.sr-check{width:17px;height:17px;accent-color:#175cd3;flex:none;margin:2px 0 0}.sr-consent{display:flex;gap:10px;align-items:flex-start;padding:14px;border-radius:12px;background:#f8fafc;border:1px solid #e8edf4}.sr-consent label{font-size:12px;line-height:1.6;color:#475467;cursor:pointer}.sr-consent input{accent-color:#175cd3;margin-top:3px;flex:none}.sr-submitrow{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-top:20px}.sr-privacy{display:flex;gap:7px;align-items:center;font-size:11px;color:#667085}.sr-submit{display:inline-flex;align-items:center;justify-content:center;gap:9px;border:0;border-radius:10px;padding:13px 19px;background:linear-gradient(100deg,#175cd3,#1849a9);color:white;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 7px 15px #175cd32b;transition:transform .15s,opacity .15s}.sr-submit:hover{transform:translateY(-1px)}.sr-submit:disabled{opacity:.65;cursor:wait;transform:none}.sr-alert{padding:13px 15px;border-radius:11px;font-size:13px;line-height:1.6;margin-bottom:18px;overflow-wrap:anywhere}.sr-alert.error{color:#b42318;background:#fff1f0;border:1px solid #fecdca}.sr-alert.success{color:#067647;background:#ecfdf3;border:1px solid #abefc6}.sr-side{display:grid;gap:15px}.sr-sidecard{padding:20px}.sr-sidehead{display:flex;align-items:center;gap:10px;margin-bottom:15px}.sr-sideicon{width:38px;height:38px;display:grid;place-items:center;border-radius:11px;background:#eaf2ff;color:#175cd3;flex:none}.sr-sidehead h3{font-size:14px;margin:0}.sr-sidehead p{font-size:11px;color:#667085;margin:4px 0 0}.sr-process{display:grid;gap:16px}.sr-processitem{display:grid;grid-template-columns:28px 1fr;gap:10px}.sr-processnum{width:27px;height:27px;border-radius:50%;display:grid;place-items:center;background:#f0f5ff;color:#175cd3;font-size:11px;font-weight:850}.sr-processitem strong{font-size:12px;display:block;margin:2px 0 4px}.sr-processitem p{font-size:11px;line-height:1.55;color:#667085;margin:0}.sr-notice{padding:14px;border-radius:12px;background:#f0f9ff;border:1px solid #d1e9ff;color:#1849a9;font-size:11px;line-height:1.65}.sr-notice strong{display:block;font-size:12px;margin-bottom:4px}.sr-helpbutton{border:0;background:transparent;color:#175cd3;display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:750;padding:0;cursor:pointer}.sr-helptext{font-size:12px;line-height:1.65;color:#475467;margin-top:12px}.sr-footer{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:20px 4px 6px;color:#98a2b3;font-size:11px}.sr-footerlinks{display:flex;gap:14px;flex-wrap:wrap}.sr-footerlinks span{display:inline-flex;align-items:center;gap:5px}.sr-spinner{animation:sr-spin 1s linear infinite}@keyframes sr-spin{to{transform:rotate(360deg)}}
        @media(max-width:900px){.sr-layout{grid-template-columns:minmax(0,1fr) 250px;gap:15px}.sr-formhead,.sr-formbody{padding-left:20px;padding-right:20px}.sr-scopegrid{grid-template-columns:1fr}}
        @media(max-width:700px){.simiti-reg{padding:12px}.sr-top{align-items:flex-start;margin-bottom:15px}.sr-logo{width:40px;height:40px}.sr-brandname{font-size:11px}.sr-brandcaption{font-size:10px}.sr-toplink{font-size:11px;padding:9px}.sr-hero{border-radius:18px;padding:25px 21px}.sr-hero h1{font-size:30px}.sr-layout{grid-template-columns:1fr;margin-top:15px}.sr-side{grid-template-columns:1fr 1fr}.sr-sidecard{padding:16px}.sr-formhead,.sr-formbody{padding:19px 16px}.sr-fields{gap:13px}.sr-footer{padding-top:16px}}
        @media(max-width:480px){.sr-toplink span{display:none}.sr-hero h1{font-size:27px}.sr-highlights{gap:11px;display:grid}.sr-fields{grid-template-columns:1fr}.sr-field.full{grid-column:auto}.sr-side{grid-template-columns:1fr}.sr-scope{padding:12px}.sr-submitrow{align-items:stretch}.sr-submit{width:100%}.sr-privacy{justify-content:center}.sr-formhead h2{font-size:20px}}
        @media(prefers-reduced-motion:reduce){.simiti-reg *{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
      `}</style>

      <div className="sr-shell">
        <header className="sr-top">
          <div className="sr-brand">
            <div className="sr-logo"><Code2 size={23} strokeWidth={2.4} /></div>
            <div><div className="sr-brandname">SIMITI PRO ENTERPRISE</div><div className="sr-brandcaption">External API Partner Portal</div></div>
          </div>
          <a className="sr-toplink" href="/login"><LockKeyhole size={15} /><span>Portal Pengguna</span><ChevronRight size={14} /></a>
        </header>

        <section className="sr-hero">
          <div className="sr-eyebrow"><Sparkles size={14} /> PARTNER INTEGRATION PROGRAM</div>
          <h1>Hubungkan aplikasi Anda dengan ekosistem SIMITI.</h1>
          <p>Ajukan akses API resmi untuk mengintegrasikan data dan layanan mitigasi bencana SIMITI ke dalam aplikasi, platform, atau sistem organisasi Anda.</p>
          <div className="sr-highlights">
            <div className="sr-highlight"><CheckCircle2 size={16} /> Akses berbasis persetujuan</div>
            <div className="sr-highlight"><CheckCircle2 size={16} /> Scope API terkontrol</div>
            <div className="sr-highlight"><CheckCircle2 size={16} /> Kredensial aman</div>
          </div>
        </section>

        <div className="sr-layout">
          <main className="sr-card">
            <div className="sr-formhead">
              <div className="sr-kicker">Permohonan akses</div>
              <h2>Daftar sebagai Mitra API</h2>
              <p>Lengkapi informasi berikut. Tim administrator akan meninjau kebutuhan integrasi sebelum akses diterbitkan.</p>
            </div>
            <form className="sr-formbody" onSubmit={submit}>
              {error && <div className="sr-alert error" role="alert">{error}</div>}
              {success && <div className="sr-alert success" role="status"><strong style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}><CheckCircle2 size={17} /> Pengajuan terkirim</strong>{success.message}{success.reference && <div style={{ marginTop: 5 }}>Nomor referensi: <strong>API-{success.reference}</strong></div>}<div style={{ marginTop: 5 }}>Simpan nomor referensi ini untuk keperluan tindak lanjut.</div></div>}

              <section className="sr-section">
                <div className="sr-sectiontitle"><span className="sr-step">01</span><div><h3>Informasi aplikasi & organisasi</h3><p>Identitas pihak yang mengajukan integrasi.</p></div></div>
                <div className="sr-fields">
                  <div className="sr-field"><label className="sr-label" htmlFor="applicationName">Nama aplikasi <span className="sr-required">*</span></label><input className="sr-input" id="applicationName" name="applicationName" autoComplete="organization-title" placeholder="Contoh: Portal Mitigasi Daerah" required maxLength={120} value={form.applicationName} onChange={(e) => update("applicationName", e.target.value)} /></div>
                  <div className="sr-field"><label className="sr-label" htmlFor="organizationName">Nama organisasi <span className="sr-required">*</span></label><input className="sr-input" id="organizationName" name="organizationName" autoComplete="organization" placeholder="Nama instansi / perusahaan" required maxLength={160} value={form.organizationName} onChange={(e) => update("organizationName", e.target.value)} /></div>
                  <div className="sr-field"><label className="sr-label" htmlFor="contactName">Nama penanggung jawab <span className="sr-required">*</span></label><input className="sr-input" id="contactName" name="contactName" autoComplete="name" placeholder="Nama lengkap kontak teknis" required maxLength={120} value={form.contactName} onChange={(e) => update("contactName", e.target.value)} /></div>
                  <div className="sr-field"><label className="sr-label" htmlFor="email">Email aktif <span className="sr-required">*</span></label><input className="sr-input" id="email" name="email" type="email" autoComplete="email" placeholder="nama@organisasi.go.id" required maxLength={254} value={form.email} onChange={(e) => update("email", e.target.value)} /></div>
                  <div className="sr-field"><label className="sr-label" htmlFor="website">Website organisasi</label><input className="sr-input" id="website" name="website" type="url" placeholder="https://contoh.go.id" maxLength={500} value={form.website} onChange={(e) => update("website", e.target.value)} /><div className="sr-help">Opsional. Gunakan URL lengkap jika diisi.</div></div>
                  <div className="sr-field"><label className="sr-label" htmlFor="environment">Lingkungan integrasi <span className="sr-required">*</span></label><select className="sr-select" id="environment" name="environment" value={form.environment} onChange={(e) => update("environment", e.target.value as FormState["environment"])}><option value="development">Development</option><option value="staging">Staging / UAT</option><option value="production">Produksi</option></select><div className="sr-help">Akses produksi dapat memerlukan pemeriksaan tambahan.</div></div>
                </div>
              </section>

              <section className="sr-section">
                <div className="sr-sectiontitle"><span className="sr-step">02</span><div><h3>Tujuan penggunaan API</h3><p>Jelaskan kebutuhan dan alur pemanfaatan data.</p></div></div>
                <div className="sr-field"><label className="sr-label" htmlFor="purpose">Deskripsi integrasi <span className="sr-required">*</span></label><textarea className="sr-textarea" id="purpose" name="purpose" placeholder="Jelaskan aplikasi yang akan diintegrasikan, siapa penggunanya, data yang dibutuhkan, dan manfaatnya..." required minLength={20} maxLength={3000} value={form.purpose} onChange={(e) => update("purpose", e.target.value)} /><div className="sr-help">Minimal 20 karakter · {form.purpose.length}/3000</div></div>
              </section>

              <section className="sr-section">
                <div className="sr-sectiontitle"><span className="sr-step">03</span><div><h3>Pilih layanan API</h3><p>Pilih satu atau lebih layanan yang diperlukan. Admin akan meninjau setiap izin.</p></div></div>
                <div className="sr-scopegrid">
                  {SCOPE_OPTIONS.map((scope) => {
                    const Icon = scope.icon;
                    const active = form.scopes.includes(scope.id);
                    return <label key={scope.id} className={`sr-scope${active ? " active" : ""}`}>
                      <span className="sr-scopeicon"><Icon size={18} /></span>
                      <span className="sr-scopecopy"><strong>{scope.title}</strong><span>{scope.description}</span><span style={{ color: "#175cd3", overflowWrap: "anywhere" }}>{scope.id}</span></span>
                      <input className="sr-check" type="checkbox" checked={active} onChange={() => toggleScope(scope.id)} aria-label={`Pilih ${scope.title}`} />
                    </label>;
                  })}
                </div>
                <div className="sr-help">Dipilih: {selectedScopeLabels.length ? selectedScopeLabels.join(", ") : "belum ada layanan"}</div>
              </section>

              <section className="sr-section">
                <div className="sr-sectiontitle"><span className="sr-step">04</span><div><h3>Persetujuan & pengiriman</h3><p>Pastikan informasi dan tujuan penggunaan sudah benar.</p></div></div>
                <div className="sr-consent"><input id="acceptedTerms" type="checkbox" checked={form.acceptedTerms} onChange={(e) => update("acceptedTerms", e.target.checked)} /><label htmlFor="acceptedTerms">Saya menyatakan informasi yang diberikan benar, akan menggunakan API sesuai izin yang disetujui, menjaga kerahasiaan kredensial, serta tidak menyalahgunakan atau membagikan akses kepada pihak yang tidak berwenang. <span className="sr-required">*</span></label></div>
                <div className="sr-submitrow"><div className="sr-privacy"><LockKeyhole size={14} /> Data pengajuan digunakan untuk proses verifikasi mitra.</div><button className="sr-submit" type="submit" disabled={busy}>{busy ? <><LoaderCircle size={17} className="sr-spinner" /> Mengirim pengajuan...</> : <>Kirim pengajuan <ArrowRight size={17} /></>}</button></div>
              </section>
            </form>
          </main>

          <aside className="sr-side">
            <section className="sr-card sr-sidecard">
              <div className="sr-sidehead"><div className="sr-sideicon"><FileCheck2 size={19} /></div><div><h3>Proses pendaftaran</h3><p>Alur permohonan akses API</p></div></div>
              <div className="sr-process">
                <div className="sr-processitem"><span className="sr-processnum">1</span><div><strong>Kirim permohonan</strong><p>Isi data organisasi, tujuan integrasi, dan scope yang dibutuhkan.</p></div></div>
                <div className="sr-processitem"><span className="sr-processnum">2</span><div><strong>Review administrator</strong><p>Admin memeriksa permohonan dan menentukan izin yang disetujui.</p></div></div>
                <div className="sr-processitem"><span className="sr-processnum">3</span><div><strong>Penerbitan kredensial</strong><p>Jika disetujui, API key diterbitkan melalui pengelolaan akses resmi.</p></div></div>
                <div className="sr-processitem"><span className="sr-processnum">4</span><div><strong>Mulai integrasi</strong><p>Gunakan API sesuai dokumentasi, scope, dan kebijakan yang berlaku.</p></div></div>
              </div>
            </section>
            <section className="sr-card sr-sidecard">
              <div className="sr-sidehead"><div className="sr-sideicon"><ShieldCheck size={19} /></div><div><h3>Keamanan akses</h3><p>Prinsip integrasi bertanggung jawab</p></div></div>
              <div className="sr-notice"><strong><KeyRound size={14} style={{ verticalAlign: "-3px", marginRight: 5 }} />API key bukan untuk publik</strong>Jangan menanamkan API key di kode frontend, repositori publik, atau aplikasi klien. Simpan kredensial di backend yang aman.</div>
            </section>
            <section className="sr-card sr-sidecard">
              <div className="sr-sidehead"><div className="sr-sideicon"><CircleHelp size={19} /></div><div><h3>Butuh bantuan?</h3><p>Persiapan sebelum mendaftar</p></div></div>
              <button type="button" className="sr-helpbutton" onClick={() => setShowHelp((value) => !value)}>{showHelp ? "Sembunyikan panduan" : "Lihat panduan pengajuan"} <ChevronRight size={15} /></button>
              {showHelp && <div className="sr-helptext">Siapkan identitas organisasi, kontak teknis yang aktif, gambaran integrasi, lingkungan penggunaan, dan alasan kebutuhan tiap scope. Hindari memasukkan password, token, atau API key ke dalam deskripsi.</div>}
            </section>
          </aside>
        </div>

        <footer className="sr-footer"><span>© {new Date().getFullYear()} SIMITI Pro Enterprise · External API Partner Portal</span><div className="sr-footerlinks"><span><LockKeyhole size={12} /> Akses terkontrol</span><span><Building2 size={12} /> Integrasi mitra</span><span><Mail size={12} /> Kontak organisasi</span><span><UserRound size={12} /> Verifikasi admin</span></div></footer>
      </div>
    </div>
  );
}
