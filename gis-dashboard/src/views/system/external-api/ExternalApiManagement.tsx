import React, { useCallback, useEffect, useState } from "react";
import { API_URL } from "../../../api";

const ROOT = String(API_URL).replace(/\/+$/, "");
const BASE = ROOT.endsWith("/api")
  ? `${ROOT}/external-management`
  : `${ROOT}/api/external-management`;

const SCOPES = [
  { id: "mitigation:model:read", label: "Model Mitigasi" },
  { id: "mitigation:locations:read", label: "Inventarisasi Lokasi Mitigasi" },
  { id: "my-location:assessment", label: "My Lokasi — Assessment" },
  { id: "my-location:proximity", label: "My Lokasi — Proximity" },
];

const styles: Record<string, React.CSSProperties> = {
  page: { padding: 24, minHeight: "100%", background: "#f5f7fb", color: "#172033" },
  card: { background: "#fff", border: "1px solid #e4e7ec", borderRadius: 12, padding: 18 },
  button: { border: "1px solid #d0d5dd", background: "#fff", padding: "8px 12px", borderRadius: 8, cursor: "pointer", marginRight: 6, marginBottom: 4 },
  primary: { border: 0, background: "#175cd3", color: "#fff", padding: "9px 13px", borderRadius: 8, cursor: "pointer" },
  input: { padding: 9, border: "1px solid #d0d5dd", borderRadius: 8, maxWidth: "100%" },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
  th: { textAlign: "left" as const, padding: 11, background: "#f8fafc", borderBottom: "1px solid #e4e7ec" },
  td: { textAlign: "left" as const, padding: 11, borderBottom: "1px solid #eaecf0", verticalAlign: "top" as const },
};

type AppRow = {
  id: number;
  application_name: string;
  organization_name: string;
  contact_name: string;
  email: string;
  purpose: string;
  requested_scopes: string[];
  approved_scopes: string[];
  status: string;
  requested_at: string;
  review_note?: string;
};

type Credential = {
  id: number;
  application_id: number;
  key_prefix: string;
  scopes: string[];
  status: string;
  expires_at: string;
  created_at: string;
};

type AuditRow = {
  id: number;
  actor_type: string;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string | number;
  ip_address: string;
  metadata: unknown;
  created_at: string;
};

async function request<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token =
    localStorage.getItem("smiti_token") ||
    sessionStorage.getItem("smiti_token");

  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data.message || `Request gagal (${response.status})`);
  }
  return data;
}

function dateText(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("id-ID");
}

function scopesText(scopes?: string[]) {
  return (scopes || []).map(
    (scope) => SCOPES.find((item) => item.id === scope)?.label || scope
  ).join(", ") || "-";
}

