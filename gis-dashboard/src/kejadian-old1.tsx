import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "./header";
import { API_URL } from "./api";

declare global {
  interface Window {
    L: any;
  }
}

type Incident = {
  id: number | string;
  title: string;
  category: string;
  type: string;
  date: string;
  location: string;
  address?: string;
  das?: string;
  coordinates: [number, number];
  featured?: boolean;
  image?: string;
  description?: string;
  curah_hujan?: number | null;
  thumbnail_path?: string | null;
  images_paths?: string[];
  longitude?: number | string;
  latitude?: number | string;
};

type FormState = {
  thumbnail: File | null;
  thumbnailPreview: string | null;
  images: File[];
  title: string;
  description: string;
  incidentDate: string;
  lokasi: string;
  disasterType: string;
  das: string;
  longitude: string;
  latitude: string;
  curahHujan: number | null;
  isLoadingRainfall: boolean;
  isLoadingLocation: boolean;
  locationError: string;
  dasError: string;
  rainfallError: string;
  featured: boolean;
};

const EMPTY_FORM: FormState = {
  thumbnail: null,
  thumbnailPreview: null,
  images: [],
  title: "",
  description: "",
  incidentDate: "",
  lokasi: "",
  disasterType: "",
  das: "",
  longitude: "",
  latitude: "",
  curahHujan: null,
  isLoadingRainfall: false,
  isLoadingLocation: false,
  locationError: "",
  dasError: "",
  rainfallError: "",
  featured: true,
};

const CATEGORY_TO_TYPE: Record<string, string> = {
  Banjir: "banjir",
  "Kebakaran Hutan dan Kekeringan": "kebakaran",
  "Tanah Longsor dan Erosi": "longsor",
};

const TYPE_TO_CATEGORY: Record<string, string> = {
  banjir: "Banjir",
  longsor: "Tanah Longsor dan Erosi",
  kebakaran: "Kebakaran Hutan dan Kekeringan",
};

const TYPE_LABEL: Record<string, string> = {
  banjir: "Banjir",
  longsor: "Longsor",
  kebakaran: "Kebakaran",
};

const TYPE_ICON: Record<string, string> = {
  banjir: "💧",
  longsor: "⛰️",
  kebakaran: "🔥",
};

const normalizeIncident = (raw: any, index: number): Incident => {
  const type =
    raw.type ||
    CATEGORY_TO_TYPE[raw.category] ||
    String(raw.disaster_type || "").toLowerCase() ||
    "banjir";

  const lat = Number(raw.latitude ?? raw.lat ?? raw.coordinates?.[0]);
  const lng = Number(raw.longitude ?? raw.lng ?? raw.coordinates?.[1]);

  const imagePath =
    raw.image ||
    raw.thumbnail ||
    (raw.thumbnail_path ? `${API_URL}${raw.thumbnail_path}` : "");

  return {
    ...raw,
    id: raw.id ?? index + 1,
    title: raw.title || "Kejadian tanpa judul",
    category: raw.category || TYPE_TO_CATEGORY[type] || "Bencana",
    type,
    date: raw.date || raw.incidentDate || raw.incident_date || "-",
    location: raw.location || raw.lokasi || "Lokasi belum tersedia",
    coordinates: [
      Number.isFinite(lat) ? lat : -2.5,
      Number.isFinite(lng) ? lng : 118,
    ],
    image: imagePath,
    featured: Boolean(raw.featured),
  };
};

