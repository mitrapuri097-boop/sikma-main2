import React, { useEffect, useState } from "react";
import { Bell, Building2, CheckCircle2, Clock3, Eye, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { API_URL } from "./api";

interface RegistrationRequest {
  id: number;
  request_code: string;
  institution_name: string;
  institution_type?: string;
  province?: string;
  address?: string;
  website?: string;
  pic_name: string;
  position?: string;
  email: string;
  phone?: string;
  username: string;
  reason?: string;
  status: string;
  created_at: string;
}

export default function MemberApprovalPanel() {
  const [count, setCount] = useState(0);
  const [rows, setRows] = useState<RegistrationRequest[]>([]);
  const [selected, setSelected] = useState<RegistrationRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const getToken = () => localStorage.getItem("adminToken") || localStorage.getItem("smiti_token") || "";

  const load = async () => {
    const token = getToken();
    if (!token) { setError("Token admin tidak ditemukan."); setLoading(false); return; }
    try {
      setLoading(true);
      const [countResponse, listResponse] = await Promise.all([
        fetch(`${API_URL}/api/admin/member-registrations/notification-count`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/admin/member-registrations?status=pending`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const countJson = await countResponse.json();
      const listJson = await listResponse.json();
      if (!countResponse.ok) throw new Error(countJson.message || "Gagal membaca notification.");
      if (!listResponse.ok) throw new Error(listJson.message || "Gagal membaca antrean approval.");
      setCount(Number(countJson.data?.count || 0));
      setRows(Array.isArray(listJson.data) ? listJson.data : []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat approval queue.");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const process = async (row: RegistrationRequest, action: "approve" | "reject") => {
    const token = getToken();
    if (!token) return;
    const note = action === "reject" ? window.prompt("Alasan penolakan (opsional):", "Data instansi belum dapat diverifikasi.") : window.prompt("Catatan approval (opsional):", "Disetujui setelah verifikasi instansi.");
    if (note === null) return;
    setProcessingId(row.id);
    try {
      const response = await fetch(`${API_URL}/api/admin/member-registrations/${row.id}/${action}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ review_note: note }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) throw new Error(result.message || "Gagal memproses permohonan.");
      setSelected(null);
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Gagal memproses permohonan.");
    } finally { setProcessingId(null); }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3"><div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><Bell size={18}/>{count > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1 text-center text-[9px] font-black text-white">{count > 99 ? "99+" : count}</span>}</div><div><h3 className="text-sm font-black text-slate-900">Approval Member Instansi</h3><p className="text-[10px] text-slate-400">Antrean permohonan akses SIMITI Enterprise</p></div></div>
        <button type="button" onClick={() => void load()} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50">Refresh</button>
      </div>
      {error && <div className="m-4 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
      {loading ? <div className="flex h-32 items-center justify-center gap-2 text-xs text-slate-400"><Loader2 size={16} className="animate-spin"/> Memuat approval queue...</div> : rows.length === 0 ? <div className="flex h-32 flex-col items-center justify-center text-center"><CheckCircle2 size={24} className="text-emerald-500"/><div className="mt-2 text-xs font-bold text-slate-600">Tidak ada permohonan pending</div><div className="text-[10px] text-slate-400">Inbox admin sudah bersih.</div></div> : <div className="divide-y divide-slate-100">{rows.map((row) => <div key={row.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Building2 size={18}/></div><div className="min-w-0 flex-1"><div className="truncate text-xs font-black text-slate-800">{row.institution_name}</div><div className="mt-0.5 text-[10px] text-slate-500">{row.pic_name} · {row.position || "PIC"} · {row.email}</div><div className="mt-1 flex items-center gap-2 text-[9px] text-slate-400"><Clock3 size={11}/> {new Date(row.created_at).toLocaleString("id-ID")} · <span className="font-mono">{row.request_code}</span></div></div><button type="button" onClick={() => setSelected(row)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-[10px] font-bold text-slate-600 hover:bg-white"><Eye size={14}/> Detail</button></div>)}</div>}

      {selected && <div className="border-t border-slate-200 bg-slate-50 p-5"><div className="flex items-start justify-between gap-3"><div><div className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Review Permohonan</div><h4 className="mt-1 text-base font-black text-slate-900">{selected.institution_name}</h4><div className="mt-1 text-[10px] text-slate-500">{selected.request_code} · {selected.institution_type} · {selected.province}</div></div><button type="button" onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700">×</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-white p-3"><div className="text-[8px] font-bold uppercase text-slate-400">PIC</div><div className="mt-1 text-xs font-bold">{selected.pic_name}</div><div className="text-[10px] text-slate-500">{selected.position || "—"} · {selected.phone || "—"}</div></div><div className="rounded-xl bg-white p-3"><div className="text-[8px] font-bold uppercase text-slate-400">Akun</div><div className="mt-1 text-xs font-bold">{selected.username}</div><div className="text-[10px] text-slate-500">{selected.email}</div></div><div className="rounded-xl bg-white p-3 sm:col-span-2"><div className="text-[8px] font-bold uppercase text-slate-400">Alamat</div><div className="mt-1 text-[10px] leading-5 text-slate-600">{selected.address || "—"}</div></div><div className="rounded-xl bg-white p-3 sm:col-span-2"><div className="text-[8px] font-bold uppercase text-slate-400">Tujuan Akses</div><div className="mt-1 text-[10px] leading-5 text-slate-600">{selected.reason || "Tidak diisi."}</div></div></div><div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={processingId === selected.id} onClick={() => void process(selected,"reject")} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-[10px] font-black text-red-600 hover:bg-red-50 disabled:opacity-50"><XCircle size={15}/> Tolak</button><button type="button" disabled={processingId === selected.id} onClick={() => void process(selected,"approve")} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-[10px] font-black text-white hover:bg-emerald-700 disabled:opacity-50"><ShieldCheck size={15}/> {processingId === selected.id ? "Memproses..." : "Approve Member"}</button></div></div>}
    </section>
  );
}