export default function ExternalApiManagement() {
  const [tab, setTab] = useState("applications");
  const [status, setStatus] = useState("all");
  const [applications, setApplications] = useState<AppRow[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [catalog, setCatalog] = useState<any>(null);
  const [selected, setSelected] = useState<AppRow | null>(null);
  const [approvedScopes, setApprovedScopes] = useState<string[]>([]);
  const [days, setDays] = useState(90);
  const [issuedKey, setIssuedKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadApplications = useCallback(async () => {
    const suffix = status === "all" ? "" : `?status=${encodeURIComponent(status)}`;
    const data = await request(`/applications${suffix}`);
    setApplications(data.applications || []);
  }, [status]);

  const loadAudit = useCallback(async () => {
    const data = await request("/audit");
    setAudit(data.logs || []);
  }, []);

  const loadCatalog = useCallback(async () => {
    const data = await request("/catalog");
    setCatalog(data);
  }, []);

  const loadKeys = useCallback(async (app: AppRow) => {
    const data = await request(`/applications/${app.id}/keys`);
    setCredentials(data.credentials || []);
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      if (tab === "applications") await loadApplications();
      if (tab === "keys" && selected) await loadKeys(selected);
      if (tab === "audit") await loadAudit();
      if (tab === "catalog") await loadCatalog();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data.");
    } finally {
      setBusy(false);
    }
  }, [tab, selected, loadApplications, loadKeys, loadAudit, loadCatalog]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function review(app: AppRow, decision: "approved" | "rejected" | "suspended") {
    let scopes = app.approved_scopes?.length
      ? [...app.approved_scopes]
      : [...(app.requested_scopes || [])];

    if (decision === "approved") {
      const chosen = window.prompt(
        "Masukkan scope yang disetujui, pisahkan dengan koma:\n" +
        (app.requested_scopes || []).join(", "),
        scopes.join(", ")
      );
      if (chosen === null) return;
      scopes = chosen.split(",").map((s) => s.trim()).filter(Boolean);
      if (!scopes.length || scopes.some((s) => !SCOPES.some((x) => x.id === s))) {
        setError("Scope tidak valid. Gunakan ID scope resmi yang ditampilkan.");
        return;
      }
    }

    const reviewNote = window.prompt("Catatan review (opsional):", app.review_note || "");
    if (reviewNote === null) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(`/applications/${app.id}/review`, {
        method: "PATCH",
        body: JSON.stringify({
          decision,
          reviewNote,
          approvedScopes: decision === "approved" ? scopes : [],
        }),
      });
      setNotice(`Pengajuan ${app.application_name} berhasil diperbarui.`);
      await loadApplications();
      if (selected?.id === app.id) setSelected({ ...app, status: decision, approved_scopes: scopes });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function issueKey(app: AppRow) {
    const scopes = app.approved_scopes || [];
    if (app.status !== "approved" || !scopes.length) {
      setError("Aplikasi harus berstatus approved dan memiliki scope yang disetujui.");
      return;
    }
    if (!window.confirm(`Terbitkan API key untuk ${app.application_name}?`)) return;

    setBusy(true);
    setError("");
    setIssuedKey("");
    setNotice("");
    try {
      const data = await request(`/applications/${app.id}/keys`, {
        method: "POST",
        body: JSON.stringify({ scopes, expiresInDays: days }),
      });
      setSelected(app);
      setIssuedKey(data.apiKey || "");
      setTab("keys");
      setNotice("API key berhasil diterbitkan. Salin sekarang; key mentah tidak dapat ditampilkan kembali.");
      await loadKeys(app);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Penerbitan key gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(key: Credential) {
    if (!window.confirm(`Cabut API key ${key.key_prefix}? Akses key ini akan dihentikan.`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(`/keys/${key.id}/revoke`, { method: "POST", body: "{}" });
      setNotice("API key berhasil dicabut.");
      if (selected) await loadKeys(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pencabutan key gagal.");
    } finally {
      setBusy(false);
    }
  }

  function openKeys(app: AppRow) {
    setSelected(app);
    setIssuedKey("");
    setTab("keys");
  }

  const tabs = [
    ["applications", "Pengajuan & Persetujuan"],
    ["keys", "API Keys"],
    ["audit", "Audit Log"],
    ["catalog", "Katalog API"],
  ];

  return (
    <div style={styles.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ color: "#175cd3", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>SIMITI PRO ENTERPRISE</div>
          <h1 style={{ margin: "6px 0", fontSize: 27 }}>External API Management</h1>
          <p style={{ margin: 0, color: "#667085" }}>Pengelolaan akses, kredensial mitra, dan audit integrasi eksternal.</p>
        </div>
        <button style={styles.button} disabled={busy} onClick={() => void refresh()}>
          {busy ? "Memuat..." : "↻ Refresh"}
        </button>
      </div>

      {error && <div role="alert" style={{ ...styles.card, marginTop: 18, borderColor: "#fda29b", color: "#b42318" }}>{error}</div>}
      {notice && <div role="status" style={{ ...styles.card, marginTop: 18, borderColor: "#abefc6", color: "#067647" }}>{notice}</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "22px 0" }}>
        {tabs.map(([id, label]) => (
          <button key={id} style={tab === id ? styles.primary : styles.button} onClick={() => { setTab(id); setError(""); setNotice(""); }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "applications" && <>
        <div style={{ ...styles.card, marginBottom: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <strong>Daftar pengajuan mitra</strong>
          <span style={{ color: "#667085", fontSize: 13 }}>{applications.length} pengajuan</span>
          <span style={{ flex: 1 }} />
          <select style={styles.input} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Semua status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        <div style={{ ...styles.card, overflowX: "auto", padding: 0 }}>
          <table style={styles.table}>
            <thead><tr>{["Mitra / Organisasi", "Kontak", "Scope diminta", "Status", "Tanggal", "Tindakan"].map(x => <th style={styles.th} key={x}>{x}</th>)}</tr></thead>
            <tbody>
              {applications.map(app => <tr key={app.id}>
                <td style={styles.td}><strong>{app.application_name}</strong><div>{app.organization_name || "-"}</div><small>ID: {app.id}</small><div style={{ color: "#667085", marginTop: 5 }}>{app.purpose}</div></td>
                <td style={styles.td}>{app.contact_name || "-"}<div>{app.email || "-"}</div></td>
                <td style={styles.td}>{scopesText(app.requested_scopes)}</td>
                <td style={styles.td}><strong>{app.status}</strong>{app.review_note && <div style={{ color: "#667085" }}>{app.review_note}</div>}</td>
                <td style={styles.td}>{dateText(app.requested_at)}</td>
                <td style={styles.td}>
                  {app.status === "pending" && <>
                    <button style={styles.button} disabled={busy} onClick={() => void review(app, "approved")}>Setujui</button>
                    <button style={styles.button} disabled={busy} onClick={() => void review(app, "rejected")}>Tolak</button>
                  </>}
                  {app.status === "approved" && <>
                    <button style={styles.button} disabled={busy} onClick={() => { setSelected(app); setDays(90); setError(""); }}>Pilih</button>
                    <button style={styles.button} disabled={busy} onClick={() => void issueKey(app)}>Terbitkan key</button>
                    <button style={styles.button} disabled={busy} onClick={() => void review(app, "suspended")}>Suspend</button>
                  </>}
                  {app.status === "suspended" && <button style={styles.button} disabled={busy} onClick={() => void review(app, "approved")}>Aktifkan kembali</button>}
                  <button style={styles.button} onClick={() => openKeys(app)}>Lihat keys</button>
                </td>
              </tr>)}
              {!applications.length && <tr><td style={styles.td} colSpan={6}>Belum ada pengajuan atau data belum dapat dimuat.</td></tr>}
            </tbody>
          </table>
        </div>
        {selected && <div style={{ ...styles.card, marginTop: 16 }}>
          <strong>Pengaturan penerbitan key: {selected.application_name}</strong>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
            <label>Masa berlaku (hari){" "}
              <input style={{ ...styles.input, width: 90 }} type="number" min={1} max={365} value={days} onChange={e => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))} />
            </label>
            <button style={styles.primary} disabled={busy || selected.status !== "approved"} onClick={() => void issueKey(selected)}>Terbitkan API key</button>
          </div>
          <p style={{ color: "#667085", fontSize: 13 }}>Scope key mengikuti scope yang telah disetujui untuk aplikasi ini.</p>
        </div>}
      </>}

      {tab === "keys" && <div style={styles.card}>
        <h3 style={{ marginTop: 0 }}>Manajemen API Keys</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
          <select style={styles.input} value={selected?.id || ""} onChange={e => {
            const app = applications.find(a => a.id === Number(e.target.value));
            if (app) { setSelected(app); setIssuedKey(""); }
          }}>
            <option value="">Pilih aplikasi mitra</option>
            {applications.map(a => <option key={a.id} value={a.id}>{a.application_name} — {a.status}</option>)}
          </select>
          <button style={styles.button} disabled={!selected || busy} onClick={() => selected && void loadKeys(selected)}>Muat keys</button>
        </div>
        {issuedKey && <div style={{ padding: 14, background: "#fffaeb", border: "1px solid #fedf89", borderRadius: 10, marginBottom: 16 }}>
          <strong>API key baru — salin sekarang</strong>
          <p style={{ overflowWrap: "anywhere" }}>{issuedKey}</p>
          <button style={styles.primary} onClick={() => {
            void navigator.clipboard.writeText(issuedKey).then(
              () => setNotice("API key berhasil disalin."),
              () => setError("Clipboard tidak tersedia. Salin key secara manual.")
            );
          }}>Salin API key</button>
          <button style={styles.button} onClick={() => setIssuedKey("")}>Sembunyikan</button>
        </div>}
        {selected && <p>Untuk aplikasi: <strong>{selected.application_name}</strong></p>}
        <div style={{ overflowX: "auto" }}>
          <table style={styles.table}>
            <thead><tr>{["Prefix", "Scope", "Status", "Dibuat", "Kedaluwarsa", "Tindakan"].map(x => <th style={styles.th} key={x}>{x}</th>)}</tr></thead>
            <tbody>
              {credentials.map(key => <tr key={key.id}>
                <td style={styles.td}>{key.key_prefix}</td>
                <td style={styles.td}>{scopesText(key.scopes)}</td>
                <td style={styles.td}>{key.status}</td>
                <td style={styles.td}>{dateText(key.created_at)}</td>
                <td style={styles.td}>{dateText(key.expires_at)}</td>
                <td style={styles.td}>{key.status === "active" && <button style={styles.button} disabled={busy} onClick={() => void revokeKey(key)}>Cabut key</button>}</td>
              </tr>)}
              {!credentials.length && <tr><td style={styles.td} colSpan={6}>Pilih aplikasi dan muat daftar key.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>}

      {tab === "audit" && <div style={{ ...styles.card, overflowX: "auto", padding: 0 }}>
        <div style={{ padding: 18 }}><strong>Audit Log</strong><p style={{ color: "#667085", marginBottom: 0 }}>Riwayat aktivitas pengelolaan akses API.</p></div>
        <table style={styles.table}>
          <thead><tr>{["Waktu", "Aktor", "Aksi", "Resource", "IP", "Metadata"].map(x => <th style={styles.th} key={x}>{x}</th>)}</tr></thead>
          <tbody>
            {audit.map(row => <tr key={row.id}>
              <td style={styles.td}>{dateText(row.created_at)}</td>
              <td style={styles.td}>{row.actor_type} / {row.actor_id || "-"}</td>
              <td style={styles.td}>{row.action}</td>
              <td style={styles.td}>{row.resource_type} / {row.resource_id}</td>
              <td style={styles.td}>{row.ip_address || "-"}</td>
              <td style={{ ...styles.td, maxWidth: 300, overflowWrap: "anywhere" }}>{typeof row.metadata === "string" ? row.metadata : JSON.stringify(row.metadata ?? {})}</td>
            </tr>)}
            {!audit.length && <tr><td style={styles.td} colSpan={6}>Belum ada audit log atau data belum dapat dimuat.</td></tr>}
          </tbody>
        </table>
      </div>}

      {tab === "catalog" && <div style={styles.card}>
        <h3 style={{ marginTop: 0 }}>Katalog API Mitra</h3>
        <p style={{ color: "#667085" }}>{catalog?.message || "Informasi layanan dan scope API."}</p>
        {(catalog?.services || []).map((service: any) => <div key={service.path} style={{ border: "1px solid #e4e7ec", borderRadius: 10, padding: 14, marginBottom: 10 }}>
          <strong>{service.name}</strong>
          <div style={{ margin: "8px 0" }}><code>{Array.isArray(service.methods) ? service.methods.join(", ") : service.method} {service.path}</code></div>
          <div style={{ color: "#667085", fontSize: 13 }}>Scope: {service.scope}</div>
          <div style={{ color: service.enabled ? "#067647" : "#b42318", fontSize: 13, marginTop: 5 }}>{service.enabled ? "Tersedia di katalog" : "Tidak aktif"}</div>
        </div>)}
        {!catalog?.services?.length && <p>Katalog belum tersedia. Gunakan tombol Refresh untuk mencoba kembali.</p>}
      </div>}
      <p style={{ color: "#98a2b3", fontSize: 12, marginTop: 20 }}>SIMITI External API Management · Akses admin menggunakan JWT · Kelola dan uji pada lingkungan DEMO.</p>
    </div>
  );
}