const formatDate = (value: string) => {
  if (!value || value === "-") return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const Kebencanaan = () => {
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const clusterRef = useRef<any>(null);

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [isLoadingIncidents, setIsLoadingIncidents] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchText, setSearchText] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("All Lokasi");
  const [selectedCategory, setSelectedCategory] = useState("Kategori");
  const [selectedDisasterTypes, setSelectedDisasterTypes] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState("Newest Listings");
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [mapOnly, setMapOnly] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingKejadianId, setEditingKejadianId] = useState<number | string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);
  const [dasOptions, setDasOptions] = useState<string[]>([]);
  const [isLoadingDas, setIsLoadingDas] = useState(false);

  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const provinces = [
    "All Lokasi","Bali","Bangka Belitung","Banten","Bengkulu","DI Yogyakarta",
    "DKI Jakarta","Gorontalo","Jambi","Jawa Barat","Jawa Tengah","Jawa Timur",
    "Kalimantan Barat","Kalimantan Selatan","Kalimantan Tengah","Kalimantan Timur",
    "Kalimantan Utara","Kepulauan Riau","Lampung","Maluku","Maluku Utara",
    "Nusa Tenggara Barat","Nusa Tenggara Timur","Papua","Papua Barat","Riau",
    "Sulawesi Barat","Sulawesi Selatan","Sulawesi Tengah","Sulawesi Tenggara",
    "Sulawesi Utara","Sumatera Barat","Sumatera Selatan","Sumatera Utara",
  ];

  const categories = [
    "Kategori",
    "Banjir",
    "Kebakaran Hutan dan Kekeringan",
    "Tanah Longsor dan Erosi",
  ];

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setDasOptions([]);
    setIsLoadingDas(false);
    setIsEditMode(false);
    setEditingKejadianId(null);
  };

  const fetchIncidents = async () => {
    try {
      setIsLoadingIncidents(true);
      const response = await fetch(`${API_URL}/api/kejadian/list`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const source = Array.isArray(data) ? data : data.data || data.incidents || [];
      setIncidents(source.map(normalizeIncident));
    } catch (error) {
      console.error("Gagal mengambil kejadian:", error);
      setIncidents([]);
    } finally {
      setIsLoadingIncidents(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await fetchIncidents();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchIncidents();
  }, []);

  const filteredIncidents = useMemo(() => {
    const q = searchText.trim().toLowerCase();

    const result = incidents.filter((incident) => {
      const matchesSearch =
        !q ||
        incident.title.toLowerCase().includes(q) ||
        incident.location.toLowerCase().includes(q) ||
        incident.category.toLowerCase().includes(q) ||
        (incident.das || "").toLowerCase().includes(q);

      const matchesLocation =
        selectedLocation === "All Lokasi" ||
        incident.location.toLowerCase().includes(selectedLocation.toLowerCase());

      const matchesCategory =
        selectedCategory === "Kategori" ||
        incident.category === selectedCategory ||
        incident.type === CATEGORY_TO_TYPE[selectedCategory];

      const matchesType =
        selectedDisasterTypes.length === 0 ||
        selectedDisasterTypes.includes(incident.type);

      return matchesSearch && matchesLocation && matchesCategory && matchesType;
    });

    return [...result].sort((a, b) => {
      if (sortBy === "Alphabetically") return a.title.localeCompare(b.title);
      if (sortBy === "Oldest Listings")
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      if (sortBy === "Featured") return Number(b.featured) - Number(a.featured);
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [
    incidents,
    searchText,
    selectedLocation,
    selectedCategory,
    selectedDisasterTypes,
    sortBy,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredIncidents.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedIncidents = filteredIncidents.slice(startIndex, startIndex + itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchText, selectedLocation, selectedCategory, selectedDisasterTypes, itemsPerPage, sortBy]);

  const stats = useMemo(() => {
    const total = incidents.length;
    const flood = incidents.filter((x) => x.type === "banjir").length;
    const landslide = incidents.filter((x) => x.type === "longsor").length;
    const fire = incidents.filter((x) => x.type === "kebakaran").length;
    const featured = incidents.filter((x) => x.featured).length;
    return { total, flood, landslide, fire, featured };
  }, [incidents]);

  const loadLeaflet = () =>
    new Promise<void>((resolve, reject) => {
      if (window.L) return resolve();

      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(css);

      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Leaflet gagal dimuat"));
      document.head.appendChild(script);
    });

  useEffect(() => {
    let alive = true;

    loadLeaflet()
      .then(() => {
        if (!alive || !mapRef.current || mapInstanceRef.current || !window.L) return;

        const map = window.L.map(mapRef.current, {
          zoomControl: true,
          preferCanvas: true,
        }).setView([-2.5, 118], 5);

        window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        }).addTo(map);

        mapInstanceRef.current = map;
        clusterRef.current = window.L.layerGroup().addTo(map);
      })
      .catch(console.error);

    return () => {
      alive = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        clusterRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.L || !clusterRef.current) return;

    clusterRef.current.clearLayers();

    filteredIncidents.forEach((incident) => {
      const [lat, lng] = incident.coordinates;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const type = incident.type;
      const marker = window.L.marker([lat, lng], {
        title: incident.title,
      });

      marker.bindPopup(`
        <div style="min-width:220px;font-family:Arial,sans-serif">
          <div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase">
            ${TYPE_ICON[type] || "⚠️"} ${TYPE_LABEL[type] || incident.category}
          </div>
          <div style="font-size:14px;font-weight:800;margin-top:5px;color:#0f172a">
            ${incident.title}
          </div>
          <div style="font-size:11px;color:#64748b;margin-top:4px">
            ${incident.location}
          </div>
          <div style="font-size:10px;color:#94a3b8;margin-top:3px">
            ${formatDate(incident.date)}
          </div>
        </div>
      `);

      marker.on("click", () => {
        setSelectedIncident(incident);
      });

      marker.addTo(clusterRef.current);
    });
  }, [filteredIncidents]);

  const reverseGeocode = async (lat: number, lon: number) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    setFormData((prev) => ({
      ...prev,
      isLoadingLocation: true,
      locationError: "",
    }));

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=id`,
        { headers: { "User-Agent": "SIMITI-Kejadian/1.0" } },
      );
      const data = await response.json();

      if (data.address) {
        const village = data.address.village || data.address.suburb || "";
        const district = data.address.county || data.address.municipality || "";
        const city =
          data.address.city ||
          data.address.town ||
          data.address.city_district ||
          "";
        const province = data.address.state || "";

        const lokasi = [village, district, city, province].filter(Boolean).join(", ");

        setFormData((prev) => ({
          ...prev,
          lokasi,
          isLoadingLocation: false,
        }));

        await fetchDasByCoordinates(lon, lat);

        if (formData.incidentDate) {
          await fetchRainfallData(lat, lon, formData.incidentDate);
        }
      } else {
        setFormData((prev) => ({
          ...prev,
          isLoadingLocation: false,
          locationError: "Lokasi tidak ditemukan",
        }));
      }
    } catch (error) {
      console.error("Reverse geocoding error:", error);
      setFormData((prev) => ({
        ...prev,
        isLoadingLocation: false,
        locationError: "Gagal mengambil informasi lokasi",
      }));
    }
  };

  const fetchDasByCoordinates = async (longitude: number, latitude: number) => {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return;

    try {
      setIsLoadingDas(true);
      setFormData((prev) => ({ ...prev, dasError: "" }));

      const response = await fetch(
        `${API_URL}/api/das/by-coordinates?longitude=${longitude}&latitude=${latitude}`,
      );
      const data = await response.json();

      if (data.success && data.das) {
        setFormData((prev) => ({
          ...prev,
          das: data.das,
          dasError: data.isNearest
            ? "Menggunakan DAS terdekat karena titik berada di luar polygon DAS."
            : "",
        }));
      } else {
        setFormData((prev) => ({
          ...prev,
          das: "",
          dasError: "DAS tidak ditemukan untuk koordinat ini.",
        }));
      }
    } catch (error) {
      console.error("DAS error:", error);
      setFormData((prev) => ({
        ...prev,
        das: "",
        dasError: "Gagal mengambil data DAS.",
      }));
    } finally {
      setIsLoadingDas(false);
    }
  };

  const fetchRainfallData = async (
    latitude: number,
    longitude: number,
    date: string,
  ) => {
    if (!latitude || !longitude || !date) return;

    setFormData((prev) => ({
      ...prev,
      isLoadingRainfall: true,
      rainfallError: "",
    }));

    try {
      const response = await fetch(
        `${API_URL}/api/weather/rainfall?latitude=${latitude}&longitude=${longitude}&date=${date}`,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      if (data.success) {
        setFormData((prev) => ({
          ...prev,
          curahHujan: data.rainfall,
          isLoadingRainfall: false,
        }));
      } else {
        throw new Error(data.message || "Data curah hujan tidak tersedia");
      }
    } catch (error) {
      console.error("Rainfall error:", error);
      setFormData((prev) => ({
        ...prev,
        curahHujan: null,
        isLoadingRainfall: false,
        rainfallError: "Data curah hujan tidak tersedia.",
      }));
    }
  };

  useEffect(() => {
    const lat = Number(formData.latitude);
    const lon = Number(formData.longitude);

    if (formData.incidentDate && Number.isFinite(lat) && Number.isFinite(lon)) {
      fetchRainfallData(lat, lon, formData.incidentDate);
    }
  }, [formData.incidentDate]);

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const handleEditKejadian = (incident: Incident) => {
    const lat = incident.latitude ?? incident.coordinates?.[0] ?? "";
    const lon = incident.longitude ?? incident.coordinates?.[1] ?? "";

    setIsEditMode(true);
    setEditingKejadianId(incident.id);
    setFormData({
      ...EMPTY_FORM,
      title: incident.title || "",
      description: incident.description || "",
      incidentDate: incident.date || "",
      lokasi: incident.location || "",
      disasterType: incident.type || "",
      das: incident.das || "",
      longitude: String(lon),
      latitude: String(lat),
      curahHujan: incident.curah_hujan ?? null,
      featured: Boolean(incident.featured),
      thumbnailPreview: incident.thumbnail_path
        ? `${API_URL}${incident.thumbnail_path}`
        : incident.image || null,
    });
    setShowDetail(false);
    setShowAddModal(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, files } = e.target;
    if (!files) return;

    if (name === "thumbnail") {
      const file = files[0];
      setFormData((prev) => ({
        ...prev,
        thumbnail: file,
        thumbnailPreview: URL.createObjectURL(file),
      }));
    }

    if (name === "images") {
      setFormData((prev) => ({
        ...prev,
        images: Array.from(files),
      }));
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCoordinateChange = (
    name: "latitude" | "longitude",
    value: string,
  ) => {
    setFormData((prev) => ({ ...prev, [name]: value }));

    const lat = name === "latitude" ? Number(value) : Number(formData.latitude);
    const lon = name === "longitude" ? Number(value) : Number(formData.longitude);

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      reverseGeocode(lat, lon);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      alert("Judul kejadian wajib diisi.");
      return;
    }

    if (!formData.disasterType) {
      alert("Jenis bencana wajib dipilih.");
      return;
    }

    if (!formData.incidentDate) {
      alert("Tanggal kejadian wajib diisi.");
      return;
    }

    setSaving(true);

    try {
      const category = TYPE_TO_CATEGORY[formData.disasterType] || formData.disasterType;
      const body = new FormData();

      body.append("title", formData.title);
      body.append("category", category);
      body.append("incidentDate", formData.incidentDate);
      body.append("location", formData.lokasi);
      body.append("das", formData.das || "");
      body.append("longitude", formData.longitude);
      body.append("latitude", formData.latitude);
      body.append(
        "curahHujan",
        formData.curahHujan !== null ? String(formData.curahHujan) : "",
      );
      body.append("featured", String(formData.featured));
      body.append("description", formData.description || "");

      if (formData.thumbnail) {
        body.append("thumbnail", formData.thumbnail);
      }

      formData.images.forEach((file) => body.append("images", file));

      const url = isEditMode
        ? `${API_URL}/api/kejadian/${editingKejadianId}`
        : `${API_URL}/api/kejadian/add`;

      const response = await fetch(url, {
        method: isEditMode ? "PUT" : "POST",
        body,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }

      alert(isEditMode ? "Kejadian berhasil diperbarui." : "Kejadian berhasil ditambahkan.");
      setShowAddModal(false);
      resetForm();
      await fetchIncidents();
    } catch (error: any) {
      console.error("Submit kejadian error:", error);
      alert(error?.message || "Gagal menyimpan kejadian.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKejadian = async (id: number | string) => {
    if (!window.confirm("Hapus kejadian ini? Data yang sudah dihapus tidak dapat dikembalikan.")) return;

    try {
      const response = await fetch(`${API_URL}/api/kejadian/${id}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }

      alert("Kejadian berhasil dihapus.");
      setShowDetail(false);
      setSelectedIncident(null);
      await fetchIncidents();
    } catch (error: any) {
      console.error("Delete kejadian error:", error);
      alert(error?.message || "Gagal menghapus kejadian.");
    }
  };

  const handleToggleFeatured = async (id: number | string, currentStatus: boolean) => {
    try {
      const response = await fetch(`${API_URL}/api/kejadian/${id}/featured`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featured: !currentStatus }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }

      await fetchIncidents();
    } catch (error: any) {
      console.error("Toggle featured error:", error);
      alert(error?.message || "Gagal mengubah status featured.");
    }
  };

  const focusIncident = (incident: Incident) => {
    setSelectedIncident(incident);
    setShowDetail(true);

    const map = mapInstanceRef.current;
    if (map && incident.coordinates) {
      map.setView(incident.coordinates, Math.max(map.getZoom(), 11), {
        animate: true,
      });
    }
  };

  const clearFilters = () => {
    setSearchText("");
    setSelectedLocation("All Lokasi");
    setSelectedCategory("Kategori");
    setSelectedDisasterTypes([]);
    setSortBy("Newest Listings");
    setMapOnly(false);
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
      <Header currentPage="kejadian" />

      <main className="mx-auto w-full max-w-[1800px] px-4 py-5 md:px-6 lg:px-8">
        {/* Enterprise hero */}
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="relative bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-5 py-7 text-white md:px-8">
            <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.8)]" />
                  SIMITI Enterprise GIS
                </div>
                <h1 className="text-2xl font-black tracking-tight md:text-3xl">
                  Pusat Data Kejadian Bencana
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                  Inventarisasi, pemetaan, monitoring, dan pengelolaan kejadian
                  bencana secara terintegrasi dalam satu workspace.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={refresh}
                  disabled={refreshing}
                  className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-xs font-bold text-white backdrop-blur hover:bg-white/15 disabled:opacity-50"
                >
                  {refreshing ? "Memuat..." : "↻ Refresh Data"}
                </button>
                <button
                  onClick={openAddModal}
                  className="rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-emerald-950/30 hover:bg-emerald-400"
                >
                  + Tambah Kejadian
                </button>
              </div>
            </div>
          </div>

          {/* KPI */}
          <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 md:grid-cols-5 md:divide-y-0">
            {[
              ["Total Kejadian", stats.total, "Seluruh dataset", "slate"],
              ["Banjir", stats.flood, "Kejadian", "blue"],
              ["Longsor", stats.landslide, "Kejadian", "amber"],
              ["Kebakaran", stats.fire, "Kejadian", "red"],
              ["Featured", stats.featured, "Prioritas tampilan", "emerald"],
            ].map(([label, value, sub, tone]) => (
              <div key={label as string} className="p-4 md:p-5">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  {label}
                </div>
                <div className="mt-1 text-2xl font-black text-slate-900">
                  {value}
                </div>
                <div className="mt-1 text-[10px] font-medium text-slate-400">
                  {sub}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Workspace */}
        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(440px,0.78fr)]">
          <div className="min-w-0">
            {/* Toolbar */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative min-w-0 flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
                  <input
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Cari judul, lokasi, kategori, atau DAS..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-9 pr-4 text-xs font-medium outline-none transition focus:border-emerald-400 focus:bg-white"
                  />
                </div>

                <select
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-bold text-slate-600 outline-none"
                >
                  {provinces.map((x) => <option key={x}>{x}</option>)}
                </select>

                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-bold text-slate-600 outline-none"
                >
                  {categories.map((x) => <option key={x}>{x}</option>)}
                </select>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-bold text-slate-600 outline-none"
                >
                  <option>Newest Listings</option>
                  <option>Oldest Listings</option>
                  <option>Alphabetically</option>
                  <option>Featured</option>
                </select>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {(["banjir", "longsor", "kebakaran"] as string[]).map((type) => {
                  const active = selectedDisasterTypes.includes(type);
                  return (
                    <button
                      key={type}
                      onClick={() =>
                        setSelectedDisasterTypes((prev) =>
                          active ? prev.filter((x) => x !== type) : [...prev, type],
                        )
                      }
                      className={`rounded-full border px-3 py-1.5 text-[10px] font-black transition ${
                        active
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-500 hover:border-slate-400"
                      }`}
                    >
                      {TYPE_ICON[type]} {TYPE_LABEL[type]}
                    </button>
                  );
                })}

                {(searchText || selectedLocation !== "All Lokasi" || selectedCategory !== "Kategori" || selectedDisasterTypes.length) && (
                  <button
                    onClick={clearFilters}
                    className="ml-auto text-[10px] font-black text-emerald-700 hover:underline"
                  >
                    Reset Filter
                  </button>
                )}

                <div className="ml-auto flex rounded-xl border border-slate-200 p-1">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`rounded-lg px-3 py-1.5 text-[10px] font-black ${
                      viewMode === "grid" ? "bg-slate-900 text-white" : "text-slate-400"
                    }`}
                  >
                    Grid
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`rounded-lg px-3 py-1.5 text-[10px] font-black ${
                      viewMode === "list" ? "bg-slate-900 text-white" : "text-slate-400"
                    }`}
                  >
                    List
                  </button>
                </div>
              </div>
            </div>

            {/* Registry header */}
            <div className="mt-5 flex items-end justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">
                  Incident Registry
                </div>
                <h2 className="mt-1 text-lg font-black tracking-tight text-slate-900">
                  Daftar Kejadian
                </h2>
              </div>
              <div className="text-right text-[10px] font-semibold text-slate-400">
                {filteredIncidents.length} record ditemukan
              </div>
            </div>

            {isLoadingIncidents ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {[1, 2, 3, 4].map((x) => (
                  <div key={x} className="h-56 animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-slate-200" />
                ))}
              </div>
            ) : filteredIncidents.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
                <div className="text-3xl">⌁</div>
                <div className="mt-3 text-sm font-black text-slate-800">Data tidak ditemukan</div>
                <div className="mt-1 text-xs text-slate-400">Coba ubah kata pencarian atau filter.</div>
              </div>
            ) : viewMode === "grid" ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {paginatedIncidents.map((incident) => (
                  <article
                    key={incident.id}
                    onClick={() => focusIncident(incident)}
                    className="group cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg"
                  >
                    <div className="relative h-48 overflow-hidden bg-slate-100">
                      {incident.image ? (
                        <img
                          src={incident.image}
                          alt={incident.title}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-slate-100 text-5xl">
                          {TYPE_ICON[incident.type] || "⚠️"}
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-12">
                        <span className="rounded-lg bg-white/95 px-2.5 py-1 text-[9px] font-black text-slate-800">
                          {incident.category}
                        </span>
                      </div>
                      {incident.featured && (
                        <span className="absolute right-3 top-3 rounded-full bg-amber-400 px-2.5 py-1 text-[9px] font-black text-white shadow">
                          ★ FEATURED
                        </span>
                      )}
                    </div>

                    <div className="p-4">
                      <h3 className="line-clamp-2 text-sm font-black leading-5 text-slate-900">
                        {incident.title}
                      </h3>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-slate-50 p-2.5">
                          <div className="text-[8px] font-black uppercase text-slate-400">Lokasi</div>
                          <div className="mt-1 line-clamp-2 text-[10px] font-bold text-slate-700">
                            {incident.location}
                          </div>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-2.5">
                          <div className="text-[8px] font-black uppercase text-slate-400">Tanggal</div>
                          <div className="mt-1 text-[10px] font-bold text-slate-700">
                            {formatDate(incident.date)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                        <span className="text-[9px] font-bold text-slate-400">
                          DAS: {incident.das || "Belum tersedia"}
                        </span>
                        <span className="text-[10px] font-black text-emerald-600">
                          Detail →
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {paginatedIncidents.map((incident) => (
                  <article
                    key={incident.id}
                    onClick={() => focusIncident(incident)}
                    className="flex cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-lg"
                  >
                    <div className="hidden w-48 shrink-0 bg-slate-100 sm:block">
                      {incident.image ? (
                        <img src={incident.image} alt={incident.title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-4xl">
                          {TYPE_ICON[incident.type] || "⚠️"}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 p-4">
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-600">
                          {incident.category}
                        </span>
                        {incident.featured && (
                          <span className="rounded-lg bg-amber-50 px-2 py-1 text-[9px] font-black text-amber-700">
                            ★ Featured
                          </span>
                        )}
                      </div>
                      <h3 className="mt-2 text-base font-black text-slate-900">{incident.title}</h3>
                      <p className="mt-1 text-xs font-medium text-slate-500">{incident.location}</p>
                      <div className="mt-3 flex flex-wrap gap-3 text-[10px] font-bold text-slate-400">
                        <span>📅 {formatDate(incident.date)}</span>
                        <span>🌊 DAS: {incident.das || "-"}</span>
                        <span className="text-emerald-600">Buka detail →</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {/* Pagination */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-[10px] font-semibold text-slate-400">
                Menampilkan {filteredIncidents.length ? startIndex + 1 : 0}-
                {Math.min(startIndex + itemsPerPage, filteredIncidents.length)} dari {filteredIncidents.length}
              </div>
              <div className="flex items-center gap-1">
                <select
                  value={itemsPerPage}
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="mr-2 rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] font-bold"
                >
                  <option value={10}>10 / halaman</option>
                  <option value={20}>20 / halaman</option>
                  <option value={50}>50 / halaman</option>
                </select>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black disabled:opacity-30"
                >
                  ‹
                </button>
                <span className="px-3 text-[10px] font-black text-slate-600">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black disabled:opacity-30"
                >
                  ›
                </button>
              </div>
            </div>
          </div>

          {/* Map command center */}
          <aside className="xl:sticky xl:top-4 xl:self-start">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-600">
                    Spatial Command Center
                  </div>
                  <div className="mt-0.5 text-sm font-black text-slate-900">
                    Peta Sebaran Kejadian
                  </div>
                </div>
                <button
                  onClick={() => setMapOnly((x) => !x)}
                  className={`rounded-lg px-2.5 py-1.5 text-[9px] font-black ${
                    mapOnly ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {mapOnly ? "Map Mode" : "Focus"}
                </button>
              </div>

              <div ref={mapRef} className="h-[520px] w-full bg-slate-100" />

              <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100">
                {[
                  ["💧", stats.flood, "Banjir"],
                  ["⛰️", stats.landslide, "Longsor"],
                  ["🔥", stats.fire, "Kebakaran"],
                ].map(([icon, value, label]) => (
                  <div key={label as string} className="p-3 text-center">
                    <div className="text-base">{icon}</div>
                    <div className="mt-1 text-sm font-black">{value}</div>
                    <div className="text-[8px] font-black uppercase text-slate-400">{label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                Data Governance
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-emerald-50 p-3">
                  <div className="text-[9px] font-black text-emerald-700">Registry</div>
                  <div className="mt-1 text-xs font-bold text-emerald-900">LIVE</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-[9px] font-black text-slate-500">Spatial</div>
                  <div className="mt-1 text-xs font-bold text-slate-800">GIS READY</div>
                </div>
              </div>
            </div>
          </aside>
        </section>
      </main>

      {/* Detail drawer */}
      {showDetail && selectedIncident && (
        <div className="fixed inset-0 z-[2000] bg-slate-950/50 backdrop-blur-sm" onClick={() => setShowDetail(false)}>
          <div
            className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative h-56 bg-slate-900">
              {selectedIncident.image ? (
                <img src={selectedIncident.image} alt={selectedIncident.title} className="h-full w-full object-cover opacity-80" />
              ) : (
                <div className="flex h-full items-center justify-center text-6xl">{TYPE_ICON[selectedIncident.type] || "⚠️"}</div>
              )}
              <button
                onClick={() => setShowDetail(false)}
                className="absolute right-4 top-4 rounded-xl bg-black/40 px-3 py-2 text-white"
              >
                ✕
              </button>
              <div className="absolute bottom-4 left-5 right-5">
                <span className="rounded-lg bg-white px-2.5 py-1 text-[9px] font-black text-slate-800">
                  {selectedIncident.category}
                </span>
                <h2 className="mt-2 text-xl font-black text-white">{selectedIncident.title}</h2>
              </div>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Tanggal", formatDate(selectedIncident.date)],
                  ["Lokasi", selectedIncident.location],
                  ["DAS", selectedIncident.das || "-"],
                  ["Curah Hujan", selectedIncident.curah_hujan != null ? `${selectedIncident.curah_hujan} mm` : "-"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="text-[8px] font-black uppercase text-slate-400">{label}</div>
                    <div className="mt-1 text-[11px] font-bold text-slate-800">{value}</div>
                  </div>
                ))}
              </div>

              <div>
                <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Koordinat</div>
                <div className="mt-2 rounded-xl bg-slate-950 p-3 font-mono text-[10px] text-emerald-300">
                  {selectedIncident.coordinates[0].toFixed(6)}, {selectedIncident.coordinates[1].toFixed(6)}
                </div>
              </div>

              <div>
                <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Deskripsi</div>
                <p className="mt-2 text-xs leading-6 text-slate-600">
                  {selectedIncident.description || "Belum ada deskripsi kejadian."}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <button
                  onClick={() => handleEditKejadian(selectedIncident)}
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-[10px] font-black text-white"
                >
                  ✎ Edit
                </button>
                <button
                  onClick={() => handleToggleFeatured(selectedIncident.id, Boolean(selectedIncident.featured))}
                  className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[10px] font-black text-amber-700"
                >
                  {selectedIncident.featured ? "★ Unfeatured" : "☆ Featured"}
                </button>
                <button
                  onClick={() => handleDeleteKejadian(selectedIncident.id)}
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[10px] font-black text-red-600"
                >
                  🗑 Hapus
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
          <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-600">
                  Incident Data Entry
                </div>
                <h2 className="mt-1 text-lg font-black">
                  {isEditMode ? "Edit Kejadian Bencana" : "Tambah Kejadian Bencana"}
                </h2>
              </div>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-black text-slate-500"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5">
              <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                    <div className="flex h-52 items-center justify-center">
                      {formData.thumbnailPreview ? (
                        <img src={formData.thumbnailPreview} alt="Preview" className="h-full w-full object-cover" />
                      ) : (
                        <div className="text-center">
                          <div className="text-4xl">🖼️</div>
                          <div className="mt-2 text-[10px] font-bold text-slate-400">Thumbnail kejadian</div>
                        </div>
                      )}
                    </div>
                    <label className="block cursor-pointer border-t border-slate-200 bg-white p-3 text-center text-[10px] font-black text-slate-600 hover:bg-slate-50">
                      Upload Thumbnail
                      <input
                        type="file"
                        name="thumbnail"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <label className="block rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-[10px] font-black text-slate-500">
                    📷 Foto Pendukung
                    <input
                      type="file"
                      name="images"
                      accept="image/*"
                      multiple
                      onChange={handleFileChange}
                      className="mt-2 block w-full text-[9px]"
                    />
                    {formData.images.length > 0 && (
                      <div className="mt-2 text-emerald-600">
                        {formData.images.length} file dipilih
                      </div>
                    )}
                  </label>

                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                    <div className="text-[9px] font-black uppercase tracking-wider text-emerald-700">
                      Enterprise Data Tip
                    </div>
                    <p className="mt-2 text-[10px] leading-5 text-emerald-900/70">
                      Isi koordinat untuk mendapatkan lokasi, DAS, dan curah hujan
                      secara otomatis.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="field-label">Judul Kejadian *</label>
                    <input name="title" value={formData.title} onChange={handleInputChange} className="field" placeholder="Contoh: Banjir merendam permukiman..." required />
                  </div>

                  <div>
                    <label className="field-label">Jenis Bencana *</label>
                    <select name="disasterType" value={formData.disasterType} onChange={handleInputChange} className="field" required>
                      <option value="">Pilih jenis bencana</option>
                      <option value="banjir">💧 Banjir</option>
                      <option value="longsor">⛰️ Longsor</option>
                      <option value="kebakaran">🔥 Kebakaran</option>
                    </select>
                  </div>

                  <div>
                    <label className="field-label">Tanggal Kejadian *</label>
                    <input type="date" name="incidentDate" value={formData.incidentDate} onChange={handleInputChange} className="field" required />
                  </div>

                  <div className="md:col-span-2">
                    <label className="field-label">Lokasi</label>
                    <input name="lokasi" value={formData.lokasi} onChange={handleInputChange} className="field" placeholder="Terisi otomatis dari koordinat, tetapi tetap bisa diedit" />
                    {formData.isLoadingLocation && <div className="mt-1 text-[9px] font-bold text-emerald-600">Mencari lokasi...</div>}
                    {formData.locationError && <div className="mt-1 text-[9px] font-bold text-red-600">{formData.locationError}</div>}
                  </div>

                  <div>
                    <label className="field-label">Latitude</label>
                    <input value={formData.latitude} onChange={(e) => handleCoordinateChange("latitude", e.target.value)} className="field font-mono" placeholder="-8.583421" />
                  </div>

                  <div>
                    <label className="field-label">Longitude</label>
                    <input value={formData.longitude} onChange={(e) => handleCoordinateChange("longitude", e.target.value)} className="field font-mono" placeholder="116.112342" />
                  </div>

                  <div>
                    <label className="field-label">DAS</label>
                    <input name="das" value={formData.das} onChange={handleInputChange} className="field" placeholder={isLoadingDas ? "Mencari DAS..." : "Otomatis berdasarkan koordinat"} />
                    {formData.dasError && <div className="mt-1 text-[9px] font-bold text-amber-600">{formData.dasError}</div>}
                  </div>

                  <div>
                    <label className="field-label">Curah Hujan</label>
                    <div className="relative">
                      <input value={formData.curahHujan ?? ""} readOnly className="field bg-slate-50 pr-12" placeholder={formData.isLoadingRainfall ? "Mengambil..." : "Otomatis"} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-400">mm</span>
                    </div>
                    {formData.rainfallError && <div className="mt-1 text-[9px] font-bold text-amber-600">{formData.rainfallError}</div>}
                  </div>

                  <div className="md:col-span-2">
                    <label className="field-label">Deskripsi</label>
                    <textarea name="description" value={formData.description} onChange={handleInputChange} rows={5} className="field resize-none" placeholder="Deskripsi detail kejadian..." />
                  </div>

                  <div className="md:col-span-2 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div>
                      <div className="text-xs font-black text-slate-800">Featured</div>
                      <div className="mt-1 text-[10px] text-slate-400">Tampilkan sebagai kejadian prioritas.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, featured: !prev.featured }))}
                      className={`relative h-7 w-12 rounded-full transition ${formData.featured ? "bg-emerald-500" : "bg-slate-300"}`}
                    >
                      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${formData.featured ? "left-6" : "left-1"}`} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-xs font-black text-slate-600"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-slate-900 px-6 py-2.5 text-xs font-black text-white shadow-lg disabled:opacity-50"
                >
                  {saving ? "Menyimpan..." : isEditMode ? "Simpan Perubahan" : "Simpan Kejadian"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .field-label {
          display:block;
          margin-bottom:6px;
          font-size:9px;
          line-height:1;
          font-weight:900;
          text-transform:uppercase;
          letter-spacing:.08em;
          color:#64748b;
        }
        .field {
          width:100%;
          border:1px solid #e2e8f0;
          border-radius:12px;
          background:#fff;
          padding:11px 12px;
          font-size:12px;
          font-weight:600;
          color:#0f172a;
          outline:none;
          transition:all .15s ease;
        }
        .field:focus {
          border-color:#34d399;
          box-shadow:0 0 0 3px rgba(52,211,153,.10);
        }
      `}</style>
    </div>
  );
};

export default Kebencanaan;
