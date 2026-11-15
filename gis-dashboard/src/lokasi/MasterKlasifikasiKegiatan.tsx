import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Search, Pencil, Power, Trash2, RefreshCw, X, Tags } from "lucide-react";
import { useNavigate } from "react-router-dom";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "");
const BASE = `${API_URL}/api/master/klasifikasi-kegiatan`;

type Item = {
  id: number;
  nama_kegiatan: string;
  kelompok: "Mitigasi" | "Adaptasi";
  deskripsi: string | null;
  urutan: number;
  is_active: boolean;
};

type FormData = {
  nama_kegiatan: string;
  kelompok: "Mitigasi" | "Adaptasi";
  deskripsi: string;
  urutan: number;
};

const emptyForm: FormData = {
  nama_kegiatan: "",
  kelompok: "Mitigasi",
  deskripsi: "",
  urutan: 0,
};

async function api(path = "", options: RequestInit = {}) {
  const token =
    localStorage.getItem("smiti_token") ||
    sessionStorage.getItem("smiti_token");

  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) {
    throw new Error(result.message || result.error || `HTTP ${response.status}`);
  }
  return result;
}

export default function MasterKlasifikasiKegiatan() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("Semua");
  const [status, setStatus] = useState("Semua");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api("/admin");
      const data = Array.isArray(result.data) ? result.data : [];
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => rows.filter((item) => {
    const q = search.toLowerCase();
    return (
      (!q || item.nama_kegiatan.toLowerCase().includes(q) ||
        (item.deskripsi || "").toLowerCase().includes(q)) &&
      (group === "Semua" || item.kelompok === group) &&
      (status === "Semua" ||
        (status === "Aktif" ? item.is_active : !item.is_active))
    );
  }), [rows, search, group, status]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setModal(true);
  };

  const openEdit = (item: Item) => {
    setEditing(item);
    setForm({
      nama_kegiatan: item.nama_kegiatan,
      kelompok: item.kelompok,
      deskripsi: item.deskripsi || "",
      urutan: Number(item.urutan || 0),
    });
    setError("");
    setModal(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        nama_kegiatan: form.nama_kegiatan.trim(),
        kelompok: form.kelompok,
        deskripsi: form.deskripsi.trim() || null,
        urutan: Number(form.urutan),
      };
      await api(editing ? `/${editing.id}` : "", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      setModal(false);
      setSuccess(editing ? "Klasifikasi berhasil diperbarui." : "Klasifikasi berhasil ditambahkan.");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan data.");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (item: Item) => {
    if (!window.confirm(`${item.is_active ? "Nonaktifkan" : "Aktifkan"} klasifikasi "${item.nama_kegiatan}"?`)) return;
    setError("");
    setSuccess("");
    try {
      await api(`/${item.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !item.is_active }),
      });
      setSuccess("Status klasifikasi berhasil diperbarui.");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memperbarui status.");
    }
  };

  const deactivate = async (item: Item) => {
    if (!window.confirm(`Nonaktifkan "${item.nama_kegiatan}"? Data tidak dihapus permanen.`)) return;
    setError("");
    setSuccess("");
    try {
      await api(`/${item.id}`, { method: "DELETE" });
      setSuccess("Klasifikasi berhasil dinonaktifkan.");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menonaktifkan data.");
    }
  };

  const activeCount = rows.filter((r) => r.is_active).length;
  const mitigationCount = rows.filter((r) => r.kelompok === "Mitigasi").length;
  const adaptationCount = rows.filter((r) => r.kelompok === "Adaptasi").length;

  return (
    <div className="mkk-page">
      <style>{`
        .mkk-page{padding:24px;min-height:100vh;background:#f5f7fb;color:#253247;font-family:inherit}
        .mkk-wrap{max-width:1400px;margin:auto}
        .mkk-top{display:flex;align-items:center;gap:12px;margin-bottom:22px}
        .mkk-back{border:1px solid #dce3ed;background:#fff;border-radius:10px;padding:9px 12px;display:flex;gap:7px;align-items:center;color:#40516a;cursor:pointer}
        .mkk-heading{display:flex;align-items:center;gap:13px;flex:1}
        .mkk-icon{width:46px;height:46px;border-radius:13px;background:#e9efff;color:#3459a8;display:grid;place-items:center}
        .mkk-heading h1{font-size:23px;margin:0 0 4px;font-weight:700}
        .mkk-heading p{margin:0;color:#718096;font-size:13px}
        .mkk-btn{border:0;border-radius:9px;padding:10px 15px;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:600;cursor:pointer}
        .mkk-primary{background:#3158a6;color:#fff}
        .mkk-light{background:#fff;border:1px solid #dce3ed;color:#40516a}
        .mkk-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px}
        .mkk-stat,.mkk-panel{background:#fff;border:1px solid #e4e9f1;border-radius:13px}
        .mkk-stat{padding:17px 19px}
        .mkk-stat small{color:#7b8798;font-size:12px}
        .mkk-stat strong{display:block;font-size:25px;margin-top:5px}
        .mkk-panel{overflow:hidden}
        .mkk-toolbar{padding:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #edf0f5}
        .mkk-search{position:relative;flex:1;min-width:220px}
        .mkk-search svg{position:absolute;left:12px;top:11px;color:#8995a6}
        .mkk-search input{padding-left:37px!important}
        .mkk-input,.mkk-select,.mkk-textarea{width:100%;box-sizing:border-box;border:1px solid #dce3ed;border-radius:9px;padding:10px 12px;background:#fff;color:#26354a;font:inherit;outline:none}
        .mkk-input:focus,.mkk-select:focus,.mkk-textarea:focus{border-color:#7895d2;box-shadow:0 0 0 3px #3158a615}
        .mkk-filter{width:auto;min-width:145px}
        .mkk-table{width:100%;border-collapse:collapse}
        .mkk-table th{text-align:left;background:#f8f9fc;color:#718096;font-size:11px;text-transform:uppercase;letter-spacing:.045em;padding:13px 16px}
        .mkk-table td{padding:14px 16px;border-top:1px solid #edf0f5;font-size:13px;vertical-align:middle}
        .mkk-name{font-weight:650;color:#293951}
        .mkk-desc{font-size:12px;color:#8290a2;margin-top:4px;max-width:520px}
        .mkk-pill{display:inline-block;padding:5px 9px;border-radius:20px;font-size:11px;font-weight:650}
        .mkk-mit{background:#eaf1ff;color:#3158a6}.mkk-adp{background:#e8f6ef;color:#238052}
        .mkk-on{background:#e8f6ef;color:#238052}.mkk-off{background:#f1f2f5;color:#778293}
        .mkk-actions{display:flex;gap:6px;justify-content:flex-end}
        .mkk-iconbtn{width:32px;height:32px;border:1px solid #e1e6ee;background:#fff;border-radius:8px;display:grid;place-items:center;color:#64748b;cursor:pointer}
        .mkk-iconbtn:hover{background:#f3f6fb;color:#3158a6}
        .mkk-alert{padding:11px 14px;border-radius:9px;margin-bottom:13px;font-size:13px}
        .mkk-error{background:#fff0f0;color:#b42318;border:1px solid #ffd4d1}
        .mkk-success{background:#edfaf2;color:#187747;border:1px solid #c9efd8}
        .mkk-empty{text-align:center;padding:48px 15px;color:#8491a3}
        .mkk-modal-bg{position:fixed;inset:0;background:#17233880;z-index:1000;display:grid;place-items:center;padding:16px}
        .mkk-modal{width:min(520px,100%);background:#fff;border-radius:15px;box-shadow:0 20px 60px #0002;overflow:hidden}
        .mkk-modal-head{padding:18px 21px;border-bottom:1px solid #edf0f5;display:flex;justify-content:space-between;align-items:center}
        .mkk-modal-head h2{font-size:17px;margin:0}
        .mkk-modal-body{padding:20px;display:grid;gap:14px}
        .mkk-field label{display:block;font-size:12px;font-weight:650;color:#536176;margin-bottom:6px}
        .mkk-modal-foot{padding:15px 20px;border-top:1px solid #edf0f5;display:flex;justify-content:flex-end;gap:8px}
        .mkk-mobile{display:none}
        @media(max-width:760px){.mkk-page{padding:14px}.mkk-heading h1{font-size:18px}.mkk-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.mkk-desktop{display:none}.mkk-mobile{display:block}.mkk-toolbar>*{width:100%}.mkk-filter{width:100%}}
        .mkk-card{padding:15px;border-top:1px solid #edf0f5}.mkk-card-top{display:flex;justify-content:space-between;gap:10px}.mkk-card .mkk-desc{max-width:none}
      `}</style>

      <div className="mkk-wrap">
        <div className="mkk-top">
          <button className="mkk-back" onClick={() => navigate("/lokasi")}><ArrowLeft size={16}/> Kembali</button>
          <div className="mkk-heading">
            <div className="mkk-icon"><Tags size={23}/></div>
            <div>
              <h1>Master Klasifikasi Kegiatan</h1>
              <p>Pengelolaan klasifikasi kegiatan Mitigasi dan Adaptasi</p>
            </div>
          </div>
          <button className="mkk-btn mkk-primary" onClick={openCreate}><Plus size={17}/> Tambah</button>
        </div>

        <div className="mkk-stats">
          <div className="mkk-stat"><small>Total Klasifikasi</small><strong>{rows.length}</strong></div>
          <div className="mkk-stat"><small>Klasifikasi Aktif</small><strong>{activeCount}</strong></div>
          <div className="mkk-stat"><small>Kelompok Mitigasi</small><strong>{mitigationCount}</strong></div>
          <div className="mkk-stat"><small>Kelompok Adaptasi</small><strong>{adaptationCount}</strong></div>
        </div>

        {error && !modal && <div className="mkk-alert mkk-error">{error}</div>}
        {success && <div className="mkk-alert mkk-success">{success}</div>}

        <div className="mkk-panel">
          <div className="mkk-toolbar">
            <div className="mkk-search"><Search size={17}/><input className="mkk-input" placeholder="Cari nama atau deskripsi klasifikasi..." value={search} onChange={(e) => setSearch(e.target.value)}/></div>
            <select className="mkk-input mkk-filter" value={group} onChange={(e) => setGroup(e.target.value)}>
              <option>Semua</option><option>Mitigasi</option><option>Adaptasi</option>
            </select>
            <select className="mkk-input mkk-filter" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option>Semua</option><option>Aktif</option><option>Nonaktif</option>
            </select>
            <button className="mkk-btn mkk-light" onClick={loadData} title="Muat ulang"><RefreshCw size={16}/> Refresh</button>
          </div>

          {loading ? <div className="mkk-empty">Memuat data klasifikasi...</div> : filtered.length === 0 ? (
            <div className="mkk-empty">Tidak ada klasifikasi yang sesuai dengan filter.</div>
          ) : <>
            <div className="mkk-desktop">
              <table className="mkk-table">
                <thead><tr><th style={{width:65}}>Urutan</th><th>Nama Kegiatan</th><th>Kelompok</th><th>Status</th><th style={{textAlign:"right"}}>Aksi</th></tr></thead>
                <tbody>{filtered.map((item) => <tr key={item.id}>
                  <td>{item.urutan}</td>
                  <td><div className="mkk-name">{item.nama_kegiatan}</div>{item.deskripsi && <div className="mkk-desc">{item.deskripsi}</div>}</td>
                  <td><span className={`mkk-pill ${item.kelompok === "Mitigasi" ? "mkk-mit" : "mkk-adp"}`}>{item.kelompok}</span></td>
                  <td><span className={`mkk-pill ${item.is_active ? "mkk-on" : "mkk-off"}`}>{item.is_active ? "Aktif" : "Nonaktif"}</span></td>
                  <td><div className="mkk-actions">
                    <button className="mkk-iconbtn" title="Edit" onClick={() => openEdit(item)}><Pencil size={15}/></button>
                    <button className="mkk-iconbtn" title={item.is_active ? "Nonaktifkan" : "Aktifkan"} onClick={() => toggleStatus(item)}><Power size={15}/></button>
                    {item.is_active && <button className="mkk-iconbtn" title="Nonaktifkan" onClick={() => deactivate(item)}><Trash2 size={15}/></button>}
                  </div></td>
                </tr>)}</tbody>
              </table>
            </div>
            <div className="mkk-mobile">{filtered.map((item) => <div className="mkk-card" key={item.id}>
              <div className="mkk-card-top"><div><div className="mkk-name">{item.nama_kegiatan}</div><div className="mkk-desc">{item.deskripsi}</div></div><span className={`mkk-pill ${item.is_active ? "mkk-on" : "mkk-off"}`}>{item.is_active ? "Aktif" : "Nonaktif"}</span></div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12}}>
                <span className={`mkk-pill ${item.kelompok === "Mitigasi" ? "mkk-mit" : "mkk-adp"}`}>{item.kelompok}</span>
                <div className="mkk-actions">
                  <button className="mkk-iconbtn" onClick={() => openEdit(item)}><Pencil size={15}/></button>
                  <button className="mkk-iconbtn" onClick={() => toggleStatus(item)}><Power size={15}/></button>
                  {item.is_active && <button className="mkk-iconbtn" onClick={() => deactivate(item)}><Trash2 size={15}/></button>}
                </div>
              </div>
            </div>)}</div>
          </>}
          <div style={{padding:"12px 16px",borderTop:"1px solid #edf0f5",fontSize:12,color:"#8491a3"}}>Menampilkan {filtered.length} dari {rows.length} klasifikasi</div>
        </div>
      </div>

      {modal && <div className="mkk-modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(false); }}>
        <form className="mkk-modal" onSubmit={save}>
          <div className="mkk-modal-head"><h2>{editing ? "Edit Klasifikasi" : "Tambah Klasifikasi"}</h2><button type="button" className="mkk-iconbtn" onClick={() => setModal(false)}><X size={17}/></button></div>
          <div className="mkk-modal-body">
            {error && <div className="mkk-alert mkk-error">{error}</div>}
            <div className="mkk-field"><label>Nama Kegiatan *</label><input className="mkk-input" required maxLength={200} value={form.nama_kegiatan} onChange={(e) => setForm({...form,nama_kegiatan:e.target.value})} placeholder="Masukkan nama klasifikasi kegiatan"/></div>
            <div className="mkk-field"><label>Kelompok *</label><select className="mkk-select" value={form.kelompok} onChange={(e) => setForm({...form,kelompok:e.target.value as FormData["kelompok"]})}><option value="Mitigasi">Mitigasi</option><option value="Adaptasi">Adaptasi</option></select></div>
            <div className="mkk-field"><label>Deskripsi</label><textarea className="mkk-textarea" rows={3} value={form.deskripsi} onChange={(e) => setForm({...form,deskripsi:e.target.value})} placeholder="Keterangan singkat (opsional)"/></div>
            <div className="mkk-field"><label>Urutan Tampilan</label><input className="mkk-input" type="number" min={0} step={1} value={form.urutan} onChange={(e) => setForm({...form,urutan:Number(e.target.value)})}/></div>
          </div>
          <div className="mkk-modal-foot">
            <button type="button" className="mkk-btn mkk-light" onClick={() => setModal(false)}>Batal</button>
            <button type="submit" className="mkk-btn mkk-primary" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</button>
          </div>
        </form>
      </div>}
    </div>
  );
}