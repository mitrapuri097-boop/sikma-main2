import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "./api";
import Header from "./header";

const Kerawanan = () => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const mapWeatherMarkerRef = useRef<any>(null);
  const locationSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const locationSearchRequestRef = useRef(0);
  const layerGroupsRef = useRef({});
  const bnpbOverlayRefs = useRef<Record<string, any>>({});
  const bnpbServiceMetaRef = useRef<Map<string, any>>(new Map());

  // ======================================================
  // BNPB InaRISK / ArcGIS REST services
  // Semua service resmi BNPB yang URL-nya sudah tersedia.
  // Raster MapServer ditampilkan langsung sebagai ImageOverlay
  // sehingga tidak perlu disalin ke MySQL.
  // ======================================================
  const BNPB_INARISK_LAYERS = [
    {
      key: "bnpb_risiko_banjir",
      name: "Risiko Banjir",
      group: "Risiko",
      url: "https://gis.bnpb.go.id/server/rest/services/inarisk/INDEKS_RISIKO_BANJIR_JBTBPJ/MapServer",
      layerId: 0,
      serviceType: "MapServer",
    },
    {
      key: "bnpb_risiko_kekeringan",
      name: "Risiko Kekeringan",
      group: "Risiko",
      url: "https://gis.bnpb.go.id/server/rest/services/inarisk/layer_risiko_kekeringan/ImageServer",
      layerId: 0,
      serviceType: "ImageServer",
    },
    {
      key: "bnpb_risiko_banjir_bandang",
      name: "Risiko Banjir Bandang",
      group: "Risiko",
      url: "https://gis.bnpb.go.id/server/rest/services/inarisk/INDEKS_RISIKO_BANJIRBANDANG_JBTBPJ/MapServer",
      layerId: 0,
      serviceType: "MapServer",
    },
    {
      key: "bnpb_risiko_abrasi",
      name: "Risiko Abrasi",
      group: "Risiko",
      url: "https://gis.bnpb.go.id/server/rest/services/inarisk/layer_risiko_gelombang_ekstrim_dan_abrasi/ImageServer",
      layerId: 0,
      serviceType: "ImageServer",
    },
    {
      key: "bnpb_risiko_longsor",
      name: "Risiko Longsor",
      group: "Risiko",
      url: "https://gis.bnpb.go.id/server/rest/services/inarisk/INDEKS_RISIKO_TANAHLONGSOR_JBTBPJ/MapServer",
      layerId: 0,
      serviceType: "MapServer",
    },
    {
      key: "bnpb_risiko_karhutla",
      name: "Risiko Karhutla",
      group: "Risiko",
      url: "https://gis.bnpb.go.id/server/rest/services/inarisk/layer_risiko_kebakaran_hutan_dan_lahan/ImageServer",
      layerId: 0,
      serviceType: "ImageServer",
    },
    {
      key: "bnpb_bahaya_banjir",
      name: "Bahaya Banjir",
      group: "Bahaya",
      url: "https://gis.bnpb.go.id/server/rest/services/inarisk/INDEKS_BAHAYA_BANJIR_JBTBPJ/MapServer",
      layerId: 0,
      serviceType: "MapServer",
    },
    {
      key: "bnpb_bahaya_kekeringan",
      name: "Bahaya Kekeringan",
      group: "Bahaya",
      url: "https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_kekeringan_30/MapServer",
      layerId: 0,
      serviceType: "MapServer",
    },
    {
      key: "bnpb_bahaya_banjir_bandang",
      name: "Bahaya Banjir Bandang",
      group: "Bahaya",
      url: "https://gis.bnpb.go.id/server/rest/services/inarisk/INDEKS_BAHAYA_BANJIRBANDANG_JBTBPJ/MapServer",
      layerId: 0,
      serviceType: "MapServer",
    },
    {
      key: "bnpb_bahaya_abrasi",
      name: "Bahaya Abrasi",
      group: "Bahaya",
      url: "https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_gelombang_ekstrim_dan_abrasi_30/MapServer",
      layerId: 0,
      serviceType: "MapServer",
    },
    {
      key: "bnpb_bahaya_longsor",
      name: "Bahaya Longsor",
      group: "Bahaya",
      url: "https://gis.bnpb.go.id/server/rest/services/inarisk/INDEKS_BAHAYA_TANAHLONGSOR_JBTBPJ/MapServer",
      layerId: 0,
      serviceType: "MapServer",
    },
  ] as const;

  type BnpbIdentifyResult = {
    service: string;
    url: string;
    status: "value" | "nodata" | "out_of_coverage" | "error";
    value?: string;
    rawValue?: any;
    message?: string;
    debug?: any;
  };

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

  const [bnpbIdentifyPopup, setBnpbIdentifyPopup] = useState<{
    open: boolean;
    loading: boolean;
    error: string;
    latitude: number | null;
    longitude: number | null;
    results: BnpbIdentifyResult[];
  }>({
    open: false,
    loading: false,
    error: "",
    latitude: null,
    longitude: null,
    results: [],
  });
  const navigate = useNavigate();
  const [showMenuDropdown, setShowMenuDropdown] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set());
  const [sigapKawasanHutanLegend, setSigapKawasanHutanLegend] = useState<
    Array<{
      label: string;
      imageData?: string;
      contentType?: string;
      color?: string;
      values?: string[];
    }>
  >([]);
  const [sigapKawasanHutanLegendLoading, setSigapKawasanHutanLegendLoading] =
    useState(false);
  const [sigapKawasanHutanSearch, setSigapKawasanHutanSearch] = useState("");
  const [selectedSigapKawasanHutanClass, setSelectedSigapKawasanHutanClass] =
    useState<string | null>(null);
  const selectedSigapKawasanHutanClassRef = useRef<string | null>(null);

  useEffect(() => {
    selectedSigapKawasanHutanClassRef.current = selectedSigapKawasanHutanClass;
  }, [selectedSigapKawasanHutanClass]);
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
  const layerCacheRef = useRef<Map<string, any>>(new Map());
  const [hoveredLayerKey, setHoveredLayerKey] = useState<string | null>(null);
  const [hoveredLayerType, setHoveredLayerType] = useState<string | null>(null);
  const [hoveredLayerColor, setHoveredLayerColor] = useState<string | null>(
    null,
  );
  const [selectedAreas, setSelectedAreas] = useState<
    Array<{
      label: string;
      level: "provinsi" | "kabupaten" | "kecamatan" | "kelurahan";
      provinsi?: string;
      kab_kota?: string;
      kecamatan?: string;
      kel_desa?: string;
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

  // Warna untuk rawan longsor
  const rawanLongsorColors = {
    Tinggi: "#FF4500",
    "Sangat Rendah": "#90EE90",
    Menengah: "#FFA500",
    Rendah: "#FFFF00",
    Danau: "#1E90FF",
    "Danau Tapal Kuda": "#4169E1",
    "Danau/Situ": "#00BFFF",
    Waduk: "#4682B4",
    "Alur Aliran Bahan Rombakan": "#8B4513",
  };

  // Warna untuk rawan limpasan
  const rawanLimpasanColors = {
    Ekstrim: "#8B0000",
    Tinggi: "#FF0000",
    Rendah: "#FFFF00",
    Normal: "#90EE90",
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

  const getBnpbLayerConfig = (key: string) =>
    BNPB_INARISK_LAYERS.find((item) => item.key === key);

  // Nama layer yang dipakai UI/database -> key service BNPB.
  // Dengan mapping ini, toggle "risiko_banjir" tidak lagi jatuh ke
  // endpoint PostgreSQL /api/layers/.../geojson.
  const BNPB_TABLE_TO_KEY: Record<string, string> = {
    risiko_banjir: "bnpb_risiko_banjir",
    risiko_kekeringan: "bnpb_risiko_kekeringan",
    risiko_banjir_bandang: "bnpb_risiko_banjir_bandang",
    risiko_abrasi: "bnpb_risiko_abrasi",
    risiko_longsor: "bnpb_risiko_longsor",
    risiko_karhutla: "bnpb_risiko_karhutla",
    bahaya_banjir: "bnpb_bahaya_banjir",
    bahaya_kekeringan: "bnpb_bahaya_kekeringan",
    bahaya_banjir_bandang: "bnpb_bahaya_banjir_bandang",
    bahaya_abrasi: "bnpb_bahaya_abrasi",
    bahaya_longsor: "bnpb_bahaya_longsor",
  };

  const getBnpbKeyForTable = (tableName: string) =>
    BNPB_TABLE_TO_KEY[tableName] || null;

  const loadBnpbLayer = async (key: string) => {
    if (!mapInstanceRef.current || !window.L) return;
    const config = getBnpbLayerConfig(key);
    if (!config?.url) {
      setLayerError(`ℹ️ URL service BNPB untuk "${config?.name || key}" belum tersedia pada daftar sumber.`);
      setTimeout(() => setLayerError(""), 5000);
      return;
    }

    const map = mapInstanceRef.current;
    const requestId = (layerRequestSeqRef.current[key] || 0) + 1;
    layerRequestSeqRef.current[key] = requestId;

    try {
      setLoadingLayerNames((prev) => new Set([...prev, key]));
      setLayerError("");

      const bounds = map.getBounds();
      const south = bounds.getSouth();
      const west = bounds.getWest();
      const north = bounds.getNorth();
      const east = bounds.getEast();
      const zoom = map.getZoom();
      const size = map.getSize();

      // BNPB source tetap di server; browser menerima image dari backend proxy.
      // Bounds + zoom ikut dikirim sehingga setiap pan/zoom hanya meminta extent aktif.
      const params = new URLSearchParams({
        key,
        south: String(south),
        west: String(west),
        north: String(north),
        east: String(east),
        zoom: String(zoom),
        width: String(Math.min(Math.max(Math.round(size.x), 800), 1600)),
        height: String(Math.min(Math.max(Math.round(size.y), 600), 1200)),
      });
      const imageUrl = `${API_URL}/api/bnpb/layers/${encodeURIComponent(key)}/image?${params.toString()}`;
      const imageBounds: [[number, number], [number, number]] = [
        [south, west],
        [north, east],
      ];

      const previous = bnpbOverlayRefs.current[key];
      if (previous) safeRemoveMapLayer(previous);

      if (layerRequestSeqRef.current[key] !== requestId || mapInstanceRef.current !== map) return;

      const overlay = window.L.imageOverlay(imageUrl, imageBounds, {
        opacity: 0.58,
        interactive: false,
        className: "bnpb-inarisk-overlay",
      });
      if (!safeAddMapLayer(map, overlay)) return;

      bnpbOverlayRefs.current[key] = overlay;
      layerGroupsRef.current[key] = overlay;
      layerCacheRef.current.set(key, overlay);
      console.log(`✅ BNPB InaRISK aktif: ${config.name} | ${config.serviceType || "ArcGIS"} | zoom ${zoom}`);
    } catch (error: any) {
      console.error("❌ Error loading BNPB layer:", error);
      setLayerError(`❌ Gagal memuat ${config.name}: ${error?.message || "unknown error"}`);
      setTimeout(() => setLayerError(""), 6000);
    } finally {
      setLoadingLayerNames((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const removeBnpbLayer = (key: string) => {
    const overlay = bnpbOverlayRefs.current[key];
    if (overlay && mapInstanceRef.current) {
      try {
        mapInstanceRef.current.removeLayer(overlay);
      } catch {}
    }
    delete bnpbOverlayRefs.current[key];
    delete layerGroupsRef.current[key];
    layerCacheRef.current.delete(key);
  };

  // ======================================================
  // BNPB Identify — Raster-safe
  // BNPB MapServer yang kita pakai menggunakan EPSG:3395.
  // Leaflet memakai EPSG:4326. ArcGIS Identify mengharuskan
  // geometry + mapExtent konsisten dengan `sr`, jadi keduanya
  // dikonversi ke EPSG:3395 sebelum request.
  // ======================================================
  const WGS84_A = 6378137;
  const WGS84_E = 0.08181919084262149;

  const wgs84ToEpsg3395 = (latitude: number, longitude: number) => {
    const lat = Math.max(-89.999999, Math.min(89.999999, latitude));
    const lonRad = (longitude * Math.PI) / 180;
    const latRad = (lat * Math.PI) / 180;
    const sinLat = Math.sin(latRad);
    const x = WGS84_A * lonRad;
    const y =
      WGS84_A *
      Math.log(
        Math.tan(Math.PI / 4 + latRad / 2) *
          Math.pow(
            (1 - WGS84_E * sinLat) / (1 + WGS84_E * sinLat),
            WGS84_E / 2,
          ),
      );
    return { x, y };
  };

  const leafletBoundsToEpsg3395 = (bounds: any) => {
    const sw = wgs84ToEpsg3395(bounds.getSouth(), bounds.getWest());
    const ne = wgs84ToEpsg3395(bounds.getNorth(), bounds.getEast());
    return `${Math.min(sw.x, ne.x)},${Math.min(sw.y, ne.y)},${Math.max(sw.x, ne.x)},${Math.max(sw.y, ne.y)}`;
  };

  const getBnpbServiceMeta = async (url: string) => {
    const cached = bnpbServiceMetaRef.current.get(url);
    if (cached) return cached;

    const response = await fetch(`${url}?f=json`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Metadata HTTP ${response.status}`);
    const json = await response.json();
    if (json?.error)
      throw new Error(json.error.message || "Metadata BNPB gagal");
    bnpbServiceMetaRef.current.set(url, json);
    return json;
  };

  const pointInsideExtent3395 = (x: number, y: number, extent: any) => {
    if (!extent) return true;
    return (
      x >= Number(extent.xmin) &&
      x <= Number(extent.xmax) &&
      y >= Number(extent.ymin) &&
      y <= Number(extent.ymax)
    );
  };

  const normalizeBnpbRasterValue = (value: any) => {
    if (value === null || value === undefined || String(value).trim() === "")
      return null;
    const text = String(value).trim();
    if (/^(nodata|null|nan)$/i.test(text)) return null;
    return text;
  };

  const identifyBnpbAtPoint = async (latitude: number, longitude: number) => {
    const active = BNPB_INARISK_LAYERS.filter((item) => {
      const tableName = Object.keys(BNPB_TABLE_TO_KEY).find(
        (name) => BNPB_TABLE_TO_KEY[name] === item.key,
      );
      return (
        !!item.url &&
        (activeLayersRef.current.has(item.key) ||
          (!!tableName && activeLayersRef.current.has(tableName)))
      );
    });
    if (!active.length || !mapInstanceRef.current) {
      setBnpbIdentifyPopup((prev) => ({ ...prev, open: false }));
      return;
    }
    setBnpbIdentifyPopup({
      open: true,
      loading: true,
      error: "",
      latitude,
      longitude,
      results: [],
    });
    try {
      const map = mapInstanceRef.current;
      const bounds = map.getBounds();
      const size = map.getSize();
      const p = wgs84ToEpsg3395(latitude, longitude);
      const results: BnpbIdentifyResult[] = [];
      const offsets = [
        [0, 0],
        [120, 0],
        [-120, 0],
        [0, 120],
        [0, -120],
        [250, 0],
        [-250, 0],
        [0, 250],
        [0, -250],
      ];
      for (const config of active) {
        try {
          const meta = await getBnpbServiceMeta(config.url!);
          const ext = meta?.fullExtent;
          if (ext && !pointInsideExtent3395(p.x, p.y, ext)) {
            results.push({
              service: config.name,
              url: config.url!,
              status: "out_of_coverage",
              message: "Lokasi berada di luar cakupan layer BNPB ini.",
              debug: { point3395: p, fullExtent: ext },
            });
            continue;
          }
          let found: any = null,
            raw: any = null,
            lastDebug: any = null,
            successful = false;
          for (const [dx, dy] of offsets) {
            const q = new URLSearchParams({
              f: "json",
              geometry: `${p.x + dx},${p.y + dy}`,
              geometryType: "esriGeometryPoint",
              sr: "3395",
              layers: `all:${config.layerId}`,
              tolerance: "8",
              mapExtent: leafletBoundsToEpsg3395(bounds),
              imageDisplay: `${Math.max(size.x, 800)},${Math.max(size.y, 600)},96`,
              returnGeometry: "false",
            });
            const requestUrl = `${config.url}/identify?${q.toString()}`;
            const response = await fetch(requestUrl, {
              headers: { Accept: "application/json" },
              cache: "no-store",
            });
            const body = await response.text();
            if (!response.ok) {
              lastDebug = {
                offset: [dx, dy],
                httpStatus: response.status,
                requestUrl,
                responseText: body.slice(0, 4000),
              };
              continue;
            }
            let json: any;
            try {
              json = JSON.parse(body);
            } catch {
              lastDebug = {
                offset: [dx, dy],
                requestUrl,
                responseText: body.slice(0, 4000),
                parseError: true,
              };
              continue;
            }
            successful = true;
            const hits = Array.isArray(json?.results) ? json.results : [];
            const hit = hits.find(
              (h: any) => normalizeBnpbRasterValue(h?.value) !== null,
            );
            const value = normalizeBnpbRasterValue(hit?.value);
            lastDebug = {
              offset: [dx, dy],
              requestUrl,
              response: json,
              resultCount: hits.length,
              hits: hits.slice(0, 10),
            };
            if (json?.error) continue;
            if (value !== null) {
              found = value;
              raw = hit?.value;
              break;
            }
          }
          if (found !== null)
            results.push({
              service: config.name,
              url: config.url!,
              status: "value",
              value: String(found),
              rawValue: raw,
              debug: {
                samplingOffsetsMeters: offsets,
                lastResponse: lastDebug,
              },
            });
          else if (successful)
            results.push({
              service: config.name,
              url: config.url!,
              status: "nodata",
              message:
                "Semua titik sampling tidak mengembalikan nilai raster BNPB.",
              debug: {
                samplingOffsetsMeters: offsets,
                lastResponse: lastDebug,
              },
            });
          else
            results.push({
              service: config.name,
              url: config.url!,
              status: "error",
              message:
                "Tidak mendapat response Identify BNPB yang dapat dibaca.",
              debug: {
                samplingOffsetsMeters: offsets,
                lastResponse: lastDebug,
              },
            });
        } catch (e: any) {
          results.push({
            service: config.name,
            url: config.url!,
            status: "error",
            message: e?.message || "Gagal menghubungi service BNPB.",
            debug: { exception: String(e?.stack || e) },
          });
        }
      }
      setBnpbIdentifyPopup({
        open: true,
        loading: false,
        error: "",
        latitude,
        longitude,
        results,
      });
      console.groupCollapsed("🛰️ BNPB Identify V3");
      console.log("Point 4326", { latitude, longitude });
      console.log("Point 3395", p);
      console.log("Results", results);
      console.groupEnd();
    } catch (e: any) {
      setBnpbIdentifyPopup((prev) => ({
        ...prev,
        loading: false,
        error: e?.message || "Gagal melakukan Identify BNPB.",
      }));
    }
  };

  const handleBnpbToggle = async (key: string, checked: boolean) => {
    const config = getBnpbLayerConfig(key);
    if (!config?.url) {
      setLayerError(`ℹ️ ${config?.name || key}: endpoint BNPB belum tersedia.`);
      setTimeout(() => setLayerError(""), 5000);
      return;
    }
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
    if (checked) await loadBnpbLayer(key);
    else removeBnpbLayer(key);
  };

  const refreshActiveBnpbLayers = async () => {
    for (const config of BNPB_INARISK_LAYERS) {
      const tableName = Object.keys(BNPB_TABLE_TO_KEY).find(
        (name) => BNPB_TABLE_TO_KEY[name] === config.key,
      );
      if (
        config.url &&
        (activeLayers.has(config.key) ||
          (!!tableName && activeLayers.has(tableName)))
      ) {
        await loadBnpbLayer(config.key);
      }
    }
  };

  // Guard untuk mencegah race condition ketika beberapa request GeoJSON
  // selesai bersamaan (mis. toggle + pan/zoom). Hanya request terbaru
  // yang boleh mengganti layer di peta.
  const layerRequestSeqRef = useRef<Record<string, number>>({});

  const isLeafletMapUsable = (map: any) => {
    return !!(map && map._loaded && map._container && map._container._leaflet_id);
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
  // SIGAP Kementerian Kehutanan - Kawasan Hutan
  // ======================================================
  const SIGAP_KAWASAN_HUTAN_MAPSERVER =
    "https://geoportal.planologi.kehutanan.go.id/server/rest/services/Peta_Interaktif_2026/KWSHUTAN_AR_250K/MapServer";

  const wgs84ToWebMercator = (latitude: number, longitude: number) => {
    const R = 6378137;
    const maxLat = 85.0511287798;
    const lat = Math.max(-maxLat, Math.min(maxLat, latitude));
    const lon = Math.max(-180, Math.min(180, longitude));
    const x = R * (lon * Math.PI / 180);
    const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
    return { x, y };
  };

  const isSigapKawasanHutanLayer = (layerName: string) =>
    layerName === "kawasan_hutan" || layerName === "97";

  const loadSigapKawasanHutanLegend = async () => {
    setSigapKawasanHutanLegendLoading(true);
    try {
      const response = await fetch(
        `${SIGAP_KAWASAN_HUTAN_MAPSERVER}/legend?f=json`,
        { headers: { Accept: "application/json" } },
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const layer = Array.isArray(data?.layers)
        ? data.layers.find(
            (item: any) => String(item.layerId ?? item.id) === "0",
          ) || data.layers[0]
        : null;

      const legend = Array.isArray(layer?.legend) ? layer.legend : [];
      const normalized = legend
        .map((item: any) => {
          let color: string | undefined;
          if (Array.isArray(item?.color)) {
            const [r, g, b, a = 255] = item.color.map((v: any) => Number(v));
            const alpha = Math.max(0, Math.min(1, a / 255));
            color = `rgba(${r}, ${g}, ${b}, ${alpha})`;
          } else if (item?.color) {
            color = String(item.color);
          }

          const values = Array.isArray(item?.values)
            ? item.values.map((value: any) => String(value).trim()).filter(Boolean)
            : item?.value != null
              ? [String(item.value).trim()]
              : [];

          return {
            label: String(
              item?.label ?? values[0] ?? "Tidak berlabel",
            ).trim(),
            imageData: item?.imageData ? String(item.imageData) : undefined,
            contentType: item?.contentType
              ? String(item.contentType)
              : undefined,
            color,
            values,
          };
        })
        .filter((item: any) => item.label);

      setSigapKawasanHutanLegend(normalized);
      console.log("SIGAP Kawasan Hutan legend loaded", {
        count: normalized.length,
        labels: normalized.map((item) => item.label),
      });
    } catch (error) {
      console.warn(
        "SIGAP legend tidak dapat dimuat; legend peta tetap aktif:",
        error,
      );
      setSigapKawasanHutanLegend([]);
    } finally {
      setSigapKawasanHutanLegendLoading(false);
    }
  };

  const loadSigapKawasanHutan = async (
    customBounds?: [[number, number], [number, number]],
    layerName = "kawasan_hutan",
    filterValue?: string | null,
  ) => {
    if (!mapInstanceRef.current || !window.L) {
      console.log("SIGAP: map belum siap");
      return;
    }

    const tableName = layerName;
    const mapAtRequest = mapInstanceRef.current;
    const requestId = (layerRequestSeqRef.current[tableName] || 0) + 1;
    layerRequestSeqRef.current[tableName] = requestId;

    try {
      setIsLoadingLayer(true);
      setLoadingLayerNames((prev) => new Set([...prev, tableName]));
      setLayerError("");

      const viewport = mapAtRequest.getBounds();
      const viewportBounds: [[number, number], [number, number]] = [
        [viewport.getSouth(), viewport.getWest()],
        [viewport.getNorth(), viewport.getEast()],
      ];
      const boundsToUse = customBounds || viewportBounds;
      const [[south, west], [north, east]] = boundsToUse;

      const sw = wgs84ToWebMercator(south, west);
      const ne = wgs84ToWebMercator(north, east);
      const bbox = [
        Math.min(sw.x, ne.x),
        Math.min(sw.y, ne.y),
        Math.max(sw.x, ne.x),
        Math.max(sw.y, ne.y),
      ].map((value) => value.toFixed(3)).join(",");

      const size = mapAtRequest.getSize();
      const width = Math.min(Math.max(Math.round(size.x), 800), 1800);
      const height = Math.min(Math.max(Math.round(size.y), 600), 1400);

      const params = new URLSearchParams({
        bbox,
        bboxSR: "102100",
        imageSR: "102100",
        size: `${width},${height}`,
        dpi: "96",
        format: "png32",
        transparent: "true",
        layers: "show:0",
        f: "image",
      });

      if (filterValue) {
        const safeValue = String(filterValue).replace(/'/g, "''");
        params.set("layerDefs", `0:FUNGSIKWS='${safeValue}'`);
      }

      const imageUrl = `${SIGAP_KAWASAN_HUTAN_MAPSERVER}/export?${params.toString()}`;
      const imageBounds: [[number, number], [number, number]] = [
        [south, west],
        [north, east],
      ];

      if (layerGroupsRef.current[tableName]) {
        safeRemoveMapLayer(layerGroupsRef.current[tableName]);
        delete layerGroupsRef.current[tableName];
      }

      if (
        layerRequestSeqRef.current[tableName] !== requestId ||
        mapInstanceRef.current !== mapAtRequest ||
        !isLeafletMapUsable(mapAtRequest)
      ) {
        return;
      }

      const overlay = window.L.imageOverlay(imageUrl, imageBounds, {
        opacity: 0.72,
        interactive: false,
        className: "sigap-kawasan-hutan-overlay",
        zIndex: 430,
      });

      if (!safeAddMapLayer(mapAtRequest, overlay)) {
        throw new Error("Leaflet gagal menambahkan layer SIGAP Kawasan Hutan");
      }

      layerGroupsRef.current[tableName] = overlay;
      layerCacheRef.current.set(tableName, overlay);
      void loadSigapKawasanHutanLegend();
      console.log("SIGAP Kawasan Hutan aktif", { bbox, imageSize: `${width}x${height}` });
    } catch (error: any) {
      console.error("Error loading SIGAP Kawasan Hutan:", error);
      setLayerError(`Gagal memuat Kawasan Hutan SIGAP: ${error?.message || "unknown error"}`);
      setTimeout(() => setLayerError(""), 6000);
    } finally {
      setLoadingLayerNames((prev) => {
        const next = new Set(prev);
        next.delete(tableName);
        return next;
      });
      setIsLoadingLayer(false);
    }
  };

  const handleSigapKawasanHutanClassClick = async (item: {
    label: string;
    values?: string[];
  }) => {
    const value = item.values?.[0] || null;
    const activeSigapLayer = Array.from(activeLayersRef.current).find((layerName) =>
      isSigapKawasanHutanLayer(layerName),
    );
    if (!activeSigapLayer) return;

    if (selectedSigapKawasanHutanClassRef.current === value && value) {
      setSelectedSigapKawasanHutanClass(null);
      selectedSigapKawasanHutanClassRef.current = null;
      await loadSigapKawasanHutan(undefined, activeSigapLayer, null);
      return;
    }

    setSelectedSigapKawasanHutanClass(value);
    selectedSigapKawasanHutanClassRef.current = value;
    await loadSigapKawasanHutan(undefined, activeSigapLayer, value);
  };

  const clearSigapKawasanHutanClassFilter = async () => {
    setSelectedSigapKawasanHutanClass(null);
    selectedSigapKawasanHutanClassRef.current = null;
    const activeSigapLayer = Array.from(activeLayersRef.current).find((layerName) =>
      isSigapKawasanHutanLayer(layerName),
    );
    if (activeSigapLayer) {
      await loadSigapKawasanHutan(undefined, activeSigapLayer, null);
    }
  };

  const refreshActiveSigapLayers = async () => {
    const activeSigapLayer = Array.from(activeLayersRef.current).find((layerName) =>
      isSigapKawasanHutanLayer(layerName),
    );
    if (activeSigapLayer) {
      await loadSigapKawasanHutan(undefined, activeSigapLayer, selectedSigapKawasanHutanClassRef.current);
    }
  };

  // Normalisasi ID layer UI -> nama layer backend.
  // KHDTK di menu menggunakan ID 103, sedangkan endpoint backend menggunakan "khdtk".
  const normalizeLayerApiName = (tableName: string): string => {
    const aliases: Record<string, string> = {
      "103": "khdtk",
    };
    return aliases[tableName] || tableName;
  };

  const loadLayerInBounds = async (
    tableName: string,
    customBounds?: [[number, number], [number, number]],
  ) => {
    if (!mapInstanceRef.current || !window.L) {
      console.log("Map not ready");
      return;
    }

    const originalLayerName = tableName;
    const apiLayerName = normalizeLayerApiName(tableName);
    if (apiLayerName !== tableName) {
      console.log(`🔗 Layer alias: ${tableName} -> ${apiLayerName}`);
    }

    if (isSigapKawasanHutanLayer(tableName)) {
      await loadSigapKawasanHutan(customBounds, tableName);
      return;
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
      const boundsToUse = customBounds || currentBounds || viewportBounds;

      if (boundsToUse) {
        const [[minLat, minLng], [maxLat, maxLng]] = boundsToUse;
        boundsString = `${minLat},${minLng},${maxLat},${maxLng}`;
      } else {
        boundsString = "-11,95,6,141";
      }

      // Build URL dengan filter administrasi/DAS
      let url = `${API_URL}/api/layers/${apiLayerName}/geojson?bounds=${encodeURIComponent(boundsString)}&zoom=${zoom}`;

      // Prioritas: DAS > Administrasi
      if (selectedDas.length > 0) {
        const dasNames = selectedDas.map((d) => d.nama_das);
        url += `&dasFilter=${encodeURIComponent(JSON.stringify(dasNames))}`;
        console.log(
          "🔄 Loading layer with DAS filtering:",
          tableName,
          dasNames,
        );
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
        console.log(
          "🔄 Loading layer with admin filtering:",
          tableName,
          adminLevel,
          adminNames,
        );
      }

      console.log(`🔄 Memuat layer: ${tableName}...`);

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const geojsonData = await response.json();

      // Request ini sudah tidak relevan; jangan sentuh layer/map dengan data lama.
      if (
        layerRequestSeqRef.current[tableName] !== requestId ||
        mapInstanceRef.current !== mapAtRequest ||
        !isLeafletMapUsable(mapAtRequest)
      ) {
        console.log(`⏭️ Abaikan response lama/stale untuk ${tableName} (request #${requestId})`);
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
        console.warn("ℹ️ No features found for:", tableName);
        setLayerError(`ℹ️ Tidak ada data "${tableName}" di area yang dipilih.`);
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
        const keteranganMap = new Map<string, number>();

        console.log(
          "🔍 [RAWAN EROSI] Processing features:",
          geojsonData.features.length,
        );

        if (geojsonData.features.length > 0) {
          console.log(
            "📋 [RAWAN EROSI] Sample feature properties:",
            geojsonData.features[0].properties,
          );
        }

        geojsonData.features.forEach((feature: any) => {
          const kls_a = feature.properties.kls_a || "";
          const keterangan = feature.properties.keterangan || "";
          const n_a = parseFloat(feature.properties.n_a) || 0;

          if (keterangan && kls_a) {
            // Sum n_a berdasarkan keterangan yang sama
            keteranganMap.set(
              keterangan,
              (keteranganMap.get(keterangan) || 0) + n_a,
            );
          }
        });

        console.log(
          "📊 [RAWAN EROSI] Keterangan found:",
          Array.from(keteranganMap.keys()),
        );
        console.log(
          "📊 [RAWAN EROSI] Sum n_a per keterangan:",
          Array.from(keteranganMap.entries()),
        );

        const erosiArray = Array.from(keteranganMap.entries()).map(
          ([keterangan, n_a]) => {
            const color = rawanErosiColors[keterangan] || "#808080";
            console.log(
              `🎨 [RAWAN EROSI] Keterangan: "${keterangan}" -> n_a: ${n_a.toFixed(2)} -> Color: ${color}`,
            );

            return {
              tingkat: keterangan,
              luas_ha: n_a, // Menggunakan n_a sebagai luas
              color: color,
            };
          },
        );

        // Sort berdasarkan urutan severity (dari tinggi ke rendah)
        const keteranganOrder = [
          "> 480 Ton/Ha/Tahun",
          "> 180 - 480 Ton/Ha/Tahun",
          "> 60 - 180 Ton/Ha/Tahun",
          "> 15 - 60 Ton/Ha/Tahun",
          "<= 15 Ton/Ha/Tahun",
        ];

        erosiArray.sort((a, b) => {
          return (
            keteranganOrder.indexOf(a.tingkat) -
            keteranganOrder.indexOf(b.tingkat)
          );
        });

        console.log("✅ [RAWAN EROSI] Final data:", erosiArray);

        setRawanErosiData(erosiArray);

        erosiArray.forEach((item) => {
          colorMap.set(item.tingkat, item.color!);
          colorMappingRef.current.rawanErosi.set(item.tingkat, item.color!);
        });
      } else if (tableName === "rawan_longsor") {
        const unsurMap = new Map<string, number>();

        geojsonData.features.forEach((feature: any) => {
          const unsur = feature.properties.unsur || "";
          const luas = parseFloat(feature.properties.shape_area) || 0;

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
          const luas = parseFloat(feature.properties.shape_leng) || 0;

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
          const luas = parseFloat(feature.properties.shape_area) || 0;
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
          const luas = parseFloat(feature.properties.shape_area) || 0;
          if (kelas) kelasMap.set(kelas, (kelasMap.get(kelas) || 0) + luas);
        });
        const order = ["Tinggi", "Rendah"];
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
        setBahayaAbrasiData(arr);
        arr.forEach((item) => {
          colorMap.set(item.kelas, item.color!);
          colorMappingRef.current.bahayaAbrasi.set(item.kelas, item.color!);
        });
      } else if (tableName === "bahaya_banjir") {
        const kelasMap = new Map<string, number>();
        geojsonData.features.forEach((feature: any) => {
          const kelas = feature.properties.kelas || "";
          const luas = parseFloat(feature.properties.shape_area) || 0;
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
          const luas = parseFloat(feature.properties.shape_area) || 0;
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
          color: getRandomColor(periode, periodeColorMap),
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
          color: getRandomColor(periode, periodeColorMap),
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
          color: getRandomColor(periode, periodeColorMap),
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
          color: getRandomColor(periode, periodeColorMap),
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
          color: getRandomColor(periode, periodeColorMap),
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
          const fungsikws = String(feature.properties.fungsikws ?? "");
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
        const risikoColorMap = new Map<string, string>();
        geojsonData.features.forEach((feature: any) => {
          const kelas = feature.properties.kelas || "";
          const luas = parseFloat(feature.properties.shape_leng) || 0;
          if (kelas) kelasMap.set(kelas, (kelasMap.get(kelas) || 0) + luas);
        });
        const arr = Array.from(kelasMap.entries()).map(([kelas, luas]) => ({
          kelas,
          luas,
          color: getRandomColor(kelas, risikoColorMap),
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

      if (tableName === "tutupan_lahan") {
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
          const fungsikws = String(feature.properties.fungsikws ?? "");
          const fillColor = colorMap.get(fungsikws) || "#808080";
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

      // Buat layer group
      const layerGroup = window.L.geoJSON(geojsonData, {
        pane: "overlayPane",
        style: styleFunction,
        pointToLayer: function (feature, latlng) {
          const tableColor = getColorForTable(tableName);
          return window.L.circleMarker(latlng, {
            radius: zoom > 10 ? 6 : 4,
            fillColor: tableColor,
            color: "#000",
            weight: 1,
            opacity: 1,
            fillOpacity: 0.7,
          });
        },
        onEachFeature: function (feature, layer) {
          layer.on("click", (event: any) => {
            if (event?.originalEvent?.stopPropagation) event.originalEvent.stopPropagation();
            openEnterpriseIdentify(feature, tableName, event?.latlng, "SIMITI GIS");
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

        const correspondingTab = tabMapping[tableName];

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

      layerGroupsRef.current[tableName] = layerGroup;

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

  const searchAreas = async (query: string) => {
    if (query.trim().length < 2) {
      setAreaSearchResults([]);
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/areas/search?query=${encodeURIComponent(query)}&level=${adminLevel}`,
      );
      const data = await response.json();
      setAreaSearchResults(data);
      setShowAreaSearchDropdown(true);
    } catch (error) {
      console.error("Error searching areas:", error);
      setAreaSearchResults([]);
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
      if (layerGroup) {
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

              if (hoveredLayerType === "tutupan_lahan") {
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
                    String(layer.feature.properties.fungsikws ?? ""),
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
                  colorMappingRef.current[refKey]?.get(
                    layer.feature.properties.kelas || "",
                  ) || "#808080";
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

    // Jika ada yang di-hover saat ini, highlight layer tersebut
    if (
      hoveredLayerKey &&
      hoveredLayerType &&
      hoveredLayerColor &&
      dataLayers.includes(hoveredLayerType)
    ) {
      const layerGroup = layerGroupsRef.current[hoveredLayerType];
      if (layerGroup) {
        layerGroup.eachLayer((layer: any) => {
          if (layer.feature && layer.setStyle) {
            let shouldHighlight = false;

            // Tentukan apakah layer ini yang harus di-highlight
            if (hoveredLayerType === "tutupan_lahan") {
              shouldHighlight =
                String(layer.feature.properties.pl2024_id) === hoveredLayerKey;
            } else if (hoveredLayerType === "penutupan_lahan_2024") {
              shouldHighlight =
                String(layer.feature.properties.pl2024_id) === hoveredLayerKey;
            } else if (hoveredLayerType === "pl2024") {
              shouldHighlight =
                String(layer.feature.properties.pl2024_id) === hoveredLayerKey;
            } else if (hoveredLayerType === "geologi") {
              const key = `${layer.feature.properties.namobj || ""}|${layer.feature.properties.umurobj || ""}`;
              shouldHighlight = key === hoveredLayerKey;
            } else if (hoveredLayerType === "jenis_tanah") {
              shouldHighlight =
                layer.feature.properties.jntnh1 === hoveredLayerKey;
            } else if (hoveredLayerType === "lahan_kritis") {
              shouldHighlight =
                layer.feature.properties.kritis === hoveredLayerKey;
            } else if (hoveredLayerType === "rawan_erosi") {
              shouldHighlight =
                layer.feature.properties.keterangan === hoveredLayerKey;
            } else if (hoveredLayerType === "rawan_longsor") {
              shouldHighlight =
                layer.feature.properties.unsur === hoveredLayerKey;
            } else if (hoveredLayerType === "rawan_limpasan") {
              shouldHighlight =
                layer.feature.properties.limpasan === hoveredLayerKey;
            } else if (hoveredLayerType === "rawan_karhutla") {
              shouldHighlight =
                layer.feature.properties.kelas === hoveredLayerKey;
            } else if (hoveredLayerType === "bahaya_kekeringan") {
              shouldHighlight =
                layer.feature.properties.kelas === hoveredLayerKey;
            } else if (
              hoveredLayerType === "bahaya_abrasi_dan_gelombang_ekstrim"
            ) {
              shouldHighlight =
                layer.feature.properties.kelas === hoveredLayerKey;
            } else if (hoveredLayerType === "bahaya_banjir") {
              shouldHighlight =
                layer.feature.properties.kelas === hoveredLayerKey;
            } else if (hoveredLayerType === "bahaya_banjir_bandang") {
              shouldHighlight =
                layer.feature.properties.kelas === hoveredLayerKey;
            } else if (hoveredLayerType === "dta_danau") {
              shouldHighlight =
                layer.feature.properties.tipe_danau === hoveredLayerKey;
            } else if (hoveredLayerType === "rehabilitasi_das") {
              shouldHighlight =
                layer.feature.properties.bpdas === hoveredLayerKey;
            } else if (hoveredLayerType === "rehabilitasi_hutan") {
              shouldHighlight =
                String(layer.feature.properties.jenis_tana) === hoveredLayerKey;
            } else if (hoveredLayerType === "karhutla_2021") {
              shouldHighlight =
                String(layer.feature.properties.periode) === hoveredLayerKey;
            } else if (hoveredLayerType === "karhutla_2022") {
              shouldHighlight =
                String(layer.feature.properties.periode) === hoveredLayerKey;
            } else if (hoveredLayerType === "karhutla_2023") {
              shouldHighlight =
                String(layer.feature.properties.periode) === hoveredLayerKey;
            } else if (hoveredLayerType === "karhutla_2024") {
              shouldHighlight =
                String(layer.feature.properties.periode) === hoveredLayerKey;
            } else if (hoveredLayerType === "karhutla_2025") {
              shouldHighlight =
                String(layer.feature.properties.periode) === hoveredLayerKey;
            } else if (hoveredLayerType === "kawasan_hutan") {
              shouldHighlight =
                String(layer.feature.properties.fungsikws ?? "") ===
                hoveredLayerKey;
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
              shouldHighlight =
                layer.feature.properties.kelas === hoveredLayerKey;
            } else if (hoveredLayerType === "khdtk") {
              shouldHighlight =
                layer.feature.properties.namobj === hoveredLayerKey;
            } else if (INFRA_IDS.includes(hoveredLayerType as any)) {
              const infraLayer = INFRA_LAYERS.find(
                (l) => l.id === hoveredLayerType,
              );
              const nameKey = infraLayer?.cols[0].k || "nama_infra";
              shouldHighlight =
                String(layer.feature.properties[nameKey] ?? "") ===
                hoveredLayerKey;
            }

            if (shouldHighlight) {
              const currentZoom = mapInstanceRef.current
                ? mapInstanceRef.current.getZoom()
                : 10;
              if (INFRA_IDS.includes(hoveredLayerType as any)) {
                // Point/circleMarker highlight
                layer.setStyle({
                  radius: currentZoom > 10 ? 10 : 8,
                  fillColor: hoveredLayerColor,
                  color: "#fff",
                  weight: 2,
                  opacity: 1,
                  fillOpacity: 1,
                });
              } else {
                // Polygon highlight
                layer.setStyle({
                  color: hoveredLayerColor,
                  weight: 5,
                  opacity: 1,
                  fillColor: hoveredLayerColor,
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
  }, [hoveredLayerKey, hoveredLayerType, hoveredLayerColor]);

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
          `${API_URL}/api/kejadian/by-year/${metadata.year}?bounds=${boundsString}${dasFilterParam}${categoryParam}`,
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

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
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
        safeAddMapLayer(mapInstanceRef.current, layerGroupsRef.current[layerName]);
        return;
      }

      // Function untuk create custom icon berdasarkan category
      const createKejadianIcon = (category: string) => {
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
        } else if (category === "Kebakaran Hutan dan Kekeringan") {
          bgColor = "#ef4444"; // red
          hoverColor = "#f59e0b"; // hover orange (dari longsor)
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
          </style>
          <div class="marker-container marker-container-kejadian-${type}" style="position: relative; width: 44px; height: 44px; cursor: pointer;">
            <svg class="marker-circle" width="44" height="44" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">
              <circle class="marker-bg" cx="22" cy="22" r="20" stroke="white" stroke-width="3" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));"/>
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
          icon: createKejadianIcon(props.category),
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
            { type: "Feature", geometry: { type: "Point", coordinates: [inc.longitude, inc.latitude] }, properties: inc },
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
  // Menggunakan Nominatim/OpenStreetMap agar pencarian tetap bisa dipakai tanpa endpoint backend tambahan.
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

  // Debounced search
  const debouncedSearch = useRef<NodeJS.Timeout>();
  const handleAreaSearchChange = (value: string) => {
    setAreaSearchQuery(value);

    if (debouncedSearch.current) {
      clearTimeout(debouncedSearch.current);
    }

    debouncedSearch.current = setTimeout(() => {
      searchAreas(value);
    }, 300);
  };

  const searchDas = async (query: string) => {
    if (query.trim().length < 2) {
      setDasSearchResults([]);
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/das/search?query=${encodeURIComponent(query)}`,
      );
      const data = await response.json();
      setDasSearchResults(data);
      setShowDasSearchDropdown(true);
    } catch (error) {
      console.error("Error searching DAS:", error);
      setDasSearchResults([]);
    }
  };

  // Debounced search untuk DAS
  const debouncedDasSearch = useRef<NodeJS.Timeout>();
  const handleDasSearchChange = (value: string) => {
    setDasSearchQuery(value);

    if (debouncedDasSearch.current) {
      clearTimeout(debouncedDasSearch.current);
    }

    debouncedDasSearch.current = setTimeout(() => {
      searchDas(value);
    }, 300);
  };

  // Function untuk select DAS
  const handleDasSelect = (das: any) => {
    const isAlreadySelected = selectedDas.some(
      (d) => d.nama_das === das.nama_das,
    );

    if (!isAlreadySelected) {
      const newSelectedDas = [...selectedDas, das];
      setSelectedDas(newSelectedDas);

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
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([-2.5, 118.0], 5);
      }
    }
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
        setCurrentBounds(data.bounds);
        mapInstanceRef.current.fitBounds(data.bounds, { padding: [50, 50] });

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
  const handleAreaSelect = (area: any) => {
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

      // TAMBAHAN: Render admin boundary langsung dengan unique key
      if (area.geom && mapInstanceRef.current && window.L) {
        console.log("✅ Rendering admin boundary for:", area.label);

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
                color: "#ef4444",
                weight: 3,
                opacity: 0.8,
                fillColor: "#fee2e2",
                fillOpacity: 0.1,
              },
            },
          );

          geoJsonLayer.addTo(mapInstanceRef.current);
          layerGroupsRef.current[boundaryKey] = geoJsonLayer;

          console.log("✅ Admin boundary rendered with key:", boundaryKey);
        } catch (error) {
          console.error("❌ Error rendering admin boundary:", error);
        }
      } else {
        console.log(
          "❌ Cannot render admin boundary - geom missing or map not ready",
        );
      }

      updateMapBounds(newSelectedAreas);
    }

    setAreaSearchQuery("");
    setAreaSearchResults([]);
    setShowAreaSearchDropdown(false);
  };

  // Function untuk remove selected area
  const handleRemoveArea = async (index: number) => {
    const removedArea = selectedAreas[index];
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
      await updateMapBounds(newSelectedAreas);
    } else {
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
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([-2.5, 118.0], 5);
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
        setCurrentBounds(data.bounds);
        mapInstanceRef.current.fitBounds(data.bounds, { padding: [50, 50] });

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
          headers: { "Content-Type": "application/json" },
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

      console.log("Grouped available layers:", grouped);
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
    console.log(
      "Toggle layer clicked:",
      tableName,
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

    // 11 layer BNPB harus selalu lewat proxy ArcGIS BNPB, bukan PostgreSQL lokal.
    const bnpbKey = getBnpbKeyForTable(tableName);
    if (bnpbKey) {
      if (isChecked) {
        setActiveLayers((prev) => new Set([...prev, tableName]));
        await loadBnpbLayer(bnpbKey);
      } else {
        layerRequestSeqRef.current[bnpbKey] =
          (layerRequestSeqRef.current[bnpbKey] || 0) + 1;
        setActiveLayers((prev) => {
          const next = new Set(prev);
          next.delete(tableName);
          next.delete(bnpbKey);
          return next;
        });
        removeBnpbLayer(bnpbKey);
      }
      return;
    }

    if (isChecked) {
      // Tambahkan layer ke active layers
      setActiveLayers((prev) => new Set([...prev, tableName]));

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
    } else {
      const apiLayerName = normalizeLayerApiName(tableName);
      layerRequestSeqRef.current[tableName] =
        (layerRequestSeqRef.current[tableName] || 0) + 1;
      if (apiLayerName !== tableName) {
        layerRequestSeqRef.current[apiLayerName] =
          (layerRequestSeqRef.current[apiLayerName] || 0) + 1;
      }

      if (isSigapKawasanHutanLayer(tableName)) {
        setSigapKawasanHutanLegend([]);
        setSigapKawasanHutanSearch("");
        setSelectedSigapKawasanHutanClass(null);
        selectedSigapKawasanHutanClassRef.current = null;
      }

      // Hapus layer dari active layers DULU
      setActiveLayers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(tableName);
        newSet.delete(apiLayerName);
        console.log("Updated active layers after removal:", Array.from(newSet));
        return newSet;
      });

      // Hapus layer dari map menggunakan nama backend yang sudah dinormalisasi.
      console.log("Removing layer from map:", tableName, "api:", apiLayerName);
      if (layerGroupsRef.current[apiLayerName] && mapInstanceRef.current) {
        safeRemoveMapLayer(layerGroupsRef.current[apiLayerName]);
        delete layerGroupsRef.current[apiLayerName];
        console.log("Layer removed from map");
      } else if (layerGroupsRef.current[tableName] && mapInstanceRef.current) {
        safeRemoveMapLayer(layerGroupsRef.current[tableName]);
        delete layerGroupsRef.current[tableName];
        console.log("Layer removed from map");

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

        if (tableName === "penutupan_lahan_2024") {
          setPenutupanLahan2024Data([]);
        }

        if (tableName === "pl2024") {
          setPL2024Data([]);
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
        if (tableName === "bahaya_kekeringan") setBahayaKekeringanData([]);
        if (tableName === "bahaya_abrasi_dan_gelombang_ekstrim")
          setBahayaAbrasiData([]);
        if (tableName === "bahaya_banjir") setBahayaBanjirData([]);
        if (tableName === "bahaya_banjir_bandang")
          setBahayaBanjirBandangData([]);
        if (tableName === "dta_danau") setDtaDanauData([]);
        if (tableName === "rehabilitasi_das") setRehabilitasiDasData([]);
        if (tableName === "rehabilitasi_hutan") setRehabilitasiHutanData([]);
        if (tableName === "restorasi_gambut") setRestorasiGambutData([]);
        if (tableName === "penerapan_teknik_kta") setPenerapanTeknikKtaData([]);
        if (tableName === "karhutla_2021") setKebakaran2021Data([]);
        if (tableName === "karhutla_2022") setKebakaran2022Data([]);
        if (tableName === "karhutla_2023") setKebakaran2023Data([]);
        if (tableName === "karhutla_2024") setKebakaran2024Data([]);
        if (tableName === "karhutla_2025") setKebakaran2025Data([]);
        if (isSigapKawasanHutanLayer(tableName)) setKawasanHutanData([]);
        if (
          [
            "risiko_banjir",
            "risiko_banjir_bandang",
            "risiko_kekeringan",
            "risiko_abrasi",
            "risiko_longsor",
            "risiko_karhutla",
          ].includes(tableName)
        ) {
          setRisikoData((prev) => ({ ...prev, [tableName]: [] }));
        }
        if (tableName === "khdtk") setKhdtkData([]);
        if (INFRA_IDS.includes(tableName as any)) {
          setInfraData((prev) => ({ ...prev, [tableName]: [] }));
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
    const layerGroup = layerGroupsRef.current[layerId];
    if (!layerGroup) return;
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
      let color = "#3b82f6";
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
        color = cm.kawasanHutan.get(String(p.fungsikws ?? "")) || "#808080";
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

      layer.setStyle({
        color,
        weight: zoom > 10 ? 2 : 1,
        opacity: 0.8,
        fillColor: color,
        fillOpacity: zoom > 10 ? 0.4 : 0.3,
      });
    });
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
    fetchLayers();

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
      const response = await fetch(`${API_URL}/api/layers`);
      const data = await response.json();

      console.log("Fetched layers data:", data);

      setLayerData(data);

      // Jika ada bounds yang dipilih, filter layers
      if (currentBounds) {
        checkLayerAvailability(currentBounds);
      } else {
        // Jika tidak ada bounds, tampilkan semua layer termasuk kejadian
        setAvailableLayers(data);
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

      // Jangan pernah membuat Leaflet map kedua
      if (mapInstanceRef.current) {
        console.log("🗺️ Leaflet map sudah ada, skip initialization");
        return;
      }

      // Proteksi tambahan terhadap container yang masih ditandai Leaflet
      const container = mapRef.current as HTMLElement & {
        _leaflet_id?: number;
      };

      if (container._leaflet_id) {
        console.log("🗺️ Map container sudah diinisialisasi Leaflet, skip");
        return;
      }

      const map = window.L.map(container).setView([-2.5, 118.0], 5);

      // Klik peta -> ambil cuaca titik tersebut dari Open-Meteo.
      map.on("click", (event: any) => {
        const { lat, lng } = event.latlng;
        const identified = identifyEnterpriseAtPoint(event.latlng);
        if (!identified) {
          fetchMapWeather(Number(lat), Number(lng));
          identifyBnpbAtPoint(Number(lat), Number(lng));
        }
      });

      map.on("moveend", () => {
        if (activeLayersRef.current) {
          // Overlay BNPB mengikuti extent peta setelah pan/zoom.
          void refreshActiveBnpbLayers();
          // Kawasan Hutan SIGAP mengikuti extent peta setelah pan/zoom.
          void refreshActiveSigapLayers();
        }
      });

      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      mapInstanceRef.current = map;
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

      // Cleanup BNPB overlays and map
      Object.keys(bnpbOverlayRefs.current).forEach((key) => {
        try {
          safeRemoveMapLayer(bnpbOverlayRefs.current[key]);
        } catch {}
      });
      bnpbOverlayRefs.current = {};

      // Invalidate semua request async yang masih berjalan sebelum map dihancurkan.
      Object.keys(layerRequestSeqRef.current).forEach((key) => {
        layerRequestSeqRef.current[key] += 1;
      });
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (error) {
          console.warn("⚠️ Leaflet cleanup warning:", error);
        }
        mapInstanceRef.current = null;
      }
    };
  }, []);

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
  }, [activeLayers, activeKejadianLayers, currentBounds, selectedDas]);

  const [activeTab, setActiveTab] = useState("administrasi");
  const [activeBottomTab, setActiveBottomTab] = useState("curahHujan");
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  // ======================================================
  // ENTERPRISE LAYER MANAGER
  // Search, active-only view, collapse groups, opacity,
  // zoom-to-layer and metadata actions. Existing layer logic
  // tetap dipakai; manager hanya menjadi control surface.
  // ======================================================
  const [enterpriseLayerSearch, setEnterpriseLayerSearch] = useState("");
  const [enterpriseShowActiveOnly, setEnterpriseShowActiveOnly] =
    useState(false);
  const [enterpriseCollapsedGroups, setEnterpriseCollapsedGroups] =
    useState<Set<string>>(new Set());
  const [enterpriseOpacity, setEnterpriseOpacity] = useState<Record<string, number>>({});
  const [enterpriseLegendVisible, setEnterpriseLegendVisible] = useState<Record<string, boolean>>({});
  const [enterpriseMetadataLayer, setEnterpriseMetadataLayer] = useState<any>(null);
  const [enterpriseSearchQuery, setEnterpriseSearchQuery] = useState("");
  const [enterpriseSearchResults, setEnterpriseSearchResults] = useState<Array<any>>([]);
  const [enterpriseSearchLoading, setEnterpriseSearchLoading] = useState(false);
  const [enterpriseSearchOpen, setEnterpriseSearchOpen] = useState(false);
  const enterpriseSearchHighlightRef = useRef<any>(null);
  const enterpriseSearchRequestRef = useRef(0);

  const enterpriseMatchesLayer = (layer: any) => {
    const id = String(layer?.id ?? layer?.name ?? "");
    const name = String(layer?.name ?? layer?.id ?? "");
    const q = enterpriseLayerSearch.trim().toLowerCase();
    if (enterpriseShowActiveOnly && !activeLayers.has(id) && !activeLayers.has(name)) return false;
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
    const layer = layerGroupsRef.current?.[layerName] ?? layerGroupsRef.current?.[normalizeLayerApiName(layerName)];
    if (!layer) return;
    try {
      if (typeof layer.setOpacity === "function") layer.setOpacity(opacity);
      if (typeof layer.eachLayer === "function") {
        layer.eachLayer((child: any) => {
          if (typeof child.setOpacity === "function") child.setOpacity(opacity);
          if (typeof child.setStyle === "function") child.setStyle({ opacity, fillOpacity: Math.min(opacity, 0.8) });
        });
      }
    } catch (error) {
      console.warn("Enterprise opacity update failed:", layerName, error);
    }
  };

  const enterpriseZoomToLayer = (layerName: string) => {
    const map = mapInstanceRef.current as any;
    const layer = layerGroupsRef.current?.[layerName] ?? layerGroupsRef.current?.[normalizeLayerApiName(layerName)];
    if (!map || !layer) return;
    try {
      if (typeof layer.getBounds === "function") {
        const bounds = layer.getBounds();
        if (bounds?.isValid?.()) { map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 }); return; }
      }
      let bounds: any = null;
      if (typeof layer.eachLayer === "function") {
        layer.eachLayer((child: any) => {
          if (typeof child.getBounds === "function") {
            const b = child.getBounds();
            if (b?.isValid?.()) bounds = bounds ? bounds.extend(b) : b;
          } else if (child.getLatLng) {
            const b = window.L.latLngBounds(child.getLatLng(), child.getLatLng());
            bounds = bounds ? bounds.extend(b) : b;
          }
        });
      }
      if (bounds?.isValid?.()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
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
      ...BNPB_INARISK_LAYERS.map((x) => ({ id: x.key, name: x.name, source: "BNPB InaRISK", url: x.url })),
    ] as any[];
    return all.find((x) => String(x.id) === layerName || String(x.name) === layerName) || { id: layerName, name: layerName };
  };

  const enterpriseActiveLayerEntries = Array.from(activeLayers).map((layerName) => ({
    name: layerName,
    label: formatTableName(enterpriseLayerMeta(layerName)?.name || layerName),
  }));

  // ======================================================
  // STEP 2 — ENTERPRISE SEARCH
  // Satu kotak pencarian untuk lokasi, layer, dan objek aktif.
  // Hasil -> FlyTo -> highlight -> Identify.
  // ======================================================
  const clearEnterpriseSearchHighlight = () => {
    const map = mapInstanceRef.current;
    const highlight = enterpriseSearchHighlightRef.current;
    if (highlight && map) {
      try { map.removeLayer(highlight); } catch {}
    }
    enterpriseSearchHighlightRef.current = null;
  };

  const highlightEnterpriseGeometry = (geometry: any, label?: string) => {
    const map = mapInstanceRef.current;
    if (!map || !window.L || !geometry) return null;
    clearEnterpriseSearchHighlight();
    try {
      const layer = window.L.geoJSON(
        { type: "Feature", geometry, properties: { enterpriseSearch: true, label } },
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
    const lng = Number(obj.longitude ?? obj.lon ?? obj.lng ?? obj.coordinates?.[0]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    map.flyTo([lat, lng], Math.max(map.getZoom(), 14), { duration: 0.9 });
    const group = layerName ? layerGroupsRef.current?.[layerName] : null;
    let target: any = null;
    if (group?.eachLayer) {
      group.eachLayer((child: any) => {
        if (target) return;
        const data = child?.incidentData || child?.feature?.properties;
        if (data && String(data.id ?? data.title ?? "") === String(obj.id ?? obj.title ?? "")) target = child;
      });
    }
    if (target?.openPopup) {
      window.setTimeout(() => target.openPopup(), 350);
    } else {
      window.L.popup({ closeButton: true, autoClose: true })
        .setLatLng([lat, lng])
        .setContent(`<div style="font-size:12px;line-height:1.45"><b>${String(obj.title || obj.name || obj.label || "Objek").replace(/[&<>"]/g, "")}</b>${obj.category ? `<br/><span>${String(obj.category).replace(/[&<>"]/g, "")}</span>` : ""}</div>`)
        .openOn(map);
    }
  };

  const enterpriseEscapeHtml = (value: any) =>
    String(value ?? "—").replace(/[&<>\"]/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
    } as any)[char] || char);

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
        const ax = Number(a[0]) * mLon, ay = Number(a[1]) * mLat;
        const bx = Number(b[0]) * mLon, by = Number(b[1]) * mLat;
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
    else if (geometry.type === "MultiPolygon") m2 = geometry.coordinates.reduce((sum: number, p: any) => sum + polygonArea(p), 0);
    return m2 > 0 ? m2 / 10000 : null;
  };

  const closeEnterpriseIdentify = () => {
    const map = mapInstanceRef.current;
    const highlight = enterpriseIdentifyHighlightRef.current;
    if (highlight && map) {
      try { map.removeLayer(highlight); } catch {}
    }
    enterpriseIdentifyHighlightRef.current = null;
    setEnterpriseIdentify((prev) => ({ ...prev, open: false }));
  };

  const openEnterpriseIdentify = (feature: any, layerName: string, latlng?: any, source = "SIMITI GIS") => {
    const map = mapInstanceRef.current;
    if (!map || !window.L || !feature) return;
    const properties = { ...(feature.properties || {}) };
    const geometry = feature.geometry || null;
    const point = latlng || (() => {
      try {
        const bounds = window.L.geoJSON(feature).getBounds();
        return bounds?.isValid?.() ? bounds.getCenter() : null;
      } catch { return null; }
    })();
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    const label = String(
      properties.namobj || properties.nama || properties.name || properties.title ||
      properties.namobjek || properties.kab_kota || properties.provinsi ||
      properties.keterangan || properties.fungsi || formatTableName(layerName) || "Objek GIS"
    );
    const propertyArea = Number(
      properties.luas_ha ?? properties.lsktap ?? properties.luas ?? properties.shape_area ?? properties.Shape_Area
    );
    const areaHa = Number.isFinite(propertyArea) && propertyArea > 0
      ? (propertyArea > 100000 ? propertyArea / 10000 : propertyArea)
      : enterpriseGeometryAreaHa(geometry);

    if (enterpriseIdentifyHighlightRef.current) {
      try { map.removeLayer(enterpriseIdentifyHighlightRef.current); } catch {}
    }
    enterpriseIdentifyHighlightRef.current = null;
    if (geometry) {
      try {
        enterpriseIdentifyHighlightRef.current = window.L.geoJSON(
          { type: "Feature", geometry, properties: {} },
          { style: { color: "#ef4444", weight: 4, opacity: 1, fillColor: "#f59e0b", fillOpacity: 0.18, dashArray: "7 4" }, interactive: false }
        ).addTo(map);
      } catch {}
    }

    setEnterpriseIdentify({
      open: true,
      loading: false,
      layerName,
      layerLabel: formatTableName(enterpriseLayerMeta(layerName)?.name || layerName),
      objectLabel: label,
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null,
      areaHa,
      properties,
      geometry,
      source,
    });

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.flyTo([lat, lng], Math.max(map.getZoom(), geometry ? 13 : 15), { duration: 0.7 });
    }
  };

  const identifyEnterpriseAtPoint = (latlng: any) => {
    const map = mapInstanceRef.current;
    if (!map || !window.L) return false;
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
          if (ll && map.distance(point, ll) <= Math.max(35, 16 * Math.pow(2, Math.max(0, 14 - map.getZoom())))) {
            candidates.push({ score: 0, feature: { type: "Feature", geometry: { type: "Point", coordinates: [ll.lng, ll.lat] }, properties: incident }, latlng: ll, layerName: key, source: "Data Kejadian SIMITI" });
          }
          return;
        }
        if (!feature) return;
        if (child.getLatLng) {
          const ll = child.getLatLng();
          if (ll && map.distance(point, ll) <= 35) candidates.push({ score: 1, feature, latlng: ll, layerName: key });
        } else if (child.getBounds) {
          try {
            const b = child.getBounds();
            if (b?.isValid?.() && b.contains(point)) candidates.push({ score: 2, feature, latlng: point, layerName: key });
          } catch {}
        }
      });
    });

    if (!candidates.length) return false;
    candidates.sort((a, b) => a.score - b.score);
    const hit = candidates[0];
    openEnterpriseIdentify(hit.feature, hit.layerName, hit.latlng, hit.source || "SIMITI GIS");
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
    return map[layerName] || layerName;
  };

  const openEnterpriseDataGrid = () => {
    const tab = enterpriseDataGridTabForLayer(enterpriseIdentify.layerName);
    setActiveBottomTab(tab);
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
        const response = await fetch(`${API_URL}/api/areas/search?query=${encodeURIComponent(q)}&level=kabupaten`);
        if (response.ok) {
          const areas = await response.json();
          (Array.isArray(areas) ? areas : []).slice(0, 6).forEach((area: any) => {
            results.push({ type: "location", icon: "📍", label: area.label || area.kab_kota || area.provinsi || q, sublabel: [area.level, area.provinsi].filter(Boolean).join(" • "), data: area });
          });
        }
      } catch (error) { console.warn("Enterprise area search gagal:", error); }

      // 2. Layer yang tersedia di Layer Manager.
      const allLayers = [
        ...(layerData?.kerawanan || []).map((x: any) => ({ ...x, group: "Kerawanan" })),
        ...(layerData?.mitigasiAdaptasi || []).map((x: any) => ({ ...x, group: "Mitigasi & Adaptasi" })),
        ...(layerData?.lainnya || []).map((x: any) => ({ ...x, group: "Lainnya" })),
        ...(layerData?.kejadian || []).map((x: any) => ({ ...x, group: "Kejadian" })),
        ...BNPB_INARISK_LAYERS.map((x: any) => ({ id: x.key, name: x.name, group: "BNPB InaRISK" })),
      ];
      const seen = new Set<string>();
      allLayers.filter((layer: any) => {
        const hay = `${layer.id || ""} ${layer.name || ""} ${formatTableName(layer.name || "")}`.toLowerCase();
        return hay.includes(q.toLowerCase());
      }).slice(0, 8).forEach((layer: any) => {
        const key = `layer:${layer.id || layer.name}`;
        if (seen.has(key)) return;
        seen.add(key);
        results.push({ type: "layer", icon: "🌳", label: formatTableName(layer.name || layer.id), sublabel: layer.group, data: layer });
      });

      // 3. Objek yang sudah termuat di map (marker kejadian / feature GeoJSON).
      Object.entries(layerGroupsRef.current || {}).forEach(([layerName, group]: [string, any]) => {
        if (!group?.eachLayer) return;
        group.eachLayer((child: any) => {
          const data = child?.incidentData || child?.feature?.properties;
          if (!data) return;
          const hay = Object.values(data).filter((v) => v != null).join(" ").toLowerCase();
          if (!hay.includes(q.toLowerCase())) return;
          const key = `object:${layerName}:${data.id ?? data.title ?? data.name ?? hay.slice(0, 60)}`;
          if (seen.has(key)) return;
          seen.add(key);
          results.push({ type: "object", icon: data.category?.toLowerCase().includes("banjir") ? "⚠️" : "📌", label: data.title || data.name || data.namobj || "Objek GIS", sublabel: data.category || formatTableName(layerName), layerName, data });
        });
      });

      // 4. Fallback geocoder hanya jika hasil lokal belum cukup.
      if (results.length < 5) {
        try {
          const response = await fetch(`${API_URL}/api/geocode/search?q=${encodeURIComponent(q)}`, { headers: { Accept: "application/json" } });
          if (response.ok) {
            const geo = await response.json();
            (Array.isArray(geo) ? geo : []).slice(0, 4).forEach((item: any) => {
              results.push({ type: "geocode", icon: "⌖", label: item.display_name || q, sublabel: `${item.lat}, ${item.lon}`, data: item });
            });
          }
        } catch (error) { console.warn("Enterprise geocode fallback gagal:", error); }
      }

      if (requestId === enterpriseSearchRequestRef.current) setEnterpriseSearchResults(results.slice(0, 12));
    } finally {
      if (requestId === enterpriseSearchRequestRef.current) setEnterpriseSearchLoading(false);
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
        if (boundary?.getBounds?.().isValid?.()) map.flyToBounds(boundary.getBounds(), { padding: [50, 50], duration: 0.9 });
      }, 120);
      return;
    }

    if (result.type === "layer") {
      const layerName = String(data.id || data.name);
      if (!activeLayers.has(layerName)) await handleLayerToggle(layerName, true);
      window.setTimeout(() => enterpriseZoomToLayer(layerName), 450);
      return;
    }

    if (result.type === "object") {
      identifyEnterpriseObject(data, result.layerName);
      return;
    }

    if (result.type === "geocode") {
      const lat = Number(data.lat), lng = Number(data.lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        clearEnterpriseSearchHighlight();
        map.flyTo([lat, lng], 14, { duration: 1.0 });
        const marker = window.L.circleMarker([lat, lng], { radius: 9, color: "#f59e0b", weight: 4, fillColor: "#fbbf24", fillOpacity: 0.35 }).addTo(map);
        enterpriseSearchHighlightRef.current = marker;
        marker.bindPopup(`<b>${String(result.label).replace(/[&<>"]/g, "")}</b>`).openPopup();
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
  const [aiMitigation, setAiMitigation] = useState<AiMitigationPayload | null>(null);

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
    const selectedArea = areas?.[0] || null;
    const riskMap: Record<string, any[]> = {
      karhutla: risikoData.risiko_karhutla,
      banjir: risikoData.risiko_banjir,
      longsor: risikoData.risiko_longsor,
      kekeringan: risikoData.risiko_kekeringan,
      banjir_bandang: risikoData.risiko_banjir_bandang,
      abrasi: (risikoData as any).risiko_abrasi || [],
    };
    const riskRows = riskMap[aiHazard] || [];
    const riskArea = riskRows.reduce((sum, item) => sum + Number(item.luas || 0), 0);
    const highRiskArea = riskRows
      .filter((item) => /tinggi|sangat/i.test(String(item.kelas || "")))
      .reduce((sum, item) => sum + Number(item.luas || 0), 0);
    const historicalCount = Math.max(
      kejadianListings.length,
      kejadianPhotos.length,
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
          rehabilitasiHutanData.length + rehabilitasiDasData.length + restorasiGambutData.length,
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
      const response = await fetch(`${API_URL}/api/ai/mitigation-recommendation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ context }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || payload?.error || `AI HTTP ${response.status}`);
      if (!payload?.recommendations?.length) throw new Error("LLM tidak menghasilkan rekomendasi mitigasi.");
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
      tabs.push({ id: "rawan_erosi", label: "Rawan Erosi", icon: "🏔️" });
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
        icon: "🏔️",
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
        if (activeLayers.has("jenis_tanah") && jenisTanahData.length > 0) {
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
                    {jenisTanahData.map((item, idx) => (
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
                        Luas (Shape Area)
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
                        Luas (Shape Area)
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
                        Luas (Shape Area)
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
                        Luas (Shape Area)
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
                  Tidak ada data rehabilitasi hutan di area yang dipilih
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
          const isSigapActive = Array.from(activeLayers).some((layerName) =>
            isSigapKawasanHutanLayer(layerName),
          );

          if (isSigapActive) {
            const normalizedSearch = sigapKawasanHutanSearch.trim().toLowerCase();
            const filteredSigapLegend = sigapKawasanHutanLegend.filter((item) =>
              !normalizedSearch || item.label.toLowerCase().includes(normalizedSearch),
            );
            const selectedLabel = sigapKawasanHutanLegend.find(
              (item) => item.values?.[0] === selectedSigapKawasanHutanClass,
            )?.label;

            return (
              <div className="p-3 h-full flex flex-col">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-semibold text-slate-700">
                      Kawasan Hutan — SIGAP Kementerian Kehutanan
                    </div>
                    <div className="text-[8px] text-slate-400">
                      Klik baris untuk fokus kelas pada peta
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-medium text-emerald-700 border border-emerald-100">
                      {sigapKawasanHutanLegend.length} kelas
                    </span>
                    {selectedSigapKawasanHutanClass && (
                      <button
                        type="button"
                        onClick={() => void clearSigapKawasanHutanClassFilter()}
                        className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-medium text-slate-600 hover:bg-slate-200 transition-colors"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                {selectedLabel && (
                  <div className="mb-2 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2">
                    <div className="min-w-0">
                      <div className="text-[8px] uppercase tracking-wide font-semibold text-emerald-600">Fokus kelas</div>
                      <div className="truncate text-[10px] font-semibold text-emerald-800">{selectedLabel}</div>
                    </div>
                    <span className="ml-2 shrink-0 rounded-full bg-white px-2 py-1 text-[8px] text-emerald-700 border border-emerald-100">Aktif</span>
                  </div>
                )}

                <div className="relative mb-2">
                  <input
                    value={sigapKawasanHutanSearch}
                    onChange={(event) => setSigapKawasanHutanSearch(event.target.value)}
                    placeholder="Cari fungsi kawasan..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-[10px] text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                  {sigapKawasanHutanSearch && (
                    <button
                      type="button"
                      onClick={() => setSigapKawasanHutanSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >×</button>
                  )}
                </div>

                <div className="overflow-auto flex-1 rounded-lg border border-slate-200" style={{ maxHeight: "calc(35vh - 190px)" }}>
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50 z-10">
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 px-2 font-semibold text-slate-600 bg-slate-50" style={{ width: "45px" }}>No</th>
                        <th className="text-left py-2 px-2 font-semibold text-slate-600 bg-slate-50" style={{ width: "70px" }}>Warna</th>
                        <th className="text-left py-2 px-2 font-semibold text-slate-600 bg-slate-50">Fungsi Kawasan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSigapLegend.length > 0 ? filteredSigapLegend.map((item) => {
                        const itemValue = item.values?.[0] || null;
                        const isSelected = !!itemValue && selectedSigapKawasanHutanClass === itemValue;
                        return (
                          <tr
                            key={`${item.label}-${itemValue || "no-value"}`}
                            onClick={() => void handleSigapKawasanHutanClassClick(item)}
                            className={`border-b border-slate-100 cursor-pointer transition-all ${isSelected ? "bg-emerald-100 ring-1 ring-inset ring-emerald-300" : "hover:bg-emerald-50/70"}`}
                            title={itemValue ? `Klik untuk fokus: ${item.label}` : `Kelas ${item.label} belum memiliki kode filter dari renderer SIGAP`}
                          >
                            <td className="py-2 px-2 text-slate-500">{sigapKawasanHutanLegend.indexOf(item) + 1}</td>
                            <td className="py-2 px-2">
                              {item.imageData ? (
                                <img src={`data:${item.contentType || "image/png"};base64,${item.imageData}`} alt="" className="w-10 h-5 rounded border border-slate-300 object-contain bg-white" />
                              ) : (
                                <span className="block w-10 h-5 rounded border border-slate-300" style={{ background: item.color || "#808080" }} />
                              )}
                            </td>
                            <td className="py-2 px-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-slate-700 font-medium">{item.label}</span>
                                {isSelected && <span className="shrink-0 text-[8px] font-semibold text-emerald-700">● Fokus</span>}
                              </div>
                            </td>
                          </tr>
                        );
                      }) : (
                        <tr><td colSpan={3} className="py-8 text-center text-[10px] text-slate-400">Tidak ada kelas yang cocok.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          }

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
                        Luas (Shape Leng)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {risikoLayerData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onMouseEnter={() =>
                          handleRowMouseEnter(
                            item.kelas,
                            activeBottomTab,
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
            <div className="p-3 flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-sm">
                  Tidak ada layer infrastruktur yang aktif
                </p>
              </div>
            </div>
          );
        }
        return (
          <div
            className="h-full overflow-auto"
            style={{ maxHeight: "calc(35vh - 60px)" }}
          >
            {activeInfra.map((layer, idx) => {
              const rows = infraData[layer.id] || [];
              return (
                <div key={layer.id}>
                  {idx > 0 && (
                    <div
                      style={{
                        height: "1px",
                        background: "var(--color-border-tertiary, #e5e7eb)",
                      }}
                    />
                  )}
                  <div
                    style={{
                      padding: "6px 12px",
                      background: "#f9fafb",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    <span
                      style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        background: layer.color,
                        display: "inline-block",
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: "13px", fontWeight: 500 }}>
                      {layer.label}
                    </span>
                    <span
                      style={{
                        fontSize: "11px",
                        color: "#6b7280",
                        background: "#e5e7eb",
                        borderRadius: "99px",
                        padding: "1px 8px",
                      }}
                    >
                      {rows.length} data
                    </span>
                  </div>
                  {rows.length === 0 ? (
                    <div className="p-3 text-center text-xs text-gray-400">
                      Tidak ada data di area ini
                    </div>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table
                        style={{
                          width: "100%",
                          fontSize: "11px",
                          borderCollapse: "collapse",
                          tableLayout: "fixed",
                        }}
                      >
                        <thead>
                          <tr style={{ background: "#f3f4f6" }}>
                            <th
                              style={{
                                padding: "6px 8px",
                                textAlign: "left",
                                fontWeight: 500,
                                color: "#6b7280",
                                borderBottom: "1px solid #e5e7eb",
                                width: "30px",
                              }}
                            >
                              No
                            </th>
                            {layer.cols.map((col) => (
                              <th
                                key={col.k}
                                style={{
                                  padding: "6px 8px",
                                  textAlign: "left",
                                  fontWeight: 500,
                                  color: "#6b7280",
                                  borderBottom: "1px solid #e5e7eb",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
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
                              style={{ borderBottom: "1px solid #f3f4f6" }}
                              onMouseEnter={() =>
                                handleRowMouseEnter(
                                  String(row[layer.cols[0].k] ?? ""),
                                  layer.id,
                                  layer.color,
                                )
                              }
                              onMouseLeave={handleRowMouseLeave}
                            >
                              <td
                                style={{ padding: "5px 8px", color: "#374151" }}
                              >
                                {i + 1}
                              </td>
                              {layer.cols.map((col) => {
                                const val = row[col.k] || "-";
                                const isKondisi =
                                  col.h === "Kondisi" ||
                                  col.h === "Kondisi Teknis";
                                if (isKondisi) {
                                  const lower = String(val).toLowerCase();
                                  const bg = lower.includes("baik")
                                    ? "#EAF3DE"
                                    : lower.includes("rusak")
                                      ? "#FCEBEB"
                                      : "#FAEEDA";
                                  const color = lower.includes("baik")
                                    ? "#3B6D11"
                                    : lower.includes("rusak")
                                      ? "#A32D2D"
                                      : "#854F0B";
                                  return (
                                    <td
                                      key={col.k}
                                      style={{ padding: "5px 8px" }}
                                    >
                                      {val !== "-" ? (
                                        <span
                                          style={{
                                            background: bg,
                                            color,
                                            borderRadius: "99px",
                                            padding: "2px 7px",
                                            fontSize: "10px",
                                            fontWeight: 500,
                                          }}
                                        >
                                          {val}
                                        </span>
                                      ) : (
                                        "-"
                                      )}
                                    </td>
                                  );
                                }
                                return (
                                  <td
                                    key={col.k}
                                    style={{
                                      padding: "5px 8px",
                                      color: "#374151",
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      maxWidth: "150px",
                                    }}
                                  >
                                    {val}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                          <tr>
                            <td
                              colSpan={layer.cols.length + 1}
                              style={{ height: "8px" }}
                            />
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ height: "80px" }} />
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
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&zoom=10&addressdetails=1`,
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
          address.city ||
          address.town ||
          address.municipality ||
          address.county ||
          address.city_district ||
          "";
        locationName =
          address.city ||
          address.town ||
          address.municipality ||
          address.county ||
          address.state ||
          reverseJson?.display_name?.split(",")[0] ||
          "Lokasi dipilih";
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
    return "☁️";
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

  const selectedRegionName =
    selectedAreas.length > 0 ? selectedAreas[0].label : "Indonesia";
  const totalEvents = kejadianListings.length || kejadianPhotos.length || 0;
  const activeLayerCount = activeLayers.size;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f4f7f6] text-slate-800">
      <style>{`
        .custom-kejadian-marker { background:none; border:none; }
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
        @media (max-width: 1279px) {
          .enterprise-sidebar { position:fixed; inset:0 auto 0 0; width:270px; max-width:82vw; transform:translateX(-105%); box-shadow:16px 0 40px rgba(0,0,0,.22); }
          .enterprise-sidebar.mobile-sidebar-open { transform:translateX(0); }
          .mobile-topbar { display:flex; align-items:center; gap:10px; padding:8px 12px; min-height:52px; }
          .mobile-topbar::after { content:""; position:fixed; inset:0; background:rgba(2,6,23,.42); z-index:-1; pointer-events:none; opacity:0; }
          .enterprise-sidebar.mobile-sidebar-open ~ * { }
        }
        @media (max-width: 767px) {
          .mobile-topbar { padding:7px 10px; min-height:48px; }
          .mobile-menu-button { display:flex; }
          .mockup-map-search input { font-size:11px; }
        }
        @media (min-width: 1280px) {
          .mobile-menu-button { display:none; }
        }
      `}</style>

      {/* =========================================================
          SIDEBAR — visual hierarchy mengikuti mockup
         ========================================================= */}
      <aside
        className={`enterprise-sidebar w-[232px] shrink-0 bg-[#064238] text-white flex flex-col z-[3000] shadow-[8px_0_30px_rgba(6,66,56,.12)] ${mobileSidebarOpen ? "mobile-sidebar-open" : ""}`}
      >
        <div className="px-5 py-4 border-b border-white/10">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(false)}
            className="absolute top-3 right-3 hidden max-[1279px]:flex w-8 h-8 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white text-lg"
            aria-label="Tutup menu navigasi"
          >
            ×
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#0b7257] font-black text-lg shadow-sm">
              S
            </div>
            <div className="min-w-0">
              <div className="text-[18px] font-extrabold tracking-wide leading-none">
                SIMITIGASI
              </div>
              <div className="text-[7px] text-emerald-100/80 leading-tight mt-1">
                Sistem Informasi Mitigasi dan Adaptasi
                <br />
                Bencana Hidrometeorologi Kehutanan
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto dashboard-scroll px-3 py-4">
          <div className="text-[9px] uppercase tracking-[.18em] text-emerald-300/80 px-3 pb-2">
            Menu Utama
          </div>
          {[
            ["Beranda", "⌂", "/"],
            ["Peta Interaktif", "▱", "/kerawanan"],
            ["Kejadian Bencana", "⚠", "/kebencanaan"],
            ["Kawasan Rawan", "◇", "/kerawanan"],
            ["Mitigasi", "◌", "/kerawanan"],
            ["AI Rekomendasi", "✦", "/kerawanan"],
            ["Adaptasi", "◍", "/kerawanan"],
            ["EWS", "◉", "/kerawanan"],
          ].map(([label, icon, path], i) => (
            <button
              key={label}
              onClick={() => {
                if (label === "AI Rekomendasi") {
                            } else {
                  navigate(path);
                }
                setMobileSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-[11px] transition ${i === 1 ? "bg-[#0d9a70] text-white shadow-sm" : "text-emerald-50/80 hover:bg-white/10"}`}
            >
              <span className="w-5 text-center text-sm opacity-90">{icon}</span>
              <span>{label}</span>
            </button>
          ))}

          <div className="text-[9px] uppercase tracking-[.18em] text-emerald-300/80 px-3 pt-5 pb-2">
            Alat & Data
          </div>
          {[
            ["Lokasi Saya", "⌖"],
            ["Laporan & Unduhan", "▤"],
            ["API / Data Terbuka", "‹/›"],
          ].map(([label, icon]) => (
            <button
              key={label}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-[11px] text-emerald-50/80 hover:bg-white/10 transition"
            >
              <span className="w-5 text-center text-sm">{icon}</span>
              <span>{label}</span>
            </button>
          ))}

          <div className="text-[9px] uppercase tracking-[.18em] text-emerald-300/80 px-3 pt-5 pb-2">
            Pengaturan
          </div>
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-[11px] text-emerald-50/80 hover:bg-white/10 transition">
            <span className="w-5 text-center">⚙</span>
            <span>Pengaturan</span>
          </button>
        </nav>

        <div className="m-3 rounded-xl border border-emerald-300/20 bg-[#0b5a49]/70 p-3">
          <div className="flex items-center justify-between text-[9px] font-semibold text-emerald-100">
            <span>Lokasi Saya</span>
            <button className="rounded-md bg-[#15966e] px-2 py-1 text-[8px]">
              Ubah
            </button>
          </div>
          <div className="text-[11px] font-extrabold mt-2">
            {selectedRegionName}
          </div>
          <div className="text-[9px] text-emerald-100/70 mt-1">
            {selectedAreas[0]?.kab_kota || selectedDas[0]?.label || "Indonesia"}
          </div>
          <div className="text-[9px] text-emerald-100/80 mt-2">
            ⌖ {mapWeatherPopup.latitude?.toFixed(4) || "—"},{" "}
            {mapWeatherPopup.longitude?.toFixed(4) || "—"}
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* =========================================================
            HEADER
           ========================================================= */}
        <div className="shrink-0 bg-white border-b border-slate-200 relative">
          <div className="mobile-topbar">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="mobile-menu-button"
              aria-label="Buka menu navigasi"
            >
              <span></span>
              <span></span>
              <span></span>
            </button>
            <div className="mobile-page-title">
              SIMITIGASI <span>• Kawasan Rawan</span>
            </div>
          </div>
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

        <main className="relative flex-1 min-h-0 p-2 md:p-3 overflow-y-auto xl:overflow-hidden">
          <div className="min-h-full xl:h-full grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_350px] grid-rows-[minmax(520px,1fr)_auto_auto] xl:grid-rows-[minmax(0,1fr)_184px] gap-2">
            {/* =====================================================
                MAP — pusat visual seperti mockup
               ===================================================== */}
            <section className="relative min-h-[520px] xl:min-h-0 rounded-xl overflow-hidden bg-sky-100 border border-white shadow-sm">
              <div ref={mapRef} className="absolute inset-0" />

              {/* Enterprise Search */}
              <div className="absolute top-3 left-3 right-3 sm:right-auto z-[1900] w-auto sm:w-[390px] mockup-map-search">
                <div className="h-10 bg-white/97 rounded-xl shadow-[0_8px_25px_rgba(15,23,42,.16)] border border-slate-200 flex items-center px-3 gap-2">
                  <span className="text-emerald-700 text-sm">🔎</span>
                  <input
                    value={enterpriseSearchQuery}
                    onFocus={() => setEnterpriseSearchOpen(true)}
                    onChange={(e) => { const value = e.target.value; setEnterpriseSearchQuery(value); setEnterpriseSearchOpen(true); void buildEnterpriseSearchResults(value); }}
                    onKeyDown={(e) => { if (e.key === "Escape") setEnterpriseSearchOpen(false); if (e.key === "Enter" && enterpriseSearchResults[0]) void handleEnterpriseSearchSelect(enterpriseSearchResults[0]); }}
                    className="flex-1 outline-none text-[10px] bg-transparent"
                    placeholder="Cari lokasi / layer / objek..."
                    aria-label="Enterprise Search lokasi layer dan objek"
                  />
                  {enterpriseSearchLoading && <span className="text-[8px] text-slate-400 animate-pulse">Mencari...</span>}
                  {enterpriseSearchQuery && <button onClick={() => { setEnterpriseSearchQuery(""); setEnterpriseSearchResults([]); clearEnterpriseSearchHighlight(); }} className="text-slate-400 text-sm">×</button>}
                </div>
                {enterpriseSearchOpen && enterpriseSearchQuery.trim().length >= 2 && (
                  <div className="mt-1 bg-white rounded-xl border border-slate-200 shadow-[0_16px_45px_rgba(15,23,42,.2)] overflow-hidden">
                    {enterpriseSearchResults.length > 0 ? enterpriseSearchResults.map((result, idx) => (
                      <button key={`${result.type}-${idx}`} onClick={() => void handleEnterpriseSearchSelect(result)} className="w-full px-3 py-2.5 flex items-center gap-2 text-left hover:bg-emerald-50 border-b border-slate-100 last:border-0">
                        <span className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-sm">{result.icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[10px] font-bold text-slate-800 truncate">{result.label}</span>
                          <span className="block text-[8px] text-slate-400 truncate">{result.sublabel || (result.type === "location" ? "Lokasi" : result.type === "layer" ? "Layer" : "Objek")}</span>
                        </span>
                        <span className="text-[8px] text-emerald-600 font-semibold">{result.type === "object" ? "IDENTIFY" : "FLY TO"}</span>
                      </button>
                    )) : !enterpriseSearchLoading && (
                      <div className="px-3 py-4 text-[9px] text-slate-400 text-center">Tidak ada hasil untuk “{enterpriseSearchQuery}”</div>
                    )}
                  </div>
                )}
              </div>

              {/* Quick map controls */}
              <div className="absolute left-3 top-[105px] z-[1600] flex flex-col rounded-lg overflow-hidden border border-slate-200 shadow-md bg-white">
                <button
                  onClick={() => mapInstanceRef.current?.zoomIn()}
                  className="w-9 h-9 text-slate-700 text-lg hover:bg-slate-50"
                >
                  +
                </button>
                <button
                  onClick={() => mapInstanceRef.current?.zoomOut()}
                  className="w-9 h-9 border-t text-slate-700 text-lg hover:bg-slate-50"
                >
                  −
                </button>
              </div>

              {/* Layer drawer — fungsi lama tetap dipertahankan */}
              {showLayerPanel && (
                <div className="absolute left-3 top-[152px] bottom-3 z-[1800] w-[calc(100%-24px)] max-w-[320px] sm:w-[245px] bg-white rounded-xl border border-slate-200 shadow-[0_16px_45px_rgba(15,23,42,.18)] overflow-hidden flex flex-col">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between">
                    <div>
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">
                        Layer Services
                      </div>
                      <div className="text-sm font-extrabold">
                        SIMITIGASI • Layer
                      </div>
                    </div>
                    <button
                      onClick={() => setShowLayerPanel(false)}
                      className="text-slate-400 text-lg"
                    >
                      ×
                    </button>
                  </div>
                  {layerError && (
                    <div className="mx-3 mt-3 rounded-lg bg-red-50 border border-red-100 p-2 text-[9px] text-red-700">
                      {layerError}
                    </div>
                  )}

                  {/* Enterprise layer toolbar */}
                  <div className="px-3 pt-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5">
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">⌕</span>
                        <input
                          value={enterpriseLayerSearch}
                          onChange={(e) => setEnterpriseLayerSearch(e.target.value)}
                          className="w-full h-8 pl-7 pr-7 rounded-lg border border-slate-200 bg-white outline-none text-[9px] focus:border-emerald-400"
                          placeholder="Cari layer..."
                        />
                        {enterpriseLayerSearch && (
                          <button onClick={() => setEnterpriseLayerSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">×</button>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <button
                          onClick={() => setEnterpriseShowActiveOnly((v) => !v)}
                          className={`px-2 py-1 rounded-md text-[8px] font-bold border ${enterpriseShowActiveOnly ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-white text-slate-500 border-slate-200"}`}
                        >
                          ● Aktif saja ({activeLayers.size})
                        </button>
                        <button
                          onClick={() => {
                            setEnterpriseCollapsedGroups(new Set());
                            setEnterpriseShowActiveOnly(false);
                          }}
                          className="px-2 py-1 rounded-md text-[8px] font-semibold bg-white text-slate-500 border border-slate-200"
                        >
                          Reset view
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Active layer stack */}
                  {enterpriseActiveLayerEntries.length > 0 && (
                    <div className="px-3 pt-2">
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 overflow-hidden">
                        <div className="px-2.5 py-2 flex items-center justify-between border-b border-emerald-100">
                          <span className="text-[8px] font-extrabold uppercase tracking-wide text-emerald-800">Layer aktif</span>
                          <span className="text-[8px] text-emerald-600">{enterpriseActiveLayerEntries.length} layer</span>
                        </div>
                        <div className="max-h-36 overflow-y-auto">
                          {enterpriseActiveLayerEntries.map((entry) => {
                            const opacity = enterpriseOpacity[entry.name] ?? 1;
                            const legendVisible = enterpriseLegendVisible[entry.name] !== false;
                            return (
                              <div key={entry.name} className="px-2.5 py-2 border-b last:border-b-0 border-emerald-100/70 bg-white/70">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                  <span className="text-[9px] font-semibold text-slate-700 truncate flex-1">{entry.label}</span>
                                  <button title="Zoom ke layer" onClick={() => enterpriseZoomToLayer(entry.name)} className="text-[10px] text-slate-500 hover:text-emerald-700">⌖</button>
                                  <button title="Metadata" onClick={() => setEnterpriseMetadataLayer(enterpriseLayerMeta(entry.name))} className="text-[10px] text-slate-500 hover:text-emerald-700">ⓘ</button>
                                  <button title={legendVisible ? "Sembunyikan legenda" : "Tampilkan legenda"} onClick={() => setEnterpriseLegendVisible((prev) => ({ ...prev, [entry.name]: !legendVisible }))} className={`text-[10px] ${legendVisible ? "text-emerald-700" : "text-slate-300"}`}>▤</button>
                                </div>
                                <div className="mt-1.5 flex items-center gap-2">
                                  <span className="text-[7px] text-slate-400 w-9">Opacity</span>
                                  <input type="range" min="0" max="100" value={Math.round(opacity * 100)} onChange={(e) => enterpriseSetLayerOpacity(entry.name, Number(e.target.value) / 100)} className="flex-1 h-1 accent-emerald-600" />
                                  <span className="text-[7px] font-bold text-slate-500 w-7 text-right">{Math.round(opacity * 100)}%</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto dashboard-scroll p-3">
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-200">
                        <button
                          onClick={() => enterpriseToggleGroup("kerawanan")}
                          className="text-[11px] font-bold text-slate-800 flex-1 text-left"
                        >
                          {enterpriseCollapsedGroups.has("kerawanan") ? "▸" : "▾"} Kerawanan
                        </button>
                        <button
                          onClick={() => handleAddClick("kerawanan")}
                          className="text-[9px] text-emerald-700"
                        >
                          + Data
                        </button>
                      </div>
                      {!enterpriseCollapsedGroups.has("kerawanan") && <div className="space-y-1">
                        {(currentBounds &&
                        (selectedAreas.length > 0 || selectedDas.length > 0)
                          ? availableLayers.kerawanan
                          : layerData.kerawanan
                        ).filter(enterpriseMatchesLayer).map((layer) => (
                          <label
                            key={layer.id}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              className="w-3.5 h-3.5 accent-emerald-700"
                              checked={activeLayers.has(layer.name)}
                              onChange={(e) =>
                                handleLayerToggle(layer.name, e.target.checked)
                              }
                              disabled={loadingLayerNames.has(layer.name)}
                            />
                            <span className="text-[10px] flex-1 truncate">
                              {loadingLayerNames.has(layer.name) ? "⏳ " : ""}
                              {formatTableName(layer.name)}
                            </span>
                          </label>
                        ))}
                      </div>}
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
                        return (
                          <div key={section} className="mb-4">
                            <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-200">
                              <h3 className="text-[11px] font-bold text-slate-800">
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
                            {!enterpriseCollapsedGroups.has(section) && <div className="space-y-1">
                              {(source || []).filter(enterpriseMatchesLayer).map((layer: any) => (
                                <label
                                  key={layer.id}
                                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    className="w-3.5 h-3.5 accent-emerald-700"
                                    checked={activeLayers.has(
                                      layer.isManual ? layer.name : layer.id,
                                    )}
                                    onChange={(e) =>
                                      handleLayerToggle(
                                        layer.isManual ? layer.name : layer.id,
                                        e.target.checked,
                                        layer.year,
                                        layer.category,
                                        layer.isShapefile,
                                      )
                                    }
                                    disabled={loadingLayerNames.has(layer.name)}
                                  />
                                  <span className="text-[10px] flex-1 truncate">
                                    {formatTableName(layer.name)}
                                  </span>
                                </label>
                              ))}
                            </div>}
                          </div>
                        );
                      },
                    )}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-200">
                        <button onClick={() => enterpriseToggleGroup("bnpb")} className="text-[11px] font-bold flex-1 text-left">{enterpriseCollapsedGroups.has("bnpb") ? "▸" : "▾"} BNPB InaRISK</button>
                        <span className="text-[8px] font-bold text-emerald-700">
                          LIVE
                        </span>
                      </div>
                      {!enterpriseCollapsedGroups.has("bnpb") && <div className="space-y-1">
                        {BNPB_INARISK_LAYERS.filter(enterpriseMatchesLayer).map((layer) => (
                          <label
                            key={layer.key}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${layer.url ? "hover:bg-blue-50 cursor-pointer" : "opacity-45 cursor-not-allowed"}`}
                          >
                            <input
                              type="checkbox"
                              className="w-3.5 h-3.5 accent-emerald-700"
                              checked={activeLayers.has(layer.key)}
                              onChange={(e) =>
                                handleBnpbToggle(layer.key, e.target.checked)
                              }
                              disabled={
                                !layer.url || loadingLayerNames.has(layer.key)
                              }
                            />
                            <span className="text-[10px] flex-1 truncate">
                              {layer.name}
                            </span>
                          </label>
                        ))}
                      </div>}
                    </div>
                  </div>
                </div>
              )}

              {enterpriseMetadataLayer && (
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[2100] w-[320px] max-w-[calc(100%-24px)]">
                  <div className="rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
                    <div className="bg-[#064238] text-white px-4 py-3 flex items-center justify-between">
                      <div><div className="text-[8px] uppercase tracking-wider text-emerald-200">Layer Metadata</div><div className="text-sm font-extrabold">{formatTableName(String(enterpriseMetadataLayer.name || enterpriseMetadataLayer.id || "Layer"))}</div></div>
                      <button onClick={() => setEnterpriseMetadataLayer(null)} className="text-white/70 hover:text-white text-lg">×</button>
                    </div>
                    <div className="p-4 space-y-2 text-[9px]">
                      <div className="grid grid-cols-[72px_1fr] gap-2"><span className="text-slate-400">ID</span><b className="text-slate-700 break-all">{enterpriseMetadataLayer.id || "—"}</b></div>
                      <div className="grid grid-cols-[72px_1fr] gap-2"><span className="text-slate-400">Nama</span><b className="text-slate-700">{enterpriseMetadataLayer.name || "—"}</b></div>
                      <div className="grid grid-cols-[72px_1fr] gap-2"><span className="text-slate-400">Sumber</span><b className="text-slate-700">{enterpriseMetadataLayer.source || "Database / GIS Service"}</b></div>
                      {enterpriseMetadataLayer.url && <div className="grid grid-cols-[72px_1fr] gap-2"><span className="text-slate-400">Endpoint</span><span className="text-slate-600 break-all">{enterpriseMetadataLayer.url}</span></div>}
                    </div>
                  </div>
                </div>
              )}

              {bnpbIdentifyPopup.open && (
                <div className="absolute right-3 bottom-14 z-[1900] w-[360px] max-w-[calc(100%-24px)]">
                  <div className="rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden">
                    <div className="bg-[#0b4d3c] text-white px-4 py-3 flex justify-between">
                      <div>
                        <div className="text-[8px] text-emerald-200 uppercase">
                          BNPB InaRISK • IDENTIFY
                        </div>
                        <div className="text-sm font-bold">
                          Informasi Risiko / Bahaya
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          setBnpbIdentifyPopup((p) => ({ ...p, open: false }))
                        }
                      >
                        ×
                      </button>
                    </div>
                    <div className="p-4 text-[10px] max-h-[320px] overflow-y-auto">
                      <div className="mb-3 rounded-lg bg-slate-50 border border-slate-100 p-2 text-[9px] text-slate-500">
                        Titik: {bnpbIdentifyPopup.latitude?.toFixed(6)},{" "}
                        {bnpbIdentifyPopup.longitude?.toFixed(6)}
                      </div>
                      {bnpbIdentifyPopup.loading
                        ? "Memeriksa data raster BNPB..."
                        : bnpbIdentifyPopup.error
                          ? bnpbIdentifyPopup.error
                          : bnpbIdentifyPopup.results.map((r, i) => (
                              <div
                                key={i}
                                className="py-2.5 border-b last:border-0"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <b>{r.service}</b>
                                  <span
                                    className={`text-[8px] font-bold px-2 py-0.5 rounded-full ${r.status === "value" ? "bg-emerald-50 text-emerald-700" : r.status === "out_of_coverage" ? "bg-amber-50 text-amber-700" : r.status === "nodata" ? "bg-slate-100 text-slate-500" : "bg-red-50 text-red-700"}`}
                                  >
                                    {r.status === "value"
                                      ? "TERSEDIA"
                                      : r.status === "out_of_coverage"
                                        ? "DI LUAR CAKUPAN"
                                        : r.status === "nodata"
                                          ? "NODATA"
                                          : "ERROR"}
                                  </span>
                                </div>
                                <div className="mt-1 text-slate-600 font-semibold">
                                  {r.status === "value"
                                    ? `Nilai API: ${r.value}`
                                    : r.message}
                                </div>
                                {r.debug && (
                                  <details className="mt-2">
                                    <summary className="cursor-pointer text-[8px] font-semibold text-slate-500">
                                      Lihat response BNPB (debug)
                                    </summary>
                                    <pre className="mt-1 max-h-48 overflow-auto rounded bg-slate-950 text-emerald-200 p-2 text-[7px] leading-3 whitespace-pre-wrap break-all">
                                      {JSON.stringify(r.debug, null, 2)}
                                    </pre>
                                  </details>
                                )}
                              </div>
                            ))}
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* =====================================================
                STEP 3 — ENTERPRISE CLICK IDENTIFY
               ===================================================== */}
            {enterpriseIdentify.open && (
              <div className="absolute right-3 top-3 z-[2100] w-[min(380px,calc(100%-24px))] bg-white rounded-2xl border border-slate-200 shadow-[0_20px_60px_rgba(15,23,42,.22)] overflow-hidden">
                <div className="px-4 py-3 bg-slate-950 text-white flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-[8px] uppercase tracking-[0.18em] text-emerald-300 font-bold">Enterprise Identify</div>
                    <div className="text-sm font-extrabold truncate mt-0.5">{enterpriseIdentify.objectLabel}</div>
                  </div>
                  <button onClick={closeEnterpriseIdentify} className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white">×</button>
                </div>
                <div className="p-3 space-y-3 max-h-[55vh] overflow-y-auto">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5">
                      <div className="text-[7px] text-slate-400 uppercase font-bold">Source Layer</div>
                      <div className="text-[10px] font-extrabold text-slate-700 mt-1 truncate">{enterpriseIdentify.layerLabel || enterpriseIdentify.layerName}</div>
                    </div>
                    <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-2.5">
                      <div className="text-[7px] text-emerald-600 uppercase font-bold">Sumber</div>
                      <div className="text-[10px] font-extrabold text-emerald-700 mt-1 truncate">{enterpriseIdentify.source || "SIMITI GIS"}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-slate-100 p-2.5">
                      <div className="text-[7px] text-slate-400 uppercase font-bold">Latitude</div>
                      <div className="text-[10px] font-bold mt-1">{enterpriseIdentify.latitude != null ? enterpriseIdentify.latitude.toFixed(6) : "—"}</div>
                    </div>
                    <div className="rounded-xl border border-slate-100 p-2.5">
                      <div className="text-[7px] text-slate-400 uppercase font-bold">Longitude</div>
                      <div className="text-[10px] font-bold mt-1">{enterpriseIdentify.longitude != null ? enterpriseIdentify.longitude.toFixed(6) : "—"}</div>
                    </div>
                  </div>

                  {enterpriseIdentify.areaHa != null && (
                    <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 flex items-center justify-between">
                      <div><div className="text-[7px] text-amber-600 uppercase font-bold">Luas Area</div><div className="text-lg font-extrabold text-amber-700 mt-0.5">{enterpriseIdentify.areaHa.toLocaleString("id-ID", { maximumFractionDigits: 2 })} <span className="text-[9px]">Ha</span></div></div>
                      <span className="text-2xl">▱</span>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-2"><div className="text-[9px] font-extrabold text-slate-700">Atribut Objek</div><span className="text-[7px] text-slate-400">{Object.keys(enterpriseIdentify.properties || {}).length} fields</span></div>
                    <div className="rounded-xl border border-slate-100 overflow-hidden">
                      {Object.entries(enterpriseIdentify.properties || {}).filter(([key]) => !["geom", "geometry"].includes(key)).slice(0, 30).map(([key, value]) => (
                        <div key={key} className="grid grid-cols-[42%_58%] border-b border-slate-100 last:border-0">
                          <div className="px-2.5 py-2 bg-slate-50 text-[7px] font-bold text-slate-500 break-words">{key}</div>
                          <div className="px-2.5 py-2 text-[8px] text-slate-700 break-words">{enterpriseEscapeHtml(value)}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button onClick={openEnterpriseDataGrid} className="w-full h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-extrabold flex items-center justify-center gap-2 shadow-sm">
                    ▤ Buka di Data Grid
                  </button>
                </div>
              </div>
            )}

            {/* =====================================================
                RIGHT INFO PANEL — struktur mengikuti mockup
               ===================================================== */}
            <aside className="xl:row-span-2 min-h-[420px] xl:min-h-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[14px] font-extrabold">
                      Informasi Lokasi Terpilih
                    </div>
                    <div className="text-[8px] text-slate-400 mt-1">
                      Data diperbarui:{" "}
                      {formatWeatherTime(openMeteoWeather.updatedAt)} WIB
                    </div>
                  </div>
                  <span className="text-[8px] font-bold text-emerald-700 bg-emerald-50 rounded-full px-2 py-1">
                    ● Data Terbaru
                  </span>
                </div>
                <div className="mt-3 flex gap-4 overflow-x-auto text-[8px] font-semibold text-slate-400">
                  {[
                    "Ringkasan",
                    "Risiko",
                    "Historis",
                    "Mitigasi",
                    "Adaptasi",
                    "Dokumen",
                  ].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setSelectedInfoTab(tab)}
                      className={`pb-2 whitespace-nowrap border-b-2 ${selectedInfoTab === tab ? "border-emerald-600 text-emerald-700" : "border-transparent"}`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto dashboard-scroll p-4">
                {selectedInfoTab === "Ringkasan" && (
                  <>
                    <div className="text-[10px] font-bold text-slate-700 mb-3">
                      A. Rincian Lokasi
                    </div>
                    <div className="grid grid-cols-2 gap-x-5 gap-y-3 text-[9px]">
                      <div>
                        <span className="text-slate-400 block">
                          Nama Lokasi
                        </span>
                        <b>{selectedRegionName}</b>
                      </div>
                      <div>
                        <span className="text-slate-400 block">
                          Tutupan Lahan Dominan
                        </span>
                        <b>{tutupanLahanData[0]?.deskripsi_domain || "—"}</b>
                      </div>
                      <div>
                        <span className="text-slate-400 block">
                          Administrasi
                        </span>
                        <b>
                          {selectedAreas[0]?.kab_kota ||
                            selectedAreas[0]?.provinsi ||
                            "—"}
                        </b>
                      </div>
                      <div>
                        <span className="text-slate-400 block">
                          Tutupan Hutan Sekunder
                        </span>
                        <b>—</b>
                      </div>
                      <div>
                        <span className="text-slate-400 block">
                          DAS / Sub-DAS
                        </span>
                        <b>{selectedDas[0]?.nama_das || "—"}</b>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Elevasi</span>
                        <b>—</b>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Koordinat</span>
                        <b>
                          {mapWeatherPopup.latitude != null
                            ? `${mapWeatherPopup.latitude.toFixed(4)}° LS, ${mapWeatherPopup.longitude?.toFixed(4)}° BT`
                            : "—"}
                        </b>
                      </div>
                      <div>
                        <span className="text-slate-400 block">
                          Kemiringan Lereng
                        </span>
                        <b>—</b>
                      </div>
                    </div>

                    <div className="mt-5">
                      <div className="text-[10px] font-bold text-slate-700 mb-3">
                        Informasi Risiko (BNPB InaRISK)
                      </div>
                      <div className="space-y-2">
                        {bnpbIdentifyPopup.results
                          .filter((r) =>
                            activeLayers.has(
                              BNPB_INARISK_LAYERS.find(
                                (x) => x.name === r.service,
                              )?.key || "",
                            ),
                          )
                          .map((r, i) => (
                            <div
                              key={i}
                              className="rounded-lg border border-slate-100 bg-slate-50 p-2.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <b className="text-[9px] text-slate-700">
                                  {r.service}
                                </b>
                                <span
                                  className={`text-[7px] font-bold px-2 py-1 rounded-full ${r.status === "value" ? "bg-emerald-50 text-emerald-700" : r.status === "out_of_coverage" ? "bg-amber-50 text-amber-700" : r.status === "nodata" ? "bg-slate-200 text-slate-600" : "bg-red-50 text-red-700"}`}
                                >
                                  {r.status === "value"
                                    ? "DATA ADA"
                                    : r.status === "out_of_coverage"
                                      ? "DI LUAR CAKUPAN"
                                      : r.status === "nodata"
                                        ? "NODATA"
                                        : "ERROR"}
                                </span>
                              </div>
                              <div className="mt-1.5 text-sm font-extrabold text-slate-800">
                                {r.status === "value" ? r.value : "—"}
                              </div>
                              <div className="mt-1 text-[7px] text-slate-400">
                                {r.status === "value"
                                  ? "Nilai raster dari BNPB InaRISK"
                                  : r.message}
                              </div>
                            </div>
                          ))}
                        {!bnpbIdentifyPopup.results.length && (
                          <div className="rounded-lg border border-dashed border-slate-200 p-3 text-[8px] text-slate-400">
                            Klik titik di peta setelah layer BNPB diaktifkan
                            untuk mengambil nilai risiko.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 rounded-lg border border-orange-100 bg-orange-50/70 p-3 flex items-center justify-between">
                      <div>
                        <div className="text-[8px] text-orange-700 font-semibold">
                          Status Risiko Keseluruhan
                        </div>
                        <div className="text-sm font-extrabold text-orange-700 mt-1">
                          {activeLayerCount > 0
                            ? "Terpetakan"
                            : "Belum dihitung"}
                        </div>
                      </div>
                      <span className="text-xl">♨</span>
                    </div>

                    <div className="text-[10px] font-bold text-slate-700 mt-5 mb-3">
                      B. Indeks Risiko Multi-bencana
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[
                        ["Banjir", risikoData.risiko_banjir],
                        ["Longsor", risikoData.risiko_longsor],
                        ["Karhutla", risikoData.risiko_karhutla],
                        ["Kekeringan", risikoData.risiko_kekeringan],
                        ["Banjir Bandang", risikoData.risiko_banjir_bandang],
                      ].map(([label, data]: any) => (
                        <div
                          key={label}
                          className="rounded-lg border border-slate-100 p-2 text-center"
                        >
                          <div className="text-[7px] text-slate-400 leading-tight">
                            {label}
                          </div>
                          <div className="text-sm font-extrabold mt-1">
                            {data?.length || 0}
                          </div>
                          <div className="text-[7px] text-slate-400">
                            kelas data
                          </div>
                          <div className="h-1 rounded-full bg-emerald-100 mt-2 overflow-hidden">
                            <div
                              className="h-full bg-emerald-500"
                              style={{
                                width: `${Math.min(100, (data?.length || 0) * 20)}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="text-[10px] font-bold text-slate-700 mt-5 mb-3">
                      C. Kondisi Lingkungan & Pemantauan (Real-time)
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        [
                          "Curah Hujan",
                          openMeteoWeather.current?.precipitation != null
                            ? `${openMeteoWeather.current.precipitation} mm`
                            : "—",
                        ],
                        [
                          "Suhu Udara",
                          openMeteoWeather.current?.temperature_2m != null
                            ? `${openMeteoWeather.current.temperature_2m} °C`
                            : "—",
                        ],
                        [
                          "Kelembapan",
                          openMeteoWeather.current?.relative_humidity_2m != null
                            ? `${openMeteoWeather.current.relative_humidity_2m}%`
                            : "—",
                        ],
                        [
                          "Tekanan",
                          openMeteoWeather.current?.surface_pressure != null
                            ? `${openMeteoWeather.current.surface_pressure} hPa`
                            : "—",
                        ],
                        [
                          "Prakiraan Hujan",
                          openMeteoWeather.daily?.rain_sum?.[0] != null
                            ? `${openMeteoWeather.daily.rain_sum[0]} mm`
                            : "—",
                        ],
                        [
                          "Hotspot",
                          kejadianListings.length
                            ? `${kejadianListings.length} titik`
                            : "—",
                        ],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="rounded-lg bg-slate-50 border border-slate-100 p-2.5"
                        >
                          <div className="text-[7px] text-slate-400">
                            {label}
                          </div>
                          <div className="text-[11px] font-extrabold mt-1">
                            {value}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50 p-3 flex items-center justify-between">
                      <div>
                        <div className="text-[8px] text-emerald-700 font-semibold">
                          Stasiun EWS
                        </div>
                        <div className="text-sm font-extrabold text-emerald-700">
                          {activeLayerCount > 0 ? "Waspada" : "Normal"}
                        </div>
                      </div>
                      <span className="text-xl text-emerald-600">△</span>
                    </div>
                  </>
                )}

                {selectedInfoTab === "Risiko" && (
                  <div className="space-y-3">
                    <div className="text-[10px] font-bold">
                      Ringkasan Risiko
                    </div>
                    {[
                      ["Banjir", risikoData.risiko_banjir],
                      ["Longsor", risikoData.risiko_longsor],
                      ["Karhutla", risikoData.risiko_karhutla],
                      ["Kekeringan", risikoData.risiko_kekeringan],
                      ["Banjir Bandang", risikoData.risiko_banjir_bandang],
                    ].map(([label, data]: any) => (
                      <div key={label} className="rounded-lg border p-3">
                        <div className="flex justify-between text-[9px]">
                          <b>{label}</b>
                          <span>{data?.length || 0} kelas</span>
                        </div>
                        <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500"
                            style={{
                              width: `${Math.min(100, (data?.length || 0) * 20)}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {selectedInfoTab === "Historis" && (
                  <div>
                    <div className="text-[10px] font-bold mb-3">
                      Kejadian Terkini di Sekitar Lokasi
                    </div>
                    <div className="space-y-2">
                      {kejadianListings.slice(0, 8).map((item: any, i) => (
                        <div
                          key={i}
                          className="flex gap-2 rounded-lg bg-slate-50 p-2"
                        >
                          <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-[9px]">
                            ⚠
                          </span>
                          <div className="min-w-0">
                            <b className="text-[9px] block truncate">
                              {item.title || item.incident_type || "Kejadian"}
                            </b>
                            <span className="text-[8px] text-slate-400">
                              {item.incident_date || "Tanggal tidak tersedia"}
                            </span>
                          </div>
                        </div>
                      ))}
                      {!kejadianListings.length && (
                        <div className="text-[9px] text-slate-400">
                          Aktifkan layer kejadian untuk menampilkan histori.
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {selectedInfoTab === "Mitigasi" && (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[10px] font-bold">Rekomendasi Mitigasi & Adaptasi (AI)</div>
                        <div className="mt-1 text-[8px] text-slate-400">Klik satu wilayah untuk diagnosis dan rekomendasi yang spesifik terhadap jenis bencana.</div>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[7px] font-bold text-emerald-700">LLM</span>
                    </div>
                    <div className="flex gap-2">
                      <select value={aiHazard} onChange={(e) => { setAiHazard(e.target.value); setTimeout(() => runAiMitigationRecommendation(), 0); }} className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[9px] outline-none">
                        {AI_HAZARD_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      <button onClick={() => runAiMitigationRecommendation()} disabled={aiRunning || selectedAreas.length === 0} className="rounded-lg bg-emerald-600 px-3 py-2 text-[8px] font-bold text-white disabled:opacity-40">{aiRunning ? "Menganalisis…" : "Analisis"}</button>
                    </div>
                    {!selectedAreas.length && <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-[8px] text-slate-400">Pilih satu wilayah pada peta terlebih dahulu.</div>}
                    {aiStage && <div className="rounded-lg bg-emerald-50 p-2 text-center text-[8px] text-emerald-700">{aiStage}</div>}
                    {aiError && <div className="rounded-lg border border-red-100 bg-red-50 p-2 text-[8px] text-red-700">{aiError}</div>}
                    {aiMitigation && (
                      <>
                        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div><div className="text-[8px] font-bold uppercase tracking-wider text-emerald-700">Diagnosis</div><div className="mt-1 text-[11px] font-extrabold text-slate-800">{aiMitigation.risk_level}</div></div>
                            <div className="text-right"><div className="text-[7px] text-slate-400">Confidence</div><div className="text-[14px] font-black text-emerald-700">{aiMitigation.confidence}%</div></div>
                          </div>
                          <p className="mt-2 text-[8px] leading-4 text-slate-600">{aiMitigation.diagnosis}</p>
                          {aiMitigation.primary_drivers?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{aiMitigation.primary_drivers.map((x) => <span key={x} className="rounded-full bg-white px-2 py-1 text-[7px] font-semibold text-slate-600">{x}</span>)}</div>}
                        </div>
                        <div className="space-y-2">
                          {aiMitigation.recommendations.slice(0, 3).map((item) => (
                            <div key={`${item.rank}-${item.intervention_id}`} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                              <div className="flex gap-2">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[9px] font-black text-emerald-700">{item.rank}</span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2"><div className="text-[9px] font-extrabold text-slate-800">{item.intervention}</div><span className="text-[13px] font-black text-emerald-700">{item.priority_score}</span></div>
                                  <div className="mt-1 text-[7px] font-bold uppercase tracking-wider text-orange-600">Urgensi: {item.urgency}</div>
                                  <p className="mt-2 text-[8px] leading-4 text-slate-600">{item.why}</p>
                                  {item.evidence?.length > 0 && <div className="mt-2 space-y-1">{item.evidence.slice(0, 4).map((e) => <div key={e} className="text-[7px] text-slate-500">✓ {e}</div>)}</div>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {aiMitigation.verification_needed && <div className="rounded-lg border border-amber-100 bg-amber-50 p-2 text-[8px] leading-4 text-amber-800"><b>⚠ Verifikasi lapangan:</b> {aiMitigation.verification_reason}</div>}
                        <div className="text-[7px] text-slate-400">Model: {aiMitigation.meta?.model || "LLM"} • Generated: {aiMitigation.meta?.generated_at || "—"}</div>
                      </>
                    )}
                  </div>
                )}
                {selectedInfoTab === "Adaptasi" && (
                  <div>
                    <div className="text-[10px] font-bold mb-3">
                      Data Adaptasi
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ["Rehabilitasi DAS", rehabilitasiDasData.length],
                        ["Rehabilitasi Hutan", rehabilitasiHutanData.length],
                        ["Restorasi Gambut", restorasiGambutData.length],
                        ["Teknik KTA", penerapanTeknikKtaData.length],
                      ].map(([l, v]) => (
                        <div key={l} className="border rounded-lg p-3">
                          <div className="text-[8px] text-slate-400">{l}</div>
                          <b className="text-lg">{v}</b>
                          <div className="text-[7px] text-slate-400">
                            record tersedia
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedInfoTab === "Dokumen" && (
                  <div>
                    <div className="text-[10px] font-bold mb-3">
                      Dokumen & Data Terbuka
                    </div>
                    <div className="space-y-2">
                      {[
                        "Laporan kondisi lokasi",
                        "Data layer aktif",
                        "Metadata layer",
                        "Ringkasan API",
                      ].map((x) => (
                        <button
                          key={x}
                          className="w-full text-left border rounded-lg p-3 hover:bg-slate-50"
                        >
                          <div className="text-[9px] font-bold">{x}</div>
                          <div className="text-[8px] text-slate-400 mt-1">
                            Tersedia melalui modul Laporan & Unduhan
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </aside>

            {/* =====================================================
                BOTTOM ANALYTICS — 3 kartu seperti mockup
               ===================================================== */}
            <section className="min-h-0 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1.35fr_1fr_1fr] gap-2">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 overflow-hidden">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[8px] uppercase tracking-wide text-slate-400 font-bold">
                      Tren Kejadian 5 Tahun Terakhir
                    </div>
                    <div className="text-[11px] font-extrabold mt-1">
                      Jumlah Kejadian
                    </div>
                  </div>
                  <span className="text-[8px] text-slate-400">Semua Jenis</span>
                </div>
                <div className="h-[112px] mt-2 flex items-end gap-3 px-2">
                  {[2021, 2022, 2023, 2024, 2025].map((year, i) => {
                    const v =
                      [
                        rawanLimpasanData.length,
                        rawanLongsorData.length,
                        rawanKarhutlaData.length,
                        kejadianListings.length,
                        totalEvents,
                      ][i] || 0;
                    const h = Math.max(5, Math.min(88, v * 8));
                    return (
                      <div
                        key={year}
                        className="flex-1 flex flex-col items-center justify-end gap-1"
                      >
                        <div
                          className="w-full max-w-[22px] rounded-t bg-emerald-500/80"
                          style={{ height: h }}
                        />
                        <span className="text-[7px] text-slate-400">
                          {year}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 overflow-hidden">
                <div className="text-[8px] uppercase tracking-wide text-slate-400 font-bold">
                  Sebaran Tingkat Kerawanan
                </div>
                <div className="flex items-center gap-4 mt-3">
                  <div className="w-[92px] h-[92px] rounded-full border-[16px] border-emerald-400 relative shrink-0">
                    <div className="absolute inset-[-16px] rounded-full border-[16px] border-transparent border-t-orange-400 border-r-amber-300 rotate-12" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <b className="text-sm">
                        {rawanLongsorData.length +
                          rawanLimpasanData.length +
                          rawanKarhutlaData.length}
                      </b>
                      <span className="text-[7px] text-slate-400">kelas</span>
                    </div>
                  </div>
                  <div className="space-y-2 text-[8px]">
                    <div>
                      ● <b>Rendah</b>{" "}
                      <span className="text-slate-400">data tersedia</span>
                    </div>
                    <div>
                      ● <b>Sedang</b>{" "}
                      <span className="text-slate-400">data tersedia</span>
                    </div>
                    <div>
                      ● <b>Tinggi</b>{" "}
                      <span className="text-slate-400">data tersedia</span>
                    </div>
                    <div>
                      ● <b>Sangat Tinggi</b>{" "}
                      <span className="text-slate-400">data tersedia</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 overflow-hidden">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-[8px] uppercase tracking-wide text-slate-400 font-bold">
                      Kejadian Terkini di Sekitar Lokasi
                    </div>
                    <div className="text-[7px] text-slate-400 mt-1">
                      {kejadianListings.length || 0} record
                    </div>
                  </div>
                  <button className="text-[8px] text-emerald-700 font-semibold">
                    Lihat Semua
                  </button>
                </div>
                <div className="mt-2 space-y-1.5">
                  {kejadianListings.slice(0, 4).map((item: any, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center text-[8px]">
                        ⚠
                      </span>
                      <div className="min-w-0 flex-1">
                        <b className="text-[8px] block truncate">
                          {item.title ||
                            item.incident_type ||
                            "Kejadian Bencana"}
                        </b>
                        <span className="text-[7px] text-slate-400">
                          {item.incident_date || "—"}
                        </span>
                      </div>
                    </div>
                  ))}
                  {!kejadianListings.length && (
                    <div className="text-[8px] text-slate-400 py-4">
                      Belum ada kejadian aktif untuk lokasi ini.
                    </div>
                  )}
                </div>
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
                        className={`group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center transition ${
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
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
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

      {/* Photo Lightbox */}
      {selectedPhotoIndex !== null && kejadianPhotos.length > 0 && (
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
                Foto {selectedPhotoIndex + 1} dari {kejadianPhotos.length}
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
          {selectedPhotoIndex < kejadianPhotos.length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedPhotoIndex((prev) =>
                  prev < kejadianPhotos.length - 1 ? prev + 1 : prev,
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
