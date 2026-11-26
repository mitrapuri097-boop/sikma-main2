import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import Header from "./header";
import { API_URL } from "./api";

/* =========================================================
   GLOBAL LEAFLET
========================================================= */

declare global {
  interface Window {
    L: any;
  }
}

/* =========================================================
   TYPES
========================================================= */

type Incident = {
  id: number | string;
  title: string;
  category: string;
  type: string;
  date: string;
  location: string;
  das?: string;
  description?: string;
  coordinates: [number, number];
  latitude?: number | string;
  longitude?: number | string;
  curah_hujan?: number | null;
  featured?: boolean;
  image?: string;
  thumbnail_path?: string;
  images_paths?: string[];
  [key: string]: any;
};

type FormState = {
  title: string;
  description: string;
  incidentDate: string;
  lokasi: string;
  disasterType: string;
  das: string;
  latitude: string;
  longitude: string;
  curahHujan: number | null;
  featured: boolean;
  thumbnail: File | null;
  thumbnailPreview: string | null;
  images: File[];
};

/* =========================================================
   CONSTANTS
========================================================= */

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  incidentDate: "",
  lokasi: "",
  disasterType: "",
  das: "",
  latitude: "",
  longitude: "",
  curahHujan: null,
  featured: true,
  thumbnail: null,
  thumbnailPreview: null,
  images: [],
};

const TYPE_META: Record<
  string,
  {
    label: string;
    icon: string;
    color: string;
  }
> = {
  banjir: {
    label: "Banjir",
    icon: "💧",
    color: "#2563eb",
  },

  longsor: {
    label: "Longsor",
    icon: "⛰️",
    color: "#f59e0b",
  },

  kebakaran: {
    label: "Kebakaran",
    icon: "🔥",
    color: "#ef4444",
  },

  kekeringan: {
    label: "Kekeringan",
    icon: "☀️",
    color: "#d97706",
  },

  abrasi: {
    label: "Abrasi",
    icon: "🌊",
    color: "#0891b2",
  },

  lainnya: {
    label: "Lainnya",
    icon: "⚠️",
    color: "#64748b",
  },
};

const CATEGORY_TO_TYPE: Record<string, string> = {
  Banjir: "banjir",
  "Tanah Longsor dan Erosi": "longsor",
  "Kebakaran Hutan": "kebakaran",
  Kekeringan: "kekeringan",
  Abrasi: "abrasi",
};

const TYPE_TO_CATEGORY: Record<string, string> = {
  banjir: "Banjir",
  longsor: "Tanah Longsor dan Erosi",
  kebakaran: "Kebakaran Hutan",
  kekeringan: "Kekeringan",
  abrasi: "Abrasi",
};


/* =========================================================
   HELPERS
========================================================= */

const fmtDate = (value: string) => {
  if (!value || value === "-") {
    return "-";
  }

  const d = new Date(value);

  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
};

const fmtDateTime = (value: string) => {
  if (!value || value === "-") {
    return "-";
  }

  const d = new Date(value);

  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};

/* =========================================================
   NORMALIZE API DATA
========================================================= */

const normalize = (raw: any, index: number): Incident => {
  const category = String(raw.category || raw.kategori || "").trim();

  let type = String(raw.type || "").toLowerCase();

  if (!type) {
    type =
      CATEGORY_TO_TYPE[category] ||
      String(raw.disaster_type || "").toLowerCase();
  }

  if (type.includes("banjir")) {
    type = "banjir";
  } else if (type.includes("longsor") || type.includes("erosi")) {
    type = "longsor";
  } else if (type.includes("kebakaran") || type.includes("karhutla")) {
    type = "kebakaran";
  } else if (type.includes("kekeringan")) {
    type = "kekeringan";
  } else if (type.includes("abrasi") || type.includes("abration")) {
    type = "abrasi";
  }

  /*
   * Pastikan setiap type memiliki metadata.
   * Type dari API yang belum dikenali
   * otomatis masuk ke "lainnya".
   */
  if (!TYPE_META[type]) {
    type = "lainnya";
  }

  const lat = Number(raw.latitude ?? raw.lat ?? raw.coordinates?.[0]);

  const lng = Number(raw.longitude ?? raw.lng ?? raw.coordinates?.[1]);

  let image = raw.image || raw.thumbnail || "";

  if (!image && raw.thumbnail_path) {
    image = String(raw.thumbnail_path).startsWith("http")
      ? raw.thumbnail_path
      : `${API_URL}${raw.thumbnail_path}`;
  }

  return {
    ...raw,

    id: raw.id ?? index + 1,

    title: raw.title || "Kejadian tanpa judul",

    category: category || TYPE_TO_CATEGORY[type] || "Bencana",

    type,

    date: raw.date || raw.incidentDate || raw.incident_date || "-",

    location:
      raw.location || raw.lokasi || raw.address || "Lokasi belum tersedia",

    das: raw.das || "",

    description: raw.description || "",

    coordinates: [
      Number.isFinite(lat) ? lat : -2.5,

      Number.isFinite(lng) ? lng : 118,
    ],

    latitude: lat,
    longitude: lng,

    curah_hujan: raw.curah_hujan ?? raw.curahHujan ?? null,

    featured: Boolean(raw.featured),

    image,
  };
};

/* =========================================================
   INCIDENT IMAGE RESOLVER
========================================================= */

const resolveIncidentImage = (incident: Incident): string => {
  const candidate =
    incident.image ||
    incident.thumbnail_path ||
    incident.thumbnail ||
    (Array.isArray(incident.images_paths) ? incident.images_paths[0] : "") ||
    "";

  if (!candidate) return "";

  const value = String(candidate);
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("//") || value.startsWith("data:")) {
    return value;
  }

  return `${API_URL}${value.startsWith("/") ? "" : "/"}${value}`;
};

/* =========================================================
   LEAFLET LOADER
   Singleton Promise
   Mencegah Leaflet dimuat berkali-kali
========================================================= */

let leafletLoaderPromise: Promise<void> | null = null;

const loadLeaflet = async (): Promise<void> => {
  /*
   * Kalau Leaflet + MarkerCluster sudah siap,
   * langsung selesai.
   */
  if (
    window.L &&
    typeof window.L.map === "function" &&
    typeof window.L.markerClusterGroup === "function"
  ) {
    return;
  }

  /*
   * Kalau sedang dalam proses loading,
   * gunakan Promise yang sama.
   */
  if (leafletLoaderPromise) {
    return leafletLoaderPromise;
  }

  leafletLoaderPromise = new Promise<void>((resolve, reject) => {
    const addCss = (id: string, href: string) => {
      if (document.getElementById(id)) {
        return;
      }

      const link = document.createElement("link");

      link.id = id;
      link.rel = "stylesheet";
      link.href = href;

      document.head.appendChild(link);
    };

    addCss(
      "smiti-leaflet-css",
      "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
    );

    addCss(
      "smiti-cluster-css",
      "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css",
    );

    addCss(
      "smiti-cluster-default-css",
      "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css",
    );

    const loadScript = (id: string, src: string): Promise<void> => {
      return new Promise((resolveScript, rejectScript) => {
        const existing = document.getElementById(id);

        if (existing) {
          /*
           * Script sudah ada.
           * Tunggu sebentar sampai global tersedia.
           */
          if (id === "smiti-leaflet-js") {
            if (window.L) {
              resolveScript();
              return;
            }
          }

          if (id === "smiti-leaflet-cluster-js") {
            if (window.L?.markerClusterGroup) {
              resolveScript();
              return;
            }
          }

          const checkLoaded = window.setInterval(() => {
            if (id === "smiti-leaflet-js" && window.L) {
              window.clearInterval(checkLoaded);
              resolveScript();
            }

            if (
              id === "smiti-leaflet-cluster-js" &&
              window.L?.markerClusterGroup
            ) {
              window.clearInterval(checkLoaded);
              resolveScript();
            }
          }, 50);

          window.setTimeout(() => {
            window.clearInterval(checkLoaded);

            if (id === "smiti-leaflet-js" && window.L) {
              resolveScript();
              return;
            }

            if (
              id === "smiti-leaflet-cluster-js" &&
              window.L?.markerClusterGroup
            ) {
              resolveScript();
              return;
            }

            rejectScript(new Error(`Timeout memuat script: ${src}`));
          }, 10000);

          return;
        }

        const script = document.createElement("script");

        script.id = id;
        script.src = src;
        script.async = true;

        script.onload = () => {
          resolveScript();
        };

        script.onerror = () => {
          rejectScript(new Error(`Gagal memuat script: ${src}`));
        };

        document.body.appendChild(script);
      });
    };

    loadScript(
      "smiti-leaflet-js",
      "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
    )
      .then(() =>
        loadScript(
          "smiti-leaflet-cluster-js",
          "https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js",
        ),
      )
      .then(() => {
        if (!window.L) {
          throw new Error("Leaflet tidak tersedia.");
        }

        if (typeof window.L.markerClusterGroup !== "function") {
          throw new Error("Leaflet MarkerCluster tidak tersedia.");
        }

        resolve();
      })
      .catch((error) => {
        leafletLoaderPromise = null;
        reject(error);
      });
  });

  return leafletLoaderPromise;
};

