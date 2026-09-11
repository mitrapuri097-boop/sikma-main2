import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "");

declare global {
  interface Window {
    L: any;
  }
}

type FormState = {
  nama_kegiatan: string;
  jenis_kegiatan: string;
  tahun_pelaksanaan: string;
  sumber_pendanaan: string;
  instansi_pelaksana: string;
  provinsi: string;
  kabupaten_kota: string;
  kecamatan: string;
  desa_kelurahan: string;
  luas_area: string;
  status_pelaksanaan: string;
  keterangan: string;
  longitude: string;
  latitude: string;
};

const initialForm: FormState = {
  nama_kegiatan: "",
  jenis_kegiatan: "",
  tahun_pelaksanaan: String(new Date().getFullYear()),
  sumber_pendanaan: "",
  instansi_pelaksana: "",
  provinsi: "",
  kabupaten_kota: "",
  kecamatan: "",
  desa_kelurahan: "",
  luas_area: "",
  status_pelaksanaan: "Direncanakan",
  keterangan: "",
  longitude: "",
  latitude: "",
};

const jenisKegiatan = [
  "Banjir",
  "Longsor",
  "Kekeringan",
  "Kebakaran Hutan/Lahan",
  "Rehabilitasi Hutan dan Lahan (RHL)",
  "Mangrove",
  "Konservasi DAS",
  "Konservasi Tanah dan Air",
  "Infrastruktur Konservasi Tanah dan Air",
  "Adaptasi Perubahan Iklim Kawasan Hutan",
  "Perhutanan Sosial",
  "Lainnya",
];

const statusKegiatan = ["Direncanakan", "Berjalan", "Selesai", "Ditunda", "Dibatalkan"];

