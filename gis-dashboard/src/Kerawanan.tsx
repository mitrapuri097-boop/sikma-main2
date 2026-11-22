import React, { useState, useEffect, useRef } from "react";
import {
  area as turfArea,
  booleanPointInPolygon,
  bbox as turfBbox,
  featureCollection as turfFeatureCollection,
  intersect as turfIntersect,
  simplify as turfSimplify,
} from "@turf/turf";
import { useNavigate } from "react-router-dom";
import { API_URL } from "./api";
import Header from "./header";
import Sidebar from "./components/layouts/Sidebar";

type GpsLocationState = {
  loading: boolean;
  error: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  locationName: string;
  village: string;
  district: string;
  city: string;
  province: string;
  displayName: string;
  updatedAt: string | null;
};

type GpsThreatItem = {
  key: string;
  label: string;
  status: string | null;
  score: number | null;
  distanceMeters: number | null;
  inside: boolean;
  source: string;
};

type GpsThreatState = {
  loading: boolean;
  error: string;
  threats: GpsThreatItem[];
  riskStatus: string | null;
  riskScore: number | null;
  updatedAt: string | null;
};

const Kerawanan = () => {

  // ============================================================
  // ENTERPRISE SIDEBAR — UI ONLY
  // Tidak mengubah logic GIS, API, layer, legend, atau data.
  // ============================================================
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // ============================================================
  // SIMITI Leaflet safety:
  // Bersihkan CircleMarker legacy/stale dari layer bencana.
  // CircleMarker tidak digunakan untuk layer bencana polygon.
  // ============================================================
  const cleanupLegacyBencanaCircleMarkers = () => {
    try {
      const map: any = mapInstanceRef.current;

      if (!map || typeof map.eachLayer !== "function") return;

      const remove: any[] = [];

      map.eachLayer((layer: any) => {
        if (!layer) return;

        // CircleMarker / Circle memiliki _latlng dan _radius.
        const isCircleMarker =
          layer instanceof window.L.CircleMarker ||
          (layer._latlng &&
            typeof layer._radius === "number" &&
            typeof layer.setRadius === "function");

        if (!isCircleMarker) return;

        const feature = layer.feature;
        const tableName =
          feature?.properties?.table_name ||
          feature?.properties?.layer_name ||
          feature?.properties?.layer ||
          feature?.properties?.source_layer ||
          layer?.options?.__simitibencanaTable;

        if (tableName && BENCANA_FOCUS_LAYERS.has(String(tableName))) {
          remove.push(layer);
        }
      });

      remove.forEach((layer) => {
        try {
          map.removeLayer(layer);
        } catch (error) {
          console.warn(
            "SIMITI: gagal remove legacy bencana CircleMarker:",
            error,
          );
        }
      });

      if (remove.length > 0) {
        console.warn(
          `SIMITI: removed ${remove.length} legacy bencana CircleMarker`,
        );
      }
    } catch (error) {
      console.warn("SIMITI: cleanup legacy bencana CircleMarker gagal:", error);
    }
  };
  // ============================================================
  // SIMITI Leaflet resize safety
  //
  // L.circle() untuk GPS accuracy adalah subclass CircleMarker
  // secara internal. Saat invalidateSize(), Leaflet dapat mencoba
  // me-render ulang circle tersebut ketika renderer/path belum siap.
  //
  // GPS position + radius TIDAK diubah.
  // Circle hanya dilepas sementara selama invalidateSize().
  // ============================================================
  const safeInvalidateMapSize = () => {
    const map: any = mapInstanceRef.current;

    if (
      !map ||
      typeof map.invalidateSize !== "function" ||
      typeof map.getContainer !== "function" ||
      !map.getContainer() ||
      !map._loaded
    ) {
      return;
    }

    const gpsCircle: any = gpsAccuracyCircleRef.current;
    const gpsCircleIsOnMap =
      !!gpsCircle &&
      typeof map.hasLayer === "function" &&
      map.hasLayer(gpsCircle);

    try {
      // GPS circle tidak diubah; hanya dikeluarkan sementara
      // dari renderer saat resize.
      if (gpsCircleIsOnMap) {
        map.removeLayer(gpsCircle);
      }

      map.invalidateSize({
        pan: false,
        animate: false,
      });
    } catch (error) {
      console.warn("SIMITI: invalidateSize ResizeObserver dilewati:", error);
    } finally {
      // Pasang kembali circle GPS yang sama.
      if (
        gpsCircleIsOnMap &&
        gpsCircle &&
        map &&
        map._loaded &&
        typeof map.addLayer === "function"
      ) {
        try {
          map.addLayer(gpsCircle);
        } catch (restoreError) {
          console.warn(
            "SIMITI: gagal restore GPS accuracy circle setelah resize:",
            restoreError,
          );
        }
      }
    }
  };

  // UI-only state; declared before every hook/render reference.
  const [isBottomSummaryOpen, setIsBottomSummaryOpen] = useState(false);

  // Leaflet needs a size recalculation after the bottom grid row collapses/expands.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      safeInvalidateMapSize();
    });
    return () => cancelAnimationFrame(frame);
  }, [isBottomSummaryOpen]);

  const [isRightLayerPanelOpen, setIsRightLayerPanelOpen] = useState(true);

  const mapRef = useRef(null);
  const [baseMapType, setBaseMapType] = useState<"road" | "satellite">("satellite");
  const roadBaseLayerRef = useRef<any>(null);
  const satelliteBaseLayerRef = useRef<any>(null);
  const mapInstanceRef = useRef(null);
  const mapInitializingRef = useRef(false);

  // Identifikasi polygon memerlukan dua klik pada lokasi yang berdekatan.
  // Klik pertama hanya menyimpan titik; klik kedua mengonfirmasi pemilihan.
  const mapPolygonClickConfirmRef = useRef<any>(null);
  const confirmMapPolygonClick = (latlng: any) => {
    const map: any = mapInstanceRef.current;
    if (!map || !latlng) return false;

    const previous = mapPolygonClickConfirmRef.current;
    if (previous) {
      let distance = Infinity;
      try {
        distance = map.distance(previous, latlng);
      } catch {}

      // Klik kedua harus berada maksimal 30 meter dari klik pertama.
      if (Number.isFinite(distance) && distance <= 30) {
        mapPolygonClickConfirmRef.current = null;
        return true;
      }
    }

    mapPolygonClickConfirmRef.current = latlng;
    console.info(
      "SIMITI: klik pertama diterima. Klik sekali lagi pada lokasi yang sama (maks. 30 m) untuk memilih polygon.",
    );
    return false;
  };

  const mapWeatherMarkerRef = useRef<any>(null);
  const selectedVillagePolygonRef = useRef<any>(null);
  const gpsMarkerRef = useRef<any>(null);
  const gpsAccuracyCircleRef = useRef<any>(null);
  const gpsRequestSeqRef = useRef(0);
  const gpsRenderFrameRef = useRef<number | null>(null);
  const locationSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const locationSearchRequestRef = useRef(0);
  const layerGroupsRef = useRef({});

  const [enterpriseIdentify, setEnterpriseIdentify] = useState<{
    open: boolean;
    loading: boolean;
    layerName: string;
    layerLabel: string;
    objectLabel: string;
    latitude: number | null;
    longitude: number | null;
    areaHa: number | null;
    properties: Record<string, any>;
    geometry?: any;
    source?: string;
  }>({
    open: false,
    loading: false,
    layerName: "",
    layerLabel: "",
    objectLabel: "Objek GIS",
    latitude: null,
    longitude: null,
    areaHa: null,
    properties: {},
    geometry: null,
    source: "SIMITI GIS",
  });
  const enterpriseIdentifyHighlightRef = useRef<any>(null);

  const navigate = useNavigate();
  const [showMenuDropdown, setShowMenuDropdown] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set());
  // UI-only: synchronize Leaflet with the map container after panel resize.
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;

    const refresh = () => {
      try {
        cleanupLegacyBencanaCircleMarkers();

        const map = mapInstanceRef.current as any;

        if (
          !map ||
          typeof map.invalidateSize !== "function" ||
          typeof map.getContainer !== "function" ||
          !map.getContainer() ||
          !map._loaded
        ) {
          return;
        }

        requestAnimationFrame(() => {
          try {
            safeInvalidateMapSize();
          } catch (error) {
            console.warn("SIMITI: safeInvalidateMapSize dilewati:", error);
          }
        });
      } catch (error) {
        console.warn("SIMITI: refresh ukuran map dilewati:", error);
      }
    };

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(refresh);
    });

    observer.observe(el);

    const timers = [50, 350, 700].map((ms) => window.setTimeout(refresh, ms));

    window.addEventListener("resize", refresh);

    return () => {
      observer.disconnect();
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("resize", refresh);
    };
  }, [isRightLayerPanelOpen]);

  const activeLayersRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    activeLayersRef.current = activeLayers;
  }, [activeLayers]);
  const [isLoadingLayer, setIsLoadingLayer] = useState(false);
  const [loadingLayerNames, setLoadingLayerNames] = useState<Set<string>>(
    new Set(),
  );
  const [layerError, setLayerError] = useState<string>("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // ======================================================
  // ENTERPRISE USER LAYER AUTHORIZATION
  // can_view menjadi sumber kebenaran untuk layer lokal.
  // null = belum ada token/authorization belum diterapkan.
  // Set kosong = user terautentikasi tetapi tidak punya akses layer.
  // ======================================================
  const [authorizedLayerNames, setAuthorizedLayerNames] =
    useState<Set<string> | null>(null);
  const [authorizationLoaded, setAuthorizationLoaded] = useState(false);
  const [authorizationError, setAuthorizationError] = useState("");

  const getAuthToken = () => {
    return (
      localStorage.getItem("smiti_token") ||
      sessionStorage.getItem("smiti_token") ||
      localStorage.getItem("adminToken") ||
      sessionStorage.getItem("adminToken") ||
      localStorage.getItem("token") ||
      localStorage.getItem("access_token") ||
      localStorage.getItem("authToken") ||
      ""
    );
  };

  const normalizeAuthorizationLayerName = (name: string) => {
    const aliases: Record<string, string> = {
      "97": "kawasan_hutan",
      "103": "khdtk",
    };
    const normalized = String(name || "")
      .trim()
      .toLowerCase();
    return aliases[normalized] || normalized;
  };

  // Halaman Kerawanan adalah WebGIS publik untuk masyarakat umum.
  // Layer publik tidak mensyaratkan login/token authorization.
  const isLayerAuthorized = (_name: string) => true;

  const filterAuthorizedLayerList = (items: any[] = []) =>
    items.filter((item) => isLayerAuthorized(item?.name ?? item?.id));

  const filterAuthorizedLayerData = (data: any) => {
    if (!data || authorizedLayerNames === null) return data;
    return {
      ...data,
      kerawanan: filterAuthorizedLayerList(data.kerawanan || []),
      mitigasiAdaptasi: filterAuthorizedLayerList(data.mitigasiAdaptasi || []),
      lainnya: filterAuthorizedLayerList(data.lainnya || []),
      // Auto kejadian tetap tersedia; layer manual tetap melewati authorization.
      kejadian: (data.kejadian || []).filter(
        (item: any) =>
          item?.isAutoGenerated || isLayerAuthorized(item?.name ?? item?.id),
      ),
    };
  };

  // Tidak memanggil /api/my-layer-authorizations pada halaman publik.
  // Authorization khusus pengguna tetap dapat diterapkan pada halaman admin terpisah.
  const loadMyLayerAuthorizations = async () => {
    setAuthorizationError("");
    setAuthorizedLayerNames(null);
    setAuthorizationLoaded(true);
  };

  const layerCacheRef = useRef<Map<string, any>>(new Map());
  const [hoveredLayerKey, setHoveredLayerKey] = useState<string | null>(null);
  const [hoveredLayerType, setHoveredLayerType] = useState<string | null>(null);
  const [hoveredLayerColor, setHoveredLayerColor] = useState<string | null>(
    null,
  );

  // Legend yang dipilih dengan CLICK harus tetap aktif setelah mouse keluar.
  // Hover tetap bersifat sementara; click menjadi highlight/pilihan permanen.
  const [selectedLegendKey, setSelectedLegendKey] = useState<string | null>(
    null,
  );
  const [selectedLegendType, setSelectedLegendType] = useState<string | null>(
    null,
  );
  const [selectedLegendColor, setSelectedLegendColor] = useState<string | null>(
    null,
  );

  // ============================================================
  // SIMITI - SELECTED SPATIAL FEATURE
  // Menyimpan polygon/layer yang benar-benar diklik user.
  // Digunakan agar klik legenda kerawanan hanya diterapkan
  // ke feature yang sedang dipilih, bukan melebar ke seluruh
  // wilayah/layer.
  // ============================================================
  const selectedSpatialFeatureRef = useRef<{
    layerType: string;
    feature: any;
    layer: any;
    originalColor?: string;
  } | null>(null);
  const selectedSpatialFeatureClipListenersRef = useRef<any[]>([]);

  // Legenda layer: awalnya hanya nama layer yang tampil.
  // Klik nama layer untuk membuka/menutup kelas + warna legend.
  const [expandedRiskLegendLayers, setExpandedRiskLegendLayers] = useState<
    Set<string>
  >(new Set());

  const toggleRiskLegendLayer = (name: string) => {
    setExpandedRiskLegendLayers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const [selectedKhdtkName, setSelectedKhdtkName] = useState<string>("");
  const selectedKhdtkLayerKeyRef = useRef<string>("selected_khdtk_focus");
  const [selectedAreas, setSelectedAreas] = useState<
    Array<{
      label: string;
      level: "provinsi" | "kabupaten" | "kecamatan" | "kelurahan";
      provinsi?: string;
      kab_kota?: string;
      kecamatan?: string;
      kel_desa?: string;
      kode_prov?: string;
      kode_kk?: string;
      kode_kec?: string;
      kode_kd?: string;
      geom?: any;
      latitude?: number | null;
      longitude?: number | null;
      lat?: number | string | null;
      lon?: number | string | null;
      lng?: number | string | null;
    }>
  >([]);
  const [adminLevel, setAdminLevel] = useState<
    "provinsi" | "kabupaten" | "kecamatan" | "kelurahan"
  >("provinsi");
  const [areaSearchQuery, setAreaSearchQuery] = useState("");
  const [areaSearchResults, setAreaSearchResults] = useState<Array<any>>([]);
  const [showAreaSearchDropdown, setShowAreaSearchDropdown] = useState(false);
  const [locationSearchLoading, setLocationSearchLoading] = useState(false);
  const [selectedDas, setSelectedDas] = useState<
    Array<{
      label: string;
      nama_das: string;
    }>
  >([]);
  const [dasSearchQuery, setDasSearchQuery] = useState("");
  const [dasSearchResults, setDasSearchResults] = useState<Array<any>>([]);
  const [showDasSearchDropdown, setShowDasSearchDropdown] = useState(false);
  const [currentBounds, setCurrentBounds] = useState<
    [[number, number], [number, number]] | null
  >(null);
  const [availableLayers, setAvailableLayers] = useState<{
    kerawanan: Array<{ id: string; name: string }>;
    mitigasiAdaptasi: Array<{ id: string; name: string }>;
    lainnya: Array<{ id: string; name: string }>;
    kejadian: Array<{ id: string; name: string; year: number }>;
  }>({
    kerawanan: [],
    mitigasiAdaptasi: [],
    lainnya: [],
    kejadian: [],
  });
  const [mapReady, setMapReady] = useState(false);
  const [insertProgress, setInsertProgress] = useState(0);
  const [insertStatus, setInsertStatus] = useState("");

  const [layerData, setLayerData] = useState<{
    kerawanan: Array<{ id: string; name: string }>;
    mitigasiAdaptasi: Array<{ id: string; name: string }>;
    lainnya: Array<{ id: string; name: string }>;
    kejadian: Array<{ id: string; name: string; year: number }>; // Tambahan untuk kejadian
  }>({
    kerawanan: [],
    mitigasiAdaptasi: [],
    lainnya: [],
    kejadian: [],
  });
  // =========================
  // Open-Meteo integration
  // =========================
  type OpenMeteoCurrent = {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    apparent_temperature?: number;
    precipitation?: number;
    rain?: number;
    weather_code?: number;
    cloud_cover?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    wind_gusts_10m?: number;
    surface_pressure?: number;
  };

  type OpenMeteoWeatherState = {
    loading: boolean;
    error: string;
    latitude: number | null;
    longitude: number | null;
    current: OpenMeteoCurrent | null;
    daily?: {
      time?: string[];
      precipitation_sum?: number[];
      rain_sum?: number[];
    } | null;
    updatedAt: string | null;
  };

  type MapWeatherPopupState = {
    open: boolean;
    loading: boolean;
    error: string;
    latitude: number | null;
    longitude: number | null;
    locationName: string;
    district: string;
    province: string;
    current: OpenMeteoCurrent | null;
    dailyRain: number | null;
    updatedAt: string | null;
  };

  const [openMeteoWeather, setOpenMeteoWeather] =
    useState<OpenMeteoWeatherState>({
      loading: false,
      error: "",
      latitude: null,
      longitude: null,
      current: null,
      daily: null,
      updatedAt: null,
    });

  const [mapWeatherPopup, setMapWeatherPopup] = useState<MapWeatherPopupState>({
    open: false,
    loading: false,
    error: "",
    latitude: null,
    longitude: null,
    locationName: "Lokasi dipilih",
    district: "",
    province: "",
    current: null,
    dailyRain: null,
    updatedAt: null,
  });
  // Posisi panel Informasi Titik Peta dapat digeser tanpa mengubah proses identify.
  const [mapInfoOffset, setMapInfoOffset] = useState({ x: 0, y: 0 });
  const mapInfoDragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [currentSection, setCurrentSection] = useState<
    "kerawanan" | "mitigasiAdaptasi" | "lainnya"
  >("kerawanan");
  const [newLayerName, setNewLayerName] = useState("");
  const [layerToDelete, setLayerToDelete] = useState<{
    section: string;
    id: string;
    name: string;
  } | null>(null);
  const formatTableName = (tableName: string): string => {
    return tableName
      .split("_")
      .map((word) => {
        // Capitalize first letter of each word
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(" ");
  };
  const [tutupanLahanData, setTutupanLahanData] = useState<
    Array<{
      pl2024_id: number;
      deskripsi_domain: string;
      luas_total: number;
      color?: string;
    }>
  >([]);

  const [penutupanLahan2024Data, setPenutupanLahan2024Data] = useState<
    Array<{
      pl2024_id: number;
      deskripsi_domain: string;
      luas_total: number;
      color?: string;
    }>
  >([]);

  const [pl2024Data, setPL2024Data] = useState<
    Array<{
      pl2024_id: number;
      deskripsi_domain: string;
      luas_total: number;
      color?: string;
    }>
  >([]);

  const [geologiData, setGeologiData] = useState<
    Array<{
      namobj: string;
      umurobj: string;
      keliling_total: number;
      color?: string;
    }>
  >([]);

  const [jenisTanahData, setJenisTanahData] = useState<
    Array<{
      jntnh1: string;
      color?: string;
    }>
  >([]);

  const [lahanKritisData, setLahanKritisData] = useState<
    Array<{
      kritis: string;
      luas_ha: number;
      color?: string;
    }>
  >([]);
  const [rawanErosiData, setRawanErosiData] = useState<
    Array<{
      tingkat: string;
      luas_ha: number;
      color?: string;
    }>
  >([]);
  const [rawanLongsorData, setRawanLongsorData] = useState<
    Array<{
      tingkat: string;
      luas_ha: number;
      color?: string;
    }>
  >([]);
  const [rawanLimpasanData, setRawanLimpasanData] = useState<
    Array<{
      tingkat: string;
      luas_ha: number;
      color?: string;
    }>
  >([]);
  const [rawanKarhutlaData, setRawanKarhutlaData] = useState<
    Array<{
      tingkat: string;
      luas_ha: number;
      color?: string;
    }>
  >([]);

  const [risikoData, setRisikoData] = useState<{
    risiko_banjir: Array<{ kelas: string; luas: number; color?: string }>;
    risiko_banjir_bandang: Array<{
      kelas: string;
      luas: number;
      color?: string;
    }>;
    risiko_kekeringan: Array<{ kelas: string; luas: number; color?: string }>;
    risiko_abrasi: Array<{ kelas: string; luas: number; color?: string }>;
    risiko_longsor: Array<{ kelas: string; luas: number; color?: string }>;
    risiko_karhutla: Array<{ kelas: string; luas: number; color?: string }>;
  }>({
    risiko_banjir: [],
    risiko_banjir_bandang: [],
    risiko_kekeringan: [],
    risiko_abrasi: [],
    risiko_longsor: [],
    risiko_karhutla: [],
  });

  const [khdtkData, setKhdtkData] = useState<
    Array<{
      namobj: string;
      lsktap: number;
      jnskhdtk: string;
      color?: string;
    }>
  >([]);

  const INFRA_LAYERS = [
    {
      id: "bendung",
      label: "Bendung",
      color: "#E24B4A",
      cols: [
        { h: "Nama", k: "nama_infra" },
        { h: "Kondisi", k: "kondisi_ba" },
        { h: "Kondisi Teknis", k: "teknis_kon" },
        { h: "Kelurahan", k: "kelurahan" },
        { h: "Kecamatan", k: "kecamatan" },
        { h: "Kabupaten/Kota", k: "kabkot_nam" },
        { h: "Provinsi", k: "prov_name" },
        { h: "Daerah Aliran", k: "daerah_ali" },
      ],
    },
    {
      id: "bendungan",
      label: "Bendungan",
      color: "#EF9F27",
      cols: [
        { h: "Nama", k: "nama_infra" },
        { h: "Kondisi", k: "kondisi_ba" },
        { h: "Kelurahan", k: "kelurahan" },
        { h: "Kecamatan", k: "kecamatan" },
        { h: "Kabupaten/Kota", k: "kabkot_nam" },
        { h: "Provinsi", k: "prov_name" },
        { h: "Daerah Aliran", k: "daerah_ali" },
      ],
    },
    {
      id: "danau",
      label: "Danau",
      color: "#1D9E75",
      cols: [
        { h: "Nama", k: "nama_aset" },
        { h: "Kelurahan", k: "kelurahan" },
        { h: "Kecamatan", k: "kecamatan" },
        { h: "Kabupaten/Kota", k: "kabkot_nam" },
        { h: "Provinsi", k: "prov_name" },
        { h: "Daerah Aliran", k: "daerah_ali" },
      ],
    },
    {
      id: "embung",
      label: "Embung",
      color: "#378ADD",
      cols: [
        { h: "Nama", k: "nama_infra" },
        { h: "Kondisi", k: "kondisi_ba" },
        { h: "Sumber Air", k: "teknis_sum" },
        { h: "Kelurahan", k: "kelurahan" },
        { h: "Kecamatan", k: "kecamatan" },
        { h: "Kabupaten/Kota", k: "kabkot_nam" },
        { h: "Provinsi", k: "prov_name" },
        { h: "Daerah Aliran", k: "daerah_ali" },
      ],
    },
    {
      id: "situ",
      label: "Situ",
      color: "#7F77DD",
      cols: [
        { h: "Nama", k: "nama_aset" },
        { h: "Kelurahan", k: "kelurahan" },
        { h: "Kecamatan", k: "kecamatan" },
        { h: "Kabupaten/Kota", k: "kabkot_nam" },
        { h: "Provinsi", k: "prov_name" },
        { h: "Daerah Aliran", k: "daerah_ali" },
      ],
    },
    {
      id: "pengaman_pantai",
      label: "Pengaman Pantai",
      color: "#2C2C2A",
      cols: [
        { h: "Nama", k: "nama_infra" },
        { h: "Kondisi", k: "kondisi_ba" },
        { h: "Kondisi Teknis", k: "teknis_kon" },
        { h: "Kelurahan", k: "kelurahan" },
        { h: "Kecamatan", k: "kecamatan" },
        { h: "Kabupaten/Kota", k: "kabkot_nam" },
        { h: "Provinsi", k: "provinsi" },
        { h: "Daerah Aliran", k: "daerah_ali" },
      ],
    },
    {
      id: "pengendali_sedimen",
      label: "Pengendali Sedimen",
      color: "#D4537E",
      cols: [
        { h: "Nama", k: "nama_infra" },
        { h: "Kondisi", k: "kondisi_ba" },
        { h: "Kondisi Teknis", k: "teknis_kon" },
        { h: "Kelurahan", k: "kelurahan" },
        { h: "Kecamatan", k: "kecamatan" },
        { h: "Kabupaten/Kota", k: "kabkot_nam" },
        { h: "Provinsi", k: "prov_name" },
        { h: "Daerah Aliran", k: "daerah_ali" },
      ],
    },
    {
      id: "pompa_air",
      label: "Pompa Air",
      color: "#888780",
      cols: [
        { h: "Nama", k: "nama_infra" },
        { h: "Kondisi", k: "kondisi_ba" },
        { h: "Kondisi Teknis", k: "teknis_kon" },
        { h: "Kelurahan", k: "kelurahan" },
        { h: "Kecamatan", k: "kecamatan" },
        { h: "Kabupaten/Kota", k: "kabkot_nam" },
        { h: "Provinsi", k: "prov_name" },
        { h: "Daerah Aliran", k: "daerah_ali" },
      ],
    },
    {
      id: "sekat_kanal",
      label: "Sekat Kanal",
      color: "#64748B",
      cols: [
        { h: "Nomor", k: "no" },
        { h: "Kodefikasi", k: "kodefikasi" },
        { h: "Jenis", k: "jenis" },
        { h: "Bahan", k: "bahan" },
        { h: "Tipe", k: "tipe" },
        { h: "Desa", k: "desa" },
        { h: "Kecamatan", k: "kecamatan" },
        { h: "Kabupaten", k: "kabupaten" },
        { h: "Provinsi", k: "provinsi" },
        { h: "Tahun", k: "tahun" },
      ],
    },
  ] as const;

  const INFRA_IDS = INFRA_LAYERS.map((l) => l.id);

  const [infraData, setInfraData] = useState<
    Record<string, Array<Record<string, any>>>
  >({
    bendung: [],
    bendungan: [],
    danau: [],
    embung: [],
    situ: [],
    pengaman_pantai: [],
    pengendali_sedimen: [],
    pompa_air: [],
    sekat_kanal: [],
  });

  const [bahayaKekeringanData, setBahayaKekeringanData] = useState<
    Array<{ kelas: string; luas: number; color?: string }>
  >([]);
  const [bahayaAbrasiData, setBahayaAbrasiData] = useState<
    Array<{ kelas: string; luas: number; color?: string }>
  >([]);
  const [bahayaBanjirData, setBahayaBanjirData] = useState<
    Array<{ kelas: string; luas: number; color?: string }>
  >([]);
  const [bahayaBanjirBandangData, setBahayaBanjirBandangData] = useState<
    Array<{ kelas: string; luas: number; color?: string }>
  >([]);
  const [dtaDanauData, setDtaDanauData] = useState<
    Array<{ tipe_danau: string; luas: number; color?: string }>
  >([]);
  const [rehabilitasiDasData, setRehabilitasiDasData] = useState<
    Array<{ bpdas: string; luas: number; color?: string }>
  >([]);
  const [rehabilitasiHutanData, setRehabilitasiHutanData] = useState<
    Array<{ jenis_tana: string; luas: number; color?: string }>
  >([]);
  const [restorasiGambutData, setRestorasiGambutData] = useState<
    Array<{ jenis: string; bahan: string }>
  >([]);
  const [penerapanTeknikKtaData, setPenerapanTeknikKtaData] = useState<
    Array<{ das: string; subdas: string }>
  >([]);
  const [kebakaran2021Data, setKebakaran2021Data] = useState<
    Array<{ periode: string; color?: string }>
  >([]);
  const [kebakaran2022Data, setKebakaran2022Data] = useState<
    Array<{ periode: string; luas: number; color?: string }>
  >([]);
  const [kebakaran2023Data, setKebakaran2023Data] = useState<
    Array<{ periode: string; color?: string }>
  >([]);
  const [kebakaran2024Data, setKebakaran2024Data] = useState<
    Array<{ periode: string; luas: number; color?: string }>
  >([]);
  const [kebakaran2025Data, setKebakaran2025Data] = useState<
    Array<{ periode: string; luas: number; color?: string }>
  >([]);
  // Kelas fungsi kawasan hutan: satu warna konsisten untuk WMS dan legenda.
  // Kode dengan deskripsi yang sama digabung agar legenda tidak duplikat.
  const KAWASAN_HUTAN_LEGEND = [
    { codes: ["100100"], fungsikws: "100100", deskripsi_domain: "Hutan Lindung", color: "#FF6B6B" },
    { codes: ["100700"], fungsikws: "100700", deskripsi_domain: "Areal Penggunaan Lain", color: "#4ECDC4" },
    { codes: ["100300", "100400"], fungsikws: "100300", deskripsi_domain: "Hutan Produksi Tetap", color: "#45B7D1" },
    { codes: ["100000", "100200", "100210", "100220", "100230"], fungsikws: "100000", deskripsi_domain: "Cagar Alam", color: "#FFA07A" },
    { codes: ["100500"], fungsikws: "100500", deskripsi_domain: "Hutan Produksi yang dapat di Konversi", color: "#98D8C8" },
    { codes: ["100240", "100241"], fungsikws: "100240", deskripsi_domain: "Taman Nasional", color: "#F7DC6F" },
    { codes: ["100260"], fungsikws: "100260", deskripsi_domain: "Taman Hutan Raya", color: "#BB8FCE" },
    { codes: ["100250", "100251"], fungsikws: "100250", deskripsi_domain: "Taman Wisata Alam/Hutan Wisata", color: "#85C1E2" },
    { codes: ["0", "000000"], fungsikws: "0", deskripsi_domain: "Tidak Terdefinisi", color: "#F8B739" },
    { codes: ["500100", "500300"], fungsikws: "500100", deskripsi_domain: "Tubuh Air", color: "#52BE80" },
    { codes: ["100201", "100211", "100221"], fungsikws: "100201", deskripsi_domain: "Cagar Alam (Perairan)", color: "#EC7063" },
  ] as const;
  const [kawasanHutanData, setKawasanHutanData] = useState<
    Array<{ fungsikws: string; deskripsi_domain: string; color?: string }>
  >([]);

  const colorMappingRef = useRef<{
    tutupanLahan: Map<string, string>;
    penutupanLahan2024: Map<string, string>;
    pl2024: Map<string, string>;
    geologi: Map<string, string>;
    jenisTanah: Map<string, string>;
    lahanKritis: Map<string, string>;
    rawanErosi: Map<string, string>;
    rawanLongsor: Map<string, string>;
    rawanLimpasan: Map<string, string>;
    rawanKarhutla: Map<string, string>;
    bahayaKekeringan: Map<string, string>;
    bahayaAbrasi: Map<string, string>;
    bahayaBanjir: Map<string, string>;
    bahayaBanjirBandang: Map<string, string>;
    dtaDanau: Map<string, string>;
    rehabilitasiDas: Map<string, string>;
    rehabilitasiHutan: Map<string, string>;
    kebakaran2021: Map<string, string>;
    kebakaran2022: Map<string, string>;
    kebakaran2023: Map<string, string>;
    kebakaran2024: Map<string, string>;
    kebakaran2025: Map<string, string>;
    kawasanHutan: Map<string, string>;
    risikoBanjir: Map<string, string>;
    risikoBanjirBandang: Map<string, string>;
    risikoKekeringan: Map<string, string>;
    risikoAbrasi: Map<string, string>;
    risikoLongsor: Map<string, string>;
    risikoKarhutla: Map<string, string>;
    khdtk: Map<string, string>;
  }>({
    tutupanLahan: new Map(),
    penutupanLahan2024: new Map(),
    pl2024: new Map(),
    geologi: new Map(),
    jenisTanah: new Map(),
    lahanKritis: new Map(),
    rawanErosi: new Map(),
    rawanLongsor: new Map(),
    rawanLimpasan: new Map(),
    rawanKarhutla: new Map(),
    bahayaKekeringan: new Map(),
    bahayaAbrasi: new Map(),
    bahayaBanjir: new Map(),
    bahayaBanjirBandang: new Map(),
    dtaDanau: new Map(),
    rehabilitasiDas: new Map(),
    rehabilitasiHutan: new Map(),
    kebakaran2021: new Map(),
    kebakaran2022: new Map(),
    kebakaran2023: new Map(),
    kebakaran2024: new Map(),
    kebakaran2025: new Map(),
    kawasanHutan: new Map(),
    risikoBanjir: new Map(),
    risikoBanjirBandang: new Map(),
    risikoKekeringan: new Map(),
    risikoAbrasi: new Map(),
    risikoLongsor: new Map(),
    risikoKarhutla: new Map(),
    khdtk: new Map(),
  });

  const lastHighlightedRef = useRef<{
    layerId: string;
    resetFn: () => void;
  } | null>(null);

  const tutupanLahanColors = {
    "Hutan Lahan Kering Primer": "#00B050",
    "Hutan Lahan Kering Sekunder": "#92D050",
    "Hutan Rawa Primer": "#00B050",
    "Hutan Rawa Sekunder": "#92D050",
    "Hutan Mangrove Primer": "#70AD47",
    "Hutan Mangrove Sekunder": "#A9D08E",
    Savana: "#FFFF00",
    "Hutan Tanaman": "#C6E0B4",
    Perkebunan: "#E2EFDA",
    "Pertanian Lahan Kering": "#FFFF00",
    "Pertanian Lahan Kering Campur": "#FFFF00",
    "Permukiman Transmigrasi": "#548235",
    Sawah: "#00FFFF",
    Tambak: "#00B0F0",
    "Tanah Terbuka": "#FFC000",
    "Lahan Terbuka": "#FFC000", // Tambahkan alias untuk Lahan Terbuka
    Pertambangan: "#C00000",
    Permukiman: "#7F7F7F",
    "Bandara/ Pelabuhan": "#FF00FF",
    Rawa: "#BF8F00",
    Awan: "#D9D9D9",
    "Semak Belukar": "#FFC000",
    "Semak Belukar Rawa": "#FFC000",
    "Tubuh Air": "#0070C0",
  };

  const geologiColors = [
    "#FF0000", // Red
    "#00FF00", // Lime
    "#0000FF", // Blue
    "#FFFF00", // Yellow
    "#FF00FF", // Magenta
    "#00FFFF", // Cyan
    "#FFA500", // Orange
    "#800080", // Purple
    "#008000", // Green
    "#FFC0CB", // Pink
    "#A52A2A", // Brown
    "#000080", // Navy
    "#808000", // Olive
    "#00CED1", // Dark Turquoise
    "#FF6347", // Tomato
    "#4B0082", // Indigo
    "#FF1493", // Deep Pink
    "#32CD32", // Lime Green
    "#FF4500", // Orange Red
    "#9400D3", // Dark Violet
    "#FFD700", // Gold
    "#8B4513", // Saddle Brown
    "#20B2AA", // Light Sea Green
    "#DC143C", // Crimson
    "#7FFF00", // Chartreuse
    "#8A2BE2", // Blue Violet
    "#FF8C00", // Dark Orange
    "#00FA9A", // Medium Spring Green
    "#BA55D3", // Medium Orchid
    "#ADFF2F", // Green Yellow
    "#FF69B4", // Hot Pink
    "#1E90FF", // Dodger Blue
    "#CD5C5C", // Indian Red
    "#00BFFF", // Deep Sky Blue
    "#F08080", // Light Coral
    "#FFDAB9", // Peach Puff
    "#98FB98", // Pale Green
    "#DDA0DD", // Plum
    "#F0E68C", // Khaki
    "#E6E6FA", // Lavender
    "#FFE4B5", // Moccasin
    "#D8BFD8", // Thistle
    "#B0C4DE", // Light Steel Blue
    "#FFDEAD", // Navajo White
    "#F5DEB3", // Wheat
    "#FFA07A", // Light Salmon
    "#FA8072", // Salmon
    "#87CEEB", // Sky Blue
    "#B0E0E6", // Powder Blue
    "#FFB6C1", // Light Pink
  ];

  // Legenda Jenis Tanah Nasional mengikuti SLD GeoServer.
  const JENIS_TANAH_NATIONAL_LEGEND: Array<{
    jntnh1: string;
    color: string;
  }> = [
    { jntnh1: "Permukiman", color: "#9E9E9E" },
    { jntnh1: "Tubuh Air", color: "#1976D2" },
    { jntnh1: "Aluvial", color: "#4DB6AC" },
    { jntnh1: "Andosol", color: "#9575CD" },
    { jntnh1: "Andisol", color: "#9575CD" },
    { jntnh1: "Gleisol", color: "#42A5F5" },
    { jntnh1: "Kambisol", color: "#66BB6A" },
    { jntnh1: "Grumusol", color: "#8D6E63" },
    { jntnh1: "Latosol", color: "#FF8A65" },
    { jntnh1: "Mediteran", color: "#D4A017" },
    { jntnh1: "Molisol", color: "#A1887F" },
    { jntnh1: "Nitosol", color: "#7CB342" },
    { jntnh1: "Oksisol", color: "#EF6C00" },
    { jntnh1: "Organosol", color: "#795548" },
    { jntnh1: "Podsolik", color: "#C65D4B" },
    { jntnh1: "Regosol", color: "#FBC02D" },
    { jntnh1: "Lainnya / No data", color: "#B39DDB" },
  ];
  const jenisTanahColors = [
    "#8B4513", // Saddle Brown
    "#D2691E", // Chocolate
    "#CD853F", // Peru
    "#DEB887", // Burlywood
    "#F4A460", // Sandy Brown
    "#DAA520", // Goldenrod
    "#B8860B", // Dark Goldenrod
    "#BC8F8F", // Rosy Brown
    "#A0522D", // Sienna
    "#8B7355", // Burlywood4
    "#6B4423", // Dark Brown
    "#C19A6B", // Camel
    "#826644", // Raw Umber
    "#8B6914", // Dark Goldenrod4
    "#704214", // Sepia
    "#A0826D", // Beaver
    "#967969", // Pastel Brown
    "#8D4004", // Burnt Umber
    "#C9AE5D", // Camel Brown
    "#987654", // Tan
    "#9C661F", // Field Drab
    "#6F4E37", // Coffee
    "#B87333", // Copper
    "#8B7D6B", // Khaki
    "#896C39", // Bronze
    "#9B7653", // Café au Lait
    "#AA8866", // Desert Sand
    "#A67B5B", // Café
    "#C8AD7F", // Ecru
    "#8A795D", // Shadow
    "#654321", // Dark Brown
    "#966919", // Metallic Gold
    "#B5651D", // Light Brown
    "#A68064", // Clay
    "#C2B280", // Sand
    "#E1C699", // Desert
    "#D2B48C", // Tan
    "#BDB76B", // Dark Khaki
    "#F0E68C", // Khaki
    "#EEE8AA", // Pale Goldenrod
  ];

  // Warna untuk lahan kritis
  const lahanKritisColors = {
    "Sangat Kritis": "#FF0000",
    Kritis: "#FFA500",
  };

  // Warna untuk rawan erosi (berdasarkan tingkat)
  const rawanErosiColors = {
    "<= 15 Ton/Ha/Tahun": "#90EE90", // Sangat Rendah - Light Green
    "> 15 - 60 Ton/Ha/Tahun": "#FFFF00", // Rendah - Yellow
    "> 60 - 180 Ton/Ha/Tahun": "#FFA500", // Sedang - Orange
    "> 180 - 480 Ton/Ha/Tahun": "#FF0000", // Tinggi - Red
    "> 480 Ton/Ha/Tahun": "#8B0000", // Sangat Tinggi - Dark Red
  };

  // Warna Rawan Longsor Nasional mengikuti 9 kategori atribut `unsur`
  // pada public.rawan_longsor dan SLD resmi GeoServer.
  // Lima kelas kerawanan berwarna; empat kelas perairan transparan.
  const rawanLongsorColors: Record<string, string> = {
    "Sangat Rendah": "#A5D6A7",
    Rendah: "#2EAD62",
    Menengah: "#F5D547",
    Tinggi: "#E53935",
    "Alur Aliran Bahan Rombakan": "#795548",
    Danau: "transparent",
    "Danau Tapal Kuda": "transparent",
    "Danau/Situ": "transparent",
    Waduk: "transparent",
  };
  const rawanLongsorClassOrder = [
    "Sangat Rendah",
    "Rendah",
    "Menengah",
    "Tinggi",
    "Alur Aliran Bahan Rombakan",
    "Danau",
    "Danau Tapal Kuda",
    "Danau/Situ",
    "Waduk",
  ];

  // Warna untuk rawan limpasan
  const rawanLimpasanColors = {
    Ekstrim: "#8B0000",
    Tinggi: "#FF0000",
    Rendah: "#FFFF00",
    Normal: "#90EE90",
  };
  // Override warna Rawan Limpasan dari klik legenda.
  // Tetap digunakan pada render ulang GeoJSON maupun WMS.
  const rawanLimpasanColorOverridesRef = useRef<Map<string, string>>(new Map());

  const buildRawanLimpasanSld = (selectedClass: string, selectedColor: string) => {
    const classes = ["Ekstrim", "Tinggi", "Rendah", "Normal"];
    const xmlEscape = (value: string) =>
      String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
    const rules = classes.map((kelas) => {
      const fill = kelas === selectedClass
        ? selectedColor
        : rawanLimpasanColorOverridesRef.current.get(kelas) || rawanLimpasanColors[kelas as keyof typeof rawanLimpasanColors];
      return `<Rule><Name>${xmlEscape(kelas)}</Name><Title>${xmlEscape(kelas)}</Title><ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>limpasan</ogc:PropertyName><ogc:Literal>${xmlEscape(kelas)}</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter><PolygonSymbolizer><Fill><CssParameter name="fill">${fill}</CssParameter><CssParameter name="fill-opacity">0.65</CssParameter></Fill><Stroke><CssParameter name="stroke">${fill}</CssParameter><CssParameter name="stroke-width">1</CssParameter></Stroke></PolygonSymbolizer></Rule>`;
    }).join("");
    // NamedLayer wajib menunjuk nama layer GeoServer yang dipakai request WMS.
    return `<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.opengis.net/sld http://www.opengis.net/sld/StyledLayerDescriptor.xsd"><NamedLayer><Name>simiti:vw_rawan_limpasan_wms</Name><UserStyle><Name>rawan_limpasan_click_style</Name><Title>Rawan Limpasan - Click Legend Style</Title><FeatureTypeStyle>${rules}</FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>`;
  };

  // Warna untuk rawan karhutla
  const rawanKarhutlaColors = {
    "Sangat Tinggi": "#8B0000",
    Tinggi: "#FF0000",
    Sedang: "#FFA500",
    Rendah: "#FFFF00",
  };

  const bahayaKelasColors: Record<string, string> = {
    Tinggi: "#FF0000",
    Sedang: "#FFA500",
    Rendah: "#FFFF00",
  };

  // Warna khusus Bahaya Abrasi dan Gelombang Ekstrem.
  // Sengaja dipisahkan dari palette bahayaKelasColors agar layer bahaya
  // lainnya tetap memakai mapping warna yang sudah ada.
  const bahayaAbrasiColors: Record<string, string> = {
    Rendah: "#22C55E",
    Tinggi: "#EF4444",
  };

  const dtaDanauColors: Record<string, string> = {
    TEKTONIK: "#1E90FF",
    BUATAN: "#4682B4",
    VULKANIK: "#FF4500",
    "TEKTO-VULKANIK": "#FF6347",
    "PAPARAN BANJIR": "#00BFFF",
    "SUNGAI TERBENDUNG": "#87CEEB",
  };

  const randomColorPalette = [
    "#FF6B6B",
    "#4ECDC4",
    "#45B7D1",
    "#FFA07A",
    "#98D8C8",
    "#F7DC6F",
    "#BB8FCE",
    "#85C1E2",
    "#F8B739",
    "#52BE80",
    "#EC7063",
    "#5DADE2",
    "#F1948A",
    "#73C6B6",
    "#F39C12",
    "#AED6F1",
    "#F8C471",
    "#82E0AA",
    "#E59866",
    "#D7BDE2",
    "#FF9FF3",
    "#54A0FF",
    "#5F27CD",
    "#00D2D3",
    "#01ABC2",
    "#FF6348",
    "#2ED573",
    "#1E90FF",
    "#FFA502",
    "#ECCC68",
  ];

  const getRandomColor = (
    key: string,
    colorMapRef: Map<string, string>,
  ): string => {
    if (colorMapRef.has(key)) return colorMapRef.get(key)!;
    const idx = colorMapRef.size % randomColorPalette.length;
    const color = randomColorPalette[idx];
    colorMapRef.set(key, color);
    return color;
  };

  const [kejadianPhotos, setKejadianPhotos] = useState<
    Array<{
      id: number;
      path: string;
      incident_type: string;
      incident_date: string;
      title: string;
      latitude: number;
      longitude: number;
    }>
  >([]);
  const [activeKejadianLayers, setActiveKejadianLayers] = useState<
    Map<string, { year: number; category: string }>
  >(new Map());
  const [kejadianListings, setKejadianListings] = useState<Array<any>>([]);

  // Guard untuk mencegah race condition ketika beberapa request GeoJSON
  // selesai bersamaan (mis. toggle + pan/zoom). Hanya request terbaru
  // yang boleh mengganti layer di peta.
  const layerRequestSeqRef = useRef<Record<string, number>>({});

  const isLeafletMapUsable = (map: any) => {
    return !!(
      map &&
      map._loaded &&
      map._container &&
      map._container._leaflet_id
    );
  };

  const safeRemoveMapLayer = (layer: any) => {
    const map = mapInstanceRef.current;
    if (!isLeafletMapUsable(map) || !layer) return;
    try {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    } catch (error) {
      console.warn("⚠️ Leaflet gagal remove layer, dilewati:", error);
    }
  };

  const safeAddMapLayer = (map: any, layer: any) => {
    if (!isLeafletMapUsable(map) || !layer) return false;
    try {
      layer.addTo(map);
      return true;
    } catch (error) {
      console.warn("⚠️ Leaflet gagal add layer, dilewati:", error);
      return false;
    }
  };

  // ======================================================
  // SELECTED AREA BENCANA CLIP
  // Hanya geometry layer bencana yang dipotong mengikuti
  // area terpilih. Layer/daerah lain tetap tampil normal.
  // ======================================================
  const selectedAreaBencanaClipIdRef = useRef<string>(
    `simitibencanaClip_${Math.random().toString(36).slice(2, 10)}`,
  );
  const selectedAreaBencanaClipPathRef = useRef<any>(null);
  const selectedAreaBencanaClipListenersRef = useRef<any[]>([]);

  const BENCANA_FOCUS_LAYERS = new Set([
    "bahaya_kekeringan",
    "bahaya_abrasi_dan_gelombang_ekstrim",
    "bahaya_banjir",
    "bahaya_banjir_bandang",
    "risiko_banjir",
    "risiko_banjir_bandang",
    "risiko_kekeringan",
    "risiko_abrasi",
    "risiko_longsor",
    "risiko_karhutla",
    "rawan_banjir",
    "rawan_longsor",
    "rawan_karhutla",
    "rawan_erosi",
    "rawan_limpasan",
  ]);
  // SIMITI_OVERLAP_HATCH_V2
  const riskOverlapHatchLayerRef = useRef<any>(null);

  const refreshRiskOverlapHatch = () => {
    const map = mapInstanceRef.current;
    const L = (window as any).L;
    if (!map || !L) return;

    try {
      const oldOverlay = riskOverlapHatchLayerRef.current;
      if (oldOverlay && map.hasLayer(oldOverlay)) map.removeLayer(oldOverlay);
      riskOverlapHatchLayerRef.current = null;

      const items: Array<{ name: string; feature: any; bounds: number[] }> = [];
      for (const [name, group] of layerCacheRef.current.entries()) {
        if (!BENCANA_FOCUS_LAYERS.has(String(name))) continue;
        if (!group || !map.hasLayer(group)) continue;

        group.eachLayer((child: any) => {
          const feature = child?.feature;
          if (!["Polygon", "MultiPolygon"].includes(feature?.geometry?.type)) return;
          try {
            const bounds = turfBbox(feature);
            if (bounds.length === 4 && bounds.every(Number.isFinite)) {
              items.push({ name: String(name), feature, bounds });
            }
          } catch {
            // Abaikan geometri yang tidak valid.
          }
        });
      }

      const overlaps: any[] = [];
      let checked = 0;
      for (let i = 0; i < items.length && checked < 12000; i++) {
        for (let j = i + 1; j < items.length && checked < 12000; j++) {
          if (items[i].name === items[j].name) continue;
          checked++;

          const a = items[i].bounds;
          const b = items[j].bounds;
          if (a[0] > b[2] || b[0] > a[2] || a[1] > b[3] || b[1] > a[3]) continue;

          try {
            const result = turfIntersect(
              turfFeatureCollection([items[i].feature, items[j].feature]) as any
            );
            if (
              result?.geometry &&
              ["Polygon", "MultiPolygon"].includes(result.geometry.type) &&
              turfArea(result) >= 10
            ) {
              overlaps.push(result);
              if (overlaps.length >= 120) break;
            }
          } catch {
            // Abaikan pasangan yang gagal dihitung.
          }
        }
        if (overlaps.length >= 120) break;
      }

      if (!overlaps.length) return;

      const overlay = L.geoJSON(
        { type: "FeatureCollection", features: overlaps },
        {
          pane: "overlayPane",
          interactive: false,
          style: {
            color: "#111827",
            weight: 1,
            opacity: 0.85,
            fillColor: "#111827",
            fillOpacity: 0,
          },
        }
      );

      overlay.addTo(map);
      overlay.eachLayer((child: any) => {
        const svg = child?._path?.ownerSVGElement;
        if (!svg) return;

        const ns = "http://www.w3.org/2000/svg";
        let defs = svg.querySelector('defs[data-simiti-hatch="v2"]');
        if (!defs) {
          defs = document.createElementNS(ns, "defs");
          defs.setAttribute("data-simiti-hatch", "v2");

          const pattern = document.createElementNS(ns, "pattern");
          pattern.setAttribute("id", "simiti-risk-hatch-v2");
          pattern.setAttribute("patternUnits", "userSpaceOnUse");
          pattern.setAttribute("width", "8");
          pattern.setAttribute("height", "8");

          const line = document.createElementNS(ns, "path");
          line.setAttribute("d", "M-2,2 L2,-2 M0,8 L8,0 M6,10 L10,6");
          line.setAttribute("fill", "none");
          line.setAttribute("stroke", "#111827");
          line.setAttribute("stroke-width", "1.4");
          pattern.appendChild(line);
          defs.appendChild(pattern);
          svg.insertBefore(defs, svg.firstChild);
        }

        child.setStyle({
          color: "#111827",
          weight: 1,
          opacity: 0.85,
          fillColor: "url(#simiti-risk-hatch-v2)",
          fillOpacity: 1,
        });
      });

      riskOverlapHatchLayerRef.current = overlay;
      console.log("SIMITI OVERLAP HATCH:", overlaps.length, "irisan");
    } catch (error) {
      console.warn("SIMITI: gagal memperbarui arsiran:", error);
    }
  };

  // Warna enterprise per JENIS BENCANA.
  // Warna ini dipakai ketika layer bencana ditampilkan pada area terpilih,
  // sehingga pengguna langsung dapat membedakan jenis ancamannya.
  const BENCANA_LAYER_COLORS: Record<string, string> = {
    // Karhutla = merah
    rawan_karhutla: "#DC2626",
    risiko_karhutla: "#DC2626",

    // Banjir = hijau
    bahaya_banjir: "#16A34A",
    risiko_banjir: "#16A34A",

    // Banjir bandang = hijau kebiruan
    bahaya_banjir_bandang: "#0F766E",
    risiko_banjir_bandang: "#0F766E",

    // Longsor = oranye
    rawan_longsor: "#EA580C",
    risiko_longsor: "#EA580C",

    // Kekeringan = kuning/amber
    bahaya_kekeringan: "#D97706",
    risiko_kekeringan: "#D97706",

    // Abrasi/gelombang = biru
    bahaya_abrasi_dan_gelombang_ekstrim: "#2563EB",
    risiko_abrasi: "#2563EB",

    // Erosi = cokelat
    rawan_erosi: "#92400E",

    // Limpasan = ungu
    rawan_limpasan: "#7C3AED",
  };

  const getBencanaLayerColor = (tableName: string): string =>
    BENCANA_LAYER_COLORS[String(tableName)] || "#64748B";

  // Ambil warna kelas dari registry yang sama dengan legenda/renderer.
  // Pencarian case-insensitive menjaga konsistensi untuk label statistik WMS.
  const getExactRiskPaletteColor = (layerName: string, classValue: string): string | undefined => {
    const key = String(classValue ?? "").trim();
    const paletteByLayer: Record<string, Record<string, string>> = {
      rawan_erosi: rawanErosiColors,
      rawan_longsor: rawanLongsorColors,
      rawan_limpasan: rawanLimpasanColors,
      rawan_karhutla: rawanKarhutlaColors,
      bahaya_banjir: bahayaKelasColors,
      bahaya_banjir_bandang: bahayaKelasColors,
      bahaya_kekeringan: bahayaKelasColors,
      bahaya_abrasi_dan_gelombang_ekstrim: bahayaAbrasiColors,
    };
    const palette = paletteByLayer[layerName];
    if (!palette) return undefined;
    if (palette[key]) return palette[key];
    const normalized = key.toLowerCase().replace(/\s+/g, " ");
    const match = Object.keys(palette).find((candidate) => candidate.toLowerCase().replace(/\s+/g, " ") === normalized);
    return match ? palette[match] : undefined;
  };


  // Kelas kerawanan memakai warna konsisten pada peta dan legenda.
  // Jika sumber memakai label lain, warna dasar jenis bencana tetap digunakan.
  const getRisikoBanjirClassColor = (value: unknown, fallback: string): string => {
    const kelas = String(value ?? "").trim().toLowerCase();
    if (kelas === "rendah") return "#22C55E";
    if (kelas === "sedang") return "#FACC15";
    if (kelas === "tinggi") return "#EF4444";
    return fallback;
  };

  const getRiskClassColor = (value: unknown, fallback: string): string => {
    const kelas = String(value ?? "").trim().toLowerCase();
    if (!kelas) return fallback;
    if (/\b(sangat\s*tinggi|very\s*high)\b/.test(kelas)) return "#991B1B";
    if (/\b(rendah|low|aman|minim)\b/.test(kelas)) return "#22C55E";
    if (/\b(sedang|medium|moderate)\b/.test(kelas)) return "#F59E0B";
    if (/\b(tinggi|high|berat)\b/.test(kelas)) return "#EF4444";
    return fallback;
  };

  // SLD dinamis untuk WMS nasional: warna polygon berasal dari atribut kelas
  // yang sama dengan legenda, bukan dari style default GeoServer.
  const getRiskWmsClassColumn = (layerName: string): string => ({
    rawan_erosi: "kls_a",
    rawan_longsor: "unsur",
    rawan_limpasan: "limpasan",
    rawan_karhutla: "kelas",
    bahaya_abrasi_dan_gelombang_ekstrim: "kelas",
    bahaya_banjir_bandang: "kelas",
    bahaya_banjir: "kelas",
    bahaya_kekeringan: "kelas",
    risiko_banjir: "kelas",
    risiko_banjir_bandang: "kelas",
    risiko_kekeringan: "kelas",
    risiko_abrasi: "kelas",
    risiko_longsor: "kelas",
    risiko_karhutla: "kelas",
  } as Record<string, string>)[layerName] || "kelas";


  const buildNationalRiskBanjirSld = (items: Array<{ kelas: string; color: string }>, layerName: string = "risiko_banjir", classColumn: string = "kelas") => {
    const xmlEscape = (value: string) =>
      String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
    const rules = items.map((item, index) => `
      <Rule>
        <Name>kelas_${index + 1}</Name>
        <Title>${xmlEscape(item.kelas)}</Title>
        <ogc:Filter><ogc:PropertyIsEqualTo>
          <ogc:PropertyName>${xmlEscape(classColumn)}</ogc:PropertyName>
          <ogc:Literal>${xmlEscape(item.kelas)}</ogc:Literal>
        </ogc:PropertyIsEqualTo></ogc:Filter>
        <PolygonSymbolizer>
          <Fill><CssParameter name="fill">${xmlEscape(item.color)}</CssParameter>
            <CssParameter name="fill-opacity">${(layerName === "vw_risiko_abrasi_wms" || layerName === "vw_rawan_karhutla_wms") ? "1.0" : "0.78"}</CssParameter></Fill>
          <Stroke><CssParameter name="stroke">#FFFFFF</CssParameter>
            <CssParameter name="stroke-width">0.25</CssParameter>
            <CssParameter name="stroke-opacity">0.45</CssParameter></Stroke>
        </PolygonSymbolizer>
      </Rule>`).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
      <StyledLayerDescriptor version="1.0.0"
        xmlns="http://www.opengis.net/sld"
        xmlns:ogc="http://www.opengis.net/ogc"
        xmlns:xlink="http://www.w3.org/1999/xlink"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
        <NamedLayer><Name>simiti:${layerName}</Name><UserStyle>
          <Title>SIMITI ${layerName === "risiko_kekeringan" ? "Risiko Kekeringan" : layerName === "risiko_banjir_bandang" ? "Risiko Banjir Bandang" : "Risiko Banjir"} berdasarkan kelas</Title>
          <FeatureTypeStyle>${rules}</FeatureTypeStyle>
        </UserStyle></NamedLayer>
      </StyledLayerDescriptor>`;
  };

  // SLD khusus Bahaya Abrasi dan Gelombang Ekstrem.
  // Layer ini hanya memiliki kelas Rendah dan Tinggi; warna polygon WMS
  // dikunci langsung di sini agar tidak bergantung pada style default GeoServer.
  const buildBahayaAbrasiSld = () => {
    // SLD mengikuti struktur XML acuan. NamedLayer wajib menunjuk ke
    // nama layer WMS yang sebenarnya, bukan nama style.
    const makeRule = (kelas: string, fill: string, stroke: string) => `
        <sld:Rule>
          <sld:Name>${kelas}</sld:Name>
          <ogc:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>kelas</ogc:PropertyName>
              <ogc:Literal>${kelas}</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </ogc:Filter>
          <sld:PolygonSymbolizer>
            <sld:Fill>
              <sld:CssParameter name="fill">${fill}</sld:CssParameter>
              <sld:CssParameter name="fill-opacity">1.0</sld:CssParameter>
            </sld:Fill>
            <sld:Stroke>
              <sld:CssParameter name="stroke">${stroke}</sld:CssParameter>
              <sld:CssParameter name="stroke-width">0.25</sld:CssParameter>
            </sld:Stroke>
          </sld:PolygonSymbolizer>
        </sld:Rule>`;
    return `<?xml version="1.0" encoding="UTF-8"?>
      <sld:StyledLayerDescriptor
        version="1.0.0"
        xmlns:sld="http://www.opengis.net/sld"
        xmlns:ogc="http://www.opengis.net/ogc"
        xmlns:gml="http://www.opengis.net/gml"
        xmlns="http://www.opengis.net/sld">
        <sld:NamedLayer>
          <sld:Name>simiti:bahaya_abrasi_dan_gelombang_ekstrim</sld:Name>
          <sld:UserStyle>
            <sld:Title>Bahaya Abrasi dan Gelombang Ekstrem - Rendah dan Tinggi</sld:Title>
            <sld:FeatureTypeStyle>
              ${makeRule("Rendah", "#22C55E", "#166534")}
              ${makeRule("Tinggi", "#EF4444", "#991B1B")}
            </sld:FeatureTypeStyle>
          </sld:UserStyle>
        </sld:NamedLayer>
      </sld:StyledLayerDescriptor>`;
  };

  // SLD eksplisit untuk Kawasan Hutan Nasional.
  // Gunakan namespace sld: secara eksplisit agar parser GeoServer membaca
  // seluruh elemen styling secara konsisten pada parameter WMS SLD_BODY.
  const buildKawasanHutanSld = (
    selectedKey: string | null = null,
    selectedColor: string | null = null,
  ) => {
    const xmlEscape = (value: unknown) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

    const selected = String(selectedKey ?? "").trim();
    const selectedItem = KAWASAN_HUTAN_LEGEND.find(
      (item) => String(item.fungsikws) === selected ||
        item.codes.some((code) => String(code) === selected),
    );
    const selectedCodes = selectedItem
      ? [...selectedItem.codes]
      : selected ? [selected] : [];
    const equalities = selectedCodes.map((code) =>
      `<ogc:PropertyIsEqualTo><ogc:PropertyName>fungsikws</ogc:PropertyName><ogc:Literal>${xmlEscape(code)}</ogc:Literal></ogc:PropertyIsEqualTo>`
    ).join("");
    const selectedFilter = selectedCodes.length > 1
      ? `<ogc:Or>${equalities}</ogc:Or>`
      : equalities;
    const color = xmlEscape(selectedColor || selectedItem?.color || "#FACC15");

    return `<?xml version="1.0" encoding="UTF-8"?>` +
      `<sld:StyledLayerDescriptor version="1.0.0" xmlns:sld="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">` +
      `<sld:NamedLayer><sld:Name>simiti:kawasan_hutan</sld:Name><sld:UserStyle><sld:Title>SIMITI Kawasan Hutan - Pilihan Legenda</sld:Title><sld:FeatureTypeStyle>` +
      `<sld:Rule><sld:Name>kategori-terpilih</sld:Name><ogc:Filter>${selectedFilter}</ogc:Filter><sld:PolygonSymbolizer><sld:Fill><sld:CssParameter name="fill">${color}</sld:CssParameter><sld:CssParameter name="fill-opacity">0.95</sld:CssParameter></sld:Fill><sld:Stroke><sld:CssParameter name="stroke">#FFFFFF</sld:CssParameter><sld:CssParameter name="stroke-width">1.2</sld:CssParameter><sld:CssParameter name="stroke-opacity">1</sld:CssParameter></sld:Stroke></sld:PolygonSymbolizer></sld:Rule>` +
      `<sld:Rule><sld:ElseFilter/><sld:PolygonSymbolizer><sld:Fill><sld:CssParameter name="fill">#94A3B8</sld:CssParameter><sld:CssParameter name="fill-opacity">0.16</sld:CssParameter></sld:Fill><sld:Stroke><sld:CssParameter name="stroke">#64748B</sld:CssParameter><sld:CssParameter name="stroke-width">0.25</sld:CssParameter><sld:CssParameter name="stroke-opacity">0.35</sld:CssParameter></sld:Stroke></sld:PolygonSymbolizer></sld:Rule>` +
      `</sld:FeatureTypeStyle></sld:UserStyle></sld:NamedLayer></sld:StyledLayerDescriptor>`;
  };
  // Bangun WKT dari geometri administrasi untuk filter spasial GeoServer.
  const buildRiskBanjirAdminWkt = (areas: Array<any>): string | null => {
    const collectPolygons = (geom: any): any[] => {
      if (!geom) return [];
      if (geom.type === "Feature") return collectPolygons(geom.geometry);
      if (geom.type === "Polygon") return [geom.coordinates];
      if (geom.type === "MultiPolygon") return geom.coordinates || [];
      if (geom.type === "GeometryCollection") {
        return (geom.geometries || []).flatMap(collectPolygons);
      }
      return [];
    };

    const polygons = areas.flatMap((area: any) =>
      collectPolygons(area?.geom)
    );
    if (!polygons.length) return null;

    // Coba toleransi kecil lebih dahulu. Jika WKT terlalu panjang,
    // sederhanakan bertahap tanpa langsung membuang geometri.
    const tolerances = [0.00005, 0.0001, 0.0002, 0.0004, 0.0008];
    const maxWktLength = 4200;

    for (const tolerance of tolerances) {
      try {
        const outputPolygons: number[][][][] = [];

        for (const coordinates of polygons) {
          const feature: any = {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates,
            },
          };

          const simplified: any = turfSimplify(feature, {
            tolerance,
            highQuality: true,
            mutate: false,
          });

          if (simplified?.geometry?.type !== "Polygon") {
            throw new Error("Hasil simplify bukan Polygon");
          }

          const outputRings: number[][][] = [];

          for (const ring of simplified.geometry.coordinates || []) {
            const points: number[][] = (ring || [])
              .map((point: any) => [
                Number(point?.[0]),
                Number(point?.[1]),
              ])
              .filter((point: number[]) =>
                point.length === 2 &&
                point.every(Number.isFinite) &&
                Math.abs(point[0]) <= 180 &&
                Math.abs(point[1]) <= 90
              );

            if (points.length < 3) {
              throw new Error("Ring geometri tidak valid");
            }

            const first = points[0];
            const last = points[points.length - 1];

            if (first[0] !== last[0] || first[1] !== last[1]) {
              points.push([...first]);
            }

            if (points.length < 4) {
              throw new Error("Ring terlalu pendek");
            }

            outputRings.push(points);
          }

          if (!outputRings.length) {
            throw new Error("Polygon tidak memiliki ring");
          }

          outputPolygons.push(outputRings);
        }

        const polygonWkts = outputPolygons.map((polygon) => {
          const ringWkts = polygon.map((ring) => {
            const points = ring.map(([lng, lat]) =>
              `${Number(lng.toFixed(6))} ${Number(lat.toFixed(6))}`
            );
            return `(${points.join(",")})`;
          });
          return `(${ringWkts.join(",")})`;
        });

        const wkt = `MULTIPOLYGON(${polygonWkts.join(",")})`;
      const vertexCount = outputPolygons.reduce(
        (total, polygon) =>
          total + polygon.reduce(
            (ringTotal, ring) => ringTotal + ring.length,
            0,
          ),
        0,
      );
      console.info("SIMITI WMS WKT SIZE:", {
        tolerance,
        length: wkt.length,
        polygonCount: outputPolygons.length,
        vertexCount,
        maxWktLength,
      });
        if (wkt.length <= maxWktLength) return wkt;
      } catch (error) {
        console.warn("SIMITI: simplify geometri WMS gagal", tolerance, error);
      }
    }

    console.warn("SIMITI: geometri administrasi terlalu besar untuk WMS.");
    return null;
  };

  const NATIONAL_HAZARD_WMS_LAYERS = new Set<string>([
    "bahaya_abrasi_dan_gelombang_ekstrim",
    "bahaya_banjir_bandang",
    "bahaya_banjir",
    "bahaya_kekeringan",
    "rawan_longsor",
    "rawan_limpasan",
    "rawan_karhutla",
    "rawan_erosi",
  ]);

  const VERIFIED_NATIONAL_HAZARD_WMS_LAYERS = new Set<string>([
    "bahaya_banjir",
    "bahaya_banjir_bandang",
    "bahaya_abrasi_dan_gelombang_ekstrim",
    "bahaya_kekeringan",
    "rawan_longsor",
  ]);
  const buildRiskBanjirWmsCqlFilter = (
    kelas: string | null,
    areas: Array<any> = selectedAreas,
    geometryColumn: string = "geom_valid",
    classColumn: string = "kelas"
  ): string | null => {
    const safeClassColumn =
      ["unsur", "kls_a"].includes(classColumn) ? classColumn : "kelas";

    const classFilter = kelas
      ? `${safeClassColumn} = '${String(kelas).replace(/'/g, "''")}'`
      : "";

    // Tanpa area administrasi terpilih, perilaku nasional tetap dipertahankan.
    if (!areas.length) return classFilter || "INCLUDE";

    const deepestAreas = getDeepestSelectedAdminAreas(areas);
    if (!deepestAreas.length) return null;

    try {
      // Gunakan polygon administrasi sebenarnya, bukan bounding box.
      const adminWkt = buildRiskBanjirAdminWkt(deepestAreas);

      // Gagal secara aman: jangan tampilkan data dari area lain.
      if (!adminWkt) {
        console.warn("SIMITI: WKT administrasi tidak tersedia; WMS tidak ditampilkan.");
        return null;
      }

      const spatialFilter = `INTERSECTS(${geometryColumn}, ${adminWkt})`;

      console.info("SIMITI WMS ADMIN INTERSECTS:", {
        areaCount: deepestAreas.length,
        wktLength: adminWkt.length,
        hasClassFilter: Boolean(classFilter),
      });

      return classFilter
        ? `(${spatialFilter}) AND (${classFilter})`
        : spatialFilter;
    } catch (error) {
      console.warn("SIMITI: gagal membentuk INTERSECTS WMS:", error);
      return null;
    }
  };
  const applyNationalRiskBanjirLegendClass = (
    kelas: string | null,
    tableName: string = "risiko_banjir",
    areas: Array<any> = selectedAreas,
  ) => {
    const wmsLayer: any = layerGroupsRef.current?.[tableName];
    if (!wmsLayer || typeof wmsLayer.setParams !== "function") return false;

    const geometryColumn = "geom_valid";
    const classColumn =
      tableName === "rawan_erosi" ? "kls_a" : tableName === "rawan_longsor" ? "unsur" : "kelas";

    const cqlFilter = buildRiskBanjirWmsCqlFilter(
      kelas,
      areas,
      geometryColumn,
      classColumn,
    );
    if (!cqlFilter) {
      console.warn("SIMITI: filter legenda WMS tidak dapat dibentuk.");
      return false;
    }

    wmsLayer.setParams({ CQL_FILTER: cqlFilter });
    return true;
  };

  const getBencanaFeatureClass = (feature: any): string => {
    const props = feature?.properties || {};
    const candidates = [
      props.kelas,
      props.tingkat_risiko,
      props.tingkat_bahaya,
      props.kelas_risiko,
      props.kelas_bahaya,
      props.risk_level,
      props.hazard_level,
      props.keterangan,
      props.unsur,
      props.limpasan,
    ];
    return String(candidates.find((value) => value != null && String(value).trim()) ?? "");
  };

  // Warna polygon bencana selalu membaca mapping yang juga dipakai legenda.
  // Fallback hanya digunakan jika kelas belum tersedia pada mapping legenda.
  const getBencanaLegendFeatureColor = (layerName: string, feature: any): string => {
    const props = feature?.properties || {};
    const cm = colorMappingRef.current;
    const key = String(getBencanaFeatureClass(feature) || "").trim();

if (
  String(layerName) === "rawan_limpasan" &&
  String(props.limpasan ?? "").trim() === "Rendah"
) {
  console.log("[DEBUG RAWAN LIMPASAN RENDAH]", {
    properties: props,
    key,
    color: rawanLimpasanColors.Rendah,
    mappedColor: cm.rawanLimpasan.get("Rendah"),
  });
}
    const mappings: Record<string, Map<string, string>> = {
      rawan_erosi: cm.rawanErosi,
      rawan_longsor: cm.rawanLongsor,
      rawan_limpasan: cm.rawanLimpasan,
      rawan_karhutla: cm.rawanKarhutla,
      bahaya_kekeringan: cm.bahayaKekeringan,
      bahaya_abrasi_dan_gelombang_ekstrim: cm.bahayaAbrasi,
      bahaya_banjir: cm.bahayaBanjir,
      bahaya_banjir_bandang: cm.bahayaBanjirBandang,
      risiko_banjir: cm.risikoBanjir,
      risiko_banjir_bandang: cm.risikoBanjirBandang,
      risiko_kekeringan: cm.risikoKekeringan,
      risiko_abrasi: cm.risikoAbrasi,
      risiko_longsor: cm.risikoLongsor,
      risiko_karhutla: cm.risikoKarhutla,
    };
    const mapping = mappings[String(layerName)];
    const directKeys = [
      props.kelas, props.tingkat, props.keterangan, props.unsur, props.limpasan,
      props.tingkat_risiko, props.tingkat_bahaya, props.kelas_risiko, props.kelas_bahaya,
    ].filter((value) => value != null).map((value) => String(value).trim());

    // Rawan Limpasan memiliki palet kelas tersendiri; jangan jatuh ke
    // fallback umum (yang memberi kelas "Rendah" warna hijau).
    if (String(layerName) === "rawan_limpasan") {
      const limpasanKey = String(props.limpasan ?? key ?? "").trim();
      // Override legenda harus diprioritaskan atas palet default agar
      // render ulang / cache layer tidak mengembalikan warna bawaan.
      const limpasanColor =
        rawanLimpasanColorOverridesRef.current.get(limpasanKey) ||
        cm.rawanLimpasan.get(limpasanKey) ||
        rawanLimpasanColors[limpasanKey as keyof typeof rawanLimpasanColors];
      if (limpasanColor) return limpasanColor;
    }

    for (const value of directKeys) {
      const mapped = mapping?.get(value);
      if (mapped) return mapped;
    }

    // Risiko abrasi: jika polygon dirender sebelum statistik legenda selesai
    // dimuat, gunakan palet yang sama persis dengan warna pada tabel legenda.
    // Ini mencegah kelas Sedang memakai fallback oranye (#F59E0B), padahal
    // legenda menampilkan kuning (#FACC15).
    if (String(layerName) === "risiko_abrasi") {
      return getRisikoBanjirClassColor(
        key,
        getBencanaLayerColor(String(layerName)),
      );
    }

    return getRiskClassColor(key, getBencanaLayerColor(String(layerName)));
  };

  const areaGeomToLatLngRings = (geom: any): number[][][] => {
    if (!geom) return [];

    const normalizeRing = (ring: any[]) =>
      Array.isArray(ring)
        ? (ring
            .map((point: any) => {
              const lng = Number(point?.[0]);
              const lat = Number(point?.[1]);
              return Number.isFinite(lat) && Number.isFinite(lng)
                ? [lat, lng]
                : null;
            })
            .filter(Boolean) as number[][])
        : [];

    if (geom.type === "Feature") {
      return areaGeomToLatLngRings(geom.geometry);
    }

    if (geom.type === "Polygon") {
      const ring = normalizeRing(geom.coordinates?.[0]);
      return ring.length >= 3 ? [ring] : [];
    }

    if (geom.type === "MultiPolygon") {
      return (geom.coordinates || [])
        .map((polygon: any) => normalizeRing(polygon?.[0]))
        .filter((ring: number[][]) => ring.length >= 3);
    }

    if (geom.type === "GeometryCollection") {
      return (geom.geometries || []).flatMap((item: any) =>
        areaGeomToLatLngRings(item),
      );
    }

    return [];
  };

  // ======================================================
  // BENCANA CLIP — renderer-safe per SVG
  // Clip dibuat di SVG renderer yang benar-benar memiliki path
  // bencana. Ini mencegah warna/geometri bencana bocor ke daerah
  // tetangga ketika area administrasi dipilih.
  // ======================================================
  // Ambil hanya level administrasi terdalam yang dipilih.
  // Contoh: Provinsi > Kabupaten > Kecamatan > Kelurahan, maka
  // clip memakai polygon Kelurahan saja (bukan gabungan parent-child).
  const getDeepestSelectedAdminAreas = (areas: Array<any> = selectedAreas) => {
    const levelPriority: Record<string, number> = {
      provinsi: 1,
      kabupaten: 2,
      kecamatan: 3,
      kelurahan: 4,
    };
    const validAreas = (areas || []).filter((area: any) => area?.geom);
    if (!validAreas.length) return [];
    const deepest = Math.max(
      ...validAreas.map((area: any) => levelPriority[String(area?.level)] || 0),
    );
    return validAreas.filter(
      (area: any) => (levelPriority[String(area?.level)] || 0) === deepest,
    );
  };

  const buildBencanaClipD = (map: any, areas: Array<any>) => {
    const rings = areas.flatMap((area: any) =>
      areaGeomToLatLngRings(area?.geom),
    );

    return rings
      .map((ring: number[][]) => {
        const points = ring
          .map(([lat, lng]) => map.latLngToLayerPoint([lat, lng]))
          .filter(
            (point: any) =>
              Number.isFinite(point?.x) && Number.isFinite(point?.y),
          );

        if (points.length < 3) return "";

        return (
          `M ${points[0].x} ${points[0].y} ` +
          points
            .slice(1)
            .map((point: any) => `L ${point.x} ${point.y}`)
            .join(" ") +
          " Z"
        );
      })
      .filter(Boolean)
      .join(" ");
  };

  const getOrCreateClipForSvg = (
    svg: SVGSVGElement,
    clipId: string,
    d: string,
  ) => {
    if (!svg || !d) return null;

    let defs = svg.querySelector("defs") as SVGDefsElement | null;
    if (!defs) {
      defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      svg.insertBefore(defs, svg.firstChild);
    }

    let clipPath = defs.querySelector(
      `#${clipId}`,
    ) as SVGClipPathElement | null;
    if (!clipPath) {
      clipPath = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "clipPath",
      );
      clipPath.setAttribute("id", clipId);
      clipPath.setAttribute("clipPathUnits", "userSpaceOnUse");
      defs.appendChild(clipPath);
    }

    clipPath.setAttribute("clip-rule", "evenodd");
    clipPath.style.clipRule = "evenodd";

    while (clipPath.firstChild) clipPath.removeChild(clipPath.firstChild);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("fill-rule", "evenodd");
    path.setAttribute("clip-rule", "evenodd");
    clipPath.appendChild(path);

    return clipPath;
  };

  // ======================================================
  // DAS CLIP — renderer-safe per SVG
  // API dasFilter membatasi feature yang dikirim backend, tetapi
  // satu polygon kerawanan bisa memotong batas DAS. Karena itu
  // geometry yang dirender juga dipotong mengikuti geometry DAS.
  // ======================================================
  const selectedDasClipIdRef = useRef<string>(
    `simitidasClip_${Math.random().toString(36).slice(2, 10)}`,
  );
  const selectedDasClipListenersRef = useRef<any[]>([]);

  const isDasClipLayer = (tableName: string) =>
    BENCANA_FOCUS_LAYERS.has(String(tableName));

  const applyDasClipToLayer = (
    tableName: string,
    dasList: Array<any> = selectedDas,
  ) => {
    if (!isDasClipLayer(String(tableName))) return;
    const layerGroup = layerGroupsRef.current[tableName];
    const map = mapInstanceRef.current;
    if (!layerGroup || !map || !dasList.length) return;

    const d = buildBencanaClipD(map, dasList);
    if (!d) return;

    try {
      layerGroup.eachLayer((layer: any) => {
        const path = layer?._path as SVGPathElement | undefined;
        const svg = path?.ownerSVGElement;
        if (!path || !svg) return;

        const safeId = String(
          layer?._leaflet_id ||
            `${tableName}_${Math.random().toString(36).slice(2, 8)}`,
        ).replace(/[^a-zA-Z0-9_-]/g, "_");
        const clipId = `${selectedDasClipIdRef.current}_${safeId}`;
        const clipPath = getOrCreateClipForSvg(svg, clipId, d);
        if (!clipPath) return;

        path.setAttribute("clip-path", `url(#${clipId})`);
      });
    } catch (error) {
      console.warn("SIMITI: gagal memasang clip DAS:", error);
    }
  };

  const clearSelectedDasClip = () => {
    const map = mapInstanceRef.current;

    selectedDasClipListenersRef.current.forEach(({ event, handler }: any) => {
      try {
        map?.off?.(event, handler);
      } catch {}
    });
    selectedDasClipListenersRef.current = [];

    BENCANA_FOCUS_LAYERS.forEach((tableName) => {
      const layerGroup = layerGroupsRef.current[tableName];
      if (!layerGroup) return;
      try {
        layerGroup.eachLayer((layer: any) => {
          if (layer?._path?.removeAttribute) {
            layer._path.removeAttribute("clip-path");
          }
        });
      } catch {}
    });

    try {
      const overlayPane = map?.getPanes?.()?.overlayPane;
      overlayPane?.querySelectorAll?.("svg defs").forEach((defs: any) => {
        defs
          .querySelectorAll?.(
            `clipPath[id^="${selectedDasClipIdRef.current}_"]`,
          )
          .forEach((node: any) => node.remove());
      });
    } catch {}
  };

  const syncSelectedDasClip = (
    dasList: Array<any>,
    forceLayerNames: string[] = [],
  ) => {
    const map = mapInstanceRef.current;
    if (!map || !window.L) return;

    clearSelectedDasClip();
    if (!dasList.length) return;

    const activeNames = new Set([
      ...Array.from(activeLayersRef.current).map((name) => String(name)),
      ...forceLayerNames.map((name) => String(name)),
    ]);

    const activeKerawanan = Array.from(activeNames).filter((name) =>
      isDasClipLayer(name),
    );
    if (!activeKerawanan.length) return;

    const updateClip = () => {
      activeKerawanan.forEach((tableName) =>
        applyDasClipToLayer(tableName, dasList),
      );
    };

    updateClip();

    ["zoom", "move", "resize", "zoomend", "moveend"].forEach((event) => {
      map.on(event, updateClip);
      selectedDasClipListenersRef.current.push({ event, handler: updateClip });
    });

    console.log("🎯 SIMITI DAS clip aktif:", {
      das: dasList.map((das: any) => das?.nama_das || das?.label),
      layers: activeKerawanan,
    });
  };

  const applyBencanaClipToLayer = (
    tableName: string,
    areas: Array<any> = selectedAreas,
  ) => {
    const layerGroup = layerGroupsRef.current[tableName];
    const map = mapInstanceRef.current;

    if (!layerGroup || !map || !areas?.length) return;

    const d = buildBencanaClipD(map, areas);
    if (!d) return;

    try {
      // WMS TILE CLIP — setiap tile dipotong mengikuti polygon administrasi.
      if (
        typeof layerGroup.getContainer === "function" &&
        typeof layerGroup.on === "function"
      ) {
        const container = layerGroup.getContainer?.();
        const mapContainer = map.getContainer?.();

        (layerGroup as any)._simitiAdminClipAreas = areas;

        const clipWmsTile = (imageElement: HTMLImageElement) => {
          if (!imageElement || !mapContainer) return;

          const currentAreas =
            (layerGroup as any)._simitiAdminClipAreas || areas;

          const containerRect = mapContainer.getBoundingClientRect();
          const tileRect = imageElement.getBoundingClientRect();

          const tileLeft = tileRect.left - containerRect.left;
          const tileTop = tileRect.top - containerRect.top;

          const imagePath = currentAreas
            .flatMap((area: any) =>
              areaGeomToLatLngRings(area?.geom),
            )
            .map((ring: number[][]) => {
              const points = ring
                .map(([lat, lng]) => {
                  const point = map.latLngToContainerPoint([lat, lng]);

                  return {
                    x: point.x - tileLeft,
                    y: point.y - tileTop,
                  };
                })
                .filter((point: any) =>
                  Number.isFinite(point.x) &&
                  Number.isFinite(point.y),
                );

              if (points.length < 3) return "";

              return (
                `M ${points[0].x} ${points[0].y} ` +
                points.slice(1)
                  .map((point: any) => `L ${point.x} ${point.y}`)
                  .join(" ") +
                " Z"
              );
            })
            .filter(Boolean)
            .join(" ");

          if (!imagePath) return;

          const cssClip = `path("${imagePath}")`;

          imageElement.style.setProperty("clip-path", cssClip);
          imageElement.style.setProperty("-webkit-clip-path", cssClip);
          imageElement.dataset.simitiAdminClip =
            selectedAreaBencanaClipIdRef.current;
        };

        const updateWmsTiles = () => {
          const tileContainer = layerGroup.getContainer?.();
          if (!tileContainer) return;

          tileContainer
            .querySelectorAll("img.leaflet-tile")
            .forEach((tile: HTMLImageElement) => {
              if (tile.complete && tile.naturalWidth > 0) {
                clipWmsTile(tile);
              }
            });
        };

        let tileHandler = (event: any) => {
          const tile = event?.tile as HTMLImageElement | undefined;
          if (tile) clipWmsTile(tile);
        };

        const previousHandler =
          (layerGroup as any)._simitiAdminTileClipHandler;

        if (previousHandler) {
          layerGroup.off("tileload", previousHandler);
        }

        (layerGroup as any)._simitiAdminTileClipHandler = tileHandler;
        layerGroup.on("tileload", tileHandler);

        updateWmsTiles();

        // Simpan fungsi agar dapat dipanggil lagi setelah map bergerak.
        (layerGroup as any)._simitiAdminUpdateTileClip = updateWmsTiles;
      } else {
        // IMAGE OVERLAY / RASTER lama tetap dipertahankan.
        const imageElement = layerGroup.getElement?.() as
          | HTMLImageElement
          | undefined;

        if (imageElement) {
          const bounds = layerGroup.getBounds?.();

          if (bounds) {
            const northWest = bounds.getNorthWest();
            const origin = map.latLngToLayerPoint(northWest);

            const imagePath = areas
              .flatMap((area: any) =>
                areaGeomToLatLngRings(area?.geom),
              )
              .map((ring: number[][]) => {
                const points = ring
                  .map(([lat, lng]) => {
                    const point = map.latLngToLayerPoint([lat, lng]);
                    return {
                      x: point.x - origin.x,
                      y: point.y - origin.y,
                    };
                  })
                  .filter((point: any) =>
                    Number.isFinite(point.x) &&
                    Number.isFinite(point.y),
                  );

                if (points.length < 3) return "";

                return (
                  `M ${points[0].x} ${points[0].y} ` +
                  points.slice(1)
                    .map((point: any) => `L ${point.x} ${point.y}`)
                    .join(" ") +
                  " Z"
                );
              })
              .filter(Boolean)
              .join(" ");

            if (imagePath) {
              const cssClip = `path("${imagePath}")`;
              imageElement.style.setProperty("clip-path", cssClip);
              imageElement.style.setProperty("-webkit-clip-path", cssClip);
              imageElement.dataset.simitiAdminClip =
                selectedAreaBencanaClipIdRef.current;
            }
          }
        }
      }

      // VECTOR / GEOJSON
      // Gunakan clipping renderer SVG yang sudah ada. Ini menghindari operasi
      // Turf Intersection massal yang berat pada ribuan feature risiko.
      layerGroup.eachLayer?.((layer: any) => {
        const path = layer?._path as SVGPathElement | undefined;
        const svg = path?.ownerSVGElement;

        if (!path || !svg) return;

        const safeId = String(
          layer?._leaflet_id ||
            `${tableName}_${Math.random().toString(36).slice(2, 8)}`,
        ).replace(/[^a-zA-Z0-9_-]/g, "_");

        const clipId =
          `${selectedAreaBencanaClipIdRef.current}_${safeId}`;

        const clipPath = getOrCreateClipForSvg(svg, clipId, d);

        if (!clipPath) return;

        path.setAttribute("clip-path", `url(#${clipId})`);
      });
    } catch (error) {
      console.warn(
        "SIMITI: gagal memasang clipping administrasi:",
        tableName,
        error,
      );
    }
  };
  // ============================================================
  // SIMITI - CLIP BENCANA KE POLYGON YANG DIKLIK LANGSUNG
  // Mendukung KHDTK maupun polygon non-risiko yang dipilih di peta.
  // ============================================================
  const applyBencanaClipToSelectedKhdtk = (tableName: string) => {
    if (!BENCANA_FOCUS_LAYERS.has(String(tableName))) return;

    const selected = selectedSpatialFeatureRef.current;
    const layerGroup = layerGroupsRef.current[tableName];
    const map = mapInstanceRef.current;

    if (!selected?.feature?.geometry || !layerGroup || !map) return;

    // KHDTK dipotong langsung pada GeoJSON dengan Turf sebelum dirender.
    // Jangan menambahkan SVG clip-path berbasis layerPoint karena koordinat
    // SVG Leaflet memiliki transform lokal; clip-path tersebut dapat
    // menyembunyikan seluruh fill polygon pada sebagian zoom/viewport.
    if (selected.layerType === "khdtk") {
      console.log("SIMITI: KHDTK clipping memakai geometri hasil Turf; SVG clip dilewati", tableName);
      return;
    }

    const geometryType = selected.feature.geometry.type;
    if (geometryType !== "Polygon" && geometryType !== "MultiPolygon") return;

    // WMS risiko banjir memakai clipping tile, bukan eachLayer/SVG.
    if (
      tableName === "risiko_banjir" &&
      selected.layerType === "admin-village"
    ) {
      applyBencanaClipToLayer("risiko_banjir", [{
        geom: selected.feature.geometry,
        level: "kelurahan",
      }]);

      return;
    }

    // Proteksi: tile layer tidak memiliki eachLayer().
    if (typeof (layerGroup as any).eachLayer !== "function") {
      console.warn(
        "SIMITI: clipping SVG dilewati karena layer bukan LayerGroup",
        { tableName, layerType: selected.layerType },
      );
      return;
    }
    try {
      const d = buildBencanaClipD(map, [{ geom: selected.feature.geometry }]);
      if (!d) return;

      layerGroup.eachLayer((layer: any) => {
        const path = layer?._path as SVGPathElement | undefined;
        const svg = path?.ownerSVGElement;
        if (!path || !svg) return;

        const safeId = String(
          layer?._leaflet_id ||
            `${tableName}_${Math.random().toString(36).slice(2, 8)}`,
        ).replace(/[^a-zA-Z0-9_-]/g, "_");
        const clipId = `${selectedAreaBencanaClipIdRef.current}_selected_${safeId}`;
        const clipPath = getOrCreateClipForSvg(svg, clipId, d);
        if (!clipPath) return;

        path.setAttribute("clip-path", `url(#${clipId})`);
      });

      console.log("SIMITI: risiko di-clip ke polygon peta terpilih:", {
        layerType: selected.layerType,
        tableName,
        name:
          selected.feature?.properties?.namobj ||
          selected.feature?.properties?.kel_desa ||
          selected.feature?.properties?.nama ||
          selected.feature?.properties?.name ||
          "Polygon terpilih",
      });
    } catch (error) {
      console.warn("SIMITI: gagal clip risiko ke polygon terpilih:", error);
    }
  };
  const syncSelectedSpatialFeatureBencanaClip = () => {
    const map = mapInstanceRef.current;
    selectedSpatialFeatureClipListenersRef.current.forEach(({ event, handler }: any) => {
      try { map?.off?.(event, handler); } catch {}
    });
    selectedSpatialFeatureClipListenersRef.current = [];

    // DAS selalu menjadi prioritas tertinggi.
    if (selectedDas.length > 0) return;

    const selected = selectedSpatialFeatureRef.current;
    if (!map || !selected?.feature?.geometry) return;

    const update = () => {
      Array.from(activeLayersRef.current).forEach((activeName) => {
        if (!BENCANA_FOCUS_LAYERS.has(String(activeName))) return;

        if (
          selected.layerType === "admin-village" &&
          String(activeName) === "risiko_banjir"
        ) {
          applyBencanaClipToLayer("risiko_banjir", [{
            geom: selected.feature.geometry,
            level: "kelurahan",
          }]);
          return;
        }

        applyBencanaClipToSelectedKhdtk(String(activeName));
      });

    };

    update();
    ["zoom", "move", "resize", "zoomend", "moveend"].forEach((event) => {
      map.on(event, update);
      selectedSpatialFeatureClipListenersRef.current.push({ event, handler: update });
    });
  };

  const removeBencanaClipFromLayers = () => {
    const clipPrefix = selectedAreaBencanaClipIdRef.current;

    Object.entries(layerGroupsRef.current).forEach(
      ([tableName, layerGroup]: [string, any]) => {
        if (!layerGroup) return;

        try {
          // Bersihkan semua tile WMS yang pernah diberi clip.
          const tileHandler =
            (layerGroup as any)._simitiAdminTileClipHandler;

          if (tileHandler) {
            layerGroup.off?.("tileload", tileHandler);
            delete (layerGroup as any)._simitiAdminTileClipHandler;
          }

          delete (layerGroup as any)._simitiAdminClipAreas;
          delete (layerGroup as any)._simitiAdminUpdateTileClip;

          const tileContainer = layerGroup.getContainer?.();

          tileContainer
            ?.querySelectorAll?.("img.leaflet-tile")
            .forEach((tile: HTMLImageElement) => {
              if (tile.dataset?.simitiAdminClip === clipPrefix) {
                tile.style.removeProperty("clip-path");
                tile.style.removeProperty("-webkit-clip-path");
                delete tile.dataset.simitiAdminClip;
              }
            });

          // Bersihkan raster ImageOverlay lama.
          const imageElement = layerGroup.getElement?.() as
            | HTMLImageElement
            | undefined;

          if (
            imageElement?.dataset?.simitiAdminClip === clipPrefix
          ) {
            imageElement.style.removeProperty("clip-path");
            imageElement.style.removeProperty("-webkit-clip-path");
            delete imageElement.dataset.simitiAdminClip;
          }

          // Bersihkan vector hanya jika clip berasal dari administrasi.
          layerGroup.eachLayer?.((layer: any) => {
            const path = layer?._path as
              | SVGPathElement
              | undefined;

            if (!path) return;

            const currentClip = path.getAttribute("clip-path") || "";

            if (currentClip.includes(`url(#${clipPrefix}_`)) {
              path.removeAttribute("clip-path");
            }
          });
        } catch (error) {
          console.warn(
            "SIMITI: gagal membersihkan clipping:",
            tableName,
            error,
          );
        }
      },
    );
  };
  const clearSelectedAreaBencanaClip = () => {
    const map = mapInstanceRef.current;

    selectedAreaBencanaClipListenersRef.current.forEach(
      ({ event, handler }: any) => {
        try {
          map?.off?.(event, handler);
        } catch {}
      },
    );
    selectedAreaBencanaClipListenersRef.current = [];

    removeBencanaClipFromLayers();

    // Hapus clipPath SIMITI dari semua SVG renderer yang digunakan map.
    try {
      const overlayPane = map?.getPanes?.()?.overlayPane;
      overlayPane?.querySelectorAll?.("svg defs").forEach((defs: any) => {
        defs
          .querySelectorAll?.(
            `clipPath[id^="${selectedAreaBencanaClipIdRef.current}_"]`,
          )
          .forEach((node: any) => node.remove());
      });
    } catch {}

    selectedAreaBencanaClipPathRef.current = null;
  };

  const syncSelectedAreaBencanaClip = (
    areas: Array<any>,
    forceLayerNames: string[] = [],
  ) => {
    const map = mapInstanceRef.current;
    if (!map || !window.L) return;

    // KHDTK adalah batas spasial yang lebih spesifik daripada administrasi.
    // Jangan pernah memasang ulang clipping provinsi/kabupaten setelah KHDTK dipilih.
    const activeKhdtkFocus = selectedSpatialFeatureRef.current;
    if (
      activeKhdtkFocus?.layerType === "khdtk" &&
      activeKhdtkFocus?.feature?.geometry
    ) {
      clearSelectedAreaBencanaClip();
      syncSelectedSpatialFeatureBencanaClip();
      return;
    }

    clearSelectedAreaBencanaClip();

    if (!areas.length) return;

    const effectiveAreas = getDeepestSelectedAdminAreas(areas);
    if (!effectiveAreas.length) return;

    const activeLayerNames = new Set([
      ...Array.from(activeLayersRef.current).map((name) => String(name)),
      ...forceLayerNames.map((name) => String(name)),
    ]);

    const updateClip = () => {
      activeLayerNames.forEach((tableName) => {
        if (layerGroupsRef.current[tableName]) {
          applyBencanaClipToLayer(tableName, effectiveAreas);
        }
      });
    };

    selectedAreaBencanaClipPathRef.current = {
      areas: effectiveAreas,
      updateClip,
    };

    // Terapkan clipping langsung pada semua layer yang sudah aktif.
    updateClip();

    // Hitung ulang koordinat setelah peta berubah.
    ["zoom", "move", "resize", "zoomend", "moveend"].forEach(
      (event) => {
        map.on(event, updateClip);

        selectedAreaBencanaClipListenersRef.current.push({
          event,
          handler: updateClip,
        });
      },
    );

    console.log("SIMITI: clipping administrasi seluruh layer aktif", {
      layers: Array.from(activeLayerNames),
      areas: effectiveAreas.map((area: any) => area?.label),
    });
  };
  // Kawasan Hutan memakai GeoJSON lokal SIMITI/PostGIS.
  // Frontend tidak lagi mengakses MapServer atau API SIGAP.

  // Normalisasi ID layer UI -> nama layer backend.
  // KHDTK di menu menggunakan ID 103, sedangkan endpoint backend menggunakan "khdtk".
  const normalizeLayerApiName = (tableName: string): string => {
    const aliases: Record<string, string> = {
      "103": "khdtk",
    };
    return aliases[tableName] || tableName;
  };

  const resolveUiLayerName = (tableName: string): string => {
    const key = String(tableName);
    const sources: any[][] = [
      availableLayers.kerawanan || [],
      availableLayers.mitigasiAdaptasi || [],
      availableLayers.lainnya || [],
      availableLayers.kejadian || [],
      layerData.kerawanan || [],
      layerData.mitigasiAdaptasi || [],
      layerData.lainnya || [],
      layerData.kejadian || [],
    ];
    for (const items of sources) {
      const found = items.find(
        (item: any) =>
          String(item?.id ?? "") === key || String(item?.name ?? "") === key,
      );
      if (found?.name) return String(found.name);
    }
    return key;
  };

  const loadLayerInBounds = async (
    tableName: string,
    customBounds?: [[number, number], [number, number]],
  ) => {
    // Layer kejadian otomatis bukan tabel GIS. Jangan pernah kirim ID/label
    // kejadian ke endpoint /api/layers/:name/geojson; gunakan endpoint khusus.
    const stableLayerKey = String(tableName);
    if (stableLayerKey.startsWith("kejadian_")) {
      const savedMeta = activeKejadianLayers.get(stableLayerKey);
      const yearMatch = stableLayerKey.match(/_(20\d{2})$/);
      const year = savedMeta?.year ?? (yearMatch ? Number(yearMatch[1]) : NaN);
      const category = savedMeta?.category ?? stableLayerKey
        .replace(/^kejadian_/, "")
        .replace(/_20\d{2}$/, "")
        .replace(/_/g, " ");
      if (Number.isFinite(year)) {
        await loadKejadianLayer(stableLayerKey, year, category || undefined);
        return;
      }
      console.warn("ID layer kejadian tidak memiliki tahun yang valid:", stableLayerKey);
      return;
    }

    if (!mapInstanceRef.current || !window.L) {
      console.log("Map not ready");
      return;
    }

    const originalLayerName = tableName;
    const resolvedLayerName = resolveUiLayerName(tableName);
    if (resolvedLayerName !== tableName) {
      console.log(`🔎 Resolve layer UI: ${tableName} -> ${resolvedLayerName}`);
    }
    tableName = resolvedLayerName;
    const apiLayerName = normalizeLayerApiName(tableName);
    if (apiLayerName !== tableName) {
      console.log(`🔗 Layer alias: ${tableName} -> ${apiLayerName}`);
    }

    // Setelah request API dibentuk, gunakan nama backend untuk seluruh pemrosesan
    // GeoJSON agar branch KHDTK (`tableName === "khdtk"`) tetap bekerja.
    tableName = apiLayerName;

    try {
      const requestId = (layerRequestSeqRef.current[tableName] || 0) + 1;
      layerRequestSeqRef.current[tableName] = requestId;

      setIsLoadingLayer(true);
      setLoadingLayerNames((prev) => new Set([...prev, tableName]));
      setLayerError("");

      const mapAtRequest = mapInstanceRef.current;
      const zoom = mapAtRequest.getZoom();
      let boundsString = "";

      const viewport = mapAtRequest.getBounds();
      const viewportBounds: [[number, number], [number, number]] = [
        [viewport.getSouth(), viewport.getWest()],
        [viewport.getNorth(), viewport.getEast()],
      ];
      const activeSpatialFocus = selectedSpatialFeatureRef.current;
      let boundsToUse = customBounds || currentBounds || viewportBounds;
      if (activeSpatialFocus?.layerType === "khdtk" && activeSpatialFocus?.feature?.geometry) {
        try {
          const [minLng, minLat, maxLng, maxLat] = turfBbox(activeSpatialFocus.feature as any);
          if ([minLng, minLat, maxLng, maxLat].every(Number.isFinite)) {
            boundsToUse = [[minLat, minLng], [maxLat, maxLng]];
          }
        } catch (boundsError) {
          console.warn("SIMITI: gagal menghitung bounds KHDTK:", boundsError);
        }
      }

      if (boundsToUse) {
        const [[minLat, minLng], [maxLat, maxLng]] = boundsToUse;
        boundsString = `${minLat},${minLng},${maxLat},${maxLng}`;
      } else {
        boundsString = "-11,95,6,141";
      }

      // SIMITI_WMS_RISIKO_BANJIR_ADMIN
      // Nasional: WMS pada zoom rendah.
      // Administrasi: WMS memakai INTERSECTS pada geometri wilayah terpilih.
      // DAS dan fokus KHDTK tetap memakai jalur lama.
      const hasAdminVillageWmsFocus =
        activeSpatialFocus?.layerType === "admin-village" &&
        Boolean(activeSpatialFocus?.feature?.geometry);

      const riskBanjirWmsAreas = hasAdminVillageWmsFocus
        ? [{
            geom: activeSpatialFocus.feature.geometry,
            level: "kelurahan",
          }]
        : selectedAreas;

      // Kawasan Hutan nasional memakai WMS agar cakupan nasional tidak
      // dibatasi jumlah feature GeoJSON. Saat provinsi/administrasi dipilih,
      // gunakan GeoJSON agar setiap polygon dapat diwarnai langsung dengan
      // Leaflet setStyle saat kelas legenda diklik (pola layer vektor).
      const isKawasanHutanWmsContext =
        tableName === "kawasan_hutan" &&
        selectedAreas.length === 0 &&
        selectedDas.length === 0 &&
        activeSpatialFocus?.layerType !== "khdtk";

      if (isKawasanHutanWmsContext) {
        const kawasanHutanCqlFilter = buildRiskBanjirWmsCqlFilter(
          null,
          riskBanjirWmsAreas,
          "geom_valid",
          "kelas",
        );

        if (kawasanHutanCqlFilter) {
          const geoserverWmsUrl = String(
            import.meta.env.VITE_GEOSERVER_WMS_URL ||
            "/geoserver/simiti/wms"
          ).trim();

          if (layerGroupsRef.current[tableName]) {
            safeRemoveMapLayer(layerGroupsRef.current[tableName]);
            delete layerGroupsRef.current[tableName];
          }
          layerCacheRef.current.delete(tableName);

          // WMS nasional tidak mengembalikan feature GeoJSON untuk legenda.
          // Isi legenda dari daftar kelas resmi dan kirim SLD yang sama ke GeoServer.
          setKawasanHutanData(
            KAWASAN_HUTAN_LEGEND.map((item) => ({
              fungsikws: item.fungsikws,
              deskripsi_domain: item.deskripsi_domain,
              color: item.color,
            })),
          );
          colorMappingRef.current.kawasanHutan.clear();
          KAWASAN_HUTAN_LEGEND.forEach((item) => {
            item.codes.forEach((code) => {
              colorMappingRef.current.kawasanHutan.set(code, item.color);
            });
          });

          const kawasanHutanWmsLayer = window.L.tileLayer.wms(geoserverWmsUrl, {
            layers: "simiti:kawasan_hutan",
            styles: "",
            format: "image/png",
            transparent: true,
            version: "1.1.1",
            srs: "EPSG:4326",
            tiled: false,
            uppercase: true,
            CQL_FILTER: kawasanHutanCqlFilter,
          });

          // Catat error tile dari GeoServer agar kegagalan SLD tidak diam-diam.
          kawasanHutanWmsLayer.on("tileerror", (event: any) => {
            console.error("SIMITI: tile WMS Kawasan Hutan gagal dimuat", {
              error: event?.error?.message || event?.message || "WMS tile error",
              tile: event?.tile?.src,
            });
          });

          layerGroupsRef.current[tableName] = kawasanHutanWmsLayer;
          kawasanHutanWmsLayer.addTo(mapAtRequest);
          console.log("SIMITI: Kawasan Hutan Nasional menggunakan GeoServer WMS", {
            url: geoserverWmsUrl,
            layer: "simiti:kawasan_hutan",
            filter: kawasanHutanCqlFilter,
            zoom,
          });
          return;
        }

        console.warn(
          "SIMITI: filter WMS Kawasan Hutan tidak dapat dibentuk; memakai jalur GeoJSON sebagai fallback."
        );
      }

      // SIMITI_WMS_SUMUR_BOR_REHABILITASI_NASIONAL
      // Nasional memakai WMS; filter wilayah/DAS/fokus tetap memakai GeoJSON.
      const isNationalSumurBorWmsContext =
        tableName === "sumur_bor" &&
        selectedAreas.length === 0 &&
        selectedDas.length === 0 &&
        !activeSpatialFocus?.feature?.geometry;

      const isNationalRehabilitasiHutanWmsContext =
        tableName === "rehabilitasi_hutan" &&
        selectedAreas.length === 0 &&
        selectedDas.length === 0 &&
        !activeSpatialFocus?.feature?.geometry;

      if (
        isNationalSumurBorWmsContext ||
        isNationalRehabilitasiHutanWmsContext
      ) {
        const geoserverWmsUrl = String(
          import.meta.env.VITE_GEOSERVER_WMS_URL ||
          "/geoserver/simiti/wms"
        ).trim();

        if (layerGroupsRef.current[tableName]) {
          safeRemoveMapLayer(layerGroupsRef.current[tableName]);
          delete layerGroupsRef.current[tableName];
        }

        layerCacheRef.current.delete(tableName);

        const isSumurBor = tableName === "sumur_bor";
        const wmsLayerName = isSumurBor
          ? "simiti:vw_sumur_bor_wms"
          : "simiti:vw_rehabilitasi_hutan_wms";

        if (!isSumurBor) {
          setRehabilitasiHutanData([]);
          colorMappingRef.current.rehabilitasiHutan.clear();
        }

        const nationalWmsLayer = window.L.tileLayer.wms(
          geoserverWmsUrl,
          {
            layers: wmsLayerName,
            styles: "",
            format: "image/png",
            transparent: true,
            version: "1.1.1",
            srs: "EPSG:4326",
            tiled: false,
            uppercase: true,
          }
        );

        nationalWmsLayer.on("tileerror", (event: any) => {
          console.error(
            `SIMITI: tile WMS ${tableName} gagal dimuat`,
            {
              layer: wmsLayerName,
              error:
                event?.error?.message ||
                event?.message ||
                "WMS tile error",
              tile: event?.tile?.src,
            }
          );
        });

        layerGroupsRef.current[tableName] = nationalWmsLayer;
        nationalWmsLayer.addTo(mapAtRequest);

        console.log(
          `SIMITI: ${tableName} menggunakan GeoServer WMS nasional`,
          {
            url: geoserverWmsUrl,
            layer: wmsLayerName,
            zoom,
          }
        );

        return;
      }

      // SIMITI_WMS_GEOLOGI_NASIONAL
      // Nasional menggunakan WMS; konteks administrasi/DAS/KHDTK
      // tetap mempertahankan jalur GeoJSON lama.
      const isNationalGeologiWmsContext =
        tableName === "geologi" &&
        selectedAreas.length === 0 &&
        selectedDas.length === 0 &&
        activeSpatialFocus?.layerType !== "khdtk" &&
        !activeSpatialFocus?.feature?.geometry;

      if (isNationalGeologiWmsContext) {
        const geoserverWmsUrl = String(
          import.meta.env.VITE_GEOSERVER_WMS_URL ||
          "/geoserver/simiti/wms"
        ).trim();

        if (layerGroupsRef.current[tableName]) {
          safeRemoveMapLayer(layerGroupsRef.current[tableName]);
          delete layerGroupsRef.current[tableName];
        }

        layerCacheRef.current.delete(tableName);

        const geologiWmsLayer = window.L.tileLayer.wms(
          geoserverWmsUrl,
          {
            layers: "simiti:v_geologi_wms",
            styles: "",
            format: "image/png",
            transparent: true,
            version: "1.1.1",
            srs: "EPSG:4326",
            tiled: false,
          },
        );

        geologiWmsLayer.on("tileerror", (event: any) => {
          console.error("SIMITI: tile WMS Geologi gagal dimuat", {
            error: event?.error?.message || event?.message || "WMS tile error",
            tile: event?.tile?.src,
          });
        });

        layerGroupsRef.current[tableName] = geologiWmsLayer;
        geologiWmsLayer.addTo(mapAtRequest);

        await fetchGeologiData();

        console.log("SIMITI: Geologi Nasional menggunakan GeoServer WMS", {
          url: geoserverWmsUrl,
          layer: "simiti:v_geologi_wms",
          zoom,
        });

        return;
      }

      // Lahan Kritis nasional memakai GeoServer WMS agar seluruh polygon
      // dirender server-side tanpa terkena LIMIT GeoJSON (mis. 2.000 fitur).
      // Jika administrasi/DAS/KHDTK dipilih, alur GeoJSON lama tetap dipakai.
      const isNationalLahanKritisWmsContext =
        tableName === "lahan_kritis" &&
        selectedAreas.length === 0 &&
        selectedDas.length === 0 &&
        activeSpatialFocus?.layerType !== "khdtk" &&
        !activeSpatialFocus?.feature?.geometry;

      if (isNationalLahanKritisWmsContext) {
        const geoserverWmsUrl = String(
          import.meta.env.VITE_GEOSERVER_WMS_URL ||
          "/geoserver/simiti/wms"
        ).trim();

        if (layerGroupsRef.current[tableName]) {
          safeRemoveMapLayer(layerGroupsRef.current[tableName]);
          delete layerGroupsRef.current[tableName];
        }
        layerCacheRef.current.delete(tableName);

        // WMS nasional tidak mengembalikan feature GeoJSON untuk membentuk legenda.
        // Isi legenda dari rekap kelas lahan_kritis yang sudah diverifikasi di database.
        const lahanKritisNationalLegend = [
          { kritis: "Sangat Kritis", luas_ha: 4040475.34, color: "#8E24AA" },
          { kritis: "Kritis", luas_ha: 8704449.95, color: "#E53935" },
        ];
        setLahanKritisData(lahanKritisNationalLegend);
        colorMappingRef.current.lahanKritis.clear();
        lahanKritisNationalLegend.forEach((item) => {
          colorMappingRef.current.lahanKritis.set(item.kritis, item.color);
        });

        const lahanKritisWmsLayer = window.L.tileLayer.wms(geoserverWmsUrl, {
          // Nama layer mengikuti publikasi GeoServer workspace simiti.
          // Default Style diambil dari konfigurasi layer GeoServer.
          layers: "simiti:v_lahan_kritis_wms",
          styles: "",
          format: "image/png",
          transparent: true,
          version: "1.1.1",
          srs: "EPSG:4326",
          tiled: false,
        });

        lahanKritisWmsLayer.on("tileerror", (event: any) => {
          console.error("SIMITI: tile WMS Lahan Kritis Nasional gagal dimuat", {
            error: event?.error?.message || event?.message || "WMS tile error",
            tile: event?.tile?.src,
          });
        });

        layerGroupsRef.current[tableName] = lahanKritisWmsLayer;
        lahanKritisWmsLayer.addTo(mapAtRequest);

        setLoadingLayerNames((prev) => {
          const next = new Set(prev);
          next.delete(tableName);
          return next;
        });
        setIsLoadingLayer(loadingLayerNames.size > 1);

        console.log("SIMITI: Lahan Kritis Nasional menggunakan GeoServer WMS (tanpa LIMIT GeoJSON)", {
          url: geoserverWmsUrl,
          layer: "simiti:v_lahan_kritis_wms",
          zoom,
        });
        return;
      }

      // Penutupan Lahan 2024 nasional memakai GeoServer WMS.
      // GeoJSON tetap dipakai ketika administrasi/DAS/KHDTK dipilih agar
      // alur filter spasial lokal yang sudah ada tidak berubah.
      const isPenutupanLahan2024WmsContext =
        tableName === "penutupan_lahan_2024" &&
        selectedAreas.length === 0 &&
        selectedDas.length === 0 &&
        activeSpatialFocus?.layerType !== "khdtk" &&
        !activeSpatialFocus?.feature?.geometry;

      if (isPenutupanLahan2024WmsContext) {
        const geoserverWmsUrl = String(
          import.meta.env.VITE_GEOSERVER_WMS_URL ||
          "/geoserver/simiti/wms"
        ).trim();

        if (layerGroupsRef.current[tableName]) {
          safeRemoveMapLayer(layerGroupsRef.current[tableName]);
          delete layerGroupsRef.current[tableName];
        }
        layerCacheRef.current.delete(tableName);

        const penutupanLahan2024WmsLayer = window.L.tileLayer.wms(
          geoserverWmsUrl,
          {
            layers: "simiti:v_penutupan_lahan_2024_wms",
            // Gunakan Default Style yang sudah disetel pada layer GeoServer.
            styles: "",
            format: "image/png",
            transparent: true,
            version: "1.1.1",
            srs: "EPSG:4326",
            tiled: false,
          },
        );

        penutupanLahan2024WmsLayer.on("tileerror", (event: any) => {
          console.error("SIMITI: tile WMS Penutupan Lahan 2024 gagal dimuat", {
            error: event?.error?.message || event?.message || "WMS tile error",
            tile: event?.tile?.src,
          });
        });

        layerGroupsRef.current[tableName] = penutupanLahan2024WmsLayer;
        penutupanLahan2024WmsLayer.addTo(mapAtRequest);

        // Data ringkasan kelas tetap diambil melalui endpoint agregasi ringan;
        // geometri 437.000 polygon tidak lagi dikirim sebagai GeoJSON ke browser.
        const penutupanLahanLegendRows = await fetchPenutupanLahan2024Data();
        colorMappingRef.current.penutupanLahan2024.clear();
        penutupanLahanLegendRows.forEach((item: any) => {
          colorMappingRef.current.penutupanLahan2024.set(
            String(item.pl2024_id),
            item.color || tutupanLahanColors[item.deskripsi_domain] || "#999999",
          );
        });

        setLoadingLayerNames((prev) => {
          const next = new Set(prev);
          next.delete(tableName);
          return next;
        });
        setIsLoadingLayer(loadingLayerNames.size > 1);

        console.log("SIMITI: Penutupan Lahan 2024 Nasional menggunakan GeoServer WMS", {
          url: geoserverWmsUrl,
          layer: "simiti:v_penutupan_lahan_2024_wms",
          zoom,
          legendClasses: penutupanLahanLegendRows.length,
        });
        return;
      }

      // SIMITI_WMS_JENIS_TANAH_NASIONAL
      // Nasional menggunakan WMS agar 438 ribu polygon tidak dibatasi
      // pagination/limit GeoJSON. Administrasi, DAS, dan fokus spasial
      // tetap menggunakan jalur GeoJSON yang sudah ada.
      const isJenisTanahNationalWms =
        tableName === "jenis_tanah" &&
        selectedAreas.length === 0 &&
        selectedDas.length === 0 &&
        !activeSpatialFocus?.feature?.geometry;

      if (isJenisTanahNationalWms) {
        const geoserverWmsUrl = String(
          import.meta.env.VITE_GEOSERVER_WMS_URL ||
          "/geoserver/simiti/wms"
        ).trim();

        // Bersihkan layer lama agar tidak terjadi duplikasi.
        if (layerGroupsRef.current[tableName]) {
          safeRemoveMapLayer(layerGroupsRef.current[tableName]);
          delete layerGroupsRef.current[tableName];
        }

        layerCacheRef.current.delete(tableName);

        const jenisTanahWmsLayer = window.L.tileLayer.wms(
          geoserverWmsUrl,
          {
            layers: "simiti:v_jenis_tanah_wms",
            styles: "sld_jenis_tanah",
            format: "image/png",
            transparent: true,
            version: "1.1.1",
            srs: "EPSG:4326",
            tiled: false,
            uppercase: true,
          },
        );

        jenisTanahWmsLayer.on("tileerror", (event: any) => {
          console.error("SIMITI: tile WMS Jenis Tanah gagal dimuat", {
            error:
              event?.error?.message ||
              event?.message ||
              "WMS tile error",
            tile: event?.tile?.src,
          });
        });

        layerGroupsRef.current[tableName] = jenisTanahWmsLayer;
        jenisTanahWmsLayer.addTo(mapAtRequest);

        console.log(
          "SIMITI: Jenis Tanah Nasional menggunakan GeoServer WMS",
          {
            url: geoserverWmsUrl,
            layer: "simiti:v_jenis_tanah_wms",
            style: "generic",
            zoom,
          },
        );

        return;
      }
      const isVerifiedNationalHazardLayer =
        VERIFIED_NATIONAL_HAZARD_WMS_LAYERS.has(tableName);

      const isRiskBanjirWmsCandidate =
        (
          tableName === "risiko_banjir" ||
          tableName === "risiko_banjir_bandang" ||
          tableName === "risiko_kekeringan" ||
          tableName === "risiko_abrasi" ||
          tableName === "risiko_longsor" ||
          tableName === "risiko_karhutla" ||
          NATIONAL_HAZARD_WMS_LAYERS.has(tableName)
        ) &&
        selectedDas.length === 0 &&
        (
          isVerifiedNationalHazardLayer
            ? (
                selectedAreas.length > 0
                  ? activeSpatialFocus?.layerType !== "khdtk"
                  : activeSpatialFocus?.layerType !== "khdtk" &&
                    (
                      !activeSpatialFocus?.feature?.geometry ||
                      hasAdminVillageWmsFocus
                    )
              )
            : (
                selectedAreas.length > 0
                  ? activeSpatialFocus?.layerType !== "khdtk"
                  : hasAdminVillageWmsFocus ||
                    (!activeSpatialFocus?.feature?.geometry && zoom <= 5)
              )
        ) &&
        !(tableName === "risiko_karhutla" && selectedAreas.length > 0);

      const wmsGeometryColumn = "geom_valid";
      const wmsClassColumn =
        tableName === "rawan_erosi" ? "kls_a" : tableName === "rawan_longsor" ? "unsur" : "kelas";

      const riskBanjirWmsCqlFilter = isRiskBanjirWmsCandidate
        ? buildRiskBanjirWmsCqlFilter(
            selectedLegendKey,
            riskBanjirWmsAreas,
            wmsGeometryColumn,
            wmsClassColumn,
          )
        : null;
      console.log("SIMITI DEBUG WMS RISIKO BANJIR:", JSON.stringify({
        tableName,
        selectedDasCount: selectedDas.length,
        selectedAreasCount: selectedAreas.length,
        focusLayerType: activeSpatialFocus?.layerType,
        focusName:
          activeSpatialFocus?.feature?.properties?.namobj ||
          activeSpatialFocus?.feature?.properties?.nama ||
          activeSpatialFocus?.name,
        hasFocusGeometry: Boolean(activeSpatialFocus?.feature?.geometry),
        zoom,
        selectedLegendKey,
        isRiskBanjirWmsCandidate,
        riskBanjirWmsCqlFilter,
      }, null, 2));

      const isNationalRawanBanjirWms =
        isRiskBanjirWmsCandidate && Boolean(riskBanjirWmsCqlFilter);

      if (isRiskBanjirWmsCandidate && !riskBanjirWmsCqlFilter) {
        console.warn(
          "SIMITI: WMS dilewati karena filter administrasi tidak tersedia; memakai GeoJSON."
        );
      }

      if (isNationalRawanBanjirWms) {
        const geoserverWmsUrl = String(
          import.meta.env.VITE_GEOSERVER_WMS_URL ||
          "/geoserver/simiti/wms"
        ).trim();

        // Bersihkan layer lama agar tidak terjadi duplikasi.
        if (layerGroupsRef.current[tableName]) {
          safeRemoveMapLayer(layerGroupsRef.current[tableName]);
          delete layerGroupsRef.current[tableName];
        }

        layerCacheRef.current.delete(tableName);

        const wmsLayer = window.L.tileLayer.wms(geoserverWmsUrl, {
          layers: ({
            risiko_banjir_bandang: "simiti:vw_risiko_banjir_bandang_wms",
            risiko_abrasi: "simiti:vw_risiko_abrasi_wms",
            risiko_longsor: "simiti:vw_risiko_longsor_wms",
            risiko_karhutla: "simiti:vw_risiko_karhutla_repaired_wms",

            bahaya_abrasi_dan_gelombang_ekstrim: "simiti:bahaya_abrasi_dan_gelombang_ekstrim",
            bahaya_banjir_bandang: "simiti:bahaya_banjir_bandang",
            bahaya_banjir: "simiti:bahaya_banjir",
            bahaya_kekeringan: "simiti:bahaya_kekeringan",
            rawan_longsor: "simiti:rawan_longsor",
            rawan_limpasan: "simiti:vw_rawan_limpasan_wms",
            rawan_karhutla: "simiti:vw_rawan_karhutla_wms",
            rawan_erosi: "simiti:rawan_erosi",
          } as Record<string, string>)[tableName] || `simiti:${tableName}`,
          styles: tableName === "rawan_erosi" ? "rawan_erosi_style" : tableName === "bahaya_abrasi_dan_gelombang_ekstrim" ? "bahaya_abrasi_legend" : "",
          format: "image/png",
          transparent: true,
          version: "1.1.1",
          srs: "EPSG:4326",
          tiled: false,
          CQL_FILTER: riskBanjirWmsCqlFilter,
        });

        layerGroupsRef.current[tableName] = wmsLayer;
        wmsLayer.addTo(mapAtRequest);

        // Clip tile WMS risiko banjir mengikuti polygon desa terpilih.
        const selectedVillageForWms = selectedSpatialFeatureRef.current;

        if (
          selectedDas.length === 0 &&
          selectedVillageForWms?.layerType === "admin-village" &&
          selectedVillageForWms?.feature?.geometry
        ) {
          const villageClipAreas = [{
            geom: selectedVillageForWms.feature.geometry,
            level: "kelurahan",
          }];

          requestAnimationFrame(() => {
            applyBencanaClipToLayer(tableName, villageClipAreas);
          });

          console.log(
            "SIMITI: WMS risiko banjir memakai clipping polygon desa",
            {
              layer: tableName,
              name:
                selectedVillageForWms.feature?.properties?.kel_desa ||
                selectedVillageForWms.feature?.properties?.nama ||
                "Polygon desa terpilih",
            },
          );
        }

        // WMS hanya menggambar raster/peta; ia tidak mengirim feature GeoJSON
        // sehingga legenda kelas harus diisi dari endpoint agregasi backend.
        // Endpoint ini sudah tersedia di server.js dan tidak mengubah jalur
        // GeoJSON yang dipakai untuk filter administrasi maupun DAS.
        try {
          const token = getAuthToken();
          const legendHeaders: Record<string, string> = {
            Accept: "application/json",
          };
          if (token) legendHeaders.Authorization = `Bearer ${token}`;

          const legendResponse = await fetch(
            `${API_URL}/api/layers/${tableName}/statistics`,
            {
              method: "GET",
              headers: legendHeaders,
              credentials: "same-origin",
            },
          );
          if (!legendResponse.ok) {
            throw new Error(`HTTP ${legendResponse.status}`);
          }

          const legendPayload = await legendResponse.json();
          const legendRows = Array.isArray(legendPayload?.classes)
            ? legendPayload.classes
            : [];
          if (tableName === "rawan_limpasan" || tableName === "rawan_karhutla") {
            console.log("SIMITI: statistik legenda layer rawan diterima", {
              layer: tableName,
              success: legendPayload?.success,
              totalFeatures: legendPayload?.totalFeatures,
              classCount: legendRows.length,
              classes: legendRows.map((row: any) => row?.kelas),
            });
          }
          const fallbackRiskColor = getBencanaLayerColor(tableName);
          const legendItems = legendRows
            .filter((row: any) => {
              const kelas = String(row?.kelas ?? "").trim().toLowerCase();
              if (!kelas) return false;
              // Layer abrasi hanya memiliki dua kelas valid: Rendah dan Tinggi.
              if (tableName === "bahaya_abrasi_dan_gelombang_ekstrim") {
                return kelas === "rendah" || kelas === "tinggi";
              }
              return true;
            })
            .map((row: any) => {
              const kelas = String(row.kelas).trim();
              let color = (tableName === "risiko_banjir" || tableName === "risiko_banjir_bandang" || tableName === "risiko_abrasi") ? getRisikoBanjirClassColor(kelas, fallbackRiskColor) : (getExactRiskPaletteColor(tableName, kelas) || getRiskClassColor(kelas, fallbackRiskColor));
              if (tableName === "rawan_longsor") {
                color = rawanLongsorColors[kelas as keyof typeof rawanLongsorColors] || color;
              } else if (tableName === "rawan_limpasan") {
                color = rawanLimpasanColors[kelas as keyof typeof rawanLimpasanColors] || color;
              } else if (tableName === "rawan_karhutla") {
                color = rawanKarhutlaColors[kelas as keyof typeof rawanKarhutlaColors] || color;
              } else if (tableName === "bahaya_abrasi_dan_gelombang_ekstrim") {
                color = bahayaAbrasiColors[kelas] || color;
              } else if (
                tableName === "bahaya_banjir" ||
                tableName === "bahaya_banjir_bandang" ||
                tableName === "bahaya_kekeringan"
              ) {
                color = bahayaKelasColors[kelas] || color;
              }
              return {
                kelas,
                luas: Number(row.luasHa ?? 0) || 0,
                color,
              };
            })
            .sort((a: any, b: any) => {
              if (tableName !== "rawan_longsor") return 0;
              const aIndex = rawanLongsorClassOrder.indexOf(a.kelas);
              const bIndex = rawanLongsorClassOrder.indexOf(b.kelas);
              return (aIndex < 0 ? 999 : aIndex) - (bIndex < 0 ? 999 : bIndex);
            });

          // Isi state yang benar-benar dibaca oleh panel legenda masing-masing layer.
          // WMS tidak mengirim GeoJSON ke frontend, sehingga data legenda harus
          // dipetakan dari endpoint statistik ke state khusus layer tersebut.
          if (tableName === "bahaya_abrasi_dan_gelombang_ekstrim") {
            const abrasiOrder = ["Tinggi", "Rendah"];
            const abrasiItems = [...legendItems].sort(
              (a: any, b: any) =>
                abrasiOrder.indexOf(a.kelas) - abrasiOrder.indexOf(b.kelas),
            );
            setBahayaAbrasiData(abrasiItems);
            colorMappingRef.current.bahayaAbrasi.clear();
            abrasiItems.forEach((item: any) => {
              colorMappingRef.current.bahayaAbrasi.set(item.kelas, item.color);
            });
          } else if (tableName === "bahaya_banjir_bandang") {
            setBahayaBanjirBandangData(legendItems);
          } else if (tableName === "bahaya_banjir") {
            setBahayaBanjirData(legendItems);
          } else if (tableName === "bahaya_kekeringan") {
            setBahayaKekeringanData(legendItems);
          } else if (tableName === "rawan_erosi") {
            const erosiClassLabels: Record<string, string> = {
              "15": "<= 15 Ton/Ha/Tahun",
              "60": "> 15 - 60 Ton/Ha/Tahun",
              "180": "> 60 - 180 Ton/Ha/Tahun",
              "480": "> 180 - 480 Ton/Ha/Tahun",
              ">480": "> 480 Ton/Ha/Tahun",
            };

            const erosiOrder = [
              "> 480 Ton/Ha/Tahun",
              "> 180 - 480 Ton/Ha/Tahun",
              "> 60 - 180 Ton/Ha/Tahun",
              "> 15 - 60 Ton/Ha/Tahun",
              "<= 15 Ton/Ha/Tahun",
            ];

            const erosiItems = legendRows
              .map((row: any) => {
                const rawClass = String(row?.kelas ?? "").trim();
                const tingkat = erosiClassLabels[rawClass];

                return {
                  tingkat,
                  luas_ha: Number(row?.luasHa ?? 0) || 0,
                  color: tingkat
                    ? rawanErosiColors[tingkat as keyof typeof rawanErosiColors]
                    : "#808080",
                };
              })
              .filter((item: any) => Boolean(item.tingkat))
              .sort(
                (a: any, b: any) =>
                  erosiOrder.indexOf(a.tingkat) -
                  erosiOrder.indexOf(b.tingkat),
              );

            setRawanErosiData(erosiItems);

            colorMappingRef.current.rawanErosi.clear();
            erosiItems.forEach((item: any) => {
              colorMappingRef.current.rawanErosi.set(
                item.tingkat,
                item.color,
              );
            });

            console.log("SIMITI: legenda rawan erosi berhasil dimuat", {
              jumlahKelas: erosiItems.length,
              kelas: erosiItems.map((item: any) => item.tingkat),
            });
          } else if (tableName === "rawan_longsor") {
            setRawanLongsorData(legendItems.map((item: any) => ({
              tingkat: item.kelas, luas_ha: item.luas, color: item.color,
            })));
          } else if (tableName === "rawan_limpasan") {
            setRawanLimpasanData(legendItems.map((item: any) => ({
              tingkat: item.kelas, luas_ha: item.luas, color: item.color,
            })));
          } else if (tableName === "rawan_karhutla") {
            setRawanKarhutlaData(legendItems.map((item: any) => ({
              tingkat: item.kelas, luas_ha: item.luas, color: item.color,
            })));
          }

          // Data risiko_* tetap disimpan terpisah; jangan mencampur kelas
          // layer bahaya/rawan ke mapping warna risiko banjir.
          const riskColorMapping =
            ({
              risiko_banjir: colorMappingRef.current.risikoBanjir,
              risiko_banjir_bandang: colorMappingRef.current.risikoBanjirBandang,
              risiko_kekeringan: colorMappingRef.current.risikoKekeringan,
              risiko_abrasi: colorMappingRef.current.risikoAbrasi,
              risiko_longsor: colorMappingRef.current.risikoLongsor,
              risiko_karhutla: colorMappingRef.current.risikoKarhutla,
            } as Record<string, Map<string, string>>)[tableName];
          if (riskColorMapping) {
            setRisikoData((prev) => ({ ...prev, [tableName]: legendItems }));
            riskColorMapping.clear();
            legendItems.forEach((item: any) => {
              riskColorMapping.set(item.kelas, item.color);
            });
          }

          const layerColorMapping =
            ({
              bahaya_abrasi_dan_gelombang_ekstrim: colorMappingRef.current.bahayaAbrasi,
              bahaya_banjir_bandang: colorMappingRef.current.bahayaBanjirBandang,
              bahaya_banjir: colorMappingRef.current.bahayaBanjir,
              bahaya_kekeringan: colorMappingRef.current.bahayaKekeringan,
              rawan_longsor: colorMappingRef.current.rawanLongsor,
              rawan_limpasan: colorMappingRef.current.rawanLimpasan,
              rawan_karhutla: colorMappingRef.current.rawanKarhutla,
            } as Record<string, Map<string, string>>)[tableName];
          if (layerColorMapping) {
            layerColorMapping.clear();
            legendItems.forEach((item: any) => {
              layerColorMapping.set(item.kelas, item.color);
            });
          }
          // Pakai SLD yang sama untuk seluruh kelas agar warna WMS nasional
          // identik dengan kotak warna pada legenda.
          // Delapan view nasional memakai default SLD yang sudah
          // dipasang langsung pada layer GeoServer.
          // Layer risiko lama tetap menggunakan SLD dinamis aplikasi.
          // Semua layer risiko/kerawanan WMS menggunakan SLD berbasis kelas
          // yang dibangun dari warna legenda. Tidak lagi bergantung pada style
          // default GeoServer yang dapat menghasilkan warna berbeda.
          // Rawan Longsor nasional sudah memiliki SLD resmi di GeoServer.
          // Pertahankan style bawaan yang terbukti tampil pada request WMS awal.
          // SLD dinamis frontend tidak diterapkan untuk layer ini karena aturan
          // kelas hasil agregasi `kelas` dapat berbeda dari atribut WMS `unsur`;
          // menggantinya dapat membuat tile berikutnya kosong.
          if (tableName === "rawan_longsor") {
            (wmsLayer as any).setParams({
              CQL_FILTER: riskBanjirWmsCqlFilter,
            }, true);
            (wmsLayer as any).redraw?.();
            console.info("SIMITI: Rawan Longsor nasional mempertahankan SLD resmi GeoServer", {
              layer: "simiti:rawan_longsor",
              classColumn: "unsur",
              filter: riskBanjirWmsCqlFilter,
            });
          } else {
            (wmsLayer as any).setParams({
              styles: "",
              SLD_BODY:
                tableName === "bahaya_abrasi_dan_gelombang_ekstrim"
                  ? buildBahayaAbrasiSld()
                  : buildNationalRiskBanjirSld(
                      legendItems,
                      ({
                        risiko_banjir_bandang: "vw_risiko_banjir_bandang_wms",
                        risiko_abrasi: "vw_risiko_abrasi_wms",
                        risiko_longsor: "vw_risiko_longsor_wms",
                        risiko_karhutla: "vw_risiko_karhutla_repaired_wms",
                        rawan_limpasan: "vw_rawan_limpasan_wms",
                        rawan_karhutla: "vw_rawan_karhutla_wms",
                      } as Record<string, string>)[tableName] || tableName,
                      getRiskWmsClassColumn(tableName),
                    ),
              CQL_FILTER: riskBanjirWmsCqlFilter,
            }, true);
            (wmsLayer as any).redraw?.();
          }

          if (tableName === "bahaya_abrasi_dan_gelombang_ekstrim") {
            console.info("SIMITI: SLD khusus Bahaya Abrasi diterapkan", {
              layer: tableName,
              kelas: ["Rendah", "Tinggi"],
              warna: { Rendah: "#22C55E", Tinggi: "#EF4444" },
            });
          }

          console.log("SIMITI: legenda risiko banjir nasional berhasil dimuat", {
            jumlahKelas: legendItems.length,
            kelas: legendItems.map((item: any) => item.kelas),
          });
        } catch (legendError) {
          console.error(
            "SIMITI: gagal memuat agregasi legenda risiko banjir nasional:",
            legendError,
          );
          if (tableName === "bahaya_abrasi_dan_gelombang_ekstrim") {
            setBahayaAbrasiData([]);
            colorMappingRef.current.bahayaAbrasi.clear();
          } else if (tableName === "bahaya_banjir_bandang") setBahayaBanjirBandangData([]);
          else if (tableName === "bahaya_banjir") setBahayaBanjirData([]);
          else if (tableName === "bahaya_kekeringan") setBahayaKekeringanData([]);
          else if (tableName === "rawan_longsor") setRawanLongsorData([]);
          else if (tableName === "rawan_limpasan") setRawanLimpasanData([]);
          else if (tableName === "rawan_karhutla") setRawanKarhutlaData([]);
          else setRisikoData((prev) => ({ ...prev, [tableName]: [] }));
        }

        console.log("SIMITI: risiko banjir nasional menggunakan GeoServer WMS", {
          url: geoserverWmsUrl,
          zoom,
        });

        return;
      }
      // Build URL dengan filter administrasi/DAS
      let url = `${API_URL}/api/layers/${apiLayerName}/geojson?bounds=${encodeURIComponent(boundsString)}&zoom=${zoom}`;

      // Prioritas: DAS > Administrasi
      if (selectedDas.length > 0) {
        const dasNames = selectedDas.map((d) => d.nama_das);
        url += `&dasFilter=${encodeURIComponent(JSON.stringify(dasNames))}`;
        console.log(" Loading layer with DAS filtering:", tableName, dasNames);
      } else if (
        selectedAreas.length > 0 &&
        selectedSpatialFeatureRef.current?.layerType !== "khdtk"
      ) {
        const deepestAreas = getDeepestSelectedAdminAreas(selectedAreas);
        const adminLevel = deepestAreas[0]?.level;

        const adminCodes = deepestAreas
          .map((area: any) => {
            switch (adminLevel) {
              case "provinsi":
                return area.kode_prov;
              case "kabupaten":
                return area.kode_kk;
              case "kecamatan":
                return area.kode_kec;
              case "kelurahan":
                return area.kode_kd;
              default:
                return "";
            }
          })
          .filter((code: any) => Boolean(code && String(code).trim()));

        if (adminLevel && adminCodes.length > 0) {
          url += `&adminCodes=${encodeURIComponent(JSON.stringify(adminCodes))}`;
          url += `&adminLevel=${adminLevel}`;
        } else {
          console.warn(
            "Kode administrasi tidak tersedia untuk filter GeoJSON:",
            deepestAreas,
          );
        }

        console.log(
          " Loading layer with admin code filtering:",
          tableName,
          adminLevel,
          adminCodes,
        );
      }

      console.log(` Memuat layer: ${tableName}...`);

      // Jangan kirim "Authorization: Bearer " kosong.
      // Sejumlah middleware menganggap header Bearer kosong sebagai token invalid,
      // sehingga endpoint GeoJSON gagal walaupun layer bersifat publik.
      const authToken = getAuthToken();
      const requestHeaders: Record<string, string> = {
        Accept: "application/geo+json, application/json",
      };
      if (authToken) requestHeaders.Authorization = `Bearer ${authToken}`;

      const response = await fetch(url, {
        method: "GET",
        headers: requestHeaders,
        credentials: "same-origin",
      });

      const responseText = await response.text();
      let geojsonData: any;
      try {
        geojsonData = responseText ? JSON.parse(responseText) : null;
      } catch {
        throw new Error(
          `Respons API layer bukan JSON yang valid (HTTP ${response.status}).`,
        );
      }

      if (!response.ok) {
        const detail =
          geojsonData?.message ||
          geojsonData?.error ||
          response.statusText ||
          "Permintaan GeoJSON gagal";
        throw new Error(`HTTP ${response.status}: ${detail}`);
      }

      // Backend bisa mengembalikan FeatureCollection langsung atau membungkusnya
      // dalam properti data/geojson. Normalisasi sebelum diproses Leaflet.
      geojsonData =
        geojsonData?.type === "FeatureCollection"
          ? geojsonData
          : geojsonData?.geojson?.type === "FeatureCollection"
            ? geojsonData.geojson
            : geojsonData?.data?.type === "FeatureCollection"
              ? geojsonData.data
              : geojsonData;

      if (!geojsonData || !Array.isArray(geojsonData.features)) {
        throw new Error(
          `Format GeoJSON untuk "${tableName}" tidak sesuai. Periksa respons endpoint ${apiLayerName}/geojson.`,
        );
      }

      // PERFORMANCE HOTFIX:
      // Jangan melakukan Turf Intersection untuk setiap feature risiko saat
      // menerima GeoJSON. Dataset risiko dapat berisi ribuan polygon; operasi
      // overlay berulang pada main thread membuat browser tampak hang.
      // Geometri sumber dipertahankan. Batas administrasi diterapkan melalui
      // clipping renderer SVG/WMS yang sudah tersedia di applyBencanaClipToLayer.
      let adminGeometryClipApplied = false;

      // CLIP GEOMETRI SEBENARNYA: pecah MultiPolygon KHDTK menjadi Polygon
      // tunggal sebelum intersection. MultiPolygon gabungan dari beberapa
      // feature KHDTK kadang memiliki ring tumpang tindih dan membuat Turf
      // gagal menghasilkan geometri, sehingga polygon risiko tidak ter-render.
      const khdtkFocusForIntersection = selectedSpatialFeatureRef.current;
      if (
        BENCANA_FOCUS_LAYERS.has(String(tableName)) &&
        khdtkFocusForIntersection?.layerType === "khdtk" &&
        khdtkFocusForIntersection?.feature?.geometry
      ) {
        const focusGeometry = khdtkFocusForIntersection.feature.geometry;
        const focusPolygonGeometries: any[] =
          focusGeometry.type === "Polygon"
            ? [focusGeometry]
            : focusGeometry.type === "MultiPolygon"
              ? (focusGeometry.coordinates || []).map((coordinates: any) => ({
                  type: "Polygon", coordinates,
                }))
              : [];
        const focusPolygonFeatures = focusPolygonGeometries.map((geometry: any) => ({
          type: "Feature", properties: {}, geometry,
        }));
        const focusBounds = turfBbox(khdtkFocusForIntersection.feature as any);
        const clippedFeatures: any[] = [];
        let excludedFeatures = 0;
        let intersectionErrors = 0;

        for (const riskFeature of geojsonData.features) {
          const riskGeometry = riskFeature?.geometry;
          if (!["Polygon", "MultiPolygon"].includes(String(riskGeometry?.type))) {
            excludedFeatures++;
            continue;
          }
          try {
            const riskBounds = turfBbox(riskFeature as any);
            const outsideBounds =
              riskBounds[0] > focusBounds[2] || riskBounds[2] < focusBounds[0] ||
              riskBounds[1] > focusBounds[3] || riskBounds[3] < focusBounds[1];
            if (outsideBounds) {
              excludedFeatures++;
              continue;
            }

            const riskPolygonGeometries: any[] =
              riskGeometry.type === "Polygon"
                ? [riskGeometry]
                : (riskGeometry.coordinates || []).map((coordinates: any) => ({
                    type: "Polygon", coordinates,
                  }));
            const intersectionsForRisk: any[] = [];

            for (const riskPolygonGeometry of riskPolygonGeometries) {
              const riskPolygonFeature = {
                type: "Feature", properties: riskFeature.properties || {},
                geometry: riskPolygonGeometry,
              };
              for (const focusPolygonFeature of focusPolygonFeatures) {
                try {
                  const intersection = turfIntersect(
                    turfFeatureCollection([riskPolygonFeature, focusPolygonFeature]) as any,
                  );
                  if (
                    intersection?.geometry &&
                    ["Polygon", "MultiPolygon"].includes(String(intersection.geometry.type))
                  ) {
                    intersectionsForRisk.push({
                      ...riskFeature,
                      geometry: intersection.geometry,
                    });
                  }
                } catch (partError) {
                  intersectionErrors++;
                  console.warn("SIMITI: intersection potongan risiko-KHDTK gagal:", {
                    layer: tableName, featureId: riskFeature?.id, error: partError,
                  });
                }
              }
            }

            if (intersectionsForRisk.length) {
              clippedFeatures.push(...intersectionsForRisk);
            } else {
              excludedFeatures++;
            }
          } catch (intersectionError) {
            intersectionErrors++;
            console.warn("SIMITI: intersect risiko-KHDTK gagal:", tableName, riskFeature?.id, intersectionError);
          }
        }

        console.log("SIMITI: hasil clipping geometri risiko KHDTK", {
          layer: tableName,
          khdtk: khdtkFocusForIntersection.feature?.properties?.namobj || "KHDTK terpilih",
          before: geojsonData.features.length,
          focusParts: focusPolygonFeatures.length,
          after: clippedFeatures.length,
          excluded: excludedFeatures,
          intersectionErrors,
        });
        geojsonData = { ...geojsonData, features: clippedFeatures };
      }

      // Request ini sudah tidak relevan; jangan sentuh layer/map dengan data lama.
      if (
        layerRequestSeqRef.current[tableName] !== requestId ||
        mapInstanceRef.current !== mapAtRequest ||
        !isLeafletMapUsable(mapAtRequest)
      ) {
        console.log(
          `⏭️ Abaikan response lama/stale untuk ${tableName} (request #${requestId})`,
        );
        return;
      }

      console.log(
        "✅ GeoJSON data received for",
        tableName,
        ":",
        geojsonData.features?.length || 0,
        "features",
      );

      // Hapus layer lama
      if (layerGroupsRef.current[tableName]) {
        safeRemoveMapLayer(layerGroupsRef.current[tableName]);
      }

      if (!geojsonData.features || geojsonData.features.length === 0) {
        console.warn(" No features found for:", tableName);
        setLayerError(` Tidak ada data "${tableName}" di area yang dipilih.`);
        setTimeout(() => setLayerError(""), 5000);
        layerGroupsRef.current[tableName] = window.L.layerGroup();
        safeAddMapLayer(mapAtRequest, layerGroupsRef.current[tableName]);
        setLoadingLayerNames((prev) => {
          const next = new Set(prev);
          next.delete(tableName);
          return next;
        });
        setIsLoadingLayer(loadingLayerNames.size > 1);
        return;
      }

      // Build color map
      let colorMap = new Map();

      if (tableName === "tutupan_lahan") {
        const fetchedData = await fetchTutupanLahanData();

        // Create mapping from deskripsi_domain to color
        const deskripsiToColorMap = new Map<string, string>();
        fetchedData.forEach((item: any) => {
          const color = tutupanLahanColors[item.deskripsi_domain] || "#999999";
          if (!deskripsiToColorMap.has(item.deskripsi_domain)) {
            deskripsiToColorMap.set(item.deskripsi_domain, color);
          }
        });

        // Assign colors based on deskripsi_domain from GeoJSON properties
        geojsonData.features.forEach((feature: any) => {
          const deskripsi = feature.properties.deskripsi_domain;
          const pl2024_id = String(feature.properties.pl2024_id);

          // Try to get color from map first, then directly from tutupanLahanColors
          let color = deskripsiToColorMap.get(deskripsi);
          if (!color) {
            color = tutupanLahanColors[deskripsi] || "#999999";
          }

          colorMap.set(pl2024_id, color);
          colorMappingRef.current.tutupanLahan.set(pl2024_id, color);
        });
      } else if (tableName === "penutupan_lahan_2024") {
        const fetchedData = await fetchPenutupanLahan2024Data();

        // Create mapping from deskripsi_domain to color
        const deskripsiToColorMap = new Map<string, string>();
        fetchedData.forEach((item: any) => {
          const color = tutupanLahanColors[item.deskripsi_domain] || "#999999";
          if (!deskripsiToColorMap.has(item.deskripsi_domain)) {
            deskripsiToColorMap.set(item.deskripsi_domain, color);
          }
        });

        // Assign colors based on deskripsi_domain from GeoJSON properties
        geojsonData.features.forEach((feature: any) => {
          const deskripsi = feature.properties.deskripsi_domain;
          const pl2024_id = String(feature.properties.pl2024_id);

          // Try to get color from map first, then directly from tutupanLahanColors
          let color = deskripsiToColorMap.get(deskripsi);
          if (!color) {
            color = tutupanLahanColors[deskripsi] || "#999999";
          }

          colorMap.set(pl2024_id, color);
          colorMappingRef.current.penutupanLahan2024.set(pl2024_id, color);
        });
      } else if (tableName === "pl2024") {
        const fetchedData = await fetchPL2024();

        // Create mapping from deskripsi_domain to color
        const deskripsiToColorMap = new Map<string, string>();
        fetchedData.forEach((item: any) => {
          const color = tutupanLahanColors[item.deskripsi_domain] || "#999999";
          if (!deskripsiToColorMap.has(item.deskripsi_domain)) {
            deskripsiToColorMap.set(item.deskripsi_domain, color);
          }
        });

        // Assign colors based on deskripsi_domain from GeoJSON properties
        geojsonData.features.forEach((feature: any) => {
          const deskripsi = feature.properties.deskripsi_domain;
          const pl2024_id = String(feature.properties.pl2024_id);

          // Try to get color from map first, then directly from tutupanLahanColors
          let color = deskripsiToColorMap.get(deskripsi);
          if (!color) {
            color = tutupanLahanColors[deskripsi] || "#999999";
          }

          colorMap.set(pl2024_id, color);
          colorMappingRef.current.pl2024.set(pl2024_id, color);
        });
      } else if (tableName === "geologi") {
        const uniqueCombinations = new Map<
          string,
          { namobj: string; umurobj: string }
        >();

        geojsonData.features.forEach((feature: any) => {
          const namobj = feature.properties.namobj || "";
          const umurobj = feature.properties.umurobj || "";
          const key = `${namobj}|${umurobj}`;

          if (!uniqueCombinations.has(key)) {
            uniqueCombinations.set(key, { namobj, umurobj });
          }
        });

        const sortedKeys = Array.from(uniqueCombinations.keys()).sort();
        sortedKeys.forEach((key) => {
          if (!colorMappingRef.current.geologi.has(key)) {
            const colorIndex = colorMappingRef.current.geologi.size;
            const color = geologiColors[colorIndex % geologiColors.length];
            colorMappingRef.current.geologi.set(key, color);
          }
          colorMap.set(key, colorMappingRef.current.geologi.get(key)!);
        });

        const aggregatedData: any[] = [];
        const aggregateMap = new Map<string, number>();

        geojsonData.features.forEach((feature: any) => {
          const namobj = feature.properties.namobj || "";
          const umurobj = feature.properties.umurobj || "";
          const keliling = parseFloat(feature.properties.keliling_m || 0);
          const key = `${namobj}|${umurobj}`;

          if (aggregateMap.has(key)) {
            aggregateMap.set(key, aggregateMap.get(key)! + keliling);
          } else {
            aggregateMap.set(key, keliling);
          }
        });

        sortedKeys.forEach((key) => {
          const [namobj, umurobj] = key.split("|");
          aggregatedData.push({
            namobj,
            umurobj,
            keliling_total: aggregateMap.get(key) || 0,
            color: colorMappingRef.current.geologi.get(key),
          });
        });

        setGeologiData(aggregatedData);
      } else if (tableName === "jenis_tanah") {
        const uniqueJenisTanah = new Set<string>();

        geojsonData.features.forEach((feature: any) => {
          const jntnh1 = feature.properties.jntnh1 || "";
          if (jntnh1) {
            uniqueJenisTanah.add(jntnh1);
          }
        });

        const sortedJenisTanah = Array.from(uniqueJenisTanah).sort();
        sortedJenisTanah.forEach((jntnh1) => {
          if (!colorMappingRef.current.jenisTanah.has(jntnh1)) {
            const colorIndex = colorMappingRef.current.jenisTanah.size;
            const color =
              jenisTanahColors[colorIndex % jenisTanahColors.length];
            colorMappingRef.current.jenisTanah.set(jntnh1, color);
          }
          colorMap.set(jntnh1, colorMappingRef.current.jenisTanah.get(jntnh1)!);
        });

        const aggregatedData: any[] = [];
        sortedJenisTanah.forEach((jntnh1) => {
          aggregatedData.push({
            jntnh1,
            color: colorMappingRef.current.jenisTanah.get(jntnh1),
          });
        });

        setJenisTanahData(aggregatedData);
      } else if (tableName === "lahan_kritis") {
        const kritisMap = new Map<string, number>();

        geojsonData.features.forEach((feature: any) => {
          const kritis = feature.properties.kritis || "";
          const luas = parseFloat(feature.properties.luas_ha) || 0;

          if (kritis) {
            kritisMap.set(kritis, (kritisMap.get(kritis) || 0) + luas);
          }
        });

        const kritisArray = Array.from(kritisMap.entries()).map(
          ([kritis, luas_ha]) => ({
            kritis: kritis,
            luas_ha: luas_ha,
            color: lahanKritisColors[kritis] || "#808080",
          }),
        );

        const kritisOrder = ["Sangat Kritis", "Kritis"];
        kritisArray.sort((a, b) => {
          return kritisOrder.indexOf(a.kritis) - kritisOrder.indexOf(b.kritis);
        });

        setLahanKritisData(kritisArray);

        kritisArray.forEach((item) => {
          colorMap.set(item.kritis, item.color!);
          colorMappingRef.current.lahanKritis.set(item.kritis, item.color!);
        });
      } else if (tableName === "rawan_erosi") {
        // Samakan pembacaan data dengan kerawanan-ori.tsx:
        // kategori dibaca dari properties.tingkat dan luas dari properties.n_a.
        const tingkatMap = new Map<string, number>();

        geojsonData.features.forEach((feature: any) => {
          const tingkat = feature.properties?.tingkat || "";
          const luas = parseFloat(feature.properties?.n_a) || 0;

          if (tingkat) {
            tingkatMap.set(tingkat, (tingkatMap.get(tingkat) || 0) + luas);
          }
        });

        const erosiArray = Array.from(tingkatMap.entries()).map(
          ([tingkat, luas_ha]) => ({
            tingkat,
            luas_ha,
            color: rawanErosiColors[tingkat] || "#808080",
          }),
        );

        const tingkatOrder = [
          "Sangat Tinggi",
          "Tinggi",
          "Sedang",
          "Rendah",
          "Sangat Rendah",
        ];

        erosiArray.sort((a, b) => {
          const aIdx = tingkatOrder.indexOf(a.tingkat);
          const bIdx = tingkatOrder.indexOf(b.tingkat);
          return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
        });

        setRawanErosiData(erosiArray);

        erosiArray.forEach((item) => {
          colorMap.set(item.tingkat, item.color!);
          colorMappingRef.current.rawanErosi.set(item.tingkat, item.color!);
        });
      } else if (tableName === "rawan_longsor") {
        const unsurMap = new Map<string, number>();

        geojsonData.features.forEach((feature: any) => {
          const unsur = feature.properties.unsur || "";
          const shapeAreaM2 = Number(feature.properties.shape_area);
          const luas =
            Number.isFinite(shapeAreaM2) && shapeAreaM2 > 0
              ? shapeAreaM2 / 10000
              : 0;

          if (unsur) {
            unsurMap.set(unsur, (unsurMap.get(unsur) || 0) + luas);
          }
        });

        const longsorArray = Array.from(unsurMap.entries()).map(
          ([tingkat, luas_ha]) => ({
            tingkat: tingkat,
            luas_ha: luas_ha,
            color: rawanLongsorColors[tingkat] || "#808080",
          }),
        );

        const unsurOrder = [
          "Tinggi",
          "Menengah",
          "Rendah",
          "Sangat Rendah",
          "Danau",
          "Danau Tapal Kuda",
          "Danau/Situ",
          "Waduk",
          "Alur Aliran Bahan Rombakan",
        ];
        longsorArray.sort((a, b) => {
          const aIdx = unsurOrder.indexOf(a.tingkat);
          const bIdx = unsurOrder.indexOf(b.tingkat);
          return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
        });

        setRawanLongsorData(longsorArray);

        longsorArray.forEach((item) => {
          colorMap.set(item.tingkat, item.color!);
          colorMappingRef.current.rawanLongsor.set(item.tingkat, item.color!);
        });
      } else if (tableName === "rawan_limpasan") {
        const limpasanMap = new Map<string, number>();

        geojsonData.features.forEach((feature: any) => {
          const limpasan = feature.properties.limpasan || "";
          const shapeAreaM2 = Number(feature.properties.shape_area);
          const luas =
            Number.isFinite(shapeAreaM2) && shapeAreaM2 > 0
              ? shapeAreaM2 / 10000
              : 0;

          if (limpasan) {
            limpasanMap.set(limpasan, (limpasanMap.get(limpasan) || 0) + luas);
          }
        });

        const limpasanArray = Array.from(limpasanMap.entries()).map(
          ([tingkat, luas_ha]) => ({
            tingkat: tingkat,
            luas_ha: luas_ha,
            color: rawanLimpasanColors[tingkat] || "#808080",
          }),
        );

        const limpasanOrder = ["Ekstrim", "Tinggi", "Rendah", "Normal"];
        limpasanArray.sort((a, b) => {
          return (
            limpasanOrder.indexOf(a.tingkat) - limpasanOrder.indexOf(b.tingkat)
          );
        });

        setRawanLimpasanData(limpasanArray);

        limpasanArray.forEach((item) => {
          colorMap.set(item.tingkat, item.color!);
          colorMappingRef.current.rawanLimpasan.set(item.tingkat, item.color!);
        });
      } else if (tableName === "rawan_karhutla") {
        const kelasMap = new Map<string, number>();

        geojsonData.features.forEach((feature: any) => {
          const kelas = feature.properties.kelas || "";
          const luas = parseFloat(feature.properties.luas_ha) || 0;

          if (kelas) {
            kelasMap.set(kelas, (kelasMap.get(kelas) || 0) + luas);
          }
        });

        const karhutlaArray = Array.from(kelasMap.entries()).map(
          ([tingkat, luas_ha]) => ({
            tingkat: tingkat,
            luas_ha: luas_ha,
            color: rawanKarhutlaColors[tingkat] || "#808080",
          }),
        );

        const kelasOrder = ["Sangat Tinggi", "Tinggi", "Sedang", "Rendah"];
        karhutlaArray.sort((a, b) => {
          return kelasOrder.indexOf(a.tingkat) - kelasOrder.indexOf(b.tingkat);
        });

        setRawanKarhutlaData(karhutlaArray);

        karhutlaArray.forEach((item) => {
          colorMap.set(item.tingkat, item.color!);
          colorMappingRef.current.rawanKarhutla.set(item.tingkat, item.color!);
        });
      } else if (tableName === "bahaya_kekeringan") {
        const kelasMap = new Map<string, number>();
        geojsonData.features.forEach((feature: any) => {
          const kelas = feature.properties.kelas || "";
          const shapeAreaM2 = Number(feature.properties.shape_area);
          const luas =
            Number.isFinite(shapeAreaM2) && shapeAreaM2 > 0
              ? shapeAreaM2 / 10000
              : 0;
          if (kelas) kelasMap.set(kelas, (kelasMap.get(kelas) || 0) + luas);
        });
        const order = ["Tinggi", "Sedang", "Rendah"];
        const arr = Array.from(kelasMap.entries())
          .map(([kelas, luas]) => ({
            kelas,
            luas,
            color: bahayaKelasColors[kelas] || "#808080",
          }))
          .sort(
            (a, b) =>
              (order.indexOf(a.kelas) === -1 ? 999 : order.indexOf(a.kelas)) -
              (order.indexOf(b.kelas) === -1 ? 999 : order.indexOf(b.kelas)),
          );
        setBahayaKekeringanData(arr);
        arr.forEach((item) => {
          colorMap.set(item.kelas, item.color!);
          colorMappingRef.current.bahayaKekeringan.set(item.kelas, item.color!);
        });
      } else if (tableName === "bahaya_abrasi_dan_gelombang_ekstrim") {
        const kelasMap = new Map<string, number>();
        geojsonData.features.forEach((feature: any) => {
          const kelas = feature.properties.kelas || "";
          const shapeAreaM2 = Number(feature.properties.shape_area);
          const luas =
            Number.isFinite(shapeAreaM2) && shapeAreaM2 > 0
              ? shapeAreaM2 / 10000
              : 0;
          if (kelas) kelasMap.set(kelas, (kelasMap.get(kelas) || 0) + luas);
        });
        const order = ["Tinggi", "Rendah"];
        const arr = Array.from(kelasMap.entries())
          .filter(([kelas]) => {
            const normalized = String(kelas).trim().toLowerCase();
            return normalized === "rendah" || normalized === "tinggi";
          })
          .map(([kelas, luas]) => ({
            kelas,
            luas,
            color: bahayaAbrasiColors[kelas] || "#808080",
          }))
          .sort(
            (a, b) =>
              (order.indexOf(a.kelas) === -1 ? 999 : order.indexOf(a.kelas)) -
              (order.indexOf(b.kelas) === -1 ? 999 : order.indexOf(b.kelas)),
          );
        setBahayaAbrasiData(arr);
        arr.forEach((item) => {
          colorMap.set(item.kelas, item.color!);
          colorMappingRef.current.bahayaAbrasi.set(item.kelas, item.color!);
        });
      } else if (tableName === "bahaya_banjir") {
        const kelasMap = new Map<string, number>();
        geojsonData.features.forEach((feature: any) => {
          const kelas = feature.properties.kelas || "";
          const shapeAreaM2 = Number(feature.properties.shape_area);
          const luas =
            Number.isFinite(shapeAreaM2) && shapeAreaM2 > 0
              ? shapeAreaM2 / 10000
              : 0;
          if (kelas) kelasMap.set(kelas, (kelasMap.get(kelas) || 0) + luas);
        });
        const order = ["Tinggi", "Sedang", "Rendah"];
        const arr = Array.from(kelasMap.entries())
          .map(([kelas, luas]) => ({
            kelas,
            luas,
            color: bahayaKelasColors[kelas] || "#808080",
          }))
          .sort(
            (a, b) =>
              (order.indexOf(a.kelas) === -1 ? 999 : order.indexOf(a.kelas)) -
              (order.indexOf(b.kelas) === -1 ? 999 : order.indexOf(b.kelas)),
          );
        setBahayaBanjirData(arr);
        arr.forEach((item) => {
          colorMap.set(item.kelas, item.color!);
          colorMappingRef.current.bahayaBanjir.set(item.kelas, item.color!);
        });
      } else if (tableName === "bahaya_banjir_bandang") {
        const kelasMap = new Map<string, number>();
        geojsonData.features.forEach((feature: any) => {
          const kelas = feature.properties.kelas || "";
          const shapeAreaM2 = Number(feature.properties.shape_area);
          const luas =
            Number.isFinite(shapeAreaM2) && shapeAreaM2 > 0
              ? shapeAreaM2 / 10000
              : 0;
          if (kelas) kelasMap.set(kelas, (kelasMap.get(kelas) || 0) + luas);
        });
        const order = ["Tinggi", "Sedang", "Rendah"];
        const arr = Array.from(kelasMap.entries())
          .map(([kelas, luas]) => ({
            kelas,
            luas,
            color: bahayaKelasColors[kelas] || "#808080",
          }))
          .sort(
            (a, b) =>
              (order.indexOf(a.kelas) === -1 ? 999 : order.indexOf(a.kelas)) -
              (order.indexOf(b.kelas) === -1 ? 999 : order.indexOf(b.kelas)),
          );
        setBahayaBanjirBandangData(arr);
        arr.forEach((item) => {
          colorMap.set(item.kelas, item.color!);
          colorMappingRef.current.bahayaBanjirBandang.set(
            item.kelas,
            item.color!,
          );
        });
      } else if (tableName === "dta_danau") {
        const tipeMap = new Map<string, number>();
        geojsonData.features.forEach((feature: any) => {
          const tipe = feature.properties.tipe_danau || "";
          const luas = parseFloat(feature.properties.luas_ha) || 0;
          if (tipe) tipeMap.set(tipe, (tipeMap.get(tipe) || 0) + luas);
        });
        const arr = Array.from(tipeMap.entries()).map(([tipe_danau, luas]) => ({
          tipe_danau,
          luas,
          color: dtaDanauColors[tipe_danau] || "#808080",
        }));
        setDtaDanauData(arr);
        arr.forEach((item) => {
          colorMap.set(item.tipe_danau, item.color!);
          colorMappingRef.current.dtaDanau.set(item.tipe_danau, item.color!);
        });
      } else if (tableName === "rehabilitasi_das") {
        const bpdasMap = new Map<string, number>();
        const bpdasColorMap = new Map<string, string>();
        geojsonData.features.forEach((feature: any) => {
          const bpdas = feature.properties.bpdas || "";
          const luas = parseFloat(feature.properties.luas_rdas) || 0;
          if (bpdas) bpdasMap.set(bpdas, (bpdasMap.get(bpdas) || 0) + luas);
        });
        const arr = Array.from(bpdasMap.entries()).map(([bpdas, luas]) => {
          const color = getRandomColor(bpdas, bpdasColorMap);
          return { bpdas, luas, color };
        });
        setRehabilitasiDasData(arr);
        arr.forEach((item) => {
          colorMap.set(item.bpdas, item.color!);
          colorMappingRef.current.rehabilitasiDas.set(item.bpdas, item.color!);
        });
      } else if (tableName === "rehabilitasi_hutan") {
        const jenisTanaMap = new Map<string, number>();
        const jenisTanaColorMap = new Map<string, string>();
        geojsonData.features.forEach((feature: any) => {
          const jenis_tana = String(feature.properties.jenis_tana || "");
          const luas = parseFloat(feature.properties.luas_ha) || 0;
          if (jenis_tana)
            jenisTanaMap.set(
              jenis_tana,
              (jenisTanaMap.get(jenis_tana) || 0) + luas,
            );
        });
        const arr = Array.from(jenisTanaMap.entries()).map(
          ([jenis_tana, luas]) => {
            const color = getRandomColor(jenis_tana, jenisTanaColorMap);
            return { jenis_tana, luas, color };
          },
        );
        setRehabilitasiHutanData(arr);
        arr.forEach((item) => {
          colorMap.set(item.jenis_tana, item.color!);
          colorMappingRef.current.rehabilitasiHutan.set(
            item.jenis_tana,
            item.color!,
          );
        });
      } else if (tableName === "restorasi_gambut") {
        const uniqueMap = new Map<string, { jenis: string; bahan: string }>();
        geojsonData.features.forEach((feature: any) => {
          const jenis = String(feature.properties.jenis || "");
          const bahan = String(feature.properties.bahan || "");
          const key = `${jenis}||${bahan}`;
          if (!uniqueMap.has(key)) uniqueMap.set(key, { jenis, bahan });
        });
        setRestorasiGambutData(Array.from(uniqueMap.values()));
      } else if (tableName === "penerapan_teknik_kta") {
        const uniqueMap = new Map<string, { das: string; subdas: string }>();
        geojsonData.features.forEach((feature: any) => {
          const das = String(feature.properties.das || "");
          const subdas = String(feature.properties.subdas || "");
          const key = `${das}||${subdas}`;
          if (!uniqueMap.has(key)) uniqueMap.set(key, { das, subdas });
        });
        setPenerapanTeknikKtaData(Array.from(uniqueMap.values()));
      } else if (tableName === "karhutla_2021") {
        const periodeColorMap = new Map<string, string>();
        const uniquePeriode = new Set<string>();
        geojsonData.features.forEach((feature: any) => {
          const periode = String(feature.properties.periode || "");
          if (periode) uniquePeriode.add(periode);
        });
        const arr = Array.from(uniquePeriode).map((periode) => ({
          periode,
          color: "#DC2626",
        }));
        setKebakaran2021Data(arr);
        arr.forEach((item) => {
          colorMap.set(item.periode, item.color!);
          colorMappingRef.current.kebakaran2021.set(item.periode, item.color!);
        });
      } else if (tableName === "karhutla_2022") {
        const periodeMap = new Map<string, number>();
        const periodeColorMap = new Map<string, string>();
        geojsonData.features.forEach((feature: any) => {
          const periode = String(feature.properties.periode || "");
          const luas = parseFloat(feature.properties.luas) || 0;
          if (periode)
            periodeMap.set(periode, (periodeMap.get(periode) || 0) + luas);
        });
        const arr = Array.from(periodeMap.entries()).map(([periode, luas]) => ({
          periode,
          luas,
          color: "#DC2626",
        }));
        setKebakaran2022Data(arr);
        arr.forEach((item) => {
          colorMap.set(item.periode, item.color!);
          colorMappingRef.current.kebakaran2022.set(item.periode, item.color!);
        });
      } else if (tableName === "karhutla_2023") {
        const periodeColorMap = new Map<string, string>();
        const uniquePeriode = new Set<string>();
        geojsonData.features.forEach((feature: any) => {
          const periode = String(feature.properties.periode || "");
          if (periode) uniquePeriode.add(periode);
        });
        const arr = Array.from(uniquePeriode).map((periode) => ({
          periode,
          color: "#DC2626",
        }));
        setKebakaran2023Data(arr);
        arr.forEach((item) => {
          colorMap.set(item.periode, item.color!);
          colorMappingRef.current.kebakaran2023.set(item.periode, item.color!);
        });
      } else if (tableName === "karhutla_2024") {
        const periodeMap = new Map<string, number>();
        const periodeColorMap = new Map<string, string>();
        geojsonData.features.forEach((feature: any) => {
          const periode = String(feature.properties.periode || "");
          const luas = parseFloat(feature.properties.luas) || 0;
          if (periode)
            periodeMap.set(periode, (periodeMap.get(periode) || 0) + luas);
        });
        const arr = Array.from(periodeMap.entries()).map(([periode, luas]) => ({
          periode,
          luas,
          color: "#DC2626",
        }));
        setKebakaran2024Data(arr);
        arr.forEach((item) => {
          colorMap.set(item.periode, item.color!);
          colorMappingRef.current.kebakaran2024.set(item.periode, item.color!);
        });
      } else if (tableName === "karhutla_2025") {
        const periodeMap = new Map<string, number>();
        const periodeColorMap = new Map<string, string>();
        geojsonData.features.forEach((feature: any) => {
          const periode = String(feature.properties.periode || "");
          const luas = parseFloat(feature.properties.luas) || 0;
          if (periode)
            periodeMap.set(periode, (periodeMap.get(periode) || 0) + luas);
        });
        const arr = Array.from(periodeMap.entries()).map(([periode, luas]) => ({
          periode,
          luas,
          color: "#DC2626",
        }));
        setKebakaran2025Data(arr);
        arr.forEach((item) => {
          colorMap.set(item.periode, item.color!);
          colorMappingRef.current.kebakaran2025.set(item.periode, item.color!);
        });
      } else if (tableName === "kawasan_hutan") {
        const mappingKawasanHutan: Record<string, string> = {
          "0": "Tidak Terdefinisi",
          "000000": "Tidak Terdefinisi",
          "100000": "Kawasan Suaka Alam/Kawasan Pelestarian Alam",
          "100100": "Hutan Lindung",
          "100200": "Hutan (Kawasan) Suaka Alam/Wisata",
          "100300": "Hutan Produksi Tetap",
          "100400": "Hutan Produksi Tetap",
          "100500": "Hutan Produksi yang dapat di Konversi",
          "100600": "Hutan Negara Bebas",
          "100700": "Areal Penggunaan Lain",
          "500100": "Danau",
          "500300": "Tubuh Air",
          "100210": "Cagar Alam",
          "100220": "Suaka Margastwa",
          "100230": "Taman Buru",
          "100240": "Taman Nasional",
          "100250": "Taman Wisata Alam/Hutan Wisata",
          "100260": "Taman Hutan Raya",
          "100201": "Hutan Suaka Alam/Wisata (Perairan)",
          "100211": "Cagar Alam (Perairan)",
          "100221": "Suaka Margasatwa (Perairan)",
          "100241": "Taman Nasional (Perairan)",
          "100251": "Taman Wisata Alam/Hutan Wisata (Perairan)",
        };
        const kawasanColorMap = new Map<string, string>();
        // Group by deskripsi_domain agar 100300 dan 100400 dijadikan satu
        const deskripsiMap = new Map<string, string>(); // deskripsi_domain -> color (via getRandomColor per deskripsi)
        const fungsikwsToDescrip = new Map<string, string>(); // fungsikws -> deskripsi_domain
        geojsonData.features.forEach((feature: any) => {
          const fungsikws = String(feature.properties.fungsikws ?? "").trim();
          if (fungsikws) {
            const deskripsi =
              mappingKawasanHutan[fungsikws] || `Kode ${fungsikws}`;
            fungsikwsToDescrip.set(fungsikws, deskripsi);
            if (!deskripsiMap.has(deskripsi)) {
              deskripsiMap.set(
                deskripsi,
                getRandomColor(deskripsi, kawasanColorMap),
              );
            }
          }
        });
        // Build arr: satu baris per deskripsi_domain unik
        const seenDeskripsi = new Set<string>();
        const arr: Array<{
          fungsikws: string;
          deskripsi_domain: string;
          color?: string;
        }> = [];
        // Kumpulkan semua fungsikws unik, lalu filter per deskripsi unik
        Array.from(fungsikwsToDescrip.entries()).forEach(
          ([fungsikws, deskripsi]) => {
            if (!seenDeskripsi.has(deskripsi)) {
              seenDeskripsi.add(deskripsi);
              const color = deskripsiMap.get(deskripsi)!;
              arr.push({ fungsikws, deskripsi_domain: deskripsi, color });
            }
            // Simpan mapping warna untuk SEMUA fungsikws yang sama deskripsinya (untuk highlight)
            const color = deskripsiMap.get(deskripsi)!;
            colorMap.set(fungsikws, color);
            colorMappingRef.current.kawasanHutan.set(fungsikws, color);
          },
        );
        setKawasanHutanData(arr);
      } else if (
        [
          "risiko_banjir",
          "risiko_banjir_bandang",
          "risiko_kekeringan",
          "risiko_abrasi",
          "risiko_longsor",
          "risiko_karhutla",
        ].includes(tableName)
      ) {
        const kelasMap = new Map<string, number>();
        geojsonData.features.forEach((feature: any) => {
          const kelas = feature.properties.kelas || "";
          const shapeAreaM2 = Number(feature.properties.shape_area);
          const luas =
            Number.isFinite(shapeAreaM2) && shapeAreaM2 > 0
              ? shapeAreaM2 / 10000
              : 0;
          if (kelas) kelasMap.set(kelas, (kelasMap.get(kelas) || 0) + luas);
        });
        const fallbackRiskColor = getBencanaLayerColor(tableName);
        const arr = Array.from(kelasMap.entries()).map(([kelas, luas]) => ({
          kelas,
          luas,
          color: (tableName === "risiko_banjir" || tableName === "risiko_banjir_bandang" || tableName === "risiko_abrasi") ? getRisikoBanjirClassColor(kelas, fallbackRiskColor) : getRiskClassColor(kelas, fallbackRiskColor),
        }));
        const risikoKey = tableName as keyof typeof risikoData;
        setRisikoData((prev) => ({ ...prev, [tableName]: arr }));
        const refKeyMap: Record<string, keyof typeof colorMappingRef.current> =
          {
            risiko_banjir: "risikoBanjir",
            risiko_banjir_bandang: "risikoBanjirBandang",
            risiko_kekeringan: "risikoKekeringan",
            risiko_abrasi: "risikoAbrasi",
            risiko_longsor: "risikoLongsor",
            risiko_karhutla: "risikoKarhutla",
          };
        const refKey = refKeyMap[tableName];
        arr.forEach((item) => {
          colorMap.set(item.kelas, item.color!);
          colorMappingRef.current[refKey].set(item.kelas, item.color!);
        });
      } else if (tableName === "khdtk") {
        const khdtkColorMap = new Map<string, string>();
        const namobjMap = new Map<
          string,
          { lsktap: number; jnskhdtk: string }
        >();
        geojsonData.features.forEach((feature: any) => {
          const namobj = feature.properties.namobj || "";
          const lsktap = parseFloat(feature.properties.lsktap) || 0;
          const jnskhdtk = feature.properties.jnskhdtk || "";
          if (namobj) {
            if (namobjMap.has(namobj)) {
              namobjMap.get(namobj)!.lsktap += lsktap;
            } else {
              namobjMap.set(namobj, { lsktap, jnskhdtk });
            }
          }
        });
        const arr = Array.from(namobjMap.entries()).map(([namobj, val]) => ({
          namobj,
          lsktap: val.lsktap,
          jnskhdtk: val.jnskhdtk,
          color: getRandomColor(namobj, khdtkColorMap),
        }));
        setKhdtkData(arr);
        arr.forEach((item) => {
          colorMap.set(item.namobj, item.color!);
          colorMappingRef.current.khdtk.set(item.namobj, item.color!);
        });
      } else if (INFRA_IDS.includes(tableName as any)) {
        const rows = geojsonData.features.map((f: any) => f.properties);
        setInfraData((prev) => ({ ...prev, [tableName]: rows }));
      }

      // Styling function
      let styleFunction;

      // BENCANA: warna ditentukan oleh JENIS BENCANA.
      // Dengan begitu karhutla selalu merah, banjir selalu hijau, dst.
      if (BENCANA_FOCUS_LAYERS.has(String(tableName))) {
        const bencanaColor = getBencanaLayerColor(String(tableName));
        styleFunction = function (feature: any) {
          // Ambil warna persis dari mapping legenda layer ini.
          const classColor = getBencanaLegendFeatureColor(String(tableName), feature) || bencanaColor;
          return {
            color: classColor,
            fillColor: classColor,
            weight: zoom > 10 ? 2.2 : 1.6,
            opacity: 1,
            fillOpacity: 0.68,
            lineCap: "round",
            lineJoin: "round",
          };
        };
      } else if (tableName === "tutupan_lahan") {
        styleFunction = function (feature: any) {
          const pl2024_id = String(feature.properties.pl2024_id);
          const fillColor = colorMap.get(pl2024_id) || "#EF4444";

          return {
            color: fillColor,
            weight: zoom > 10 ? 2 : 1,
            opacity: 0.8,
            fillColor: fillColor,
            fillOpacity: zoom > 10 ? 0.4 : 0.3,
          };
        };
      } else if (tableName === "pl2024") {
        styleFunction = function (feature: any) {
          const pl2024_id = String(feature.properties.pl2024_id);
          const fillColor = colorMap.get(pl2024_id) || "#EF4444";

          return {
            color: fillColor,
            weight: zoom > 10 ? 2 : 1,
            opacity: 0.8,
            fillColor: fillColor,
            fillOpacity: zoom > 10 ? 0.4 : 0.3,
          };
        };
      } else if (tableName === "penutupan_lahan_2024") {
        styleFunction = function (feature: any) {
          const pl2024_id = String(feature.properties.pl2024_id);
          const fillColor = colorMap.get(pl2024_id) || "#EF4444";

          return {
            color: fillColor,
            weight: zoom > 10 ? 2 : 1,
            opacity: 0.8,
            fillColor: fillColor,
            fillOpacity: zoom > 10 ? 0.4 : 0.3,
          };
        };
      } else if (tableName === "geologi") {
        styleFunction = function (feature: any) {
          const namobj = feature.properties.namobj || "";
          const umurobj = feature.properties.umurobj || "";
          const key = `${namobj}|${umurobj}`;
          const fillColor = colorMap.get(key) || "#B45309";

          return {
            color: fillColor,
            weight: zoom > 10 ? 2 : 1,
            opacity: 0.8,
            fillColor: fillColor,
            fillOpacity: zoom > 10 ? 0.4 : 0.3,
          };
        };
      } else if (tableName === "jenis_tanah") {
        styleFunction = function (feature: any) {
          const jntnh1 = feature.properties.jntnh1 || "";
          const fillColor = colorMap.get(jntnh1) || "#8B4513";

          return {
            color: fillColor,
            weight: zoom > 10 ? 2 : 1,
            opacity: 0.8,
            fillColor: fillColor,
            fillOpacity: zoom > 10 ? 0.4 : 0.3,
          };
        };
      } else if (tableName === "lahan_kritis") {
        styleFunction = function (feature: any) {
          const kritis = feature.properties.kritis || "";
          const fillColor = colorMap.get(kritis) || "#808080";
          return {
            color: fillColor,
            fillColor: fillColor,
            weight: 1,
            opacity: 0.8,
            fillOpacity: 0.5,
          };
        };
      } else if (tableName === "rawan_erosi") {
        styleFunction = function (feature: any) {
          const keterangan = feature.properties.keterangan || "";
          const fillColor = colorMap.get(keterangan) || "#808080";

          return {
            color: fillColor,
            fillColor: fillColor,
            weight: 1,
            opacity: 0.8,
            fillOpacity: 0.5,
          };
        };
      } else if (tableName === "rawan_longsor") {
        styleFunction = function (feature: any) {
          const unsur = feature.properties.unsur || "";
          const fillColor = colorMap.get(unsur) || "#808080";
          return {
            color: fillColor,
            fillColor: fillColor,
            weight: 1,
            opacity: 0.8,
            fillOpacity: 0.5,
          };
        };
      } else if (tableName === "rawan_limpasan") {
        styleFunction = function (feature: any) {
          const limpasan = feature.properties.limpasan || "";
          const fillColor = colorMap.get(limpasan) || "#808080";
          return {
            color: fillColor,
            fillColor: fillColor,
            weight: 1,
            opacity: 0.8,
            fillOpacity: 0.5,
          };
        };
      } else if (tableName === "rawan_karhutla") {
        styleFunction = function (feature: any) {
          const kelas = feature.properties.kelas || "";
          const fillColor = colorMap.get(kelas) || "#808080";
          return {
            color: fillColor,
            fillColor: fillColor,
            weight: 1,
            opacity: 0.8,
            fillOpacity: 0.5,
          };
        };
        // } else {
        //   const tableColor = getColorForTable(tableName);
        //   styleFunction = function(feature: any) {
        //     return {
        //       color: tableColor,
        //       weight: zoom > 10 ? 2 : 1,
        //       opacity: 0.8,
        //       fillOpacity: zoom > 10 ? 0.4 : 0.3
        //     };
      } else if (
        [
          "bahaya_kekeringan",
          "bahaya_abrasi_dan_gelombang_ekstrim",
          "bahaya_banjir",
          "bahaya_banjir_bandang",
        ].includes(tableName)
      ) {
        styleFunction = function (feature: any) {
          const kelas = feature.properties.kelas || "";
          const fillColor = colorMap.get(kelas) || "#808080";
          return {
            color: fillColor,
            fillColor,
            weight: 1,
            opacity: 0.8,
            fillOpacity: 0.5,
          };
        };
      } else if (tableName === "dta_danau") {
        styleFunction = function (feature: any) {
          const tipe = feature.properties.tipe_danau || "";
          const fillColor = colorMap.get(tipe) || "#808080";
          return {
            color: fillColor,
            fillColor,
            weight: 1,
            opacity: 0.8,
            fillOpacity: 0.5,
          };
        };
      } else if (tableName === "rehabilitasi_das") {
        styleFunction = function (feature: any) {
          const bpdas = feature.properties.bpdas || "";
          const fillColor = colorMap.get(bpdas) || "#808080";
          return {
            color: fillColor,
            fillColor,
            weight: 1,
            opacity: 0.8,
            fillOpacity: 0.5,
          };
        };
      } else if (tableName === "rehabilitasi_hutan") {
        styleFunction = function (feature: any) {
          const jenis_tana = String(feature.properties.jenis_tana || "");
          const fillColor = colorMap.get(jenis_tana) || "#808080";
          return {
            color: fillColor,
            fillColor,
            weight: 1,
            opacity: 0.8,
            fillOpacity: 0.5,
          };
        };
      } else if (
        [
          "karhutla_2021",
          "karhutla_2022",
          "karhutla_2023",
          "karhutla_2024",
          "karhutla_2025",
        ].includes(tableName)
      ) {
        styleFunction = function (feature: any) {
          const periode = String(feature.properties.periode || "");
          const fillColor = colorMap.get(periode) || "#808080";
          return {
            color: fillColor,
            fillColor,
            weight: 1,
            opacity: 0.8,
            fillOpacity: 0.5,
          };
        };
      } else if (tableName === "kawasan_hutan") {
        styleFunction = function (feature: any) {
          const fungsikws = String(feature?.properties?.fungsikws ?? "").trim();
          const fillColor =
            colorMappingRef.current.kawasanHutan.get(fungsikws) ||
            colorMap.get(fungsikws) ||
            "#808080";
          return {
            color: fillColor,
            fillColor,
            weight: 1,
            opacity: 1,
            fillOpacity: 0.68,
            lineCap: "round",
            lineJoin: "round",
          };
        };
      } else if (
        [
          "risiko_banjir",
          "risiko_banjir_bandang",
          "risiko_kekeringan",
          "risiko_abrasi",
          "risiko_longsor",
          "risiko_karhutla",
        ].includes(tableName)
      ) {
        styleFunction = function (feature: any) {
          const kelas = feature.properties.kelas || "";
          const refKeyMap: Record<
            string,
            keyof typeof colorMappingRef.current
          > = {
            risiko_banjir: "risikoBanjir",
            risiko_banjir_bandang: "risikoBanjirBandang",
            risiko_kekeringan: "risikoKekeringan",
            risiko_abrasi: "risikoAbrasi",
            risiko_longsor: "risikoLongsor",
            risiko_karhutla: "risikoKarhutla",
          };
          const refKey = refKeyMap[tableName];
          const fillColor =
            colorMappingRef.current[refKey]?.get(kelas) ||
            colorMap.get(kelas) ||
            "#808080";
          return {
            color: fillColor,
            fillColor,
            weight: 1,
            opacity: 0.8,
            fillOpacity: 0.5,
          };
        };
      } else if (tableName === "khdtk") {
        styleFunction = function (feature: any) {
          const namobj = feature.properties.namobj || "";
          const fillColor =
            colorMappingRef.current.khdtk.get(namobj) ||
            colorMap.get(namobj) ||
            "#808080";
          return {
            color: fillColor,
            fillColor,
            weight: 1,
            opacity: 0.8,
            fillOpacity: 0.5,
          };
        };
      } else {
        // Untuk layer umum, beri warna berbeda per feature
        styleFunction = function (feature: any) {
          // Ambil warna berdasarkan property tertentu, misal: gid, id, atau nama
          let featureIdentifier =
            feature.properties.gid ||
            feature.properties.id ||
            feature.properties.nama ||
            feature.properties.name ||
            JSON.stringify(feature.properties); // fallback: gunakan semua properties

          // Hash untuk mendapatkan warna unik per feature
          const colors = [
            "#FF6B6B",
            "#4ECDC4",
            "#45B7D1",
            "#FFA07A",
            "#98D8C8",
            "#F7DC6F",
            "#BB8FCE",
            "#85C1E2",
            "#F8B739",
            "#52BE80",
            "#EC7063",
            "#5DADE2",
            "#F1948A",
            "#73C6B6",
            "#F39C12",
            "#AED6F1",
            "#F8C471",
            "#82E0AA",
            "#E59866",
            "#D7BDE2",
          ];

          let hash = 0;
          const str = String(featureIdentifier);
          for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
          }
          const colorIndex = Math.abs(hash) % colors.length;
          const featureColor = colors[colorIndex];

          return {
            color: featureColor,
            weight: zoom > 10 ? 2 : 1,
            opacity: 0.8,
            fillOpacity: zoom > 10 ? 0.4 : 0.3,
          };
        };
      }

      // Buat layer group. GeoJSON Point yang koordinatnya rusak harus dilewati
      // agar satu feature invalid tidak membuat renderer Leaflet crash saat pan/resize/export PDF.
      // Optimasi khusus Rawan Banjir pada tampilan Nasional.
      // Canvas menghindari pembuatan ribuan elemen SVG terpisah.
      const isNationalRawanBanjirOverview =
        tableName === "risiko_banjir" &&
        selectedAreas.length === 0 &&
        selectedDas.length === 0 &&
        zoom <= 5;

      const nationalCanvasRenderer =
        isNationalRawanBanjirOverview && window.L.canvas
          ? window.L.canvas({ padding: 0.5 })
          : undefined;

      // Kawasan hutan dapat berisi Polygon/MultiPolygon maupun geometri garis.
      // Gunakan Canvas khusus layer ini dan validasi seluruh struktur koordinat
      // sebelum Leaflet membentuk Polyline/Polygon agar koordinat parsial tidak
      // menyebabkan Bounds.js gagal membaca titik x/y.
      const kawasanHutanCanvasRenderer =
        tableName === "kawasan_hutan" && window.L.canvas
          ? window.L.canvas({ padding: 0.5 })
          : undefined;
      const sekatKanalCanvasRenderer =
        tableName === "sekat_kanal" && window.L.canvas
          ? window.L.canvas({ padding: 0.5 })
          : undefined;

      const activeGeoJsonRenderer =
        kawasanHutanCanvasRenderer ||
        sekatKanalCanvasRenderer ||
        nationalCanvasRenderer;

      // Satu Canvas renderer bersama untuk semua fitur Point dalam satu layer.
      const sharedPointCanvasRenderer = window.L.canvas
        ? window.L.canvas({ padding: 0.5 })
        : undefined;

      const isValidGeoJsonPosition = (position: any): boolean => {
        if (!Array.isArray(position) || position.length < 2) return false;
        const lng = position[0];
        const lat = position[1];
        return (
          typeof lng === "number" &&
          typeof lat === "number" &&
          Number.isFinite(lng) &&
          Number.isFinite(lat) &&
          lng >= -180 &&
          lng <= 180 &&
          lat >= -90 &&
          lat <= 90
        );
      };

      const isValidGeoJsonGeometry = (geometry: any): boolean => {
        if (!geometry || typeof geometry !== "object") return false;
        const coords = geometry.coordinates;
        const allPositionsValid = (positions: any): boolean =>
          Array.isArray(positions) &&
          positions.length > 0 &&
          positions.every(isValidGeoJsonPosition);
        const allLinesValid = (lines: any): boolean =>
          Array.isArray(lines) &&
          lines.length > 0 &&
          lines.every(
            (line: any) =>
              Array.isArray(line) &&
              line.length >= 2 &&
              line.every(isValidGeoJsonPosition),
          );
        const allRingsValid = (rings: any): boolean =>
          Array.isArray(rings) &&
          rings.length > 0 &&
          rings.every(
            (ring: any) =>
              Array.isArray(ring) &&
              ring.length >= 4 &&
              ring.every(isValidGeoJsonPosition),
          );

        switch (geometry.type) {
          case "Point":
            return isValidGeoJsonPosition(coords);
          case "MultiPoint":
            return allPositionsValid(coords);
          case "LineString":
            return Array.isArray(coords) && coords.length >= 2 && allPositionsValid(coords);
          case "MultiLineString":
            return allLinesValid(coords);
          case "Polygon":
            return allRingsValid(coords);
          case "MultiPolygon":
            return (
              Array.isArray(coords) &&
              coords.length > 0 &&
              coords.every(allRingsValid)
            );
          case "GeometryCollection":
            return (
              Array.isArray(geometry.geometries) &&
              geometry.geometries.length > 0 &&
              geometry.geometries.every(isValidGeoJsonGeometry)
            );
          default:
            return false;
        }
      };

      const layerGroup = window.L.geoJSON(geojsonData, {
        pane: "overlayPane",
        smoothFactor: BENCANA_FOCUS_LAYERS.has(String(tableName)) ? 0 : 1,
        renderer: activeGeoJsonRenderer,
        style: styleFunction,
        filter: function (feature: any) {
          const geometry = feature?.geometry;
          if (!geometry) return false;

          // Validasi menyeluruh hanya untuk kawasan_hutan; perilaku filter
          // layer lain tetap sama seperti sebelumnya.
          if (tableName === "kawasan_hutan" && !isValidGeoJsonGeometry(geometry)) {
            console.warn("SIMITI: skipping invalid kawasan_hutan geometry", {
              geometryType: geometry?.type,
              properties: feature?.properties,
            });
            return false;
          }

          if (geometry.type === "Point") {
            const coords = geometry.coordinates;
            const lng = Number(coords?.[0]);
            const lat = Number(coords?.[1]);
            if (
              !Number.isFinite(lat) ||
              !Number.isFinite(lng) ||
              lat < -90 ||
              lat > 90 ||
              lng < -180 ||
              lng > 180
            ) {
              console.warn("SIMITI: skipping invalid Point geometry", {
                tableName,
                feature,
              });
              return false;
            }
          }
          return true;
        },
        pointToLayer: function (feature, latlng) {
          const lat = Number(latlng?.lat);
          const lng = Number(latlng?.lng);
          if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lng) ||
            lat < -90 ||
            lat > 90 ||
            lng < -180 ||
            lng > 180
          ) {
            console.warn("SIMITI: skipping invalid Leaflet LatLng", {
              tableName,
              feature,
              latlng,
            });
            return window.L.layerGroup();
          }
          const isBencanaLayer = BENCANA_FOCUS_LAYERS.has(String(tableName));
          const isSekatKanalLayer = String(tableName) === "sekat_kanal";
          const sekatJenis = String(feature?.properties?.jenis ?? "").trim().toUpperCase();
          const sekatBahan = String(feature?.properties?.bahan ?? "").trim().toUpperCase();

          const tableColor = isSekatKanalLayer
            ? sekatJenis === "SPILLWAY" && sekatBahan === "BETON"
              ? "#2563EB"
              : sekatJenis === "SPILLWAY" && sekatBahan === "KAYU"
                ? "#D97706"
                : sekatJenis === "NON SPILLWAY" && sekatBahan === "KAYU"
                  ? "#16A34A"
                  : "#64748B"
            : isBencanaLayer
              ? getBencanaLegendFeatureColor(String(tableName), feature)
              : getColorForTable(tableName);

          // Point pada layer bencana tetap ditampilkan. Beberapa sumber bencana
          // menyimpan kejadian sebagai Point, jadi jangan dibuang karena itu membuat
          // tanda bencana hilang ketika area dipilih.
          // SIMITI: Point/CircleMarker wajib memakai Canvas renderer.
          // Renderer SVG dapat masuk ke Bounds.js dengan _pxBounds yang belum
          // terbentuk ketika map sedang add/remove/invalidateSize.
          return window.L.circleMarker([lat, lng], {
            renderer: activeGeoJsonRenderer || sharedPointCanvasRenderer,
            radius: isSekatKanalLayer ? (zoom > 10 ? 8 : zoom > 7 ? 7 : 6) : (zoom > 10 ? 6 : 4),
            fillColor: tableColor,
            color: isSekatKanalLayer ? "#FFFFFF" : "#000",
            weight: isSekatKanalLayer ? 1.5 : 1,
            opacity: 1,
            fillOpacity: isSekatKanalLayer ? 0.95 : 0.7,
          });
        },
        onEachFeature: function (feature, layer) {
          layer.on("click", (event: any) => {
            if (event?.originalEvent?.stopPropagation) {
              event.originalEvent.stopPropagation();
            }

            // Klik pertama belum memilih polygon. Klik kedua pada lokasi
            // yang sama (maks. 30 meter) baru menjalankan identifikasi GIS.
            if (!confirmMapPolygonClick(event?.latlng)) return;

            // Validasi geometri asli: jangan izinkan polygon di luar wilayah
            // administrasi terpilih lolos hanya karena bounding box beririsan.
            if (!isPointInsideSelectedAdminAreas(event?.latlng)) return;
            if (!isPointInsideGeoFeature(event?.latlng, feature)) return;

            // ==================================================
            // SIMITI - FEATURE SELECTION LOCK
            //
            // Jika user memilih polygon KHDTK, simpan polygon
            // tersebut sebagai target kerawanan.
            //
            // Contoh:
            // KHDTK A diklik -> hanya KHDTK A yang menjadi target.
            // KHDTK B/C tidak ikut terkena ketika legenda diklik.
            // ==================================================
            if (String(tableName).toLowerCase() === "khdtk") {
              const props = feature?.properties || {};

              let originalColor = "#808080";

              const namobj = String(props.namobj || "");

              if (namobj) {
                originalColor =
                  colorMappingRef.current.khdtk.get(namobj) || "#808080";
              }

              selectedSpatialFeatureRef.current = {
                layerType: "khdtk",
                feature,
                layer,
                originalColor,
              };

              // Visual selection sementara agar user tahu
              // polygon mana yang sedang menjadi target.
              if (layer?.setStyle) {
                layer.setStyle({
                  weight: 4,
                  color: "#111827",
                  opacity: 1,
                  fillOpacity: 0.72,
                });

                if (layer?.bringToFront) {
                  layer.bringToFront();
                }
              }

              console.log("SIMITI selected KHDTK:", props.namobj || props);
              requestAnimationFrame(() => syncSelectedSpatialFeatureBencanaClip());
            } else if (
              !BENCANA_FOCUS_LAYERS.has(String(tableName)) &&
              ["Polygon", "MultiPolygon"].includes(String(feature?.geometry?.type))
            ) {
              // Klik polygon non-risiko di peta = target clip risiko.
              // Jangan mengunci feature risiko itu sendiri sebagai batas clip.
              selectedSpatialFeatureRef.current = {
                layerType: "map-polygon",
                feature,
                layer,
              };

              console.log("SIMITI selected map polygon for risk clip:", {
                sourceLayer: tableName,
                properties: feature?.properties || {},
              });

              requestAnimationFrame(() => syncSelectedSpatialFeatureBencanaClip());
            }

            openEnterpriseIdentify(
              feature,
              tableName,
              event?.latlng,
              "SIMITI GIS",
            );
          });
          if (zoom > 8 && feature.properties) {
            let popupContent =
              '<div style="max-height: 200px; overflow-y: auto;">';
            popupContent += `<h3 style="margin: 0 0 8px 0; font-weight: bold;">${tableName}</h3>`;
            for (const [key, value] of Object.entries(feature.properties)) {
              if (key !== "geom" && key !== "geometry") {
                popupContent += `<p style="margin: 2px 0;"><strong>${key}:</strong> ${value}</p>`;
              }
            }
            popupContent += "</div>";
            layer.bindPopup(popupContent);
          }
        },
      });
      (layerGroup as any)._simitiExactGeometryClip =
        adminGeometryClipApplied ||
        (BENCANA_FOCUS_LAYERS.has(String(tableName)) &&
          selectedSpatialFeatureRef.current?.layerType === "khdtk");

      if (
        layerRequestSeqRef.current[tableName] !== requestId ||
        mapInstanceRef.current !== mapAtRequest ||
        !isLeafletMapUsable(mapAtRequest)
      ) {
        console.log(`⏭️ Layer ${tableName} stale sebelum addTo(map)`);
        return;
      }

      if (!safeAddMapLayer(mapAtRequest, layerGroup)) {
        throw new Error(`Leaflet gagal menambahkan layer ${tableName}`);
      }

      // Pastikan polygon memakai warna yang sama dengan legenda setelah terpasang.
      if (tableName === "kawasan_hutan") {
        let coloredFeatures = 0;
        let fallbackFeatures = 0;
        layerGroup.eachLayer((featureLayer: any) => {
          const props = featureLayer?.feature?.properties || {};
          const fungsikws = String(props.fungsikws ?? "").trim();
          const fillColor =
            colorMappingRef.current.kawasanHutan.get(fungsikws) ||
            colorMap.get(fungsikws);
          if (fillColor && featureLayer?.setStyle) {
            featureLayer.setStyle({
              color: fillColor,
              fillColor,
              weight: 1,
              opacity: 1,
              fillOpacity: 0.68,
              lineCap: "round",
              lineJoin: "round",
            });
            coloredFeatures++;
          } else {
            fallbackFeatures++;
            if (featureLayer?.setStyle) {
              featureLayer.setStyle({
                color: "#808080",
                fillColor: "#808080",
                weight: 1,
                opacity: 1,
                fillOpacity: 0.68,
              });
            }
          }
        });
        console.info("SIMITI: warna polygon Kawasan Hutan diterapkan", {
          total: coloredFeatures + fallbackFeatures,
          colored: coloredFeatures,
          tanpaMapping: fallbackFeatures,
          jumlahKelasLegenda: colorMappingRef.current.kawasanHutan.size,
        });
      }

      // Bencana sudah difilter oleh API berdasarkan selectedAreas/adminFilter.
      // Jangan pasang SVG clip-path lagi karena dapat membuat polygon/marker hilang.

      layerCacheRef.current.set(tableName, layerGroup);

      // Cek apakah layer ini punya bottom tab
      const hasBottomTab = layersWithBottomTabs.includes(tableName);

      // Jika layer punya bottom tab, hanya tampilkan jika sesuai dengan activeBottomTab
      if (hasBottomTab) {
        // Mapping dari tableName ke tab id
        const tabMapping: Record<string, string> = {
          tutupan_lahan: "tutupanLahan",
          penutupan_lahan_2024: "penutupanLahan2024",
          pl2024: "pl2024",
          jenis_tanah: "jenisTanah",
          geologi: "geologi",
          lahan_kritis: "lahan_kritis",
          rawan_erosi: "rawan_erosi",
          rawan_longsor: "rawan_longsor",
          rawan_limpasan: "rawan_limpasan",
          rawan_karhutla: "rawan_karhutla",
        };

        // Semua layer risiko memiliki tab dengan ID yang sama dengan nama tabel.
        // Ini penting untuk risiko_karhutla/risiko_kekeringan/dll: tanpa mapping
        // generik, layer hanya tersimpan di cache dan tidak pernah masuk ke peta.
        const correspondingTab = BENCANA_FOCUS_LAYERS.has(String(tableName))
          ? String(tableName)
          : tabMapping[tableName];

        // Hanya add ke map jika tab nya sedang aktif
        if (correspondingTab === activeBottomTab) {
          console.log(
            `✅ Layer "${tableName}" ditampilkan (sesuai active tab)`,
          );
        } else {
          console.log(
            `💾 Layer "${tableName}" disimpan di cache (tab tidak aktif)`,
          );
        }
      } else {
        // Layer tanpa bottom tab langsung ditampilkan
        layerGroup.addTo(mapInstanceRef.current);
        console.log(`✅ Layer "${tableName}" ditampilkan (no bottom tab)`);
      }

      // Pastikan request masih yang terbaru sebelum menyimpan reference layer.
      if (layerRequestSeqRef.current[tableName] !== requestId) {
        safeRemoveMapLayer(layerGroup);
        return;
      }

      cleanupLegacyBencanaCircleMarkers();

      // SIMITI: WARNA TEMATIK TANPA BLEND WARNA ANTARLAYER.
      // Pertahankan warna tiap risiko; pola irisan akan ditangani terpisah.
      if (BENCANA_FOCUS_LAYERS.has(String(tableName))) {
        const forcedBencanaColor = getBencanaLayerColor(String(tableName));

        layerGroup.eachLayer((layer: any) => {
          try {
            if (layer?._path?.style) layer._path.style.mixBlendMode = "normal";
            const classColor =
              getBencanaLegendFeatureColor(String(tableName), layer?.feature) ||
              forcedBencanaColor;
            const style = {
              color: classColor,
              fillColor: classColor,
              weight: zoom > 10 ? 2.2 : 1.6,
              opacity: 1,
              fillOpacity: 0.68,
              lineCap: "round",
              lineJoin: "round",
            };
            if (layer?.setStyle) layer.setStyle(style);
            if (layer?.options) Object.assign(layer.options, style);
          } catch (styleError) {
            console.warn("SIMITI: gagal menerapkan warna risiko:", tableName, styleError);
          }
        });

        console.log(`SIMITI RISK COLOR: ${tableName} -> ${forcedBencanaColor}`);
      }
      layerGroupsRef.current[tableName] = layerGroup;
      if (BENCANA_FOCUS_LAYERS.has(String(tableName))) {
        const selectedSpatialFocus = selectedSpatialFeatureRef.current;
        if (
          selectedDas.length === 0 &&
          selectedSpatialFocus?.layerType === "khdtk" &&
          selectedSpatialFocus?.feature?.geometry
        ) {
          requestAnimationFrame(() => {
            applyBencanaClipToSelectedKhdtk(String(tableName));
          });
        } else {
          const selectedAdminClipAreas =
            selectedAreaBencanaClipPathRef.current?.areas ||
            getDeepestSelectedAdminAreas(selectedAreas);
          if (selectedAdminClipAreas.length && selectedDas.length === 0) {
            requestAnimationFrame(() =>
              applyBencanaClipToLayer(String(tableName), selectedAdminClipAreas),
            );
          }
        }
      }
  // SIMITI_HATCH_REFRESH_ON_LOAD
  // Overlay overlap dihitung pairwise dan sangat mahal untuk layer nasional.
      // Dinonaktifkan saat pemuatan layer agar interaksi peta tetap responsif.

      // Urutan layer stabil, tidak bergantung urutan checkbox diklik.
      // Semua layer risiko tetap memakai fill transparan; garis kelas dan arsiran
      // irisan membantu membaca dua sumber data pada lokasi yang sama.
      const bencanaRenderPriority: Record<string, number> = {
        risiko_banjir: 10,
        rawan_banjir: 10,
        bahaya_banjir: 10,
        risiko_banjir_bandang: 20,
        bahaya_banjir_bandang: 20,
        risiko_longsor: 30,
        rawan_longsor: 30,
        rawan_erosi: 35,
        rawan_limpasan: 40,
        risiko_karhutla: 50,
        rawan_karhutla: 50,
        risiko_abrasi: 60,
        bahaya_abrasi_dan_gelombang_ekstrim: 60,
        risiko_kekeringan: 70,
        bahaya_kekeringan: 70,
      };
      const cachedBencanaLayers = Array.from(layerCacheRef.current.entries())
        .filter(([name, cachedLayer]: [string, any]) =>
          BENCANA_FOCUS_LAYERS.has(String(name)) &&
          cachedLayer && mapInstanceRef.current?.hasLayer?.(cachedLayer),
        )
        .sort(([nameA], [nameB]) =>
          (bencanaRenderPriority[nameA] ?? 45) - (bencanaRenderPriority[nameB] ?? 45),
        );
      cachedBencanaLayers.forEach(([, cachedLayer]: [string, any]) => {
        try {
          cachedLayer.eachLayer?.((child: any) => child?.bringToFront?.());
        } catch (orderError) {
          console.warn("SIMITI: urutan layer bencana dilewati:", orderError);
        }
      });

      const filterType =
        selectedDas.length > 0
          ? "DAS filtering"
          : selectedAreas.length > 0
            ? "Admin filtering"
            : currentBounds
              ? "bounds filtering"
              : "no filtering";
      console.log(
        `✅ Layer "${tableName}" berhasil dimuat dengan ${filterType} (${geojsonData.features.length} features)`,
      );
    } catch (error) {
      console.error("❌ Error loading layer:", error);

      let errorMessage = "";
      if (error instanceof TypeError && error.message.includes("fetch")) {
        errorMessage = `🔌 Koneksi error: Tidak dapat terhubung ke server untuk layer "${tableName}".`;
      } else if (error instanceof Error && error.message.includes("HTTP")) {
        errorMessage = `❌ Server error: ${error.message} untuk layer "${tableName}".`;
      } else {
        errorMessage = `❌ Error memuat layer "${tableName}": ${error instanceof Error ? error.message : "Unknown error"}`;
      }

      setLayerError(errorMessage);

      setTimeout(() => {
        setLayerError("");
      }, 10000);
    } finally {
      setLoadingLayerNames((prev) => {
        const next = new Set(prev);
        next.delete(tableName);
        return next;
      });
      // Update isLoadingLayer based on remaining loading layers
      setTimeout(() => {
        setIsLoadingLayer(loadingLayerNames.size > 0);
      }, 0);
    }
  };

  // Request sequence menjaga hasil pencarian terbaru agar tidak ditimpa
  // respons request lama ketika pengguna mengetik cepat / mengganti level.
  const areaSearchRequestRef = useRef(0);
  const dasSearchRequestRef = useRef(0);

  const searchAreas = async (
    query: string,
    levelOverride?: typeof adminLevel,
  ) => {
    const trimmed = query.trim();
    const requestId = ++areaSearchRequestRef.current;

    if (trimmed.length < 2) {
      setAreaSearchResults([]);
      setShowAreaSearchDropdown(false);
      return;
    }

    const level = levelOverride || adminLevel;
    const params = new URLSearchParams({ query: trimmed, level });
    const latest = (targetLevel: string) =>
      [...selectedAreas].reverse().find((area) => area.level === targetLevel);

    if (level === "kabupaten") {
      const parent = latest("provinsi");
      if (parent?.provinsi) params.set("provinsi", parent.provinsi);
    } else if (level === "kecamatan") {
      const parent = latest("kabupaten");
      if (parent?.provinsi) params.set("provinsi", parent.provinsi);
      if (parent?.kab_kota) params.set("kab_kota", parent.kab_kota);
    } else if (level === "kelurahan") {
      const parent = latest("kecamatan");
      if (parent?.provinsi) params.set("provinsi", parent.provinsi);
      if (parent?.kab_kota) params.set("kab_kota", parent.kab_kota);
      if (parent?.kecamatan) params.set("kecamatan", parent.kecamatan);
    }

    try {
      const response = await fetch(
        `${API_URL}/api/areas/search?${params.toString()}`,
        { headers: { Accept: "application/json" } },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (requestId !== areaSearchRequestRef.current) return;
      const results = Array.isArray(data) ? data : [];
      setAreaSearchResults(results);
      setShowAreaSearchDropdown(results.length > 0);
    } catch (error) {
      if (requestId !== areaSearchRequestRef.current) return;
      console.error("Error searching areas:", error);
      setAreaSearchResults([]);
      setShowAreaSearchDropdown(false);
    }
  };
  useEffect(() => {
    const checkExistingSession = async () => {
      const token = localStorage.getItem("adminToken");
      const userStr = localStorage.getItem("adminUser");

      if (token && userStr) {
        try {
          const response = await fetch(`${API_URL}/api/admin/verify`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          });

          const data = await response.json();

          if (data.success) {
            setIsAuthenticated(true);
          } else {
            localStorage.removeItem("adminToken");
            localStorage.removeItem("adminUser");
            setIsAuthenticated(false);
          }
        } catch (error) {
          console.error("Token verification failed:", error);
          localStorage.removeItem("adminToken");
          localStorage.removeItem("adminUser");
          setIsAuthenticated(false);
        }
      }
    };

    checkExistingSession();
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;

    // List layer yang merupakan data layer (bukan boundary)
    const dataLayers = [
      "tutupan_lahan",
      "penutupan_lahan_2024",
      "pl2024",
      "geologi",
      "jenis_tanah",
      "lahan_kritis",
      "rawan_erosi",
      "rawan_banjir",
      "rawan_longsor",
      "rawan_limpasan",
      "rawan_karhutla",
      "bahaya_kekeringan",
      "bahaya_abrasi_dan_gelombang_ekstrim",
      "bahaya_banjir",
      "bahaya_banjir_bandang",
      "dta_danau",
      "rehabilitasi_das",
      "rehabilitasi_hutan",
      "karhutla_2021",
      "karhutla_2022",
      "karhutla_2023",
      "karhutla_2024",
      "karhutla_2025",
      "kawasan_hutan",
      "risiko_banjir",
      "risiko_banjir_bandang",
      "risiko_kekeringan",
      "risiko_abrasi",
      "risiko_longsor",
      "risiko_karhutla",
      "khdtk",
      "bendung",
      "bendungan",
      "danau",
      "embung",
      "situ",
      "pengaman_pantai",
      "pengendali_sedimen",
      "pompa_air",
    ];

    // Jika ada layer yang sebelumnya di-hover, reset hanya layer tersebut
    if (hoveredLayerType && dataLayers.includes(hoveredLayerType)) {
      const layerGroup = layerGroupsRef.current[hoveredLayerType];
      if (layerGroup && typeof layerGroup.eachLayer === "function") {
        layerGroup.eachLayer((layer: any) => {
          if (layer.setStyle && layer.feature) {
            const zoom = mapInstanceRef.current
              ? mapInstanceRef.current.getZoom()
              : 10;

            if (INFRA_IDS.includes(hoveredLayerType as any)) {
              // Reset circleMarker ke style awal
              const infraColor =
                INFRA_LAYERS.find((l) => l.id === hoveredLayerType)?.color ||
                "#808080";
              layer.setStyle({
                radius: zoom > 10 ? 6 : 4,
                fillColor: infraColor,
                color: "#000",
                weight: 1,
                opacity: 1,
                fillOpacity: 0.7,
              });
            } else {
              // Reset polygon ke warna aslinya
              let originalColor = "#3b82f6";

              if (BENCANA_FOCUS_LAYERS.has(String(hoveredLayerType))) {
                originalColor = getBencanaLayerColor(String(hoveredLayerType));
              } else if (hoveredLayerType === "tutupan_lahan") {
                const pl2024_id = String(layer.feature.properties.pl2024_id);
                originalColor =
                  colorMappingRef.current.tutupanLahan.get(pl2024_id) ||
                  "#3b82f6";
              } else if (hoveredLayerType === "penutupan_lahan_2024") {
                const pl2024_id = String(layer.feature.properties.pl2024_id);
                originalColor =
                  colorMappingRef.current.penutupanLahan2024.get(pl2024_id) ||
                  "#3b82f6";
              } else if (hoveredLayerType === "pl2024") {
                const pl2024_id = String(layer.feature.properties.pl2024_id);
                originalColor =
                  colorMappingRef.current.pl2024.get(pl2024_id) || "#3b82f6";
              } else if (hoveredLayerType === "geologi") {
                const key = `${layer.feature.properties.namobj || ""}|${layer.feature.properties.umurobj || ""}`;
                originalColor =
                  colorMappingRef.current.geologi.get(key) || "#B45309";
              } else if (hoveredLayerType === "jenis_tanah") {
                originalColor =
                  colorMappingRef.current.jenisTanah.get(
                    layer.feature.properties.jntnh1,
                  ) || "#8B4513";
              } else if (hoveredLayerType === "lahan_kritis") {
                originalColor =
                  colorMappingRef.current.lahanKritis.get(
                    layer.feature.properties.kritis,
                  ) || "#808080";
              } else if (hoveredLayerType === "rawan_erosi") {
                originalColor =
                  colorMappingRef.current.rawanErosi.get(
                    layer.feature.properties.keterangan,
                  ) || "#808080";
              } else if (hoveredLayerType === "rawan_longsor") {
                originalColor =
                  colorMappingRef.current.rawanLongsor.get(
                    layer.feature.properties.unsur,
                  ) || "#808080";
              } else if (hoveredLayerType === "rawan_limpasan") {
                originalColor =
                  colorMappingRef.current.rawanLimpasan.get(
                    layer.feature.properties.limpasan,
                  ) || "#808080";
              } else if (hoveredLayerType === "rawan_karhutla") {
                originalColor =
                  colorMappingRef.current.rawanKarhutla.get(
                    layer.feature.properties.kelas,
                  ) || "#808080";
              } else if (hoveredLayerType === "bahaya_kekeringan") {
                originalColor =
                  colorMappingRef.current.bahayaKekeringan.get(
                    layer.feature.properties.kelas,
                  ) || "#808080";
              } else if (
                hoveredLayerType === "bahaya_abrasi_dan_gelombang_ekstrim"
              ) {
                originalColor =
                  colorMappingRef.current.bahayaAbrasi.get(
                    layer.feature.properties.kelas,
                  ) || "#808080";
              } else if (hoveredLayerType === "bahaya_banjir") {
                originalColor =
                  colorMappingRef.current.bahayaBanjir.get(
                    layer.feature.properties.kelas,
                  ) || "#808080";
              } else if (hoveredLayerType === "bahaya_banjir_bandang") {
                originalColor =
                  colorMappingRef.current.bahayaBanjirBandang.get(
                    layer.feature.properties.kelas,
                  ) || "#808080";
              } else if (hoveredLayerType === "dta_danau") {
                originalColor =
                  colorMappingRef.current.dtaDanau.get(
                    layer.feature.properties.tipe_danau,
                  ) || "#808080";
              } else if (hoveredLayerType === "rehabilitasi_das") {
                originalColor =
                  colorMappingRef.current.rehabilitasiDas.get(
                    layer.feature.properties.bpdas,
                  ) || "#808080";
              } else if (hoveredLayerType === "rehabilitasi_hutan") {
                originalColor =
                  colorMappingRef.current.rehabilitasiHutan.get(
                    String(layer.feature.properties.jenis_tana),
                  ) || "#808080";
              } else if (hoveredLayerType === "karhutla_2021") {
                originalColor =
                  colorMappingRef.current.kebakaran2021.get(
                    String(layer.feature.properties.periode),
                  ) || "#808080";
              } else if (hoveredLayerType === "karhutla_2022") {
                originalColor =
                  colorMappingRef.current.kebakaran2022.get(
                    String(layer.feature.properties.periode),
                  ) || "#808080";
              } else if (hoveredLayerType === "karhutla_2023") {
                originalColor =
                  colorMappingRef.current.kebakaran2023.get(
                    String(layer.feature.properties.periode),
                  ) || "#808080";
              } else if (hoveredLayerType === "karhutla_2024") {
                originalColor =
                  colorMappingRef.current.kebakaran2024.get(
                    String(layer.feature.properties.periode),
                  ) || "#808080";
              } else if (hoveredLayerType === "karhutla_2025") {
                originalColor =
                  colorMappingRef.current.kebakaran2025.get(
                    String(layer.feature.properties.periode),
                  ) || "#808080";
              } else if (hoveredLayerType === "kawasan_hutan") {
                originalColor =
                  colorMappingRef.current.kawasanHutan.get(
                    String(layer.feature.properties.fungsikws ?? "").trim(),
                  ) || "#808080";
              } else if (
                [
                  "risiko_banjir",
                  "risiko_banjir_bandang",
                  "risiko_kekeringan",
                  "risiko_abrasi",
                  "risiko_longsor",
                  "risiko_karhutla",
                ].includes(hoveredLayerType)
              ) {
                const refKeyMap: Record<
                  string,
                  keyof typeof colorMappingRef.current
                > = {
                  risiko_banjir: "risikoBanjir",
                  risiko_banjir_bandang: "risikoBanjirBandang",
                  risiko_kekeringan: "risikoKekeringan",
                  risiko_abrasi: "risikoAbrasi",
                  risiko_longsor: "risikoLongsor",
                  risiko_karhutla: "risikoKarhutla",
                };
                const refKey = refKeyMap[hoveredLayerType];
                originalColor =
                  getBencanaLegendFeatureColor(
                    String(hoveredLayerType),
                    layer.feature,
                  ) ||
                  colorMappingRef.current[refKey]?.get(
                    layer.feature.properties.kelas || "",
                  ) ||
                  "#808080";
              } else if (hoveredLayerType === "khdtk") {
                originalColor =
                  colorMappingRef.current.khdtk.get(
                    layer.feature.properties.namobj || "",
                  ) || "#808080";
              }

              layer.setStyle({
                color: originalColor,
                weight: zoom > 10 ? 2 : 1,
                opacity: 0.8,
                fillColor: originalColor,
                fillOpacity: zoom > 10 ? 0.4 : 0.3,
              });
            }
          }
        });
      }
    }

    // Hover bersifat sementara. Jika tidak sedang hover, gunakan legend yang
    // dipilih dengan CLICK agar highlight tetap bertahan setelah mouse keluar.
    const highlightKey = hoveredLayerKey || selectedLegendKey;
    const highlightType = hoveredLayerType || selectedLegendType;
    const highlightColor = hoveredLayerColor || selectedLegendColor;

    if (
      highlightKey &&
      highlightType &&
      highlightColor &&
      dataLayers.includes(highlightType)
    ) {
      const layerGroup = layerGroupsRef.current[highlightType];
      if (layerGroup && typeof layerGroup.eachLayer === "function") {
        layerGroup.eachLayer((layer: any) => {
          if (layer.feature && layer.setStyle) {
            let shouldHighlight = false;

            // Tentukan apakah layer ini yang harus di-highlight
            if (highlightType === "tutupan_lahan") {
              shouldHighlight =
                String(layer.feature.properties.pl2024_id) === highlightKey;
            } else if (highlightType === "penutupan_lahan_2024") {
              shouldHighlight =
                String(layer.feature.properties.pl2024_id) === highlightKey;
            } else if (highlightType === "pl2024") {
              shouldHighlight =
                String(layer.feature.properties.pl2024_id) === highlightKey;
            } else if (highlightType === "geologi") {
              const key = `${layer.feature.properties.namobj || ""}|${layer.feature.properties.umurobj || ""}`;
              shouldHighlight = key === highlightKey;
            } else if (highlightType === "jenis_tanah") {
              shouldHighlight =
                layer.feature.properties.jntnh1 === highlightKey;
            } else if (highlightType === "lahan_kritis") {
              shouldHighlight =
                layer.feature.properties.kritis === highlightKey;
            } else if (highlightType === "rawan_erosi") {
              shouldHighlight =
                layer.feature.properties.keterangan === highlightKey;
            } else if (highlightType === "rawan_longsor") {
              shouldHighlight = layer.feature.properties.unsur === highlightKey;
            } else if (highlightType === "rawan_limpasan") {
              shouldHighlight =
                layer.feature.properties.limpasan === highlightKey;
            } else if (highlightType === "rawan_karhutla") {
              shouldHighlight = layer.feature.properties.kelas === highlightKey;
            } else if (highlightType === "bahaya_kekeringan") {
              shouldHighlight = layer.feature.properties.kelas === highlightKey;
            } else if (
              highlightType === "bahaya_abrasi_dan_gelombang_ekstrim"
            ) {
              shouldHighlight = layer.feature.properties.kelas === highlightKey;
            } else if (highlightType === "bahaya_banjir") {
              shouldHighlight = layer.feature.properties.kelas === highlightKey;
            } else if (highlightType === "bahaya_banjir_bandang") {
              shouldHighlight = layer.feature.properties.kelas === highlightKey;
            } else if (highlightType === "dta_danau") {
              shouldHighlight =
                layer.feature.properties.tipe_danau === highlightKey;
            } else if (highlightType === "rehabilitasi_das") {
              shouldHighlight = layer.feature.properties.bpdas === highlightKey;
            } else if (highlightType === "rehabilitasi_hutan") {
              shouldHighlight =
                String(layer.feature.properties.jenis_tana) === highlightKey;
            } else if (highlightType === "karhutla_2021") {
              shouldHighlight =
                String(layer.feature.properties.periode) === highlightKey;
            } else if (highlightType === "karhutla_2022") {
              shouldHighlight =
                String(layer.feature.properties.periode) === highlightKey;
            } else if (highlightType === "karhutla_2023") {
              shouldHighlight =
                String(layer.feature.properties.periode) === highlightKey;
            } else if (highlightType === "karhutla_2024") {
              shouldHighlight =
                String(layer.feature.properties.periode) === highlightKey;
            } else if (highlightType === "karhutla_2025") {
              shouldHighlight =
                String(layer.feature.properties.periode) === highlightKey;
            } else if (highlightType === "kawasan_hutan") {
              shouldHighlight =
                String(layer.feature.properties.fungsikws ?? "").trim() ===
                highlightKey;
            } else if (
              [
                "risiko_banjir",
                "risiko_banjir_bandang",
                "risiko_kekeringan",
                "risiko_abrasi",
                "risiko_longsor",
                "risiko_karhutla",
              ].includes(highlightType)
            ) {
              shouldHighlight = layer.feature.properties.kelas === highlightKey;
            } else if (highlightType === "khdtk") {
              shouldHighlight =
                layer.feature.properties.namobj === highlightKey;
            } else if (INFRA_IDS.includes(highlightType as any)) {
              const infraLayer = INFRA_LAYERS.find(
                (l) => l.id === highlightType,
              );
              const nameKey = infraLayer?.cols[0].k || "nama_infra";
              shouldHighlight =
                String(layer.feature.properties[nameKey] ?? "") ===
                highlightKey;
            }

            if (shouldHighlight) {
              const currentZoom = mapInstanceRef.current
                ? mapInstanceRef.current.getZoom()
                : 10;
              if (INFRA_IDS.includes(highlightType as any)) {
                // Point/circleMarker highlight
                layer.setStyle({
                  radius: currentZoom > 10 ? 10 : 8,
                  fillColor: highlightColor,
                  color: "#fff",
                  weight: 2,
                  opacity: 1,
                  fillOpacity: 1,
                });
              } else {
                // Polygon highlight
                layer.setStyle({
                  color: highlightColor,
                  weight: 5,
                  opacity: 1,
                  fillColor: highlightColor,
                  fillOpacity: 0.8,
                });
              }

              // Bringkan layer ke depan
              if (layer.bringToFront) {
                layer.bringToFront();
              }
            }
          }
        });
      }
    }
  }, [
    hoveredLayerKey,
    hoveredLayerType,
    hoveredLayerColor,
    selectedLegendKey,
    selectedLegendType,
    selectedLegendColor,
    selectedAreas,
  ]);

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");
    setIsAuthenticated(false);
  };

  const fetchTutupanLahanData = async (): Promise<
    Array<{
      pl2024_id: number;
      deskripsi_domain: string;
      luas_total: number;
      color: string;
    }>
  > => {
    if (!mapInstanceRef.current) return [];

    try {
      let boundsString = "";

      if (currentBounds) {
        const [[minLat, minLng], [maxLat, maxLng]] = currentBounds;
        boundsString = `${minLat},${minLng},${maxLat},${maxLng}`;
      } else {
        boundsString = "-11,95,6,141";
      }

      const dasFilter =
        selectedDas.length > 0 ? selectedDas.map((d) => d.nama_das) : null;
      const dasFilterParam = dasFilter
        ? `&dasFilter=${encodeURIComponent(JSON.stringify(dasFilter))}`
        : "";

      const response = await fetch(
        `${API_URL}/api/tutupan-lahan/data?bounds=${boundsString}${dasFilterParam}`,
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        // Assign colors to each unique deskripsi_domain
        const dataWithColors = result.data.map((item: any) => ({
          ...item,
          color: tutupanLahanColors[item.deskripsi_domain] || "#999999",
        }));

        setTutupanLahanData(dataWithColors);
        return dataWithColors; // RETURN DATA
      }

      return [];
    } catch (error) {
      console.error("Error fetching tutupan lahan data:", error);
      setTutupanLahanData([]);
      return [];
    }
  };

  const fetchPenutupanLahan2024Data = async (): Promise<
    Array<{
      pl2024_id: number;
      deskripsi_domain: string;
      luas_total: number;
      color: string;
    }>
  > => {
    if (!mapInstanceRef.current) return [];

    try {
      let boundsString = "";

      if (currentBounds) {
        const [[minLat, minLng], [maxLat, maxLng]] = currentBounds;
        boundsString = `${minLat},${minLng},${maxLat},${maxLng}`;
      } else {
        boundsString = "-11,95,6,141";
      }

      const dasFilter =
        selectedDas.length > 0 ? selectedDas.map((d) => d.nama_das) : null;
      const dasFilterParam = dasFilter
        ? `&dasFilter=${encodeURIComponent(JSON.stringify(dasFilter))}`
        : "";

      const response = await fetch(
        `${API_URL}/api/penutupan-lahan-2024/data?bounds=${boundsString}${dasFilterParam}`,
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        // Assign colors to each unique deskripsi_domain
        const dataWithColors = result.data.map((item: any) => ({
          ...item,
          color: tutupanLahanColors[item.deskripsi_domain] || "#999999",
        }));

        setPenutupanLahan2024Data(dataWithColors);
        return dataWithColors; // RETURN DATA
      }

      return [];
    } catch (error) {
      console.error("Error fetching tutupan lahan data:", error);
      setPenutupanLahan2024Data([]);
      return [];
    }
  };

  const fetchPL2024 = async (): Promise<
    Array<{
      pl2024_id: number;
      deskripsi_domain: string;
      luas_total: number;
      color: string;
    }>
  > => {
    if (!mapInstanceRef.current) return [];

    try {
      let boundsString = "";

      if (currentBounds) {
        const [[minLat, minLng], [maxLat, maxLng]] = currentBounds;
        boundsString = `${minLat},${minLng},${maxLat},${maxLng}`;
      } else {
        boundsString = "-11,95,6,141";
      }

      const dasFilter =
        selectedDas.length > 0 ? selectedDas.map((d) => d.nama_das) : null;
      const dasFilterParam = dasFilter
        ? `&dasFilter=${encodeURIComponent(JSON.stringify(dasFilter))}`
        : "";

      const response = await fetch(
        `${API_URL}/api/pl-2024/data?bounds=${boundsString}${dasFilterParam}`,
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        // Assign colors to each unique deskripsi_domain
        const dataWithColors = result.data.map((item: any) => ({
          ...item,
          color: tutupanLahanColors[item.deskripsi_domain] || "#999999",
        }));

        setPL2024Data(dataWithColors);
        return dataWithColors; // RETURN DATA
      }

      return [];
    } catch (error) {
      console.error("Error fetching tutupan lahan data:", error);
      setPL2024Data([]);
      return [];
    }
  };

  const fetchGeologiData = async (): Promise<
    Array<{
      namobj: string;
      umurobj: string;
      keliling_total: number;
      color: string;
    }>
  > => {
    if (!mapInstanceRef.current) return [];

    try {
      let boundsString = "";

      if (currentBounds) {
        const [[minLat, minLng], [maxLat, maxLng]] = currentBounds;
        boundsString = `${minLat},${minLng},${maxLat},${maxLng}`;
      } else {
        boundsString = "-11,95,6,141";
      }

      const dasFilter =
        selectedDas.length > 0 ? selectedDas.map((d) => d.nama_das) : null;
      const dasFilterParam = dasFilter
        ? `&dasFilter=${encodeURIComponent(JSON.stringify(dasFilter))}`
        : "";

      const response = await fetch(
        `${API_URL}/api/geologi/data?bounds=${boundsString}${dasFilterParam}`,
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        // PERBAIKAN: Deduplikasi di frontend juga untuk memastikan unique combinations
        const uniqueMap = new Map<string, any>();

        result.data.forEach((item: any) => {
          const key = `${item.namobj}|${item.umurobj}`;
          if (uniqueMap.has(key)) {
            // Jika sudah ada, akumulasi keliling_total
            const existing = uniqueMap.get(key);
            existing.keliling_total += parseFloat(item.keliling_total || 0);
          } else {
            uniqueMap.set(key, {
              namobj: item.namobj,
              umurobj: item.umurobj,
              keliling_total: parseFloat(item.keliling_total || 0),
            });
          }
        });

        // Convert map to array dan assign colors
        const uniqueData = Array.from(uniqueMap.values());
        const dataWithColors = uniqueData.map((item: any, index: number) => ({
          ...item,
          color: geologiColors[index % geologiColors.length],
        }));

        console.log(
          "Unique geologi data after deduplication:",
          dataWithColors.length,
        );

        setGeologiData(dataWithColors);
        return dataWithColors;
      }

      return [];
    } catch (error) {
      console.error("Error fetching geologi data:", error);
      setGeologiData([]);
      return [];
    }
  };

  const fetchKejadianListings = async () => {
    try {
      // Ambil semua layer kejadian otomatis yang aktif (yang ada di activeKejadianLayers)
      const activeKejadianLayerNames = Array.from(activeLayers).filter(
        (name) =>
          name.startsWith("kejadian_") && activeKejadianLayers.has(name),
      );

      console.log(
        "Fetching listings for kejadian layers:",
        activeKejadianLayerNames,
      );
      console.log(
        "activeKejadianLayers Map:",
        Array.from(activeKejadianLayers.entries()),
      );

      if (activeKejadianLayerNames.length === 0) {
        console.log("No active auto kejadian layers");
        setKejadianListings([]);
        return;
      }

      let boundsString = "";
      if (currentBounds) {
        const [[minLat, minLng], [maxLat, maxLng]] = currentBounds;
        boundsString = `${minLat},${minLng},${maxLat},${maxLng}`;
      } else {
        boundsString = "-11,95,6,141";
      }

      const dasFilter =
        selectedDas.length > 0 ? selectedDas.map((d) => d.nama_das) : null;
      const dasFilterParam = dasFilter
        ? `&dasFilter=${encodeURIComponent(JSON.stringify(dasFilter))}`
        : "";

      // Filter administrasi mengikuti wilayah yang dipilih pengguna.
      // Bounds tetap dipakai sebagai batas spasial tambahan.
      let adminFilterParam = "";

      if (selectedAreas.length > 0 && selectedDas.length === 0) {
        const levelOrder: Record<string, number> = {
          provinsi: 1,
          kabupaten: 2,
          kecamatan: 3,
          kelurahan: 4,
        };

        const selectedLevel = selectedAreas.reduce((deepest, area) =>
          (levelOrder[area.level] ?? 0) > (levelOrder[deepest.level] ?? 0)
            ? area
            : deepest,
        ).level;

        const adminNames = selectedAreas
          .filter((area: any) => area.level === selectedLevel)
          .map((area: any) => {
            switch (area.level) {
              case "provinsi":
                return area.provinsi || area.label || "";
              case "kabupaten":
                return area.kab_kota || area.label || "";
              case "kecamatan":
                return area.kecamatan || area.label || "";
              case "kelurahan":
                return area.kel_desa || area.label || "";
              default:
                return area.label || "";
            }
          })
          .filter(Boolean);

        if (adminNames.length > 0) {
          adminFilterParam =
            `&adminFilter=${encodeURIComponent(JSON.stringify(adminNames))}` +
            `&adminLevel=${encodeURIComponent(selectedLevel)}`;
        }
      }

      const allListings: any[] = [];

      for (const layerName of activeKejadianLayerNames) {
        const metadata = activeKejadianLayers.get(layerName);
        if (!metadata) {
          console.warn("No metadata found for layer:", layerName);
          continue;
        }

        const categoryParam = `&category=${encodeURIComponent(metadata.category)}`;

        console.log(
          `Fetching listings for ${metadata.category} ${metadata.year}...`,
        );

        const response = await fetch(
          `${API_URL}/api/kejadian/by-year/${metadata.year}?bounds=${boundsString}${dasFilterParam}${adminFilterParam}${categoryParam}`,
        );

        if (!response.ok) {
          console.error(`Failed to fetch listings for ${layerName}`);
          continue;
        }

        const data = await response.json();
        console.log(
          `Received ${data.features?.length || 0} features for ${metadata.category} ${metadata.year}`,
        );

        if (data.features && data.features.length > 0) {
          const mappedData = data.features.map((f: any) => {
            const props = f.properties;
            const coords = f.geometry.coordinates;

            console.log("Feature properties for listing:", props);
            console.log("Geometry coordinates:", coords);

            // Format data sama seperti di marker
            return {
              id: props.id,
              title: props.title,
              location: props.location,
              category: props.category,
              date: props.date,
              das: props.das,
              description: props.description,
              thumbnail_path: props.thumbnail_path,
              images_paths: props.images_paths,
              latitude: coords[1],
              longitude: coords[0],
              featured: props.featured || false,
              curah_hujan: props.curah_hujan,
            };
          });
          allListings.push(...mappedData);
        }
      }

      console.log("Total kejadian listings fetched:", allListings.length);

      // Sort by date descending
      allListings.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );

      setKejadianListings(allListings);
    } catch (error) {
      console.error("Error fetching kejadian listings:", error);
      setKejadianListings([]);
    }
  };

  const fetchKejadianPhotos = async () => {
    try {
      const activeKejadianLayerNames = Array.from(activeLayers).filter((name) =>
        name.startsWith("kejadian_"),
      );

      console.log(
        "Fetching photos for active kejadian layers:",
        activeKejadianLayerNames,
      );

      if (activeKejadianLayerNames.length === 0) {
        console.log("No active kejadian layers");
        setKejadianPhotos([]);
        return;
      }

      // PERBAIKAN: Ambil year DAN category dari active kejadian layers
      const layersMetadata = activeKejadianLayerNames
        .map((name) => {
          const metadata = activeKejadianLayers.get(name);
          return metadata;
        })
        .filter((metadata) => metadata !== undefined);

      if (layersMetadata.length === 0) {
        console.log("No valid layers metadata found");
        setKejadianPhotos([]);
        return;
      }

      let boundsString = "";
      if (currentBounds) {
        const [[minLat, minLng], [maxLat, maxLng]] = currentBounds;
        boundsString = `${minLat},${minLng},${maxLat},${maxLng}`;
      } else {
        boundsString = "-11,95,6,141";
      }

      console.log("Fetching photos with bounds:", boundsString);

      const allPhotos: any[] = [];

      // PERBAIKAN: Loop berdasarkan year DAN category
      for (const metadata of layersMetadata) {
        // Build URL dengan filter year DAN category
        let url = `${API_URL}/api/kejadian/photos?year=${metadata.year}&bounds=${boundsString}`;

        // TAMBAHKAN category filter
        if (metadata.category) {
          url += `&category=${encodeURIComponent(metadata.category)}`;
        }

        // Prioritas: selectedDas > selectedAreas
        if (selectedDas.length > 0) {
          const dasNames = selectedDas.map((d) => d.nama_das);
          url += `&dasFilter=${encodeURIComponent(JSON.stringify(dasNames))}`;
          console.log("Using DAS filter for photos:", dasNames);
        } else if (selectedAreas.length > 0) {
          const firstArea = selectedAreas[0];
          const adminLevel = firstArea.level;

          const adminNames = selectedAreas
            .map((area) => {
              switch (area.level) {
                case "provinsi":
                  return area.provinsi!;
                case "kabupaten":
                  return area.kab_kota!;
                case "kecamatan":
                  return area.kecamatan!;
                case "kelurahan":
                  return area.kel_desa!;
                default:
                  return "";
              }
            })
            .filter((name) => name);

          url += `&adminFilter=${encodeURIComponent(JSON.stringify(adminNames))}`;
          url += `&adminLevel=${adminLevel}`;
          console.log("Using admin filter for photos:", adminLevel, adminNames);
        }

        console.log(
          `Fetching photos for ${metadata.category} ${metadata.year}...`,
          url,
        );

        const response = await fetch(url);

        if (!response.ok) {
          console.error(
            `Failed to fetch photos for ${metadata.category} ${metadata.year}`,
          );
          continue;
        }

        const data = await response.json();
        console.log(
          `Received ${data.photos?.length || 0} photos for ${metadata.category} ${metadata.year}`,
        );

        if (data.photos && data.photos.length > 0) {
          allPhotos.push(...data.photos);
        }
      }

      console.log("Total kejadian photos fetched:", allPhotos.length);
      setKejadianPhotos(allPhotos);
    } catch (error) {
      console.error("Error fetching kejadian photos:", error);
      setKejadianPhotos([]);
    }
  };

  const loadKejadianLayer = async (
    layerName: string,
    year: number,
    category?: string,
    forceDasFilter?: string[] | null,
  ) => {
    if (!mapInstanceRef.current || !window.L) {
      console.log("Map not ready");
      return;
    }

    try {
      let boundsString = "";

      if (currentBounds) {
        const [[minLat, minLng], [maxLat, maxLng]] = currentBounds;
        boundsString = `${minLat},${minLng},${maxLat},${maxLng}`;
      } else {
        boundsString = "-11,95,6,141";
      }

      // Build URL dengan filter
      let url = `${API_URL}/api/kejadian/by-year/${year}?bounds=${boundsString}`;

      // Add category filter
      if (category) {
        url += `&category=${encodeURIComponent(category)}`;
      }

      // Prioritas: forceDasFilter > selectedDas > selectedAreas
      if (
        forceDasFilter !== undefined &&
        forceDasFilter !== null &&
        forceDasFilter.length > 0
      ) {
        url += `&dasFilter=${encodeURIComponent(JSON.stringify(forceDasFilter))}`;
        console.log("Using forced DAS filter:", forceDasFilter);
      } else if (selectedDas.length > 0) {
        const dasNames = selectedDas.map((d) => d.nama_das);
        url += `&dasFilter=${encodeURIComponent(JSON.stringify(dasNames))}`;
        console.log("Using DAS filter:", dasNames);
      } else if (selectedAreas.length > 0) {
        const firstArea = selectedAreas[0];
        const adminLevel = firstArea.level;

        const adminNames = selectedAreas
          .map((area) => {
            switch (area.level) {
              case "provinsi":
                return area.provinsi!;
              case "kabupaten":
                return area.kab_kota!;
              case "kecamatan":
                return area.kecamatan!;
              case "kelurahan":
                return area.kel_desa!;
              default:
                return "";
            }
          })
          .filter((name) => name);

        url += `&adminFilter=${encodeURIComponent(JSON.stringify(adminNames))}`;
        url += `&adminLevel=${adminLevel}`;
        console.log("Using admin filter:", adminLevel, adminNames);
      }

      console.log("Loading kejadian layer:", layerName, "Full URL:", url);

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        if (response.status === 403) {
          throw new Error(
            errorBody?.message ||
              `Akses View layer "${originalLayerName}" ditolak oleh server.`,
          );
        }
        throw new Error(
          errorBody?.message || `HTTP error! status: ${response.status}`,
        );
      }

      const geojsonData = await response.json();
      console.log(
        "Kejadian data received for",
        layerName,
        ":",
        geojsonData.features?.length || 0,
        "features",
      );

      // Hapus layer lama jika ada
      if (layerGroupsRef.current[layerName]) {
        safeRemoveMapLayer(layerGroupsRef.current[layerName]);
      }

      if (!geojsonData.features || geojsonData.features.length === 0) {
        console.warn("No kejadian found for:", layerName);
        layerGroupsRef.current[layerName] = window.L.layerGroup();
        safeAddMapLayer(
          mapInstanceRef.current,
          layerGroupsRef.current[layerName],
        );
        return;
      }

      // Function untuk create custom icon berdasarkan category
      const createKejadianIcon = (category: string, _incidentDate?: any) => {
        let iconContent = "";
        let bgColor = "#3b82f6"; // default blue
        let hoverColor = "#ef4444"; // default hover red
        let type = "banjir"; // default type

        if (category === "Banjir") {
          bgColor = "#3b82f6"; // blue
          hoverColor = "#ef4444"; // hover red (dari kebakaran)
          type = "banjir";
          iconContent = `<svg width="20" height="20" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
        </svg>`;
        } else if (category === "Tanah Longsor dan Erosi") {
          bgColor = "#f59e0b"; // orange
          hoverColor = "#3b82f6"; // hover blue (dari banjir)
          type = "longsor";
          iconContent = `<img src="/images/landslide-svgrepo-com.svg" style="width: 16px; height: 16px; filter: brightness(0) invert(1);" />`;
        } else if (
          String(category || "").toLowerCase().includes("kebakaran") ||
          String(category || "").toLowerCase().includes("karhutla")
        ) {
          // Marker Karhutla memakai warna merah konsisten tanpa palet bulanan.
          bgColor = "#DC2626";
          hoverColor = bgColor;
          type = "kebakaran";
          iconContent = `<img src="/images/fire-svgrepo-com.svg" style="width: 16px; height: 16px; filter: brightness(0) invert(1);" />`;
        }

        return window.L.divIcon({
          className: "custom-kejadian-marker",
          html: `
          <style>
            .marker-container-kejadian-${type} .marker-bg {
              fill: ${bgColor};
              transition: fill 0.3s ease;
            }
            .marker-container-kejadian-${type}:hover .marker-bg {
              fill: ${hoverColor} !important;
            }
          }
      </style>
          <div class="marker-container marker-container-kejadian-${type}" style="position: relative; width: 44px; height: 44px; cursor: pointer;">
            <svg class="marker-circle" width="44" height="44" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">
              <circle class="marker-bg" cx="22" cy="22" r="20" stroke="white" stroke-width="3" style="fill:${bgColor}; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));"/>
            </svg>
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none; display: flex; align-items: center; justify-content: center;">
              ${iconContent}
            </div>
          </div>
        `,
          iconSize: [44, 44],
          iconAnchor: [22, 22],
          popupAnchor: [0, -22],
        });
      };

      // Buat layer group dengan marker untuk setiap kejadian
      const markers: any[] = [];

      geojsonData.features.forEach((feature: any) => {
        const { coordinates } = feature.geometry;
        const props = feature.properties;

        const marker = window.L.marker([coordinates[1], coordinates[0]], {
          icon: createKejadianIcon(
            props.category,
            props.date || props.incident_date || props.tanggal,
          ),
        });

        // Store incident data - LENGKAP dengan semua field (match kejadian.tsx format)
        (marker as any).incidentData = {
          id: props.id,
          title: props.title,
          image: props.thumbnail_path
            ? `${API_URL}${props.thumbnail_path}`
            : "https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=400",
          location: props.location,
          category: props.category,
          type: props.category.toLowerCase().includes("banjir")
            ? "banjir"
            : props.category.toLowerCase().includes("longsor")
              ? "longsor"
              : "kebakaran",
          date: props.date,
          das: props.das,
          description: props.description,
          thumbnail_path: props.thumbnail_path,
          images_paths: props.images_paths,
          coordinates: [coordinates[1], coordinates[0]],
          latitude: coordinates[1],
          longitude: coordinates[0],
          featured: props.featured || false,
          curah_hujan: props.curah_hujan,
        };

        // Add click event
        marker.on("click", function (e: any) {
          const inc = (this as any).incidentData;
          if (!inc) return;

          openEnterpriseIdentify(
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [inc.longitude, inc.latitude],
              },
              properties: inc,
            },
            layerName,
            e.latlng,
            "Data Kejadian SIMITI",
          );

          const popupContent = `
          <div onclick="window.navigateToKejadianDetail()" style="width: 280px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; border-radius: 8px; overflow: hidden; cursor: pointer;">
            <div style="position: relative; width: 100%; height: 180px; overflow: hidden;">
              <img 
                src="${inc.image}" 
                alt="${inc.title}"
                style="width: 100%; height: 100%; object-fit: cover;"
              />
              
              <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.7) 100%);"></div>
              
              <button 
                onclick="event.stopPropagation(); event.preventDefault(); if(window.closeKejadianPopup) window.closeKejadianPopup();"
                style="position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; background: white; border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.2); z-index: 10; font-size: 16px; line-height: 1; color: #333; padding: 0; transition: background-color 0.2s;"
                onmouseover="this.style.backgroundColor='#f3f4f6'"
                onmouseout="this.style.backgroundColor='white'"
              >
                ×
              </button>
              
              <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 16px; z-index: 5; pointer-events: none;">
                <h3 style="margin: 0 0 4px 0; font-size: 15px; font-weight: 600; color: white; line-height: 1.3; text-shadow: 0 1px 3px rgba(0,0,0,0.3);">
                  ${inc.title}
                </h3>
                <p style="margin: 0; font-size: 13px; color: rgba(255,255,255,0.9); text-shadow: 0 1px 2px rgba(0,0,0,0.3);">
                  ${inc.location}
                </p>
              </div>
            </div>
            
            <div style="background: white; padding: 12px 16px;">
              <p style="margin: 0; font-size: 13px; color: #999;">
                Not rated yet
              </p>
            </div>
          </div>
        `;

          // Set up navigation function
          (window as any).navigateToKejadianDetail = () => {
            navigate("/detailkejadian", { state: { incident: inc } });
          };

          (window as any).closeKejadianPopup = () => {
            mapInstanceRef.current?.closePopup();
          };

          try {
            const popup = window.L.popup({
              maxWidth: 280,
              minWidth: 280,
              closeButton: false,
              className: "custom-kejadian-popup",
              autoClose: true,
              closeOnClick: true,
            })
              .setLatLng(e.latlng)
              .setContent(popupContent);

            popup.openOn(mapInstanceRef.current);
          } catch (error) {
            console.error("Error creating/opening popup:", error);
          }
        });

        markers.push(marker);
      });

      const layerGroup = window.L.layerGroup(markers);
      layerGroup.addTo(mapInstanceRef.current);
      layerGroupsRef.current[layerName] = layerGroup;

      console.log(
        "Kejadian layer loaded successfully with",
        markers.length,
        "markers",
      );

      // HAPUS manual call fetchKejadianPhotos - biarkan useEffect yang handle
    } catch (error) {
      console.error("Error loading kejadian layer:", error);
    }
  };

  // Cari lokasi dari kolom pencarian utama lalu langsung arahkan peta ke hasilnya.
  // Pencarian lokasi menggunakan endpoint geocoding backend SIMITI; browser tidak memanggil Nominatim langsung.
  const searchLocationOnMap = async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 3) return;

    const requestId = ++locationSearchRequestRef.current;
    setLocationSearchLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/api/geocode/search?q=${encodeURIComponent(trimmed)}`,
        { headers: { Accept: "application/json" } },
      );

      if (!response.ok) throw new Error(`Geocoding HTTP ${response.status}`);

      const results = await response.json();
      if (requestId !== locationSearchRequestRef.current) return;

      const result = results?.[0];
      if (!result || !mapInstanceRef.current || !window.L) {
        setLocationSearchLoading(false);
        return;
      }

      const latitude = Number(result.lat);
      const longitude = Number(result.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        setLocationSearchLoading(false);
        return;
      }

      // Pindahkan peta dengan animasi dan pertahankan marker lokasi terpilih.
      mapInstanceRef.current.flyTo([latitude, longitude], 12, {
        duration: 1.2,
      });

      if (mapWeatherMarkerRef.current) {
        mapWeatherMarkerRef.current.setLatLng([latitude, longitude]);
      } else {
        mapWeatherMarkerRef.current = window.L.marker([
          latitude,
          longitude,
        ]).addTo(mapInstanceRef.current);
      }

      mapWeatherMarkerRef.current
        .bindPopup(
          `<div style="font-size:12px;line-height:1.4"><b>${String(result.display_name || trimmed).replace(/[&<>\"]/g, "")}</b><br/><span style="color:#64748b">${latitude.toFixed(5)}, ${longitude.toFixed(5)}</span></div>`,
        )
        .openPopup();

      // Panel cuaca kanan ikut berpindah ke lokasi hasil pencarian.
      fetchMapWeather(latitude, longitude);
    } catch (error) {
      if (requestId === locationSearchRequestRef.current) {
        console.error("Gagal mencari lokasi:", error);
      }
    } finally {
      if (requestId === locationSearchRequestRef.current) {
        setLocationSearchLoading(false);
      }
    }
  };

  const handleLocationSearchChange = (value: string) => {
    setAreaSearchQuery(value);

    // Jangan query geocoder saat user masih mengetik.
    // Pencarian dijalankan hanya saat Enter agar tidak memicu rate-limit provider.
    if (locationSearchTimerRef.current) {
      clearTimeout(locationSearchTimerRef.current);
      locationSearchTimerRef.current = null;
    }

    if (value.trim().length < 3) {
      setLocationSearchLoading(false);
    }
  };

  const handleLocationSearchKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (locationSearchTimerRef.current) {
        clearTimeout(locationSearchTimerRef.current);
      }
      void searchLocationOnMap(areaSearchQuery);
    }
  };

  useEffect(() => {
    return () => {
      if (locationSearchTimerRef.current) {
        clearTimeout(locationSearchTimerRef.current);
      }
    };
  }, []);

  // Debounced search responsif: minimal 2 karakter, jeda 280 ms,
  // dan hanya hasil request terakhir yang boleh ditampilkan.
  const debouncedSearch = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleAreaSearchChange = (value: string) => {
    setAreaSearchQuery(value);
    if (debouncedSearch.current) clearTimeout(debouncedSearch.current);

    const trimmed = value.trim();
    if (trimmed.length < 2) {
      areaSearchRequestRef.current += 1;
      setAreaSearchResults([]);
      setShowAreaSearchDropdown(false);
      return;
    }
    debouncedSearch.current = setTimeout(() => void searchAreas(trimmed), 280);
  };

  const searchDas = async (query: string) => {
    const trimmed = query.trim();
    const requestId = ++dasSearchRequestRef.current;
    if (trimmed.length < 2) {
      setDasSearchResults([]);
      setShowDasSearchDropdown(false);
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/das/search?query=${encodeURIComponent(trimmed)}`,
        { headers: { Accept: "application/json" } },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (requestId !== dasSearchRequestRef.current) return;
      const results = Array.isArray(data) ? data : [];
      setDasSearchResults(results);
      setShowDasSearchDropdown(results.length > 0);
    } catch (error) {
      if (requestId !== dasSearchRequestRef.current) return;
      console.error("Error searching DAS:", error);
      setDasSearchResults([]);
      setShowDasSearchDropdown(false);
    }
  };

  const debouncedDasSearch = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDasSearchChange = (value: string) => {
    setDasSearchQuery(value);
    if (debouncedDasSearch.current) clearTimeout(debouncedDasSearch.current);

    const trimmed = value.trim();
    if (trimmed.length < 2) {
      dasSearchRequestRef.current += 1;
      setDasSearchResults([]);
      setShowDasSearchDropdown(false);
      return;
    }
    debouncedDasSearch.current = setTimeout(() => void searchDas(trimmed), 280);
  };

  useEffect(() => {
    return () => {
      if (debouncedSearch.current) clearTimeout(debouncedSearch.current);
      if (debouncedDasSearch.current) clearTimeout(debouncedDasSearch.current);
      areaSearchRequestRef.current += 1;
      dasSearchRequestRef.current += 1;
    };
  }, []);

  // Function untuk select DAS
  const handleDasSelect = (das: any) => {
    const isAlreadySelected = selectedDas.some(
      (d) => d.nama_das === das.nama_das,
    );

    if (!isAlreadySelected) {
      const newSelectedDas = [...selectedDas, das];
      setSelectedDas(newSelectedDas);

      // DAS menjadi batas clipping utama.
      // Lepaskan target polygon lama agar tidak menimpa clipping DAS.
      selectedSpatialFeatureRef.current = null;

      selectedSpatialFeatureClipListenersRef.current.forEach(
        ({ event, handler }: any) => {
          try {
            mapInstanceRef.current?.off?.(event, handler);
          } catch {}
        },
      );
      selectedSpatialFeatureClipListenersRef.current = [];

      // Bersihkan clip lama sebelum memasang clip DAS.
      clearSelectedDasClip();
      syncSelectedDasClip(newSelectedDas);

      // Clear selected areas when DAS is selected
      setSelectedAreas([]);

      // Clear ALL admin boundaries when switching to DAS
      Object.keys(layerGroupsRef.current).forEach((key) => {
        if (key.startsWith("admin_boundary")) {
          safeRemoveMapLayer(layerGroupsRef.current[key]);
          delete layerGroupsRef.current[key];
        }
      });

      // TAMBAHAN: Render DAS boundary langsung dengan unique key
      if (das.geom && mapInstanceRef.current && window.L) {
        console.log("✅ Rendering DAS boundary for:", das.nama_das);

        try {
          // Unique key per DAS
          const boundaryKey = `das_boundary_${das.nama_das.replace(/\s+/g, "_")}`;

          const geoJsonLayer = window.L.geoJSON(
            {
              type: "Feature",
              geometry: das.geom,
              properties: { nama_das: das.nama_das },
            },
            {
              style: {
                color: "#3b82f6",
                weight: 3,
                opacity: 0.8,
                fillColor: "#dbeafe",
                fillOpacity: 0.1,
              },
            },
          );

          geoJsonLayer.addTo(mapInstanceRef.current);
          layerGroupsRef.current[boundaryKey] = geoJsonLayer;

          console.log("✅ DAS boundary rendered with key:", boundaryKey);
        } catch (error) {
          console.error("❌ Error rendering DAS boundary:", error);
        }
      } else {
        console.log(
          "❌ Cannot render DAS boundary - geom missing or map not ready",
        );
      }

      updateMapBoundsDas(newSelectedDas);
    }

    setDasSearchQuery("");
    setDasSearchResults([]);
    setShowDasSearchDropdown(false);
  };

  // Function untuk remove selected DAS
  const handleRemoveDas = async (index: number) => {
    const removedDas = selectedDas[index];
    const newSelectedDas = selectedDas.filter((_, i) => i !== index);
    setSelectedDas(newSelectedDas);

    // Update clip kerawanan mengikuti daftar DAS terbaru.
    if (newSelectedDas.length > 0) {
      syncSelectedDasClip(newSelectedDas);
    } else {
      clearSelectedDasClip();
    }

    // Remove SPECIFIC DAS boundary layer
    const boundaryKey = `das_boundary_${removedDas.nama_das.replace(/\s+/g, "_")}`;
    if (layerGroupsRef.current[boundaryKey]) {
      safeRemoveMapLayer(layerGroupsRef.current[boundaryKey]);
      delete layerGroupsRef.current[boundaryKey];
      console.log("🗑️ Removed DAS boundary:", boundaryKey);
    }

    if (newSelectedDas.length > 0) {
      await updateMapBoundsDas(newSelectedDas);
    } else {
      // Tidak ada DAS yang dipilih, kembali ke bounds Indonesia
      setCurrentBounds(null);
      setSelectedAreas([]);

      // const kejadianResponse = await fetch('${API_URL}/api/kejadian/years');
      const kejadianResponse = await fetch(`${API_URL}/api/layers`);
      const kejadianData = await kejadianResponse.json();

      const allKejadianLayers = kejadianData.years.map((year: number) => ({
        id: `kejadian_${year}`,
        name: `kejadian_${year}`,
        year: year,
      }));

      console.log(
        "🔎 MITIGASI DATA:",
        JSON.stringify(layerData?.mitigasiAdaptasi || [], null, 2),
      );
      setAvailableLayers({
        kerawanan: layerData.kerawanan || [],
        mitigasiAdaptasi: layerData.mitigasiAdaptasi || [],
        lainnya: layerData.lainnya || [],
        kejadian: kejadianData.kejadian || [],
      });

      setTimeout(async () => {
        for (const tableName of activeLayers) {
          if (tableName.startsWith("kejadian_")) {
            // Parse category and year from tableName format: kejadian_Category_Name_Year
            const parts = tableName.split("_");
            if (parts.length >= 3) {
              const year = parseInt(parts[parts.length - 1]);
              const category = parts.slice(1, -1).join(" ");
              await loadKejadianLayer(tableName, year, category);
            }
          } else {
            await loadLayerInBounds(tableName, null);
          }
        }
      }, 100);
      // Saat wilayah terakhir ditutup/dihapus, kembalikan peta ke cakupan Indonesia penuh.
      // Gunakan batas yang sama dengan initial map agar Sumatra sampai Papua terlihat.
      if (mapInstanceRef.current && window.L) {
        const container = mapInstanceRef.current.getContainer?.();
        const width = container?.clientWidth || window.innerWidth;
        const padding = width < 480 ? [12, 38] : width < 900 ? [18, 28] : [24, 24];
        const indonesiaBounds = window.L.latLngBounds(
          [-11.5, 93.0],
          [6.5, 142.5],
        );
        mapInstanceRef.current.fitBounds(indonesiaBounds, {
          padding,
          animate: false,
          maxZoom: 5,
        });
      }
    }
  };

  // Validasi bounds dari API sebelum diberikan ke Leaflet.
  const isValidMapBounds = (bounds: any) => {
    if (
      !Array.isArray(bounds) ||
      bounds.length < 2 ||
      !Array.isArray(bounds[0]) ||
      !Array.isArray(bounds[1])
    )
      return null;
    const pairs = bounds
      .slice(0, 2)
      .map((pair: any) => [Number(pair?.[0]), Number(pair?.[1])]);
    if (
      pairs.some(
        ([lat, lng]: number[]) =>
          !Number.isFinite(lat) ||
          !Number.isFinite(lng) ||
          lat < -90 ||
          lat > 90 ||
          lng < -180 ||
          lng > 180,
      )
    )
      return null;
    const [[south, west], [north, east]] = pairs as [
      [number, number],
      [number, number],
    ];
    if (south > north || west > east) return null;
    return pairs as [[number, number], [number, number]];
  };

  // Function untuk update map bounds based on selected DAS
  const updateMapBoundsDas = async (dasList: Array<any>) => {
    if (dasList.length === 0 || !mapInstanceRef.current) return;

    try {
      const dasNames = dasList.map((d) => d.nama_das);

      const response = await fetch(`${API_URL}/api/das/bounds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedDas: dasNames }),
      });

      const data = await response.json();

      if (data.bounds) {
        // Set bounds dulu
        const validBounds = isValidMapBounds(data.bounds);
        if (!validBounds) {
          console.warn("SIMITI: API returned invalid map bounds", data.bounds);
          return;
        }
        setCurrentBounds(validBounds);
        mapInstanceRef.current.fitBounds(validBounds, { padding: [50, 50] });

        // Check available layers in these bounds
        await checkLayerAvailability(data.bounds);

        setTimeout(async () => {
          const dasNames = dasList.map((d) => d.nama_das);
          for (const tableName of activeLayers) {
            if (tableName.startsWith("kejadian_")) {
              const parts = tableName.split("_");
              if (parts.length >= 3) {
                const year = parseInt(parts[parts.length - 1]);
                const category = parts.slice(1, -1).join(" ");
                await loadKejadianLayer(tableName, year, category, dasNames);
              }
            } else {
              await loadLayerInBounds(tableName, data.bounds);
            }
          }
        }, 100);
      }
    } catch (error) {
      console.error("Error updating DAS bounds:", error);
    }
  };

  // Function untuk select area
  const handleAreaSelect = async (area: any) => {
    // Pemilihan administrasi baru membatalkan fokus KHDTK sebelumnya.
    if (selectedKhdtkName) {
      const focusKey = selectedKhdtkLayerKeyRef.current;
      if (layerGroupsRef.current[focusKey]) {
        safeRemoveMapLayer(layerGroupsRef.current[focusKey]);
        delete layerGroupsRef.current[focusKey];
      }
      const fullKhdtkLayer = layerGroupsRef.current["khdtk"];
      if (fullKhdtkLayer && mapInstanceRef.current && !mapInstanceRef.current.hasLayer(fullKhdtkLayer)) {
        fullKhdtkLayer.addTo(mapInstanceRef.current);
      }
      setSelectedKhdtkName("");
      selectedSpatialFeatureRef.current = null;
      clearSelectedAreaBencanaClip();
    }

    const isAlreadySelected = selectedAreas.some((a) => {
      if (a.level !== area.level) return false;

      switch (area.level) {
        case "provinsi":
          return a.provinsi === area.provinsi;
        case "kabupaten":
          return a.kab_kota === area.kab_kota && a.provinsi === area.provinsi;
        case "kecamatan":
          return (
            a.kecamatan === area.kecamatan &&
            a.kab_kota === area.kab_kota &&
            a.provinsi === area.provinsi
          );
        case "kelurahan":
          return (
            a.kel_desa === area.kel_desa &&
            a.kecamatan === area.kecamatan &&
            a.kab_kota === area.kab_kota &&
            a.provinsi === area.provinsi
          );
        default:
          return false;
      }
    });

    if (!isAlreadySelected) {
      const newSelectedAreas = [...selectedAreas, area];
      setSelectedAreas(newSelectedAreas);

      // Otomatis lanjut ke tingkat administrasi berikutnya.
      const nextAdminLevel: typeof adminLevel =
        area.level === "provinsi"
          ? "kabupaten"
          : area.level === "kabupaten"
            ? "kecamatan"
            : area.level === "kecamatan"
              ? "kelurahan"
              : "kelurahan";

      setAdminLevel(nextAdminLevel);
      setSelectedInfoTab("Mitigasi");
      setAiError("");
      // Jalankan diagnosis memakai area terbaru (bukan state lama).
      setTimeout(() => runAiMitigationRecommendation(newSelectedAreas), 0);

      // Clear selected DAS when area is selected
      setSelectedDas([]);

      // Clear ALL DAS boundaries when switching to admin areas
      Object.keys(layerGroupsRef.current).forEach((key) => {
        if (key.startsWith("das_boundary")) {
          safeRemoveMapLayer(layerGroupsRef.current[key]);
          delete layerGroupsRef.current[key];
        }
      });

      // Render polygon administrasi terpilih dan bersihkan polygon lama agar tidak bertumpuk.
      if (area.geom && mapInstanceRef.current && window.L) {
        Object.keys(layerGroupsRef.current).forEach((key) => {
          if (key.startsWith("admin_boundary_")) {
            safeRemoveMapLayer(layerGroupsRef.current[key]);
            delete layerGroupsRef.current[key];
          }
        });
        console.log("SIMITI: rendering selected admin polygon:", area.label);

        try {
          // Unique key per area
          const boundaryKey = `admin_boundary_${area.label.replace(/[,\s]+/g, "_")}`;

          const geoJsonLayer = window.L.geoJSON(
            {
              type: "Feature",
              geometry: area.geom,
              properties: { ...area },
            },
            {
              style: {
                color: selectedLegendColor || "#ef4444",
                weight: 2.5,
                opacity: 0.9,
                fill: true,
                fillColor: selectedLegendColor || "#ef4444",
                fillOpacity: 0.025,
                dashArray: "8 5",
              },
              onEachFeature: (selectedFeature: any, selectedLayer: any) => {
                selectedLayer.on("click", (event: any) => {
                  event?.originalEvent?.stopPropagation?.();
                  selectedSpatialFeatureRef.current = {
                    layerType: "map-polygon",
                    feature: selectedFeature,
                    layer: selectedLayer,
                  };
                  console.log("SIMITI selected administrative map polygon:", area.label);
                  requestAnimationFrame(() => syncSelectedSpatialFeatureBencanaClip());
                  openEnterpriseIdentify(
                    selectedFeature,
                    "admin_boundary",
                    event?.latlng,
                    "SIMITI GIS",
                  );
                });
              },
            },
          );

          geoJsonLayer.addTo(mapInstanceRef.current);
          layerGroupsRef.current[boundaryKey] = geoJsonLayer;
          const polygonBounds = geoJsonLayer.getBounds?.();

          try {
            console.info("SIMITI ADMIN GEOMETRY DIAGNOSTIC:", {
              label: area.label,
              level: area.level,
              geometryType: area.geom?.type,
              nestedGeometryType: area.geom?.geometry?.type,
              coordinateType: Array.isArray(area.geom?.coordinates)
                ? "array"
                : typeof area.geom?.coordinates,
              coordinateCount: area.geom?.coordinates?.length,
              renderedLayerCount: geoJsonLayer.getLayers?.().length,
              boundsValid: polygonBounds?.isValid?.(),
              bounds: polygonBounds?.toBBoxString?.(),
            });
          } catch (diagnosticError) {
            console.warn("SIMITI admin geometry diagnostic failed:", diagnosticError);
          }
          if (polygonBounds?.isValid?.()) {
            mapInstanceRef.current.fitBounds(polygonBounds, {
              padding: [36, 36],
              maxZoom: 13,
            });
          }

          console.log(
            "SIMITI: admin polygon rendered and map focused:",
            boundaryKey,
          );
        } catch (error) {
          console.error("❌ Error rendering admin boundary:", error);
        }
      } else {
        console.log(
          "❌ Cannot render admin boundary - geom missing or map not ready",
        );
      }

      // Clip visual risiko ke polygon terdalam yang dipilih.
      // API filter tetap berjalan seperti sebelumnya; clip ini mencegah
      // geometri risiko yang melintasi batas ikut mewarnai wilayah tetangga.
      syncSelectedAreaBencanaClip(
        getDeepestSelectedAdminAreas(newSelectedAreas),
        Array.from(activeLayers),
      );
      updateMapBounds(newSelectedAreas);
    }

    setAreaSearchQuery("");
    setAreaSearchResults([]);
    setShowAreaSearchDropdown(false);
  };

  // Function untuk remove selected area
  const handleRemoveArea = async (index: number) => {
    const removedArea = selectedAreas[index];
    if (removedArea?.level === "provinsi" && selectedKhdtkName) {
      const focusKey = selectedKhdtkLayerKeyRef.current;
      if (layerGroupsRef.current[focusKey]) {
        safeRemoveMapLayer(layerGroupsRef.current[focusKey]);
        delete layerGroupsRef.current[focusKey];
      }
      const fullKhdtkLayer = layerGroupsRef.current["khdtk"];
      if (fullKhdtkLayer && mapInstanceRef.current && !mapInstanceRef.current.hasLayer(fullKhdtkLayer)) {
        fullKhdtkLayer.addTo(mapInstanceRef.current);
      }
      setSelectedKhdtkName("");
      selectedSpatialFeatureRef.current = null;
    }
    const newSelectedAreas = selectedAreas.filter((_, i) => i !== index);
    setSelectedAreas(newSelectedAreas);

    // Remove SPECIFIC admin boundary layer
    const boundaryKey = `admin_boundary_${removedArea.label.replace(/[,\s]+/g, "_")}`;
    if (layerGroupsRef.current[boundaryKey]) {
      safeRemoveMapLayer(layerGroupsRef.current[boundaryKey]);
      delete layerGroupsRef.current[boundaryKey];
      console.log("🗑️ Removed admin boundary:", boundaryKey);
    }

    if (newSelectedAreas.length > 0) {
      syncSelectedAreaBencanaClip(
        getDeepestSelectedAdminAreas(newSelectedAreas),
        Array.from(activeLayers),
      );
      await updateMapBounds(newSelectedAreas);
    } else {
      clearSelectedAreaBencanaClip();
      setCurrentBounds(null);
      setSelectedDas([]);

      // const kejadianResponse = await fetch('${API_URL}/api/kejadian/years');
      const kejadianResponse = await fetch(`${API_URL}/api/layers`);
      const kejadianData = await kejadianResponse.json();

      const allKejadianLayers = kejadianData.years.map((year: number) => ({
        id: `kejadian_${year}`,
        name: `kejadian_${year}`,
        year: year,
      }));

      console.log(
        "🔎 MITIGASI DATA:",
        JSON.stringify(layerData?.mitigasiAdaptasi || [], null, 2),
      );
      setAvailableLayers({
        kerawanan: layerData.kerawanan || [],
        mitigasiAdaptasi: layerData.mitigasiAdaptasi || [],
        lainnya: layerData.lainnya || [],
        kejadian: kejadianData.kejadian || [],
      });

      setTimeout(async () => {
        for (const tableName of activeLayers) {
          if (tableName.startsWith("kejadian_")) {
            // Parse category and year from tableName format: kejadian_Category_Name_Year
            const parts = tableName.split("_");
            if (parts.length >= 3) {
              const year = parseInt(parts[parts.length - 1]);
              const category = parts.slice(1, -1).join(" ");
              await loadKejadianLayer(tableName, year, category);
            }
          } else {
            await loadLayerInBounds(tableName, null);
          }
        }
      }, 100);
      // Saat wilayah terakhir ditutup/dihapus, kembalikan peta ke cakupan Indonesia penuh.
      // Gunakan batas yang sama dengan initial map agar Sumatra sampai Papua terlihat.
      if (mapInstanceRef.current && window.L) {
        const container = mapInstanceRef.current.getContainer?.();
        const width = container?.clientWidth || window.innerWidth;
        const padding = width < 480 ? [12, 38] : width < 900 ? [18, 28] : [24, 24];
        const indonesiaBounds = window.L.latLngBounds(
          [-11.5, 93.0],
          [6.5, 142.5],
        );
        mapInstanceRef.current.fitBounds(indonesiaBounds, {
          padding,
          animate: false,
          maxZoom: 5,
        });
      }
    }
  };

  // Function untuk update map bounds based on selected areas
  const updateMapBounds = async (areas: Array<any>) => {
    if (areas.length === 0 || !mapInstanceRef.current) return;

    const areasWithoutGeom = areas.map(({ geom, ...rest }) => rest);

    try {
      const response = await fetch(`${API_URL}/api/areas/bounds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedAreas: areasWithoutGeom }),
      });

      const data = await response.json();

      if (data.bounds) {
        // Set bounds dulu
        const validBounds = isValidMapBounds(data.bounds);
        if (!validBounds) {
          console.warn("SIMITI: API returned invalid map bounds", data.bounds);
          return;
        }
        setCurrentBounds(validBounds);
        mapInstanceRef.current.fitBounds(validBounds, { padding: [50, 50] });

        // Check available layers in these bounds
        await checkLayerAvailability(data.bounds);

        setTimeout(async () => {
          const dasNames =
            selectedDas.length > 0 ? selectedDas.map((d) => d.nama_das) : [];
          for (const tableName of activeLayers) {
            if (tableName.startsWith("kejadian_")) {
              const parts = tableName.split("_");
              if (parts.length >= 3) {
                const year = parseInt(parts[parts.length - 1]);
                const category = parts.slice(1, -1).join(" ");
                await loadKejadianLayer(tableName, year, category, dasNames);
              }
            } else {
              await loadLayerInBounds(tableName, data.bounds);
            }
          }
        }, 100);
      }
    } catch (error) {
      console.error("Error updating bounds:", error);
    }
  };

  // Function untuk check layer availability
  const checkLayerAvailability = async (
    bounds: [[number, number], [number, number]],
  ) => {
    try {
      const dasFilter =
        selectedDas.length > 0 ? selectedDas.map((d) => d.nama_das) : null;

      // Check regular layers - KIRIM dasFilter
      const layersResponse = await fetch(
        `${API_URL}/api/layers/check-availability`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getAuthToken()}`,
          },
          body: JSON.stringify({
            bounds,
            dasFilter,
          }),
        },
      );

      const layersData = await layersResponse.json();
      console.log("Available layers response:", layersData);

      // Build filters untuk kejadian count
      const kejadianFilters: any = { bounds };

      // Prioritas: selectedDas > selectedAreas
      if (selectedDas.length > 0) {
        kejadianFilters.dasFilter = selectedDas.map((d) => d.nama_das);
        console.log(
          "Using DAS filter for kejadian count:",
          kejadianFilters.dasFilter,
        );
      } else if (selectedAreas.length > 0) {
        const firstArea = selectedAreas[0];
        kejadianFilters.adminLevel = firstArea.level;

        kejadianFilters.adminFilter = selectedAreas
          .map((area) => {
            switch (area.level) {
              case "provinsi":
                return area.provinsi!;
              case "kabupaten":
                return area.kab_kota!;
              case "kecamatan":
                return area.kecamatan!;
              case "kelurahan":
                return area.kel_desa!;
              default:
                return "";
            }
          })
          .filter((name) => name);

        console.log(
          "Using admin filter for kejadian count:",
          kejadianFilters.adminLevel,
          kejadianFilters.adminFilter,
        );
      }

      // Check kejadian availability dengan filter yang sesuai
      const kejadianResponse = await fetch(
        `${API_URL}/api/kejadian/check-years-availability`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(kejadianFilters),
        },
      );

      const kejadianData = await kejadianResponse.json();
      console.log("Available kejadian:", kejadianData);

      // Group available layers by section
      const grouped = {
        kerawanan: [] as Array<{ id: string; name: string }>,
        mitigasiAdaptasi: [] as Array<{ id: string; name: string }>,
        lainnya: [] as Array<{ id: string; name: string }>,
        kejadian: [] as Array<{
          id: string;
          name: string;
          category?: string;
          year?: number;
          count?: number;
          isAutoGenerated?: boolean;
          isManual?: boolean;
          isShapefile?: boolean;
        }>,
      };

      // Add regular layers (including shapefile kejadian)
      layersData.availableLayers.forEach((layer: any) => {
        if (grouped[layer.section as keyof typeof grouped]) {
          const layerInfo: any = {
            id: layer.id,
            name: layer.name,
          };

          // ✅ PERBAIKAN: Tambahkan flags untuk shapefile kejadian
          if (layer.section === "kejadian") {
            layerInfo.isManual = true;
            layerInfo.isShapefile = true;
          }

          grouped[layer.section as keyof typeof grouped].push(layerInfo);
        }
      });

      // ✅ APPEND kejadian auto-generated, jangan overwrite
      if (
        kejadianData.availableKejadian &&
        kejadianData.availableKejadian.length > 0
      ) {
        const autoKejadian = kejadianData.availableKejadian.map(
          (item: any) => ({
            id: `kejadian_${item.category.replace(/\s+/g, "_")}_${item.year}`,
            name: `${item.category} ${item.year}`,
            category: item.category,
            year: item.year,
            count: item.count,
            isAutoGenerated: true,
            isManual: false,
            isShapefile: false,
          }),
        );

        // Gabungkan shapefile kejadian + auto-generated kejadian
        grouped.kejadian = [...grouped.kejadian, ...autoKejadian];
      }

      // ================================================================
      // SAMAKAN DATA FLOW DENGAN kerawanan-ori.tsx
      // ================================================================
      // Availability hanya menentukan metadata/count layer pada wilayah
      // terpilih. Catalog utama tetap berasal dari layerData.
      //
      // Khusus KEJADIAN:
      // - layerData.kejadian = catalog utama
      // - grouped.kejadian = hasil availability
      // - catalog harus tetap dipertahankan walaupun availability kosong
      // - availability boleh memperbarui metadata yang tersedia
      //
      // Dengan pola ini checkbox KEJADIAN tidak hilang hanya karena
      // /api/layers/check-availability tidak mengembalikan item tertentu.

      const kejadianCatalog = Array.isArray(layerData?.kejadian)
        ? layerData.kejadian
        : [];

      const availableKejadianById = new Map(
        grouped.kejadian.map((item: any) => [item.id, item]),
      );

      const mergedKejadian = kejadianCatalog.map((item: any) => ({
        ...item,
        ...(availableKejadianById.get(item.id) || {}),
      }));

      // Pertahankan auto-generated kejadian dari hasil availability yang
      // memang belum ada di catalog utama.
      const catalogIds = new Set(kejadianCatalog.map((item: any) => item.id));

      const extraAvailableKejadian = grouped.kejadian.filter(
        (item: any) => !catalogIds.has(item.id),
      );

      grouped.kejadian = [...mergedKejadian, ...extraAvailableKejadian];

      console.log("Grouped available layers:", grouped);
      console.log("Kejadian catalog:", kejadianCatalog);
      console.log("Merged kejadian:", grouped.kejadian);

      setAvailableLayers(grouped);
    } catch (error) {
      console.error("Error checking layer availability:", error);
      // Fallback: preserve current kejadian layers if error
      setAvailableLayers((prev) => ({
        kerawanan: [],
        mitigasiAdaptasi: [],
        lainnya: [],
        kejadian: prev.kejadian || [],
      }));
    }
  };

  useEffect(() => {
    const updateKejadianCount = async () => {
      if (!currentBounds) return;

      console.log(
        "Filter changed (selectedAreas/selectedDas) - reloading kejadian count",
      );

      // Build filters untuk kejadian count
      const kejadianFilters: any = { bounds: currentBounds };

      // Prioritas: selectedDas > selectedAreas
      if (selectedDas.length > 0) {
        kejadianFilters.dasFilter = selectedDas.map((d) => d.nama_das);
        console.log(
          "Using DAS filter for kejadian count:",
          kejadianFilters.dasFilter,
        );
      } else if (selectedAreas.length > 0) {
        const firstArea = selectedAreas[0];
        kejadianFilters.adminLevel = firstArea.level;

        kejadianFilters.adminFilter = selectedAreas
          .map((area) => {
            switch (area.level) {
              case "provinsi":
                return area.provinsi!;
              case "kabupaten":
                return area.kab_kota!;
              case "kecamatan":
                return area.kecamatan!;
              case "kelurahan":
                return area.kel_desa!;
              default:
                return "";
            }
          })
          .filter((name) => name);

        console.log(
          "Using admin filter for kejadian count:",
          kejadianFilters.adminLevel,
          kejadianFilters.adminFilter,
        );
      }

      try {
        const kejadianResponse = await fetch(
          `${API_URL}/api/kejadian/check-years-availability`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(kejadianFilters),
          },
        );

        const kejadianData = await kejadianResponse.json();
        console.log("Available kejadian (updated):", kejadianData);

        if (kejadianData.availableKejadian) {
          const updatedKejadian = kejadianData.availableKejadian.map(
            (item: any) => ({
              id: `kejadian_${item.category.replace(/\s+/g, "_")}_${item.year}`,
              name: `${item.category} ${item.year}`,
              category: item.category,
              year: item.year,
              count: item.count,
            }),
          );

          setAvailableLayers((prev) => ({
            ...prev,
            kejadian: updatedKejadian,
          }));
        }
      } catch (error) {
        console.error("Error updating kejadian count:", error);
      }
    };

    updateKejadianCount();
  }, [selectedAreas, selectedDas, currentBounds]);

  const handleLayerToggle = async (
    tableName: string,
    isChecked: boolean,
    year?: number,
    category?: string,
    isShapefile?: boolean,
  ) => {
    const uiLayerKey = String(tableName);
    // Auto-generated kejadian harus tetap memakai ID stabil (kejadian_<kategori>_<tahun>).
    // resolveUiLayerName() mengembalikan label tampilan, mis. "Banjir 2026",
    // yang tidak valid sebagai nama tabel dan membuatnya salah masuk ke endpoint /api/layers.
    const resolvedTableName = uiLayerKey.startsWith("kejadian_")
      ? uiLayerKey
      : resolveUiLayerName(uiLayerKey);
    console.log(
      "Toggle layer clicked:",
      uiLayerKey,
      "=>",
      resolvedTableName,
      "isChecked:",
      isChecked,
      "year:",
      year,
      "category:",
      category,
      "isShapefile:",
      isShapefile,
    );
    console.log("Current active layers:", Array.from(activeLayers));

    if (isChecked) {
      tableName = resolvedTableName;

      // SIMITI KHDTK/RISK TAB SYNC:
      // Layer risiko mempunyai bottom tab sendiri. Saat user memilih
      // Risiko Karhutla/Banjir/dll, aktifkan tab yang sama agar useEffect
      // pemilih layer Leaflet tidak menyembunyikan polygon karena tab lama
      // (misalnya tab KHDTK) masih aktif.
      if (BENCANA_FOCUS_LAYERS.has(String(tableName))) {
        setActiveBottomTab(String(tableName));
        setIsBottomSummaryOpen(true);
        console.log("SIMITI: tab peta risiko diaktifkan:", tableName);
      }

      // Tambahkan layer ke active layers
      setActiveLayers((prev) => new Set([...prev, tableName]));

      // Enterprise flow:
      // checkbox -> activeLayers -> load GeoJSON -> infraData -> Data Grid
      if (INFRA_IDS.includes(tableName as any)) {
        setActiveBottomTab("mitigasi_adaptasi");
        setIsBottomSummaryOpen(true);
      } else if (tableName === "kawasan_hutan") {
        // Buka legenda fungsi kawasan dari GeoJSON lokal SIMITI/PostGIS.
        setActiveBottomTab("kawasan_hutan");
        setIsBottomSummaryOpen(true);
      } else if (tableName === "penutupan_lahan_2024") {
        // Layer ini memiliki panel legenda/ringkasan tersendiri.
        setActiveBottomTab("penutupanLahan2024");
        setIsBottomSummaryOpen(true);
      } else if (tableName === "geologi") {
        setActiveBottomTab("geologi");
        setIsBottomSummaryOpen(true);
      } else if (tableName === "lahan_kritis") {
        setActiveBottomTab("lahan_kritis");
        setIsBottomSummaryOpen(true);
      } else if (tableName === "sumur_bor") {
        setActiveBottomTab("sumur_bor");
        setIsBottomSummaryOpen(true);
      } else if (tableName === "rehabilitasi_hutan") {
        setActiveBottomTab("rehabilitasi_hutan");
        setIsBottomSummaryOpen(true);
      }

      // Simpan metadata untuk kejadian layer
      if (
        tableName.startsWith("kejadian_") &&
        year &&
        category &&
        !isShapefile
      ) {
        // Layer otomatis (point markers)
        setActiveKejadianLayers((prev) => {
          const newMap = new Map(prev);
          newMap.set(tableName, { year, category });
          return newMap;
        });
        await loadKejadianLayer(tableName, year, category);
      } else if (isShapefile) {
        // Layer manual shapefile
        await loadLayerInBounds(tableName);
      } else if (tableName.startsWith("kejadian_")) {
        // Fallback untuk format lama (hanya year)
        const yearFromName = parseInt(tableName.replace("kejadian_", ""));
        await loadKejadianLayer(tableName, yearFromName);
      } else {
        // Load layer biasa
        await loadLayerInBounds(tableName);
      }

      // Jika ada polygon yang diklik langsung di peta (KHDTK atau polygon
      // wilayah lainnya), batasi layer risiko ke geometri polygon tersebut.
      if (
        selectedDas.length === 0 &&
        selectedSpatialFeatureRef.current?.feature?.geometry &&
        BENCANA_FOCUS_LAYERS.has(String(tableName))
      ) {
        requestAnimationFrame(() =>
          applyBencanaClipToSelectedKhdtk(String(tableName)),
        );
      }

      // Jika DAS aktif, polygon kerawanan yang melampaui batas DAS
      // dipotong di renderer agar tidak melebar ke wilayah tetangga.
      if (
        selectedDas.length > 0 &&
        BENCANA_FOCUS_LAYERS.has(String(tableName))
      ) {
        syncSelectedDasClip(selectedDas, [String(tableName)]);
        requestAnimationFrame(() =>
          applyDasClipToLayer(String(tableName), selectedDas),
        );
      }

      if (
        selectedDas.length === 0 &&
        BENCANA_FOCUS_LAYERS.has(String(tableName)) &&
        selectedAreas.length > 0 &&
        selectedSpatialFeatureRef.current?.layerType !== "khdtk"
      ) {
        try {
          const map = mapInstanceRef.current;
          if (map && window.L) {
            let focusBounds: any = null;
            for (const area of selectedAreas) {
              if (!area?.geom) continue;
              const areaLayer = window.L.geoJSON({
                type: "Feature",
                geometry: area.geom,
                properties: {},
              });
              const bounds = areaLayer.getBounds();
              console.info("SIMITI LAYER FOCUS BOUNDS DIAGNOSTIC:", {
                label: area?.label,
                level: area?.level,
                geometryType: area.geom?.type,
                nestedGeometryType: area.geom?.geometry?.type,
                boundsValid: bounds?.isValid?.(),
                boundsBox: bounds?.toBBoxString?.(),
                southWest: bounds?.getSouthWest?.(),
                northEast: bounds?.getNorthEast?.(),
              });
              if (!bounds?.isValid?.()) continue;
              focusBounds = focusBounds ? focusBounds.extend(bounds) : bounds;
            }
            if (focusBounds?.isValid?.()) {
              try {
                if (focusBounds?.isValid?.()) {
                  console.info("SIMITI FINAL FITBOUNDS DIAGNOSTIC:", {
                    leafletVersion: window.L?.version,
                    mapExists: Boolean(map),
                    mapIsLeafletMap: Boolean(
                      window.L?.Map && map instanceof window.L.Map
                    ),
                    boundsIsLeafletBounds: Boolean(
                      window.L?.LatLngBounds &&
                      focusBounds instanceof window.L.LatLngBounds
                    ),
                    boundsValid: focusBounds?.isValid?.(),
                    boundsBox: focusBounds?.toBBoxString?.(),
                    southWest: focusBounds?.getSouthWest?.(),
                    northEast: focusBounds?.getNorthEast?.(),
                    mapHasGetBounds: typeof map?.getBounds === "function",
                  });
                  const focusSouthWest = focusBounds.getSouthWest();
                  const focusNorthEast = focusBounds.getNorthEast();

                  const focusBoundsArray: [[number, number], [number, number]] = [
                    [focusSouthWest.lat, focusSouthWest.lng],
                    [focusNorthEast.lat, focusNorthEast.lng],
                  ];

                  if (
                    focusBoundsArray.every((point) =>
                      point.every(Number.isFinite)
                    )
                  ) {
                    map.fitBounds(focusBoundsArray, {
                      padding: [40, 40],
                      maxZoom: 14,
                      animate: true,
                    });
                  } else {
                    console.warn(
                      "SIMITI: koordinat focusBounds tidak valid:",
                      focusBoundsArray
                    );
                  }
                }
              } catch (fitError) {
                console.warn("SIMITI: fitBounds bencana dilewati:", fitError);
              }
            }
          }
        } catch (focusError) {
          console.warn("SIMITI: gagal focus ke area bencana:", focusError);
        }
        // API/adminFilter tetap dipakai sebagai filter data, sedangkan
        // renderer clip membatasi warna risiko tepat pada polygon terdalam.
        syncSelectedAreaBencanaClip(
          getDeepestSelectedAdminAreas(selectedAreas),
          [String(tableName)],
        );
        requestAnimationFrame(() =>
          applyBencanaClipToLayer(
            String(tableName),
            getDeepestSelectedAdminAreas(selectedAreas),
          ),
        );
      }

      // Jika polygon dipilih langsung dengan klik peta, geometri tersebut
      // menjadi batas paling spesifik dan harus menang atas adminFilter.
      if (
        selectedDas.length === 0 &&
        selectedSpatialFeatureRef.current?.feature?.geometry &&
        BENCANA_FOCUS_LAYERS.has(String(tableName))
      ) {
        requestAnimationFrame(() =>
          applyBencanaClipToSelectedKhdtk(String(tableName)),
        );
      }
    } else {
      tableName = resolvedTableName;
      // Hapus layer dari active layers DULU
      setActiveLayers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(tableName);
        console.log("Updated active layers after removal:", Array.from(newSet));
        return newSet;
      });

      // Hapus layer dari map
      console.log("Removing layer from map:", tableName);
      if (layerGroupsRef.current[tableName] && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(layerGroupsRef.current[tableName]);
        delete layerGroupsRef.current[tableName];
        // SIMITI_HATCH_REFRESH_ON_REMOVE
        // Overlay overlap dihitung pairwise dan sangat mahal untuk layer nasional.
      // Dinonaktifkan saat pemuatan layer agar interaksi peta tetap responsif.
        console.log("Layer removed from map");

        if (BENCANA_FOCUS_LAYERS.has(String(tableName))) {
          const remainingBencana = Array.from(activeLayers).filter(
            (name) =>
              name !== tableName && BENCANA_FOCUS_LAYERS.has(String(name)),
          );
          if (remainingBencana.length === 0) {
            clearSelectedAreaBencanaClip();
            clearSelectedDasClip();
          } else if (selectedDas.length > 0) {
            syncSelectedDasClip(selectedDas);
          }
        }

        // Hapus metadata kejadian layer
        if (tableName.startsWith("kejadian_")) {
          setActiveKejadianLayers((prev) => {
            const newMap = new Map(prev);
            newMap.delete(tableName);
            return newMap;
          });
          // HAPUS manual call fetchKejadianPhotos - biarkan useEffect yang handle
        }

        if (tableName === "tutupan_lahan") {
          setTutupanLahanData([]);
        }

        if (tableName === "geologi") {
          setGeologiData([]);
        }

        if (tableName === "jenis_tanah") {
          setJenisTanahData([]);
        }
        if (tableName === "lahan_kritis") {
          setLahanKritisData([]);
        }
        if (tableName === "sumur_bor") {
          layerCacheRef.current.delete("sumur_bor");
        }
        if (tableName === "rehabilitasi_hutan") {
          setRehabilitasiHutanData([]);
          colorMappingRef.current.rehabilitasiHutan.clear();
          layerCacheRef.current.delete("rehabilitasi_hutan");
        }
        if (tableName === "rawan_erosi") {
          setRawanErosiData([]);
        }
        if (tableName === "rawan_longsor") {
          setRawanLongsorData([]);
        }
        if (tableName === "rawan_limpasan") {
          setRawanLimpasanData([]);
        }
        if (tableName === "rawan_karhutla") {
          setRawanKarhutlaData([]);
        }
      } else {
        console.log("Layer not found in layerGroupsRef or map not ready");
      }
    }
  };

  // Fungsi helper untuk generate warna konsisten berdasarkan nama tabel
  const getColorForTable = (tableName: string): string => {
    const infraColors: Record<string, string> = {
      bendung: "#E24B4A",
      bendungan: "#EF9F27",
      danau: "#1D9E75",
      embung: "#378ADD",
      situ: "#7F77DD",
      pengaman_pantai: "#2C2C2A",
      pengendali_sedimen: "#D4537E",
      pompa_air: "#888780",
      sekat_kanal: "#64748B",
    };
    if (infraColors[tableName]) return infraColors[tableName];
    const colors = [
      "#FF6B6B",
      "#4ECDC4",
      "#45B7D1",
      "#FFA07A",
      "#98D8C8",
      "#F7DC6F",
      "#BB8FCE",
      "#85C1E2",
      "#F8B739",
      "#52BE80",
      "#EC7063",
      "#5DADE2",
      "#F1948A",
      "#73C6B6",
      "#F39C12",
    ];

    // Hash dari nama tabel untuk mendapatkan warna yang konsisten
    let hash = 0;
    for (let i = 0; i < tableName.length; i++) {
      hash = tableName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const resetLayerStyle = (layerId: string) => {
    const layerGroup: any = layerGroupsRef.current[layerId];
    if (!layerGroup) return;

    // WMS/TileLayer adalah layer gambar, bukan LayerGroup GeoJSON.
    // Tidak ada style vektor yang perlu di-reset saat pointer keluar legenda.
    if (typeof layerGroup.eachLayer !== "function") return;

    // WMS nasional berupa tile gambar sehingga tidak memiliki eachLayer.
    // Pada cakupan provinsi, Kawasan Hutan berupa GeoJSON dan dapat di-reset
    // ke warna dasar per fungsikws. Pilihan legenda yang sudah diklik tetap
    // dipertahankan ketika pointer keluar dari baris legenda.
    if (layerId === "kawasan_hutan" || layerId === "97") {
      if (typeof layerGroup.eachLayer !== "function") return;
      if (selectedLegendType === "kawasan_hutan" && selectedLegendKey !== null) {
        return;
      }
    }
    const zoom = mapInstanceRef.current ? mapInstanceRef.current.getZoom() : 10;

    if (INFRA_IDS.includes(layerId as any)) {
      const infraColor =
        INFRA_LAYERS.find((l) => l.id === layerId)?.color || "#808080";
      layerGroup.eachLayer((layer: any) => {
        if (layer.setStyle)
          layer.setStyle({
            fillColor: infraColor,
            color: "#000",
            weight: 1,
            opacity: 1,
            fillOpacity: 0.7,
            radius: zoom > 10 ? 6 : 4,
          });
      });
      return;
    }

    layerGroup.eachLayer((layer: any) => {
      if (!layer.setStyle || !layer.feature) return;

      const isBencanaLayer = BENCANA_FOCUS_LAYERS.has(String(layerId));

      let color = isBencanaLayer
        ? getBencanaLayerColor(String(layerId))
        : "#3b82f6";
      const p = layer.feature.properties;
      const cm = colorMappingRef.current;
      if (layerId === "tutupan_lahan")
        color = cm.tutupanLahan.get(String(p.pl2024_id)) || color;
      else if (layerId === "penutupan_lahan_2024")
        color = cm.penutupanLahan2024.get(String(p.pl2024_id)) || color;
      else if (layerId === "pl2024")
        color = cm.pl2024.get(String(p.pl2024_id)) || color;
      else if (layerId === "geologi")
        color =
          cm.geologi.get(`${p.namobj || ""}|${p.umurobj || ""}`) || "#B45309";
      else if (layerId === "jenis_tanah")
        color = cm.jenisTanah.get(p.jntnh1) || "#8B4513";
      else if (layerId === "lahan_kritis")
        color = cm.lahanKritis.get(p.kritis) || "#808080";
      else if (layerId === "rawan_erosi")
        color = cm.rawanErosi.get(p.keterangan) || "#808080";
      else if (layerId === "rawan_longsor")
        color = cm.rawanLongsor.get(p.unsur) || "#808080";
      else if (layerId === "rawan_limpasan")
        color = cm.rawanLimpasan.get(p.limpasan) || "#808080";
      else if (layerId === "rawan_karhutla")
        color = cm.rawanKarhutla.get(p.kelas) || "#808080";
      else if (layerId === "bahaya_kekeringan")
        color = cm.bahayaKekeringan.get(p.kelas) || "#808080";
      else if (layerId === "bahaya_abrasi_dan_gelombang_ekstrim")
        color = cm.bahayaAbrasi.get(p.kelas) || "#808080";
      else if (layerId === "bahaya_banjir")
        color = cm.bahayaBanjir.get(p.kelas) || "#808080";
      else if (layerId === "bahaya_banjir_bandang")
        color = cm.bahayaBanjirBandang.get(p.kelas) || "#808080";
      else if (layerId === "dta_danau")
        color = cm.dtaDanau.get(p.tipe_danau) || "#808080";
      else if (layerId === "rehabilitasi_das")
        color = cm.rehabilitasiDas.get(p.bpdas) || "#808080";
      else if (layerId === "rehabilitasi_hutan")
        color = cm.rehabilitasiHutan.get(String(p.jenis_tana)) || "#808080";
      else if (layerId === "karhutla_2021")
        color = cm.kebakaran2021.get(String(p.periode)) || "#808080";
      else if (layerId === "karhutla_2022")
        color = cm.kebakaran2022.get(String(p.periode)) || "#808080";
      else if (layerId === "karhutla_2023")
        color = cm.kebakaran2023.get(String(p.periode)) || "#808080";
      else if (layerId === "karhutla_2024")
        color = cm.kebakaran2024.get(String(p.periode)) || "#808080";
      else if (layerId === "karhutla_2025")
        color = cm.kebakaran2025.get(String(p.periode)) || "#808080";
      else if (layerId === "kawasan_hutan" || layerId === "97")
        color = cm.kawasanHutan.get(String(p.fungsikws ?? "").trim()) || "#808080";
      else if (
        [
          "risiko_banjir",
          "risiko_banjir_bandang",
          "risiko_kekeringan",
          "risiko_abrasi",
          "risiko_longsor",
          "risiko_karhutla",
        ].includes(layerId)
      ) {
        const refKeyMap: Record<string, keyof typeof cm> = {
          risiko_banjir: "risikoBanjir",
          risiko_banjir_bandang: "risikoBanjirBandang",
          risiko_kekeringan: "risikoKekeringan",
          risiko_abrasi: "risikoAbrasi",
          risiko_longsor: "risikoLongsor",
          risiko_karhutla: "risikoKarhutla",
        };
        color = cm[refKeyMap[layerId]]?.get(p.kelas || "") || "#808080";
      } else if (layerId === "khdtk")
        color = cm.khdtk.get(p.namobj || "") || "#808080";

      if (isBencanaLayer) {
        // ======================================================
        // SIMITI FINAL BENCANA COLOR LOCK
        // Jangan biarkan mapping kelas/risk menimpa warna
        // berdasarkan JENIS BENCANA.
        // ======================================================
        color = getBencanaLayerColor(String(layerId));
        const classColor =
          getBencanaLegendFeatureColor(String(layerId), layer?.feature) || color;
        const riskStyle = {
          color: classColor,
          weight: zoom > 10 ? 2.2 : 1.6,
          opacity: 0.98,
          fillColor: classColor,
          fillOpacity: 0.16,
          lineCap: "round" as const,
          lineJoin: "round" as const,
        };
        layer.setStyle(riskStyle);

        // Jaga style sinkron agar refresh legenda/zoom tidak membuat
        // polygon kembali opak dan menutupi layer risiko lainnya.
        if (layer.options) Object.assign(layer.options, riskStyle);

        return;
      }

      const isBencanaStyle = BENCANA_FOCUS_LAYERS.has(String(layerId));

      layer.setStyle({
        color,
        weight: isBencanaStyle ? (zoom > 10 ? 2.2 : 1.5) : zoom > 10 ? 2 : 1,
        opacity: isBencanaStyle ? 1 : 0.8,
        fillColor: color,
        fillOpacity: isBencanaStyle ? 0.65 : zoom > 10 ? 0.4 : 0.3,
      });
    });
  };

  const applySelectedLegendToAdminBoundaries = (color: string | null) => {
    const map = mapInstanceRef.current;
    if (!map || !color) return;

    Object.keys(layerGroupsRef.current).forEach((key) => {
      if (!key.startsWith("admin_boundary_")) return;
      const boundary = layerGroupsRef.current[key];
      if (!boundary?.setStyle) return;

      boundary.setStyle({
        color,
        weight: 3,
        opacity: 1,
        fillColor: color,
      });
      if (boundary.bringToFront) boundary.bringToFront();
    });
  };

  // ============================================================
  // SIMITI - APPLY RISK ONLY TO SELECTED FEATURE
  // ============================================================
  const applySelectedLegendToSpatialFeature = (color: string) => {
    const selected = selectedSpatialFeatureRef.current;

    if (!selected?.layer?.setStyle) {
      return false;
    }

    selected.layer.setStyle({
      color,
      fillColor: color,
      weight: 4,
      opacity: 1,
      fillOpacity: 0.72,
    });

    if (selected.layer?.bringToFront) {
      selected.layer.bringToFront();
    }

    console.log(
      "SIMITI risk applied ONLY to selected feature:",
      selected.layerType,
      selected.feature?.properties?.namobj ||
        selected.feature?.properties?.nama ||
        selected.feature?.properties?.name ||
        selected.feature?.properties,
      color,
    );

    return true;
  };

  const handleLegendClick = (key: string, layerType: string, color: string) => {
    // Klik legend = pilihan permanen sampai user memilih kelas lain.
    setSelectedLegendKey(key);
    setSelectedLegendType(layerType);
    setSelectedLegendColor(color);

    // Rawan Limpasan: polygon GeoJSON yang benar-benar sedang dirender
    // langsung di-style berdasarkan atribut feature.properties.limpasan.
    if (layerType === "rawan_limpasan") {
      const selectedClass = String(key ?? "").trim();
      rawanLimpasanColorOverridesRef.current.set(selectedClass, color);
      colorMappingRef.current.rawanLimpasan.set(selectedClass, color);

      const activeLayer: any =
        layerGroupsRef.current?.rawan_limpasan ||
        layerCacheRef.current?.get?.("rawan_limpasan");
      let matched = 0;
      let total = 0;

      const applyClassColor = (featureLayer: any) => {
        const feature = featureLayer?.feature || featureLayer?.options?.feature;
        const kelas = String(feature?.properties?.limpasan ?? "").trim();
        if (!kelas) return;
        total++;
        const kelasColor =
          rawanLimpasanColorOverridesRef.current.get(kelas) ||
          colorMappingRef.current.rawanLimpasan.get(kelas) ||
          rawanLimpasanColors[kelas as keyof typeof rawanLimpasanColors] || "#808080";
        if (kelas === selectedClass) matched++;
        if (typeof featureLayer.setStyle === "function") {
          featureLayer.setStyle({
            color: kelasColor,
            fillColor: kelasColor,
            weight: kelas === selectedClass ? 2.5 : 1,
            opacity: kelas === selectedClass ? 1 : 0.8,
            fillOpacity: kelas === selectedClass ? 0.88 : 0.62,
          });
        }
      };

      // MODE NASIONAL: layer Rawan Limpasan dirender sebagai WMS tile,
      // sehingga tidak memiliki polygon Leaflet individual untuk eachLayer/setStyle.
      // Terapkan warna melalui SLD_BODY pada request GetMap WMS, lalu redraw tile.
      const wmsParams = activeLayer?.wmsParams || activeLayer?.options;
      const isRawanLimpasanWms = Boolean(
        activeLayer && typeof activeLayer.setParams === "function" &&
        (wmsParams?.layers === "simiti:vw_rawan_limpasan_wms" ||
          String(activeLayer?._url || "").toLowerCase().includes("/wms"))
      );
      if (isRawanLimpasanWms) {
        const sldBody = buildRawanLimpasanSld(selectedClass, color);
        activeLayer.setParams({
          SLD_BODY: sldBody,
          STYLES: "",
          CQL_FILTER: "INCLUDE",
        }, true);
        activeLayer.redraw?.();
        console.info("SIMITI: style WMS nasional Rawan Limpasan diubah melalui SLD_BODY", {
          kelas: selectedClass,
          warna: color,
          wmsLayer: wmsParams?.layers,
          sldBodyLength: sldBody.length,
        });
        return;
      }

      if (activeLayer && typeof activeLayer.eachLayer === "function") {
        activeLayer.eachLayer(applyClassColor);
      } else if (activeLayer && typeof activeLayer.setStyle === "function" && activeLayer.feature) {
        applyClassColor(activeLayer);
      }

      // Redraw renderer untuk mode vektor/provinsi.
      activeLayer?.redraw?.();
      console.info("SIMITI: klik legenda Rawan Limpasan diterapkan ke polygon", {
        kelas: selectedClass, warna: color, polygonTerdeteksi: total,
        polygonKelasTerpilih: matched, layerTersedia: Boolean(activeLayer),
      });
      return;
    }

    // Kawasan Hutan memiliki dua jalur render:
    // - Nasional: WMS GeoServer, ubah style melalui SLD_BODY.
    // - Provinsi/administrasi: GeoJSON, ubah warna feature dengan setStyle
    //   seperti pola styling layer vektor pada Kerawanan versi awal.
    if (layerType === "kawasan_hutan") {
      const kawasanHutanLayer: any =
        layerGroupsRef.current?.["kawasan_hutan"] ||
        layerGroupsRef.current?.["97"];

      if (kawasanHutanLayer && typeof kawasanHutanLayer.setParams === "function") {
        const kawasanHutanSldBody = buildKawasanHutanSld(key, color);
        kawasanHutanLayer.setParams({
          STYLES: "",
          SLD_BODY: kawasanHutanSldBody,
          CQL_FILTER: "INCLUDE",
        });
        if (typeof kawasanHutanLayer.redraw === "function") {
          kawasanHutanLayer.redraw();
        }

        console.info("SIMITI: legenda Kawasan Hutan nasional diterapkan melalui WMS", {
          fungsikws: key,
          color,
          sldBodyLength: kawasanHutanSldBody.length,
          hasFungsikwsFilter: kawasanHutanSldBody.includes("<ogc:PropertyName>fungsikws</ogc:PropertyName>"),
          cqlFilter: "INCLUDE",
        });
        return;
      }

      // Pada cakupan provinsi, layer adalah GeoJSON LayerGroup.
      // Warnai kelas yang dipilih dan redupkan kelas lainnya agar pilihan
      // legenda terlihat jelas pada polygon kawasan hutan di provinsi tersebut.
      if (kawasanHutanLayer && typeof kawasanHutanLayer.eachLayer === "function") {
        const selectedKey = String(key ?? "").trim();
        const selectedItem = KAWASAN_HUTAN_LEGEND.find(
          (item) => String(item.fungsikws) === selectedKey ||
            item.codes.some((code) => String(code) === selectedKey),
        );
        const selectedCodes = new Set(
          (selectedItem?.codes?.length ? selectedItem.codes : [selectedKey])
            .map((code) => String(code).trim()),
        );
        let matched = 0;
        let dimmed = 0;

        kawasanHutanLayer.eachLayer((featureLayer: any) => {
          if (!featureLayer?.feature || typeof featureLayer.setStyle !== "function") return;
          const fungsikws = String(
            featureLayer.feature?.properties?.fungsikws ?? "",
          ).trim();
          const isSelectedClass = selectedCodes.has(fungsikws);
          const fillColor = isSelectedClass ? color : "#94A3B8";

          featureLayer.setStyle({
            color: isSelectedClass ? color : "#64748B",
            fillColor,
            weight: isSelectedClass ? 1.8 : 0.5,
            opacity: isSelectedClass ? 1 : 0.45,
            fillOpacity: isSelectedClass ? 0.88 : 0.12,
            lineCap: "round",
            lineJoin: "round",
          });

          if (isSelectedClass) {
            matched++;
            if (typeof featureLayer.bringToFront === "function") {
              featureLayer.bringToFront();
            }
          } else {
            dimmed++;
          }
        });

        console.info("SIMITI: klik legenda Kawasan Hutan provinsi diterapkan ke GeoJSON", {
          fungsikws: key,
          selectedCodes: Array.from(selectedCodes),
          color,
          matched,
          dimmed,
        });
      } else {
        console.warn("SIMITI: layer Kawasan Hutan provinsi belum tersedia sebagai GeoJSON.");
      }
      return;
    }

    // ==========================================================
    // PRIORITAS:
    // Jika user sedang memilih feature KHDTK, legenda hanya
    // diterapkan ke KHDTK tersebut.
    //
    // Jangan gunakan applySelectedLegendToAdminBoundaries()
    // karena fungsi tersebut memang ditujukan untuk boundary
    // administrasi dan menyebabkan warna melebar ke wilayah lain.
    // ==========================================================
    const selectedFeature = selectedSpatialFeatureRef.current;

    if (selectedFeature && selectedFeature.layerType === "khdtk") {
      applySelectedLegendToSpatialFeature(color);
      return;
    }

    // Klik legenda mewarnai polygon/feature dengan kelas yang dipilih,
    // bukan seluruh batas administrasi. Warna kelas lain tetap mengikuti
    // mapping legenda masing-masing.
    const targetGroup =
      layerGroupsRef.current?.[layerType] ||
      layerGroupsRef.current?.[normalizeLayerApiName(layerType)];
    if (targetGroup && typeof targetGroup.eachLayer === "function") {
      const selectedKey = String(key ?? "").trim();
      let matched = 0;
      targetGroup.eachLayer((featureLayer: any) => {
        const props = featureLayer?.feature?.properties;
        if (!props || typeof featureLayer.setStyle !== "function") return;
        let featureKey = "";
        switch (layerType) {
          case "tutupan_lahan":
          case "penutupan_lahan_2024":
          case "pl2024": featureKey = String(props.pl2024_id ?? ""); break;
          case "geologi": featureKey = `${props.namobj || ""}|${props.umurobj || ""}`; break;
          case "jenis_tanah": featureKey = String(props.jntnh1 ?? ""); break;
          case "lahan_kritis": featureKey = String(props.kritis ?? ""); break;
          case "rawan_erosi": featureKey = String(props.tingkat ?? props.keterangan ?? ""); break;
          case "rawan_longsor": featureKey = String(props.unsur ?? ""); break;
          case "rawan_limpasan": featureKey = String(props.limpasan ?? ""); break;
          case "rawan_karhutla":
          case "bahaya_kekeringan":
          case "bahaya_abrasi_dan_gelombang_ekstrim":
          case "bahaya_banjir":
          case "bahaya_banjir_bandang":
          case "risiko_banjir":
          case "risiko_banjir_bandang":
          case "risiko_kekeringan":
          case "risiko_abrasi":
          case "risiko_longsor":
          case "risiko_karhutla": featureKey = String(props.kelas ?? ""); break;
          case "dta_danau": featureKey = String(props.tipe_danau ?? ""); break;
          case "rehabilitasi_das": featureKey = String(props.bpdas ?? ""); break;
          case "rehabilitasi_hutan": featureKey = String(props.jenis_tana ?? ""); break;
          case "khdtk": featureKey = String(props.namobj ?? ""); break;
          default: featureKey = selectedKey;
        }
        if (featureKey.trim() !== selectedKey) return;
        featureLayer.setStyle({
          color, fillColor: color, weight: 2.5, opacity: 1,
          fillOpacity: layerType === "risiko_abrasi" ? 1 : 0.78,
        });
        if (typeof featureLayer.bringToFront === "function") featureLayer.bringToFront();
        matched++;
      });
      console.info("SIMITI: warna legenda diterapkan ke feature peta", {
        layer: layerType, key: selectedKey, color, matched,
      });
      return;
    }

    console.warn("SIMITI: layer vektor untuk pilihan legenda belum tersedia", layerType);
  };

  const clearSelectedLegend = () => {
    setSelectedLegendKey(null);
    setSelectedLegendType(null);
    setSelectedLegendColor(null);
  };

  // Pilih KHDTK dari tabel (bukan hanya klik polygon di peta).
  // Semua feature dengan nama KHDTK yang sama digabung agar bagian
  // multipart/terpisah tetap menjadi satu batas clipping.
  const selectKhdtkFromRow = (item: any) => {
    const khdtkName = String(item?.namobj || "").trim();
    const khdtkLayerGroup = layerGroupsRef.current["khdtk"];

    if (!khdtkName || !khdtkLayerGroup) {
      console.warn("SIMITI: data polygon KHDTK belum tersedia:", khdtkName);
      return;
    }

    const matchingFeatures: any[] = [];
    let representativeLayer: any = null;

    khdtkLayerGroup.eachLayer?.((candidate: any) => {
      const candidateFeature = candidate?.feature;
      const candidateName = String(
        candidateFeature?.properties?.namobj || "",
      ).trim();
      const geometry = candidateFeature?.geometry;

      if (
        candidateName === khdtkName &&
        geometry &&
        ["Polygon", "MultiPolygon"].includes(String(geometry.type))
      ) {
        matchingFeatures.push(candidateFeature);
        if (!representativeLayer) representativeLayer = candidate;
      }
    });

    if (matchingFeatures.length === 0) {
      console.warn("SIMITI: polygon KHDTK tidak ditemukan:", khdtkName);
      return;
    }

    const polygonCoordinates: any[] = [];
    matchingFeatures.forEach((feature) => {
      if (feature.geometry.type === "Polygon") {
        polygonCoordinates.push(feature.geometry.coordinates);
      } else if (feature.geometry.type === "MultiPolygon") {
        polygonCoordinates.push(...feature.geometry.coordinates);
      }
    });

    const selectedFeature = {
      type: "Feature",
      properties: {
        ...(matchingFeatures[0].properties || {}),
        namobj: khdtkName,
      },
      geometry: {
        type: "MultiPolygon",
        coordinates: polygonCoordinates,
      },
    };

    // KHDTK menjadi wilayah fokus pengganti polygon administrasi.
    // Pertahankan pilihan provinsi sebagai konteks, tetapi lepaskan kabupaten,
    // kecamatan, dan desa agar tidak lagi menjadi polygon fokus di peta.
    setSelectedKhdtkName(khdtkName);
    // Simpan provinsi hanya sebagai konteks dropdown; seluruh level administrasi
    // di bawah provinsi diganti oleh nama KHDTK pada chip wilayah terpilih.
    setSelectedAreas((previous) =>
      previous.filter((area) => area.level === "provinsi"),
    );

    // Hapus seluruh polygon administrasi yang sedang digambar.
    Object.keys(layerGroupsRef.current).forEach((key) => {
      if (key.startsWith("admin_boundary_")) {
        safeRemoveMapLayer(layerGroupsRef.current[key]);
        delete layerGroupsRef.current[key];
      }
    });

    // Polygon kelurahan hasil identify koordinat juga bukan lagi wilayah fokus.
    const previousVillagePolygon = selectedVillagePolygonRef.current;
    if (previousVillagePolygon && mapInstanceRef.current?.hasLayer?.(previousVillagePolygon)) {
      safeRemoveMapLayer(previousVillagePolygon);
    }
    selectedVillagePolygonRef.current = null;

    // Putuskan seluruh clipping administrasi sebelum memasang clipping KHDTK.
    clearSelectedAreaBencanaClip();

    // Sembunyikan layer KHDTK lengkap (semua polygon), lalu tampilkan
    // hanya geometri KHDTK yang dipilih sebagai polygon fokus.
    safeRemoveMapLayer(khdtkLayerGroup);
    const focusKey = selectedKhdtkLayerKeyRef.current;
    if (layerGroupsRef.current[focusKey]) {
      safeRemoveMapLayer(layerGroupsRef.current[focusKey]);
      delete layerGroupsRef.current[focusKey];
    }

    let focusLayer: any = null;
    if (mapInstanceRef.current && window.L) {
      focusLayer = window.L.geoJSON(selectedFeature, {
        style: {
          color: "#0f172a",
          weight: 3,
          opacity: 1,
          fillColor: item?.color || "#16a34a",
          fillOpacity: 0.22,
        },
      });
      focusLayer.addTo(mapInstanceRef.current);
      layerGroupsRef.current[focusKey] = focusLayer;
      const focusBounds = focusLayer.getBounds?.();
      if (focusBounds?.isValid?.()) {
        mapInstanceRef.current.fitBounds(focusBounds, {
          padding: [36, 36],
          maxZoom: 13,
        });
      }
    }

    selectedSpatialFeatureRef.current = {
      layerType: "khdtk",
      feature: selectedFeature,
      layer: focusLayer || representativeLayer,
      originalColor: item?.color || "#808080",
    };

    // Muat ulang layer risiko yang sudah aktif agar feature lama yang mencakup
    // kabupaten/provinsi diganti dengan geometri hasil intersection KHDTK.
    try {
      const [minLng, minLat, maxLng, maxLat] = turfBbox(selectedFeature as any);
      const khdtkBounds: [[number, number], [number, number]] = [
        [minLat, minLng], [maxLat, maxLng],
      ];
      const activeRiskLayers = Array.from(activeLayersRef.current).filter((name) =>
        BENCANA_FOCUS_LAYERS.has(String(name)),
      );
      activeRiskLayers.forEach((name) => {
        const riskName = String(name);
        // Hilangkan geometri lama (kabupaten/provinsi) saat menunggu respons
        // hasil pemotongan KHDTK agar tidak sempat terlihat melebar.
        if (layerGroupsRef.current[riskName]) {
          safeRemoveMapLayer(layerGroupsRef.current[riskName]);
          delete layerGroupsRef.current[riskName];
        }
        layerCacheRef.current.delete(riskName);
        void loadLayerInBounds(riskName, khdtkBounds);
      });
      console.log("SIMITI: reload layer risiko dalam bounds KHDTK", {
        khdtk: khdtkName, layers: activeRiskLayers, bounds: khdtkBounds,
      });
    } catch (reloadError) {
      console.warn("SIMITI: gagal reload layer risiko KHDTK:", reloadError);
    }

    console.log("SIMITI: KHDTK mengambil alih wilayah fokus administrasi:", {
      name: khdtkName,
      contextProvince: selectedAreas.find((area) => area.level === "provinsi")?.label || null,
      matchedFeatures: matchingFeatures.length,
      activeRiskLayers: Array.from(activeLayersRef.current).filter((name) =>
        BENCANA_FOCUS_LAYERS.has(String(name)),
      ),
      activeFocusPolygon: "KHDTK only",
    });

    // Terapkan ulang clipping ke semua layer risiko yang sedang aktif.
    requestAnimationFrame(() => syncSelectedSpatialFeatureBencanaClip());
  };

  const handleRowMouseEnter = (
    key: string,
    layerType: string,
    color: string,
  ) => {
    // Reset layer sebelumnya jika berbeda
    if (
      lastHighlightedRef.current &&
      lastHighlightedRef.current.layerId !== layerType
    ) {
      lastHighlightedRef.current.resetFn();
    }
    setHoveredLayerKey(key);
    setHoveredLayerType(layerType);
    setHoveredLayerColor(color);
    lastHighlightedRef.current = {
      layerId: layerType,
      resetFn: () => resetLayerStyle(layerType),
    };
  };

  const handleRowMouseLeave = () => {
    setHoveredLayerKey(null);
    setHoveredLayerType(null);
    setHoveredLayerColor(null);
    if (lastHighlightedRef.current) {
      lastHighlightedRef.current.resetFn();
      lastHighlightedRef.current = null;
    }
  };

  // Fetch layers from database on mount
  useEffect(() => {
    const bootstrapLayerAccess = async () => {
      // Katalog layer dimuat langsung untuk akses publik.
      await loadMyLayerAuthorizations();
      await fetchLayers();

      // Defense-in-depth: jika ada layer aktif dari state/cache lama,
      // layer publik tetap dapat ditampilkan tanpa token.
      setActiveLayers((prev) => {
        const next = new Set<string>();
        for (const name of prev) {
          if (String(name).startsWith("kejadian_") || isLayerAuthorized(name)) {
            next.add(name);
          } else {
            const apiName = normalizeLayerApiName(name);
            const existing =
              layerGroupsRef.current?.[apiName] ??
              layerGroupsRef.current?.[name];
            if (existing && mapInstanceRef.current) {
              safeRemoveMapLayer(existing);
              delete layerGroupsRef.current[apiName];
              delete layerGroupsRef.current[name];
            }
          }
        }
        return next;
      });
    };

    void bootstrapLayerAccess();

    // Clear all kejadian layers on mount/reload
    setActiveLayers((prev) => {
      const newSet = new Set(prev);
      // Hapus semua layer kejadian
      Array.from(newSet).forEach((layerName) => {
        if (layerName.startsWith("kejadian_")) {
          newSet.delete(layerName);
        }
      });
      return newSet;
    });

    // Clear kejadian metadata
    setActiveKejadianLayers(new Map());

    // Clear photos dan listings
    setKejadianPhotos([]);
    setKejadianListings([]);
  }, []);

  const fetchLayers = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/api/layers`, {
        headers: token
          ? { Authorization: `Bearer ${token}`, Accept: "application/json" }
          : { Accept: "application/json" },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || `HTTP ${response.status}`);
      }

      const authorizedData = filterAuthorizedLayerData(data);
      console.log("Fetched layers data (authorized):", authorizedData);

      setLayerData(authorizedData);

      // Jika ada bounds yang dipilih, filter layers
      if (currentBounds) {
        void checkLayerAvailability(currentBounds);
      } else {
        // Tidak ada bounds: tetap gunakan catalog yang sudah difilter authorization.
        setAvailableLayers(authorizedData);
      }
    } catch (error) {
      console.error("Error fetching layers:", error);
      alert("Gagal memuat data layer");
    }
  };

  const handleAddClick = (
    section: "kerawanan" | "mitigasiAdaptasi" | "lainnya" | "kejadian",
  ) => {
    // Check authentication
    if (!isAuthenticated) {
      if (
        window.confirm(
          "Anda harus login sebagai admin untuk menambah data. Pergi ke halaman login?",
        )
      ) {
        navigate("/administrator-sign-in");
      }
      return;
    }

    setCurrentSection(section);
    setNewLayerName("");
    setUploadedFiles([]);
    setShowAddModal(true);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const fileArray = Array.from(files);
      setUploadedFiles(fileArray);
    }
  };

  const handleCreateLayer = async () => {
    if (!newLayerName.trim()) {
      alert("Nama tabel harus diisi");
      return;
    }

    if (uploadedFiles.length === 0) {
      alert("File shapefile harus diupload");
      return;
    }

    // Check if .shp file exists
    const hasShpFile = uploadedFiles.some((f) => f.name.endsWith(".shp"));
    if (!hasShpFile) {
      alert("File .shp wajib diupload");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setInsertProgress(0);
    setInsertStatus("");

    try {
      const formData = new FormData();
      formData.append("tableName", newLayerName.trim());
      formData.append("section", currentSection);

      uploadedFiles.forEach((file, index) => {
        console.log(
          `Appending file ${index}:`,
          file.name,
          file.type,
          file.size,
        );
        formData.append("files", file);
      });

      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;
          setUploadProgress(Math.round(percentComplete));
          console.log(`Upload progress: ${Math.round(percentComplete)}%`);
        }
      });

      // Handle response
      xhr.addEventListener("load", async () => {
        if (xhr.status === 200) {
          try {
            const result = JSON.parse(xhr.responseText);
            console.log("SUCCESS: Layer created successfully");

            setInsertProgress(100);
            setInsertStatus("Selesai");

            await fetchLayers();
            setNewLayerName("");
            setUploadedFiles([]);

            // Delay sedikit agar user bisa lihat progress 100%
            setTimeout(() => {
              setShowAddModal(false);
              setUploadProgress(0);
              setInsertProgress(0);
              setInsertStatus("");
              alert("Layer berhasil dibuat");
            }, 500);
          } catch (err) {
            throw new Error("Failed to parse response");
          }
        } else {
          const error = JSON.parse(xhr.responseText);
          throw new Error(error.error || "Gagal membuat layer");
        }
      });

      xhr.addEventListener("error", () => {
        throw new Error("Network error saat upload");
      });

      // Setup SSE untuk menerima progress insert dari server
      const eventSource = new EventSource(
        `${API_URL}/api/layers/progress/${newLayerName.trim()}`,
      );

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("Insert progress:", data);

          if (data.progress !== undefined) {
            setInsertProgress(data.progress);
          }
          if (data.status) {
            setInsertStatus(data.status);
          }
          if (data.done) {
            eventSource.close();
          }
        } catch (err) {
          console.error("Error parsing SSE data:", err);
        }
      };

      eventSource.onerror = (error) => {
        console.log("SSE connection closed or error");
        eventSource.close();
      };

      xhr.open("POST", `${API_URL}/api/layers`);
      xhr.send(formData);
    } catch (error: any) {
      console.error("Error creating layer:", error);
      alert(error.message || "Gagal membuat layer");
      setIsUploading(false);
      setUploadProgress(0);
      setInsertProgress(0);
      setInsertStatus("");
    }
  };

  const handleDeleteClick = (
    section: "kerawanan" | "mitigasiAdaptasi" | "lainnya",
    id: string,
    name: string,
  ) => {
    // Check authentication
    if (!isAuthenticated) {
      if (
        window.confirm(
          "Anda harus login sebagai admin untuk menghapus data. Pergi ke halaman login?",
        )
      ) {
        navigate("/administrator-sign-in");
      }
      return;
    }

    setLayerToDelete({ section, id, name });
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!layerToDelete) return;

    try {
      const response = await fetch(
        `${API_URL}/api/layers/${layerToDelete.id}`,
        {
          method: "DELETE",
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Gagal menghapus layer");
      }

      // Hapus layer dari map jika sedang aktif
      const layerName = layerToDelete.name;
      if (activeLayers.has(layerName)) {
        handleLayerToggle(layerName, false);
      }

      // Refresh layers
      await fetchLayers();

      setLayerToDelete(null);
      setShowDeleteModal(false);
      alert("Layer berhasil dihapus");
    } catch (error: any) {
      console.error("Error deleting layer:", error);
      alert(error.message || "Gagal menghapus layer");
    }
  };

  const getSectionTitle = (section: string) => {
    const titles = {
      kerawanan: "Kerawanan",
      mitigasiAdaptasi: "Mitigasi dan Adaptasi",
      lainnya: "Lain lain",
      kejadian: "Kejadian",
    };
    return titles[section as keyof typeof titles];
  };

  useEffect(() => {
    if (!mapInstanceRef.current) return;

    // Hanya reload jika ada active kejadian layers
    if (activeKejadianLayers.size === 0) return;

    console.log(
      "Trigger reload kejadian layers - activeKejadianLayers:",
      Array.from(activeKejadianLayers.entries()),
    );
    console.log("Current bounds:", currentBounds);

    const reloadKejadianLayers = async () => {
      for (const [layerName, metadata] of activeKejadianLayers.entries()) {
        console.log(`Reloading kejadian layer: ${layerName}`, metadata);
        await loadKejadianLayer(layerName, metadata.year, metadata.category);
      }
    };

    reloadKejadianLayers();
  }, [currentBounds, selectedDas, selectedAreas, activeKejadianLayers]);

  useEffect(() => {
    // Load Leaflet CSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    // Load Leaflet JS
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => {
      if (!mapRef.current || !window.L) return;

      // React StrictMode / hot-reload dapat menjalankan lifecycle berulang.
      // Kunci init supaya dua callback script tidak pernah membuat map bersamaan.
      if (mapInitializingRef.current) return;
      if (mapInstanceRef.current) {
        console.log("🗺️ Leaflet map sudah ada, skip initialization");
        return;
      }

      // Proteksi tambahan terhadap container yang masih ditandai Leaflet
      const container = mapRef.current as HTMLElement & {
        _leaflet_id?: number;
      };

      if (container._leaflet_id) {
        console.log(
          "🗺️ Map container masih memiliki instance Leaflet sebelumnya.",
        );
        if (mapInstanceRef.current) {
          try {
            mapInstanceRef.current.remove();
          } catch (error) {
            console.warn("⚠️ Gagal membersihkan instance Leaflet lama:", error);
          }
          mapInstanceRef.current = null;
        }
        delete container._leaflet_id;
      }

      mapInitializingRef.current = true;
      // Tampilan awal seluruh Indonesia untuk desktop, tablet, dan ponsel.
      // Zoom lebih lebar agar wilayah barat hingga Papua terlihat sejak pertama dibuka.
      // Kontrol Default Extent menggunakan nilai yang sama.
      const DEFAULT_MAP_CENTER: [number, number] = [-2.2, 118.0];
      // Gunakan batas geografis Indonesia, bukan zoom tetap. fitBounds menyesuaikan
      // viewport portrait/landscape sehingga Sumatra hingga Papua masuk pada awal.
      const DEFAULT_MAP_BOUNDS = window.L.latLngBounds(
        [-11.5, 93.0],
        [6.5, 142.5],
      );
      const getDefaultMapPadding = () => {
        const width = container.clientWidth || window.innerWidth;
        return width < 480 ? [12, 38] : width < 900 ? [18, 28] : [24, 24];
      };
      const map = window.L.map(container, { zoomControl: false });
      map.fitBounds(DEFAULT_MAP_BOUNDS, {
        padding: getDefaultMapPadding(),
        animate: false,
        maxZoom: 5,
      });

      // Kontrol zoom berada di kiri bawah; tombol extent tepat di bawahnya.
      // Area ini sengaja dipisahkan dari pencarian (atas-kiri) dan basemap (atas-kanan).
      window.L.control.zoom({ position: "bottomleft" }).addTo(map);

      // Kontrol Default Extent mengembalikan viewport ke cakupan awal Indonesia.
      // Tidak menghapus layer, pilihan wilayah, filter, atau data yang sudah dimuat.
      const defaultExtentControl = window.L.control({ position: "bottomleft" });
      defaultExtentControl.onAdd = () => {
        const control = window.L.DomUtil.create(
          "div",
          "leaflet-bar simiti-default-extent-control",
        );
        const button = window.L.DomUtil.create("a", "", control);
        button.href = "#";
        button.title = "Default Extent — kembali ke tampilan awal Indonesia";
        button.setAttribute("role", "button");
        button.setAttribute("aria-label", "Default Extent");
        button.setAttribute("aria-controls", "simiti-map");
        button.innerHTML =
          '<span aria-hidden="true" style="display:block;font-size:18px;line-height:26px;font-weight:700">⌂</span>';
        window.L.DomEvent.disableClickPropagation(control);
        window.L.DomEvent.on(button, "click", (event: Event) => {
          window.L.DomEvent.preventDefault(event);
          map.fitBounds(DEFAULT_MAP_BOUNDS, {
            padding: getDefaultMapPadding(),
            animate: false,
            maxZoom: 5,
          });
        });
        return control;
      };
      defaultExtentControl.addTo(map);

      // Dua klik pada lokasi yang sama diperlukan sebelum identifikasi GIS.
      // Klik pertama hanya menyimpan titik; klik kedua baru mengambil polygon.
      map.on("click", (event: any) => {
        if (!confirmMapPolygonClick(event?.latlng)) return;

        const { lat, lng } = event.latlng;

        identifyEnterpriseAtPoint(event.latlng);

        // Tampilkan batas administratif asli dari PostGIS setelah konfirmasi.
        void showSelectedVillagePolygon(Number(lat), Number(lng));

        // Perilaku cuaca tetap berjalan, tetapi setelah klik kedua.
        void fetchMapWeather(Number(lat), Number(lng));
      });

      const roadBaseLayer = window.L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution: "&copy; OpenStreetMap contributors",
          crossOrigin: true,
        },
      );

      const satelliteBaseLayer = window.L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: "Tiles &copy; Esri",
          crossOrigin: true,
        },
      );

      roadBaseLayerRef.current = roadBaseLayer;
      satelliteBaseLayerRef.current = satelliteBaseLayer;

      satelliteBaseLayer.addTo(map);

      mapInstanceRef.current = map;
      mapInitializingRef.current = false;
      setMapReady(true);

      console.log("✅ Leaflet map initialized once");
    };
    document.head.appendChild(script);

    // Load Chart.js
    const chartScript = document.createElement("script");
    chartScript.src =
      "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js";
    document.head.appendChild(chartScript);

    return () => {
      link.remove();
      script.remove();
      chartScript.remove();

      // Invalidate semua request async yang masih berjalan sebelum map dihancurkan.
      Object.keys(layerRequestSeqRef.current).forEach((key) => {
        layerRequestSeqRef.current[key] += 1;
      });

      // Batalkan callback GPS/render GPS yang masih pending.
      gpsRequestSeqRef.current += 1;
      if (gpsRenderFrameRef.current !== null) {
        cancelAnimationFrame(gpsRenderFrameRef.current);
        gpsRenderFrameRef.current = null;
      }

      try {
        gpsMarkerRef.current?.remove?.();
      } catch {}
      gpsMarkerRef.current = null;

      try {
        gpsAccuracyCircleRef.current?.remove?.();
      } catch {}
      gpsAccuracyCircleRef.current = null;

      mapInitializingRef.current = false;
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (error) {
          console.warn("⚠️ Leaflet cleanup warning:", error);
        }
        mapInstanceRef.current = null;
      }
      if (mapRef.current) {
        const container = mapRef.current as HTMLElement & {
          _leaflet_id?: number;
        };
        delete container._leaflet_id;
      }
      roadBaseLayerRef.current = null;
      satelliteBaseLayerRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const roadLayer = roadBaseLayerRef.current;
    const satelliteLayer = satelliteBaseLayerRef.current;

    if (!map || !roadLayer || !satelliteLayer || !mapReady) return;

    if (map.hasLayer(roadLayer)) {
      map.removeLayer(roadLayer);
    }

    if (map.hasLayer(satelliteLayer)) {
      map.removeLayer(satelliteLayer);
    }

    if (baseMapType === "satellite") {
      satelliteLayer.addTo(map);
    } else {
      roadLayer.addTo(map);
    }
  }, [baseMapType, mapReady]);

  useEffect(() => {
    // Auto-fetch photos dan listings ketika ada perubahan pada activeLayers kejadian
    const activeAutoKejadian = Array.from(activeLayers).filter(
      (layer) =>
        layer.startsWith("kejadian_") && activeKejadianLayers.has(layer),
    );

    console.log(
      "useEffect triggered - activeAutoKejadian:",
      activeAutoKejadian,
    );
    console.log(
      "activeKejadianLayers:",
      Array.from(activeKejadianLayers.entries()),
    );

    if (activeAutoKejadian.length > 0) {
      console.log(
        "Active auto kejadian layers detected, fetching photos and listings...",
      );
      fetchKejadianPhotos();
      fetchKejadianListings();
    } else {
      console.log(
        "No active auto kejadian layers, clearing photos and listings",
      );
      setKejadianPhotos([]);
      setKejadianListings([]);
    }
  }, [activeLayers, activeKejadianLayers, currentBounds, selectedDas, selectedAreas]);

  const [activeTab, setActiveTab] = useState("administrasi");
  const [activeBottomTab, setActiveBottomTab] = useState("curahHujan");
  // UI-only: layer mitigasi yang sedang ditampilkan pada tabel ringkas.
  const [activeInfraSummaryLayer, setActiveInfraSummaryLayer] = useState<
    string | null
  >(null);

  // Mode utama filter lokasi: Administrasi atau DAS.
  // Saat mode berganti, pilihan dari mode sebelumnya dibersihkan
  // agar filter lama tidak ikut memengaruhi query layer.
  const handleMainTabChange = (tab: "administrasi" | "das") => {
    setActiveTab(tab);

    if (tab === "administrasi") {
      setSelectedDas([]);
      setDasSearchQuery("");
      setDasSearchResults([]);
      setShowDasSearchDropdown(false);

      Object.keys(layerGroupsRef.current).forEach((key) => {
        if (key.startsWith("das_boundary")) {
          safeRemoveMapLayer(layerGroupsRef.current[key]);
          delete layerGroupsRef.current[key];
        }
      });
    } else {
      setSelectedAreas([]);
      setAreaSearchQuery("");
      setAreaSearchResults([]);
      setShowAreaSearchDropdown(false);

      Object.keys(layerGroupsRef.current).forEach((key) => {
        if (key.startsWith("admin_boundary")) {
          safeRemoveMapLayer(layerGroupsRef.current[key]);
          delete layerGroupsRef.current[key];
        }
      });
    }

    setCurrentBounds(null);
  };
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  // UI-only: collapse/expand panel kanan tanpa mengubah logic layer.

  // ======================================================
  // ENTERPRISE LAYER MANAGER
  // Search, active-only view, collapse groups, opacity,
  // zoom-to-layer and metadata actions. Existing layer logic
  // tetap dipakai; manager hanya menjadi control surface.
  // ======================================================
  const [enterpriseLayerSearch, setEnterpriseLayerSearch] = useState("");
  const [enterpriseShowActiveOnly, setEnterpriseShowActiveOnly] =
    useState(false);
  const [enterpriseCollapsedGroups, setEnterpriseCollapsedGroups] = useState<
    Set<string>
  >(new Set());
  const [enterpriseOpacity, setEnterpriseOpacity] = useState<
    Record<string, number>
  >({});
  const [enterpriseLegendVisible, setEnterpriseLegendVisible] = useState<
    Record<string, boolean>
  >({});
  const [enterpriseMetadataLayer, setEnterpriseMetadataLayer] =
    useState<any>(null);
  const [enterpriseSearchQuery, setEnterpriseSearchQuery] = useState("");
  const [enterpriseSearchResults, setEnterpriseSearchResults] = useState<
    Array<any>
  >([]);
  const [enterpriseSearchLoading, setEnterpriseSearchLoading] = useState(false);
  const [enterpriseSearchOpen, setEnterpriseSearchOpen] = useState(false);
  const enterpriseSearchHighlightRef = useRef<any>(null);
  const enterpriseSearchRequestRef = useRef(0);

  const enterpriseMatchesLayer = (layer: any) => {
    const id = String(layer?.id ?? layer?.name ?? "");
    const name = String(layer?.name ?? layer?.id ?? "");
    const q = enterpriseLayerSearch.trim().toLowerCase();
    if (
      enterpriseShowActiveOnly &&
      !activeLayers.has(id) &&
      !activeLayers.has(name)
    )
      return false;
    if (!q) return true;
    return `${id} ${name} ${formatTableName(name)}`.toLowerCase().includes(q);
  };

  const enterpriseToggleGroup = (group: string) => {
    setEnterpriseCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const enterpriseSetLayerOpacity = (layerName: string, value: number) => {
    const opacity = Math.max(0, Math.min(1, value));
    setEnterpriseOpacity((prev) => ({ ...prev, [layerName]: opacity }));
    const layer =
      layerGroupsRef.current?.[layerName] ??
      layerGroupsRef.current?.[normalizeLayerApiName(layerName)];
    if (!layer) return;
    try {
      if (typeof layer.setOpacity === "function") layer.setOpacity(opacity);
      if (typeof layer.eachLayer === "function") {
        layer.eachLayer((child: any) => {
          if (typeof child.setOpacity === "function") child.setOpacity(opacity);
          if (typeof child.setStyle === "function")
            child.setStyle({ opacity, fillOpacity: Math.min(opacity, 0.8) });
        });
      }
    } catch (error) {
      console.warn("Enterprise opacity update failed:", layerName, error);
    }
  };

  const enterpriseZoomToLayer = (layerName: string) => {
    const map = mapInstanceRef.current as any;
    const layer =
      layerGroupsRef.current?.[layerName] ??
      layerGroupsRef.current?.[normalizeLayerApiName(layerName)];
    if (!map || !layer) return;
    try {
      if (typeof layer.getBounds === "function") {
        const bounds = layer.getBounds();
        if (bounds?.isValid?.()) {
          map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
          return;
        }
      }
      let bounds: any = null;
      if (typeof layer.eachLayer === "function") {
        layer.eachLayer((child: any) => {
          if (typeof child.getBounds === "function") {
            const b = child.getBounds();
            if (b?.isValid?.()) bounds = bounds ? bounds.extend(b) : b;
          } else if (child.getLatLng) {
            const b = window.L.latLngBounds(
              child.getLatLng(),
              child.getLatLng(),
            );
            bounds = bounds ? bounds.extend(b) : b;
          }
        });
      }
      if (bounds?.isValid?.())
        map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
    } catch (error) {
      console.warn("Enterprise zoom-to-layer failed:", layerName, error);
    }
  };

  const enterpriseLayerMeta = (layerName: string) => {
    const all = [
      ...(layerData?.kerawanan || []),
      ...(layerData?.mitigasiAdaptasi || []),
      ...(layerData?.lainnya || []),
      ...(layerData?.kejadian || []),
    ] as any[];
    return (
      all.find(
        (x) => String(x.id) === layerName || String(x.name) === layerName,
      ) || { id: layerName, name: layerName }
    );
  };

  const enterpriseActiveLayerEntries = Array.from(activeLayers).map(
    (layerName) => ({
      name: layerName,
      label: formatTableName(enterpriseLayerMeta(layerName)?.name || layerName),
    }),
  );

  // ======================================================
  // STEP 2 — ENTERPRISE SEARCH
  // Satu kotak pencarian untuk lokasi, layer, dan objek aktif.
  // Hasil -> FlyTo -> highlight -> Identify.
  // ======================================================
  const clearEnterpriseSearchHighlight = () => {
    const map = mapInstanceRef.current;
    const highlight = enterpriseSearchHighlightRef.current;
    if (highlight && map) {
      try {
        map.removeLayer(highlight);
      } catch {}
    }
    enterpriseSearchHighlightRef.current = null;
  };

  const highlightEnterpriseGeometry = (geometry: any, label?: string) => {
    const map = mapInstanceRef.current;
    if (!map || !window.L || !geometry) return null;
    clearEnterpriseSearchHighlight();
    try {
      const layer = window.L.geoJSON(
        {
          type: "Feature",
          geometry,
          properties: { enterpriseSearch: true, label },
        },
        {
          style: {
            color: "#f59e0b",
            weight: 5,
            opacity: 1,
            fillColor: "#fbbf24",
            fillOpacity: 0.14,
            dashArray: "8 5",
          },
          interactive: false,
        },
      ).addTo(map);
      enterpriseSearchHighlightRef.current = layer;
      return layer;
    } catch (error) {
      console.warn("Enterprise highlight gagal:", error);
      return null;
    }
  };

  const identifyEnterpriseObject = (obj: any, layerName?: string) => {
    const map = mapInstanceRef.current;
    if (!map || !window.L || !obj) return;
    const lat = Number(obj.latitude ?? obj.lat ?? obj.coordinates?.[1]);
    const lng = Number(
      obj.longitude ?? obj.lon ?? obj.lng ?? obj.coordinates?.[0],
    );
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    map.flyTo([lat, lng], Math.max(map.getZoom(), 14), { duration: 0.9 });
    const group = layerName ? layerGroupsRef.current?.[layerName] : null;
    let target: any = null;
    if (group?.eachLayer) {
      group.eachLayer((child: any) => {
        if (target) return;
        const data = child?.incidentData || child?.feature?.properties;
        if (
          data &&
          String(data.id ?? data.title ?? "") ===
            String(obj.id ?? obj.title ?? "")
        )
          target = child;
      });
    }
    if (target?.openPopup) {
      window.setTimeout(() => target.openPopup(), 350);
    } else {
      window.L.popup({ closeButton: true, autoClose: true })
        .setLatLng([lat, lng])
        .setContent(
          `<div style="font-size:12px;line-height:1.45"><b>${String(obj.title || obj.name || obj.label || "Objek").replace(/[&<>"]/g, "")}</b>${obj.category ? `<br/><span>${String(obj.category).replace(/[&<>"]/g, "")}</span>` : ""}</div>`,
        )
        .openOn(map);
    }
  };

  const enterpriseEscapeHtml = (value: any) =>
    String(value ?? "—").replace(
      /[&<>\"]/g,
      (char) =>
        (
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
          }) as any
        )[char] || char,
    );

  const enterpriseGeometryAreaHa = (geometry: any): number | null => {
    if (!geometry?.coordinates) return null;
    const R = 6378137;
    const ringArea = (ring: any[]) => {
      if (!Array.isArray(ring) || ring.length < 3) return 0;
      let area = 0;
      const ref = ring[0];
      const lat0 = (Number(ref[1]) * Math.PI) / 180;
      const cosLat = Math.cos(lat0);
      const mLon = (Math.PI / 180) * R * cosLat;
      const mLat = (Math.PI / 180) * R;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const ax = Number(a[0]) * mLon,
          ay = Number(a[1]) * mLat;
        const bx = Number(b[0]) * mLon,
          by = Number(b[1]) * mLat;
        area += ax * by - bx * ay;
      }
      return Math.abs(area) / 2;
    };
    const polygonArea = (poly: any[]) => {
      if (!Array.isArray(poly) || !poly.length) return 0;
      const outer = ringArea(poly[0]);
      const holes = poly.slice(1).reduce((sum, r) => sum + ringArea(r), 0);
      return Math.max(0, outer - holes);
    };
    let m2 = 0;
    if (geometry.type === "Polygon") m2 = polygonArea(geometry.coordinates);
    else if (geometry.type === "MultiPolygon")
      m2 = geometry.coordinates.reduce(
        (sum: number, p: any) => sum + polygonArea(p),
        0,
      );
    return m2 > 0 ? m2 / 10000 : null;
  };

  const closeEnterpriseIdentify = () => {
    const map = mapInstanceRef.current;
    const highlight = enterpriseIdentifyHighlightRef.current;
    if (highlight && map) {
      try {
        map.removeLayer(highlight);
      } catch {}
    }
    enterpriseIdentifyHighlightRef.current = null;
    setEnterpriseIdentify((prev) => ({ ...prev, open: false }));
  };

  const openEnterpriseIdentify = (
    feature: any,
    layerName: string,
    latlng?: any,
    source = "SIMITI GIS",
  ) => {
    const map = mapInstanceRef.current;
    if (!map || !window.L || !feature) return;
    const properties = { ...(feature.properties || {}) };
    const geometry = feature.geometry || null;
    const point =
      latlng ||
      (() => {
        try {
          const bounds = window.L.geoJSON(feature).getBounds();
          return bounds?.isValid?.() ? bounds.getCenter() : null;
        } catch {
          return null;
        }
      })();
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    const label = String(
      properties.namobj ||
        properties.nama ||
        properties.name ||
        properties.title ||
        properties.namobjek ||
        properties.kab_kota ||
        properties.provinsi ||
        properties.keterangan ||
        properties.fungsi ||
        formatTableName(layerName) ||
        "Objek GIS",
    );
    const luasHaProperty = Number(properties.luas_ha);
    const legacyArea = Number(properties.lsktap ?? properties.luas);
    const shapeAreaM2 = Number(
      properties.shape_area ?? properties.Shape_Area,
    );

    const areaHa =
      Number.isFinite(luasHaProperty) && luasHaProperty > 0
        ? luasHaProperty
        : Number.isFinite(legacyArea) && legacyArea > 0
          ? legacyArea > 100000
            ? legacyArea / 10000
            : legacyArea
          : Number.isFinite(shapeAreaM2) && shapeAreaM2 > 0
            ? shapeAreaM2 / 10000
            : enterpriseGeometryAreaHa(geometry);

    if (enterpriseIdentifyHighlightRef.current) {
      try {
        map.removeLayer(enterpriseIdentifyHighlightRef.current);
      } catch {}
    }
    enterpriseIdentifyHighlightRef.current = null;
    if (geometry) {
      try {
        enterpriseIdentifyHighlightRef.current = window.L.geoJSON(
          { type: "Feature", geometry, properties: {} },
          {
            style: {
              color: "#ef4444",
              weight: 4,
              opacity: 1,
              fillColor: "#f59e0b",
              fillOpacity: 0.18,
              dashArray: "7 4",
            },
            interactive: false,
          },
        ).addTo(map);
      } catch {}
    }

    setEnterpriseIdentify({
      open: true,
      loading: false,
      layerName,
      layerLabel: formatTableName(
        enterpriseLayerMeta(layerName)?.name || layerName,
      ),
      objectLabel: label,
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null,
      areaHa,
      properties,
      geometry,
      source,
    });

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.flyTo([lat, lng], Math.max(map.getZoom(), geometry ? 13 : 15), {
        duration: 0.7,
      });
    }
  };

  // ============================================================
  // SIMITI PRECISE GIS HIT TEST
  // Seluruh pengujian menggunakan geometri Polygon/MultiPolygon asli,
  // bukan bounding box Leaflet. Ring bagian dalam (hole) ikut dihormati.
  // ============================================================
  const toPolygonFeature = (value: any) => {
    if (!value) return null;
    const geometry = value.type === "Feature"
      ? value.geometry
      : value.geometry?.type
        ? value.geometry
        : value;
    if (!geometry || !["Polygon", "MultiPolygon"].includes(String(geometry.type)))
      return null;
    return { type: "Feature", properties: {}, geometry };
  };

  const isPointInsideGeoFeature = (latlng: any, value: any) => {
    const lat = Number(latlng?.lat);
    const lng = Number(latlng?.lng);
    const polygon = toPolygonFeature(value);
    if (!polygon || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    try {
      const pointFeature = {
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [lng, lat] },
      };
      return booleanPointInPolygon(pointFeature as any, polygon as any, {
        ignoreBoundary: false,
      });
    } catch (error) {
      console.warn("SIMITI precise polygon hit-test gagal:", error);
      return false;
    }
  };

  const isPointInsideSelectedAdminAreas = (latlng: any) => {
    if (!selectedAreas?.length) return true;
    const deepestAreas = getDeepestSelectedAdminAreas(selectedAreas);
    // Jika wilayah telah dipilih tetapi geometri batasnya tidak tersedia,
    // fail-closed agar identifikasi tidak bocor ke wilayah lain.
    if (!deepestAreas.length) return false;
    return deepestAreas.some((area: any) =>
      isPointInsideGeoFeature(latlng, area?.geom),
    );
  };

  const identifyEnterpriseAtPoint = (latlng: any) => {
    const map = mapInstanceRef.current;
    if (!map || !window.L || !latlng) return false;
    if (!isPointInsideSelectedAdminAreas(latlng)) {
      console.info("SIMITI identify ditolak: titik di luar wilayah administrasi terpilih", latlng);
      return false;
    }

    const point = window.L.latLng(latlng.lat, latlng.lng);
    const candidates: any[] = [];
    const activeKeys = Array.from(activeLayersRef.current || new Set<string>());
    const groups = layerGroupsRef.current || {};

    activeKeys.forEach((key) => {
      const group = groups[key] || groups[normalizeLayerApiName(key)];
      if (!group?.eachLayer) return;
      group.eachLayer((child: any) => {
        const feature = child?.feature;
        const incident = child?.incidentData;
        if (incident) {
          const ll = child.getLatLng?.();
          if (
            ll &&
            map.distance(point, ll) <=
              Math.max(35, 16 * Math.pow(2, Math.max(0, 14 - map.getZoom())))
          ) {
            candidates.push({
              score: 0,
              feature: {
                type: "Feature",
                geometry: { type: "Point", coordinates: [ll.lng, ll.lat] },
                properties: incident,
              },
              latlng: ll,
              layerName: key,
              source: "Data Kejadian SIMITI",
            });
          }
          return;
        }
        if (!feature) return;

        if (child.getLatLng) {
          const ll = child.getLatLng();
          if (ll && map.distance(point, ll) <= 35) {
            candidates.push({ score: 1, feature, latlng: ll, layerName: key });
          }
          return;
        }

        // Hanya polygon yang benar-benar memuat titik klik yang boleh menjadi
        // kandidat. getBounds().contains() sengaja tidak dipakai sebagai hit-test.
        if (isPointInsideGeoFeature(latlng, feature)) {
          let polygonArea = Number.POSITIVE_INFINITY;
          try {
            polygonArea = turfArea(toPolygonFeature(feature) as any);
          } catch {}
          candidates.push({
            score: 2,
            area: polygonArea,
            feature,
            latlng: point,
            layerName: key,
          });
        }
      });
    });

    if (!candidates.length) {
      console.info("SIMITI identify: tidak ada feature yang tepat di titik klik", {
        lat: latlng.lat,
        lng: latlng.lng,
        activeLayers: activeKeys,
      });
      return false;
    }

    // Jika beberapa polygon bertumpuk, pilih geometri terkecil yang memuat
    // titik klik agar objek paling spesifik tidak kalah oleh polygon besar.
    candidates.sort((a, b) =>
      a.score - b.score || (a.area ?? Number.POSITIVE_INFINITY) - (b.area ?? Number.POSITIVE_INFINITY),
    );
    const hit = candidates[0];
    openEnterpriseIdentify(
      hit.feature,
      hit.layerName,
      hit.latlng,
      hit.source || "SIMITI GIS",
    );
    return true;
  };

  const enterpriseDataGridTabForLayer = (layerName: string) => {
    const map: Record<string, string> = {
      tutupan_lahan: "tutupanLahan",
      penutupan_lahan_2024: "penutupanLahan2024",
      pl2024: "pl2024",
      jenis_tanah: "jenisTanah",
      geologi: "geologi",
      lahan_kritis: "lahan_kritis",
      rawan_erosi: "rawan_erosi",
      rawan_longsor: "rawan_longsor",
      rawan_limpasan: "rawan_limpasan",
      rawan_karhutla: "rawan_karhutla",
      kawasan_hutan: "kawasan_hutan",
      "97": "kawasan_hutan",
      khdtk: "khdtk",
      bahaya_kekeringan: "bahaya_kekeringan",
      bahaya_abrasi_dan_gelombang_ekstrim: "bahaya_abrasi",
      bahaya_banjir: "bahaya_banjir",
      bahaya_banjir_bandang: "bahaya_banjir_bandang",
    };

    // Semua layer Mitigasi & Adaptasi menggunakan
    // satu bottom tab: mitigasi_adaptasi.
    if (INFRA_IDS.includes(layerName as any)) {
      return "mitigasi_adaptasi";
    }

    return map[layerName] || layerName;
  };

  const openEnterpriseDataGrid = () => {
    const tab = enterpriseDataGridTabForLayer(enterpriseIdentify.layerName);
    setActiveBottomTab(tab);

    // Pastikan panel Data Grid terbuka.
    setIsBottomSummaryOpen(true);

    setEnterpriseIdentify((prev) => ({ ...prev, open: false }));
    const el = document.getElementById("enterprise-data-grid");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const buildEnterpriseSearchResults = async (query: string) => {
    const q = query.trim();
    if (q.length < 2) {
      setEnterpriseSearchResults([]);
      return;
    }

    const requestId = ++enterpriseSearchRequestRef.current;
    setEnterpriseSearchLoading(true);
    try {
      const results: any[] = [];

      // 1. Lokasi administratif dari backend yang sudah dipakai aplikasi.
      try {
        const response = await fetch(
          `${API_URL}/api/areas/search?query=${encodeURIComponent(q)}&level=kabupaten`,
        );
        if (response.ok) {
          const areas = await response.json();
          (Array.isArray(areas) ? areas : [])
            .slice(0, 6)
            .forEach((area: any) => {
              results.push({
                type: "location",
                icon: "📍",
                label: area.label || area.kab_kota || area.provinsi || q,
                sublabel: [area.level, area.provinsi]
                  .filter(Boolean)
                  .join(" • "),
                data: area,
              });
            });
        }
      } catch (error) {
        console.warn("Enterprise area search gagal:", error);
      }

      // 2. Layer yang tersedia di Layer Manager.
      const allLayers = [
        ...(layerData?.kerawanan || [])
          .filter((x: any) => isLayerAuthorized(x?.name ?? x?.id))
          .map((x: any) => ({ ...x, group: "Kerawanan" })),
        ...(layerData?.mitigasiAdaptasi || [])
          .filter((x: any) => isLayerAuthorized(x?.name ?? x?.id))
          .map((x: any) => ({ ...x, group: "Mitigasi & Adaptasi" })),
        ...(layerData?.lainnya || [])
          .filter((x: any) => isLayerAuthorized(x?.name ?? x?.id))
          .map((x: any) => ({ ...x, group: "Lainnya" })),
        ...(layerData?.kejadian || []).map((x: any) => ({
          ...x,
          group: "Kejadian",
        })),
      ];
      const seen = new Set<string>();
      allLayers
        .filter((layer: any) => {
          const hay =
            `${layer.id || ""} ${layer.name || ""} ${formatTableName(layer.name || "")}`.toLowerCase();
          return hay.includes(q.toLowerCase());
        })
        .slice(0, 8)
        .forEach((layer: any) => {
          const key = `layer:${layer.id || layer.name}`;
          if (seen.has(key)) return;
          seen.add(key);
          results.push({
            type: "layer",
            icon: "🌳",
            label: formatTableName(layer.name || layer.id),
            sublabel: layer.group,
            data: layer,
          });
        });

      // 3. Objek yang sudah termuat di map (marker kejadian / feature GeoJSON).
      Object.entries(layerGroupsRef.current || {}).forEach(
        ([layerName, group]: [string, any]) => {
          if (!group?.eachLayer) return;
          group.eachLayer((child: any) => {
            const data = child?.incidentData || child?.feature?.properties;
            if (!data) return;
            const hay = Object.values(data)
              .filter((v) => v != null)
              .join(" ")
              .toLowerCase();
            if (!hay.includes(q.toLowerCase())) return;
            const key = `object:${layerName}:${data.id ?? data.title ?? data.name ?? hay.slice(0, 60)}`;
            if (seen.has(key)) return;
            seen.add(key);
            results.push({
              type: "object",
              icon: data.category?.toLowerCase().includes("banjir")
                ? "⚠️"
                : "📌",
              label: data.title || data.name || data.namobj || "Objek GIS",
              sublabel: data.category || formatTableName(layerName),
              layerName,
              data,
            });
          });
        },
      );

      // 4. Fallback geocoder hanya jika hasil lokal belum cukup.
      if (results.length < 5) {
        try {
          const response = await fetch(
            `${API_URL}/api/geocode/search?q=${encodeURIComponent(q)}`,
            { headers: { Accept: "application/json" } },
          );
          if (response.ok) {
            const geo = await response.json();
            (Array.isArray(geo) ? geo : []).slice(0, 4).forEach((item: any) => {
              results.push({
                type: "geocode",
                icon: "⌖",
                label: item.display_name || q,
                sublabel: `${item.lat}, ${item.lon}`,
                data: item,
              });
            });
          }
        } catch (error) {
          console.warn("Enterprise geocode fallback gagal:", error);
        }
      }

      if (requestId === enterpriseSearchRequestRef.current)
        setEnterpriseSearchResults(results.slice(0, 12));
    } finally {
      if (requestId === enterpriseSearchRequestRef.current)
        setEnterpriseSearchLoading(false);
    }
  };

  const handleEnterpriseSearchSelect = async (result: any) => {
    setEnterpriseSearchOpen(false);
    const map = mapInstanceRef.current;
    if (!map || !window.L) return;
    const data = result?.data;

    if (result.type === "location") {
      if (data?.geom) highlightEnterpriseGeometry(data.geom, result.label);
      handleAreaSelect(data);
      window.setTimeout(() => {
        const key = `admin_boundary_${String(data.label || result.label).replace(/[,\s]+/g, "_")}`;
        const boundary = layerGroupsRef.current?.[key];
        if (boundary?.getBounds?.().isValid?.())
          map.flyToBounds(boundary.getBounds(), {
            padding: [50, 50],
            duration: 0.9,
          });
      }, 120);
      return;
    }

    if (result.type === "layer") {
      const layerName = String(data.id || data.name);
      if (!activeLayers.has(layerName))
        await handleLayerToggle(layerName, true);
      window.setTimeout(() => enterpriseZoomToLayer(layerName), 450);
      return;
    }

    if (result.type === "object") {
      identifyEnterpriseObject(data, result.layerName);
      return;
    }

    if (result.type === "geocode") {
      const lat = Number(data.lat),
        lng = Number(data.lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        clearEnterpriseSearchHighlight();
        map.flyTo([lat, lng], 14, { duration: 1.0 });
        const marker = window.L.circleMarker([lat, lng], {
          renderer: window.L.canvas({ padding: 0.5 }),
          radius: 9,
          color: "#f59e0b",
          weight: 4,
          fillColor: "#fbbf24",
          fillOpacity: 0.35,
        }).addTo(map);
        enterpriseSearchHighlightRef.current = marker;
        marker
          .bindPopup(`<b>${String(result.label).replace(/[&<>"]/g, "")}</b>`)
          .openPopup();
      }
    }
  };

  const [selectedInfoTab, setSelectedInfoTab] = useState("Ringkasan");
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null);

  // ======================================================
  // SIMITI AI — Click-to-Diagnose Mitigation
  // ======================================================
  type AiMitigationRecommendation = {
    rank: number;
    intervention_id: string;
    intervention: string;
    priority_score: number;
    urgency: string;
    expected_effect: string;
    why: string;
    evidence: string[];
    implementation_notes: string;
  };

  type AiMitigationPayload = {
    area: string;
    hazard: string;
    diagnosis: string;
    risk_level: string;
    primary_drivers: string[];
    recommendations: AiMitigationRecommendation[];
    confidence: number;
    verification_needed: boolean;
    verification_reason: string;
    meta?: { model?: string; source?: string; generated_at?: string };
  };

  const [aiHazard, setAiHazard] = useState("banjir");
  const [aiRunning, setAiRunning] = useState(false);
  const [aiStage, setAiStage] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiMitigation, setAiMitigation] = useState<AiMitigationPayload | null>(
    null,
  );

  const AI_HAZARD_OPTIONS = [
    ["banjir", "Banjir"],
    ["banjir_bandang", "Banjir Bandang"],
    ["longsor", "Longsor"],
    ["karhutla", "Kebakaran Hutan & Lahan"],
    ["kekeringan", "Kekeringan"],
    ["abrasi", "Abrasi"],
  ];

  const buildMitigationContext = (areasOverride?: any[]) => {
    const areas = areasOverride ?? selectedAreas;
    const selectedArea = areas?.[areas.length - 1] || null;
    const riskMap: Record<string, any[]> = {
      karhutla: risikoData.risiko_karhutla,
      banjir: risikoData.risiko_banjir,
      longsor: risikoData.risiko_longsor,
      kekeringan: risikoData.risiko_kekeringan,
      banjir_bandang: risikoData.risiko_banjir_bandang,
      abrasi: (risikoData as any).risiko_abrasi || [],
    };
    const riskRows = riskMap[aiHazard] || [];
    const riskArea = riskRows.reduce(
      (sum, item) => sum + Number(item.luas || 0),
      0,
    );
    const highRiskArea = riskRows
      .filter((item) => /tinggi|sangat/i.test(String(item.kelas || "")))
      .reduce((sum, item) => sum + Number(item.luas || 0), 0);
    const historicalCount = Math.max(
      kejadianListings.length,
      (kejadianPhotos ?? []).length,
      kebakaran2025Data.length + kebakaran2024Data.length,
    );
    return {
      area: selectedArea || { label: selectedRegionName },
      selected_region: selectedArea?.label || selectedRegionName,
      selected_areas: areas,
      hazard: aiHazard,
      spatial_features: {
        risk_area: riskArea,
        high_risk_area: highRiskArea,
        historical_incidents: historicalCount,
        dominant_land_cover: tutupanLahanData[0]?.deskripsi_domain || null,
        mitigation_activity_records:
          rehabilitasiHutanData.length +
          rehabilitasiDasData.length +
          restorasiGambutData.length,
        rawan_karhutla: rawanKarhutlaData.length,
        rawan_longsor: rawanLongsorData.length,
        rawan_erosi: rawanErosiData.length,
        active_layer_count: activeLayerCount,
      },
      infrastructure: {
        rehabilitasi_das: rehabilitasiDasData.length,
        rehabilitasi_hutan: rehabilitasiHutanData.length,
        restorasi_gambut: restorasiGambutData.length,
      },
      data_timestamp: new Date().toISOString(),
    };
  };

  const runAiMitigationRecommendation = async (areasOverride?: any[]) => {
    if (aiRunning) return;
    setAiRunning(true);
    setAiError("");
    setAiMitigation(null);
    try {
      setAiStage("Membaca kondisi wilayah…");
      const context = buildMitigationContext(areasOverride);
      if (!context.area) throw new Error("Pilih satu wilayah terlebih dahulu.");
      setAiStage("Menganalisis penyebab dan kandidat mitigasi dengan LLM…");
      const response = await fetch(
        `${API_URL}/api/ai/mitigation-recommendation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ context }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          payload?.message || payload?.error || `AI HTTP ${response.status}`,
        );
      if (!payload?.recommendations?.length)
        throw new Error("LLM tidak menghasilkan rekomendasi mitigasi.");
      setAiMitigation(payload);
      setAiStage("Selesai.");
    } catch (error: any) {
      console.error("SIMITI AI mitigation error:", error);
      setAiError(error?.message || "Analisis AI gagal dijalankan.");
    } finally {
      setTimeout(() => setAiStage(""), 700);
      setAiRunning(false);
    }
  };

  const layersWithBottomTabs = [
    "tutupan_lahan",
    "penutupan_lahan_2024",
    "pl2024",
    "jenis_tanah",
    "geologi",
    "lahan_kritis",
    "rawan_erosi",
    "rawan_banjir",
    "rawan_longsor",
    "rawan_limpasan",
    "rawan_karhutla",
    "bahaya_kekeringan",
    "bahaya_abrasi_dan_gelombang_ekstrim",
    "bahaya_banjir",
    "bahaya_banjir_bandang",
    "dta_danau",
    "rehabilitasi_das",
    "rehabilitasi_hutan",
    "restorasi_gambut",
    "penerapan_teknik_kta",
    "karhutla_2021",
    "karhutla_2022",
    "karhutla_2023",
    "karhutla_2024",
    "karhutla_2025",
    "kawasan_hutan",
    "risiko_banjir",
    "risiko_banjir_bandang",
    "risiko_kekeringan",
    "risiko_abrasi",
    "risiko_longsor",
    "risiko_karhutla",
    "khdtk",
    "bendung",
    "bendungan",
    "danau",
    "embung",
    "situ",
    "pengaman_pantai",
    "pengendali_sedimen",
    "pompa_air",
    "sekat_kanal",
  ];

  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const tabToLayerMapping: Record<string, string> = {
      tutupanLahan: "tutupan_lahan",
      penutupanLahan2024: "penutupan_lahan_2024",
      pl2024: "pl2024",
      jenisTanah: "jenis_tanah",
      geologi: "geologi",
      lahan_kritis: "lahan_kritis",
      rawan_erosi: "rawan_erosi",
      rawan_longsor: "rawan_longsor",
      rawan_limpasan: "rawan_limpasan",
      rawan_karhutla: "rawan_karhutla",
      bahaya_kekeringan: "bahaya_kekeringan",
      bahaya_abrasi: "bahaya_abrasi_dan_gelombang_ekstrim",
      bahaya_banjir: "bahaya_banjir",
      bahaya_banjir_bandang: "bahaya_banjir_bandang",
      dta_danau: "dta_danau",
      rehabilitasi_das: "rehabilitasi_das",
      rehabilitasi_hutan: "rehabilitasi_hutan",
      restorasi_gambut: "restorasi_gambut",
      penerapan_teknik_kta: "penerapan_teknik_kta",
      kebakaran_2021: "karhutla_2021",
      kebakaran_2022: "karhutla_2022",
      kebakaran_2023: "karhutla_2023",
      kebakaran_2024: "karhutla_2024",
      kebakaran_2025: "karhutla_2025",
      kawasan_hutan: "kawasan_hutan",
      risiko_banjir: "risiko_banjir",
      risiko_banjir_bandang: "risiko_banjir_bandang",
      risiko_kekeringan: "risiko_kekeringan",
      risiko_abrasi: "risiko_abrasi",
      risiko_longsor: "risiko_longsor",
      risiko_karhutla: "risiko_karhutla",
      khdtk: "khdtk",
      mitigasi_adaptasi: "", // tab gabungan, ditangani terpisah
    };

    // Sembunyikan semua layer yang punya bottom tab
    layersWithBottomTabs.forEach((layerName) => {
      const layer = layerGroupsRef.current[layerName];
      if (layer && mapInstanceRef.current.hasLayer(layer)) {
        safeRemoveMapLayer(layer);
      }
    });

    if (activeBottomTab === "mitigasi_adaptasi") {
      // Tampilkan semua infra layer yang aktif
      INFRA_IDS.forEach((id) => {
        const layer = layerGroupsRef.current[id];
        if (layer && activeLayers.has(id)) {
          if (!mapInstanceRef.current.hasLayer(layer))
            layer.addTo(mapInstanceRef.current);
        }
      });
    } else {
      // Tampilkan layer sesuai tab aktif (non-infra)
      const activeLayerName = tabToLayerMapping[activeBottomTab];
      if (activeLayerName) {
        const activeLayer = layerGroupsRef.current[activeLayerName];
        if (activeLayer && activeLayers.has(activeLayerName)) {
          if (!mapInstanceRef.current.hasLayer(activeLayer)) {
            activeLayer.addTo(mapInstanceRef.current);
          }
        }
      }
    }
  }, [activeBottomTab, activeLayers]);

  const [filters, setFilters] = useState({
    kerawanan: {
      banjir: false,
      tanahLongsor: false,
      kekeringan: false,
      abrasi: false,
      arealBanjir: false,
      arealTanahLongsor: false,
      arealKekeringan: false,
      arealAbrasi: false,
    },
    erosiKebakaran: {
      erosi: false,
      kebakaranHutanLahan: false,
      arealErosi: false,
      arealKebakaranHutan: false,
    },
    mitigasiAdaptasi: {
      rehabilitasiDas: false,
      rehabilitasiHutanLahan: false,
      penerapanTeknik: false,
      bendungan: false,
      danau: false,
      situ: false,
      pengamanPantai: false,
      embung: false,
    },
    lainnya: {
      tutupanLahan: false,
      kawasanHutan: false,
      lahanKritis: false,
      kelerengan: false,
      jenisTanah: false,
      geologi: false,
    },
  });

  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(true);

  const handleFilterChange = (category, key) => {
    setFilters((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: !prev[category][key],
      },
    }));
  };

  const dummyPhotos = [
    "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400",
    "https://images.unsplash.com/photo-1551522435-a13afa10f103?w=400",
    "https://images.unsplash.com/photo-1543747579-795b9c2c3ada?w=400",
    "https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=400",
    "https://images.unsplash.com/photo-1534809027769-b00d750a6410?w=400",
    "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400",
  ];

  const CurahHujanChart = () => {
    const chartRef = useRef<HTMLCanvasElement | null>(null);
    const chartInstance = useRef<Chart | null>(null);

    useEffect(() => {
      if (chartRef.current && window.Chart) {
        const ctx = chartRef.current.getContext("2d");

        if (chartInstance.current) {
          chartInstance.current.destroy();
        }

        const days = Array.from({ length: 30 }, (_, i) => `Hari ${i + 1}`);
        const rainfallData = [
          0, 100, 150, 170, 250, 200, 180, 150, 120, 100, 70, 50, 30, 10, 30,
          50, 70, 100, 50, 40, 45, 50, 55, 50, 40, 30, 50, 80, 100, 100,
        ];

        chartInstance.current = new window.Chart(ctx, {
          type: "line",
          data: {
            labels: days,
            datasets: [
              {
                label: "Curah Hujan (mm/hari)",
                data: rainfallData,
                borderColor: "rgb(59, 130, 246)",
                backgroundColor: "rgba(59, 130, 246, 0.1)",
                tension: 0.4,
                fill: true,
              },
              {
                label: "Batas Kritis (mm)",
                data: Array(30).fill(100),
                borderColor: "rgb(239, 68, 68)",
                backgroundColor: "transparent",
                borderDash: [5, 5],
                pointRadius: 0,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: "top",
              },
            },
            scales: {
              y: {
                beginAtZero: true,
                title: {
                  display: true,
                  text: "Curah Hujan (mm)",
                },
              },
            },
          },
        });
      }

      return () => {
        if (chartInstance.current) {
          chartInstance.current.destroy();
        }
      };
    }, []);

    return <canvas ref={chartRef} />;
  };

  const JenisTanahChart = () => {
    const chartRef = useRef(null);
    const chartInstance = useRef(null);

    useEffect(() => {
      if (chartRef.current && window.Chart) {
        const ctx = chartRef.current.getContext("2d");

        if (chartInstance.current) {
          chartInstance.current.destroy();
        }

        chartInstance.current = new window.Chart(ctx, {
          type: "bar",
          data: {
            labels: ["Aluvial", "Latosol", "Regosol", "Andosol", "Podsolik"],
            datasets: [
              {
                label: "Persentase (%)",
                data: [25, 30, 15, 20, 10],
                backgroundColor: [
                  "rgba(255, 99, 132, 0.7)",
                  "rgba(54, 162, 235, 0.7)",
                  "rgba(255, 206, 86, 0.7)",
                  "rgba(75, 192, 192, 0.7)",
                  "rgba(153, 102, 255, 0.7)",
                ],
                borderColor: [
                  "rgba(255, 99, 132, 1)",
                  "rgba(54, 162, 235, 1)",
                  "rgba(255, 206, 86, 1)",
                  "rgba(75, 192, 192, 1)",
                  "rgba(153, 102, 255, 1)",
                ],
                borderWidth: 1,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: false,
              },
            },
            scales: {
              y: {
                beginAtZero: true,
                max: 100,
                title: {
                  display: true,
                  text: "Persentase (%)",
                },
              },
            },
          },
        });
      }

      return () => {
        if (chartInstance.current) {
          chartInstance.current.destroy();
        }
      };
    }, []);

    return <canvas ref={chartRef} />;
  };

  const TutupanLahanChart = () => {
    const chartRef = useRef<HTMLCanvasElement | null>(null);
    const chartInstance = useRef<Chart | null>(null);

    useEffect(() => {
      if (!chartRef.current || !window.Chart) {
        return;
      }

      const ctx = chartRef.current.getContext("2d");

      if (!ctx) {
        return;
      }

      if (chartInstance.current) {
        chartInstance.current.destroy();
      }

      // konfigurasi chart...

      return () => {
        if (chartInstance.current) {
          chartInstance.current.destroy();
          chartInstance.current = null;
        }
      };
    }, []);

    return <canvas ref={chartRef} />;
  };

  useEffect(() => {
    // Refresh data tutupan lahan jika layer aktif dan bounds berubah
    if (activeLayers.has("tutupan_lahan")) {
      fetchTutupanLahanData();
    }
  }, [currentBounds, selectedDas]);

  const DataTable = ({ columns, data }) => (
    <div className="overflow-x-auto">
      <table className="min-w-full bg-white border border-gray-200">
        <thead className="bg-gray-100">
          <tr>
            {columns.map((col, idx) => (
              <th
                key={idx}
                className="px-2 py-1 border text-left text-[10px] font-semibold text-gray-700"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx} className="hover:bg-gray-50">
              {row.map((cell, cellIdx) => (
                <td
                  key={cellIdx}
                  className="px-2 py-1 border text-[10px] text-gray-600"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const bottomTabs = React.useMemo(() => {
    const tabs: Array<{ id: string; label: string; icon: string }> = [];

    const hasAutoKejadian = Array.from(activeLayers).some(
      (layer) =>
        layer.startsWith("kejadian_") && activeKejadianLayers.has(layer),
    );

    if (hasAutoKejadian) {
      tabs.push({ id: "listings", label: "Historis Bencana", icon: "📋" });
    }

    // Hanya tambahkan tab untuk layer-layer yang punya data bottom tabs
    if (activeLayers.has("tutupan_lahan")) {
      tabs.push({ id: "tutupanLahan", label: "Tutupan Lahan", icon: "🌳" });
    }

    if (activeLayers.has("penutupan_lahan_2024")) {
      tabs.push({
        id: "penutupanLahan2024",
        label: "Penutupan Lahan 2024",
        icon: "🌲",
      });
    }

    if (activeLayers.has("pl2024")) {
      tabs.push({ id: "pl2024", label: "PL2024", icon: "🌴" });
    }

    if (activeLayers.has("jenis_tanah")) {
      tabs.push({ id: "jenisTanah", label: "Jenis Tanah", icon: "🌱" });
    }

    if (activeLayers.has("geologi")) {
      tabs.push({ id: "geologi", label: "Geologi", icon: "🪨" });
    }

    if (activeLayers.has("lahan_kritis")) {
      tabs.push({ id: "lahan_kritis", label: "Lahan Kritis", icon: "⚠️" });
    }

    if (activeLayers.has("rawan_erosi")) {
      tabs.push({ id: "rawan_erosi", label: "Rawan Erosi", icon: "⛰️" });
    }

    if (activeLayers.has("rawan_longsor")) {
      tabs.push({ id: "rawan_longsor", label: "Rawan Longsor", icon: "⛰️" });
    }

    if (activeLayers.has("rawan_limpasan")) {
      tabs.push({ id: "rawan_limpasan", label: "Rawan Limpasan", icon: "💧" });
    }

    if (activeLayers.has("rawan_karhutla")) {
      tabs.push({ id: "rawan_karhutla", label: "Rawan Karhutla", icon: "🔥" });
    }

    if (activeLayers.has("bahaya_kekeringan")) {
      tabs.push({
        id: "bahaya_kekeringan",
        label: "Bahaya Kekeringan",
        icon: "☀️",
      });
    }
    if (activeLayers.has("bahaya_abrasi_dan_gelombang_ekstrim")) {
      tabs.push({ id: "bahaya_abrasi", label: "Bahaya Abrasi", icon: "🌊" });
    }
    if (activeLayers.has("bahaya_banjir")) {
      tabs.push({ id: "bahaya_banjir", label: "Bahaya Banjir", icon: "🌧️" });
    }
    if (activeLayers.has("bahaya_banjir_bandang")) {
      tabs.push({
        id: "bahaya_banjir_bandang",
        label: "Bahaya Banjir Bandang",
        icon: "🌊",
      });
    }
    if (activeLayers.has("dta_danau")) {
      tabs.push({ id: "dta_danau", label: "DTA Danau", icon: "🏞️" });
    }
    if (activeLayers.has("rehabilitasi_das")) {
      tabs.push({
        id: "rehabilitasi_das",
        label: "Rehabilitasi DAS",
        icon: "🌿",
      });
    }
    if (activeLayers.has("rehabilitasi_hutan")) {
      tabs.push({
        id: "rehabilitasi_hutan",
        label: "Rehabilitasi Hutan",
        icon: "🌲",
      });
    }
    if (activeLayers.has("sumur_bor")) {
      tabs.push({
        id: "sumur_bor",
        label: "Sumur Bor",
        icon: "●",
      });
    }
    if (activeLayers.has("restorasi_gambut")) {
      tabs.push({
        id: "restorasi_gambut",
        label: "Restorasi Gambut",
        icon: "🪵",
      });
    }
    if (activeLayers.has("penerapan_teknik_kta")) {
      tabs.push({
        id: "penerapan_teknik_kta",
        label: "Teknik KTA",
        icon: "⛰️",
      });
    }
    if (activeLayers.has("karhutla_2021")) {
      tabs.push({ id: "kebakaran_2021", label: "Kebakaran 2021", icon: "🔥" });
    }
    if (activeLayers.has("karhutla_2022")) {
      tabs.push({ id: "kebakaran_2022", label: "Kebakaran 2022", icon: "🔥" });
    }
    if (activeLayers.has("karhutla_2023")) {
      tabs.push({ id: "kebakaran_2023", label: "Kebakaran 2023", icon: "🔥" });
    }
    if (activeLayers.has("karhutla_2024")) {
      tabs.push({ id: "kebakaran_2024", label: "Kebakaran 2024", icon: "🔥" });
    }
    if (activeLayers.has("karhutla_2025")) {
      tabs.push({ id: "kebakaran_2025", label: "Kebakaran 2025", icon: "🔥" });
    }

    if (activeLayers.has("kawasan_hutan") || activeLayers.has("97")) {
      tabs.push({ id: "kawasan_hutan", label: "Kawasan Hutan", icon: "🌳" });
    }
    if (activeLayers.has("risiko_banjir"))
      tabs.push({ id: "risiko_banjir", label: "Risiko Banjir", icon: "🌊" });
    if (activeLayers.has("risiko_banjir_bandang"))
      tabs.push({
        id: "risiko_banjir_bandang",
        label: "Risiko Banjir Bandang",
        icon: "🌊",
      });
    if (activeLayers.has("risiko_kekeringan"))
      tabs.push({
        id: "risiko_kekeringan",
        label: "Risiko Kekeringan",
        icon: "☀️",
      });
    if (activeLayers.has("risiko_abrasi"))
      tabs.push({ id: "risiko_abrasi", label: "Risiko Abrasi", icon: "🏖️" });
    if (activeLayers.has("risiko_longsor"))
      tabs.push({ id: "risiko_longsor", label: "Risiko Longsor", icon: "⛰️" });
    if (activeLayers.has("risiko_karhutla"))
      tabs.push({
        id: "risiko_karhutla",
        label: "Risiko Karhutla",
        icon: "🔥",
      });
    if (activeLayers.has("khdtk"))
      tabs.push({ id: "khdtk", label: "KHDTK", icon: "🌳" });
    const hasAnyInfra = INFRA_IDS.some((id) => activeLayers.has(id));
    if (hasAnyInfra) {
      tabs.push({
        id: "mitigasi_adaptasi",
        label: "Mitigasi & Adaptasi",
        icon: "🏗️",
      });
    }
    return tabs;
  }, [activeLayers, activeKejadianLayers]);

  // Sinkronkan tab aktif dengan layer yang tersedia, termasuk saat layer dimatikan.
  useEffect(() => {
    if (
      bottomTabs.length > 0 &&
      !bottomTabs.some((tab) => tab.id === activeBottomTab)
    ) {
      setActiveBottomTab(bottomTabs[0].id);
    }
  }, [bottomTabs, activeBottomTab]);

  const renderBottomContent = () => {
    // Jika tidak ada layer yang aktif atau tidak ada tab
    if (bottomTabs.length === 0) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-gray-400">
            <p className="text-sm">Tidak ada data untuk ditampilkan</p>
            <p className="text-xs mt-1">Aktifkan layer untuk melihat data</p>
          </div>
        </div>
      );
    }

    // Render konten berdasarkan tab yang aktif
    switch (activeBottomTab) {
      case "listings":
        if (kejadianListings.length > 0) {
          return (
            <div className="h-full overflow-y-auto">
              <div className="grid grid-cols-1 gap-2 p-3">
                {kejadianListings.map((kejadian, idx) => (
                  <div
                    key={idx}
                    className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => {
                      // Navigate ke detail kejadian bencana
                      navigate("/detailkejadian", {
                        state: {
                          incident: {
                            id: kejadian.id,
                            title: kejadian.title,
                            image: kejadian.thumbnail_path
                              ? `${API_URL}${kejadian.thumbnail_path}`
                              : "https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=400",
                            location: kejadian.location,
                            category: kejadian.category,
                            type: kejadian.category
                              .toLowerCase()
                              .includes("banjir")
                              ? "banjir"
                              : kejadian.category
                                    .toLowerCase()
                                    .includes("longsor")
                                ? "longsor"
                                : "kebakaran",
                            date: kejadian.date,
                            das: kejadian.das,
                            description: kejadian.description,
                            thumbnail_path: kejadian.thumbnail_path,
                            images_paths: kejadian.images_paths,
                            coordinates: [
                              kejadian.latitude,
                              kejadian.longitude,
                            ],
                            latitude: kejadian.latitude,
                            longitude: kejadian.longitude,
                            featured: kejadian.featured || false,
                            curah_hujan: kejadian.curah_hujan,
                          },
                        },
                      });
                    }}
                  >
                    <div className="flex gap-3">
                      {/* Thumbnail */}
                      {kejadian.thumbnail_path && (
                        <div className="w-20 h-20 flex-shrink-0">
                          <img
                            src={`${API_URL}${kejadian.thumbnail_path}`}
                            alt={kejadian.title}
                            className="w-full h-full object-cover rounded"
                            onError={(e) => {
                              e.currentTarget.src =
                                "https://via.placeholder.com/80?text=No+Image";
                            }}
                          />
                        </div>
                      )}

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-gray-800 mb-1 truncate">
                          {kejadian.title}
                        </h4>
                        <div className="space-y-0.5 text-xs text-gray-600">
                          <div className="flex items-center gap-1">
                            <span className="font-medium">📍</span>
                            <span className="truncate">
                              {kejadian.location}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-medium">📅</span>
                            <span>
                              {new Date(kejadian.date).toLocaleDateString(
                                "id-ID",
                                {
                                  day: "numeric",
                                  month: "long",
                                  year: "numeric",
                                },
                              )}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-medium">🏷️</span>
                            <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-[10px] font-medium">
                              {kejadian.category}
                            </span>
                          </div>
                          {kejadian.das && (
                            <div className="flex items-center gap-1">
                              <span className="font-medium">💧</span>
                              <span className="text-blue-600">
                                {kejadian.das}
                              </span>
                            </div>
                          )}
                          {kejadian.curah_hujan !== undefined &&
                            kejadian.curah_hujan !== null && (
                              <div className="flex items-center gap-1">
                                <span className="font-medium">🌧️</span>
                                <span className="text-blue-600">
                                  {kejadian.curah_hujan} mm
                                </span>
                              </div>
                            )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        } else {
          return (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-400">
                <p className="text-sm">
                  Tidak ada data kejadian di area yang dipilih
                </p>
              </div>
            </div>
          );
        }

      case "tutupanLahan":
        if (activeLayers.has("tutupan_lahan") && tutupanLahanData.length > 0) {
          return (
            <div className="p-3 h-full flex flex-col">
              <div
                className="overflow-auto flex-1"
                style={{ maxHeight: "calc(35vh - 100px)" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "50px" }}
                      >
                        No
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "100px" }}
                      >
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Deskripsi Tutupan Lahan
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "120px" }}
                      >
                        Luas (Ha)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tutupanLahanData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onMouseEnter={() =>
                          handleRowMouseEnter(
                            String(item.pl2024_id),
                            "tutupan_lahan",
                            item.color || "#999999",
                          )
                        }
                        onMouseLeave={handleRowMouseLeave}
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <button
                            type="button"
                            title={`Terapkan warna ${item.tingkat} ke peta`}
                            className="w-8 h-4 rounded border border-gray-300 cursor-pointer hover:ring-2 hover:ring-blue-400"
                            style={{ backgroundColor: item.color }}
                            onClick={(event) => { event.stopPropagation(); handleLegendClick(item.tingkat, "rawan_limpasan", item.color || "#808080"); }}
                          />
                        </td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.deskripsi_domain || "-"}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.luas_total
                            ? parseFloat(item.luas_total.toString()).toFixed(2)
                            : "0"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} style={{ height: "80px" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else if (activeLayers.has("tutupan_lahan")) {
          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada data tutupan lahan di area yang dipilih
                </p>
              </div>
            </div>
          );
        }
        break;

      case "penutupanLahan2024":
        if (
          activeLayers.has("penutupan_lahan_2024") &&
          penutupanLahan2024Data.length > 0
        ) {
          return (
            <div className="p-3 h-full flex flex-col">
              <div
                className="overflow-auto flex-1"
                style={{ maxHeight: "calc(35vh - 100px)" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "50px" }}
                      >
                        No
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "100px" }}
                      >
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Deskripsi Tutupan Lahan
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "120px" }}
                      >
                        Luas (Ha)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {penutupanLahan2024Data.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onMouseEnter={() =>
                          handleRowMouseEnter(
                            String(item.pl2024_id),
                            "penutupan_lahan_2024",
                            item.color || "#999999",
                          )
                        }
                        onMouseLeave={handleRowMouseLeave}
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.deskripsi_domain || "-"}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.luas_total
                            ? parseFloat(item.luas_total.toString()).toFixed(2)
                            : "0"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} style={{ height: "80px" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else if (activeLayers.has("penutupan_lahan_2024")) {
          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada data tutupan lahan di area yang dipilih
                </p>
              </div>
            </div>
          );
        }
        break;

      case "pl2024":
        if (activeLayers.has("pl2024") && pl2024Data.length > 0) {
          return (
            <div className="p-3 h-full flex flex-col">
              <div
                className="overflow-auto flex-1"
                style={{ maxHeight: "calc(35vh - 100px)" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "50px" }}
                      >
                        No
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "100px" }}
                      >
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Deskripsi Tutupan Lahan
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "120px" }}
                      >
                        Luas (Ha)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pl2024Data.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onMouseEnter={() =>
                          handleRowMouseEnter(
                            String(item.pl2024_id),
                            "pl2024",
                            item.color || "#999999",
                          )
                        }
                        onMouseLeave={handleRowMouseLeave}
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.deskripsi_domain || "-"}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.luas_total
                            ? parseFloat(item.luas_total.toString()).toFixed(2)
                            : "0"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} style={{ height: "80px" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else if (activeLayers.has("pl2024")) {
          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada data tutupan lahan di area yang dipilih
                </p>
              </div>
            </div>
          );
        }
        break;

      case "jenisTanah":
        if (
          activeLayers.has("jenis_tanah") &&
          (
            jenisTanahData.length > 0 ||
            (
              selectedAreas.length === 0 &&
              selectedDas.length === 0 &&
              !selectedSpatialFeatureRef.current?.feature?.geometry
            )
          )
        ) {
          return (
            <div className="p-3 h-full flex flex-col">
              <div
                className="overflow-auto flex-1"
                style={{ maxHeight: "calc(35vh - 100px)" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "50px" }}
                      >
                        No
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "100px" }}
                      >
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Jenis Tanah
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      selectedAreas.length === 0 &&
                      selectedDas.length === 0 &&
                      !selectedSpatialFeatureRef.current?.feature?.geometry
                        ? JENIS_TANAH_NATIONAL_LEGEND
                        : jenisTanahData
                    ).map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onMouseEnter={() =>
                          handleRowMouseEnter(
                            item.jntnh1,
                            "jenis_tanah",
                            item.color || "#8B4513",
                          )
                        }
                        onMouseLeave={handleRowMouseLeave}
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.jntnh1 || "-"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={3} style={{ height: "80px" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else if (activeLayers.has("jenis_tanah")) {
          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada data jenis tanah di area yang dipilih
                </p>
              </div>
            </div>
          );
        }
        break;

      case "geologi":
        if (activeLayers.has("geologi") && geologiData.length > 0) {
          return (
            <div className="p-3 h-full flex flex-col">
              <div
                className="overflow-auto flex-1"
                style={{ maxHeight: "calc(35vh - 100px)" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "50px" }}
                      >
                        No
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "100px" }}
                      >
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Jenis Batuan
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Umur Batuan
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "120px" }}
                      >
                        Keliling (m)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {geologiData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onMouseEnter={() =>
                          handleRowMouseEnter(
                            `${item.namobj}|${item.umurobj}`,
                            "geologi",
                            item.color || "#B45309",
                          )
                        }
                        onMouseLeave={handleRowMouseLeave}
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.namobj || "-"}
                        </td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.umurobj || "-"}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.keliling_total
                            ? parseFloat(
                                item.keliling_total.toString(),
                              ).toFixed(2)
                            : "0"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={5} style={{ height: "80px" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else if (activeLayers.has("geologi")) {
          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada data geologi di area yang dipilih
                </p>
              </div>
            </div>
          );
        }
        break;

      case "lahan_kritis":
        if (activeLayers.has("lahan_kritis") && lahanKritisData.length > 0) {
          return (
            <div className="p-3 h-full flex flex-col">
              <div
                className="overflow-auto flex-1"
                style={{ maxHeight: "calc(35vh - 100px)" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "50px" }}
                      >
                        No
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "100px" }}
                      >
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Tingkat Kritis
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "120px" }}
                      >
                        Luas (Ha)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lahanKritisData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onMouseEnter={() =>
                          handleRowMouseEnter(
                            item.kritis,
                            "lahan_kritis",
                            item.color || "#808080",
                          )
                        }
                        onMouseLeave={handleRowMouseLeave}
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.kritis || "-"}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.luas_ha ? item.luas_ha.toFixed(2) : "0"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} style={{ height: "80px" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else if (activeLayers.has("lahan_kritis")) {
          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada data lahan kritis di area yang dipilih
                </p>
              </div>
            </div>
          );
        }
        break;

      case "rawan_erosi":
        if (activeLayers.has("rawan_erosi") && rawanErosiData.length > 0) {
          return (
            <div className="p-3 h-full flex flex-col">
              <div
                className="overflow-auto flex-1"
                style={{ maxHeight: "calc(35vh - 100px)" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "50px" }}
                      >
                        No
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "100px" }}
                      >
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Tingkat Kerawanan
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "120px" }}
                      >
                        Luas (Ha)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rawanErosiData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onMouseEnter={() =>
                          handleRowMouseEnter(
                            item.tingkat,
                            "rawan_erosi",
                            item.color || "#808080",
                          )
                        }
                        onMouseLeave={handleRowMouseLeave}
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.tingkat || "-"}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.luas_ha ? item.luas_ha.toFixed(2) : "0"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} style={{ height: "80px" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else if (activeLayers.has("rawan_erosi")) {
          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada data rawan erosi di area yang dipilih
                </p>
              </div>
            </div>
          );
        }
        break;

      case "rawan_longsor":
        if (activeLayers.has("rawan_longsor") && rawanLongsorData.length > 0) {
          return (
            <div className="p-3 h-full flex flex-col">
              <div
                className="overflow-auto flex-1"
                style={{ maxHeight: "calc(35vh - 100px)" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "50px" }}
                      >
                        No
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "100px" }}
                      >
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Tingkat Kerawanan
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "120px" }}
                      >
                        Luas Wilayah
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rawanLongsorData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onMouseEnter={() =>
                          handleRowMouseEnter(
                            item.tingkat,
                            "rawan_banjir",
                            "rawan_longsor",
                            item.color || "#808080",
                          )
                        }
                        onMouseLeave={handleRowMouseLeave}
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.tingkat || "-"}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.luas_ha ? item.luas_ha.toFixed(6) : "0"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} style={{ height: "80px" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else if (activeLayers.has("rawan_longsor")) {
          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada data rawan longsor di area yang dipilih
                </p>
              </div>
            </div>
          );
        }
        break;

      case "rawan_limpasan":
        if (
          activeLayers.has("rawan_limpasan") &&
          rawanLimpasanData.length > 0
        ) {
          return (
            <div className="p-3 h-full flex flex-col">
              <div
                className="overflow-auto flex-1"
                style={{ maxHeight: "calc(35vh - 100px)" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "50px" }}
                      >
                        No
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "100px" }}
                      >
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Tingkat Limpasan
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "120px" }}
                      >
                        Luas (Ha)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rawanLimpasanData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onMouseEnter={() =>
                          handleRowMouseEnter(
                            item.tingkat,
                            "rawan_limpasan",
                            item.color || "#808080",
                          )
                        }
                        onMouseLeave={handleRowMouseLeave}
                        onClick={() => handleLegendClick(item.tingkat, "rawan_limpasan", item.color || "#808080")}
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.tingkat || "-"}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.luas_ha ? item.luas_ha.toFixed(2) : "0"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} style={{ height: "80px" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else if (activeLayers.has("rawan_limpasan")) {
          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada data rawan limpasan di area yang dipilih
                </p>
              </div>
            </div>
          );
        }
        break;

      case "bahaya_kekeringan":
        if (
          activeLayers.has("bahaya_kekeringan") &&
          bahayaKekeringanData.length > 0
        ) {
          return (
            <div className="p-3 h-full flex flex-col">
              <div
                className="overflow-auto flex-1"
                style={{ maxHeight: "calc(35vh - 100px)" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "50px" }}
                      >
                        No
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "100px" }}
                      >
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Kelas
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "140px" }}
                      >
                        Luas (Ha)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {bahayaKekeringanData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onMouseEnter={() =>
                          handleRowMouseEnter(
                            item.kelas,
                            "bahaya_kekeringan",
                            item.color || "#808080",
                          )
                        }
                        onMouseLeave={handleRowMouseLeave}
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.kelas || "-"}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.luas ? item.luas.toFixed(2) : "0"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} style={{ height: "80px" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else if (activeLayers.has("bahaya_kekeringan")) {
          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada data bahaya kekeringan di area yang dipilih
                </p>
              </div>
            </div>
          );
        }
        break;

      case "bahaya_abrasi":
        if (
          activeLayers.has("bahaya_abrasi_dan_gelombang_ekstrim") &&
          bahayaAbrasiData.length > 0
        ) {
          return (
            <div className="p-3 h-full flex flex-col">
              <div
                className="overflow-auto flex-1"
                style={{ maxHeight: "calc(35vh - 100px)" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "50px" }}
                      >
                        No
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "100px" }}
                      >
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Kelas
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "140px" }}
                      >
                        Luas (Ha)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {bahayaAbrasiData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onMouseEnter={() =>
                          handleRowMouseEnter(
                            item.kelas,
                            "bahaya_abrasi_dan_gelombang_ekstrim",
                            item.color || "#808080",
                          )
                        }
                        onMouseLeave={handleRowMouseLeave}
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.kelas || "-"}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.luas ? item.luas.toFixed(2) : "0"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} style={{ height: "80px" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else if (activeLayers.has("bahaya_abrasi_dan_gelombang_ekstrim")) {
          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada data bahaya abrasi di area yang dipilih
                </p>
              </div>
            </div>
          );
        }
        break;

      case "bahaya_banjir":
        if (activeLayers.has("bahaya_banjir") && bahayaBanjirData.length > 0) {
          return (
            <div className="p-3 h-full flex flex-col">
              <div
                className="overflow-auto flex-1"
                style={{ maxHeight: "calc(35vh - 100px)" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "50px" }}
                      >
                        No
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "100px" }}
                      >
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Kelas
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "140px" }}
                      >
                        Luas (Ha)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {bahayaBanjirData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onMouseEnter={() =>
                          handleRowMouseEnter(
                            item.kelas,
                            "bahaya_banjir",
                            item.color || "#808080",
                          )
                        }
                        onMouseLeave={handleRowMouseLeave}
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.kelas || "-"}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.luas ? item.luas.toFixed(2) : "0"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} style={{ height: "80px" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else if (activeLayers.has("bahaya_banjir")) {
          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada data bahaya banjir di area yang dipilih
                </p>
              </div>
            </div>
          );
        }
        break;

      case "bahaya_banjir_bandang":
        if (
          activeLayers.has("bahaya_banjir_bandang") &&
          bahayaBanjirBandangData.length > 0
        ) {
          return (
            <div className="p-3 h-full flex flex-col">
              <div
                className="overflow-auto flex-1"
                style={{ maxHeight: "calc(35vh - 100px)" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "50px" }}
                      >
                        No
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "100px" }}
                      >
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Kelas
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "140px" }}
                      >
                        Luas (Ha)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {bahayaBanjirBandangData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onMouseEnter={() =>
                          handleRowMouseEnter(
                            item.kelas,
                            "bahaya_banjir_bandang",
                            item.color || "#808080",
                          )
                        }
                        onMouseLeave={handleRowMouseLeave}
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.kelas || "-"}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.luas ? item.luas.toFixed(2) : "0"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} style={{ height: "80px" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else if (activeLayers.has("bahaya_banjir_bandang")) {
          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada data bahaya banjir bandang di area yang dipilih
                </p>
              </div>
            </div>
          );
        }
        break;

      case "dta_danau":
        if (activeLayers.has("dta_danau") && dtaDanauData.length > 0) {
          return (
            <div className="p-3 h-full flex flex-col">
              <div
                className="overflow-auto flex-1"
                style={{ maxHeight: "calc(35vh - 100px)" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "50px" }}
                      >
                        No
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "100px" }}
                      >
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Tipe Danau
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "120px" }}
                      >
                        Luas (Ha)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dtaDanauData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onMouseEnter={() =>
                          handleRowMouseEnter(
                            item.tipe_danau,
                            "dta_danau",
                            item.color || "#808080",
                          )
                        }
                        onMouseLeave={handleRowMouseLeave}
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.tipe_danau || "-"}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.luas ? item.luas.toFixed(2) : "0"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} style={{ height: "80px" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else if (activeLayers.has("dta_danau")) {
          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada data DTA Danau di area yang dipilih
                </p>
              </div>
            </div>
          );
        }
        break;

      case "rehabilitasi_das":
        if (
          activeLayers.has("rehabilitasi_das") &&
          rehabilitasiDasData.length > 0
        ) {
          return (
            <div className="p-3 h-full flex flex-col">
              <div
                className="overflow-auto flex-1"
                style={{ maxHeight: "calc(35vh - 100px)" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "50px" }}
                      >
                        No
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "100px" }}
                      >
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        BPDAS
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "120px" }}
                      >
                        Luas RDAS
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rehabilitasiDasData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onMouseEnter={() =>
                          handleRowMouseEnter(
                            item.bpdas,
                            "rehabilitasi_das",
                            item.color || "#808080",
                          )
                        }
                        onMouseLeave={handleRowMouseLeave}
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.bpdas || "-"}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.luas ? item.luas.toFixed(2) : "0"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} style={{ height: "80px" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else if (activeLayers.has("rehabilitasi_das")) {
          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada data rehabilitasi DAS di area yang dipilih
                </p>
              </div>
            </div>
          );
        }
        break;

      case "sumur_bor":
        if (activeLayers.has("sumur_bor")) {
          return (
            <div className="p-3 flex items-center gap-3 h-full">
              <span
                className="inline-flex items-center justify-center text-xl"
                style={{ color: "#1976D2", width: "32px" }}
              >
                ●
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-700">
                  Sumur Bor
                </p>
                <p className="text-xs text-gray-500">
                  Titik lokasi sumur bor dari GeoServer WMS
                </p>
              </div>
            </div>
          );
        }
        break;

      case "rehabilitasi_hutan":
        if (
          activeLayers.has("rehabilitasi_hutan") &&
          rehabilitasiHutanData.length > 0
        ) {
          return (
            <div className="p-3 h-full flex flex-col">
              <div
                className="overflow-auto flex-1"
                style={{ maxHeight: "calc(35vh - 100px)" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "50px" }}
                      >
                        No
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "100px" }}
                      >
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Jenis Tanaman
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "120px" }}
                      >
                        Luas (Ha)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rehabilitasiHutanData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onMouseEnter={() =>
                          handleRowMouseEnter(
                            item.jenis_tana,
                            "rehabilitasi_hutan",
                            item.color || "#808080",
                          )
                        }
                        onMouseLeave={handleRowMouseLeave}
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td
                          className="py-2 px-2 text-gray-700 break-words"
                          style={{ maxWidth: "200px", wordBreak: "break-word" }}
                        >
                          {item.jenis_tana || "-"}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.luas ? item.luas.toFixed(2) : "0"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} style={{ height: "80px" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else if (activeLayers.has("rehabilitasi_hutan")) {
          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Legenda poligon: Rehabilitasi Hutan (GeoServer WMS). Rincian jenis tanaman dan luas tersedia melalui filter wilayah.
                </p>
              </div>
            </div>
          );
        }
        break;

      case "restorasi_gambut":
        if (
          activeLayers.has("restorasi_gambut") &&
          restorasiGambutData.length > 0
        ) {
          return (
            <div className="p-3 h-full flex flex-col">
              <div
                className="overflow-auto flex-1"
                style={{ maxHeight: "calc(35vh - 100px)" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "50px" }}
                      >
                        No
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Jenis
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Bahan
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {restorasiGambutData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onMouseEnter={() =>
                          handleRowMouseEnter(
                            item.jenis,
                            "restorasi_gambut",
                            item.color || "#808080",
                          )
                        }
                        onMouseLeave={handleRowMouseLeave}
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.jenis || "-"}
                        </td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.bahan || "-"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={3} style={{ height: "80px" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else if (activeLayers.has("restorasi_gambut")) {
          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada data restorasi gambut di area yang dipilih
                </p>
              </div>
            </div>
          );
        }
        break;

      case "penerapan_teknik_kta":
        if (
          activeLayers.has("penerapan_teknik_kta") &&
          penerapanTeknikKtaData.length > 0
        ) {
          return (
            <div className="p-3 h-full flex flex-col">
              <div
                className="overflow-auto flex-1"
                style={{ maxHeight: "calc(35vh - 100px)" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "50px" }}
                      >
                        No
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        DAS
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Sub DAS
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {penerapanTeknikKtaData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onMouseEnter={() =>
                          handleRowMouseEnter(
                            item.subdas,
                            "penerapan_teknik_kta",
                            item.color || "#808080",
                          )
                        }
                        onMouseLeave={handleRowMouseLeave}
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.das || "-"}
                        </td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.subdas || "-"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={3} style={{ height: "80px" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else if (activeLayers.has("penerapan_teknik_kta")) {
          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada data penerapan teknik KTA di area yang dipilih
                </p>
              </div>
            </div>
          );
        }
        break;

      case "kebakaran_2021":
        if (activeLayers.has("karhutla_2021") && kebakaran2021Data.length > 0) {
          return (
            <div className="p-3 h-full flex flex-col">
              <div
                className="overflow-auto flex-1"
                style={{ maxHeight: "calc(35vh - 100px)" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "50px" }}
                      >
                        No
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "100px" }}
                      >
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Periode
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {kebakaran2021Data.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onMouseEnter={() =>
                          handleRowMouseEnter(
                            item.periode,
                            "karhutla_2021",
                            item.color || "#808080",
                          )
                        }
                        onMouseLeave={handleRowMouseLeave}
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.periode || "-"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={3} style={{ height: "80px" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else if (activeLayers.has("karhutla_2021")) {
          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada data kebakaran hutan 2021 di area yang dipilih
                </p>
              </div>
            </div>
          );
        }
        break;

      case "kebakaran_2022":
        if (activeLayers.has("karhutla_2022") && kebakaran2022Data.length > 0) {
          return (
            <div className="p-3 h-full flex flex-col">
              <div
                className="overflow-auto flex-1"
                style={{ maxHeight: "calc(35vh - 100px)" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "50px" }}
                      >
                        No
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "100px" }}
                      >
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Periode
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "120px" }}
                      >
                        Luas
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {kebakaran2022Data.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onMouseEnter={() =>
                          handleRowMouseEnter(
                            item.periode,
                            "karhutla_2022",
                            item.color || "#808080",
                          )
                        }
                        onMouseLeave={handleRowMouseLeave}
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.periode || "-"}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.luas ? item.luas.toFixed(2) : "0"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} style={{ height: "80px" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else if (activeLayers.has("karhutla_2022")) {
          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada data kebakaran hutan 2022 di area yang dipilih
                </p>
              </div>
            </div>
          );
        }
        break;

      case "kebakaran_2023":
        if (activeLayers.has("karhutla_2023") && kebakaran2023Data.length > 0) {
          return (
            <div className="p-3 h-full flex flex-col">
              <div
                className="overflow-auto flex-1"
                style={{ maxHeight: "calc(35vh - 100px)" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "50px" }}
                      >
                        No
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "100px" }}
                      >
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Periode
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {kebakaran2023Data.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onMouseEnter={() =>
                          handleRowMouseEnter(
                            item.periode,
                            "karhutla_2023",
                            item.color || "#808080",
                          )
                        }
                        onMouseLeave={handleRowMouseLeave}
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.periode || "-"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={3} style={{ height: "80px" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else if (activeLayers.has("karhutla_2023")) {
          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada data kebakaran hutan 2023 di area yang dipilih
                </p>
              </div>
            </div>
          );
        }
        break;

      case "kebakaran_2024":
        if (activeLayers.has("karhutla_2024") && kebakaran2024Data.length > 0) {
          return (
            <div className="p-3 h-full flex flex-col">
              <div
                className="overflow-auto flex-1"
                style={{ maxHeight: "calc(35vh - 100px)" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "50px" }}
                      >
                        No
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "100px" }}
                      >
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Periode
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "120px" }}
                      >
                        Luas
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {kebakaran2024Data.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onMouseEnter={() =>
                          handleRowMouseEnter(
                            item.periode,
                            "karhutla_2024",
                            item.color || "#808080",
                          )
                        }
                        onMouseLeave={handleRowMouseLeave}
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.periode || "-"}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.luas ? item.luas.toFixed(2) : "0"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} style={{ height: "80px" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else if (activeLayers.has("karhutla_2024")) {
          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada data kebakaran hutan 2024 di area yang dipilih
                </p>
              </div>
            </div>
          );
        }
        break;

      case "kebakaran_2025":
        if (activeLayers.has("karhutla_2025") && kebakaran2025Data.length > 0) {
          return (
            <div className="p-3 h-full flex flex-col">
              <div
                className="overflow-auto flex-1"
                style={{ maxHeight: "calc(35vh - 100px)" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "50px" }}
                      >
                        No
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "100px" }}
                      >
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Periode
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "120px" }}
                      >
                        Luas
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {kebakaran2025Data.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onMouseEnter={() =>
                          handleRowMouseEnter(
                            item.periode,
                            "karhutla_2025",
                            item.color || "#808080",
                          )
                        }
                        onMouseLeave={handleRowMouseLeave}
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.periode || "-"}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.luas ? item.luas.toFixed(2) : "0"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} style={{ height: "80px" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else if (activeLayers.has("karhutla_2025")) {
          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada data kebakaran hutan 2025 di area yang dipilih
                </p>
              </div>
            </div>
          );
        }
        break;

      case "rawan_karhutla":
        if (
          activeLayers.has("rawan_karhutla") &&
          rawanKarhutlaData.length > 0
        ) {
          return (
            <div className="p-3 h-full flex flex-col">
              <div
                className="overflow-auto flex-1"
                style={{ maxHeight: "calc(35vh - 100px)" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "50px" }}
                      >
                        No
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "100px" }}
                      >
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Tingkat Kerawanan
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "120px" }}
                      >
                        Luas (Ha)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rawanKarhutlaData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onMouseEnter={() => {
                          setHoveredLayerKey(item.tingkat);
                          setHoveredLayerType("rawan_karhutla");
                          setHoveredLayerColor(item.color || "#808080");
                        }}
                        onMouseLeave={() => {
                          setHoveredLayerKey(null);
                          setHoveredLayerType(null);
                          setHoveredLayerColor(null);
                        }}
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.tingkat || "-"}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.luas_ha ? item.luas_ha.toFixed(2) : "0"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} style={{ height: "80px" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else if (activeLayers.has("rawan_karhutla")) {
          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada data rawan karhutla di area yang dipilih
                </p>
              </div>
            </div>
          );
        }
        break;

      case "kawasan_hutan":
        if (activeLayers.has("kawasan_hutan") || activeLayers.has("97")) {
          if (kawasanHutanData.length > 0) {
            return (
              <div className="p-3 h-full flex flex-col">
                <div
                  className="overflow-auto flex-1"
                  style={{ maxHeight: "calc(35vh - 100px)" }}
                >
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white z-10">
                      <tr className="border-b border-gray-200">
                        <th
                          className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                          style={{ width: "50px" }}
                        >
                          No
                        </th>
                        <th
                          className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                          style={{ width: "100px" }}
                        >
                          Warna Layer
                        </th>
                        <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                          Fungsi Kawasan Hutan
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {kawasanHutanData.map((item, idx) => (
                        <tr
                          key={idx}
                          className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                          onClick={() =>
                            handleLegendClick(
                              item.fungsikws,
                              "kawasan_hutan",
                              item.color || "#808080",
                            )
                          }
                          onMouseEnter={() =>
                            handleRowMouseEnter(
                              item.fungsikws,
                              "kawasan_hutan",
                              item.color || "#808080",
                            )
                          }
                          onMouseLeave={handleRowMouseLeave}
                        >
                          <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                          <td className="py-2 px-2">
                            <div
                              className="w-8 h-4 rounded border border-gray-300"
                              style={{ backgroundColor: item.color }}
                            ></div>
                          </td>
                          <td className="py-2 px-2 text-gray-700 break-words">
                            {item.deskripsi_domain || "-"}
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={3} style={{ height: "80px" }}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          }

          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada data kawasan hutan di area yang dipilih
                </p>
              </div>
            </div>
          );
        }
        break;

      case "risiko_banjir":
      case "risiko_banjir_bandang":
      case "risiko_kekeringan":
      case "risiko_abrasi":
      case "risiko_longsor":
      case "risiko_karhutla": {
        const risikoLayerData =
          risikoData[activeBottomTab as keyof typeof risikoData] || [];
        const labelMap: Record<string, string> = {
          risiko_banjir: "Risiko Banjir",
          risiko_banjir_bandang: "Risiko Banjir Bandang",
          risiko_kekeringan: "Risiko Kekeringan",
          risiko_abrasi: "Risiko Abrasi",
          risiko_longsor: "Risiko Longsor",
          risiko_karhutla: "Risiko Karhutla",
        };
        if (activeLayers.has(activeBottomTab) && risikoLayerData.length > 0) {
          return (
            <div className="kerawanan-risk-legend-content h-full min-h-0 flex flex-col">
              <div className="kerawanan-risk-legend-scroll min-w-0 w-full overflow-visible">
                <table className="kerawanan-risk-legend-table w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left py-1 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "50px" }}
                      >
                        No
                      </th>
                      <th
                        className="text-left py-1 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "100px" }}
                      >
                        Warna Layer
                      </th>
                      <th className="text-left py-1 px-2 font-medium text-gray-600 bg-white">
                        Kelas
                      </th>
                      <th
                        className="text-left py-1 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "140px" }}
                      >
                        Luas (Ha)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {risikoLayerData.map((item, idx) => (
                      <tr
                        key={idx}
                        className={`border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors ${(activeBottomTab === "risiko_banjir" || activeBottomTab === "risiko_banjir_bandang" || activeBottomTab === "risiko_kekeringan" || activeBottomTab === "risiko_abrasi" || activeBottomTab === "risiko_longsor" || activeBottomTab === "risiko_karhutla" || NATIONAL_HAZARD_WMS_LAYERS.has(activeBottomTab)) && selectedLegendKey === item.kelas ? "bg-blue-100 ring-1 ring-inset ring-blue-300" : ""}`}
                        onClick={() => {
                          if (
                            (
                              activeBottomTab === "risiko_banjir" ||
                              activeBottomTab === "risiko_banjir_bandang" ||
                              activeBottomTab === "risiko_kekeringan" ||
                              activeBottomTab === "risiko_abrasi" ||
                              activeBottomTab === "risiko_longsor" ||
                              activeBottomTab === "risiko_karhutla" ||
                              NATIONAL_HAZARD_WMS_LAYERS.has(activeBottomTab)
                            ) &&
                            !selectedDas.length &&
                            layerGroupsRef.current?.[activeBottomTab]
                          ) {
                            const nextClass = selectedLegendKey === item.kelas ? null : item.kelas;
                            const activeSpatialFocus = selectedSpatialFeatureRef.current;
                            const legendWmsAreas =
                              activeSpatialFocus?.layerType === "admin-village" &&
                              activeSpatialFocus?.feature?.geometry
                                ? [{
                                    geom: activeSpatialFocus.feature.geometry,
                                    level: "kelurahan",
                                  }]
                                : selectedAreas;
                            if (applyNationalRiskBanjirLegendClass(
                              nextClass,
                              activeBottomTab,
                              legendWmsAreas,
                            )) {
                              setSelectedLegendKey(nextClass);
                              return;
                            }
                          }
                          handleLegendClick(item.kelas, activeBottomTab, item.color || "#808080");
                        }}
                        onMouseEnter={() =>
                          handleRowMouseEnter(
                            item.kelas,
                            activeBottomTab,
                            item.color || "#808080",
                          )
                        }
                        onMouseLeave={handleRowMouseLeave}
                      >
                        <td className="py-1 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-1 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-1 px-2 text-gray-700 break-words">
                          {item.kelas || "-"}
                        </td>
                        <td className="py-1 px-2 text-gray-700">
                          {item.luas ? item.luas.toFixed(2) : "0"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else if (activeLayers.has(activeBottomTab)) {
          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada data {labelMap[activeBottomTab]} di area yang
                  dipilih
                </p>
              </div>
            </div>
          );
        }
        break;
      }

      case "khdtk":
        if (activeLayers.has("khdtk") && khdtkData.length > 0) {
          return (
            <div className="p-3 h-full flex flex-col">
              <div
                className="overflow-auto flex-1"
                style={{ maxHeight: "calc(35vh - 100px)" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "50px" }}
                      >
                        No
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "100px" }}
                      >
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Nama KHDTK
                      </th>
                      <th
                        className="text-left py-2 px-2 font-medium text-gray-600 bg-white"
                        style={{ width: "120px" }}
                      >
                        Luas
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Jenis KHDTK
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {khdtkData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onMouseEnter={() =>
                          handleRowMouseEnter(
                            item.namobj,
                            "khdtk",
                            item.color || "#808080",
                          )
                        }
                        onMouseLeave={handleRowMouseLeave}
                        onClick={() => selectKhdtkFromRow(item)}
                        title="Klik untuk memilih KHDTK sebagai batas clipping kerawanan"
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.namobj || "-"}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.lsktap ? item.lsktap.toFixed(2) : "0"}
                        </td>
                        <td className="py-2 px-2 text-gray-700 break-words">
                          {item.jnskhdtk || "-"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={5} style={{ height: "80px" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        } else if (activeLayers.has("khdtk")) {
          return (
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada data KHDTK di area yang dipilih
                </p>
              </div>
            </div>
          );
        }
        break;

      case "mitigasi_adaptasi": {
        const activeInfra = INFRA_LAYERS.filter((l) => activeLayers.has(l.id));

        if (activeInfra.length === 0) {
          return (
            <div
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#ffffff",
              }}
            >
              <div style={{ textAlign: "center", color: "#9ca3af" }}>
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    margin: "0 auto 10px",
                    borderRadius: "12px",
                    background: "#f3f4f6",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "20px",
                  }}
                >
                  🏗️
                </div>
                <div style={{ fontSize: "13px", fontWeight: 500 }}>
                  Belum ada data Mitigasi & Adaptasi
                </div>
                <div style={{ fontSize: "11px", marginTop: "4px" }}>
                  Aktifkan layer infrastruktur untuk melihat data.
                </div>
              </div>
            </div>
          );
        }

        const renderConditionBadge = (value: any) => {
          const textValue = String(value ?? "-").trim();

          if (!textValue || textValue === "-") {
            return <span style={{ color: "#9ca3af" }}>-</span>;
          }

          const lower = textValue.toLowerCase();

          let background = "#FEF3C7";
          let color = "#92400E";
          let border = "#FDE68A";

          if (
            lower.includes("baik") ||
            lower.includes("operasi") ||
            lower.includes("normal")
          ) {
            background = "#ECFDF3";
            color = "#166534";
            border = "#BBF7D0";
          } else if (
            lower.includes("rusak") ||
            lower.includes("buruk") ||
            lower.includes("tidak")
          ) {
            background = "#FEF2F2";
            color = "#B91C1C";
            border = "#FECACA";
          }

          return (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                maxWidth: "100%",
                padding: "3px 8px",
                borderRadius: "999px",
                background,
                color,
                border: `1px solid ${border}`,
                fontSize: "10px",
                lineHeight: 1.2,
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
              title={textValue}
            >
              <span
                style={{
                  width: "5px",
                  height: "5px",
                  borderRadius: "50%",
                  background: color,
                  flexShrink: 0,
                }}
              />
              {textValue}
            </span>
          );
        };

        return (
          <div
            style={{
              height: "100%",
              overflowY: "auto",
              overflowX: "hidden",
              background: "#ffffff",
            }}
          >
            {activeInfra.map((layer, idx) => {
              const rows = infraData[layer.id] || [];
              const sekatCounts = layer.id === "sekat_kanal"
                ? rows.reduce((acc: Record<string, number>, row: any) => {
                    const jenis = String(row?.jenis ?? "").trim().toUpperCase();
                    const bahan = String(row?.bahan ?? "").trim().toUpperCase();
                    const key =
                      jenis === "SPILLWAY" && bahan === "BETON" ? "beton" :
                      jenis === "SPILLWAY" && bahan === "KAYU" ? "kayu" :
                      jenis === "NON SPILLWAY" && bahan === "KAYU" ? "non_spillway" : "lainnya";
                    acc[key] = (acc[key] || 0) + 1;
                    return acc;
                  }, { beton: 0, kayu: 0, non_spillway: 0, lainnya: 0 })
                : null;

              return (
                <section
                  key={layer.id}
                  style={{
                    borderBottom:
                      idx < activeInfra.length - 1
                        ? "8px solid #f8fafc"
                        : "none",
                  }}
                >
                  {/* Header layer — dibuat seperti panel profesional pada mockup */}
                  <div
                    style={{
                      minHeight: "42px",
                      padding: "7px 12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      background: "#ffffff",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: layer.color,
                        boxShadow: `0 0 0 3px ${layer.color}22`,
                        flexShrink: 0,
                      }}
                    />

                    <span
                      style={{
                        color: "#111827",
                        fontSize: "13px",
                        fontWeight: 650,
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {layer.label}
                    </span>

                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        height: "20px",
                        padding: "0 8px",
                        borderRadius: "999px",
                        background: "#f1f5f9",
                        color: "#64748b",
                        fontSize: "10px",
                        fontWeight: 600,
                      }}
                    >
                      {rows.length} data
                    </span>
                  </div>

                  {layer.id === "sekat_kanal" && sekatCounts && (
                    <div style={{ padding: "10px 12px", display: "flex", flexWrap: "wrap", gap: "8px 14px", borderBottom: "1px solid #e5e7eb", background: "#f8fafc" }}>
                      {[
                        { key: "beton", label: "Spillway Beton", color: "#2563EB" },
                        { key: "kayu", label: "Spillway Kayu", color: "#D97706" },
                        { key: "non_spillway", label: "Non Spillway Kayu", color: "#16A34A" },
                        { key: "lainnya", label: "Lainnya / Kosong", color: "#64748B" },
                      ].map((item) => (
                        <div key={item.key} style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "#475569" }}>
                          <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                          <span>{item.label}</span>
                          <strong>{sekatCounts[item.key]}</strong>
                        </div>
                      ))}
                    </div>
                  )}

                  {rows.length === 0 ? (
                    <div
                      style={{
                        padding: "26px 16px",
                        textAlign: "center",
                        color: "#9ca3af",
                        fontSize: "11px",
                      }}
                    >
                      Tidak ada data di area yang dipilih.
                    </div>
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        overflowX: "auto",
                        overflowY: "auto",
                        maxHeight: "calc(35vh - 96px)",
                      }}
                    >
                      <table
                        style={{
                          width: "100%",
                          minWidth: Math.max(760, 30 + layer.cols.length * 145),
                          borderCollapse: "separate",
                          borderSpacing: 0,
                          tableLayout: "fixed",
                          fontSize: "11px",
                        }}
                      >
                        <thead>
                          <tr>
                            <th
                              style={{
                                position: "sticky",
                                top: 0,
                                zIndex: 3,
                                width: "34px",
                                padding: "7px 6px",
                                textAlign: "left",
                                color: "#64748b",
                                background: "#f8fafc",
                                borderBottom: "1px solid #e2e8f0",
                                fontWeight: 600,
                              }}
                            >
                              No
                            </th>

                            {layer.cols.map((col) => (
                              <th
                                key={col.k}
                                style={{
                                  position: "sticky",
                                  top: 0,
                                  zIndex: 3,
                                  width:
                                    col.h === "Nama" || col.h === "Sumber Air"
                                      ? "190px"
                                      : "145px",
                                  padding: "7px 8px",
                                  textAlign: "left",
                                  color: "#64748b",
                                  background: "#f8fafc",
                                  borderBottom: "1px solid #e2e8f0",
                                  fontWeight: 600,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                                title={col.h}
                              >
                                {col.h}
                              </th>
                            ))}
                          </tr>
                        </thead>

                        <tbody>
                          {rows.map((row, i) => (
                            <tr
                              key={i}
                              onMouseEnter={(event) => {
                                event.currentTarget.style.background =
                                  "#f8fbff";
                                handleRowMouseEnter(
                                  String(row[layer.cols[0].k] ?? ""),
                                  layer.id,
                                  layer.color,
                                );
                              }}
                              onMouseLeave={(event) => {
                                event.currentTarget.style.background =
                                  "#ffffff";
                                handleRowMouseLeave();
                              }}
                              style={{
                                background: "#ffffff",
                                transition: "background 120ms ease",
                              }}
                            >
                              <td
                                style={{
                                  padding: "6px",
                                  color: "#64748b",
                                  borderBottom: "1px solid #f1f5f9",
                                  verticalAlign: "middle",
                                }}
                              >
                                {i + 1}
                              </td>

                              {layer.cols.map((col) => {
                                const rawValue = row[col.k];
                                const value =
                                  rawValue === null ||
                                  rawValue === undefined ||
                                  rawValue === ""
                                    ? "-"
                                    : String(rawValue);

                                const isCondition =
                                  col.h === "Kondisi" ||
                                  col.h === "Kondisi Teknis";

                                return (
                                  <td
                                    key={col.k}
                                    style={{
                                      padding: "6px 8px",
                                      color: "#334155",
                                      borderBottom: "1px solid #f1f5f9",
                                      verticalAlign: "middle",
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                    }}
                                    title={value}
                                  >
                                    {isCondition
                                      ? renderConditionBadge(value)
                                      : value}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              );
            })}

            <div style={{ height: "60px" }} />
          </div>
        );
      }

      default:
        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-400">
              <p className="text-sm">Pilih tab untuk melihat data</p>
            </div>
          </div>
        );
    }
  };

  const showSelectedVillagePolygon = async (
    latitude: number,
    longitude: number,
  ) => {
    const map: any = mapInstanceRef.current;
    if (!map || !window.L) return;

    try {
      const url =
        `${API_URL}/api/admin/polygon-by-coordinates` +
        `?lat=${encodeURIComponent(latitude)}` +
        `&lon=${encodeURIComponent(longitude)}`;

      const response = await fetch(url);
      const result = await response.json();

      if (!response.ok || !result?.success || !result?.data?.geom) {
        const previous = selectedVillagePolygonRef.current;
        if (previous && map.hasLayer(previous)) {
          map.removeLayer(previous);
        }
        selectedVillagePolygonRef.current = null;

        // Jangan biarkan batas kelurahan lama tetap menjadi clipping target
        // ketika koordinat baru tidak berada di dalam polygon administrasi.
        if (selectedSpatialFeatureRef.current?.layerType === "admin-village") {
          selectedSpatialFeatureRef.current = null;
          syncSelectedSpatialFeatureBencanaClip();
        }

        if (response.status !== 404) {
          console.warn(
            "SIMITI: polygon desa/kelurahan gagal dimuat:",
            result?.error || response.statusText,
          );
        }
        return;
      }

      // Hapus hanya polygon pilihan sebelumnya.
      // Layer bencana/kerawanan lainnya tetap dipertahankan.
      const previous = selectedVillagePolygonRef.current;
      if (previous && map.hasLayer(previous)) {
        map.removeLayer(previous);
      }

      const polygon = window.L.geoJSON(result.data.geom, {
        style: () => ({
          color: "#059669",
          weight: 3,
          opacity: 1,
          fillColor: "#34d399",
          fillOpacity: 0.18,
        }),
        interactive: true,
        pane: "overlayPane",
      });

      polygon.addTo(map);
      selectedVillagePolygonRef.current = polygon;

      // PENTING: polygon hasil identify koordinat sebelumnya hanya digambar
      // sebagai overlay. Ia belum menjadi selectedSpatialFeature sehingga
      // layer risiko tidak pernah menerima batas kelurahan ini untuk clipping.
      // Daftarkan geometry yang sama sebagai target clip risiko.
      const villageFeature = {
        type: "Feature",
        geometry: result.data.geom,
        properties: {
          level: result.data.level || "kelurahan",
          kel_desa: result.data.kel_desa || result.data.label || "",
          kecamatan: result.data.kecamatan || "",
          kab_kota: result.data.kab_kota || result.data.kabupaten || "",
          provinsi: result.data.provinsi || "",
        },
      };

      selectedSpatialFeatureRef.current = {
        layerType: "admin-village",
        feature: villageFeature,
        layer: polygon,
      };

      // Terapkan ke layer risiko yang sudah aktif dan pertahankan sinkron
      // ketika peta di-pan/zoom. Jika risiko baru dicentang kemudian,
      // alur toggle yang ada juga akan membaca selectedSpatialFeatureRef.
      requestAnimationFrame(() => syncSelectedSpatialFeatureBencanaClip());

      console.info("SIMITI: polygon desa/kelurahan terpilih dan dijadikan batas clip risiko", {
        desa: result.data.kel_desa,
        kecamatan: result.data.kecamatan,
        kabupaten: result.data.kab_kota,
        provinsi: result.data.provinsi,
      });
    } catch (error) {
      console.error("SIMITI: gagal menampilkan polygon desa/kelurahan:", error);
    }
  };
  const fetchMapWeather = async (latitude: number, longitude: number) => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    // Marker lokasi yang sedang dipilih, mengikuti mockup popup cuaca.
    if (mapInstanceRef.current && window.L) {
      try {
        if (mapWeatherMarkerRef.current) {
          mapWeatherMarkerRef.current.setLatLng([latitude, longitude]);
        } else {
          mapWeatherMarkerRef.current = window.L.marker([
            latitude,
            longitude,
          ]).addTo(mapInstanceRef.current);
        }
      } catch (markerError) {
        console.warn("Gagal memperbarui marker cuaca:", markerError);
      }
    }

    setMapWeatherPopup((prev) => ({
      ...prev,
      open: true,
      loading: true,
      error: "",
      latitude,
      longitude,
      locationName: "Mengidentifikasi wilayah...",
      district: "",
      province: "",
      current: null,
      dailyRain: null,
    }));

    try {
      const weatherParams = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        current:
          "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure",
        daily: "precipitation_sum,rain_sum",
        forecast_days: "1",
        timezone: "Asia/Jakarta",
      });

      const [weatherResponse, reverseResponse] = await Promise.all([
        fetch(
          `https://api.open-meteo.com/v1/forecast?${weatherParams.toString()}`,
          { headers: { Accept: "application/json" }, cache: "no-store" },
        ),
        fetch(
          `${API_URL}/api/geocode/reverse?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`,
          { headers: { Accept: "application/json" }, cache: "no-store" },
        ),
      ]);

      if (!weatherResponse.ok) {
        throw new Error(`Open-Meteo HTTP ${weatherResponse.status}`);
      }

      const weatherJson = await weatherResponse.json();
      if (!weatherJson?.current) {
        throw new Error("Data cuaca Open-Meteo kosong.");
      }

      let locationName = "Lokasi dipilih";
      let district = "";
      let province = "";

      if (reverseResponse.ok) {
        const reverseJson = await reverseResponse.json();
        const address = reverseJson?.address || {};
        province = address.state || address.province || address.region || "";
        district =
          address.city_district ||
          address.state_district ||
          address.county ||
          address.municipality ||
          address.city ||
          address.town ||
          "";
        locationName =
          address.village ||
          address.suburb ||
          address.quarter ||
          address.hamlet ||
          address.neighbourhood ||
          address.town ||
          address.city_district ||
          address.city ||
          address.municipality ||
          address.county ||
          reverseJson?.display_name?.split(",")[0] ||
          "Wilayah belum teridentifikasi";
      }

      const dailyRain =
        typeof weatherJson?.daily?.precipitation_sum?.[0] === "number"
          ? weatherJson.daily.precipitation_sum[0]
          : null;

      setMapWeatherPopup({
        open: true,
        loading: false,
        error: "",
        latitude,
        longitude,
        locationName,
        district,
        province,
        current: weatherJson.current,
        dailyRain,
        updatedAt: weatherJson.current.time || new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Map weather fetch error:", error);
      setMapWeatherPopup((prev) => ({
        ...prev,
        open: true,
        loading: false,
        error:
          error?.message ||
          "Gagal mengambil data cuaca untuk lokasi yang dipilih.",
      }));
    }
  };

  const closeMapWeatherPopup = () => {
    setMapWeatherPopup((prev) => ({ ...prev, open: false }));
  };

  const weatherDescription = (code?: number) => {
    const map: Record<number, string> = {
      0: "Cerah",
      1: "Cerah berawan",
      2: "Sebagian berawan",
      3: "Berawan",
      45: "Berkabut",
      48: "Kabut beku",
      51: "Gerimis ringan",
      53: "Gerimis",
      55: "Gerimis lebat",
      61: "Hujan ringan",
      63: "Hujan",
      65: "Hujan lebat",
      71: "Salju ringan",
      73: "Salju",
      75: "Salju lebat",
      80: "Hujan lokal ringan",
      81: "Hujan lokal",
      82: "Hujan lokal lebat",
      95: "Badai petir",
      96: "Badai petir + hujan es",
      99: "Badai petir + hujan es lebat",
    };
    return map[Number(code)] || "Kondisi tidak diketahui";
  };

  const weatherIcon = (code?: number) => {
    const value = Number(code);
    if (value === 0) return "☀️";
    if (value === 1 || value === 2) return "🌤️";
    if (value === 3) return "☁️";
    if (value === 45 || value === 48) return "🌫️";
    if (value >= 51 && value <= 67) return "🌧️";
    if (value >= 71 && value <= 86) return "🌨️";
    if (value >= 95) return "⛈️";
    return "";
  };

  const formatWeatherTime = (value?: string | null) => {
    if (!value) return "—";
    try {
      return new Intl.DateTimeFormat("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
      }).format(new Date(value));
    } catch {
      return value.replace("T", " ").slice(0, 16);
    }
  };

  const fetchOpenMeteoWeather = async () => {
    // Pertahankan default lokasi lama jika tidak ada koordinat dari env.
    const latitude = Number(import.meta.env.VITE_WEATHER_LATITUDE ?? -6.2);
    const longitude = Number(
      import.meta.env.VITE_WEATHER_LONGITUDE ?? 106.816666,
    );

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setOpenMeteoWeather((prev) => ({
        ...prev,
        loading: false,
        error: "Koordinat Open-Meteo tidak valid.",
      }));
      return;
    }

    setOpenMeteoWeather((prev) => ({
      ...prev,
      loading: true,
      error: "",
      latitude,
      longitude,
    }));

    try {
      const params = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        current:
          "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure",
        daily: "precipitation_sum,rain_sum",
        forecast_days: "1",
        timezone: "Asia/Jakarta",
      });

      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
        { headers: { Accept: "application/json" }, cache: "no-store" },
      );

      if (!response.ok) {
        throw new Error(`Open-Meteo HTTP ${response.status}`);
      }

      const json = await response.json();
      if (!json?.current) {
        throw new Error("Data cuaca Open-Meteo kosong.");
      }

      setOpenMeteoWeather({
        loading: false,
        error: "",
        latitude,
        longitude,
        current: json.current,
        daily: json.daily || null,
        updatedAt: json.current.time || new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Open-Meteo fetch error:", error);
      setOpenMeteoWeather((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Gagal mengambil data cuaca Open-Meteo.",
      }));
    }
  };

  useEffect(() => {
    fetchOpenMeteoWeather();

    const interval = window.setInterval(fetchOpenMeteoWeather, 30 * 60 * 1000);

    return () => window.clearInterval(interval);
  }, []);

  const [gpsLocation, setGpsLocation] = useState<GpsLocationState>({
    loading: false,
    error: "",
    latitude: null,
    longitude: null,
    accuracy: null,
    locationName: "Lokasi saat ini",
    village: "",
    district: "",
    city: "",
    province: "",
    displayName: "",
    updatedAt: null,
  });
  const [gpsPopupOpen, setGpsPopupOpen] = useState(true);
  const [gpsThreats, setGpsThreats] = useState<GpsThreatState>({
    loading: false,
    error: "",
    threats: [],
    riskStatus: null,
    riskScore: null,
    updatedAt: null,
  });

  const fetchGpsThreats = async (latitude: number, longitude: number) => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    setGpsThreats((prev) => ({
      ...prev,
      loading: true,
      error: "",
    }));

    try {
      // Sumber ancaman = data kerawanan SIMITI/PostGIS melalui endpoint
      // location-proximity. Frontend tidak menghitung point-in-polygon.
      const params = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        threatLimit: "20",
        mitigationLimit: "1",
        incidentLimit: "1",
      });

      const response = await fetch(
        `${API_URL}/api/location-proximity?${params.toString()}`,
        {
          headers: {
            Accept: "application/json",
            ...(getAuthToken()
              ? { Authorization: `Bearer ${getAuthToken()}` }
              : {}),
          },
          cache: "no-store",
        },
      );

      const json = await response.json().catch(() => ({}));

      if (!response.ok || json?.success === false) {
        throw new Error(
          json?.message || `Analisis ancaman HTTP ${response.status}`,
        );
      }

      // Hanya tampilkan ancaman yang benar-benar mencakup titik GPS.
      // Threat yang hanya "terdekat" tidak disebut sebagai ancaman di lokasi.
      const threats = (Array.isArray(json?.threats) ? json.threats : [])
        .filter((item: any) => item?.inside === true)
        .map((item: any) => ({
          key: String(item?.key || ""),
          label: String(item?.label || item?.key || "Ancaman"),
          status:
            item?.status !== null && item?.status !== undefined
              ? String(item.status)
              : null,
          score:
            item?.score !== null &&
            item?.score !== undefined &&
            Number.isFinite(Number(item.score))
              ? Number(item.score)
              : null,
          distanceMeters: 0,
          inside: true,
          source: String(item?.source || "data kerawanan"),
        }))
        .filter((item: GpsThreatItem) => item.key || item.label);

      setGpsThreats({
        loading: false,
        error: "",
        threats,
        riskStatus: json?.risk?.status ?? null,
        riskScore:
          json?.risk?.score !== null && json?.risk?.score !== undefined
            ? Number(json.risk.score)
            : null,
        updatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error(
        "Gagal membaca ancaman bencana dari data kerawanan:",
        error,
      );
      setGpsThreats((prev) => ({
        ...prev,
        loading: false,
        error:
          error?.message ||
          "Data ancaman bencana untuk titik GPS gagal dimuat.",
        updatedAt: new Date().toISOString(),
      }));
    }
  };

  const detectCurrentGpsLocation = () => {
    if (!navigator.geolocation) {
      setGpsLocation((prev) => ({
        ...prev,
        loading: false,
        error: "Browser ini tidak mendukung GPS/geolocation.",
      }));
      setGpsPopupOpen(true);
      return;
    }

    setGpsPopupOpen(true);
    setGpsLocation((prev) => ({ ...prev, loading: true, error: "" }));

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const accuracy = position.coords.accuracy;

        setGpsLocation((prev) => ({
          ...prev,
          loading: true,
          error: "",
          latitude,
          longitude,
          accuracy,
          updatedAt: new Date().toISOString(),
        }));

        // Begitu GPS mendapatkan koordinat, langsung cek ancaman dari
        // data kerawanan SIMITI/PostGIS untuk titik tersebut.
        void fetchGpsThreats(latitude, longitude);

        try {
          const response = await fetch(
            `${API_URL}/api/geocode/reverse?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`,
            { headers: { Accept: "application/json" }, cache: "no-store" },
          );
          if (!response.ok)
            throw new Error(`Reverse geocoding HTTP ${response.status}`);

          const json = await response.json();
          const address = json?.address || {};
          const village =
            address.village ||
            address.suburb ||
            address.neighbourhood ||
            address.quarter ||
            address.hamlet ||
            "";
          const district =
            address.city_district ||
            address.district ||
            address.subdistrict ||
            "";
          const city =
            address.city ||
            address.town ||
            address.municipality ||
            address.county ||
            "";
          const province =
            address.state || address.province || address.region || "";
          const locationName =
            village ||
            district ||
            city ||
            province ||
            json?.name ||
            "Lokasi saat ini";

          setGpsLocation({
            loading: false,
            error: "",
            latitude,
            longitude,
            accuracy,
            locationName,
            village,
            district,
            city,
            province,
            displayName: json?.display_name || "",
            updatedAt: new Date().toISOString(),
          });

          // Tampilkan posisi GPS tanpa mengubah viewport peta Indonesia.
          // Render dipisahkan dari marker dan accuracy circle agar kegagalan
          // renderer Circle tidak mengganggu marker/WebGIS lainnya.
          if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            latitude < -90 ||
            latitude > 90 ||
            longitude < -180 ||
            longitude > 180
          ) {
            console.warn("⚠️ Koordinat GPS tidak valid:", {
              latitude,
              longitude,
              accuracy,
            });
          } else {
            const gpsSeq = ++gpsRequestSeqRef.current;

            if (gpsRenderFrameRef.current !== null) {
              cancelAnimationFrame(gpsRenderFrameRef.current);
            }

            gpsRenderFrameRef.current = requestAnimationFrame(() => {
              gpsRenderFrameRef.current = null;

              try {
                const map = mapInstanceRef.current;
                const L = window.L;
                if (!map || !L || !(map as any)._loaded) return;
                if (gpsSeq !== gpsRequestSeqRef.current) return;

                const latLng = L.latLng(Number(latitude), Number(longitude));

                // GPS icon sengaja tidak dirender di peta.
                // Posisi GPS tetap disimpan dan accuracy circle tetap ditampilkan.

                // Accuracy circle: isolated so a Leaflet SVG bounds error cannot
                // break the GPS marker or any existing WebGIS layer.
                try {
                  const radius = Math.max(
                    Number.isFinite(Number(accuracy)) ? Number(accuracy) : 5,
                    5,
                  );

                  if (
                    gpsAccuracyCircleRef.current &&
                    gpsAccuracyCircleRef.current._map !== map
                  ) {
                    try {
                      gpsAccuracyCircleRef.current.remove();
                    } catch {}
                    gpsAccuracyCircleRef.current = null;
                  }

                  if (gpsAccuracyCircleRef.current) {
                    gpsAccuracyCircleRef.current.setLatLng(latLng);
                    gpsAccuracyCircleRef.current.setRadius(radius);
                  } else {
                    gpsAccuracyCircleRef.current = L.circle(latLng, {
                      renderer: L.canvas({ padding: 0.5 }),
                      radius,
                      color: "#16a34a",
                      weight: 1,
                      opacity: 0.35,
                      fillColor: "#22c55e",
                      fillOpacity: 0.08,
                      interactive: false,
                    }).addTo(map);
                  }
                } catch (circleError) {
                  console.warn(
                    "⚠️ GPS accuracy circle gagal ditampilkan:",
                    circleError,
                  );
                  gpsAccuracyCircleRef.current = null;
                }
              } catch (mapError) {
                console.warn(
                  "⚠️ Gagal merender lokasi GPS ke Leaflet:",
                  mapError,
                );
              }
            });
          }
        } catch (error: any) {
          setGpsLocation((prev) => ({
            ...prev,
            loading: false,
            error:
              error?.message ||
              "Koordinat ditemukan, tetapi nama wilayah gagal dimuat.",
          }));
        }
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Izin lokasi ditolak. Aktifkan izin Location/GPS pada browser."
            : error.code === error.POSITION_UNAVAILABLE
              ? "Lokasi GPS belum tersedia. Pastikan layanan lokasi perangkat aktif."
              : error.code === error.TIMEOUT
                ? "Pencarian lokasi GPS terlalu lama. Silakan coba lagi."
                : "Gagal mendapatkan lokasi saat ini.";
        setGpsLocation((prev) => ({ ...prev, loading: false, error: message }));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  };

  useEffect(() => {
    detectCurrentGpsLocation();
  }, []);

  const selectedRegionName =
    selectedAreas.length > 0 ? selectedAreas[0].label : "Indonesia";
  const totalEvents =
    kejadianListings.length || (kejadianPhotos ?? []).length || 0;
  const activeLayerCount = activeLayers.size;

  // ======================================================
  // EXPORT PETA KE PDF — DOWNLOAD LANGSUNG
  // Mengambil snapshot area peta yang sedang terlihat lalu
  // memasukkannya ke PDF A4 landscape tanpa dialog Print.
  // Library dimuat saat tombol pertama kali digunakan sehingga
  // tidak perlu mengubah backend.
  // ======================================================
  const loadExternalScript = (
    src: string,
    globalName: string,
  ): Promise<any> => {
    const existing = (window as any)[globalName];
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      const found = document.querySelector(
        `script[data-sikma-pdf="${globalName}"]`,
      ) as HTMLScriptElement | null;
      if (found) {
        found.addEventListener("load", () =>
          resolve((window as any)[globalName]),
        );
        found.addEventListener("error", () =>
          reject(new Error(`Gagal memuat ${globalName}`)),
        );
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.dataset.sikmaPdf = globalName;
      script.onload = () => {
        const lib = (window as any)[globalName];
        if (lib) resolve(lib);
        else
          reject(
            new Error(`${globalName} tidak tersedia setelah script dimuat`),
          );
      };
      script.onerror = () =>
        reject(new Error(`Gagal memuat library PDF: ${src}`));
      document.head.appendChild(script);
    });
  };

  const handleDownloadMapPdf = async () => {
    const map = mapInstanceRef.current;
    const mapElement = mapRef.current;

    if (!map || !mapElement) {
      alert("Peta belum siap. Silakan tunggu sampai peta selesai dimuat.");
      return;
    }

    if (selectedAreas.length === 0 && selectedDas.length === 0) {
      alert(
        "Pilih wilayah administrasi atau DAS terlebih dahulu sebelum mengunduh peta PDF.",
      );
      return;
    }

    const areaNames = selectedAreas
      .map((area: any) => area.label)
      .filter(Boolean);
    const dasNames = selectedDas
      .map((das: any) => das.nama_das)
      .filter(Boolean);
    const exportName =
      [...areaNames, ...dasNames].join(", ") || "Wilayah Terpilih";
    const safeFileName =
      exportName
        .replace(/[^a-zA-Z0-9-\s_-]/g, "")
        .replace(/\s+/g, "_")
        .slice(0, 100) || "Wilayah_Terpilih";

    const mapSection = mapElement.closest(
      ".kerawanan-map",
    ) as HTMLElement | null;
    const titleOverlay = mapSection?.querySelector(
      ".print-map-title",
    ) as HTMLElement | null;
    const controls = mapSection
      ? (Array.from(
          mapSection.querySelectorAll(".leaflet-control-container"),
        ) as HTMLElement[])
      : [];
    const originalTitleDisplay = titleOverlay?.style.display || "";
    const originalControlDisplays = controls.map((el) => el.style.display);
    // Simpan posisi peta agar PDF bisa memusatkan wilayah terpilih,
    // lalu kembalikan tampilan peta seperti semula setelah export.
    const originalMapCenter =
      typeof (map as any).getCenter === "function"
        ? (map as any).getCenter()
        : null;
    const originalMapZoom =
      typeof (map as any).getZoom === "function" ? (map as any).getZoom() : null;

    try {
      const button = document.activeElement as HTMLButtonElement | null;
      if (button) button.blur();

      // Jangan memanggil invalidateSize/pan saat export. Operasi tersebut dapat memaksa
      // Leaflet merender ulang CircleMarker dan memicu crash bila ada feature lama yang invalid.
      // Export memakai viewport yang sedang terlihat. Jangan memanggil fitBounds,
      // panBy, invalidateSize, atau operasi animasi: ini memicu render ulang path
      // Leaflet dan dapat menjatuhkan renderer bila ada layer legacy yang korup.
      // Pusatkan wilayah terpilih hanya jika Leaflet benar-benar menerima
      // bounds tersebut. Jika bounds dari API/state tidak cocok dengan format
      // Leaflet, jangan gagalkan proses PDF: gunakan viewport yang sedang tampil.
      const exportBounds = isValidMapBounds(currentBounds);
      if (
        exportBounds &&
        typeof (map as any).fitBounds === "function" &&
        typeof (map as any).getBounds === "function"
      ) {
        try {
          const L = (window as any).L;
          const boundsForExport =
            typeof L?.latLngBounds === "function"
              ? L.latLngBounds(exportBounds)
              : null;

          if (
            boundsForExport &&
            typeof boundsForExport.isValid === "function" &&
            boundsForExport.isValid()
          ) {
            (map as any).fitBounds(boundsForExport, {
              padding: [36, 36],
              animate: false,
              duration: 0,
              maxZoom: Math.max(
                5,
                Number.isFinite(Number(originalMapZoom))
                  ? Number(originalMapZoom)
                  : 7,
              ),
            });
            await new Promise((resolve) => window.setTimeout(resolve, 250));
          } else {
            console.warn(
              "SIMITI: bounds export tidak valid untuk Leaflet; memakai viewport saat ini.",
            );
          }
        } catch (boundsError) {
          // Bounds tidak valid tidak boleh membatalkan download PDF.
          console.warn(
            "SIMITI: gagal memusatkan bounds saat export; memakai viewport saat ini.",
            boundsError,
          );
        }
      } else {
        console.warn(
          "SIMITI: bounds filter tidak valid; snapshot memakai viewport saat ini.",
        );
      }

      // Pastikan overlay judul terlihat dan kontrol Leaflet tidak ikut masuk PDF.
      if (titleOverlay) titleOverlay.style.display = "block";
      controls.forEach((el) => {
        el.style.display = "none";
      });

      // Tunggu render peta + tile selesai.
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      if (document.fonts?.ready) await document.fonts.ready;

      const html2canvas = await loadExternalScript(
        "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
        "html2canvas",
      );
      const jspdfNamespace = await loadExternalScript(
        "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
        "jspdf",
      );

      const canvas = await html2canvas(mapElement, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#eaf4f8",
        scale: Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
        logging: false,
        imageTimeout: 15000,
        removeContainer: true,
        // html2canvas 1.4.1 tidak mendukung fungsi warna oklch(). Di dokumen
        // clone saja, salin properti warna dari computed style browser (RGB/RGBA),
        // sehingga CSS aplikasi asli tidak berubah.
        onclone: (clonedDocument: Document) => {
          // html2canvas 1.4.1 gagal mem-parse fungsi warna CSS modern (oklch/oklab/color()).
          // Sanitasi seluruh stylesheet pada dokumen clone, bukan hanya elemen peta, karena
          // parser html2canvas membaca stylesheet global aplikasi meskipun node berada di luar peta.
          const unsupportedColorFunction =
            /(?:oklch|oklab|color)\(\s*[^)]*\)/gi;
          // Vite production/development dapat memuat CSS lewat <link rel="stylesheet">.
          // Salin CSSOM same-origin yang bisa dibaca ke style tag aman, lalu lepas link clone
          // asalnya agar html2canvas tidak membaca ulang deklarasi oklch dari file CSS tersebut.
          let copiedCss = "";
          const sameOriginStylesheets = new Set<string>();
          Array.from(document.styleSheets).forEach((sheet) => {
            try {
              const href = (sheet as CSSStyleSheet).href;
              const rules = Array.from(sheet.cssRules || [])
                .map((rule) => rule.cssText)
                .join("\n");
              copiedCss += rules + "\n";
              if (
                href &&
                new URL(href, document.baseURI).origin ===
                  window.location.origin
              ) {
                sameOriginStylesheets.add(new URL(href, document.baseURI).href);
              }
            } catch {
              // Stylesheet lintas-origin (mis. CDN Leaflet) dibiarkan; biasanya tidak memakai oklch.
            }
          });
          clonedDocument
            .querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
            .forEach((link) => {
              try {
                const href = new URL(link.href, clonedDocument.baseURI).href;
                if (sameOriginStylesheets.has(href)) link.remove();
              } catch {
                /* abaikan URL stylesheet yang tidak valid */
              }
            });
          if (copiedCss) {
            const safeStyle = clonedDocument.createElement("style");
            safeStyle.textContent = copiedCss.replace(
              unsupportedColorFunction,
              "rgba(0, 0, 0, 0)",
            );
            clonedDocument.head.appendChild(safeStyle);
          }
          clonedDocument.querySelectorAll("style").forEach((styleNode) => {
            styleNode.textContent = (styleNode.textContent || "").replace(
              unsupportedColorFunction,
              "rgba(0, 0, 0, 0)",
            );
          });
          clonedDocument
            .querySelectorAll<HTMLElement>("[style]")
            .forEach((element) => {
              const inlineStyle = element.getAttribute("style");
              if (inlineStyle && unsupportedColorFunction.test(inlineStyle)) {
                unsupportedColorFunction.lastIndex = 0;
                element.setAttribute(
                  "style",
                  inlineStyle.replace(
                    unsupportedColorFunction,
                    "rgba(0, 0, 0, 0)",
                  ),
                );
              }
              unsupportedColorFunction.lastIndex = 0;
            });

          const clonedRoot = clonedDocument.querySelector(
            ".leaflet-container",
          ) as HTMLElement | null;
          if (!clonedRoot) return;
          const originalElements = [
            mapElement,
            ...Array.from(mapElement.querySelectorAll<HTMLElement>("*")),
          ];
          const clonedElements = [
            clonedRoot,
            ...Array.from(clonedRoot.querySelectorAll<HTMLElement>("*")),
          ];
          const colorProperties = [
            "color",
            "backgroundColor",
            "borderTopColor",
            "borderRightColor",
            "borderBottomColor",
            "borderLeftColor",
            "outlineColor",
            "textDecorationColor",
            "fill",
            "stroke",
          ] as const;
          originalElements.forEach((original, index) => {
            const cloned = clonedElements[index];
            if (!cloned) return;
            const computed = window.getComputedStyle(original);
            colorProperties.forEach((property) => {
              const cssProperty = property.replace(
                /[A-Z]/g,
                (m) => `-${m.toLowerCase()}`,
              );
              const value = computed.getPropertyValue(cssProperty);
              if (value && !/(?:oklch|oklab|color)\(/i.test(value)) {
                (cloned.style as any)[property] = value;
              }
            });
          });
        },
      });

      const JsPDF = jspdfNamespace.jsPDF || (window as any).jspdf?.jsPDF;
      if (!JsPDF) throw new Error("Library jsPDF tidak tersedia.");

      const pdf = new JsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      const pageWidth = 297;
      const pageHeight = 210;
      const margin = 8;
      const titleHeight = 18;
      const availableWidth = pageWidth - margin * 2;
      const availableHeight = pageHeight - margin * 2 - titleHeight;
      const imageRatio = canvas.width / canvas.height;
      let imageWidth = availableWidth;
      let imageHeight = imageWidth / imageRatio;
      if (imageHeight > availableHeight) {
        imageHeight = availableHeight;
        imageWidth = imageHeight * imageRatio;
      }

      const imageX = (pageWidth - imageWidth) / 2;
      const imageY = margin + titleHeight;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      pdf.text("SIMITI • Peta Kawasan Rawan", margin, margin + 5);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.text(`Wilayah: ${exportName}`, margin, margin + 10, {
        maxWidth: availableWidth,
      });
      pdf.setFontSize(7);
      pdf.text(
        `Dicetak dari SIMITI GIS • ${new Date().toLocaleString("id-ID")}`,
        margin,
        margin + 14,
      );

      pdf.addImage(
        canvas.toDataURL("image/jpeg", 0.92),
        "JPEG",
        imageX,
        imageY,
        imageWidth,
        imageHeight,
        undefined,
        "FAST",
      );
      pdf.save(`Peta_SIMITI_${safeFileName}.pdf`);
    } catch (error: any) {
      console.error("Gagal membuat PDF peta:", error);
      alert(
        error?.message ||
          "Gagal membuat PDF. Pastikan peta sudah selesai dimuat dan koneksi internet tersedia.",
      );
    } finally {
      // Kembalikan viewport asli setelah snapshot agar posisi peta di halaman
      // tidak berubah akibat proses download.
      if (
        originalMapCenter &&
        originalMapZoom !== null &&
        typeof (map as any).setView === "function"
      ) {
        try {
          (map as any).setView(originalMapCenter, originalMapZoom, {
            animate: false,
          });
        } catch (restoreMapError) {
          console.warn("SIMITI: posisi peta awal tidak dapat dipulihkan:", restoreMapError);
        }
      }
      if (titleOverlay) titleOverlay.style.display = originalTitleDisplay;
      controls.forEach((el, index) => {
        el.style.display = originalControlDisplays[index] || "";
      });
    }
  };

  const bottomLegendRiskLayers = [
    "risiko_banjir",
    "risiko_banjir_bandang",
    "risiko_kekeringan",
    "risiko_abrasi",
    "risiko_longsor",
    "risiko_karhutla",
  ] as const;

  const bottomActiveRiskLayers = bottomLegendRiskLayers.filter((name) =>
    activeLayers.has(name),
  );
  const bottomActiveInfraLayers = INFRA_LAYERS.filter((layer) =>
    activeLayers.has(layer.id),
  );

  useEffect(() => {
    if (bottomActiveInfraLayers.length === 0) {
      setActiveInfraSummaryLayer(null);
      return;
    }
    if (
      !bottomActiveInfraLayers.some(
        (layer) => layer.id === activeInfraSummaryLayer,
      )
    ) {
      setActiveInfraSummaryLayer(bottomActiveInfraLayers[0].id);
    }
  }, [activeLayers, activeInfraSummaryLayer]);

  const bottomValue = (v: any) => {
    const textValue = String(v ?? "").trim();
    return textValue || "-";
  };

  const bottomIncidentDate = (date: any) => {
    if (!date) return "-";
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return String(date);
    return parsed.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const bottomIncidentTone = (category: any) => {
    const lower = String(category ?? "").toLowerCase();
    if (lower.includes("banjir")) {
      return "border-blue-200 bg-blue-50 text-blue-700";
    }
    if (lower.includes("longsor")) {
      return "border-amber-200 bg-amber-50 text-amber-700";
    }
    if (lower.includes("karhutla") || lower.includes("kebakaran")) {
      return "border-orange-200 bg-orange-50 text-orange-700";
    }
    return "border-slate-200 bg-white text-slate-600";
  };

  return (
    <div className={`kerawanan-root flex h-screen w-full overflow-hidden bg-[#f4f7f6] text-slate-800 ${isLoadingLayer || loadingLayerNames.size > 0 ? "simiti-data-loading" : ""}`}>
      <style>{`
        /* SIMITI: GLOBAL DATA LOADING CURSOR */
        .kerawanan-root.simiti-data-loading,
        .kerawanan-root.simiti-data-loading * {
          cursor: progress !important;
        }

        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm;
          }

          html, body {
            width: 100% !important;
            height: 100% !important;
            overflow: visible !important;
            background: #fff !important;
          }

          body * {
            visibility: hidden !important;
          }

          .kerawanan-map,
          .kerawanan-map * {
            visibility: visible !important;
          }

          .kerawanan-map {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100vw !important;
            height: calc(100vh - 16mm) !important;
            min-height: 0 !important;
            max-height: none !important;
            border: 0 !important;
            border-radius: 0 !important;

            overflow: hidden !important;
            background: #fff !important;
          }

          .kerawanan-map .leaflet-control-container,
          .kerawanan-map .leaflet-control,
          .kerawanan-map button,
          .kerawanan-map input,
          .kerawanan-map .mockup-map-search {
            display: none !important;
          }

          .kerawanan-map .leaflet-tile,
          .kerawanan-map .leaflet-marker-icon,
          .kerawanan-map .leaflet-overlay-pane,
          .kerawanan-map .leaflet-shadow-pane,
          .kerawanan-map .leaflet-marker-pane,
          .kerawanan-map .leaflet-tooltip-pane,
          .kerawanan-map .leaflet-popup-pane {
            visibility: visible !important;
          }

          .kerawanan-map .leaflet-container {
            background: #eaf4f8 !important;
            width: 100% !important;
            height: 100% !important;
          }

          .kerawanan-map .print-map-title {
            display: block !important;
          }
        }

        /* Kontrol navigasi Leaflet: tersusun vertikal, tidak menutupi overlay atas. */
        .kerawanan-map .leaflet-bottom.leaflet-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 7px;
          margin: 0 12px 12px 0;
        }

        .kerawanan-map .leaflet-bottom.leaflet-right .leaflet-control {
          margin: 0;
        }

        .kerawanan-map .simiti-default-extent-control a {
          display: block;
          width: 30px;
          height: 30px;
          line-height: 30px;
          text-align: center;
          color: #334155;
          background: #fff;
          text-decoration: none;
          cursor: pointer;
        }

        .kerawanan-map .simiti-default-extent-control a:hover {
          background: #f1f5f9;
          color: #047857;
        }

        .print-map-title {
          display: none;
        }

        .custom-kejadian-marker { background:none; border:none; }
        .gps-location-tooltip {
          border: 0 !important;
          border-radius: 999px !important;
          padding: 5px 9px !important;
          background: #064e3b !important;
          color: #fff !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          box-shadow: 0 5px 18px rgba(15,23,42,.18) !important;
        }
        .gps-location-tooltip:before { border-top-color: #064e3b !important; }
        .marker-container:hover .marker-bg { fill:#ef4444 !important; }
        .custom-kejadian-popup .leaflet-popup-content-wrapper { border-radius:12px; padding:0; box-shadow:0 8px 30px rgba(15,23,42,.16); }
        .custom-kejadian-popup .leaflet-popup-content { margin:0; width:280px !important; }
        .custom-kejadian-popup .leaflet-popup-tip { display:none; }
        .dashboard-scroll::-webkit-scrollbar { width:6px; height:6px; }
        .dashboard-scroll::-webkit-scrollbar-thumb { background:#b8c9c2; border-radius:999px; }
        .mockup-map-search input::placeholder { color:#94a3b8; }
        .mockup-chip { white-space:nowrap; }

        /* Enterprise responsive shell */
        .enterprise-sidebar { transition: transform .25s ease, box-shadow .25s ease; }
        .mobile-topbar { display:none; }
        .mobile-menu-button { border:0; background:#064238; color:#fff; width:38px; height:38px; border-radius:10px; align-items:center; justify-content:center; flex-direction:column; gap:4px; box-shadow:0 4px 14px rgba(6,66,56,.18); }
        .mobile-menu-button span { display:block; width:16px; height:2px; border-radius:999px; background:currentColor; }
        .mobile-page-title { font-size:11px; font-weight:800; color:#0f513f; letter-spacing:.02em; }
        .mobile-page-title span { color:#94a3b8; font-weight:600; }
        .admin-boundary-tooltip { border:0; border-radius:8px; box-shadow:0 6px 18px rgba(15,23,42,.16); font-size:11px; font-weight:700; }

        /* =========================================================
           SIMITI Enterprise Responsive UI — UI ONLY
           No data/API/business logic is changed.
           ========================================================= */
        html, body, #root { min-height: 100%; }
        .kerawanan-workspace { min-width: 0; min-height: 0; }
        /* =====================================================
           RIGHT LAYER PANEL — DESKTOP OVERLAY
           Panel tidak mengambil kolom grid.
           Map tetap full width dan panel mengambang di kanan.
           ===================================================== */
        /* Bottom Summary — clean enterprise */
.kerawanan-bottom-summary {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}

.kerawanan-bottom-summary::before,
.kerawanan-bottom-summary::after {
  display: none !important;
  content: none !important;
  border: none !important;
  box-shadow: none !important;
}
@media (min-width: 1280px) {
          .kerawanan-workspace {
            grid-template-columns: minmax(0, 1fr) !important;
            grid-template-rows: minmax(0, 1fr) 220px !important;
            position: relative !important;
            overflow: hidden !important;
          }

          .kerawanan-map {
            grid-column: 1 !important;
            grid-row: 1 !important;
            width: 100% !important;
            min-width: 0 !important;
            min-height: 0 !important;
          }

          .kerawanan-layer-panel {
            position: absolute !important;
            top: 12px !important;
            right: 12px !important;
            bottom: 12px !important;
            width: 350px !important;
            min-width: 350px !important;
            max-width: 350px !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            grid-column: auto !important;
            grid-row: auto !important;
            z-index: 1300 !important;
          }

          .kerawanan-layer-panel > div {
            height: 100% !important;
          }

          .kerawanan-bottom-summary {

            grid-column: 1 !important;
            grid-row: 2 !important;
            width: 100% !important;
            height: 220px !important;
            min-height: 0 !important;
            max-height: 220px !important;
          }

@media (min-width: 1280px) {
  .kerawanan-bottom-summary {

  }
}
        }
        @media (min-width: 1280px) {
          .kerawanan-workspace { height: 100%; }
          .kerawanan-map { min-height: 0 !important; }
          .kerawanan-bottom-summary {

  outline: none !important; min-height: 0 !important; }
        }
        .kerawanan-map,
        .kerawanan-layer-panel,
        .kerawanan-bottom-summary {

  outline: none !important; min-width: 0; }
        /* Desktop: 3 panel tetap sejajar.
           Kejadian dibuat lebih sempit, Legenda diperlebar,
           Mitigasi & Adaptasi tetap berada di sisi kanan. */
        .kerawanan-bottom-summary {

          grid-template-columns: minmax(220px, 0.78fr) minmax(0, 1.32fr) minmax(0, 1.15fr) !important;
          gap: 0;
          min-height: 0 !important;
          max-height: 200px;
          height: 200px;
        }
        .kerawanan-bottom-summary > * {
          min-width: 0 !important;
          min-height: 0 !important;
          height: 100%;
          overflow: hidden;
          border-left: 0 !important;
          border-right: 0 !important;
        }
        .kerawanan-bottom-summary > * + * {
          border-left: 1px solid #e2e8f0 !important;
        }
        .kerawanan-bottom-summary .dashboard-scroll {
          min-height: 0;
          scrollbar-gutter: stable;
        }
        .kerawanan-bottom-summary table {
          table-layout: auto;
        }

/* Urutan panel bawah: Kejadian Terkini | Legenda | Mitigasi & Adaptasi */
.kerawanan-bottom-summary > :nth-child(1) { order: 1; }
.kerawanan-bottom-summary > :nth-child(2) { order: 2; }
.kerawanan-bottom-summary > :nth-child(3) { order: 3; }
        .kerawanan-layer-panel { position: relative; z-index: 20; }
        .kerawanan-bottom-summary {

  outline: none !important; position: relative; z-index: 10; }
        .kerawanan-bottom-summary button { min-width: 0; }

        /* Panel bawah enterprise: selalu 200px saat terbuka. */
        /* =====================================================
           RIGHT LAYER PANEL — DESKTOP OVERLAY
           Panel tidak mengambil kolom grid.
           Map tetap full width dan panel mengambang di kanan.
           ===================================================== */
        @media (min-width: 1280px) {
          .kerawanan-workspace {
            grid-template-columns: minmax(0, 1fr) !important;
            grid-template-rows: minmax(0, 1fr) 220px !important;
            position: relative !important;
            overflow: hidden !important;
          }

          .kerawanan-map {
            grid-column: 1 !important;
            grid-row: 1 !important;
            width: 100% !important;
            min-width: 0 !important;
            min-height: 0 !important;
          }

          .kerawanan-layer-panel {
            position: absolute !important;
            top: 12px !important;
            right: 12px !important;
            bottom: 12px !important;
            width: 350px !important;
            min-width: 350px !important;
            max-width: 350px !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            grid-column: auto !important;
            grid-row: auto !important;
            z-index: 1300 !important;
          }

          .kerawanan-layer-panel > div {
            height: 100% !important;
          }

          .kerawanan-bottom-summary {

            grid-column: 1 !important;
            grid-row: 2 !important;
            width: 100% !important;
            height: 220px !important;
            min-height: 0 !important;
            max-height: 220px !important;
          }
        }
        @media (min-width: 1280px) {
          .kerawanan-workspace {
            grid-template-rows: minmax(0, 1fr) 220px !important;
            row-gap: 8px !important;
          }
          .kerawanan-bottom-summary {

            height: 220px !important;
            max-height: 220px !important;
            min-height: 0 !important;
          }
        }

        @media (max-width: 1279px) {
          .kerawanan-workspace {
            height: auto !important;
            min-height: 100% !important;
            grid-template-columns: minmax(0, 1fr) !important;
            grid-template-rows: auto !important;
            gap: 10px !important;
          }
          .kerawanan-map {
            grid-column: 1 / -1 !important;
            grid-row: auto !important;
            height: clamp(460px, 62vh, 720px) !important;
            min-height: 420px !important;
          }
          .kerawanan-layer-panel {
            grid-column: 1 / -1 !important;
            grid-row: auto !important;
            min-height: 360px !important;
            max-height: min(62vh, 620px) !important;
          }
          .kerawanan-bottom-summary {

            grid-column: 1 / -1 !important;
            grid-row: auto !important;
            height: 220px !important;
            max-height: 220px !important;
            min-height: 0 !important;
            overflow: hidden !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          }
          .kerawanan-bottom-summary > * {
            min-width: 0 !important;
            min-height: 0 !important;
            height: 220px !important;
            max-height: 220px !important;
          }
        }

        @media (max-width: 767px) {
          .kerawanan-workspace { gap: 8px !important; }
          .kerawanan-map {
            height: clamp(420px, 64svh, 640px) !important;
            min-height: 390px !important;
            border-radius: 12px !important;
          }
          .kerawanan-layer-panel {
            min-height: 320px !important;
            max-height: 58svh !important;
            border-radius: 12px !important;
          }
          .kerawanan-bottom-summary {

            grid-template-columns: minmax(0, 1fr) !important;
            gap: 8px !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
          }
          .kerawanan-bottom-summary > * {
            min-height: 170px !important;
            height: 240px;
            border-radius: 12px !important;
            border-left: 1px solid #e2e8f0 !important;
          }
          .kerawanan-map .mockup-map-search {
            top: 10px !important;
            left: 10px !important;
            right: 10px !important;
            width: auto !important;
          }
          .kerawanan-map .mockup-map-search > div:first-child {
            height: 42px !important;
            border-radius: 12px !important;
          }
          .kerawanan-map .mockup-map-search input {
            font-size: 12px !important;
            min-width: 0;
          }
          .kerawanan-map button[aria-controls="kerawanan-bottom-summary-panel"] {
            width: 42px !important;
            height: 30px !important;
          }
        }

        @media (max-width: 479px) {
          .kerawanan-map {
            height: 56svh !important;
            min-height: 360px !important;
          }
          .kerawanan-layer-panel { max-height: 54svh !important; }
          .kerawanan-bottom-summary > * { min-height: 155px !important; height: 220px; }
        }

        @media (min-width: 1600px) {
          .kerawanan-workspace { gap: 10px !important; }
        }

        @media (max-width: 1023px) and (orientation: landscape) {
          .kerawanan-map { height: 72svh !important; min-height: 360px !important; }
          .kerawanan-layer-panel { max-height: 70svh !important; }
        }

        @supports (padding: env(safe-area-inset-bottom)) {
          .kerawanan-workspace { padding-bottom: max(0px, env(safe-area-inset-bottom)); }
        }


        /* SIMITIGASI right panel — compact two-column reference layout.
           Existing layer handlers, data flow and palette are unchanged. */
        .simiti-layer-panel-header {
          background: #ffffff;
          border-bottom: 1px solid #e5e7eb;
          color: #1f2937;
        }
        .simiti-layer-panel-header > div {
          color: #1f2937 !important;
        }
        .simiti-layer-panel-header button {
          color: #6b7280 !important;
        }
        .simiti-layer-list {
          scrollbar-width: thin;
          scrollbar-color: #c5cbd1 transparent;
        }
        .simiti-layer-grid { align-items: stretch; }
        .simiti-layer-item { min-height: 20px; }
        .simiti-layer-item input { accent-color: #64748b; }
        .simiti-layer-list > div { margin-bottom: 10px !important; }
        /* Garis pemisah tegas antar kategori layer pada panel kanan. */
        .simiti-layer-category {
          padding-bottom: 10px;
          margin-bottom: 12px !important;
          border-bottom: 3px solid #e2e8f0;
        }

        .simiti-layer-list h3,
        .simiti-layer-list > div > div > button {
          font-size: 10px !important;
          line-height: 14px !important;
        }
        @media (max-width: 1279px) {
          .kerawanan-workspace {
            position: relative !important;
          }
          .kerawanan-layer-panel {
            position: absolute !important;
            top: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: min(240px, 60vw) !important;
            min-width: min(240px, 60vw) !important;
            max-width: min(240px, 60vw) !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            grid-column: auto !important;
            grid-row: auto !important;
            z-index: 1300 !important;
            border-radius: 0 0 8px 0 !important;
          }
          .kerawanan-layer-panel > div {
            height: 100% !important;
            border-radius: 0 0 8px 0 !important;
          }
          .simiti-layer-list { padding: 6px !important; }
          .simiti-layer-grid { gap: 4px !important; }
          .simiti-layer-item { padding: 3px 4px !important; min-height: 19px !important; }
          .simiti-layer-item span { font-size: 8px !important; line-height: 12px !important; }
        }
\n        .kerawanan-workspace * { min-width: 0; }
        .kerawanan-workspace input,
        .kerawanan-workspace select,
        .kerawanan-workspace button { max-width: 100%; }

        .kerawanan-workspace button:focus-visible,
        .kerawanan-workspace input:focus-visible,
        .kerawanan-workspace select:focus-visible {
          outline: 2px solid rgba(16,185,129,.45);
          outline-offset: 1px;
        }

        @media (prefers-reduced-motion: reduce) {
          .enterprise-sidebar,
          .kerawanan-workspace *,
          .kerawanan-workspace *::before,
          .kerawanan-workspace *::after {
            animation-duration: .01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: .01ms !important;
            scroll-behavior: auto !important;
          }
        }
        @media (max-width: 1279px) {
          .enterprise-sidebar { position:fixed; inset:0 0 0 auto; width:270px; max-width:82vw; transform:translateX(105%); box-shadow:-16px 0 40px rgba(0,0,0,.22); }
          .enterprise-sidebar.mobile-sidebar-open { transform:translateX(0); }
          .mobile-topbar { display:flex; align-items:center; gap:10px; padding:8px 12px; min-height:52px; }
          .mobile-topbar::after { content:""; position:fixed; inset:0; background:rgba(2,6,23,.42); z-index:-1; pointer-events:none; opacity:0; }
          .enterprise-sidebar.mobile-sidebar-open ~ * { }
        }
        @media (max-width: 1279px) {
          /* Tombol navigasi tetap terlihat di atas peta pada tablet dan ponsel. */
          .mobile-menu-button {
            display: flex !important;
            position: fixed !important;
            top: 10px !important;
            left: 10px !important;
            z-index: 10000 !important;
            width: 42px !important;
            height: 42px !important;
            flex: 0 0 42px !important;
            background: #064238 !important;
            color: #fff !important;
            border: 1px solid rgba(255,255,255,.75) !important;
            box-shadow: 0 4px 16px rgba(2, 24, 20, .35) !important;
          }
          .enterprise-sidebar { z-index: 10010 !important; }
          .mockup-map-search { padding-left: 48px !important; }
        }
        @media (max-width: 767px) {
          .mobile-topbar { padding:7px 10px; min-height:48px; }
          .mockup-map-search input { font-size:11px; }
          .kerawanan-map { width:100% !important; overflow:hidden !important; }
        }
        /* =====================================================
           RIGHT LAYER PANEL — DESKTOP OVERLAY
           Panel tidak mengambil kolom grid.
           Map tetap full width dan panel mengambang di kanan.
           ===================================================== */
        @media (min-width: 1280px) {
          .kerawanan-workspace {
            grid-template-columns: minmax(0, 1fr) !important;
            grid-template-rows: minmax(0, 1fr) 220px !important;
            position: relative !important;
            overflow: hidden !important;
          }

          .kerawanan-map {
            grid-column: 1 !important;
            grid-row: 1 !important;
            width: 100% !important;
            min-width: 0 !important;
            min-height: 0 !important;
          }

          .kerawanan-layer-panel {
            position: absolute !important;
            top: 12px !important;
            right: 12px !important;
            bottom: 12px !important;
            width: 350px !important;
            min-width: 350px !important;
            max-width: 350px !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            grid-column: auto !important;
            grid-row: auto !important;
            z-index: 1300 !important;
          }

          .kerawanan-layer-panel > div {
            height: 100% !important;
          }

          .kerawanan-bottom-summary {

            grid-column: 1 !important;
            grid-row: 2 !important;
            width: 100% !important;
            height: 220px !important;
            min-height: 0 !important;
            max-height: 220px !important;
          }
        }
        @media (min-width: 1280px) {
          .mobile-menu-button { display:none !important; }
        }

        /* Tombol untuk memunculkan kembali panel layer kanan saat disembunyikan. */
        .kerawanan-panel-reopen {
          position: absolute;
          top: 16px;
          right: 14px;
          z-index: 1400;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 40px;
          padding: 0 14px;
          border: 1px solid #dbe4ee;
          border-radius: 12px;
          background: rgba(255,255,255,.96);
          color: #0f172a;
          box-shadow: 0 8px 24px rgba(15,23,42,.16);
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          backdrop-filter: blur(8px);
        }
        .kerawanan-panel-reopen:hover {
          background: #f8fafc;
          border-color: #94a3b8;
        }
        .kerawanan-panel-reopen:focus-visible {
          outline: 3px solid rgba(16,185,129,.35);
          outline-offset: 2px;
        }

        /* =========================================================
           SIMITI Enterprise Visual System — typography & density
           UI presentation only; no API/data/business logic changes.
           ========================================================= */
        .kerawanan-workspace,
        .kerawanan-workspace * {
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        /* Bring micro-copy up to a readable enterprise baseline. */
        .kerawanan-workspace [class~="text-[7px]"] { font-size: 10px !important; line-height: 1.35 !important; }
        .kerawanan-workspace [class~="text-[8px]"] { font-size: 10.5px !important; line-height: 1.4 !important; }
        .kerawanan-workspace [class~="text-[9px]"] { font-size: 11px !important; line-height: 1.45 !important; }
        .kerawanan-workspace [class~="text-[10px]"] { font-size: 12px !important; line-height: 1.45 !important; }
        .kerawanan-workspace [class~="text-[11px]"] { font-size: 12.5px !important; line-height: 1.45 !important; }
        .kerawanan-workspace [class~="text-xs"] { font-size: 12px !important; line-height: 1.45 !important; }
        .kerawanan-workspace [class~="text-sm"] { font-size: 13px !important; line-height: 1.5 !important; }

        /* Consistent controls: compact, but comfortable for desktop use. */
        .kerawanan-workspace input,
        .kerawanan-workspace select {
          font-size: 12px;
          line-height: 1.35;
        }
        .kerawanan-workspace input::placeholder {
          font-size: 11.5px;
        }
        .kerawanan-workspace button {
          letter-spacing: .005em;
        }

        /* Enterprise cards / panels. */
        .kerawanan-workspace .rounded-lg,
        .kerawanan-workspace .rounded-xl,
        .kerawanan-workspace .rounded-2xl {
          --tw-ring-offset-shadow: 0 0 #0000;
        }
        .kerawanan-workspace .shadow-sm {
          box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 4px 14px rgba(15,23,42,.035) !important;
        }
        .kerawanan-workspace .border-slate-200 {
          border-color: #dbe3e8 !important;
        }

        /* Better section headers without making the interface oversized. */
        .kerawanan-workspace h3 {
          line-height: 1.3;
          letter-spacing: -.01em;
        }
        .kerawanan-workspace h4 {
          line-height: 1.35;
          letter-spacing: .01em;
        }

        /* Layer manager: readable density and clear hierarchy. */
        .kerawanan-layer-panel {
          font-size: 12px;
        }
        .kerawanan-layer-panel .font-extrabold,
        .kerawanan-layer-panel .font-bold {
          letter-spacing: .005em;
        }

        /* Search and toolbar surfaces. */
        .mockup-map-search input {
          font-size: 12px !important;
          font-weight: 500;
        }
        .mockup-map-search {
          filter: drop-shadow(0 6px 16px rgba(15,23,42,.08));
        }

        /* Data labels: avoid the old tiny “dashboard” look. */
        .kerawanan-workspace .uppercase {
          letter-spacing: .07em;
        }

        @media (max-width: 1279px) {
          .kerawanan-workspace [class~="text-[7px]"] { font-size: 9.5px !important; }
          .kerawanan-workspace [class~="text-[8px]"] { font-size: 10px !important; }
          .kerawanan-workspace [class~="text-[9px]"] { font-size: 10.5px !important; }
          .kerawanan-workspace [class~="text-[10px]"] { font-size: 11.5px !important; }
        }

        @media (max-width: 767px) {
          .kerawanan-workspace [class~="text-[7px]"] { font-size: 9px !important; }
          .kerawanan-workspace [class~="text-[8px]"] { font-size: 9.5px !important; }
          .kerawanan-workspace [class~="text-[9px]"] { font-size: 10px !important; }
          .kerawanan-workspace [class~="text-[10px]"] { font-size: 11px !important; }
          .kerawanan-workspace input,
          .kerawanan-workspace select { font-size: 11.5px; }
        }

        /* =========================================================
           SIMITI FINAL — BOTTOM SUMMARY ENTERPRISE
           Kejadian kecil | Legenda lebar | Mitigasi & Adaptasi kanan
           ========================================================= */

        .kerawanan-bottom-summary {
          display: grid !important;
          grid-template-columns:
            minmax(170px, 0.68fr)
            minmax(420px, 1.75fr)
            minmax(240px, 1fr) !important;

          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;

          gap: 0 !important;
          align-items: stretch !important;

          overflow: hidden !important;
        }

        .kerawanan-bottom-summary > * {
          min-width: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
          overflow: hidden !important;
        }

        .kerawanan-bottom-summary table {
          width: 100% !important;
          max-width: 100% !important;
          table-layout: fixed !important;
        }

        .kerawanan-bottom-summary img,
        .kerawanan-bottom-summary svg {
          max-width: 100% !important;
        }

        /* Desktop */
        @media (min-width: 1280px) {
          .kerawanan-bottom-summary {
            grid-template-columns:
              minmax(170px, 0.68fr)
              minmax(420px, 1.75fr)
              minmax(240px, 1fr) !important;

            grid-template-rows: minmax(0, 1fr) !important;

            height: 200px !important;
            min-height: 0 !important;
            max-height: 200px !important;
          }

          .kerawanan-bottom-summary > * {
            height: 100% !important;
            min-height: 0 !important;
            max-height: 200px !important;
          }
        }

        /* Wide enterprise monitor */
        @media (min-width: 1600px) {
          .kerawanan-bottom-summary {
            grid-template-columns:
              minmax(190px, 0.68fr)
              minmax(500px, 1.85fr)
              minmax(270px, 1fr) !important;
          }
        }

        /* Laptop */
        @media (min-width: 1024px) and (max-width: 1279px) {
          .kerawanan-bottom-summary {
            grid-template-columns:
              minmax(150px, 0.65fr)
              minmax(330px, 1.55fr)
              minmax(220px, 1fr) !important;

            height: 185px !important;
            max-height: 185px !important;
          }
        }
      }

        /* =========================================================
           RESPONSIVE MAP FINAL — phone, tablet, laptop, desktop
           Ukuran mengikuti viewport aktual; tidak mengubah API/layer.
           ========================================================= */
        .kerawanan-root {
          width: 100%;
          width: 100vw;
          height: 100vh;
          height: 100dvh;
          min-height: 0;
          min-width: 0;
          overflow: hidden;
        }
        .kerawanan-root > .flex-1 {
          min-width: 0;
          min-height: 0;
        }
        .kerawanan-root main {
          min-width: 0;
          min-height: 0;
        }
        #simiti-map,
        .kerawanan-map .leaflet-container {
          width: 100% !important;
          height: 100% !important;
          min-width: 0 !important;
          min-height: 0 !important;
        }
        .kerawanan-map {
          width: 100%;
          min-width: 0 !important;
          max-width: 100%;
          contain: layout paint;
        }
        .kerawanan-map .leaflet-control-container {
          max-width: 100%;
        }
        .kerawanan-map .leaflet-top,
        .kerawanan-map .leaflet-bottom {
          z-index: 1200;
        }
        .kerawanan-map .leaflet-control-zoom a,
        .kerawanan-map .simiti-default-extent-control a {
          touch-action: manipulation;
        }
        .kerawanan-map .leaflet-bottom.leaflet-right {
          display: flex !important;
          flex-direction: column !important;
          align-items: flex-end !important;
          gap: 6px !important;
          margin: 0 12px 12px 0 !important;
        }
        .kerawanan-map .leaflet-bottom.leaflet-right .leaflet-control {
          float: none !important;
          margin: 0 !important;
        }
        .kerawanan-map .leaflet-control-zoom,
        .kerawanan-map .simiti-default-extent-control {
          position: relative !important;
          z-index: 1300 !important;
          border: 1px solid rgba(148,163,184,.65) !important;
          border-radius: 9px !important;
          overflow: hidden !important;
          background: #fff !important;
          box-shadow: 0 3px 12px rgba(15,23,42,.24) !important;
        }
        .kerawanan-map .leaflet-control-zoom a {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 34px !important;
          height: 34px !important;
          font-size: 22px !important;
          line-height: 1 !important;
          color: #0f172a !important;
          background: #fff !important;
          opacity: 1 !important;
        }
        .kerawanan-map .simiti-default-extent-control a {
          width: 34px !important;
          height: 34px !important;
          line-height: 34px !important;
          color: #0f172a !important;
          background: #fff !important;
          opacity: 1 !important;
        }

        /* Tablet dan laptop kecil: peta menggunakan tinggi viewport, bukan tinggi tetap. */
        @media (min-width: 768px) and (max-width: 1279px) {
          .kerawanan-root main {
            overflow-y: auto !important;
            overflow-x: hidden !important;
          }
          .kerawanan-workspace {
            flex: 0 0 auto !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            grid-template-rows: auto !important;
          }
          .kerawanan-map {
            height: clamp(300px, 58dvh, 680px) !important;
            min-height: 0 !important;
          }
          .kerawanan-layer-panel {
            min-width: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            min-height: 280px !important;
            max-height: 55dvh !important;
          }
          .kerawanan-bottom-summary {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            height: 180px !important;
            max-height: 180px !important;
          }
        }

        /* Smartphone portrait */
        @media (max-width: 767px) {
          .kerawanan-root {
            height: 100vh;
            height: 100dvh;
          }
          .kerawanan-root > .flex-1 {
            width: 100%;
            overflow: hidden;
          }
          .kerawanan-root main {
            padding: 6px !important;
            overflow-x: hidden !important;
            overflow-y: auto !important;
            overscroll-behavior-y: contain;
          }
          .kerawanan-workspace {
            display: grid !important;
            flex: 0 0 auto !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            grid-template-columns: minmax(0, 1fr) !important;
            grid-template-rows: auto !important;
            gap: 8px !important;
          }
          .kerawanan-map {
            grid-column: 1 / -1 !important;
            width: 100% !important;
            height: clamp(240px, 52dvh, 520px) !important;
            min-height: 0 !important;
            max-height: 65dvh !important;
            border-radius: 10px !important;
          }
          .kerawanan-map .mockup-map-search {
            left: 8px !important;
            right: 8px !important;
            top: 8px !important;
            width: auto !important;
            max-width: calc(100% - 16px) !important;
          }
          .kerawanan-map .mockup-map-search input {
            width: 100% !important;
            min-width: 0 !important;
          }
          .kerawanan-map .kerawanan-basemap-switcher {
            top: 58px !important;
            right: 8px !important;
          }
          .kerawanan-map .kerawanan-basemap-switcher button {
            min-height: 34px !important;
            padding: 6px 9px !important;
            font-size: 10px !important;
          }
          .kerawanan-layer-panel {
            grid-column: 1 / -1 !important;
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            min-height: 260px !important;
            max-height: 52dvh !important;
          }
          .kerawanan-bottom-summary {
            grid-column: 1 / -1 !important;
            grid-template-columns: minmax(0, 1fr) !important;
            width: 100% !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            gap: 8px !important;
          }
          .kerawanan-bottom-summary > * {
            width: 100% !important;
            height: 200px !important;
            min-height: 150px !important;
            max-height: 240px !important;
            border-left: 0 !important;
          }
          .kerawanan-bottom-summary > * + * {
            border-top: 1px solid #e2e8f0 !important;
          }
          .kerawanan-map .leaflet-bottom.leaflet-right {
            margin: 0 8px 8px 0 !important;
            gap: 5px !important;
          }
          .kerawanan-map .leaflet-control-zoom a,
          .kerawanan-map .simiti-default-extent-control a {
            width: 28px !important;
            height: 28px !important;
            line-height: 28px !important;
          }
        }

        /* =========================================================
           FINAL MOBILE FIT PATCH — SIMITI
           Sidebar menjadi overlay, workspace memakai lebar viewport penuh,
           dan panel informasi tidak membuat halaman melebar ke samping.
           UI only: tidak mengubah API, GIS layers, atau data.
           ========================================================= */
        html, body, #root {
          width: 100%;
          max-width: 100%;
          overflow-x: clip !important;
        }
        @media (max-width: 767px) {
          body { margin: 0 !important; }
          #root { min-width: 0 !important; }
          .mobile-topbar {
            position: relative !important;
            z-index: 1450 !important;
            width: 100% !important;
            max-width: 100vw !important;
            box-sizing: border-box !important;
            background: #fff !important;
          }
          .mobile-topbar > * { min-width: 0 !important; }
          .mobile-page-title { min-width: 0 !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          /* Pastikan sidebar tidak menyisakan kolom kosong di sisi peta. */
          .enterprise-sidebar {
            position: fixed !important;
            top: 0 !important;
            bottom: 0 !important;
            left: 0 !important;
            right: auto !important;
            width: min(280px, 84vw) !important;
            max-width: 84vw !important;
            height: 100dvh !important;
            z-index: 2000 !important;
            transform: translateX(-110%) !important;
            overflow-y: auto !important;
          }
          .enterprise-sidebar.mobile-sidebar-open { transform: translateX(0) !important; }
          .kerawanan-workspace {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) !important;
            grid-template-rows: auto minmax(0, 1fr) auto !important;
            width: 100% !important;
            max-width: 100vw !important;
            margin-left: 0 !important;
            padding-left: 8px !important;
            padding-right: 8px !important;
            box-sizing: border-box !important;
            overflow: visible !important;
          }
          .kerawanan-map {
            grid-column: 1 / -1 !important;
            width: 100% !important;
            max-width: 100% !important;
            height: clamp(390px, 61svh, 560px) !important;
            min-height: 360px !important;
            max-height: 68svh !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
          }
          .kerawanan-map .leaflet-container { width: 100% !important; max-width: 100% !important; }
          .kerawanan-layer-panel {
            position: relative !important;
            inset: auto !important;
            grid-column: 1 / -1 !important;
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: 52svh !important;
            overflow: auto !important;
            box-sizing: border-box !important;
          }
          .kerawanan-bottom-summary {
            grid-column: 1 / -1 !important;
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) !important;
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            box-sizing: border-box !important;
          }
          .kerawanan-bottom-summary > * {
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            min-height: 220px !important;
            height: auto !important;
            max-height: 280px !important;
            box-sizing: border-box !important;
            overflow: auto !important;
            border-left: 0 !important;
          }
          .kerawanan-map .mockup-map-search {
            left: 8px !important;
            right: 8px !important;
            top: 8px !important;
            width: auto !important;
            max-width: calc(100% - 16px) !important;
          }
          .kerawanan-map .mockup-map-search > div:first-child { width: 100% !important; max-width: 100% !important; }
          .kerawanan-map .kerawanan-basemap-switcher { right: 8px !important; top: 58px !important; }
          .kerawanan-map .leaflet-control-container { max-width: 100% !important; }
        }
        @media (max-width: 380px) {
          .kerawanan-workspace { padding-left: 5px !important; padding-right: 5px !important; }
          .kerawanan-map { height: 54svh !important; min-height: 330px !important; }
          .mobile-menu-button { width: 34px !important; height: 34px !important; flex: 0 0 auto !important; }
        }

        /* Ponsel sangat pendek / mode landscape: hindari map lebih tinggi dari layar. */
        @media (max-width: 767px) and (max-height: 500px) {
          .kerawanan-map {
            height: 68dvh !important;
            min-height: 190px !important;
            max-height: 72dvh !important;
          }
          .kerawanan-map .mockup-map-search {
            top: 6px !important;
          }
          .kerawanan-map .kerawanan-basemap-switcher {
            top: 54px !important;
          }
        }

        /* FIX: tombol hide/unhide panel bawah harus menang dari aturan display:grid !important. */
        .kerawanan-bottom-summary.kerawanan-bottom-summary-hidden {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
        @media (min-width: 768px) {
          .kerawanan-workspace.bottom-summary-closed {
            grid-template-rows: minmax(0, 1fr) 0px !important;
            row-gap: 0 !important;
          }
          .kerawanan-workspace.bottom-summary-open {
            grid-template-rows: minmax(0, 1fr) 200px !important;
            row-gap: 8px !important;
          }
        }

                /* SIMITI RESPONSIVE SYSTEM — satu sumber aturan layout */
        .kerawanan-root,
        .kerawanan-root * {
          box-sizing: border-box;
        }

        .kerawanan-root {
          width: 100%;
          max-width: 100%;
          min-width: 0;
          min-height: 0;
        }

        .kerawanan-workspace {
          position: relative !important;
          isolation: isolate;
          min-width: 0 !important;
          max-width: 100% !important;
        }

        .kerawanan-map {
          position: relative;
          min-width: 0 !important;
          max-width: 100% !important;
          overflow: hidden !important;
        }

        .kerawanan-map .leaflet-container {
          width: 100% !important;
          height: 100% !important;
        }

        .kerawanan-bottom-summary {
          min-width: 0 !important;
          max-width: 100% !important;
          grid-template-columns:
            minmax(0, 0.78fr)
            minmax(0, 1.32fr)
            minmax(0, 1.15fr) !important;
        }

        .kerawanan-bottom-summary > * {
          min-width: 0 !important;
          min-height: 0;
          overflow-wrap: anywhere;
        }

        .kerawanan-bottom-summary.kerawanan-bottom-summary-hidden {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }

        .kerawanan-layer-panel,
        .kerawanan-layer-panel * {
          box-sizing: border-box;
        }

        .kerawanan-layer-panel {
          display: flex !important;
          flex-direction: column !important;
          min-width: 0 !important;
          min-height: 0 !important;
        }

        .kerawanan-layer-panel > div {
          min-width: 0 !important;
          min-height: 0 !important;
        }

        .kerawanan-layer-panel .dashboard-scroll {
          flex: 1 1 auto !important;
          min-width: 0 !important;
          min-height: 0 !important;
          overflow-x: hidden !important;
          overflow-y: auto !important;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          align-content: start !important;
          align-items: start !important;
          gap: 12px !important;
          text-align: left !important;
        }

        .kerawanan-layer-panel .dashboard-scroll > * {
          min-width: 0 !important;
          width: 100% !important;
          text-align: left !important;
        }

        .kerawanan-layer-panel .dashboard-scroll label,
        .kerawanan-layer-panel .dashboard-scroll h3,
        .kerawanan-layer-panel .dashboard-scroll button {
          text-align: left !important;
        }

        @media (max-width: 767px) {
          .kerawanan-layer-panel .dashboard-scroll {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
        /* SIMITI: scrollbar panel kanan — DEEP BLUE */
        .kerawanan-layer-panel .dashboard-scroll {
          scrollbar-width: thin;
          scrollbar-color: #1D4ED8 #DBEAFE;
        }

        .kerawanan-layer-panel .dashboard-scroll::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        .kerawanan-layer-panel .dashboard-scroll::-webkit-scrollbar-track {
          background: #DBEAFE;
          border-radius: 999px;
          margin-block: 5px;
        }

        .kerawanan-layer-panel .dashboard-scroll::-webkit-scrollbar-thumb {
          background: #1D4ED8;
          border: 2px solid #DBEAFE;
          border-radius: 999px;
          min-height: 34px;
        }

        .kerawanan-layer-panel .dashboard-scroll::-webkit-scrollbar-thumb:hover {
          background: #1E40AF;
        }

        .kerawanan-layer-panel .dashboard-scroll::-webkit-scrollbar-thumb:active {
          background: #1E3A8A;
        }


        .kerawanan-layer-panel input[type="checkbox"] {
          flex: 0 0 auto;
          accent-color: #059669;
        }

        .kerawanan-layer-panel label,
        .kerawanan-layer-panel button {
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .kerawanan-panel-reopen {
          z-index: 1350 !important;
          max-width: 100%;
        }

        .map-click-coordinate-card {
          box-sizing: border-box !important;
          max-width: 100%;
          overflow-wrap: anywhere;
        }

        /* Desktop: map sebagai area utama, panel layer di kanan. */
        @media (min-width: 1200px) {
          .kerawanan-root main {
            min-width: 0;
            min-height: 0;
            overflow: hidden;
          }

          .kerawanan-workspace {
            height: 100%;
            overflow: hidden !important;
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .kerawanan-workspace.bottom-summary-open {
            grid-template-rows: minmax(0, 1fr) 200px !important;
            row-gap: 8px !important;
          }

          .kerawanan-workspace.bottom-summary-closed {
            grid-template-rows: minmax(0, 1fr) 0px !important;
            row-gap: 0 !important;
          }

          .kerawanan-map {
            grid-column: 1 !important;
            grid-row: 1 !important;
            width: 100% !important;
            height: 100%;
            min-height: 0 !important;
          }

          .kerawanan-layer-panel {
            position: absolute !important;
            top: 12px !important;
            right: 12px !important;
            bottom: 212px !important;
            left: auto !important;
            width: clamp(280px, 25vw, 350px) !important;
            max-width: calc(100% - 24px) !important;
            height: auto !important;
            max-height: none !important;
            z-index: 1300 !important;
            overflow: hidden !important;
          }

          .kerawanan-workspace.bottom-summary-closed .kerawanan-layer-panel {
            bottom: 12px !important;
          }

          .kerawanan-panel-reopen {
            position: absolute !important;
            top: 12px !important;
            right: 12px !important;
            bottom: auto !important;
            left: auto !important;
            width: auto;
          }

          .kerawanan-bottom-summary {
            grid-column: 1 !important;
            grid-row: 2 !important;
            width: 100% !important;
            height: 200px !important;
            min-height: 0 !important;
            max-height: 200px !important;
            overflow: hidden !important;
          }

          .kerawanan-bottom-summary > * {
            height: 100%;
            max-height: 200px;
            overflow: hidden;
          }

          .map-click-coordinate-card {
            position: absolute !important;
            top: 68px !important;
            right: 12px !important;
            left: auto !important;
            z-index: 1450 !important;
            width: clamp(250px, 23vw, 320px) !important;
            max-width: calc(100% - 24px) !important;
            max-height: min(360px, calc(100% - 230px)) !important;
            margin: 0 !important;
            overflow-y: auto !important;
            box-shadow: 0 14px 35px rgba(15, 23, 42, 0.18) !important;
          }
        }

        /* Tablet dan laptop kompak. */
        @media (min-width: 768px) and (max-width: 1199px) {
          .kerawanan-root main {
            min-width: 0;
            min-height: 0;
            overflow-x: hidden !important;
            overflow-y: auto !important;
          }

          .kerawanan-workspace {
            flex: 1 1 auto !important;
            height: 100% !important;
            min-height: 0 !important;
            overflow: hidden !important;
          }

          .kerawanan-workspace.bottom-summary-open {
            grid-template-rows: minmax(340px, 1fr) 160px !important;
            row-gap: 8px !important;
          }

          .kerawanan-workspace.bottom-summary-closed {
            grid-template-rows: minmax(340px, 1fr) 0px !important;
            row-gap: 0 !important;
          }

          .kerawanan-map {
            grid-column: 1 !important;
            grid-row: 1 !important;
            height: 100% !important;
            min-height: 0 !important;
          }

          .kerawanan-layer-panel {
            position: absolute !important;
            top: 10px !important;
            right: 10px !important;
            bottom: 172px !important;
            left: auto !important;
            width: clamp(240px, 28vw, 300px) !important;
            max-width: calc(100% - 20px) !important;
            height: auto !important;
            max-height: none !important;
            z-index: 1300 !important;
            overflow: hidden !important;
          }

          .kerawanan-workspace.bottom-summary-closed .kerawanan-layer-panel {
            bottom: 10px !important;
          }

          .kerawanan-panel-reopen {
            position: absolute !important;
            top: 10px !important;
            right: 10px !important;
            left: auto !important;
            bottom: auto !important;
          }

          .kerawanan-bottom-summary {
            grid-column: 1 !important;
            grid-row: 2 !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            width: 100% !important;
            height: 220px !important;
            max-height: 220px !important;
            min-height: 0 !important;
            overflow: hidden !important;
          }

          .kerawanan-bottom-summary > * {
            max-height: 160px;
            overflow: hidden;
          }

          .map-click-coordinate-card {
            position: absolute !important;
            top: 64px !important;
            right: 10px !important;
            left: auto !important;
            z-index: 1450 !important;
            width: clamp(230px, 27vw, 290px) !important;
            max-width: calc(100% - 20px) !important;
            max-height: 260px !important;
            overflow-y: auto !important;
          }
        }

        /* HP: susun peta, panel layer, dan ringkasan secara vertikal. */
        @media (max-width: 767px) {
          .kerawanan-root {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            min-height: 100vh !important;
            min-height: 100dvh !important;
            overflow-x: hidden !important;
          }

          .kerawanan-root main {
            min-width: 0 !important;
            max-width: 100% !important;
            padding: 6px !important;
            overflow-x: hidden !important;
            overflow-y: auto !important;
            overscroll-behavior-y: contain;
          }

          .kerawanan-workspace {
            display: grid !important;
            position: relative !important;
            isolation: auto;
            flex: 0 0 auto !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            grid-template-columns: minmax(0, 1fr) !important;
            grid-template-rows: auto !important;
            gap: 10px !important;
            padding: 6px !important;
            overflow: visible !important;
          }

          .kerawanan-map {
            position: relative !important;
            inset: auto !important;
            grid-column: 1 !important;
            grid-row: 1 !important;
            width: 100% !important;
            max-width: 100% !important;
            height: clamp(280px, 56dvh, 560px) !important;
            min-height: 280px !important;
            max-height: 65dvh !important;
            border-radius: 12px !important;
            overflow: hidden !important;
          }

          .kerawanan-map .leaflet-container {
            width: 100% !important;
            height: 100% !important;
          }

          .kerawanan-map .mockup-map-search {
            top: 8px !important;
            right: 8px !important;
            left: 8px !important;
            width: auto !important;
            max-width: none !important;
          }

          .kerawanan-map .mockup-map-search input,
          .kerawanan-map .mockup-map-search > div:first-child {
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
          }

          .kerawanan-map .kerawanan-basemap-switcher {
            top: 58px !important;
            right: 8px !important;
            max-width: calc(100% - 16px) !important;
          }

          .kerawanan-layer-panel {
            position: relative !important;
            inset: auto !important;
            grid-column: 1 !important;
            grid-row: auto !important;
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: min(58dvh, 520px) !important;
            margin: 0 !important;
            border-radius: 12px !important;
            overflow: hidden !important;
          }

          .kerawanan-layer-panel > div {
            width: 100% !important;
            max-width: 100% !important;
          }

          .kerawanan-layer-panel .dashboard-scroll {
            max-height: min(46dvh, 420px) !important;
            padding-bottom: max(12px, env(safe-area-inset-bottom)) !important;
            overflow-x: hidden !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch;
          }

          .kerawanan-panel-reopen {
            position: relative !important;
            inset: auto !important;
            grid-column: 1 !important;
            grid-row: auto !important;
            width: 100% !important;
            max-width: 100% !important;
            min-height: 40px;
          }

          .kerawanan-bottom-summary:not(.kerawanan-bottom-summary-hidden) {
            display: grid !important;
            position: relative !important;
            grid-column: 1 !important;
            grid-row: auto !important;
            grid-template-columns: minmax(0, 1fr) !important;
            grid-template-rows: auto !important;
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            overflow: visible !important;
            border-radius: 12px !important;
          }

          .kerawanan-bottom-summary > * {
            width: 100% !important;
            min-width: 0 !important;
            min-height: 120px !important;
            height: auto !important;
            max-height: 280px !important;
            overflow: hidden !important;
            border-left: 0 !important;
            border-bottom: 1px solid #e2e8f0 !important;
          }

          .kerawanan-bottom-summary > * > div {
            min-width: 0 !important;
            max-width: 100% !important;
            padding-top: 10px !important;
            padding-bottom: 10px !important;
          }

          .kerawanan-bottom-summary .dashboard-scroll {
            overflow-x: hidden !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch;
          }

          .map-click-coordinate-card {
            position: relative !important;
            inset: auto !important;
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            max-height: none !important;
            margin: 8px 0 !important;
            overflow-wrap: anywhere;
          }

          .kerawanan-root button,
          .kerawanan-root input,
          .kerawanan-root select,
          .kerawanan-root textarea {
            max-width: 100%;
          }

          .kerawanan-root input,
          .kerawanan-root select,
          .kerawanan-root textarea {
            font-size: 16px;
          }
        }

        /* HP kecil */
        @media (max-width: 380px) {
          .kerawanan-workspace {
            padding: 4px !important;
            gap: 8px !important;
          }

          .kerawanan-map {
            height: 52dvh !important;
            min-height: 260px !important;
          }

          .kerawanan-bottom-summary > * {
            padding-left: 10px !important;
            padding-right: 10px !important;
          }
        }

        /* HP landscape: jaga area peta tetap bisa digunakan. */
        @media (max-width: 900px) and (orientation: landscape) and (max-height: 500px) {
          .kerawanan-root {
            min-height: 100dvh !important;
            overflow-y: auto !important;
          }

          .kerawanan-map {
            height: 68dvh !important;
            min-height: 200px !important;
            max-height: none !important;
          }
        }
              /* SIMITI: posisi switcher basemap dan judul peta. */
        .kerawanan-map .kerawanan-basemap-switcher {
          top: 12px !important;
          left: 12px !important;
          right: auto !important;
          z-index: 3000 !important;
          max-width: calc(100% - 24px) !important;
        }

        .kerawanan-map .print-map-title {
          top: 12px !important;
          right: 12px !important;
          left: auto !important;
          max-width: calc(100% - 180px) !important;
          z-index: 1200 !important;
        }

        @media (max-width: 1199px) {
          .kerawanan-map .kerawanan-basemap-switcher {
            top: 58px !important;
            left: 8px !important;
            right: auto !important;
            max-width: calc(100% - 16px) !important;
          }

          .kerawanan-map .print-map-title {
            top: 100px !important;
            left: 8px !important;
            right: 8px !important;
            max-width: calc(100% - 16px) !important;
            z-index: 1200 !important;
          }
        }

        @media (max-width: 767px) and (max-height: 500px) {
          .kerawanan-map .kerawanan-basemap-switcher {
            top: 54px !important;
            left: 8px !important;
            right: auto !important;
          }
        }


        /* Saat panel bawah ditutup, hilangkan bingkai/ruang visual sisa agar peta terasa penuh. */
        .kerawanan-workspace.bottom-summary-closed {
          background: transparent !important;
          padding-bottom: 0 !important;
          row-gap: 0 !important;
          grid-template-rows: minmax(0, 1fr) 0px !important;
        }
        .kerawanan-workspace.bottom-summary-closed > .kerawanan-map {
          grid-row: 1 !important;
          height: 100% !important;
          min-height: 0 !important;
          border: 0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          background: transparent !important;
        }
        .kerawanan-workspace.bottom-summary-closed > .kerawanan-bottom-summary {
          display: none !important;
          height: 0 !important;
          min-height: 0 !important;
          max-height: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          border: 0 !important;
        }

        /* HOTFIX: panel bawah ditutup tetap mempertahankan tinggi peta.
           Override diletakkan paling akhir agar aturan responsive lama tidak
           mengecilkan workspace/map menjadi area kosong pada viewport mobile. */
        .kerawanan-workspace.bottom-summary-closed {
          grid-template-rows: minmax(0, 1fr) 0px !important;
          row-gap: 0 !important;
          min-height: 0 !important;
        }
        .kerawanan-workspace.bottom-summary-closed > .kerawanan-map {
          min-width: 0 !important;
          min-height: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
          grid-row: 1 !important;
        }
        @media (max-width: 1279px) {
          .kerawanan-root {
            width: 100% !important;
            max-width: 100vw !important;
            overflow-x: hidden !important;
          }
          .kerawanan-root > .flex-1,
          .kerawanan-root main {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
          }
          .kerawanan-workspace {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
          }
          .kerawanan-workspace.bottom-summary-closed {
            display: grid !important;
            height: auto !important;
            grid-template-rows: minmax(420px, 1fr) 0px !important;
            overflow: visible !important;
          }
          .kerawanan-workspace.bottom-summary-closed > .kerawanan-map {
            height: clamp(420px, calc(100dvh - 80px), 900px) !important;
            min-height: 420px !important;
            max-height: none !important;
            align-self: stretch !important;
          }
        }
        @media (max-width: 767px) {
          .kerawanan-root main {
            padding: 0 !important;
            overflow-x: hidden !important;
          }
          .kerawanan-workspace.bottom-summary-closed {
            padding: 0 !important;
            gap: 0 !important;
            grid-template-rows: minmax(420px, 1fr) 0px !important;
          }
          .kerawanan-workspace.bottom-summary-closed > .kerawanan-map {
            width: 100% !important;
            height: clamp(420px, calc(100dvh - 56px), 900px) !important;
            min-height: 420px !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
        }


        /* SIMITI layout fix — panel layer memanjang, analytics bawah diringkas.
           Hanya mengatur tampilan; tidak menyentuh state, API, atau logika GIS. */
        @media (min-width: 1280px) {
          .kerawanan-workspace.bottom-summary-open {
            grid-template-rows: minmax(0, 1fr) 120px !important;
            row-gap: 6px !important;
          }
          .kerawanan-workspace.bottom-summary-open > .kerawanan-layer-panel {
            position: absolute !important;
            top: 12px !important;
            right: 12px !important;
            bottom: 12px !important;
            width: 350px !important;
            min-width: 350px !important;
            max-width: 350px !important;
            height: auto !important;
            max-height: none !important;
            z-index: 1300 !important;
          }
          .kerawanan-workspace.bottom-summary-open > .kerawanan-bottom-summary {
            height: 120px !important;
            min-height: 120px !important;
            max-height: 120px !important;
            grid-row: 2 !important;
            overflow: hidden !important;
          }
          .kerawanan-bottom-summary > * {
            min-height: 0 !important;
            height: 100% !important;
            max-height: none !important;
          }
          .kerawanan-bottom-summary > * > div {
            padding-top: 8px !important;
            padding-bottom: 6px !important;
          }
        }
        @media (min-width: 768px) and (max-width: 1279px) {
          .kerawanan-workspace.bottom-summary-open {
            grid-template-rows: minmax(360px, 1fr) 140px !important;
          }
          .kerawanan-workspace.bottom-summary-open > .kerawanan-bottom-summary {
            height: 140px !important;
            min-height: 140px !important;
            max-height: 140px !important;
          }
        }
        @media (max-width: 767px) {
          .kerawanan-workspace.bottom-summary-open {
            grid-template-rows: minmax(320px, 58dvh) auto !important;
          }
          .kerawanan-workspace.bottom-summary-open > .kerawanan-bottom-summary {
            max-height: 280px !important;
            overflow-y: auto !important;
          }
        }

        /* Panel bawah berbasis tab seperti versi ORI. Override aturan grid tiga kolom lama. */
        .kerawanan-bottom-tabs-panel {
          display: flex !important;
          flex-direction: column !important;
          grid-template-columns: minmax(0, 1fr) !important;
          gap: 0 !important;
          align-items: stretch !important;
        }
        .kerawanan-bottom-tabs-panel > .kerawanan-bottom-tabs-header {
          flex: 0 0 auto !important;
          width: 100% !important;
          height: auto !important;
          min-height: 34px !important;
          max-height: 42px !important;
          overflow-x: auto !important;
          overflow-y: hidden !important;
          padding: 4px 10px !important;
        }
        .kerawanan-bottom-tabs-panel > .kerawanan-bottom-tabs-content {
          flex: 1 1 auto !important;
          width: 100% !important;
          height: auto !important;
          min-height: 0 !important;
          max-height: none !important;
          overflow: auto !important;
          padding: 6px 10px !important;
        }

        /* Desktop: batas kanan panel bawah mengikuti garis kiri panel kanan.
           Persentase mengikuti lebar aktual workspace sehingga tetap tepat
           pada browser dengan zoom / skala layar berbeda. */
        @media (min-width: 1280px) {
          .kerawanan-workspace.right-layer-open > .kerawanan-bottom-summary {
            width: 72.75% !important;
            max-width: 72.75% !important;
            box-sizing: border-box !important;
            justify-self: start !important;
            margin-right: 0 !important;
            position: relative !important;
            z-index: 10 !important;
          }
          .kerawanan-workspace.right-layer-panel-closed > .kerawanan-bottom-summary {
            width: 100% !important;
            max-width: 100% !important;
          }
        }

        /* SIMITI: tampilkan seluruh baris legenda risiko tanpa scrollbar.
           Panel bawah diperbesar; ruang peta menyesuaikan otomatis. */
        @media (min-width: 768px) {
          .kerawanan-workspace {
            grid-template-rows: minmax(0, 1fr) 280px !important;
          }
          .kerawanan-workspace > .kerawanan-bottom-summary {
            height: 280px !important;
            min-height: 280px !important;
            max-height: 280px !important;
            overflow: hidden !important;
          }
        }

        .kerawanan-bottom-tabs-panel > .kerawanan-bottom-tabs-content {
          overflow: hidden !important;
          min-height: 0 !important;
        }

        .kerawanan-risk-legend-content,
        .kerawanan-risk-legend-scroll {
          height: auto !important;
          max-height: none !important;
          min-height: 0 !important;
          overflow: visible !important;
        }

        .kerawanan-risk-legend-table {
          height: auto !important;
          overflow: visible !important;
        }

        @media (max-width: 767px) {
          .kerawanan-workspace.bottom-summary-open {
            grid-template-rows: minmax(280px, 48dvh) auto !important;
          }
          .kerawanan-workspace.bottom-summary-open > .kerawanan-bottom-summary {
            height: auto !important;
            min-height: 220px !important;
            max-height: none !important;
            overflow: visible !important;
          }
        }


        /* SIMITI: tinggi panel legenda risiko dinamis sesuai jumlah kelas warna.
           Tidak membatasi tinggi tabel dan tidak menampilkan scrollbar vertikal. */
        @media (min-width: 768px) {
          .kerawanan-workspace.bottom-summary-open {
            grid-template-rows:
              minmax(0, 1fr) var(--simiti-bottom-legend-height, 200px) !important;
          }
          .kerawanan-workspace.bottom-summary-open > .kerawanan-bottom-summary {
            height: var(--simiti-bottom-legend-height, 200px) !important;
            min-height: var(--simiti-bottom-legend-height, 200px) !important;
            max-height: none !important;
            overflow: visible !important;
          }
        }

        .kerawanan-bottom-tabs-panel > .kerawanan-bottom-tabs-content {
          flex: 1 0 auto !important;
          min-height: 0 !important;
          max-height: none !important;
          overflow: visible !important;
        }
        .kerawanan-risk-legend-content,
        .kerawanan-risk-legend-scroll,
        .kerawanan-risk-legend-table {
          height: auto !important;
          min-height: 0 !important;
          max-height: none !important;
          overflow: visible !important;
        }
        .kerawanan-risk-legend-table thead,
        .kerawanan-risk-legend-table tbody,
        .kerawanan-risk-legend-table tr {
          overflow: visible !important;
        }

        @media (max-width: 767px) {
          .kerawanan-workspace.bottom-summary-open {
            grid-template-rows:
              minmax(0, 1fr) var(--simiti-bottom-legend-height, 200px) !important;
          }
          .kerawanan-workspace.bottom-summary-open > .kerawanan-bottom-summary {
            height: var(--simiti-bottom-legend-height, 200px) !important;
            min-height: var(--simiti-bottom-legend-height, 200px) !important;
            max-height: none !important;
            overflow: visible !important;
          }
        }

        /* FINAL SIMITIGASI layout: categories stacked vertically,
           with two checkbox columns inside each category. */
        .kerawanan-layer-panel .simiti-layer-list.dashboard-scroll {
          display: flex !important;
          flex-direction: column !important;
          flex-wrap: nowrap !important;
          align-items: stretch !important;
          justify-content: flex-start !important;
          gap: 10px !important;
          padding: 7px !important;
          overflow-x: hidden !important;
          overflow-y: auto !important;
          text-align: left !important;
        }
        .kerawanan-layer-panel .simiti-layer-list.dashboard-scroll > div {
          display: block !important;
          flex: 0 0 auto !important;
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 0 2px 0 !important;
          text-align: left !important;
        }
        .kerawanan-layer-panel .simiti-layer-list .simiti-layer-grid {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          grid-auto-flow: row !important;
          align-items: start !important;
          gap: 4px 6px !important;
          width: 100% !important;
        }
        .kerawanan-layer-panel .simiti-layer-list .simiti-layer-item {
          display: flex !important;
          align-items: center !important;
          justify-content: flex-start !important;
          width: 100% !important;
          min-width: 0 !important;
          min-height: 20px !important;
          padding: 3px 5px !important;
          margin: 0 !important;
          border: 1px solid #e5e7eb !important;
          border-radius: 3px !important;
          background: #ffffff !important;
          text-align: left !important;
          gap: 5px !important;
        }
        .kerawanan-layer-panel .simiti-layer-list .simiti-layer-item input[type="checkbox"] {
          width: 11px !important;
          height: 11px !important;
          min-width: 11px !important;
          margin: 0 !important;
          flex: 0 0 11px !important;
          accent-color: #6b7280 !important;
        }
        .kerawanan-layer-panel .simiti-layer-list .simiti-layer-item span {
          display: block !important;
          min-width: 0 !important;
          width: 100% !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
          font-size: 12px !important;
          line-height: 16px !important;
          text-align: left !important;
          color: #374151 !important;
        }
        .kerawanan-layer-panel .simiti-layer-list h3,
        .kerawanan-layer-panel .simiti-layer-list > div > div > button:first-child {
          display: block !important;
          width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          color: #1f2937 !important;
          font-size: 12px !important;
          line-height: 17px !important;
          font-weight: 700 !important;
          text-align: left !important;
        }
        .kerawanan-layer-panel .simiti-layer-list > div > div {
          justify-content: flex-start !important;
          text-align: left !important;
          margin-bottom: 5px !important;
          padding-bottom: 4px !important;
          border-bottom: 1px solid #e5e7eb !important;
        }
        .kerawanan-layer-panel .simiti-layer-list > div > div > button:last-child {
          display: none !important;
        }
        .kerawanan-layer-panel .simiti-layer-panel-header {
          background: #ffffff !important;
          color: #1f2937 !important;
          border-bottom: 1px solid #e5e7eb !important;
        }
        .kerawanan-layer-panel .simiti-layer-panel-header > div {
          color: #1f2937 !important;
          text-align: left !important;
        }
        .kerawanan-layer-panel .simiti-layer-panel-header button {
          color: #6b7280 !important;
        }
        .kerawanan-layer-panel .simiti-layer-list {
          scrollbar-color: #cbd5e1 transparent !important;
        }
        .kerawanan-layer-panel .simiti-layer-list::-webkit-scrollbar-track {
          background: transparent !important;
        }
        .kerawanan-layer-panel .simiti-layer-list::-webkit-scrollbar-thumb {
          background: #cbd5e1 !important;
          border: 0 !important;
        }
        .kerawanan-layer-panel .simiti-layer-list::-webkit-scrollbar-thumb:hover,
        .kerawanan-layer-panel .simiti-layer-list::-webkit-scrollbar-thumb:active {
          background: #9ca3af !important;
        }
        @media (max-width: 767px) {
          .kerawanan-layer-panel .simiti-layer-list .simiti-layer-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }
        /* SIMITI PATCH 2026-11-20:
           Panel bawah mengikuti pola tab Kerawanan-old70.
           Panel kanan direntangkan sampai batas bawah workspace agar
           sejajar dengan keseluruhan area peta + panel bawah.
           Hanya layout; tidak mengubah handler, layer, API, atau data. */
        @media (min-width: 1280px) {
          .kerawanan-workspace {
            position: relative !important;
            min-height: 0 !important;
            height: 100% !important;
            overflow: hidden !important;
          }
          .kerawanan-workspace.right-layer-open > .kerawanan-layer-panel {
            position: absolute !important;
            top: 12px !important;
            right: 12px !important;
            bottom: 0 !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            display: flex !important;
            flex-direction: column !important;
            z-index: 1300 !important;
          }
          .kerawanan-workspace.right-layer-open > .kerawanan-layer-panel > div {
            display: flex !important;
            flex: 1 1 auto !important;
            flex-direction: column !important;
            min-height: 0 !important;
            height: 100% !important;
          }
          .kerawanan-workspace.right-layer-open > .kerawanan-layer-panel .dashboard-scroll {
            flex: 1 1 auto !important;
            min-height: 0 !important;
            overflow-x: hidden !important;
            overflow-y: auto !important;
          }
          .kerawanan-workspace.right-layer-open > .kerawanan-bottom-summary {
            align-self: stretch !important;
          }
        }
        /* =====================================================
           SIMITI ENTERPRISE — COMPACT WILAYAH ANALISIS
           UI only: tidak mengubah state, handler, API atau layer.
           ===================================================== */
        .simiti-analysis-section {
          flex: 0 0 auto !important;
          padding: 8px 8px 4px !important;
          font-size: 12px !important;
          line-height: 1.35 !important;
        }
        .simiti-analysis-section > div {
          border-radius: 14px !important;
        }
        .simiti-analysis-section > div > div:first-child {
          padding: 8px 10px !important;
          min-height: 48px;
        }
        .simiti-analysis-section > div > div:first-child > div > div:first-child {
          font-size: 12px !important;
          line-height: 16px !important;
          letter-spacing: .08em !important;
        }
        .simiti-analysis-section > div > div:first-child > div > div:last-child {
          margin-top: 1px !important;
          font-size: 12px !important;
          line-height: 16px !important;
        }
        .simiti-analysis-section > div > div:first-child > span {
          font-size: 10px !important;
          padding: 4px 8px !important;
        }
        .simiti-analysis-section > div > div:nth-child(2) {
          padding: 8px !important;
        }
        .simiti-analysis-section .space-y-3 {
          gap: 8px !important;
        }
        .simiti-analysis-section .rounded-lg.border {
          padding: 8px !important;
          border-radius: 11px !important;
        }
        .simiti-analysis-section .mb-2 {
          margin-bottom: 6px !important;
        }
        .simiti-analysis-section .mb-1 {
          margin-bottom: 3px !important;
        }
        .simiti-analysis-section label {
          font-size: 12px !important;
          line-height: 16px !important;
        }
        .simiti-analysis-section input {
          height: 34px !important;
          min-height: 34px !important;
          padding-left: 9px !important;
          padding-right: 9px !important;
          font-size: 12px !important;
          line-height: 16px !important;
          border-radius: 9px !important;
        }
        .simiti-analysis-section input::placeholder {
          font-size: 12px !important;
          color: #8793a5 !important;
        }
        .simiti-analysis-section .grid {
          column-gap: 8px !important;
          row-gap: 7px !important;
        }
        .simiti-analysis-section .rounded-full {
          font-size: 10px !important;
        }
        .simiti-analysis-section .mt-2 {
          margin-top: 6px !important;
        }

        /* Beri ruang utama kepada daftar layer Kerawanan. */
        .kerawanan-layer-panel > div {
          min-height: 0 !important;
        }
        .simiti-layer-list {
          flex: 1 1 0% !important;
          min-height: 0 !important;
          overflow-y: auto !important;
          overscroll-behavior: contain;
          scrollbar-width: thin;
          scrollbar-color: #173b70 #e8eef7;
          padding: 6px 8px 8px !important;
        }
        .simiti-layer-list::-webkit-scrollbar,
        .simiti-analysis-section *::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .simiti-layer-list::-webkit-scrollbar-track,
        .simiti-analysis-section *::-webkit-scrollbar-track {
          background: #e8eef7;
          border-radius: 10px;
        }
        .simiti-layer-list::-webkit-scrollbar-thumb,
        .simiti-analysis-section *::-webkit-scrollbar-thumb {
          background: #173b70;
          border: 2px solid #e8eef7;
          border-radius: 10px;
        }
        .simiti-layer-list::-webkit-scrollbar-thumb:hover,
        .simiti-analysis-section *::-webkit-scrollbar-thumb:hover {
          background: #0d2852;
        }
        .simiti-layer-list .simiti-layer-category {
          margin-bottom: 9px !important;
        }
        .simiti-layer-list .simiti-layer-category > div:first-child {
          margin-bottom: 5px !important;
          padding-bottom: 4px !important;
        }
        .simiti-layer-list .simiti-layer-category button,
        .simiti-layer-list .simiti-layer-category h3 {
          font-size: 12px !important;
          line-height: 16px !important;
        }
        .simiti-layer-list .simiti-layer-grid {
          gap: 5px !important;
        }
        .simiti-layer-list .simiti-layer-item {
          min-height: 30px;
          padding: 5px 6px !important;
          gap: 5px !important;
          border-radius: 5px !important;
        }
        .simiti-layer-list .simiti-layer-item span {
          font-size: 12px !important;
          line-height: 16px !important;
        }
        .simiti-layer-list .simiti-layer-item input {
          width: 14px !important;
          height: 14px !important;
          margin-top: 1px !important;
          flex: 0 0 14px !important;
        }
        @media (max-width: 767px) {
          .simiti-analysis-section {
            padding: 6px 7px 3px !important;
          }
          .simiti-layer-list {
            padding: 5px 7px 8px !important;
          }
        }

        /* FINAL OVERRIDE — scrollbar panel kanan benar-benar NAVY.
           Mengalahkan rule lama #cbd5e1/#9ca3af yang memakai !important. */
        .kerawanan-layer-panel .simiti-layer-list {
          scrollbar-color: #173b70 #dbeafe !important;
          scrollbar-width: thin !important;
        }
        .kerawanan-layer-panel .simiti-layer-list::-webkit-scrollbar {
          width: 9px !important;
          height: 9px !important;
        }
        .kerawanan-layer-panel .simiti-layer-list::-webkit-scrollbar-track {
          background: #dbeafe !important;
          border-radius: 999px !important;
        }
        .kerawanan-layer-panel .simiti-layer-list::-webkit-scrollbar-thumb {
          background: #173b70 !important;
          border: 2px solid #dbeafe !important;
          border-radius: 999px !important;
          min-height: 36px !important;
        }
        .kerawanan-layer-panel .simiti-layer-list::-webkit-scrollbar-thumb:hover,
        .kerawanan-layer-panel .simiti-layer-list::-webkit-scrollbar-thumb:active {
          background: #0b2450 !important;
        }

        `}






</style>

      {/* =========================================================
          ENTERPRISE SIDEBAR
          ========================================================= */}
      <Sidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Desktop sidebar collapse / expand */}
      <button
        type="button"
        className={`hidden md:flex fixed top-[20px] z-[4000] h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-[#0F172A] text-slate-300 shadow-lg transition-all duration-300 hover:bg-slate-800 hover:text-white ${
          sidebarCollapsed ? "left-[68px]" : "left-[270px]"
        }`}
        onClick={() => setSidebarCollapsed((v) => !v)}
        aria-label={
          sidebarCollapsed ? "Tampilkan sidebar" : "Sembunyikan sidebar"
        }
        title={sidebarCollapsed ? "Tampilkan sidebar" : "Sembunyikan sidebar"}
      >
        <span className="text-xl leading-none">
          {sidebarCollapsed ? "›" : "‹"}
        </span>
      </button>

      {/* Mobile menu trigger — hanya UI/sidebar, tidak menyentuh GIS */}
      <button
        type="button"
        className="mobile-menu-button fixed left-3 top-3 z-[4000] md:hidden"
        onClick={() => setMobileSidebarOpen(true)}
        aria-label="Buka menu navigasi"
        title="Buka menu navigasi"
      >
        <span />
        <span />
        <span />
      </button>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* =========================================================
            HEADER
           ========================================================= */}
        <div className="shrink-0 bg-white border-b border-slate-200 relative">
          <Header currentPage="kerawanan" />
          {isAuthenticated && (
            <div className="px-4 py-1 bg-emerald-50 border-t border-emerald-100 flex items-center justify-between">
              <span className="text-[10px] text-emerald-800 font-medium">
                ● Logged in as Admin
              </span>
              <button
                onClick={handleLogout}
                className="text-[10px] font-semibold text-red-600"
              >
                Logout
              </button>
            </div>
          )}
        </div>

        <main className="relative flex flex-1 min-h-0 flex-col p-2 md:p-3 overflow-y-auto xl:overflow-hidden">
          {/* Toolbar aksi peta — sengaja di luar section Leaflet agar tombol tidak hilang/tertutup saat map rerender */}
          <div className="mb-2 flex items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <span className="mr-auto text-[10px] text-slate-500">
              {selectedAreas.length > 0 || selectedDas.length > 0
                ? "Peta wilayah terpilih siap dicetak"
                : "Pilih wilayah admin atau DAS terlebih dahulu"}
            </span>
            <button
              type="button"
              onClick={handleDownloadMapPdf}
              disabled={selectedAreas.length === 0 && selectedDas.length === 0}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              title="Download peta wilayah terpilih sebagai PDF"
            >
              <span aria-hidden="true"></span>
              Download Peta PDF
            </button>
          </div>
          <div
            className={`kerawanan-workspace min-h-0 flex-1 grid grid-cols-1 gap-0 transition-[grid-template-rows] duration-300 ease-out ${isBottomSummaryOpen ? "bottom-summary-open" : "bottom-summary-closed"} ${isRightLayerPanelOpen ? "right-layer-open" : "right-layer-panel-closed"}`}
            style={{
              // Legenda risiko bertambah/berkurang mengikuti jumlah kelas warna.
              // Ruang panel dihitung dari header tab + header tabel + seluruh baris.
              "--simiti-bottom-legend-height": (() => {
                const riskTabs = [
                  "risiko_banjir",
                  "risiko_banjir_bandang",
                  "risiko_kekeringan",
                  "risiko_abrasi",
                  "risiko_longsor",
                  "risiko_karhutla",
                ];
                const isRiskLegend = riskTabs.includes(activeBottomTab);
                const riskRows = isRiskLegend
                  ? ((risikoData as any)?.[activeBottomTab]?.length || 0)
                  : 0;
                return `${isRiskLegend ? Math.max(130, 76 + riskRows * 30) : 200}px`;
              })(),
              gridTemplateRows: isBottomSummaryOpen
                ? "minmax(0, 1fr) var(--simiti-bottom-legend-height)"
                : "minmax(0, 1fr) 0px",
              rowGap: isBottomSummaryOpen ? "8px" : "0px",
            } as React.CSSProperties}
          >
            {/* =====================================================
                MAP — pusat visual seperti mockup
               ===================================================== */}
            <section className="kerawanan-map relative min-w-0 w-full min-h-0 xl:min-h-0 rounded-xl overflow-hidden bg-sky-100 border border-white shadow-sm">
              <div ref={mapRef} id="simiti-map" className="absolute inset-0" />

              {/* BASEMAP SWITCHER */}
              <div className="kerawanan-basemap-switcher absolute top-3 left-3 z-[3000] flex overflow-hidden rounded-lg border border-slate-200 bg-white/95 shadow-lg backdrop-blur-sm">
                <button
                  type="button"
                  onClick={() => setBaseMapType("road")}
                  className={`px-3 py-2 text-[11px] font-semibold transition-colors ${
                    baseMapType === "road"
                      ? "bg-emerald-600 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                  title="Peta Jalan"
                >
                  Road
                </button>

                <button
                  type="button"
                  onClick={() => setBaseMapType("satellite")}
                  className={`border-l border-slate-200 px-3 py-2 text-[11px] font-semibold transition-colors ${
                    baseMapType === "satellite"
                      ? "bg-emerald-600 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                  title="Citra Satelit"
                >
                  Satellite
                </button>
              </div>

              <div className="print-map-title absolute top-3 right-3 z-[3000] max-w-[calc(100%-180px)] rounded-lg bg-white/95 border border-slate-200 px-3 py-2 shadow-sm">
                <div className="text-[15px] font-bold text-slate-800">
                  SIMITI • Peta Kawasan Rawan
                </div>
                <div className="mt-0.5 text-[10px] text-slate-600">
                  Wilayah:{" "}
                  {selectedAreas.length > 0
                    ? selectedAreas
                        .map((area: any) => area.label)
                        .filter(Boolean)
                        .join(", ")
                    : selectedDas
                        .map((das: any) => das.nama_das)
                        .filter(Boolean)
                        .join(", ")}
                </div>
                <div className="mt-0.5 text-[9px] text-slate-400">
                  Dicetak dari SIMITI GIS
                </div>
              </div>

              {/* Toggle panel bawah — selalu menempel di garis bawah peta */}
              <button
                type="button"
                onClick={() => setIsBottomSummaryOpen((open) => !open)}
                className="absolute left-1/2 bottom-0 -translate-x-1/2 z-[9999] flex items-center justify-center w-9 h-7 rounded-t-lg border border-slate-200 bg-white text-slate-500 shadow-lg hover:text-emerald-600 hover:bg-slate-50 transition-colors"
                aria-expanded={isBottomSummaryOpen}
                aria-controls="kerawanan-bottom-summary-panel"
                title={
                  isBottomSummaryOpen
                    ? "Sembunyikan panel bawah"
                    : "Tampilkan panel bawah"
                }
              >
                <svg
                  className={`w-4 h-4 transition-transform duration-300 ${
                    isBottomSummaryOpen ? "rotate-0" : "rotate-180"
                  }`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {/* Enterprise Search */}
              <div className="absolute top-[58px] left-3 right-3 sm:right-auto z-[1900] w-auto sm:w-[390px] mockup-map-search">
                {enterpriseSearchOpen &&
                  enterpriseSearchQuery.trim().length >= 2 && (
                    <div className="mt-1 bg-white rounded-xl border border-slate-200 shadow-[0_16px_45px_rgba(15,23,42,.2)] overflow-hidden">
                      {enterpriseSearchResults.length > 0
                        ? enterpriseSearchResults.map((result, idx) => (
                            <button
                              key={`${result.type}-${idx}`}
                              onClick={() =>
                                void handleEnterpriseSearchSelect(result)
                              }
                              className="w-full px-3 py-2.5 flex items-center gap-2 text-left hover:bg-emerald-50 border-b border-slate-100 last:border-0"
                            >
                              <span className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-sm">
                                {result.icon}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-[10px] font-bold text-slate-800 text-left truncate">
                                  {result.label}
                                </span>
                                <span className="block text-[8px] text-slate-400 truncate">
                                  {result.sublabel ||
                                    (result.type === "location"
                                      ? "Lokasi"
                                      : result.type === "layer"
                                        ? "Layer"
                                        : "Objek")}
                                </span>
                              </span>
                              <span className="text-[8px] text-emerald-600 font-semibold">
                                {result.type === "object"
                                  ? "IDENTIFY"
                                  : "FLY TO"}
                              </span>
                            </button>
                          ))
                        : !enterpriseSearchLoading && (
                            <div className="px-3 py-4 text-[9px] text-slate-400 text-center">
                              Tidak ada hasil untuk “{enterpriseSearchQuery}”
                            </div>
                          )}
                    </div>
                  )}
              </div>

              {enterpriseMetadataLayer && (
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[2100] w-[320px] max-w-[calc(100%-24px)]">
                  <div className="rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
                    <div className="bg-[#064238] text-white px-4 py-3 flex items-center justify-between">
                      <div>
                        <div className="text-[8px] uppercase tracking-wider text-emerald-200">
                          Layer Metadata
                        </div>
                        <div className="text-sm font-extrabold">
                          {formatTableName(
                            String(
                              enterpriseMetadataLayer.name ||
                                enterpriseMetadataLayer.id ||
                                "Layer",
                            ),
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => setEnterpriseMetadataLayer(null)}
                        className="text-white/70 hover:text-white text-lg"
                      >
                        ×
                      </button>
                    </div>
                    <div className="p-4 space-y-2 text-[9px]">
                      <div className="grid grid-cols-[72px_1fr] gap-2">
                        <span className="text-slate-400">ID</span>
                        <b className="text-slate-700 break-all">
                          {enterpriseMetadataLayer.id || "—"}
                        </b>
                      </div>
                      <div className="grid grid-cols-[72px_1fr] gap-2">
                        <span className="text-slate-400">Nama</span>
                        <b className="text-slate-700">
                          {enterpriseMetadataLayer.name || "—"}
                        </b>
                      </div>
                      <div className="grid grid-cols-[72px_1fr] gap-2">
                        <span className="text-slate-400">Sumber</span>
                        <b className="text-slate-700">
                          {enterpriseMetadataLayer.source ||
                            "Database / GIS Service"}
                        </b>
                      </div>
                      {enterpriseMetadataLayer.url && (
                        <div className="grid grid-cols-[72px_1fr] gap-2">
                          <span className="text-slate-400">Endpoint</span>
                          <span className="text-slate-600 break-all">
                            {enterpriseMetadataLayer.url}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* TITIK KLIK PETA — floating card terpisah dari panel kerawanan */}
                      {mapWeatherPopup.open &&
                        mapWeatherPopup.latitude !== null &&
                        mapWeatherPopup.longitude !== null && (
                          <div
                            className="map-click-coordinate-card rounded-xl border border-sky-200 bg-sky-50/95 p-3"
                            style={{ transform: `translate(${mapInfoOffset.x}px, ${mapInfoOffset.y}px)` }}
                          >
                            <div
                              className="mb-2 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider text-sky-800"
                              style={{ cursor: "grab", touchAction: "none", userSelect: "none" }}
                              onPointerDown={(event) => {
                                if ((event.target as HTMLElement).closest("button")) return;
                                mapInfoDragRef.current = {
                                  pointerId: event.pointerId,
                                  startX: event.clientX,
                                  startY: event.clientY,
                                  originX: mapInfoOffset.x,
                                  originY: mapInfoOffset.y,
                                };
                                event.currentTarget.setPointerCapture(event.pointerId);
                              }}
                              onPointerMove={(event) => {
                                const drag = mapInfoDragRef.current;
                                if (!drag || drag.pointerId !== event.pointerId) return;
                                setMapInfoOffset({
                                  x: drag.originX + event.clientX - drag.startX,
                                  y: drag.originY + event.clientY - drag.startY,
                                });
                              }}
                              onPointerUp={(event) => {
                                if (mapInfoDragRef.current?.pointerId === event.pointerId) mapInfoDragRef.current = null;
                              }}
                              onPointerCancel={() => { mapInfoDragRef.current = null; }}
                            >
                              <span className="flex items-center gap-2"><span>📍</span> Informasi Titik Peta <span className="text-[9px] font-normal normal-case text-sky-600">· </span></span>
                              <button
                                type="button"
                                aria-label="Tutup Informasi Titik Peta"
                                title="Tutup"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={closeMapWeatherPopup}
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sky-700 transition hover:bg-sky-200 hover:text-sky-950"
                                style={{ cursor: "pointer" }}
                              >
                                <span aria-hidden="true" className="text-base leading-none">×</span>
                              </button>
                            </div>
                            <div className="space-y-2">
                              <div>
                                <div className="text-[9px] text-slate-500">
                                  Desa/Kelurahan atau wilayah terdekat
                                </div>
                                <div className="text-xs font-bold text-slate-800">
                                  {mapWeatherPopup.locationName ||
                                    "Mencari nama wilayah..."}
                                </div>
                              </div>
                              {mapWeatherPopup.district && (
                                <div>
                                  <div className="text-[9px] text-slate-500">
                                    Kecamatan/Kabupaten
                                  </div>
                                  <div className="text-[10px] font-medium text-slate-700">
                                    {mapWeatherPopup.district}
                                  </div>
                                </div>
                              )}
                              {mapWeatherPopup.province && (
                                <div>
                                  <div className="text-[9px] text-slate-500">
                                    Provinsi
                                  </div>
                                  <div className="text-[10px] font-medium text-slate-700">
                                    {mapWeatherPopup.province}
                                  </div>
                                </div>
                              )}
                              <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-lg border border-slate-200 bg-white p-2">
                                  <div className="text-[9px] text-slate-500">
                                    Latitude
                                  </div>
                                  <div className="break-all font-mono text-[10px] font-bold text-slate-800 text-left">
                                    {mapWeatherPopup.latitude.toFixed(6)}
                                  </div>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-white p-2">
                                  <div className="text-[9px] text-slate-500">
                                    Longitude
                                  </div>
                                  <div className="break-all font-mono text-[10px] font-bold text-slate-800 text-left">
                                    {mapWeatherPopup.longitude.toFixed(6)}
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  void navigator.clipboard.writeText(
                                    `${mapWeatherPopup.latitude!.toFixed(6)}, ${mapWeatherPopup.longitude!.toFixed(6)}`,
                                  );
                                }}
                                className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-[10px] font-semibold text-sky-700 hover:bg-sky-100"
                              >
                                Salin koordinat
                              </button>
                            </div>
                          </div>
                        )}

            {/* =====================================================
                 RIGHT LAYER PANEL — SIMITI • Layer
                 Panel layer dipindahkan dari floating drawer ke
                 kolom kanan agar selalu tersedia seperti mockup.
                ===================================================== */}

            {!isRightLayerPanelOpen && (
              <button
                type="button"
                className="kerawanan-panel-reopen"
                onClick={() => {
                  setShowLayerPanel(true);
                  setIsRightLayerPanelOpen(true);
                }}
                aria-controls="kerawanan-right-layer-panel"
                aria-expanded={false}
                title="Tampilkan kembali panel layer"
              >
                <span aria-hidden="true">☰</span>
                Tampilkan Panel Layer
              </button>
            )}

            <aside
              id="kerawanan-right-layer-panel"
              className={`kerawanan-layer-panel min-h-[420px] xl:min-h-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col transition-all duration-300 ${
                isRightLayerPanelOpen
                  ? "opacity-100 translate-x-0"
                  : "hidden opacity-0 pointer-events-none"
              }`}
            >
              <div className="w-full h-full bg-white border border-slate-300 shadow-sm overflow-hidden flex flex-col">
                <div className="simiti-layer-panel-header flex h-9 min-h-9 items-center justify-between gap-2 px-2.5">
                  <div className="min-w-0 truncate text-[12px] font-extrabold text-white">
                    <span className="mr-1.5">»</span>SIMITIGASI <span className="font-semibold">(Layer Services)</span>
                  </div>
                  <button
                    onClick={() => {
                      setShowLayerPanel(false);
                      setIsRightLayerPanelOpen(false);
                    }}
                    type="button"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-white/90 text-lg hover:bg-white/15 transition-colors"
                    aria-label="Sembunyikan panel layer"
                    title="Sembunyikan panel layer"
                  >
                    ×
                  </button>
                </div>

                {/* Wilayah Analisis — pola interaksi dari Kerawanan-old50 */}
                <div className="simiti-analysis-section px-2 pt-2">
                  <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
                    <div className="grid grid-cols-2 gap-1">
                      <label className={`flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-lg px-2.5 transition-all ${activeTab === "administrasi" ? "border border-slate-200 bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:bg-white/70"}`}>
                        <input type="radio" name="kerawananMainTab" checked={activeTab === "administrasi"} onChange={() => handleMainTabChange("administrasi")} className="h-3.5 w-3.5 accent-emerald-600" />
                        <span className="text-[10px] font-bold">Administrasi</span>
                      </label>
                      <label className={`flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-lg px-2.5 transition-all ${activeTab === "das" ? "border border-slate-200 bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:bg-white/70"}`}>
                        <input type="radio" name="kerawananMainTab" checked={activeTab === "das"} onChange={() => handleMainTabChange("das")} className="h-3.5 w-3.5 accent-blue-600" />
                        <span className="text-[10px] font-bold">DAS</span>
                      </label>
                    </div>
                  </div>

                  <div className="overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                      <div>
                        <div className="text-[8px] font-extrabold uppercase tracking-[0.12em] text-slate-400">Wilayah Analisis</div>
                        <div className="mt-0.5 text-[9px] font-semibold text-slate-700">{activeTab === "administrasi" ? "Administrasi" : "Daerah Aliran Sungai"}</div>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[7px] font-bold ${activeTab === "administrasi" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>{activeTab === "administrasi" ? "ADMIN" : "DAS"}</span>
                    </div>

                    <div className="overflow-visible p-2.5">
                      {activeTab === "administrasi" ? (
                        <div className="grid grid-cols-[minmax(105px,0.8fr)_minmax(0,1.5fr)] gap-2">
                          <select
                            value={adminLevel}
                            onChange={(e) => {
                              const nextLevel = e.target.value as typeof adminLevel;
                              setAdminLevel(nextLevel);
                              if (debouncedSearch.current) clearTimeout(debouncedSearch.current);
                              areaSearchRequestRef.current += 1;
                              setAreaSearchQuery("");
                              setAreaSearchResults([]);
                              setShowAreaSearchDropdown(false);
                            }}
                            className="h-10 min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2 text-[10px] text-slate-700 outline-none transition-colors focus:border-emerald-400 focus:bg-white"
                            aria-label="Tingkat administrasi"
                          >
                            <option value="provinsi">Provinsi</option>
                            <option value="kabupaten">Kabupaten/Kota</option>
                            <option value="kecamatan">Kecamatan</option>
                            <option value="kelurahan">Kelurahan/Desa</option>
                          </select>

                          <div className="relative min-w-0">
                            <input
                              value={areaSearchQuery}
                              onChange={(e) => handleAreaSearchChange(e.target.value)}
                              onFocus={() => { if (areaSearchResults.length > 0) setShowAreaSearchDropdown(true); }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  if (debouncedSearch.current) clearTimeout(debouncedSearch.current);
                                  void searchAreas(areaSearchQuery);
                                } else if (e.key === "Escape") setShowAreaSearchDropdown(false);
                              }}
                              autoComplete="off"
                              spellCheck={false}
                              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[10px] text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white"
                              placeholder={`Cari ${adminLevel}...`}
                              aria-label={`Cari ${adminLevel}`}
                            />
                            {showAreaSearchDropdown && areaSearchResults.length > 0 && (
                              <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-[2400] max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
                                {areaSearchResults.map((area: any, index: number) => (
                                  <button key={`${area.id ?? area.kode ?? area.label ?? "area"}-${index}`} type="button" onClick={() => handleAreaSelect(area)} className="w-full border-b border-slate-100 px-2.5 py-2 text-left last:border-0 hover:bg-emerald-50">
                                    <span className="block truncate text-[10px] font-semibold text-slate-700">{area.label || area.nama || area.name || "Wilayah"}</span>
                                    <span className="mt-0.5 block text-[8px] text-slate-400">{area.level || adminLevel}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="relative">
                          <input
                            value={dasSearchQuery}
                            onChange={(e) => handleDasSearchChange(e.target.value)}
                            onFocus={() => { if (dasSearchResults.length > 0) setShowDasSearchDropdown(true); }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (debouncedDasSearch.current) clearTimeout(debouncedDasSearch.current);
                                void searchDas(dasSearchQuery);
                              } else if (e.key === "Escape") setShowDasSearchDropdown(false);
                            }}
                            autoComplete="off"
                            spellCheck={false}
                            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[10px] text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-400 focus:bg-white"
                            placeholder="Cari nama DAS..."
                            aria-label="Cari nama DAS"
                          />
                          {showDasSearchDropdown && dasSearchResults.length > 0 && (
                            <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-[2400] max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
                              {dasSearchResults.map((das: any, index: number) => (
                                <button key={`${das.id ?? das.kode ?? das.nama_das ?? "das"}-${index}`} type="button" onClick={() => handleDasSelect(das)} className="w-full border-b border-slate-100 px-2.5 py-2 text-left last:border-0 hover:bg-blue-50">
                                  <span className="block truncate text-[10px] font-semibold text-slate-700">{das.nama_das || das.label || das.nama || das.name || "DAS"}</span>
                                  <span className="mt-0.5 block text-[8px] text-slate-400">Daerah Aliran Sungai</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {(activeTab === "administrasi" ? selectedAreas.length > 0 || Boolean(selectedKhdtkName) : selectedDas.length > 0) && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {activeTab === "administrasi" ? (
                            <>
                              {selectedAreas.map((area: any, index: number) => (
                                <button key={`${area.label || area.nama || area.name}-${index}`} type="button" onClick={() => void handleRemoveArea(index)} className="max-w-full truncate rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-[8px] font-semibold text-emerald-700" title="Hapus wilayah administrasi">
                                  {area.label || area.nama || area.name} ×
                                </button>
                              ))}
                              {selectedKhdtkName && <span className="max-w-full truncate rounded-full border border-green-200 bg-green-100 px-2 py-1 text-[8px] font-bold text-green-800">{selectedKhdtkName}</span>}
                            </>
                          ) : (
                            selectedDas.map((das: any, index: number) => (
                              <button key={`${das.nama_das || das.label || das.nama || das.name}-${index}`} type="button" onClick={() => void handleRemoveDas(index)} className="max-w-full truncate rounded-full border border-blue-100 bg-blue-50 px-2 py-1 text-[8px] font-semibold text-blue-700" title="Hapus DAS">
                                {das.nama_das || das.label || das.nama || das.name} ×
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {layerError && (
                  <div className="mx-3 mt-3 rounded-lg bg-red-50 border border-red-100 p-2 text-[9px] text-red-700">
                    {layerError}
                  </div>
                )}

                <div className="simiti-layer-list flex-1 min-h-0 overflow-y-auto dashboard-scroll p-2">
                  <div className="simiti-layer-category mb-4">
                    <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-slate-200 text-left">
                      <button
                        onClick={() => enterpriseToggleGroup("kerawanan")}
                        className="text-[11px] font-bold text-slate-800 text-left flex-1 text-left"
                      >
                        {enterpriseCollapsedGroups.has("kerawanan") ? "▸" : "▾"}{" "}
                        Kerawanan
                      </button>
                      <button
                        onClick={() => handleAddClick("kerawanan")}
                        className="text-[9px] text-emerald-700"
                      >
                        + Data
                      </button>
                    </div>
                    {!enterpriseCollapsedGroups.has("kerawanan") && (
                      <div className="simiti-layer-grid grid grid-cols-2 gap-1">
                        {(currentBounds &&
                        (selectedAreas.length > 0 || selectedDas.length > 0)
                          ? availableLayers.kerawanan
                          : layerData.kerawanan
                        )
                          .filter(enterpriseMatchesLayer)
                          .map((layer) => (
                            <label
                              key={layer.id}
                              className="simiti-layer-item flex min-w-0 items-start gap-1 rounded-[3px] border border-slate-200 bg-white px-1.5 py-1 hover:bg-slate-100 cursor-pointer transition-colors"
                            >
                              <input
                                type="checkbox"
                                className="mt-[1px] h-3 w-3 shrink-0 cursor-pointer accent-slate-500"
                                checked={activeLayers.has(layer.name)}
                                onChange={(e) =>
                                  handleLayerToggle(
                                    layer.name,
                                    e.target.checked,
                                  )
                                }
                                disabled={loadingLayerNames.has(layer.name)}
                              />
                              <span className="min-w-0 flex-1 truncate text-[8px] leading-[13px] text-slate-800">
                                {loadingLayerNames.has(layer.name) ? "⏳ " : ""}
                                {formatTableName(layer.name)}
                              </span>
                            </label>
                          ))}
                      </div>
                    )}
                  </div>

                  {(["mitigasiAdaptasi", "lainnya", "kejadian"] as const).map(
                    (section) => {
                      const source: any =
                        currentBounds &&
                        (selectedAreas.length > 0 || selectedDas.length > 0)
                          ? availableLayers[section]
                          : layerData[section];
                      const title =
                        section === "mitigasiAdaptasi"
                          ? "Mitigasi & Adaptasi"
                          : section === "lainnya"
                            ? "Lainnya"
                            : "Kejadian";
                      const visibleLayers = (source || []).filter(enterpriseMatchesLayer);
                      return (
                        <div key={section} className="simiti-layer-category mb-4">
                          <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-slate-200 text-left">
                            <h3 className="text-[11px] font-bold text-slate-800 text-left">
                              {title}
                            </h3>
                            {section !== "kejadian" && (
                              <button
                                onClick={() => handleAddClick(section)}
                                className="text-[9px] text-emerald-700"
                              >
                                + Data
                              </button>
                            )}
                          </div>
                          {!enterpriseCollapsedGroups.has(section) && (
                            <div className="simiti-layer-grid grid grid-cols-2 gap-1">
                              {visibleLayers.map((layer: any) => (
                                  <label
                                    key={layer.id}
                                    className="simiti-layer-item flex min-w-0 items-start gap-1 rounded-[3px] border border-slate-200 bg-white px-1.5 py-1 hover:bg-slate-100 cursor-pointer transition-colors"
                                  >
                                    <input
                                      type="checkbox"
                                      className="mt-[1px] h-3 w-3 shrink-0 cursor-pointer accent-slate-500"
                                      checked={
                                        activeLayers.has(
                                          String(
                                            layer.isManual
                                              ? layer.name
                                              : layer.id,
                                          ),
                                        ) ||
                                        activeLayers.has(String(layer.name))
                                      }
                                      onChange={(e) => {
                                        console.log("🔎 CHECKBOX LAYER:", {
                                          id: layer.id,
                                          name: layer.name,
                                          label: layer.label,
                                          isManual: layer.isManual,
                                          checked: e.target.checked,
                                        });

                                        handleLayerToggle(
                                          layer.isManual
                                            ? layer.name
                                            : layer.id,
                                          e.target.checked,
                                          layer.year,
                                          layer.category,
                                          layer.isShapefile,
                                        );
                                      }}
                                      disabled={loadingLayerNames.has(
                                        layer.name,
                                      )}
                                    />
                                    <span className="min-w-0 flex-1 truncate text-[8px] leading-[13px] text-slate-800">
                                      {formatTableName(layer.name)}
                                    </span>
                                  </label>
                                ))}
                            </div>
                          )}
                        </div>
                      );
                    },
                  )}
                </div>
              </div>
            </aside>

            {/* =====================================================
                BOTTOM PANEL — TAB LAYER (mengikuti kerawanan-ori)
                Konten memakai renderBottomContent + bottomTabs existing.
                Tidak mengubah data/API/GPS maupun proses pemuatan layer.
               ===================================================== */}
            <section
              id="kerawanan-bottom-summary-panel"
              className={`kerawanan-bottom-summary kerawanan-bottom-tabs-panel min-h-0 min-w-0 overflow-hidden bg-white transition-opacity duration-200 ${
                isBottomSummaryOpen
                  ? "opacity-100"
                  : "kerawanan-bottom-summary-hidden"
              } xl:col-span-full`}
            >
              <div className="kerawanan-bottom-tabs-header flex min-w-0 flex-shrink-0 items-center gap-1.5 overflow-x-auto border-b border-slate-200 bg-slate-50 px-3 py-1.5 dashboard-scroll">
                {bottomTabs.map((tab) => {
                  const tabLayerName: Record<string, string> = {
                    tutupanLahan: "tutupan_lahan",
                    penutupanLahan2024: "penutupan_lahan_2024",
                    pl2024: "pl2024",
                    jenisTanah: "jenis_tanah",
                    geologi: "geologi",
                    lahan_kritis: "lahan_kritis",
                    rawan_erosi: "rawan_erosi",
                    rawan_longsor: "rawan_longsor",
                    rawan_limpasan: "rawan_limpasan",
                    rawan_karhutla: "rawan_karhutla",
                    bahaya_kekeringan: "bahaya_kekeringan",
                    bahaya_abrasi: "bahaya_abrasi_dan_gelombang_ekstrim",
                    bahaya_banjir: "bahaya_banjir",
                    bahaya_banjir_bandang: "bahaya_banjir_bandang",
                    dta_danau: "dta_danau",
                    rehabilitasi_das: "rehabilitasi_das",
                    rehabilitasi_hutan: "rehabilitasi_hutan",
                    sumur_bor: "sumur_bor",
                    restorasi_gambut: "restorasi_gambut",
                    penerapan_teknik_kta: "penerapan_teknik_kta",
                    kebakaran_2021: "karhutla_2021",
                    kebakaran_2022: "karhutla_2022",
                    kebakaran_2023: "karhutla_2023",
                    kebakaran_2024: "karhutla_2024",
                    kebakaran_2025: "karhutla_2025",
                    kawasan_hutan: "kawasan_hutan",
                    risiko_banjir: "risiko_banjir",
                    risiko_banjir_bandang: "risiko_banjir_bandang",
                    risiko_kekeringan: "risiko_kekeringan",
                    risiko_abrasi: "risiko_abrasi",
                    risiko_longsor: "risiko_longsor",
                    risiko_karhutla: "risiko_karhutla",
                    khdtk: "khdtk",
                  };
                  const layerName = tabLayerName[tab.id] || "";
                  const isTabLoading = Boolean(
                    layerName && loadingLayerNames.has(layerName),
                  );
                  const isActive = activeBottomTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() =>
                        !isTabLoading && setActiveBottomTab(tab.id)
                      }
                      disabled={isTabLoading}
                      aria-pressed={isActive}
                      className={`inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-[10px] font-semibold transition-colors ${
                        isActive
                          ? "border border-blue-200 bg-white text-blue-700 shadow-sm"
                          : isTabLoading
                            ? "cursor-not-allowed text-slate-400"
                            : "border border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-800"
                      }`}
                    >
                      {isTabLoading ? (
                        <span className="inline-block animate-spin">⏳</span>
                      ) : null}
                      <span>{tab.icon}</span>
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
                {bottomTabs.length > 0 ? (
                  <span className="ml-auto flex-shrink-0 px-2 text-[9px] font-medium text-slate-400">
                    {bottomTabs.length} layer aktif
                  </span>
                ) : null}
              </div>

              <div className="kerawanan-bottom-tabs-content min-h-0 min-w-0 overflow-hidden bg-white p-2">
                {renderBottomContent()}
              </div>
            </section>
          </div>
        </main>
      </div>

      {/* Modal Tambah Data - Enterprise GIS Publisher */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-3 sm:p-5"
          onClick={() => !isUploading && setShowAddModal(false)}
        >
          <div
            className="w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* =========================================================
          HEADER
      ========================================================= */}
            <div className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-5 py-5 sm:px-6">
              <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-emerald-400/10 blur-2xl" />
              <div className="absolute -bottom-20 left-1/3 h-36 w-36 rounded-full bg-cyan-400/10 blur-2xl" />

              <div className="relative flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur">
                    <svg
                      className="h-5 w-5 text-emerald-300"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 4v16m8-8H4"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M7 20h10a2 2 0 002-2V6a2 2 0 00-2-2H7a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold tracking-tight text-white sm:text-lg">
                        Tambah Data Spasial
                      </h3>

                      <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                        GIS Publisher
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-slate-300">
                      Publikasikan layer baru ke SIMITI GIS
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => !isUploading && setShowAddModal(false)}
                  disabled={isUploading}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Tutup"
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 6l12 12M18 6L6 18"
                    />
                  </svg>
                </button>
              </div>

              {/* Context */}
              <div className="relative mt-4 flex flex-wrap items-center gap-2">
                <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Modul
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {getSectionTitle(currentSection)}
                </span>

                <span className="text-[10px] text-slate-500">•</span>

                <span className="text-[10px] text-slate-400">
                  Administrator Publisher
                </span>
              </div>
            </div>

            {/* =========================================================
          BODY
      ========================================================= */}
            <div className="max-h-[calc(92vh-190px)] overflow-y-auto bg-slate-50/70 p-4 sm:p-6">
              <div className="space-y-5">
                {/* =====================================================
              01 INFORMASI LAYER
          ===================================================== */}
                <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white">
                        01
                      </div>

                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                          Informasi Layer
                        </h4>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          Identitas dataset yang akan dipublikasikan
                        </p>
                      </div>
                    </div>

                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-700">
                      REQUIRED
                    </span>
                  </div>

                  <div className="space-y-4 p-4">
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-slate-700">
                          Nama Layer / Tabel
                          <span className="ml-1 text-rose-500">*</span>
                        </label>

                        <span className="text-[9px] text-slate-400">
                          Digunakan sebagai nama tabel
                        </span>
                      </div>

                      <div className="relative">
                        <input
                          type="text"
                          placeholder="contoh: bahaya_banjir_kabupaten_bogor"
                          value={newLayerName}
                          onChange={(e) => setNewLayerName(e.target.value)}
                          disabled={isUploading}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 pr-10 text-xs text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 disabled:bg-slate-100 disabled:text-slate-400"
                        />

                        {newLayerName.trim() && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <svg
                              className="h-4 w-4 text-emerald-500"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                          Modul Tujuan
                        </div>
                        <div className="mt-1 text-xs font-semibold text-slate-700">
                          {getSectionTitle(currentSection)}
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                          Publisher
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Administrator
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* =====================================================
              02 DATA SPASIAL
          ===================================================== */}
                <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white">
                        02
                      </div>

                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                          Data Spasial
                        </h4>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          Upload paket Shapefile
                        </p>
                      </div>
                    </div>

                    {uploadedFiles.length > 0 && (
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-700">
                        {uploadedFiles.length} FILE
                      </span>
                    )}
                  </div>

                  <div className="p-4">
                    <input
                      type="file"
                      id="shapefileInput"
                      multiple
                      accept=".shp,.shx,.dbf,.prj,.cpg,.sbn,.sbx"
                      onChange={handleFileChange}
                      className="hidden"
                      disabled={isUploading}
                    />

                    {uploadedFiles.length === 0 ? (
                      <label
                        htmlFor="shapefileInput"
                        className={`group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-white px-5 py-8 text-center transition ${
                          isUploading
                            ? "cursor-not-allowed opacity-60"
                            : "hover:border-emerald-400 hover:bg-emerald-50/40"
                        }`}
                      >
                        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition group-hover:scale-105 group-hover:ring-emerald-200">
                          <svg
                            className="h-7 w-7 text-slate-400 transition group-hover:text-emerald-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth="1.6"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M12 16V4m0 0L7 9m5-5l5 5"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 20h14a2 2 0 002-2v-4a2 2 0 00-2-2h-1"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M7 12H5a2 2 0 00-2 2v4a2 2 0 002 2h1"
                            />
                          </svg>
                        </div>

                        <div className="text-sm font-bold text-slate-700">
                          Upload Shapefile
                        </div>

                        <div className="mt-1 text-[11px] text-slate-400">
                          Klik untuk memilih file dataset
                        </div>

                        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                          {["SHP", "SHX", "DBF", "PRJ", "CPG"].map((ext) => (
                            <span
                              key={ext}
                              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[8px] font-bold tracking-wider text-slate-500"
                            >
                              .{ext}
                            </span>
                          ))}
                        </div>

                        <div className="mt-3 text-[9px] text-slate-400">
                          File <b className="text-slate-600">.SHP</b> wajib
                          tersedia
                        </div>
                      </label>
                    ) : (
                      <div className="space-y-3">
                        {/* File status header */}
                        <div className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500">
                              <svg
                                className="h-4 w-4 text-white"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            </div>

                            <div>
                              <div className="text-[10px] font-bold text-emerald-800">
                                Dataset terdeteksi
                              </div>
                              <div className="text-[9px] text-emerald-600">
                                {uploadedFiles.length} file siap diproses
                              </div>
                            </div>
                          </div>

                          {!isUploading && (
                            <label
                              htmlFor="shapefileInput"
                              className="cursor-pointer rounded-md bg-white px-2.5 py-1.5 text-[9px] font-bold text-emerald-700 shadow-sm ring-1 ring-emerald-100 transition hover:bg-emerald-50"
                            >
                              Ganti File
                            </label>
                          )}
                        </div>

                        {/* File list */}
                        <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
                          {uploadedFiles.map((file, index) => {
                            const extension =
                              file.name.split(".").pop()?.toUpperCase() ||
                              "FILE";

                            const size =
                              file.size < 1024 * 1024
                                ? `${(file.size / 1024).toFixed(1)} KB`
                                : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

                            const isShp = extension === "SHP";
                            const isRequired = ["SHP", "SHX", "DBF"].includes(
                              extension,
                            );

                            return (
                              <div
                                key={`${file.name}-${index}`}
                                className="flex items-center gap-3 px-3 py-2.5"
                              >
                                <div
                                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[8px] font-black ${
                                    isShp
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-slate-100 text-slate-600"
                                  }`}
                                >
                                  {extension}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-[10px] font-semibold text-slate-700">
                                    {file.name}
                                  </div>
                                  <div className="mt-0.5 text-[9px] text-slate-400">
                                    {size}
                                  </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-1.5">
                                  {isRequired && (
                                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[7px] font-bold uppercase text-slate-500">
                                      CORE
                                    </span>
                                  )}

                                  <svg
                                    className="h-4 w-4 text-emerald-500"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Validation */}
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                              Dataset Validation
                            </span>

                            {uploadedFiles.some((f) =>
                              f.name.toLowerCase().endsWith(".shp"),
                            ) ? (
                              <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-600">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                VALID
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold text-rose-500">
                                INCOMPLETE
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {["shp", "shx", "dbf", "prj"].map((requiredExt) => {
                              const exists = uploadedFiles.some((f) =>
                                f.name
                                  .toLowerCase()
                                  .endsWith(`.${requiredExt}`),
                              );

                              return (
                                <div
                                  key={requiredExt}
                                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 ${
                                    exists
                                      ? "border-emerald-100 bg-white"
                                      : "border-slate-200 bg-white"
                                  }`}
                                >
                                  <span
                                    className={`flex h-4 w-4 items-center justify-center rounded-full ${
                                      exists
                                        ? "bg-emerald-100 text-emerald-600"
                                        : "bg-slate-100 text-slate-400"
                                    }`}
                                  >
                                    {exists ? "✓" : "•"}
                                  </span>

                                  <span
                                    className={`text-[8px] font-bold uppercase ${
                                      exists
                                        ? "text-slate-600"
                                        : "text-slate-400"
                                    }`}
                                  >
                                    .{requiredExt}
                                  </span>
                                </div>
                              );
                            })}
                          </div>

                          {!uploadedFiles.some((f) =>
                            f.name.toLowerCase().endsWith(".shp"),
                          ) && (
                            <div className="mt-2 flex items-center gap-1.5 text-[9px] text-rose-500">
                              <span>⚠</span>
                              File .shp wajib tersedia sebelum publikasi.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                {/* =====================================================
              03 PROSES PUBLIKASI
          ===================================================== */}
                <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-xs font-bold text-white">
                        03
                      </div>

                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                          Proses Publikasi
                        </h4>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          Status pipeline dataset
                        </p>
                      </div>
                    </div>

                    <span
                      className={`rounded-full px-2 py-1 text-[9px] font-bold ${
                        isUploading
                          ? "bg-amber-50 text-amber-700"
                          : uploadProgress === 100
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {isUploading
                        ? "PROCESSING"
                        : uploadProgress === 100
                          ? "COMPLETED"
                          : "READY"}
                    </span>
                  </div>

                  <div className="p-4">
                    {/* Pipeline */}
                    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        {
                          number: "01",
                          title: "Validasi",
                          done:
                            uploadedFiles.length > 0 &&
                            uploadedFiles.some((f) =>
                              f.name.toLowerCase().endsWith(".shp"),
                            ),
                        },
                        {
                          number: "02",
                          title: "Upload",
                          done: uploadProgress >= 100,
                        },
                        {
                          number: "03",
                          title: "Import GIS",
                          done: insertProgress >= 100,
                        },
                        {
                          number: "04",
                          title: "Publish",
                          done: insertProgress >= 100,
                        },
                      ].map((step) => (
                        <div
                          key={step.number}
                          className={`rounded-lg border px-3 py-2.5 transition ${
                            step.done
                              ? "border-emerald-100 bg-emerald-50/60"
                              : "border-slate-100 bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-[8px] font-black ${
                                step.done
                                  ? "text-emerald-500"
                                  : "text-slate-400"
                              }`}
                            >
                              {step.number}
                            </span>

                            {step.done && (
                              <svg
                                className="h-3.5 w-3.5 text-emerald-500"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </div>

                          <div
                            className={`mt-1 text-[9px] font-bold ${
                              step.done ? "text-emerald-700" : "text-slate-500"
                            }`}
                          >
                            {step.title}
                          </div>
                        </div>
                      ))}
                    </div>

                    {isUploading ? (
                      <div className="space-y-4">
                        {/* Upload */}
                        <div>
                          <div className="mb-1.5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-semibold text-slate-700">
                                Upload Dataset
                              </span>

                              {uploadProgress < 100 && (
                                <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[8px] font-bold text-blue-600">
                                  ACTIVE
                                </span>
                              )}
                            </div>

                            <span className="text-[10px] font-bold text-slate-600">
                              {uploadProgress}%
                            </span>
                          </div>

                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-300"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>

                          <div className="mt-1 text-[9px] text-slate-400">
                            {uploadProgress < 100
                              ? "Mengirim dataset ke server..."
                              : "Upload selesai. Memulai proses import GIS..."}
                          </div>
                        </div>

                        {/* Import */}
                        <div>
                          <div className="mb-1.5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-semibold text-slate-700">
                                Import Features
                              </span>

                              {insertStatus && (
                                <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-bold text-emerald-600">
                                  {insertStatus}
                                </span>
                              )}
                            </div>

                            <span className="text-[10px] font-bold text-slate-600">
                              {insertProgress}%
                            </span>
                          </div>

                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                              style={{ width: `${insertProgress}%` }}
                            />
                          </div>

                          <div className="mt-1 text-[9px] text-slate-400">
                            {insertProgress < 100
                              ? "Memasukkan feature spasial ke database..."
                              : "Seluruh feature berhasil diproses."}
                          </div>
                        </div>

                        {/* Processing notice */}
                        <div className="flex items-start gap-2.5 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5">
                          <svg
                            className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M12 9v3.5m0 3h.01"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M10.3 4.7L2.9 17.5A2 2 0 004.6 20h14.8a2 2 0 001.7-2.5L13.7 4.7a2 2 0 00-3.4 0z"
                            />
                          </svg>

                          <div>
                            <div className="text-[10px] font-bold text-amber-800">
                              Jangan tutup halaman
                            </div>
                            <div className="mt-0.5 text-[9px] leading-relaxed text-amber-700">
                              Dataset sedang diproses. Tunggu sampai seluruh
                              pipeline selesai.
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
                          <svg
                            className="h-4 w-4 text-slate-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth="1.7"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M12 8v4l2.5 2.5"
                            />
                            <circle cx="12" cy="12" r="8.5" />
                          </svg>
                        </div>

                        <div>
                          <div className="text-[10px] font-semibold text-slate-600">
                            Pipeline siap dijalankan
                          </div>
                          <div className="mt-0.5 text-[9px] text-slate-400">
                            Lengkapi informasi layer dan dataset untuk memulai.
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>

            {/* =========================================================
          FOOTER
      ========================================================= */}
            <div className="border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100">
                    <svg
                      className="h-3.5 w-3.5 text-slate-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.7"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 11V8m0 8h.01"
                      />
                      <rect width="16" height="16" x="4" y="4" rx="3" />
                    </svg>
                  </div>

                  <div>
                    <div className="text-[9px] font-semibold text-slate-600">
                      Administrator only
                    </div>
                    <div className="text-[8px] text-slate-400">
                      Publikasi data akan tersimpan ke sistem GIS.
                    </div>
                  </div>
                </div>

                <div className="flex w-full gap-2 sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    disabled={isUploading}
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[10px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
                  >
                    Batal
                  </button>

                  <button
                    type="button"
                    onClick={handleCreateLayer}
                    disabled={
                      isUploading ||
                      !newLayerName.trim() ||
                      uploadedFiles.length === 0 ||
                      !uploadedFiles.some((f) =>
                        f.name.toLowerCase().endsWith(".shp"),
                      )
                    }
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-[10px] font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none sm:flex-none"
                  >
                    {isUploading ? (
                      <>
                        <svg
                          className="h-3.5 w-3.5 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="3"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
                          />
                        </svg>

                        {uploadProgress < 100
                          ? "Mengupload..."
                          : "Memproses..."}
                      </>
                    ) : (
                      <>
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                        Publikasikan Layer
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal Konfirmasi Hapus */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000]"
          onClick={() => setShowDeleteModal(false)}
        >
          <div
            className="bg-white rounded-lg w-full max-w-sm shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-base font-semibold">Konfirmasi Hapus</h3>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600">
                Apakah Anda yakin ingin menghapus layer{" "}
                <strong>{layerToDelete?.name}</strong>?
              </p>
              <p className="text-xs text-red-500 mt-2">
                Tindakan ini tidak dapat dibatalkan dan akan menghapus tabel
                dari database.
              </p>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                Batal
              </button>
              <button
                onClick={confirmDelete}
                className="px-3 py-1.5 text-sm bg-red-500 text-white rounded hover:bg-red-600"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GPS Current Location — info card di tengah area peta */}
      {gpsPopupOpen && (
        <div className="absolute left-1/2 top-1/2 z-[1900] w-[calc(100vw-2rem)] max-w-[360px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-emerald-700 to-teal-600 px-4 py-3 text-white">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-100">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-white/15 ring-1 ring-white/20">
                  <span className="h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_0_4px_rgba(255,255,255,.16)]" />
                </span>
                GPS • Lokasi Saat Ini
              </div>
              <div className="mt-1 truncate text-sm font-bold">
                {gpsLocation.loading
                  ? "Mendeteksi posisi perangkat..."
                  : gpsLocation.locationName}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setGpsPopupOpen(false)}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/10 text-lg leading-none text-white hover:bg-white/20"
              aria-label="Tutup informasi lokasi"
            >
              ×
            </button>
          </div>

          <div className="p-4">
            {gpsLocation.loading ? (
              <div className="flex items-center gap-3 py-2 text-xs text-slate-600">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                Meminta GPS dan membaca informasi wilayah...
              </div>
            ) : gpsLocation.error && gpsLocation.latitude === null ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                {gpsLocation.error}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      Latitude
                    </div>
                    <div className="mt-1 font-mono text-xs font-bold text-slate-800">
                      {gpsLocation.latitude?.toFixed(6) ?? "-"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      Longitude
                    </div>
                    <div className="mt-1 font-mono text-xs font-bold text-slate-800">
                      {gpsLocation.longitude?.toFixed(6) ?? "-"}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 text-[11px]">
                  {gpsLocation.village && (
                    <div>
                      <span className="font-semibold text-slate-500">
                        Desa/Kelurahan:
                      </span>{" "}
                      <span className="text-slate-800">
                        {gpsLocation.village}
                      </span>
                    </div>
                  )}
                  {gpsLocation.district && (
                    <div>
                      <span className="font-semibold text-slate-500">
                        Kecamatan:
                      </span>{" "}
                      <span className="text-slate-800">
                        {gpsLocation.district}
                      </span>
                    </div>
                  )}
                  {gpsLocation.city && (
                    <div>
                      <span className="font-semibold text-slate-500">
                        Kab/Kota:
                      </span>{" "}
                      <span className="text-slate-800">{gpsLocation.city}</span>
                    </div>
                  )}
                  {gpsLocation.province && (
                    <div>
                      <span className="font-semibold text-slate-500">
                        Provinsi:
                      </span>{" "}
                      <span className="text-slate-800">
                        {gpsLocation.province}
                      </span>
                    </div>
                  )}
                  {gpsLocation.accuracy !== null && (
                    <div>
                      <span className="font-semibold text-slate-500">
                        Akurasi GPS:
                      </span>{" "}
                      <span className="text-slate-800">
                        ± {Math.round(gpsLocation.accuracy)} meter
                      </span>
                    </div>
                  )}
                </div>

                {gpsLocation.error && (
                  <div className="rounded-lg bg-amber-50 px-2.5 py-2 text-[10px] text-amber-700">
                    {gpsLocation.error}
                  </div>
                )}

                {/* Ancaman Bencana dari data Kerawanan SIMITI */}
                <div className="rounded-xl border border-red-100 bg-gradient-to-b from-red-50 to-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-red-700">
                        Ancaman Bencana di Lokasi
                      </div>
                      <div className="mt-0.5 text-[9px] text-slate-500">
                        Berdasarkan data Kerawanan SIMITI/PostGIS
                      </div>
                    </div>
                    {gpsThreats.riskStatus && (
                      <span className="rounded-full bg-white px-2 py-1 text-[9px] font-bold text-red-700 ring-1 ring-red-100">
                        {gpsThreats.riskStatus}
                      </span>
                    )}
                  </div>

                  {gpsThreats.loading ? (
                    <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
                      Memeriksa seluruh layer kerawanan pada titik GPS...
                    </div>
                  ) : gpsThreats.error ? (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] leading-4 text-amber-700">
                      {gpsThreats.error}
                    </div>
                  ) : (gpsThreats.threats ?? []).length === 0 ? (
                    <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-2 text-[10px] leading-4 text-emerald-700">
                      Tidak ditemukan ancaman bencana pada titik GPS berdasarkan
                      data kerawanan yang tersedia.
                    </div>
                  ) : (
                    <div className="mt-3 space-y-1.5">
                      {(gpsThreats.threats ?? []).map((threat, index) => (
                        <div
                          key={`${threat.key}-${index}`}
                          className="flex items-center justify-between gap-2 rounded-lg border border-white bg-white px-2.5 py-2 shadow-sm"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-[10px] font-bold text-slate-800 text-left">
                              {threat.label}
                            </div>
                            <div className="mt-0.5 text-[9px] text-slate-500">
                              Layer: {threat.source}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-[9px] font-extrabold text-red-700">
                              {threat.status || "Terdeteksi"}
                            </div>
                            {threat.score !== null && (
                              <div className="text-[8px] text-slate-400">
                                Skor {threat.score}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {gpsThreats.riskScore !== null && (
                    <div className="mt-2 border-t border-red-100 pt-2 text-[9px] text-slate-500">
                      Skor risiko lokasi:{" "}
                      <span className="font-bold text-slate-700">
                        {gpsThreats.riskScore}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                detectCurrentGpsLocation();
              }}
              disabled={gpsLocation.loading}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {gpsLocation.loading
                ? "Mendeteksi GPS..."
                : "Perbarui Lokasi GPS"}
            </button>
            <div className="mt-2 text-center text-[9px] leading-4 text-slate-400">
              Posisi berasal dari GPS/geolocation perangkat dan membutuhkan izin
              lokasi browser.
            </div>
          </div>
        </div>
      )}

      {/* Photo Lightbox */}
      {selectedPhotoIndex !== null && (kejadianPhotos ?? []).length > 0 && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 z-[2000] flex items-center justify-center"
          onClick={() => setSelectedPhotoIndex(null)}
          style={{ cursor: "pointer" }}
        >
          {/* Close Button */}
          <button
            onClick={() => setSelectedPhotoIndex(null)}
            className="absolute top-4 right-4 text-white text-4xl hover:text-gray-300 bg-transparent border-none cursor-pointer z-[2001]"
            style={{ background: "none", border: "none" }}
          >
            ×
          </button>

          {/* Previous Button */}
          {selectedPhotoIndex > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedPhotoIndex((prev) => (prev > 0 ? prev - 1 : 0));
              }}
              className="absolute left-4 text-white text-5xl hover:text-gray-300 bg-black bg-opacity-50 rounded-full w-12 h-12 flex items-center justify-center"
              style={{
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 2002,
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          )}

          {/* Main Content */}
          <div
            className="relative max-w-4xl max-h-screen p-4"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#000",
              borderRadius: "0.5rem",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.5)",
              overflow: "hidden",
            }}
          >
            {/* Main Image */}
            <img
              src={`${API_URL}${kejadianPhotos[selectedPhotoIndex].path}`}
              alt={`${kejadianPhotos[selectedPhotoIndex].incident_type}`}
              className="max-w-full max-h-full object-contain block"
              style={{
                maxWidth: "800px",
                maxHeight: "500px",
                width: "100%",
                height: "auto",
              }}
              onError={(e) => {
                e.currentTarget.src =
                  "https://via.placeholder.com/800?text=Image+Not+Found";
              }}
            />

            {/* Photo Info */}
            <div className="text-white text-center mt-4 px-4">
              <p className="text-lg font-semibold">
                Foto {selectedPhotoIndex + 1} dari{" "}
                {(kejadianPhotos ?? []).length}
              </p>
              <p className="text-sm mt-2">
                {kejadianPhotos[selectedPhotoIndex].incident_type} -{" "}
                {new Date(
                  kejadianPhotos[selectedPhotoIndex].incident_date,
                ).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
              {kejadianPhotos[selectedPhotoIndex].title && (
                <p className="text-xs text-gray-300 mt-1">
                  {kejadianPhotos[selectedPhotoIndex].title}
                </p>
              )}
            </div>

            {/* Thumbnails */}
            <div
              className="flex gap-2 mt-4 px-4 pb-4 overflow-x-auto"
              style={{
                scrollbarWidth: "thin",
                scrollbarColor: "#ccc #000",
              }}
            >
              {kejadianPhotos.map((photo, idx) => (
                <img
                  key={idx}
                  src={`${API_URL}${photo.path}`}
                  alt={`Thumbnail ${idx + 1}`}
                  onClick={() => setSelectedPhotoIndex(idx)}
                  className="flex-shrink-0 w-20 h-20 object-cover rounded cursor-pointer"
                  style={{
                    border:
                      selectedPhotoIndex === idx
                        ? "3px solid #f97316"
                        : "2px solid transparent",
                    opacity: selectedPhotoIndex === idx ? 1 : 0.6,
                  }}
                  onError={(e) => {
                    e.currentTarget.src =
                      "https://via.placeholder.com/80?text=No+Image";
                  }}
                />
              ))}
            </div>
          </div>

          {/* Next Button */}
          {selectedPhotoIndex < (kejadianPhotos ?? []).length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedPhotoIndex((prev) =>
                  prev < (kejadianPhotos ?? []).length - 1 ? prev + 1 : prev,
                );
              }}
              className="absolute right-4 text-white text-5xl hover:text-gray-300 bg-black bg-opacity-50 rounded-full w-12 h-12 flex items-center justify-center"
              style={{
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 2002,
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Header Trademark */}
    </div>
  );
};

export default Kerawanan;