/* =========================================================
   COMPONENT
========================================================= */

const Kebencanaan: React.FC = () => {
  /* =======================================================
     MAP REFS
  ======================================================= */

  const mapRef = useRef<HTMLDivElement | null>(null);

  const mapRefInstance = useRef<any>(null);

  const clusterRef = useRef<any>(null);

  const invalidateTimerRef = useRef<number | null>(null);

  /* =======================================================
     MAP STATE
  ======================================================= */

  const [mapReady, setMapReady] = useState(false);

  /* =======================================================
     DATA STATE
  ======================================================= */

  const [incidents, setIncidents] = useState<Incident[]>([]);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  /* =======================================================
     FILTER STATE
  ======================================================= */

  const [search, setSearch] = useState("");


  const [activeTab, setActiveTab] = useState<"administrasi" | "das">("administrasi");
  const [adminLevel, setAdminLevel] = useState<"provinsi" | "kabupaten" | "kecamatan" | "kelurahan">("provinsi");
  const [selectedAreas, setSelectedAreas] = useState<any[]>([]);
  const [areaSearchQuery, setAreaSearchQuery] = useState("");
  const [areaSearchResults, setAreaSearchResults] = useState<any[]>([]);
  const [showAreaSearchDropdown, setShowAreaSearchDropdown] = useState(false);
  const [areaSearchLoading, setAreaSearchLoading] = useState(false);
  const [selectedDas, setSelectedDas] = useState<any | null>(null);
  const [dasSearchQuery, setDasSearchQuery] = useState("");
  const [dasSearchResults, setDasSearchResults] = useState<any[]>([]);
  const [showDasSearchDropdown, setShowDasSearchDropdown] = useState(false);
  const [dasSearchLoading, setDasSearchLoading] = useState(false);
  const areaSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dasSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const areaSearchRequestRef = useRef(0);
  const dasSearchRequestRef = useRef(0);
  const boundaryLayerRef = useRef<any>(null);

  const [category, setCategory] = useState("Semua");

  const [types, setTypes] = useState<string[]>([]);

  const [sort, setSort] = useState("newest");

  const [mapOnly, setMapOnly] = useState(false);

  /* =======================================================
     DETAIL / FORM STATE
  ======================================================= */

  const [selected, setSelected] = useState<Incident | null>(null);

  const [showAdd, setShowAdd] = useState(false);

  const [editMode, setEditMode] = useState(false);

  const [editId, setEditId] = useState<number | string | null>(null);

  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const [dasLoading, setDasLoading] = useState(false);

  const [locationLoading, setLocationLoading] = useState(false);

  /* =======================================================
     FETCH INCIDENTS
  ======================================================= */

  const fetchIncidents = useCallback(async () => {
    try {
      setLoading(true);

      const res = await fetch(`${API_URL}/api/kejadian/list`);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      const source = Array.isArray(data)
        ? data
        : data?.data || data?.incidents || [];

      setIncidents(source.map(normalize));
    } catch (err) {
      console.error("GET /api/kejadian/list:", err);

      setIncidents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /* =======================================================
     INITIAL DATA
  ======================================================= */

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  /* =======================================================
     FILTERED DATA
  ======================================================= */

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    const rows = incidents.filter((x) => {
      const hitSearch =
        !q ||
        x.title.toLowerCase().includes(q) ||
        x.location.toLowerCase().includes(q) ||
        x.category.toLowerCase().includes(q) ||
        String(x.das || "")
          .toLowerCase()
          .includes(q);

      const selectedArea = selectedAreas.length ? selectedAreas[selectedAreas.length - 1] : null;
      const fields = [x.kel_desa, x.kelurahan, x.desa, x.kecamatan, x.kab_kota,
        x.kabupaten, x.kota, x.provinsi, x.province, x.location, x.lokasi, x.address]
        .filter(Boolean).map((v: any) => String(v).toLowerCase());
      const areaName = selectedArea ? String(selectedArea.label || selectedArea.kel_desa ||
        selectedArea.kecamatan || selectedArea.kab_kota || selectedArea.provinsi || "").toLowerCase() : "";
      const hitAdmin = !selectedArea || fields.some((v: string) => v.includes(areaName));
      const dasName = String(selectedDas?.nama_das || selectedDas?.label || "").toLowerCase();
      const hitDas = !selectedDas || String(x.das || "").toLowerCase().includes(dasName);
      const hitLocation = hitAdmin && hitDas;

      const hitCategory =
        category === "Semua" ||
        x.category === category ||
        x.type === CATEGORY_TO_TYPE[category];

      const hitType = types.length === 0 || types.includes(x.type);

      return hitSearch && hitLocation && hitCategory && hitType;
    });

    return [...rows].sort((a, b) => {
      if (sort === "oldest") {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      }

      if (sort === "alpha") {
        return a.title.localeCompare(b.title);
      }

      if (sort === "featured") {
        return Number(b.featured) - Number(a.featured);
      }

      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [incidents, search, selectedAreas, selectedDas, category, types, sort]);


  // Wilayah analisis: API administrasi dan DAS sama seperti Kerawanan.tsx.
  const clearBoundary = () => {
    if (mapRefInstance.current && boundaryLayerRef.current) {
      try { mapRefInstance.current.removeLayer(boundaryLayerRef.current); } catch {}
    }
    boundaryLayerRef.current = null;
  };
  const showBoundary = (geom: any, label: string, isDas: boolean) => {
    const map = mapRefInstance.current;
    if (!map || !window.L || !geom) return;

    // API dapat mengirim GeoJSON sebagai object, Feature, FeatureCollection,
    // atau string JSON. Normalisasi tanpa mengubah data/filter yang sudah ada.
    let geojson = geom;
    try {
      if (typeof geojson === "string") geojson = JSON.parse(geojson);
      if (geojson?.geometry && !geojson?.type) geojson = geojson.geometry;
      if (typeof geojson === "string") geojson = JSON.parse(geojson);
    } catch (error) {
      console.error("Geometri wilayah tidak dapat dibaca:", error);
      return;
    }
    if (!geojson || typeof geojson !== "object") return;

    clearBoundary();
    let layer: any;
    try {
      const data = geojson.type === "Feature" || geojson.type === "FeatureCollection"
        ? geojson
        : { type: "Feature", geometry: geojson, properties: { label } };
      layer = window.L.geoJSON(data, {
        style: isDas
          ? { color: "#2563eb", weight: 3, fillColor: "#93c5fd", fillOpacity: .10 }
          : { color: "#059669", weight: 2.5, fillColor: "#34d399", fillOpacity: .06, dashArray: "7 4" }
      }).addTo(map);
    } catch (error) {
      console.error("Gagal menampilkan batas wilayah:", error);
      return;
    }

    boundaryLayerRef.current = layer;
    const bounds = layer.getBounds?.();
    if (bounds?.isValid?.()) {
      // Pastikan ukuran container Leaflet sudah terukur sebelum zoom.
      map.invalidateSize?.({ pan: false });
      const maxZoom = isDas ? 12 : 14;
      window.requestAnimationFrame(() => {
        if (mapRefInstance.current !== map || !bounds.isValid()) return;
        map.fitBounds(bounds, {
          paddingTopLeft: [36, 36],
          paddingBottomRight: [36, 36],
          maxZoom,
          animate: true,
          duration: 0.7,
        });
      });
    } else {
      console.warn(`Batas geometri ${label} tidak memiliki bounds yang valid.`);
    }
  };
  const searchAreas = async (query: string) => {
    const q = query.trim(), request = ++areaSearchRequestRef.current;
    if (q.length < 2) { setAreaSearchResults([]); setShowAreaSearchDropdown(false); return; }
    const params = new URLSearchParams({ query: q, level: adminLevel });
    const latest = (level: string) => [...selectedAreas].reverse().find(a => a.level === level);
    if (adminLevel === "kabupaten") { const p=latest("provinsi"); if(p?.provinsi) params.set("provinsi",p.provinsi); }
    if (adminLevel === "kecamatan") { const p=latest("kabupaten"); if(p?.provinsi) params.set("provinsi",p.provinsi); if(p?.kab_kota) params.set("kab_kota",p.kab_kota); }
    if (adminLevel === "kelurahan") { const p=latest("kecamatan"); if(p?.provinsi) params.set("provinsi",p.provinsi); if(p?.kab_kota) params.set("kab_kota",p.kab_kota); if(p?.kecamatan) params.set("kecamatan",p.kecamatan); }
    setAreaSearchLoading(true);
    try {
      const res=await fetch(`${API_URL}/api/areas/search?${params}`,{headers:{Accept:"application/json"}});
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const data=await res.json(); if(request!==areaSearchRequestRef.current) return;
      const rows=Array.isArray(data)?data:[]; setAreaSearchResults(rows); setShowAreaSearchDropdown(rows.length>0);
    } catch(e) { if(request===areaSearchRequestRef.current){console.error("Pencarian administrasi gagal:",e);setAreaSearchResults([]);setShowAreaSearchDropdown(false);} }
    finally { if(request===areaSearchRequestRef.current) setAreaSearchLoading(false); }
  };
  const handleAreaSearchChange = (value: string) => {
    setAreaSearchQuery(value); if(areaSearchTimerRef.current) clearTimeout(areaSearchTimerRef.current);
    if(value.trim().length<2){areaSearchRequestRef.current++;setAreaSearchResults([]);setShowAreaSearchDropdown(false);return;}
    areaSearchTimerRef.current=setTimeout(()=>void searchAreas(value),280);
  };
  // Gunakan endpoint bounds PostGIS, bukan mengandalkan geom dari hasil search.
  // Endpoint mengembalikan [[minLat,minLng],[maxLat,maxLng]].
  const fitMapToApiBounds = (rawBounds: any, isDas: boolean) => {
    const map = mapRefInstance.current;
    if (!map || !window.L || !Array.isArray(rawBounds) || rawBounds.length !== 2) return false;
    try {
      const bounds = window.L.latLngBounds(rawBounds);
      if (!bounds.isValid()) return false;
      map.invalidateSize?.({ pan: false });
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (mapRefInstance.current !== map || !bounds.isValid()) return;
          map.fitBounds(bounds, {
            padding: [36, 36],
            maxZoom: isDas ? 11 : 14,
            animate: true,
            duration: 0.8,
          });
        });
      });
      return true;
    } catch (error) {
      console.error("Gagal zoom ke batas wilayah:", error);
      return false;
    }
  };

  const handleAreaSelect = async (area: any) => {
    const order=["provinsi","kabupaten","kecamatan","kelurahan"], level=area.level||adminLevel, idx=order.indexOf(level);
    const nextSelectedAreas = [...selectedAreas.filter(a=>order.indexOf(a.level)<idx),area];
    setSelectedAreas(nextSelectedAreas);
    setSelectedDas(null);setActiveTab("administrasi");
    setAdminLevel(level==="provinsi"?"kabupaten":level==="kabupaten"?"kecamatan":"kelurahan");
    setAreaSearchQuery("");setAreaSearchResults([]);setShowAreaSearchDropdown(false);
    setDasSearchQuery("");setDasSearchResults([]);setShowDasSearchDropdown(false);

    // Tetap tampilkan outline jika hasil search memang menyertakan GeoJSON.
    if (area.geom) showBoundary(area.geom,area.label||area.nama||area.name||"Wilayah",false);

    try {
      const response = await fetch(`${API_URL}/api/areas/bounds`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ selectedAreas: nextSelectedAreas }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || `HTTP ${response.status}`);
      if (!fitMapToApiBounds(result?.bounds, false)) {
        console.warn("Bounds administrasi dari API tidak valid:", result);
        if (area.geom) showBoundary(area.geom,area.label||area.nama||area.name||"Wilayah",false);
      }
    } catch (error) {
      console.error("Gagal mengambil bounds administrasi:", error);
      // Fallback ke GeoJSON jika endpoint bounds tidak tersedia.
      if (area.geom) showBoundary(area.geom,area.label||area.nama||area.name||"Wilayah",false);
    }
  };
  const searchDas = async (query: string) => {
    const q=query.trim(), request=++dasSearchRequestRef.current;
    if(q.length<2){setDasSearchResults([]);setShowDasSearchDropdown(false);return;}
    setDasSearchLoading(true);
    try{
      const res=await fetch(`${API_URL}/api/das/search?query=${encodeURIComponent(q)}`,{headers:{Accept:"application/json"}});
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const data=await res.json();if(request!==dasSearchRequestRef.current)return;
      const rows=Array.isArray(data)?data:[];setDasSearchResults(rows);setShowDasSearchDropdown(rows.length>0);
    }catch(e){if(request===dasSearchRequestRef.current){console.error("Pencarian DAS gagal:",e);setDasSearchResults([]);setShowDasSearchDropdown(false);}}
    finally{if(request===dasSearchRequestRef.current)setDasSearchLoading(false);}
  };
  const handleDasSearchChange=(value:string)=>{
    setDasSearchQuery(value);if(dasSearchTimerRef.current)clearTimeout(dasSearchTimerRef.current);
    if(value.trim().length<2){dasSearchRequestRef.current++;setDasSearchResults([]);setShowDasSearchDropdown(false);return;}
    dasSearchTimerRef.current=setTimeout(()=>void searchDas(value),280);
  };
  const handleDasSelect=async (das:any)=>{
    setSelectedDas(das);setSelectedAreas([]);setActiveTab("das");
    setDasSearchQuery("");setDasSearchResults([]);setShowDasSearchDropdown(false);
    setAreaSearchQuery("");setAreaSearchResults([]);setShowAreaSearchDropdown(false);

    const dasName = das.nama_das || das.label || das.nama || das.name;
    if (das.geom) showBoundary(das.geom,dasName||"DAS",true);
    try {
      const response = await fetch(`${API_URL}/api/das/bounds`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ selectedDas: [dasName] }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || `HTTP ${response.status}`);
      if (!fitMapToApiBounds(result?.bounds, true)) {
        console.warn("Bounds DAS dari API tidak valid:", result);
        if (das.geom) showBoundary(das.geom,dasName||"DAS",true);
      }
    } catch (error) {
      console.error("Gagal mengambil bounds DAS:", error);
      // Fallback ke GeoJSON jika endpoint bounds tidak tersedia.
      if (das.geom) showBoundary(das.geom,dasName||"DAS",true);
    }
  };
  const handleMainTabChange=(tab:"administrasi"|"das")=>{
    setActiveTab(tab);clearBoundary();
    if(tab==="administrasi"){setSelectedDas(null);setDasSearchQuery("");setDasSearchResults([]);setShowDasSearchDropdown(false);}
    else{setSelectedAreas([]);setAreaSearchQuery("");setAreaSearchResults([]);setShowAreaSearchDropdown(false);}
  };
  const resetAreaFilter=()=>{
    setSelectedAreas([]);setSelectedDas(null);setAreaSearchQuery("");setDasSearchQuery("");
    setAreaSearchResults([]);setDasSearchResults([]);setShowAreaSearchDropdown(false);setShowDasSearchDropdown(false);
    setAdminLevel("provinsi");clearBoundary();
    const map=mapRefInstance.current;if(map&&window.L)map.fitBounds(window.L.latLngBounds([-11.5,93],[6.5,142.5]),{padding:[24,24],maxZoom:5});
  };
  useEffect(()=>()=>{if(areaSearchTimerRef.current)clearTimeout(areaSearchTimerRef.current);if(dasSearchTimerRef.current)clearTimeout(dasSearchTimerRef.current);areaSearchRequestRef.current++;dasSearchRequestRef.current++;},[]);

  /* =======================================================
     STATISTICS
  ======================================================= */

  const stats = useMemo(
    () => ({
      total: incidents.length,

      today: incidents.filter((x) => {
        const d = new Date(x.date);
        const today = new Date();

        if (Number.isNaN(d.getTime())) {
          return false;
        }

        return (
          d.getFullYear() === today.getFullYear() &&
          d.getMonth() === today.getMonth() &&
          d.getDate() === today.getDate()
        );
      }).length,

      flood: incidents.filter((x) => x.type === "banjir").length,

      landslide: incidents.filter((x) => x.type === "longsor").length,

      fire: incidents.filter((x) => x.type === "kebakaran").length,

      drought: incidents.filter((x) => x.type === "kekeringan").length,

      abrasion: incidents.filter((x) => x.type === "abrasi").length,

      featured: incidents.filter((x) => x.featured).length,
    }),
    [incidents],
  );

  /* =======================================================
     INITIALIZE LEAFLET MAP
     
     FIX UTAMA UNTUK ERROR:
     Cannot read properties of undefined
     (reading '_zoom')
  ======================================================= */

  useEffect(() => {
    let cancelled = false;
    let localMap: any = null;

    const initMap = async () => {
      try {
        await loadLeaflet();

        /*
         * Component mungkin sudah unmount
         * ketika loader selesai.
         */
        if (cancelled) {
          return;
        }

        if (!mapRef.current) {
          return;
        }

        if (mapRefInstance.current) {
          return;
        }

        if (!window.L) {
          return;
        }

        /*
         * Leaflet menandai container dengan
         * _leaflet_id ketika sudah diinisialisasi.
         */
        const container = mapRef.current;

        /*
         * Recovery untuk container yang masih menyimpan
         * _leaflet_id dari hot-reload / mount sebelumnya.
         * Jika instance React tidak memilikinya, ID lama
         * tidak boleh membuat proses inisialisasi berhenti.
         */
        if ((container as any)._leaflet_id && !mapRefInstance.current) {
          try {
            delete (container as any)._leaflet_id;
          } catch {
            (container as any)._leaflet_id = undefined;
          }
        }

        if (mapRefInstance.current) {
          return;
        }

        /*
         * CREATE MAP
         */
        localMap = window.L.map(container, {
          zoomControl: false,
          preferCanvas: true,
          zoomAnimation: true,
        });

        // Simpan instance segera agar cleanup tetap dapat menemukannya
        // jika proses penambahan tile / cluster mengalami kegagalan.
        mapRefInstance.current = localMap;

        /*
         * Kalau component di-unmount
         * tepat setelah map dibuat.
         */
        if (cancelled) {
          try {
            localMap.remove();
          } catch {
            // ignore cleanup error
          }

          localMap = null;
          return;
        }

        /*
         * SET INITIAL VIEW
         */
        localMap.setView([-2.5, 118], 5);

        /*
         * BASEMAP
         */
        window.L.tileLayer(
          "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            attribution: "&copy; OpenStreetMap contributors",
            maxZoom: 19,
          },
        ).addTo(localMap);

        /*
         * ZOOM CONTROL
         */
        window.L.control
          .zoom({
            position: "topright",
          })
          .addTo(localMap);

        /*
         * MARKER CLUSTER
         */
        const cluster = window.L.markerClusterGroup({
          maxClusterRadius: 65,
          spiderfyOnMaxZoom: true,
          showCoverageOnHover: false,
          zoomToBoundsOnClick: true,
          removeOutsideVisibleBounds: true,
        });

        cluster.addTo(localMap);

        /*
         * Component mungkin unmount
         * selama proses pembuatan layer.
         */
        if (cancelled) {
          try {
            cluster.clearLayers();
            localMap.remove();
          } catch {
            // ignore cleanup error
          }

          localMap = null;
          return;
        }

        /*
         * SIMPAN INSTANCE
         */
        clusterRef.current = cluster;

        /*
         * Beritahu effect marker
         * bahwa map sudah siap.
         */
        setMapReady(true);

        /*
         * invalidateSize aman.
         *
         * Timer disimpan supaya bisa
         * dibatalkan ketika cleanup.
         */
        invalidateTimerRef.current = window.setTimeout(() => {
          if (cancelled) {
            return;
          }

          const currentMap = mapRefInstance.current;

          if (!currentMap) {
            return;
          }

          if (currentMap !== localMap) {
            return;
          }

          try {
            /*
             * _loaded adalah internal Leaflet
             * yang memastikan map sudah siap.
             */
            if (
              currentMap._loaded &&
              typeof currentMap.invalidateSize === "function"
            ) {
              currentMap.invalidateSize({
                animate: false,
              });
            }
          } catch (error) {
            console.warn("Leaflet invalidateSize dilewati:", error);
          }
        }, 350);

        // Recalculate map dimensions when responsive columns / focus mode change.
        if (typeof ResizeObserver !== "undefined") {
          const resizeObserver = new ResizeObserver(() => {
            const currentMap = mapRefInstance.current;
            if (!cancelled && currentMap && currentMap._loaded) {
              try {
                currentMap.invalidateSize({ animate: false, pan: false });
              } catch (resizeError) {
                console.warn("Leaflet resize dilewati:", resizeError);
              }
            }
          });
          resizeObserver.observe(container);
          (container as any).__smitiMapResizeObserver = resizeObserver;
        }
      } catch (error) {
        // Jangan tinggalkan container dalam kondisi terkunci oleh _leaflet_id.
        if (localMap) {
          try {
            localMap.off();
            localMap.remove();
          } catch {}
        }
        if (mapRefInstance.current === localMap) {
          mapRefInstance.current = null;
        }
        if (!cancelled) {
          console.error("Gagal menginisialisasi Leaflet:", error);
        }
      }
    };

    initMap();

    /*
     * CLEANUP
     */
    return () => {
      cancelled = true;

      /*
       * Stop timer invalidateSize.
       */
      if (invalidateTimerRef.current !== null) {
        window.clearTimeout(invalidateTimerRef.current);

        invalidateTimerRef.current = null;
      }

      /*
       * Bersihkan cluster dulu.
       */
      const cluster = clusterRef.current;

      if (cluster) {
        try {
          cluster.clearLayers();
        } catch (error) {
          console.warn("Gagal membersihkan marker cluster:", error);
        }
      }

      clusterRef.current = null;

      /*
       * Bersihkan map.
       */
      const currentContainer = mapRef.current;
      const resizeObserver = currentContainer && (currentContainer as any).__smitiMapResizeObserver;
      if (resizeObserver) {
        try { resizeObserver.disconnect(); } catch {}
        delete (currentContainer as any).__smitiMapResizeObserver;
      }

      const currentMap = mapRefInstance.current;

      if (currentMap) {
        try {
          currentMap.off();
          currentMap.remove();
        } catch (error) {
          console.warn("Gagal membersihkan Leaflet map:", error);
        }
      }

      mapRefInstance.current = null;

      /*
       * Kalau localMap berbeda
       * dan masih hidup, bersihkan juga.
       */
      if (localMap && localMap !== currentMap) {
        try {
          localMap.off();
          localMap.remove();
        } catch {
          // ignore cleanup error
        }
      }

      localMap = null;

      setMapReady(false);
    };
  }, []);

  /* =======================================================
     UPDATE MARKERS
  ======================================================= */

  useEffect(() => {
    /*
     * Jangan jalankan sebelum map benar-benar siap.
     */
    if (!mapReady) {
      return;
    }

    const cluster = clusterRef.current;

    if (!cluster) {
      return;
    }

    if (!window.L) {
      return;
    }

    try {
      /*
       * Bersihkan marker lama.
       */
      cluster.clearLayers();

      /*
       * Tambahkan marker baru.
       */
      filtered.forEach((x) => {
        const meta = TYPE_META[x.type] || TYPE_META.lainnya;

        const icon = window.L.divIcon({
          className: "smiti-event-marker",

          html: `
              <div
                style="
                  width:44px;
                  height:44px;
                  border-radius:50%;
                  background:${meta.color};
                  border:3px solid #fff;
                  display:flex;
                  align-items:center;
                  justify-content:center;
                  font-size:20px;
                  box-shadow:0 5px 18px rgba(15,23,42,.3);
                  cursor:pointer;
                "
              >
                ${meta.icon}
              </div>
            `,

          iconSize: [44, 44],

          iconAnchor: [22, 22],
        });

        const marker = window.L.marker(x.coordinates, {
          icon,
          riseOnHover: true,
        });

        /*
         * POPUP
         */
        marker.bindPopup(
          `
            <div
              style="
                min-width:230px;
                font-family:system-ui;
              "
            >
              <div
                style="
                  font-weight:900;
                  font-size:12px;
                "
              >
                ${String(x.title).replace(/</g, "&lt;")}
              </div>

              <div
                style="
                  margin-top:5px;
                  font-size:10px;
                  color:#64748b;
                "
              >
                ${meta.icon}
                ${meta.label}
              </div>

              <div
                style="
                  margin-top:8px;
                  border-top:1px solid #e2e8f0;
                  padding-top:8px;
                  font-size:10px;
                  line-height:1.7;
                "
              >
                <b>Lokasi:</b>
                ${String(x.location).replace(/</g, "&lt;")}

                <br/>

                <b>Tanggal:</b>
                ${fmtDateTime(x.date)}

                <br/>

                <b>DAS:</b>
                ${String(x.das || "-").replace(/</g, "&lt;")}
              </div>
            </div>
          `,
          {
            maxWidth: 320,
          },
        );

        /*
         * CLICK MARKER
         */
        marker.on("click", () => {
          setSelected(x);
        });

        cluster.addLayer(marker);
      });
    } catch (error) {
      console.error("Gagal memperbarui marker cluster:", error);
    }
  }, [filtered, mapReady]);

  /* =======================================================
     FIT MAP
  ======================================================= */

  const fitMap = useCallback(() => {
    const map = mapRefInstance.current;

    if (!map) {
      return;
    }

    if (!window.L) {
      return;
    }

    if (!filtered.length) {
      return;
    }

    try {
      const bounds = window.L.latLngBounds(filtered.map((x) => x.coordinates));

      if (!bounds.isValid()) {
        return;
      }

      map.fitBounds(bounds, {
        padding: [40, 40],
        maxZoom: 11,
        animate: true,
      });
    } catch (error) {
      console.error("Gagal fit map:", error);
    }
  }, [filtered]);

  /* =======================================================
     FOCUS INCIDENT
  ======================================================= */

  const focus = useCallback((x: Incident) => {
    setSelected(x);

    const map = mapRefInstance.current;

    if (!map) {
      return;
    }

    try {
      const currentZoom = typeof map.getZoom === "function" ? map.getZoom() : 5;

      const targetZoom = Math.max(currentZoom, 11);

      map.setView(x.coordinates, targetZoom, {
        animate: true,
      });
    } catch (error) {
      console.error("Gagal memfokuskan map:", error);
    }
  }, []);

  /* =======================================================
     RESET FORM
  ======================================================= */

  const resetForm = useCallback(() => {
    if (form.thumbnailPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(form.thumbnailPreview);
    }

    setForm(EMPTY_FORM);

    setEditMode(false);

    setEditId(null);
  }, [form.thumbnailPreview]);

  /* =======================================================
     OPEN ADD
  ======================================================= */

  const openAdd = () => {
    resetForm();

    setShowAdd(true);
  };

  /* =======================================================
     OPEN EDIT
  ======================================================= */

  const openEdit = (x: Incident) => {
    setEditMode(true);

    setEditId(x.id);

    setForm({
      ...EMPTY_FORM,

      title: x.title,

      description: x.description || "",

      incidentDate: x.date !== "-" ? String(x.date).slice(0, 10) : "",

      lokasi: x.location,

      disasterType: x.type,

      das: x.das || "",

      latitude: String(x.latitude ?? x.coordinates[0]),

      longitude: String(x.longitude ?? x.coordinates[1]),

      curahHujan: x.curah_hujan == null ? null : Number(x.curah_hujan),

      featured: Boolean(x.featured),

      thumbnailPreview: x.image || null,
    });

    setSelected(null);

    setShowAdd(true);
  };

  /* =======================================================
     DAS LOOKUP
  ======================================================= */

  const lookupDas = async (lon: number, lat: number) => {
    try {
      setDasLoading(true);

      const res = await fetch(
        `${API_URL}/api/das/by-coordinates?longitude=${lon}&latitude=${lat}`,
      );

      const data = await res.json();

      setForm((p) => ({
        ...p,

        das: data?.success ? data.das || "" : "",
      }));
    } catch (e) {
      console.error("DAS lookup error:", e);
    } finally {
      setDasLoading(false);
    }
  };

  /* =======================================================
     REVERSE GEOCODING
  ======================================================= */

  const reverseGeocode = async (lat: number, lon: number) => {
    try {
      setLocationLoading(true);

      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=id`,
        {
          headers: {
            "User-Agent": "SIMITI-Kejadian/1.0",
          },
        },
      );

      const data = await res.json();

      const a = data?.address || {};

      const lokasi = [
        a.village || a.suburb,

        a.county || a.district,

        a.city || a.town,

        a.state,
      ]
        .filter(Boolean)
        .join(", ");

      setForm((p) => ({
        ...p,

        lokasi: lokasi || data?.display_name || "",
      }));

      await lookupDas(lon, lat);
    } catch (e) {
      console.error("Reverse geocode error:", e);
    } finally {
      setLocationLoading(false);
    }
  };

  /* =======================================================
     FORM CHANGE
  ======================================================= */

  const onFormChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;

    setForm((p) => ({
      ...p,
      [name]: value,
    }));

    /*
     * Coordinate change.
     *
     * Tetap mempertahankan behavior lama:
     * ketika latitude/longitude valid,
     * lakukan reverse geocode + DAS lookup.
     */
    if (name === "latitude" || name === "longitude") {
      const lat = Number(name === "latitude" ? value : form.latitude);

      const lon = Number(name === "longitude" ? value : form.longitude);

      if (
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        lat >= -90 &&
        lat <= 90 &&
        lon >= -180 &&
        lon <= 180
      ) {
        reverseGeocode(lat, lon);
      }
    }
  };

  /* =======================================================
     FILE HANDLER
  ======================================================= */

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;

    if (!files) {
      return;
    }

    if (e.target.name === "thumbnail") {
      const file = files[0];

      if (!file) {
        return;
      }

      /*
       * Revoke preview lama
       */
      if (form.thumbnailPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(form.thumbnailPreview);
      }

      const preview = URL.createObjectURL(file);

      setForm((p) => ({
        ...p,

        thumbnail: file,

        thumbnailPreview: preview,
      }));
    } else {
      setForm((p) => ({
        ...p,

        images: [...p.images, ...Array.from(files)],
      }));
    }

    /*
     * Reset input agar file yang sama
     * bisa dipilih lagi.
     */
    e.target.value = "";
  };

  /* =======================================================
     SUBMIT
  ======================================================= */

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.title.trim() || !form.disasterType || !form.incidentDate) {
      alert("Judul, jenis bencana, dan tanggal wajib diisi.");

      return;
    }

    if (!form.latitude || !form.longitude) {
      alert("Latitude dan longitude wajib diisi.");

      return;
    }

    const lat = Number(form.latitude);

    const lon = Number(form.longitude);

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      alert("Latitude tidak valid.");

      return;
    }

    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      alert("Longitude tidak valid.");

      return;
    }

    setSaving(true);

    try {
      const body = new FormData();

      body.append("title", form.title);

      body.append(
        "category",
        TYPE_TO_CATEGORY[form.disasterType] || form.disasterType,
      );

      body.append("incidentDate", form.incidentDate);

      body.append("location", form.lokasi);

      body.append("das", form.das);

      body.append("latitude", form.latitude);

      body.append("longitude", form.longitude);

      body.append(
        "curahHujan",
        form.curahHujan == null ? "" : String(form.curahHujan),
      );

      body.append("featured", String(form.featured));

      body.append("description", form.description);

      if (form.thumbnail) {
        body.append("thumbnail", form.thumbnail);
      }

      form.images.forEach((file) => {
        body.append("images", file);
      });

      const url = editMode
        ? `${API_URL}/api/kejadian/${editId}`
        : `${API_URL}/api/kejadian/add`;

      const res = await fetch(url, {
        method: editMode ? "PUT" : "POST",
        body,
      });

      const data = await res.json();

      if (!res.ok || !data?.success) {
        throw new Error(data?.message || `HTTP ${res.status}`);
      }

      alert(
        editMode
          ? "Kejadian berhasil diperbarui."
          : "Kejadian berhasil ditambahkan.",
      );

      setShowAdd(false);

      resetForm();

      await fetchIncidents();
    } catch (err: any) {
      alert(err?.message || "Gagal menyimpan kejadian.");
    } finally {
      setSaving(false);
    }
  };

  /* =======================================================
     DELETE
  ======================================================= */

  const remove = async (id: number | string) => {
    if (!confirm("Hapus kejadian ini?")) {
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/kejadian/${id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok || !data?.success) {
        throw new Error(data?.message || `HTTP ${res.status}`);
      }

      setSelected(null);

      await fetchIncidents();
    } catch (err: any) {
      alert(err?.message || "Gagal menghapus kejadian.");
    }
  };

  /* =======================================================
     TOGGLE FEATURED
  ======================================================= */

  const toggleFeatured = async (x: Incident) => {
    try {
      const res = await fetch(`${API_URL}/api/kejadian/${x.id}/featured`, {
        method: "PATCH",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          featured: !x.featured,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.success) {
        throw new Error(data?.message || `HTTP ${res.status}`);
      }

      setSelected({
        ...x,
        featured: !x.featured,
      });

      await fetchIncidents();
    } catch (err: any) {
      alert(err?.message || "Gagal mengubah featured.");
    }
  };

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <Header currentPage="kejadian" />

      <style>{`
        .smiti-map .leaflet-control-zoom a {
          color:#0f172a!important;
          background:#fff!important;
        }

        .smiti-map .leaflet-popup-content-wrapper {
          border-radius:16px;
        }

        .smiti-field {
          width:100%;
          border:1px solid #e2e8f0;
          background:#f8fafc;
          border-radius:12px;
          padding:10px 12px;
          font-size:12px;
          font-weight:600;
          outline:none;
        }

        .smiti-field:focus {
          border-color:#10b981;
          background:#fff;
          box-shadow:0 0 0 3px rgba(16,185,129,.1);
        }

        .smiti-label {
          display:block;
          margin-bottom:6px;
          font-size:9px;
          font-weight:900;
          text-transform:uppercase;
          letter-spacing:.08em;
          color:#64748b;
        }

        .smiti-event-marker {
          background:transparent!important;
          border:0!important;
        }
      `}</style>

      <main className="mx-auto w-full max-w-[2000px] px-3 py-3 sm:px-4 lg:px-5 2xl:px-6">
        {/* =================================================
            HEADER
        ================================================= */}

        <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
          <div className="relative overflow-hidden bg-gradient-to-br from-[#07111f] via-[#0f1d32] to-[#12303c] px-5 py-6 text-white md:px-7">
            <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-[.24em] text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  SIMITI Enterprise GIS
                </div>

                <h1 className="text-2xl font-black md:text-3xl">
                  Pusat Data Kejadian Bencana
                </h1>

                <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-300 md:text-sm">
                  Monitoring, inventarisasi, pemetaan, dan pengelolaan kejadian
                  bencana dalam satu command workspace.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    setRefreshing(true);

                    await fetchIncidents();

                    setRefreshing(false);
                  }}
                  className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-[10px] font-bold"
                >
                  {refreshing ? "Memuat..." : "↻ Refresh Data"}
                </button>

                <button
                  onClick={openAdd}
                  className="rounded-xl bg-emerald-500 px-4 py-2.5 text-[10px] font-black shadow-lg"
                >
                  + Tambah Kejadian
                </button>
              </div>
            </div>
          </div>

          {/* =================================================
              STATISTICS
          ================================================= */}

          <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 md:grid-cols-4 lg:grid-cols-8 lg:divide-y-0">
            {[
              ["TOTAL", stats.total, "Seluruh data", "text-slate-900"],
              ["HARI INI", stats.today, "Kejadian baru", "text-emerald-600"],
              ["BANJIR", stats.flood, "Kejadian", "text-blue-600"],
              ["LONGSOR", stats.landslide, "Kejadian", "text-amber-600"],
              ["KEBAKARAN", stats.fire, "Kejadian", "text-red-600"],
              ["KEKERINGAN", stats.drought, "Kejadian", "text-orange-600"],
              ["ABRASI", stats.abrasion, "Kejadian", "text-cyan-600"],
              ["FEATURED", stats.featured, "Prioritas", "text-violet-600"],
            ].map(([label, value, description, color]) => (
              <div key={label} className="px-4 py-4">
                <div className="text-[8px] font-black tracking-[.14em] text-slate-400">
                  {label}
                </div>

                <div className={`mt-1 text-2xl font-black ${color}`}>
                  {value}
                </div>

                <div className="text-[9px] text-slate-400">{description}</div>
              </div>
            ))}
          </div>
        </section>

        {/* =================================================
            FILTER WORKSPACE
        ================================================= */}
        <div className="mt-3 min-w-0 space-y-3">
        {/* =================================================
            FILTER
        ================================================= */}

        {!mapOnly && (
        <section className="min-w-0 overflow-visible rounded-2xl border border-slate-200/90 bg-white p-3 shadow-[0_6px_20px_rgba(15,23,42,0.05)] sm:p-4">
          <div className="w-full">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Filter Wilayah</div>
                <p className="mt-0.5 text-xs text-slate-500">Tentukan cakupan wilayah untuk melihat sebaran kejadian</p>
              </div>
              {(selectedAreas.length > 0 || selectedDas) && (
                <button type="button" onClick={resetAreaFilter} className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-500 transition hover:border-slate-300 hover:bg-slate-50">
                  Reset wilayah
                </button>
              )}
            </div>
            <div>
              <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                <label className={`flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-lg px-2.5 transition-all duration-150 ${activeTab==="administrasi"?"border border-slate-200 bg-white text-slate-800 shadow-sm":"text-slate-500 hover:bg-white/70"}`}>
                  <input type="radio" name="kejadianWilayahTab" checked={activeTab==="administrasi"} onChange={()=>handleMainTabChange("administrasi")} className="accent-emerald-600"/> <b className="text-xs">Administrasi</b>
                </label>
                <label className={`flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-lg px-2.5 transition-all duration-150 ${activeTab==="das"?"border border-slate-200 bg-white text-slate-800 shadow-sm":"text-slate-500 hover:bg-white/70"}`}>
                  <input type="radio" name="kejadianWilayahTab" checked={activeTab==="das"} onChange={()=>handleMainTabChange("das")} className="accent-blue-600"/> <b className="text-xs">DAS</b>
                </label>
              </div>
              <div className="overflow-visible rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                  <div><div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Wilayah Analisis</div><div className="text-xs font-semibold text-slate-700">{activeTab==="administrasi"?"Administrasi":"Daerah Aliran Sungai"}</div></div>
                  <span className={`rounded-full px-3 py-1 text-[9px] font-bold ${activeTab==="administrasi"?"bg-emerald-50 text-emerald-700":"bg-blue-50 text-blue-700"}`}>{activeTab==="administrasi"?"ADMIN":"DAS"}</span>
                </div>
                <div className="p-2.5 sm:p-3">
                {activeTab==="administrasi"?<div className="grid grid-cols-[minmax(110px,.8fr)_minmax(0,1.5fr)] gap-2">
                  <select value={adminLevel} onChange={e=>{setAdminLevel(e.target.value as typeof adminLevel);if(areaSearchTimerRef.current)clearTimeout(areaSearchTimerRef.current);areaSearchRequestRef.current++;setAreaSearchQuery("");setAreaSearchResults([]);setShowAreaSearchDropdown(false);}} className="h-10 min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs">
                    <option value="provinsi">Provinsi</option><option value="kabupaten">Kabupaten/Kota</option><option value="kecamatan">Kecamatan</option><option value="kelurahan">Kelurahan/Desa</option>
                  </select>
                  <div className="relative"><input value={areaSearchQuery} onChange={e=>handleAreaSearchChange(e.target.value)} onFocus={()=>{if(areaSearchResults.length)setShowAreaSearchDropdown(true);}} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();if(areaSearchTimerRef.current)clearTimeout(areaSearchTimerRef.current);void searchAreas(areaSearchQuery);}if(e.key==="Escape")setShowAreaSearchDropdown(false);}} autoComplete="off" className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs" placeholder={`Cari ${adminLevel==="kabupaten"?"kabupaten/kota":adminLevel==="kelurahan"?"kelurahan/desa":adminLevel}...`}/>
                    {showAreaSearchDropdown&&<div className="absolute z-[2400] top-[calc(100%+4px)] left-0 right-0 max-h-56 overflow-y-auto rounded-xl border bg-white shadow-xl">{areaSearchResults.map((a:any,i:number)=><button key={a.id||a.kode||i} type="button" onClick={()=>handleAreaSelect(a)} className="block w-full border-b px-3 py-2 text-left hover:bg-emerald-50"><b className="block text-xs">{a.label||a.nama||a.name||"Wilayah"}</b><small className="text-slate-400">{a.level||adminLevel}{a.provinsi?` • ${a.provinsi}`:""}</small></button>)}</div>}
                    {areaSearchLoading&&<small className="absolute right-2 top-3 text-slate-400">Mencari...</small>}
                  </div>
                </div>:<div className="relative"><input value={dasSearchQuery} onChange={e=>handleDasSearchChange(e.target.value)} onFocus={()=>{if(dasSearchResults.length)setShowDasSearchDropdown(true);}} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();if(dasSearchTimerRef.current)clearTimeout(dasSearchTimerRef.current);void searchDas(dasSearchQuery);}if(e.key==="Escape")setShowDasSearchDropdown(false);}} autoComplete="off" className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs" placeholder="Cari nama DAS..."/>
                  {showDasSearchDropdown&&<div className="absolute z-[2400] top-[calc(100%+4px)] left-0 right-0 max-h-56 overflow-y-auto rounded-xl border bg-white shadow-xl">{dasSearchResults.map((d:any,i:number)=><button key={d.id||d.kode||i} type="button" onClick={()=>handleDasSelect(d)} className="block w-full border-b px-3 py-2 text-left hover:bg-blue-50"><b className="block text-xs">{d.nama_das||d.label||d.nama||d.name||"DAS"}</b><small className="text-slate-400">Daerah Aliran Sungai</small></button>)}</div>}
                  {dasSearchLoading&&<small className="absolute right-2 top-3 text-slate-400">Mencari...</small>}
                </div>}
                {(selectedAreas.length>0||selectedDas)&&<div className="mt-2 flex flex-wrap items-center gap-1"><span className={`rounded-full px-2 py-1 text-[10px] ${selectedDas?"bg-blue-50 text-blue-700":"bg-emerald-50 text-emerald-700"}`}>{selectedDas?(selectedDas.nama_das||selectedDas.label):selectedAreas.map(a=>a.label||a.nama||a.name).join(" › ")}</span><button onClick={resetAreaFilter} className="ml-auto text-[10px] text-slate-500">Hapus wilayah ×</button></div>}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-3">
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-slate-400">Kategori Kejadian</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="smiti-field w-full"
            >
              <option>Semua</option>

              <option>Banjir</option>
              <option>Tanah Longsor dan Erosi</option>
              <option>Kebakaran Hutan</option>
              <option>Kekeringan</option>
              <option>Abrasi</option>
            </select>
            </div>

            <div className="w-full">
              <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-slate-400">Urutkan</label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="smiti-field w-full"
            >
              <option value="newest">Terbaru</option>

              <option value="oldest">Terlama</option>

              <option value="featured">Featured</option>

              <option value="alpha">Alfabet</option>
            </select>
            </div>

            <button
              onClick={() => {
                resetAreaFilter();
                setCategory("Semua");
                setTypes([]);
                setSort("newest");
              }}
              className="h-10 w-full rounded-xl border border-slate-200 px-4 text-[10px] font-bold text-slate-500 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Reset Filter
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
            {(
              [
                "banjir",
                "longsor",
                "kebakaran",
                "kekeringan",
                "abrasi",
              ] as const
            ).map((t) => {
              const m = TYPE_META[t];

              const active = types.includes(t);

              return (
                <button
                  key={t}
                  onClick={() =>
                    setTypes((p) =>
                      active ? p.filter((x) => x !== t) : [...p, t],
                    )
                  }
                  className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${
                    active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 text-slate-500"
                  }`}
                >
                  {m.icon} {m.label}
                </button>
              );
            })}

            <span className="ml-auto self-center text-[9px] font-bold text-slate-400">
              {filtered.length} kejadian
            </span>

          </div>
        </section>
        )}

        </div>

        {/* =================================================
            MAP + EVENT STREAM — mengikuti layout Kejadian.tsx
        ================================================= */}
        <section className={`mt-3 min-w-0 ${
          mapOnly
            ? "grid grid-cols-1"
            : "grid grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] 2xl:grid-cols-[minmax(0,1fr)_380px]"
        }`}>
        <div className="min-w-0">
          <div className="h-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.055)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white px-3 py-3 sm:px-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-[.16em] text-emerald-600">
                  <span className={`h-2 w-2 rounded-full ${mapReady ? "bg-emerald-500" : "animate-pulse bg-amber-400"}`} />
                  Spatial Command Center
                </div>
                <div className="mt-1 text-base font-extrabold tracking-tight text-slate-900">
                  Peta Sebaran Kejadian
                </div>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  Visualisasi lokasi kejadian berdasarkan filter aktif
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1.5 text-[8px] font-black text-emerald-700">
                  {mapReady ? "GIS READY" : "MEMUAT PETA"}
                </span>
                <button
                  type="button"
                  onClick={fitMap}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[9px] font-bold text-slate-600 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                >
                  ⌖ Fit Peta
                </button>
                <button
                  type="button"
                  onClick={() => setMapOnly((value) => !value)}
                  className={`rounded-lg px-3 py-2 text-[9px] font-black shadow-sm transition ${
                    mapOnly
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "bg-slate-900 text-white hover:bg-slate-700"
                  }`}
                >
                  {mapOnly ? "Tutup Fokus Peta" : "Fokus Peta"}
                </button>
              </div>
            </div>

            <div
              ref={mapRef}
              className={`smiti-map w-full bg-slate-100 ${
                mapOnly ? "h-[calc(100vh-190px)] min-h-[560px]" : "h-[560px] min-h-[480px]"
              }`}
            />

            <div className="grid grid-cols-2 divide-x divide-y border-t border-slate-100 bg-slate-50/90 md:grid-cols-5 md:divide-y-0">
              {(
                [
                  "banjir",
                  "longsor",
                  "kebakaran",
                  "kekeringan",
                  "abrasi",
                ] as const
              ).map((t) => (
                <div key={t} className="px-2 py-2.5 text-center transition hover:bg-white">
                  <div>{TYPE_META[t].icon}</div>

                  <div className="text-sm font-black">
                    {incidents.filter((x) => x.type === t).length}
                  </div>

                  <div className="text-[8px] font-black uppercase text-slate-400">
                    {TYPE_META[t].label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {!mapOnly && (
          <aside className="min-w-0 space-y-3 lg:sticky lg:top-4">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_26px_rgba(15,23,42,0.06)]">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-3.5 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[.17em] text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Event Stream
                  </div>
                  <div className="mt-1 text-sm font-black tracking-tight text-slate-900">Kejadian Terbaru</div>
                  <p className="mt-0.5 text-[9px] text-slate-500">Pilih item untuk melihat lokasinya di peta</p>
                </div>
                <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[9px] font-extrabold tabular-nums text-slate-600">
                  {filtered.length} DATA
                </span>
              </div>
              <div className="max-h-[560px] overflow-y-auto p-2">
                {filtered.slice(0, 10).map((x) => {
                  const meta = TYPE_META[x.type] || TYPE_META.lainnya;
                  return (
                    <button
                      key={`event-stream-${x.id}`}
                      type="button"
                      onClick={() => focus(x)}
                      className="group flex w-full items-center gap-2.5 rounded-xl border border-transparent p-2.5 text-left transition hover:border-slate-200 hover:bg-slate-50 hover:shadow-sm"
                    >
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base shadow-sm ring-1 ring-black/5"
                        style={{ backgroundColor: `${meta.color}18`, color: meta.color }}
                      >
                        {meta.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[10px] font-extrabold leading-4 text-slate-800 group-hover:text-emerald-800">{x.title}</span>
                        <span className="mt-0.5 block truncate text-[9px] leading-4 text-slate-500">{x.location}</span>
                        <span className="mt-1 inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[8px] font-bold text-slate-500">{fmtDate(x.date)}</span>
                      </span>
                      <span className="shrink-0 text-xs font-bold text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-600">→</span>
                    </button>
                  );
                })}
                {!filtered.length && !loading && (
                  <div className="p-8 text-center text-[10px] font-bold text-slate-400">Tidak ada kejadian.</div>
                )}
                {loading && (
                  <div className="space-y-3 p-3">
                    {[1, 2, 3].map((n) => <div key={n} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_6px_20px_rgba(15,23,42,0.045)]">
              <div className="flex items-center justify-between">
                <div className="text-[8px] font-black uppercase tracking-[.16em] text-slate-400">Data Governance</div>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[8px] font-black text-emerald-700">SYSTEM STATUS</span>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                {[
                  ["Registry", "LIVE"],
                  ["Spatial", mapReady ? "GIS READY" : "LOADING"],
                  ["Cluster", "ENABLED"],
                  ["Filter", "ACTIVE"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-slate-50 p-2.5">
                    <div className="text-[8px] font-black text-slate-500">{label}</div>
                    <div className="mt-1 text-xs font-black text-slate-800">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
        </section>

        {/* =================================================
            INCIDENT VISUAL STORY / ENTERPRISE CARDS
        ================================================= */}

        {!mapOnly && (
          <section className="mt-4 rounded-[26px] border border-slate-200/90 bg-slate-50/60 p-3 shadow-[0_6px_24px_rgba(15,23,42,0.035)] sm:p-5">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-600">
                  Incident Intelligence
                </div>
                <h2 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900 md:text-2xl">
                  Dokumentasi & Informasi Kejadian
                </h2>
                <p className="mt-1 max-w-2xl text-xs text-slate-500">
                  Ringkasan kejadian, dokumentasi visual, lokasi, dan waktu kejadian dalam satu tampilan.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-500 shadow-sm">
                Menampilkan {Math.min(filtered.length, 12)} dari {filtered.length} kejadian
              </div>
            </div>

            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="h-48 animate-pulse bg-slate-100" />
                    <div className="space-y-2 p-4">
                      <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
                      <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-14 text-center">
                <div className="text-3xl">📷</div>
                <div className="mt-2 text-sm font-black text-slate-700">Belum ada dokumentasi kejadian</div>
                <p className="mt-1 text-xs text-slate-400">Coba ubah filter pencarian atau kategori.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {filtered.slice(0, 12).map((x) => {
                  const meta = TYPE_META[x.type] || TYPE_META.lainnya;
                  const photo = resolveIncidentImage(x);
                  return (
                    <article
                      key={`visual-${x.id}`}
                      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl"
                    >
                      <button onClick={() => focus(x)} className="relative block h-52 w-full overflow-hidden bg-slate-100 text-left">
                        {photo ? (
                          <img
                            src={photo}
                            alt={x.title}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-slate-200 to-slate-300">
                            <span className="text-5xl">{meta.icon}</span>
                            <span className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Dokumentasi belum tersedia</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/10 to-transparent" />
                        <div className="absolute left-3 top-3 flex gap-2">
                          <span className="rounded-full px-2.5 py-1 text-[9px] font-black text-white shadow" style={{ backgroundColor: meta.color }}>
                            {meta.icon} {meta.label}
                          </span>
                          {x.featured && <span className="rounded-full bg-amber-400 px-2.5 py-1 text-[9px] font-black text-amber-950">★ PRIORITAS</span>}
                        </div>
                        <div className="absolute bottom-3 left-4 right-4 text-white">
                          <div className="text-[9px] font-bold text-white/75">{fmtDate(x.date)}</div>
                          <h3 className="mt-1 line-clamp-2 text-base font-black leading-snug">{x.title}</h3>
                        </div>
                      </button>
                      <div className="p-4">
                        <div className="flex items-start gap-2 text-xs text-slate-600">
                          <span className="mt-0.5 shrink-0">📍</span>
                          <span className="line-clamp-2 font-semibold">{x.location}</span>
                        </div>
                        <p className="mt-3 line-clamp-3 min-h-[54px] text-xs leading-relaxed text-slate-500">
                          {x.description?.trim() || "Informasi deskripsi kejadian belum tersedia. Buka detail untuk melihat informasi lokasi dan data pendukung."}
                        </p>
                        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                          <span className="truncate text-[10px] font-bold text-slate-400">DAS: {x.das || "Tidak tercatat"}</span>
                          <button
                            onClick={() => focus(x)}
                            className="rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-black text-white transition hover:bg-emerald-600"
                          >
                            Lihat Detail <span aria-hidden="true">↗</span>
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

      </main>

      {/* ===================================================
          DETAIL DRAWER
      =================================================== */}

      {selected && (
        <div
          className="fixed inset-0 z-[2000] bg-slate-950/55 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-0 h-full w-full max-w-[560px] overflow-y-auto bg-white shadow-2xl"
          >
            <div className="relative h-56 bg-slate-900">
              {resolveIncidentImage(selected) && (
                <img
                  src={resolveIncidentImage(selected)}
                  className="h-full w-full object-cover opacity-75"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                  alt={selected.title}
                />
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 to-transparent" />

              <button
                onClick={() => setSelected(null)}
                className="absolute right-4 top-4 h-9 w-9 rounded-xl bg-black/30 text-white"
              >
                ✕
              </button>

              <div className="absolute bottom-5 left-5 right-5 text-white">
                <span
                  className="rounded-full px-2 py-1 text-[8px] font-black"
                  style={{
                    background: TYPE_META[selected.type].color,
                  }}
                >
                  {TYPE_META[selected.type].icon}{" "}
                  {TYPE_META[selected.type].label}
                </span>

                <h2 className="mt-2 text-xl font-black">{selected.title}</h2>

                <div className="text-[9px] text-slate-300">
                  {selected.location}
                </div>
              </div>
            </div>

            <div className="p-5">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <div className="text-[8px] text-slate-400">Tanggal</div>

                  <div className="mt-1 text-[10px] font-black">
                    {fmtDateTime(selected.date)}
                  </div>
                </div>

                <div className="rounded-lg bg-slate-50 p-2.5">
                  <div className="text-[8px] text-slate-400">DAS</div>

                  <div className="mt-1 text-[10px] font-black">
                    {selected.das || "—"}
                  </div>
                </div>
              </div>

              {/* Informasi DAS terkait kejadian — nilai berasal dari record/API DAS */}
              <section className="mt-4 overflow-hidden rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50 to-white">
                <div className="flex items-center gap-3 border-b border-cyan-100 px-4 py-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-600 text-white">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M3 7c3-2 5 2 8 0s5-2 10 0M3 12c3-2 5 2 8 0s5-2 10 0M3 17c3-2 5 2 8 0s5-2 10 0" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[9px] font-black uppercase tracking-[.16em] text-cyan-700">Informasi Daerah Aliran Sungai</div>
                    <div className="mt-1 truncate text-sm font-black text-slate-900">{selected.das || "DAS belum teridentifikasi"}</div>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[8px] font-black ${selected.das ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {selected.das ? "TERDATA" : "BELUM TERSEDIA"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 p-4">
                  <div>
                    <div className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Nama DAS</div>
                    <div className="mt-1 break-words text-[11px] font-bold text-slate-700">{selected.das || "Belum ada data DAS dari API"}</div>
                  </div>
                  <div>
                    <div className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Sumber identifikasi</div>
                    <div className="mt-1 text-[11px] font-bold text-slate-700">Koordinat kejadian</div>
                  </div>
                </div>
                {!selected.das && <div className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-[9px] leading-4 text-amber-800">Nama DAS belum tersimpan pada data kejadian. Periksa koordinat atau lengkapi melalui form edit setelah layanan pencarian DAS tersedia.</div>}
              </section>

              <div className="mt-4 rounded-2xl bg-slate-950 p-4 font-mono text-[10px] text-emerald-300">
                {selected.coordinates[0].toFixed(7)},{" "}
                {selected.coordinates[1].toFixed(7)}
              </div>

              <div className="mt-4 rounded-xl border p-4 text-[11px] leading-6 text-slate-600">
                {selected.description || "Belum ada deskripsi kejadian."}
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                <button
                  onClick={() => openEdit(selected)}
                  className="rounded-xl bg-slate-900 py-3 text-[9px] font-black text-white"
                >
                  ✎ Edit
                </button>

                <button
                  onClick={() => toggleFeatured(selected)}
                  className="rounded-xl bg-amber-50 py-3 text-[9px] font-black text-amber-700"
                >
                  {selected.featured ? "★ Unfeatured" : "☆ Featured"}
                </button>

                <button
                  onClick={() => remove(selected.id)}
                  className="rounded-xl bg-red-50 py-3 text-[9px] font-black text-red-600"
                >
                  🗑 Hapus
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ===================================================
          ADD / EDIT MODAL
      =================================================== */}

      {showAdd && (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-slate-950/65 p-3">
          <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-[26px] bg-white shadow-2xl">
            {/* MODAL HEADER */}

            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white/95 px-5 py-4">
              <div>
                <div className="text-[8px] font-black uppercase tracking-widest text-emerald-600">
                  Incident Data Entry
                </div>

                <h2 className="text-lg font-black">
                  {editMode
                    ? "Edit Kejadian Bencana"
                    : "Tambah Kejadian Bencana"}
                </h2>
              </div>

              <button
                onClick={() => {
                  setShowAdd(false);

                  resetForm();
                }}
                className="h-9 w-9 rounded-xl bg-slate-100"
              >
                ✕
              </button>
            </div>

            {/* FORM */}

            <form
              onSubmit={submit}
              className="grid gap-5 p-5 lg:grid-cols-[260px_1fr]"
            >
              {/* MEDIA */}

              <div className="space-y-3">
                <div className="flex h-52 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
                  {form.thumbnailPreview ? (
                    <img
                      src={form.thumbnailPreview}
                      className="h-full w-full object-cover"
                      alt="Preview thumbnail"
                    />
                  ) : (
                    <span className="text-5xl">🖼️</span>
                  )}
                </div>

                <label className="block cursor-pointer rounded-xl border bg-slate-50 p-3 text-center text-[9px] font-black">
                  Upload Thumbnail
                  <input
                    name="thumbnail"
                    type="file"
                    accept="image/*"
                    onChange={onFiles}
                    className="hidden"
                  />
                </label>

                <label className="block cursor-pointer rounded-xl border border-dashed p-4 text-center text-[9px] font-black">
                  📷 Foto Pendukung
                  <input
                    name="images"
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={onFiles}
                    className="mt-2 block w-full text-[9px]"
                  />
                </label>

                {form.images.length > 0 && (
                  <div className="rounded-lg bg-slate-50 p-2.5">
                    <div className="text-[8px] font-black text-slate-500">
                      FOTO TERPILIH
                    </div>

                    <div className="mt-1 text-[10px] font-black">
                      {form.images.length} file
                    </div>
                  </div>
                )}
              </div>

              {/* FORM FIELDS */}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="smiti-label">Judul Kejadian *</label>

                  <input
                    name="title"
                    value={form.title}
                    onChange={onFormChange}
                    className="smiti-field"
                    required
                  />
                </div>

                <div>
                  <label className="smiti-label">Jenis Bencana *</label>

                  <select
                    name="disasterType"
                    value={form.disasterType}
                    onChange={onFormChange}
                    className="smiti-field"
                    required
                  >
                    <option value="">Pilih jenis</option>

                    <option value="banjir">💧 Banjir</option>

                    <option value="longsor">⛰️ Longsor</option>

                    <option value="kebakaran">🔥 Kebakaran</option>

                    <option value="kekeringan">☀️ Kekeringan</option>

                    <option value="abrasi">🌊 Abrasi</option>
                  </select>
                </div>

                <div>
                  <label className="smiti-label">Tanggal *</label>

                  <input
                    name="incidentDate"
                    type="date"
                    value={form.incidentDate}
                    onChange={onFormChange}
                    className="smiti-field"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="smiti-label">Lokasi</label>

                  <input
                    name="lokasi"
                    value={form.lokasi}
                    onChange={onFormChange}
                    className="smiti-field"
                    placeholder={
                      locationLoading ? "Mencari lokasi..." : "Lokasi kejadian"
                    }
                  />
                </div>

                <div>
                  <label className="smiti-label">Latitude *</label>

                  <input
                    name="latitude"
                    value={form.latitude}
                    onChange={onFormChange}
                    className="smiti-field font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="smiti-label">Longitude *</label>

                  <input
                    name="longitude"
                    value={form.longitude}
                    onChange={onFormChange}
                    className="smiti-field font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="smiti-label">DAS</label>

                  <input
                    name="das"
                    value={form.das}
                    onChange={onFormChange}
                    className="smiti-field"
                    placeholder={dasLoading ? "Mencari DAS..." : "DAS dari koordinat kejadian"}
                  />
                  <p className="mt-1 text-[9px] leading-4 text-slate-400">
                    {dasLoading ? "Mengambil informasi DAS berdasarkan koordinat..." : "Nama DAS diisi dari layanan API berdasarkan titik koordinat. Bisa dikoreksi jika data resmi menunjukkan nama berbeda."}
                  </p>
                </div>

                <div>
                  <label className="smiti-label">Curah Hujan (mm)</label>

                  <input
                    type="number"
                    step="0.01"
                    value={form.curahHujan ?? ""}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,

                        curahHujan:
                          e.target.value === "" ? null : Number(e.target.value),
                      }))
                    }
                    className="smiti-field"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="smiti-label">Deskripsi</label>

                  <textarea
                    name="description"
                    value={form.description}
                    onChange={onFormChange}
                    rows={5}
                    className="smiti-field resize-none"
                  />
                </div>

                {/* FEATURED */}

                <div className="md:col-span-2 flex items-center justify-between rounded-xl border bg-slate-50 p-3">
                  <div>
                    <div className="text-[9px] font-black">Featured Event</div>

                    <div className="text-[8px] text-slate-400">
                      Prioritas tampilan.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setForm((p) => ({
                        ...p,

                        featured: !p.featured,
                      }))
                    }
                    className={`h-7 w-12 rounded-full ${
                      form.featured ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`block h-5 w-5 rounded-full bg-white transition ${
                        form.featured ? "ml-6" : "ml-1"
                      }`}
                    />
                  </button>
                </div>

                {/* ACTION */}

                <div className="md:col-span-2 flex justify-end gap-2 border-t pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdd(false);

                      resetForm();
                    }}
                    className="rounded-xl border px-5 py-3 text-[10px] font-black"
                  >
                    Batal
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-slate-900 px-5 py-3 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving
                      ? "Menyimpan..."
                      : editMode
                        ? "Simpan Perubahan"
                        : "Simpan Kejadian"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Kebencanaan;