export default function LokasiKegiatan() {
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const accuracyRef = useRef<any>(null);

  const [form, setForm] = useState<FormState>(initialForm);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mapReady, setMapReady] = useState(false);

  const setField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const setPoint = (lat: number, lng: number, zoom = 16) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setForm((prev) => ({
      ...prev,
      latitude: lat.toFixed(7),
      longitude: lng.toFixed(7),
    }));

    const map = mapInstanceRef.current;
    if (!map || !window.L) return;

    if (markerRef.current) markerRef.current.remove();
    markerRef.current = window.L.marker([lat, lng]).addTo(map);
    markerRef.current.bindPopup("<b>Lokasi Kegiatan</b><br/>Titik kegiatan terpilih").openPopup();

    if (accuracyRef.current) accuracyRef.current.remove();
    map.setView([lat, lng], zoom, { animate: true });
  };

  const getGps = () => {
    setError("");
    setSuccess("");
    if (!navigator.geolocation) {
      setError("Browser/perangkat tidak mendukung GPS.");
      return;
    }

    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setPoint(latitude, longitude, 17);
        if (mapInstanceRef.current && window.L) {
          if (accuracyRef.current) accuracyRef.current.remove();
          accuracyRef.current = window.L.circle([latitude, longitude], {
            radius: accuracy || 20,
            color: "#2563eb",
            fillColor: "#3b82f6",
            fillOpacity: 0.12,
            weight: 1,
          }).addTo(mapInstanceRef.current);
        }
        setSuccess(`GPS berhasil. Akurasi ±${Math.round(accuracy || 0)} meter.`);
        setGpsLoading(false);
      },
      (geoError) => {
        const messages: Record<number, string> = {
          1: "Izin lokasi ditolak. Aktifkan Location/GPS pada browser atau perangkat.",
          2: "Lokasi perangkat tidak tersedia.",
          3: "GPS timeout. Coba lagi di area dengan sinyal lokasi yang lebih baik.",
        };
        setError(messages[geoError.code] || "Gagal mengambil lokasi GPS.");
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  useEffect(() => {
    if (!mapRef.current) return;

    const linkId = "simit-lokasi-kegiatan-leaflet-css";
    if (!document.getElementById(linkId)) {
      const link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    const init = () => {
      if (!mapRef.current || !window.L || mapInstanceRef.current) return;
      const map = window.L.map(mapRef.current).setView([-2.5, 118], 5);
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      map.on("click", (event: any) => setPoint(event.latlng.lat, event.latlng.lng, 16));
      mapInstanceRef.current = map;
      setMapReady(true);
      setTimeout(() => map.invalidateSize(), 100);
    };

    if (window.L) {
      init();
      return;
    }

    const scriptId = "simit-lokasi-kegiatan-leaflet-js";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.async = true;
      document.body.appendChild(script);
    }
    script.addEventListener("load", init);
    return () => script?.removeEventListener("load", init);
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    const lat = Number(form.latitude);
    const lng = Number(form.longitude);
    if (!form.nama_kegiatan.trim() || !form.jenis_kegiatan) {
      setError("Nama kegiatan dan jenis kegiatan wajib diisi.");
      return;
    }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      setError("Longitude dan latitude wajib diisi dengan koordinat yang valid.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/lokasi-kegiatan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, latitude: lat, longitude: lng }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) throw new Error(result?.message || "Gagal menyimpan lokasi kegiatan.");

      const saved = result.data;

      // INSERT database sudah berhasil. Proses fokus/redirect dipisahkan
      // supaya kegagalan UI setelah INSERT tidak mengubah status menjadi gagal.
      const savedLat = Number(saved?.latitude ?? lat);
      const savedLng = Number(saved?.longitude ?? lng);
      const savedId = saved?.id ?? "";
      const savedName = saved?.nama_kegiatan ?? form.nama_kegiatan;

      setSuccess("Lokasi kegiatan berhasil disimpan. Mengarahkan peta ke titik kegiatan...");

      try {
        setPoint(savedLat, savedLng, 17);
      } catch (focusError) {
        console.warn("[LOKASI KEGIATAN] Data tersimpan, fokus map lokal gagal:", focusError);
      }

      try {
        sessionStorage.setItem(
          "simit_focus_location",
          JSON.stringify({
            latitude: savedLat,
            longitude: savedLng,
            zoom: 17,
            kegiatanId: savedId,
            nama: savedName,
          }),
        );
      } catch (storageError) {
        console.warn("[LOKASI KEGIATAN] Data tersimpan, sessionStorage gagal:", storageError);
      }

      try {
        window.setTimeout(() => {
          navigate(
            `/kerawanan?focusLat=${encodeURIComponent(savedLat)}&focusLng=${encodeURIComponent(savedLng)}&focusZoom=17&kegiatanId=${encodeURIComponent(savedId)}`
          );
        }, 700);
      } catch (navigateError) {
        console.warn("[LOKASI KEGIATAN] Data tersimpan, redirect gagal:", navigateError);
      }
    } catch (err: any) {
      setError(err?.message || "Gagal menyimpan lokasi kegiatan.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-3 md:p-5 text-slate-800">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-3 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="bg-slate-900 px-5 py-4 text-white">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-300">SIMITI • ENTERPRISE GIS</div>
                <h1 className="mt-1 text-xl font-black tracking-tight">Input Data Lokasi Kegiatan</h1>
                <p className="mt-1 text-xs text-slate-300">Inventarisasi lokasi kegiatan mitigasi dan adaptasi berbasis spasial.</p>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold">
                <span className="rounded-lg border border-white/10 bg-white/10 px-3 py-2">● Spatial Data Capture</span>
                <span className="rounded-lg border border-white/10 bg-white/10 px-3 py-2">EPSG:4326</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-500">
            <span className="rounded-full bg-white border border-slate-200 px-3 py-1.5">1. Tentukan titik</span>
            <span className="rounded-full bg-white border border-slate-200 px-3 py-1.5">2. Lengkapi atribut</span>
            <span className="rounded-full bg-white border border-slate-200 px-3 py-1.5">3. Simpan & fokus peta</span>
          </div>
        </div>

        {(error || success) && (
          <div className={`mb-3 rounded-xl border px-4 py-3 text-xs font-semibold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {error || success}
          </div>
        )}

        <form onSubmit={save} className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.25fr)_minmax(440px,.75fr)] gap-3">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">01 • Spatial Capture</div>
                <div className="text-sm font-extrabold">Tentukan Lokasi Kegiatan</div>
              </div>
              <div className={`rounded-lg px-2.5 py-1.5 text-[9px] font-black ${mapReady ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {mapReady ? "MAP READY" : "LOADING MAP"}
              </div>
            </div>

            <div className="relative h-[520px] bg-slate-200">
              <div ref={mapRef} className="absolute inset-0" />
              <div className="absolute left-3 top-3 z-[1000] flex flex-wrap gap-2">
                <button type="button" onClick={getGps} disabled={gpsLoading} className="rounded-xl bg-white px-3 py-2 text-[10px] font-black text-blue-700 shadow-lg border border-slate-200 hover:bg-blue-50 disabled:opacity-60">
                  {gpsLoading ? "◌ Mencari GPS..." : "◎ Gunakan GPS Perangkat"}
                </button>
                <div className="rounded-xl bg-white/95 px-3 py-2 text-[10px] font-bold text-slate-600 shadow-lg border border-slate-200">Klik peta untuk menentukan titik</div>
              </div>
              <div className="absolute bottom-3 left-3 z-[1000] rounded-xl bg-slate-900/90 px-3 py-2 text-[9px] font-bold text-white shadow-lg">
                Koordinat: {form.latitude && form.longitude ? `${form.latitude}, ${form.longitude}` : "Belum ditentukan"}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-slate-200 bg-slate-50 p-4">
              <div>
                <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Latitude</label>
                <input value={form.latitude} onChange={(e) => setField("latitude", e.target.value)} inputMode="decimal" placeholder="-6.2000000" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-mono outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Longitude</label>
                <input value={form.longitude} onChange={(e) => setField("longitude", e.target.value)} inputMode="decimal" placeholder="106.8166667" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-mono outline-none focus:border-blue-500" />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">02 • Activity Attributes</div>
              <div className="text-sm font-extrabold">Atribut Data Kegiatan</div>
            </div>

            <div className="max-h-[650px] overflow-y-auto p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Nama Kegiatan" required><input value={form.nama_kegiatan} onChange={(e) => setField("nama_kegiatan", e.target.value)} placeholder="Contoh: Rehabilitasi DAS ..." className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></Field>
                <Field label="Jenis Kegiatan" required><select value={form.jenis_kegiatan} onChange={(e) => setField("jenis_kegiatan", e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option value="">Pilih jenis kegiatan</option>{jenisKegiatan.map((x) => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Tahun Pelaksanaan"><input type="number" min="1900" max="2200" value={form.tahun_pelaksanaan} onChange={(e) => setField("tahun_pelaksanaan", e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></Field>
                <Field label="Sumber Pendanaan"><input value={form.sumber_pendanaan} onChange={(e) => setField("sumber_pendanaan", e.target.value)} placeholder="APBN / APBD / Hibah / ..." className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></Field>
                <Field label="Instansi Pelaksana"><input value={form.instansi_pelaksana} onChange={(e) => setField("instansi_pelaksana", e.target.value)} placeholder="Nama instansi/UPT/mitra" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></Field>
                <Field label="Luas Area (Ha)"><input type="number" min="0" step="0.0001" value={form.luas_area} onChange={(e) => setField("luas_area", e.target.value)} placeholder="0.00" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></Field>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Lokasi Administrasi</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Provinsi"><input value={form.provinsi} onChange={(e) => setField("provinsi", e.target.value)} placeholder="Provinsi" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></Field>
                  <Field label="Kabupaten/Kota"><input value={form.kabupaten_kota} onChange={(e) => setField("kabupaten_kota", e.target.value)} placeholder="Kabupaten/Kota" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></Field>
                  <Field label="Kecamatan"><input value={form.kecamatan} onChange={(e) => setField("kecamatan", e.target.value)} placeholder="Kecamatan" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></Field>
                  <Field label="Desa/Kelurahan"><input value={form.desa_kelurahan} onChange={(e) => setField("desa_kelurahan", e.target.value)} placeholder="Desa/Kelurahan" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></Field>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Status Pelaksanaan"><select value={form.status_pelaksanaan} onChange={(e) => setField("status_pelaksanaan", e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100">{statusKegiatan.map((x) => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Sistem Koordinat"><div className="w-full rounded-xl border border-slate-300 bg-slate-100 px-3 py-2.5 text-xs font-mono text-slate-500">WGS 84 • EPSG:4326</div></Field>
              </div>

              <Field label="Keterangan Tambahan"><textarea value={form.keterangan} onChange={(e) => setField("keterangan", e.target.value)} rows={4} placeholder="Catatan, target, kondisi lapangan, atau informasi tambahan..." className="input-enterprise resize-none" /></Field>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4">
              <button type="button" onClick={() => { setForm(initialForm); setError(""); setSuccess(""); }} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[10px] font-black text-slate-600 hover:bg-slate-100">Reset Form</button>
              <button type="submit" disabled={saving} className="rounded-xl bg-slate-900 px-5 py-2.5 text-[10px] font-black text-white shadow-lg hover:bg-slate-800 disabled:opacity-60">
                {saving ? "Menyimpan..." : "Simpan Lokasi Kegiatan → Fokus Peta"}
              </button>
            </div>
          </section>
        </form>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <InfoCard title="Capture" value="Map + GPS" text="Titik dapat dipilih dengan klik peta atau GPS perangkat." />
          <InfoCard title="Spatial Reference" value="EPSG:4326" text="Longitude dan latitude disimpan sebagai Point PostGIS." />
          <InfoCard title="After Save" value="Auto Focus" text="Setelah tersimpan, peta Kerawanan diarahkan ke koordinat kegiatan." />
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}{required ? <b className="text-red-500"> *</b> : null}</span>{children}</label>;
}

function InfoCard({ title, value, text }: { title: string; value: string; text: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{title}</div><div className="mt-1 text-sm font-black">{value}</div><div className="mt-1 text-[10px] leading-relaxed text-slate-500">{text}</div></div>;
}
