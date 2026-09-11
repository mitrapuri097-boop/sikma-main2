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

const PROVINCES = [
  "All Lokasi",
  "Aceh",
  "Sumatera Utara",
  "Sumatera Barat",
  "Riau",
  "Jambi",
  "Sumatera Selatan",
  "Bengkulu",
  "Lampung",
  "Kepulauan Bangka Belitung",
  "Kepulauan Riau",
  "DKI Jakarta",
  "Jawa Barat",
  "Jawa Tengah",
  "DI Yogyakarta",
  "Jawa Timur",
  "Banten",
  "Bali",
  "Nusa Tenggara Barat",
  "Nusa Tenggara Timur",
  "Kalimantan Barat",
  "Kalimantan Tengah",
  "Kalimantan Selatan",
  "Kalimantan Timur",
  "Kalimantan Utara",
  "Sulawesi Utara",
  "Sulawesi Tengah",
  "Sulawesi Selatan",
  "Sulawesi Tenggara",
  "Gorontalo",
  "Sulawesi Barat",
  "Maluku",
  "Maluku Utara",
  "Papua",
  "Papua Barat",
];

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

  const [location, setLocation] = useState("All Lokasi");

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

      const hitLocation =
        location === "All Lokasi" ||
        x.location.toLowerCase().includes(location.toLowerCase());

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
  }, [incidents, search, location, category, types, sort]);

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

        if ((container as any)._leaflet_id) {
          return;
        }

        /*
         * CREATE MAP
         */
        localMap = window.L.map(container, {
          zoomControl: false,
          preferCanvas: true,
        });

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
        mapRefInstance.current = localMap;

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
        }, 250);
      } catch (error) {
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

      <main className="mx-auto max-w-[1900px] px-3 py-4 sm:px-5 lg:px-7">
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
            FILTER
        ================================================= */}

        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-col gap-2 xl:flex-row">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari judul, lokasi, kategori, atau DAS..."
              className="smiti-field flex-1"
            />

            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="smiti-field xl:w-44"
            >
              {PROVINCES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="smiti-field xl:w-52"
            >
              <option>Semua</option>

              <option>Banjir</option>
              <option>Tanah Longsor dan Erosi</option>
              <option>Kebakaran Hutan</option>
              <option>Kekeringan</option>
              <option>Abrasi</option>
            </select>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="smiti-field xl:w-36"
            >
              <option value="newest">Terbaru</option>

              <option value="oldest">Terlama</option>

              <option value="featured">Featured</option>

              <option value="alpha">Alfabet</option>
            </select>

            <button
              onClick={() => {
                setSearch("");
                setLocation("All Lokasi");
                setCategory("Semua");
                setTypes([]);
                setSort("newest");
              }}
              className="rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-black text-slate-500"
            >
              Reset
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
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
                  className={`rounded-full border px-3 py-1.5 text-[9px] font-black ${
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

            <button
              onClick={fitMap}
              className="rounded-full bg-slate-100 px-3 py-1.5 text-[9px] font-black"
            >
              ⌖ Fit Map
            </button>

            <button
              onClick={() => setMapOnly(!mapOnly)}
              className={`rounded-full px-3 py-1.5 text-[9px] font-black ${
                mapOnly ? "bg-emerald-500 text-white" : "bg-slate-100"
              }`}
            >
              {mapOnly ? "Map Focus ON" : "Map Focus"}
            </button>
          </div>
        </section>

        {/* =================================================
            MAP + SIDEBAR
        ================================================= */}

        <section
          className={`mt-4 ${
            mapOnly
              ? ""
              : "grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,.65fr)]"
          }`}
        >
          {/* MAP */}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <div className="text-[8px] font-black uppercase tracking-[.16em] text-emerald-600">
                  Spatial Command Center
                </div>

                <div className="text-sm font-black">Peta Sebaran Kejadian</div>
              </div>

              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[8px] font-black text-emerald-700">
                {mapReady ? "LIVE DATA" : "LOADING MAP"}
              </span>
            </div>

            <div
              ref={mapRef}
              className={`smiti-map w-full ${
                mapOnly ? "h-[calc(100vh-240px)] min-h-[650px]" : "h-[560px]"
              }`}
            />

            <div className="grid grid-cols-2 divide-x divide-y border-t border-slate-100 md:grid-cols-5 md:divide-y-0">
              {(
                [
                  "banjir",
                  "longsor",
                  "kebakaran",
                  "kekeringan",
                  "abrasi",
                ] as const
              ).map((t) => (
                <div key={t} className="p-3 text-center">
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

          {/* SIDEBAR */}

          {!mapOnly && (
            <aside className="space-y-4">
              {/* EVENT STREAM */}

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-4 py-3">
                  <div className="text-[8px] font-black uppercase tracking-[.16em] text-slate-400">
                    Event Stream
                  </div>

                  <div className="text-sm font-black">Kejadian Terbaru</div>
                </div>

                <div className="max-h-[510px] overflow-y-auto p-2">
                  {filtered.slice(0, 8).map((x) => (
                    <button
                      key={x.id}
                      onClick={() => focus(x)}
                      className="flex w-full gap-3 rounded-xl p-2.5 text-left hover:bg-slate-50"
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base"
                        style={{
                          background: TYPE_META[x.type].color,
                        }}
                      >
                        {TYPE_META[x.type].icon}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[10px] font-black">
                          {x.title}
                        </span>

                        <span className="mt-1 block truncate text-[8px] text-slate-400">
                          {x.location}
                        </span>

                        <span className="mt-1 block text-[8px] text-slate-400">
                          {fmtDate(x.date)}
                        </span>
                      </span>

                      <span className="text-slate-300">→</span>
                    </button>
                  ))}

                  {!filtered.length && !loading && (
                    <div className="p-8 text-center text-[10px] font-bold text-slate-400">
                      Tidak ada kejadian.
                    </div>
                  )}
                </div>
              </div>

              {/* DATA GOVERNANCE */}

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-[8px] font-black uppercase tracking-[.16em] text-slate-400">
                  Data Governance
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    ["Registry", "LIVE"],

                    ["Spatial", "GIS READY"],

                    ["Cluster", "ENABLED"],

                    ["Filter", "ACTIVE"],
                  ].map((x) => (
                    <div key={x[0]} className="rounded-xl bg-slate-50 p-3">
                      <div className="text-[8px] font-black text-slate-500">
                        {x[0]}
                      </div>

                      <div className="mt-1 text-xs font-black">{x[1]}</div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          )}
        </section>

        {/* =================================================
            INCIDENT TABLE
        ================================================= */}

        {!mapOnly && (
          <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-4">
              <div className="text-[8px] font-black uppercase tracking-[.16em] text-slate-400">
                Incident Registry
              </div>

              <div className="text-sm font-black">Daftar Kejadian Bencana</div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="bg-slate-50">
                    {[
                      "KEJADIAN",
                      "JENIS",
                      "LOKASI",
                      "TANGGAL",
                      "DAS",
                      "KOORDINAT",
                      "STATUS",
                      "AKSI",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[8px] font-black tracking-wider text-slate-400"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-16 text-center text-xs font-bold text-slate-400"
                      >
                        Memuat data...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-16 text-center text-xs font-bold text-slate-400"
                      >
                        Tidak ada data kejadian.
                      </td>
                    </tr>
                  ) : (
                    filtered.slice(0, 50).map((x) => (
                      <tr
                        key={x.id}
                        className="border-t border-slate-100 hover:bg-slate-50"
                      >
                        <td className="px-4 py-3">
                          <button
                            onClick={() => focus(x)}
                            className="flex max-w-[260px] items-center gap-3 text-left"
                          >
                            <span
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm"
                              style={{
                                background: TYPE_META[x.type].color,
                              }}
                            >
                              {TYPE_META[x.type].icon}
                            </span>

                            <span className="truncate text-[10px] font-black">
                              {x.title}
                            </span>
                          </button>
                        </td>

                        <td className="px-4 py-3 text-[9px] font-black">
                          {TYPE_META[x.type].label}
                        </td>

                        <td className="max-w-[180px] truncate px-4 py-3 text-[9px] font-semibold text-slate-500">
                          {x.location}
                        </td>

                        <td className="px-4 py-3 text-[9px]">
                          {fmtDate(x.date)}
                        </td>

                        <td className="max-w-[150px] truncate px-4 py-3 text-[9px] text-slate-500">
                          {x.das || "—"}
                        </td>

                        <td className="px-4 py-3">
                          <code className="rounded bg-slate-900 px-2 py-1 text-[8px] text-emerald-300">
                            {x.coordinates[0].toFixed(5)},{" "}
                            {x.coordinates[1].toFixed(5)}
                          </code>
                        </td>

                        <td className="px-4 py-3 text-[8px] font-black">
                          {x.featured ? "★ FEATURED" : "STANDARD"}
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button
                              onClick={() => focus(x)}
                              className="rounded bg-slate-100 px-2 py-1.5 text-[8px] font-black"
                            >
                              Detail
                            </button>

                            <button
                              onClick={() => openEdit(x)}
                              className="rounded bg-emerald-50 px-2 py-1.5 text-[8px] font-black text-emerald-700"
                            >
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
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
              {selected.image && (
                <img
                  src={selected.image}
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
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-[8px] text-slate-400">Tanggal</div>

                  <div className="mt-1 text-[10px] font-black">
                    {fmtDateTime(selected.date)}
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-[8px] text-slate-400">DAS</div>

                  <div className="mt-1 text-[10px] font-black">
                    {selected.das || "—"}
                  </div>
                </div>
              </div>

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
                  <div className="rounded-xl bg-slate-50 p-3">
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
                    placeholder={dasLoading ? "Mencari DAS..." : "DAS otomatis"}
                  />
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
