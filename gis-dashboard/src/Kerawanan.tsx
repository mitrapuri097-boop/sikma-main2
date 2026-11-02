import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "./api";
import Sidebar from "./components/layouts/Sidebar";

const Kerawanan = () => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const selectedAreaBoundaryRef = useRef<any>(null);
  // Menyimpan wilayah hasil klik peta sebagai filter clipping khusus layer kerawanan.
  const selectedMapAreaRef = useRef<any>(null);
  const areaBoundaryRequestRef = useRef(0);
  const layerGroupsRef = useRef({});
  const navigate = useNavigate();
  // Navigasi utama halaman Kerawanan: sidebar dapat di-collapse di desktop
  // dan dibuka sebagai drawer pada perangkat mobile.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // State panel harus dideklarasikan sebelum useEffect yang menggunakannya.
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(true);
  // Panel grafik/tabel disembunyikan saat pertama kali halaman dibuka.
  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set());
  const [isLoadingLayer, setIsLoadingLayer] = useState(false);
  const [loadingLayerNames, setLoadingLayerNames] = useState<Set<string>>(
    new Set(),
  );
  const [layerError, setLayerError] = useState<string>("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
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

  // MY LOKASI: popup awal, hasil GPS, dan analisis ancaman radius 5 km.
  const [isMyLocationPopupOpen, setIsMyLocationPopupOpen] = useState(true);
  const [myLocationStatus, setMyLocationStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [myLocationError, setMyLocationError] = useState("");
  const [myLocationData, setMyLocationData] = useState<any>(null);
  const [myLocationAnalysis, setMyLocationAnalysis] = useState<any>(null);
  const myLocationLayersRef = useRef<any[]>([]);
  const myLocationRequestRef = useRef(0);

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

  const colorMappingRef = useRef<{
    tutupanLahan: Map<string, string>;
    geologi: Map<string, string>;
    jenisTanah: Map<string, string>;
    lahanKritis: Map<string, string>;
    rawanErosi: Map<string, string>;
    rawanLongsor: Map<string, string>;
    rawanLimpasan: Map<string, string>;
    rawanKarhutla: Map<string, string>;
  }>({
    tutupanLahan: new Map(),
    geologi: new Map(),
    jenisTanah: new Map(),
    lahanKritis: new Map(),
    rawanErosi: new Map(),
    rawanLongsor: new Map(),
    rawanLimpasan: new Map(),
    rawanKarhutla: new Map(),
  });

  const tutupanLahanColors = [
    "#10B981",
    "#3B82F6",
    "#F59E0B",
    "#EF4444",
    "#8B5CF6",
    "#EC4899",
    "#14B8A6",
    "#F97316",
    "#6366F1",
    "#84CC16",
    "#06B6D4",
    "#A855F7",
    "#EAB308",
    "#22C55E",
    "#0EA5E9",
  ];

  // Perbesar geologiColors menjadi 30+ warna
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

  // Warna kerawanan berdasarkan tingkat risiko
  const rawanErosiColors: Record<string, string> = {
    "15": "#90EE90",
    "60": "#FFFF00",
    "180": "#FFA500",
    "480": "#FF4500",
    ">480": "#8B0000",
  };

  const rawanLongsorColors = {
    Tinggi: "#FF4500",
    Menengah: "#FFA500",
    Rendah: "#FFFF00",
    "Sangat Rendah": "#90EE90",
    "Alur Aliran Bahan Rombakan": "#808080",
    Danau: "#1E90FF",
    "Danau Tapal Kuda": "#4169E1",
    "Danau/Situ": "#00BFFF",
    Waduk: "#4682B4",
  };

  const rawanLimpasanColors = {
    Ekstrim: "#8B0000",
    Tinggi: "#FF4500",
    Rendah: "#FFFF00",
    Normal: "#90EE90",
  };

  const rawanKarhutlaColors = {
    "Sangat Tinggi": "#8B0000",
    Tinggi: "#FF4500",
    Sedang: "#FFA500",
    Rendah: "#90EE90",
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

  //   const loadLayerInBounds = async (tableName: string, customBounds?: [[number, number], [number, number]]) => {
  //   if (!mapInstanceRef.current || !window.L) {
  //     console.log('Map not ready');
  //     return;
  //   }

  //   try {
  //     const zoom = mapInstanceRef.current.getZoom();
  //     let boundsString = '';

  //     const boundsToUse = customBounds || currentBounds;

  //     if (boundsToUse) {
  //       const [[minLat, minLng], [maxLat, maxLng]] = boundsToUse;
  //       boundsString = `${minLat},${minLng},${maxLat},${maxLng}`;
  //       console.log('Loading layer:', tableName, 'zoom:', zoom, 'bounds:', boundsString);
  //     } else {
  //       boundsString = '-11,95,6,141';
  //       console.log('Loading layer:', tableName, 'zoom:', zoom, 'Indonesia bounds (no filter)');
  //     }

  //     const dasFilter = selectedDas.length > 0 ? selectedDas.map(d => d.nama_das) : null;
  //     const dasFilterParam = dasFilter ? `&dasFilter=${encodeURIComponent(JSON.stringify(dasFilter))}` : '';

  //     console.log('DAS Filter for layer:', dasFilter);

  //     const response = await fetch(
  //       `${API_URL}/api/layers/${tableName}/geojson?bounds=${boundsString}&zoom=${zoom}${dasFilterParam}`
  //     );

  //     if (!response.ok) {
  //       throw new Error(`HTTP error! status: ${response.status}`);
  //     }

  //     const geojsonData = await response.json();
  //     console.log('GeoJSON data received for', tableName, ':', geojsonData.features?.length || 0, 'features');

  //     // Log sample feature untuk debug
  //     if (geojsonData.features && geojsonData.features.length > 0) {
  //       console.log('Sample feature properties:', geojsonData.features[0].properties);
  //     }

  //     // Hapus layer lama jika ada
  //     if (layerGroupsRef.current[tableName]) {
  //       mapInstanceRef.current.removeLayer(layerGroupsRef.current[tableName]);
  //     }

  //     if (!geojsonData.features || geojsonData.features.length === 0) {
  //       console.warn('No features found in bounds for:', tableName);
  //       layerGroupsRef.current[tableName] = window.L.layerGroup();
  //       layerGroupsRef.current[tableName].addTo(mapInstanceRef.current);
  //       return;
  //     }

  //     // PERBAIKAN: Build color map LANGSUNG dari GeoJSON features
  //     let colorMap = new Map();

  //     if (tableName === 'tutupan_lahan') {
  //       // Fetch data untuk populate tabel bottom tabs
  //       const fetchedData = await fetchTutupanLahanData();

  //       // Extract unique pl2024_id dari GeoJSON
  //       const uniquePl2024Ids = new Set<string>();
  //       geojsonData.features.forEach((feature: any) => {
  //         uniquePl2024Ids.add(String(feature.properties.pl2024_id));
  //       });

  //       // Assign colors
  //       let colorIndex = 0;
  //       uniquePl2024Ids.forEach(pl2024_id => {
  //         colorMap.set(pl2024_id, tutupanLahanColors[colorIndex % tutupanLahanColors.length]);
  //         colorIndex++;
  //       });

  //       console.log('Building color map for tutupan_lahan, unique count:', uniquePl2024Ids.size);

  //     } else if (tableName === 'geologi') {
  //       // Extract unique combinations dari GeoJSON
  //       const uniqueCombinations = new Map<string, {namobj: string, umurobj: string}>();

  //       geojsonData.features.forEach((feature: any) => {
  //         const namobj = feature.properties.namobj || '';
  //         const umurobj = feature.properties.umurobj || '';
  //         const key = `${namobj}|${umurobj}`;

  //         if (!uniqueCombinations.has(key)) {
  //           uniqueCombinations.set(key, { namobj, umurobj });
  //         }
  //       });

  //       // Assign colors berdasarkan urutan sorted
  //       const sortedKeys = Array.from(uniqueCombinations.keys()).sort();
  //       sortedKeys.forEach((key, index) => {
  //         colorMap.set(key, geologiColors[index % geologiColors.length]);
  //         console.log(`Map: ${key} -> ${geologiColors[index % geologiColors.length]}`);
  //       });

  //       console.log('Building color map for geologi, unique count:', uniqueCombinations.size);

  //       // PENTING: Update geologiData untuk tabel bottom tabs dengan data yang sudah di-aggregate
  //       const aggregatedData: any[] = [];
  //       const aggregateMap = new Map<string, number>();

  //       geojsonData.features.forEach((feature: any) => {
  //         const namobj = feature.properties.namobj || '';
  //         const umurobj = feature.properties.umurobj || '';
  //         const keliling = parseFloat(feature.properties.keliling_m || 0);
  //         const key = `${namobj}|${umurobj}`;

  //         if (aggregateMap.has(key)) {
  //           aggregateMap.set(key, aggregateMap.get(key)! + keliling);
  //         } else {
  //           aggregateMap.set(key, keliling);
  //         }
  //       });

  //       // Convert to array with colors
  //       sortedKeys.forEach(key => {
  //         const [namobj, umurobj] = key.split('|');
  //         aggregatedData.push({
  //           namobj,
  //           umurobj,
  //           keliling_total: aggregateMap.get(key) || 0,
  //           color: colorMap.get(key)
  //         });
  //       });

  //       setGeologiData(aggregatedData);
  //       console.log('Geologi data set from GeoJSON:', aggregatedData.length);
  //     }

  //     // MODIFIKASI: Styling berdasarkan tabel dengan color map yang sudah dibangun
  //     let styleFunction;

  //     if (tableName === 'tutupan_lahan') {
  //       styleFunction = function(feature: any) {
  //         const pl2024_id = String(feature.properties.pl2024_id);
  //         const fillColor = colorMap.get(pl2024_id) || '#EF4444';

  //         return {
  //           color: fillColor,
  //           weight: zoom > 10 ? 2 : 1,
  //           opacity: 0.8,
  //           fillColor: fillColor,
  //           fillOpacity: zoom > 10 ? 0.4 : 0.3
  //         };
  //       };
  //     } else if (tableName === 'geologi') {
  //       styleFunction = function(feature: any) {
  //         const namobj = feature.properties.namobj || '';
  //         const umurobj = feature.properties.umurobj || '';
  //         const key = `${namobj}|${umurobj}`;
  //         const fillColor = colorMap.get(key) || '#B45309';

  //         return {
  //           color: fillColor,
  //           weight: zoom > 10 ? 2 : 1,
  //           opacity: 0.8,
  //           fillColor: fillColor,
  //           fillOpacity: zoom > 10 ? 0.4 : 0.3
  //         };
  //       };
  //     } else {
  //       const tableColor = getColorForTable(tableName);
  //       styleFunction = function(feature: any) {
  //         return {
  //           color: tableColor,
  //           weight: zoom > 10 ? 2 : 1,
  //           opacity: 0.8,
  //           fillOpacity: zoom > 10 ? 0.4 : 0.3
  //         };
  //       };
  //     }

  //     // Buat layer group baru dengan styling dinamis
  //     const layerGroup = window.L.geoJSON(geojsonData, {
  //       pane: 'overlayPane',
  //       style: styleFunction,
  //       pointToLayer: function(feature, latlng) {
  //         const tableColor = getColorForTable(tableName);
  //         return window.L.circleMarker(latlng, {
  //           radius: zoom > 10 ? 6 : 4,
  //           fillColor: tableColor,
  //           color: '#000',
  //           weight: 1,
  //           opacity: 1,
  //           fillOpacity: 0.7
  //         });
  //       },
  //       onEachFeature: function(feature, layer) {
  //         if (zoom > 8 && feature.properties) {
  //           let popupContent = '<div style="max-height: 200px; overflow-y: auto;">';
  //           popupContent += `<h3 style="margin: 0 0 8px 0; font-weight: bold;">${tableName}</h3>`;
  //           for (const [key, value] of Object.entries(feature.properties)) {
  //             if (key !== 'geom' && key !== 'geometry') {
  //               popupContent += `<p style="margin: 2px 0;"><strong>${key}:</strong> ${value}</p>`;
  //             }
  //           }
  //           popupContent += '</div>';
  //           layer.bindPopup(popupContent);
  //         }
  //       }
  //     });

  //     layerGroup.addTo(mapInstanceRef.current);
  //     layerGroupsRef.current[tableName] = layerGroup;

  //     const boundsType = currentBounds ? 'administrative bounds' : 'Indonesia bounds (all data)';
  //     console.log(`Layer loaded successfully with ${boundsType}`);

  //   } catch (error) {
  //     console.error('Error loading layer in bounds:', error);
  //   }
  // };

  const loadLayerInBounds = async (
    tableName: string,
    customBounds?: [[number, number], [number, number]],
    areasOverride?: Array<any>,
  ) => {
    if (!mapInstanceRef.current || !window.L) {
      console.log("Map not ready");
      return;
    }

    try {
      setIsLoadingLayer(true);
      setLoadingLayerNames((prev) => new Set([...prev, tableName]));
      setLayerError("");

      const zoom = mapInstanceRef.current.getZoom();
      let boundsString = "";

      const boundsToUse = customBounds || currentBounds;

      if (boundsToUse) {
        const [[minLat, minLng], [maxLat, maxLng]] = boundsToUse;
        boundsString = `${minLat},${minLng},${maxLat},${maxLng}`;
      } else {
        boundsString = "-11,95,6,141";
      }

      // Build URL dengan filter administrasi/DAS
      let url = `${API_URL}/api/layers/${tableName}/geojson?bounds=${boundsString}&zoom=${zoom}`;

      // Gunakan wilayah hasil klik peta untuk MEMOTONG layer kerawanan saja.
      // Layer lain tetap mengikuti filter administrasi/DAS yang sudah ada.
      const isKerawananLayer = [
        ...(layerData.kerawanan || []),
        ...(availableLayers.kerawanan || []),
      ].some((layer) => layer?.name === tableName);
      const selectedMapArea = isKerawananLayer
        ? selectedMapAreaRef.current
        : null;
      const mapAreaFilterKey = selectedMapArea
        ? `${selectedMapArea.level}|${selectedMapArea.label}|${selectedMapArea.latitude}|${selectedMapArea.longitude}`
        : "";

      // Gunakan pilihan daerah terbaru jika dikirim oleh updateMapBounds.
      // Pilihan dari klik peta hanya menjadi prioritas untuk layer kerawanan.
      const areasToUse = selectedMapArea
        ? [selectedMapArea]
        : areasOverride ?? selectedAreas;
      const dasToUse = selectedMapArea
        ? []
        : areasOverride !== undefined
          ? []
          : selectedDas;

      // Prioritas: DAS > Administrasi
      if (dasToUse.length > 0) {
        const dasNames = dasToUse.map((d) => d.nama_das);
        url += `&dasFilter=${encodeURIComponent(JSON.stringify(dasNames))}`;
        console.log(
          "🔄 Loading layer with DAS filtering:",
          tableName,
          dasNames,
        );
      } else if (areasToUse.length > 0) {
        const firstArea = areasToUse[0];
        const adminLevel = firstArea.level;

        const adminNames = areasToUse
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

        // Koordinat klik mengunci tepat satu polygon, termasuk jika nama
        // kelurahan yang sama muncul di kecamatan/kabupaten berbeda.
        if (selectedMapArea && Number.isFinite(selectedMapArea.latitude) && Number.isFinite(selectedMapArea.longitude)) {
          url += `&clipLatitude=${encodeURIComponent(String(selectedMapArea.latitude))}`;
          url += `&clipLongitude=${encodeURIComponent(String(selectedMapArea.longitude))}`;
        }

        console.log(
          "🔄 Loading layer with admin filtering:",
          tableName,
          adminLevel,
          adminNames,
        );
      }

      console.log(`🔄 Memuat layer: ${tableName}...`);

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("smiti_token")}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const geojsonData = await response.json();

      // Abaikan hasil request lama jika pengguna sudah memilih polygon lain
      // saat request layer kerawanan sebelumnya masih berjalan.
      if (isKerawananLayer) {
        const currentMapArea = selectedMapAreaRef.current;
        const currentMapAreaKey = currentMapArea
          ? `${currentMapArea.level}|${currentMapArea.label}|${currentMapArea.latitude}|${currentMapArea.longitude}`
          : "";
        if (currentMapAreaKey !== mapAreaFilterKey) {
          console.info(
            `[SIMITI] Abaikan response ${tableName}: pilihan polygon berubah selama pemuatan.`,
          );
          return;
        }
      }

      console.log(
        "✅ GeoJSON data received for",
        tableName,
        ":",
        geojsonData.features?.length || 0,
        "features",
      );

      // Tampilkan peringatan jika LIMIT tercapai
      // if (geojsonData.limitReached) {
      //   console.warn(`⚠️ PERINGATAN: Layer ${tableName} mencapai batas maksimum 5000 features.`);
      //   setLayerError(`⚠️ Layer "${tableName}" mencapai batas 5000 features. Zoom in untuk detail lebih lanjut.`);
      //   setTimeout(() => setLayerError(''), 8000);
      // }

      // Hapus layer lama
      if (layerGroupsRef.current[tableName]) {
        mapInstanceRef.current.removeLayer(layerGroupsRef.current[tableName]);
      }

      if (!geojsonData.features || geojsonData.features.length === 0) {
        console.warn("ℹ️ No features found for:", tableName);
        setLayerError(
          `ℹ️ Tidak ada data "${tableName}" di area yang dipilih.`,
        );
        setTimeout(() => setLayerError(""), 5000);
        layerGroupsRef.current[tableName] = window.L.layerGroup();
        layerGroupsRef.current[tableName].addTo(mapInstanceRef.current);
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

        const uniquePl2024Ids = new Set<string>();
        geojsonData.features.forEach((feature: any) => {
          uniquePl2024Ids.add(String(feature.properties.pl2024_id));
        });

        const sortedIds = Array.from(uniquePl2024Ids).sort();
        sortedIds.forEach((pl2024_id) => {
          if (!colorMappingRef.current.tutupanLahan.has(pl2024_id)) {
            const colorIndex = colorMappingRef.current.tutupanLahan.size;
            const color =
              tutupanLahanColors[colorIndex % tutupanLahanColors.length];
            colorMappingRef.current.tutupanLahan.set(pl2024_id, color);
          }
          colorMap.set(
            pl2024_id,
            colorMappingRef.current.tutupanLahan.get(pl2024_id)!,
          );
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
        });
      } else if (tableName === "rawan_erosi") {
        const tingkatMap = new Map<string, number>();

        geojsonData.features.forEach((feature: any) => {
          const tingkat = String(feature.properties?.kls_a ?? "").trim();
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

        const tingkatOrder = [">480", "480", "180", "60", "15"];

        erosiArray.sort((a, b) =>
          tingkatOrder.indexOf(a.tingkat) - tingkatOrder.indexOf(b.tingkat)
        );

        setRawanErosiData(erosiArray);

        erosiArray.forEach((item) => {
          colorMap.set(item.tingkat, item.color!);
        });} else if (tableName === "rawan_longsor") {
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
        });
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
          const tingkat = feature.properties.kls_a || "";
          const fillColor = colorMap.get(tingkat) || "#808080";
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
      } else {
        const tableColor = getColorForTable(tableName);
        styleFunction = function (feature: any) {
          return {
            color: tableColor,
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

      layerGroup.addTo(mapInstanceRef.current);
      layerGroupsRef.current[tableName] = layerGroup;

      const filterType =
        mapAreaFilterKey
          ? `selected polygon clipping (${selectedMapArea?.label || "area"})`
          : selectedDas.length > 0
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
        const dataWithColors = result.data.map((item: any, index: number) => ({
          ...item,
          color: tutupanLahanColors[index % tutupanLahanColors.length],
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
          allListings.push(...data.features.map((f: any) => f.properties));
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

      // Filter bencana:
      // - DAS tetap dipakai jika tersedia.
      // - Daerah terpilih WAJIB tetap menjadi filter administratif.
      // Jadi filter DAS tidak boleh menghilangkan filter daerah.
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
      }

      if (selectedAreas.length > 0) {
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
          "Using mandatory selected-area filter:",
          adminLevel,
          adminNames,
        );
      }

      console.log("Loading kejadian layer:", layerName, "Full URL:", url);

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("smiti_token")}`,
        },
      });

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
        mapInstanceRef.current.removeLayer(layerGroupsRef.current[layerName]);
      }

      if (!geojsonData.features || geojsonData.features.length === 0) {
        console.warn("No kejadian found for:", layerName);
        layerGroupsRef.current[layerName] = window.L.layerGroup();
        layerGroupsRef.current[layerName].addTo(mapInstanceRef.current);
        return;
      }

      // Function untuk create custom icon berdasarkan category
      const createKejadianIcon = (category: string) => {
        let iconSVG = "";
        let bgColor = "#3b82f6"; // default blue

        if (category === "Banjir") {
          bgColor = "#3b82f6"; // blue
          iconSVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
        </svg>`;
        } else if (category === "Tanah Longsor dan Erosi") {
          bgColor = "#22c55e"; // green
          iconSVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
        </svg>`;
        } else if (category === "Kebakaran Hutan dan Kekeringan") {
          bgColor = "#ef4444"; // red
          iconSVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
          <path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/>
        </svg>`;
        }

        return window.L.divIcon({
          className: "custom-kejadian-marker",
          html: `
          <div class="marker-container" style="position: relative; width: 44px; height: 44px; cursor: pointer;">
            <svg class="marker-circle" width="44" height="44" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">
              <circle class="marker-bg" cx="22" cy="22" r="20" fill="${bgColor}" stroke="white" stroke-width="3" 
                style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); transition: fill 0.2s ease;"/>
            </svg>
            <div style="position: absolute; top: 12px; left: 12px; pointer-events: none;">
              ${iconSVG}
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

        // Store incident data
        (marker as any).incidentData = {
          id: props.id,
          title: props.title,
          image: props.thumbnail_path
            ? `${API_URL}${props.thumbnail_path}`
            : "https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=400",
          location: props.location,
          category: props.category,
          date: props.date,
          das: props.das,
          description: props.description,
          images_paths: props.images_paths,
        };

        // Add click event
        marker.on("click", function (e: any) {
          const inc = (this as any).incidentData;
          if (!inc) return;

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
          mapInstanceRef.current?.removeLayer(layerGroupsRef.current[key]);
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
      mapInstanceRef.current?.removeLayer(layerGroupsRef.current[boundaryKey]);
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
      const kejadianResponse = await fetch(`${API_URL}/api/layers`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("smiti_token")}`,
        },
      });
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

      // setTimeout(async () => {
      //   for (const tableName of activeLayers) {
      //     if (tableName.startsWith('kejadian_')) {
      //       const year = parseInt(tableName.replace('kejadian_', ''));
      //       await loadKejadianLayer(tableName, year);
      //     } else {
      //       await loadLayerInBounds(tableName, null);
      //     }
      //   }
      // }, 100);
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
        // Bounds daerah menjadi sumber fokus utama peta.
        // Checkbox bencana nantinya hanya memuat data di area ini.
        setCurrentBounds(data.bounds);
        mapInstanceRef.current.fitBounds(data.bounds, { padding: [50, 50] });

        // Check available layers in these bounds
        await checkLayerAvailability(data.bounds);

        // Tunggu sebentar agar state ter-update, lalu reload layers
        // setTimeout(async () => {
        //   const dasNames = dasList.map(d => d.nama_das);
        //   for (const tableName of activeLayers) {
        //     if (tableName.startsWith('kejadian_')) {
        //       const year = parseInt(tableName.replace('kejadian_', ''));
        //       await loadKejadianLayer(tableName, year, dasNames);
        //     } else {
        //       await loadLayerInBounds(tableName, data.bounds); // PASS BOUNDS LANGSUNG
        //     }
        //   }
        // }, 100);
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

      // Clear selected DAS when area is selected
      setSelectedDas([]);

      // Clear ALL DAS boundaries when switching to admin areas
      Object.keys(layerGroupsRef.current).forEach((key) => {
        if (key.startsWith("das_boundary")) {
          mapInstanceRef.current?.removeLayer(layerGroupsRef.current[key]);
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
      mapInstanceRef.current?.removeLayer(layerGroupsRef.current[boundaryKey]);
      delete layerGroupsRef.current[boundaryKey];
      console.log("🗑️ Removed admin boundary:", boundaryKey);
    }

    if (newSelectedAreas.length > 0) {
      await updateMapBounds(newSelectedAreas);
    } else {
      setCurrentBounds(null);
      setSelectedDas([]);

      // const kejadianResponse = await fetch('${API_URL}/api/kejadian/years');
      const kejadianResponse = await fetch(`${API_URL}/api/layers`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("smiti_token")}`,
        },
      });
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

      // setTimeout(async () => {
      //   for (const tableName of activeLayers) {
      //     if (tableName.startsWith('kejadian_')) {
      //       const year = parseInt(tableName.replace('kejadian_', ''));
      //       await loadKejadianLayer(tableName, year);
      //     } else {
      //       await loadLayerInBounds(tableName, null);
      //     }
      //   }
      // }, 100);
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

        // Tunggu sebentar agar state ter-update, lalu reload layers
        // setTimeout(async () => {
        //   for (const tableName of activeLayers) {
        //     if (tableName.startsWith('kejadian_')) {
        //       const year = parseInt(tableName.replace('kejadian_', ''));
        //       await loadKejadianLayer(tableName, year, null);
        //     } else {
        //       await loadLayerInBounds(tableName, data.bounds); // PASS BOUNDS LANGSUNG
        //     }
        //   }
        // }, 100);
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
              await loadLayerInBounds(tableName, data.bounds, areas);
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
            Authorization: `Bearer ${localStorage.getItem("smiti_token")}`,
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
          category: string;
          year: number;
          count: number;
        }>,
      };

      // Add regular layers
      layersData.availableLayers.forEach((layer: any) => {
        if (grouped[layer.section as keyof typeof grouped]) {
          grouped[layer.section as keyof typeof grouped].push({
            id: layer.id,
            name: layer.name,
          });
        }
      });

      // Add kejadian layers for available category + year combinations
      if (
        kejadianData.availableKejadian &&
        kejadianData.availableKejadian.length > 0
      ) {
        grouped.kejadian = kejadianData.availableKejadian.map((item: any) => ({
          id: `kejadian_${item.category.replace(/\s+/g, "_")}_${item.year}`,
          name: `${item.category} ${item.year}`,
          category: item.category,
          year: item.year,
          count: item.count,
        }));
      }

      // Jangan menghapus checkbox kejadian hanya karena endpoint availability
      // mengembalikan 0 data untuk daerah terpilih. Checkbox tetap berasal dari
      // katalog layer, sedangkan request data tetap memakai filter daerah.
      const kejadianCatalog = layerData.kejadian || [];
      const availableById = new Map(
        grouped.kejadian.map((item: any) => [item.id, item]),
      );
      const mergedKejadian = kejadianCatalog.map((item: any) => ({
        ...item,
        ...(availableById.get(item.id) || {}),
      }));
      const mergedIds = new Set(mergedKejadian.map((item: any) => item.id));
      grouped.kejadian.forEach((item: any) => {
        if (!mergedIds.has(item.id)) mergedKejadian.push(item);
      });
      grouped.kejadian = mergedKejadian;

      console.log(
        "Grouped available layers (kejadian catalog preserved):",
        grouped,
      );
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

  // const reloadActiveLayers = () => {
  //   if (isLoadingLayer) return; // Hindari multiple reload

  //   activeLayers.forEach(tableName => {
  //     loadLayerInBounds(tableName);
  //   });
  // };

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

          setAvailableLayers((prev) => {
            // Availability dipakai untuk memperbarui metadata/count, tetapi
            // checkbox tetap menggunakan seluruh katalog kejadian yang sudah
            // dimuat dari /api/layers.
            const catalog = layerData.kejadian || prev.kejadian || [];
            const byId = new Map(
              updatedKejadian.map((item: any) => [item.id, item]),
            );
            const merged = catalog.map((item: any) => ({
              ...item,
              ...(byId.get(item.id) || {}),
            }));
            const ids = new Set(merged.map((item: any) => item.id));
            updatedKejadian.forEach((item: any) => {
              if (!ids.has(item.id)) merged.push(item);
            });
            return {
              ...prev,
              kejadian: merged,
            };
          });
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

    if (isChecked) {
      // Saat checkbox Kerawanan dipilih, langsung tampilkan tab layer tersebut
      // pada panel bawah agar legenda tidak tertinggal di tab sebelumnya.
      const isKerawananLayer = [...(layerData.kerawanan || []), ...(availableLayers.kerawanan || [])]
        .some((layer) => layer?.name === tableName);
      if (isKerawananLayer) setActiveBottomTab(tableName);

      // Tambahkan layer ke active layers
      setActiveLayers((prev) => new Set([...prev, tableName]));

      // Jika daerah sudah dipilih, checkbox bencana tidak boleh
      // menggeser fokus peta. Kembalikan/pertahankan fokus ke bounds daerah.
      if (
        tableName.startsWith("kejadian_") &&
        selectedAreas.length > 0 &&
        currentBounds &&
        mapInstanceRef.current
      ) {
        console.log(
          "Keeping map focused on selected area before loading kejadian:",
          selectedAreas,
          currentBounds,
        );
        mapInstanceRef.current.fitBounds(currentBounds, { padding: [50, 50] });
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
    } else {
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
      } else {
        console.log("Layer not found in layerGroupsRef or map not ready");
      }
    }
  };

  // Fungsi helper untuk generate warna konsisten berdasarkan nama tabel
  const getColorForTable = (tableName: string) => {
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
      "#E74C3C",
      "#3498DB",
      "#9B59B6",
      "#1ABC9C",
      "#F39C12",
      "#D35400",
      "#C0392B",
      "#2980B9",
      "#8E44AD",
      "#16A085",
    ];

    // Generate hash dari nama tabel untuk mendapatkan index yang konsisten
    let hash = 0;
    for (let i = 0; i < tableName.length; i++) {
      hash = tableName.charCodeAt(i) + ((hash << 5) - hash);
    }

    const index = Math.abs(hash) % colors.length;
    return colors[index];
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

  // const fetchKejadianYears = async () => {
  //   try {
  //     const response = await fetch(`${API_URL}/api/kejadian/years`);
  //     const data = await response.json();

  //     const kejadianLayers = data.years.map((year: number) => ({
  //       id: `kejadian_${year}`,
  //       name: `kejadian_${year}`,
  //       year: year
  //     }));

  //     setLayerData(prev => ({
  //       ...prev,
  //       kejadian: kejadianLayers
  //     }));

  //     setAvailableLayers(prev => ({
  //       ...prev,
  //       kejadian: kejadianLayers
  //     }));

  //   } catch (error) {
  //     console.error('Error fetching kejadian years:', error);
  //   }
  // };

  const fetchLayers = async () => {
    try {
      const response = await fetch(`${API_URL}/api/layers`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("smiti_token")}`,
        },
      });
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

  // useEffect(() => {
  //   if (!mapReady || !mapInstanceRef.current) return;

  //   console.log('Active layers changed:', Array.from(activeLayers));

  //   // Reload semua active layers dengan bounds terbaru
  //   const reloadLayers = async () => {
  //     if (isLoadingLayer) return;

  //     setIsLoadingLayer(true);

  //     for (const tableName of activeLayers) {
  //       await loadLayerInBounds(tableName);
  //     }

  //     setIsLoadingLayer(false);
  //   };

  //   reloadLayers();
  // }, [activeLayers, mapReady]);

  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const handleZoomEnd = async () => {
      const currentZoom = mapInstanceRef.current.getZoom();
      console.log(
        "Zoom changed to:",
        currentZoom,
        "- Reloading layers for new simplification level",
      );

      const layersToReload = Array.from(activeLayers);
      console.log("Reloading active layers:", layersToReload);

      for (const layerName of layersToReload) {
        if (layerName.startsWith("kejadian_")) {
          // Ambil metadata yang tersimpan
          const metadata = activeKejadianLayers.get(layerName);
          if (metadata) {
            await loadKejadianLayer(
              layerName,
              metadata.year,
              metadata.category,
            );
          } else {
            console.warn("No metadata found for kejadian layer:", layerName);
          }
        } else {
          await loadLayerInBounds(layerName);
        }
      }
    };

    mapInstanceRef.current.on("zoomend", handleZoomEnd);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.off("zoomend", handleZoomEnd);
      }
    };
  }, [activeLayers, activeKejadianLayers, currentBounds, selectedDas]);

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

  //   useEffect(() => {
  //   if (!mapReady || activeLayers.size === 0) return;

  //   // Reload semua active layers dengan bounds yang baru
  //   const reloadAllLayers = async () => {
  //     console.log('CurrentBounds changed, reloading active layers:', Array.from(activeLayers));
  //     for (const tableName of activeLayers) {
  //       await loadLayerInBounds(tableName);
  //     }
  //   };

  //   reloadAllLayers();
  // }, [currentBounds, mapReady]);

  useEffect(() => {
    let cancelled = false;

    // Load Leaflet CSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    // Load Leaflet JS
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => {
      if (
        !cancelled &&
        mapRef.current &&
        window.L &&
        !mapInstanceRef.current &&
        !(mapRef.current as any)._leaflet_id
      ) {
        const map = window.L.map(mapRef.current).setView([-2.5, 118.0], 5);
        window.L.tileLayer(
          "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            attribution: "&copy; OpenStreetMap contributors",
          },
        ).addTo(map);

        // Simpan instance map ke ref
        mapInstanceRef.current = map;

        // Klik peta: deteksi kelurahan dari koordinat dan tampilkan batas asli PostGIS.
        // Layer khusus ini terpisah dari layer kerawanan/kejadian agar tidak mengganggu fitur lain.
        const handleAdministrativeMapClick = async (event: any) => {
          const requestId = ++areaBoundaryRequestRef.current;
          const latitude = Number(event?.latlng?.lat);
          const longitude = Number(event?.latlng?.lng);

          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

          map.closePopup();

          if (selectedAreaBoundaryRef.current) {
            map.removeLayer(selectedAreaBoundaryRef.current);
            selectedAreaBoundaryRef.current = null;
          }

          try {
            const response = await fetch(`${API_URL}/api/spatial/area-boundary`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ latitude, longitude }),
            });

            const result = await response.json();

            // Abaikan respons lama jika pengguna sudah mengklik titik lain.
            if (requestId !== areaBoundaryRequestRef.current) return;

            if (!response.ok || !result?.success || !result?.data?.geom) {
              console.info(
                "[SIMITI] Tidak ditemukan batas administrasi pada titik ini:",
                result?.message || response.statusText,
              );
              return;
            }

            const area = result.data;

            // Simpan polygon administrasi yang benar-benar terdeteksi PostGIS.
            // Bentuk ini sesuai kontrak adminFilter yang sudah didukung backend.
            const areaLevel = String(area.level || "kelurahan").toLowerCase();
            const areaFilter: any = {
              label: area.label,
              level: areaLevel,
              latitude,
              longitude,
            };
            if (areaLevel === "kelurahan") areaFilter.kel_desa = area.label;
            else if (areaLevel === "kecamatan") areaFilter.kecamatan = area.label;
            else if (areaLevel === "kabupaten") areaFilter.kab_kota = area.label;
            else if (areaLevel === "provinsi") areaFilter.provinsi = area.label;

            selectedMapAreaRef.current = areaFilter;

            // Layer kerawanan yang sudah aktif harus dimuat ulang dengan
            // adminFilter agar PostGIS memotong geometri tepat pada polygon ini.
            const activeRiskLayers = Array.from(activeLayers).filter((name) =>
              [
                ...(layerData.kerawanan || []),
                ...(availableLayers.kerawanan || []),
              ].some((layer) => layer?.name === name),
            );

            const escapeHtml = (value: any) =>
              String(value ?? "-").replace(/[&<>"']/g, (char) => {
                const entities: Record<string, string> = {
                  "&": "&amp;",
                  "<": "&lt;",
                  ">": "&gt;",
                  '"': "&quot;",
                  "'": "&#39;",
                };
                return entities[char];
              });

            const boundaryLayer = window.L.geoJSON(
              {
                type: "Feature",
                properties: {},
                geometry: area.geom,
              },
              {
                interactive: false,
                style: {
                  color: "#F59E0B",
                  weight: 3,
                  opacity: 1,
                  fillColor: "#FDE68A",
                  fillOpacity: 0.28,
                  dashArray: "7 4",
                },
              },
            ).addTo(map);

            selectedAreaBoundaryRef.current = boundaryLayer;
            if (typeof boundaryLayer.bringToFront === "function") {
              boundaryLayer.bringToFront();
            }

            const properties = [
              ["Kelurahan / Desa", area.level === "kelurahan" ? area.label : "-"],
              ["Kecamatan", area.kecamatan],
              ["Kabupaten / Kota", area.kab_kota],
              ["Provinsi", area.provinsi],
            ].filter(([, value]) => value);

            const detailRows = properties
              .map(
                ([label, value]) => `
                  <div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid #eef2f7;">
                    <span style="flex:0 0 112px;color:#64748b;font-size:12px;">${escapeHtml(label)}</span>
                    <strong style="flex:1;color:#0f172a;font-size:12px;line-height:1.45;">${escapeHtml(value)}</strong>
                  </div>
                `,
              )
              .join("");

            const popupContent = `
              <div style="width:310px;max-width:calc(100vw - 90px);font-family:Arial,sans-serif;">
                <div data-area-drag-handle="true" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;background:#0f3b5d;color:#fff;border-radius:10px 10px 0 0;cursor:grab;user-select:none;touch-action:none;">
                  <div>
                    <div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;opacity:.78;">Wilayah terpilih</div>
                    <div style="font-size:15px;font-weight:700;margin-top:3px;">${escapeHtml(area.label)}</div>
                  </div>
                  <button type="button" data-area-close="true" aria-label="Tutup informasi kelurahan" title="Tutup" style="flex:0 0 28px;width:28px;height:28px;border:0;border-radius:50%;background:rgba(255,255,255,.18);color:#fff;font-size:21px;line-height:1;cursor:pointer;">&times;</button>
                </div>
                <div style="padding:10px 14px 12px;background:#fff;">
                  ${detailRows}
                  <div style="padding-top:9px;color:#64748b;font-size:11px;line-height:1.5;">
                    Titik klik: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}
                  </div>
                  <div style="padding-top:5px;color:#94a3b8;font-size:10px;">Geser bagian judul untuk memindahkan popup</div>
                </div>
              </div>
            `;

            const popup = window.L.popup({
              className: "custom-area-popup",
              closeButton: false,
              autoClose: true,
              closeOnClick: false,
              autoPan: true,
              maxWidth: 350,
              minWidth: 280,
              offset: [0, -8],
            })
              .setLatLng(boundaryLayer.getBounds().getCenter())
              .setContent(popupContent)
              .openOn(map);

            // Popup langsung tampil; pemotongan layer kerawanan berjalan setelahnya.
            // Jika ada klik baru, requestId mencegah hasil klik lama dipakai.
            for (const riskLayerName of activeRiskLayers) {
              if (requestId !== areaBoundaryRequestRef.current) return;
              await loadLayerInBounds(riskLayerName);
            }

            // Popup sudah dibuka di atas, jadi ambil elemennya langsung.
            // Jangan menunggu event "add" karena openOn(map) dapat memicunya
            // secara sinkron sebelum listener sempat didaftarkan.
            const popupElement = popup.getElement();
            const dragHandle = popupElement?.querySelector(
              "[data-area-drag-handle]",
            ) as HTMLElement | null;
            const closeButton = popupElement?.querySelector(
              "[data-area-close]",
            ) as HTMLButtonElement | null;

            if (popupElement && dragHandle && closeButton) {
              // Hindari klik/geser popup diteruskan sebagai interaksi peta.
              window.L.DomEvent.disableClickPropagation(popupElement);
              window.L.DomEvent.disableScrollPropagation(popupElement);

              let isDraggingPopup = false;
              let mapWasDraggable = false;

              const onPointerMove = (pointerEvent: PointerEvent) => {
                if (!isDraggingPopup) return;
                const point = map.mouseEventToContainerPoint(pointerEvent);
                popup.setLatLng(
                  map.containerPointToLatLng([point.x, point.y + 18]),
                );
              };

              const onPointerUp = () => {
                if (!isDraggingPopup) return;
                isDraggingPopup = false;
                window.removeEventListener("pointermove", onPointerMove);
                window.removeEventListener("pointerup", onPointerUp);
                if (mapWasDraggable) map.dragging.enable();
                dragHandle.style.cursor = "grab";
              };

              const onPointerDown = (pointerEvent: PointerEvent) => {
                if ((pointerEvent.target as HTMLElement)?.closest("[data-area-close]")) {
                  return;
                }
                pointerEvent.preventDefault();
                pointerEvent.stopPropagation();
                isDraggingPopup = true;
                mapWasDraggable = map.dragging.enabled();
                map.dragging.disable();
                dragHandle.style.cursor = "grabbing";
                window.addEventListener("pointermove", onPointerMove);
                window.addEventListener("pointerup", onPointerUp);
              };

              const onClose = (pointerEvent: Event) => {
                pointerEvent.preventDefault();
                pointerEvent.stopPropagation();
                onPointerUp();
                map.closePopup(popup);
              };

              dragHandle.addEventListener("pointerdown", onPointerDown);
              closeButton.addEventListener("click", onClose);

              popup.once("remove", () => {
                onPointerUp();
                dragHandle.removeEventListener("pointerdown", onPointerDown);
                closeButton.removeEventListener("click", onClose);
              });
            }

          } catch (error) {
            if (requestId === areaBoundaryRequestRef.current) {
              console.error("[SIMITI] Gagal mendeteksi kelurahan dari titik peta:", error);
            }
          }
        };

        map.on("click", handleAdministrativeMapClick);
        setMapReady(true);

        // Tambahkan event listener untuk moveend (setelah pan/zoom selesai)
        // let moveTimeout;
        // map.on('moveend', () => {
        //   // Debounce untuk menghindari terlalu banyak request
        //   clearTimeout(moveTimeout);
        //   moveTimeout = setTimeout(() => {
        //     console.log('Map moveend event - reloading active layers');

        //     // Trigger reload dengan mengupdate state
        //     setActiveLayers(prev => new Set(prev));
        //   }, 500); // Delay 500ms (lebih lama) untuk performa lebih baik
        // });
      }
    };
    document.head.appendChild(script);

    // Load Chart.js
    const chartScript = document.createElement("script");
    chartScript.src =
      "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js";
    document.head.appendChild(chartScript);

    return () => {
      cancelled = true;
      link.remove();
      script.remove();
      chartScript.remove();

      // Cleanup map
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // ============================================================
  // MY LOKASI - DETEKSI GPS + ANALISIS 5 PARAMETER DALAM RADIUS 5 KM
  // Berjalan otomatis sekali ketika peta siap.
  // ============================================================
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;

    let cancelled = false;
    const requestId = ++myLocationRequestRef.current;
    setMyLocationStatus("loading");
    setMyLocationError("");
    setMyLocationData(null);
    setMyLocationAnalysis(null);

    const analyzePosition = async (
      latitude: number,
      longitude: number,
      accuracy: number | null = null,
    ) => {
      if (cancelled || requestId !== myLocationRequestRef.current) return;

      setMyLocationData({
        latitude,
        longitude,
        accuracy,
        administrative: null,
      });

      const map = mapInstanceRef.current as any;
      if (map && window.L) {
        myLocationLayersRef.current.forEach((layer) => {
          try { map.removeLayer(layer); } catch { /* layer sudah dilepas */ }
        });
        myLocationLayersRef.current = [];

        const marker = window.L.circleMarker([latitude, longitude], {
          radius: 9,
          color: "#ffffff",
          weight: 3,
          fillColor: "#2563eb",
          fillOpacity: 1,
        }).addTo(map);
        marker.bindTooltip("Posisi Saya", { direction: "top", offset: [0, -8] });

        const radiusCircle = window.L.circle([latitude, longitude], {
          radius: 5000,
          color: "#2563eb",
          weight: 2,
          opacity: 0.85,
          dashArray: "7 6",
          fillColor: "#60a5fa",
          fillOpacity: 0.07,
          interactive: false,
        }).addTo(map);

        myLocationLayersRef.current = [radiusCircle, marker];
        // Jangan menggeser atau memperbesar peta saat GPS diperbarui.
        // Tampilan peta Indonesia tetap mengikuti extent awal aplikasi.
      }

      try {
        // Jalankan lookup administrasi di latar belakang agar tidak menahan
        // analisis ancaman. Keduanya memakai koordinat GPS yang sama.
        void (async () => {
          try {
            const adminResponse = await fetch(`${API_URL}/api/spatial/detect-location`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ latitude, longitude }),
              signal: AbortSignal.timeout(10000),
            });
            const adminResult = await adminResponse.json();
            if (adminResponse.ok && adminResult?.success && !cancelled && requestId === myLocationRequestRef.current) {
              setMyLocationData((previous: any) => ({
                ...previous,
                administrative: adminResult.data || null,
              }));
            }
          } catch (adminError) {
            console.warn("[MY LOKASI] Deteksi administrasi PostGIS gagal:", adminError);
          }
        })();

        // Analisis ancaman dimulai langsung, tanpa menunggu lookup administrasi.
        const params = new URLSearchParams({
          latitude: String(latitude),
          longitude: String(longitude),
          radiusMeters: "5000",
          threatLimit: "20",
          mitigationLimit: "1",
          incidentLimit: "5",
        });
        const response = await fetch(
          `${API_URL}/api/location-proximity?${params.toString()}`,
          { signal: AbortSignal.timeout(30000) },
        );
        const result = await response.json();
        if (cancelled || requestId !== myLocationRequestRef.current) return;
        if (!response.ok || !result?.success) {
          throw new Error(result?.message || `Analisis lokasi gagal (${response.status})`);
        }

        const threats = Array.isArray(result.threats) ? result.threats : [];
        const definitions = [
          { key: "longsor", label: "Longsor", match: (v: string) => /longsor|gerakan.?tanah/.test(v) },
          { key: "banjir", label: "Banjir", match: (v: string) => /banjir/.test(v) && !/bandang/.test(v) },
          { key: "banjir_bandang", label: "Banjir Bandang", match: (v: string) => /banjir.?bandang/.test(v) },
          { key: "kekeringan", label: "Kekeringan", match: (v: string) => /kekeringan|kering/.test(v) },
          { key: "karhutla", label: "Karhutla", match: (v: string) => /karhutla|kebakaran.?hutan|kebakaran.?lahan/.test(v) },
        ];

        const parameters = definitions.map((definition) => {
          const found = threats.find((item: any) => {
            const searchable = `${item?.key || ""} ${item?.label || ""} ${item?.source || ""}`
              .toLowerCase().replace(/[_-]+/g, " ");
            return definition.match(searchable);
          });
          const rawClass = String(found?.status || "").trim().toLowerCase();
          const weight = rawClass === "tinggi" ? 3 : rawClass === "sedang" ? 2 : rawClass === "rendah" ? 1 : null;
          return {
            key: definition.key,
            label: definition.label,
            status: found?.status || null,
            score: weight,
            distanceMeters: found?.distanceMeters ?? null,
            inside: Boolean(found?.inside),
          };
        });

        const complete = parameters.every((item) => item.score !== null);
        const score = complete
          ? parameters.reduce((total, item) => total + Number(item.score), 0)
          : null;
        let status = "Data Belum Lengkap";
        let color = "#64748b";
        let interpretation = "Belum semua parameter bencana memiliki data dalam radius 5 km. Status lokasi belum dapat ditetapkan.";
        if (score !== null) {
          if (score <= 7) {
            status = "Aman"; color = "#16a34a";
            interpretation = "Seluruh atau sebagian besar ancaman rendah.";
          } else if (score <= 10) {
            status = "Siaga"; color = "#eab308";
            interpretation = "Mulai terdapat beberapa ancaman sedang, perlu pemantauan.";
          } else if (score <= 13) {
            status = "Waspada"; color = "#f97316";
            interpretation = "Ancaman tinggi mulai mendominasi, perlu kesiapsiagaan.";
          } else {
            status = "Bahaya"; color = "#dc2626";
            interpretation = "Hampir seluruh ancaman berada pada tingkat tinggi, perlu tindakan mitigasi segera.";
          }
        }

        setMyLocationAnalysis({
          success: true,
          radiusMeters: 5000,
          parameters,
          complete,
          score,
          status,
          color,
          interpretation,
          threats,
          incidents: Array.isArray(result.incidents) ? result.incidents : [],
          processingTimeMs: result.processingTimeMs,
        });
        setMyLocationStatus("success");
      } catch (error: any) {
        if (cancelled || requestId !== myLocationRequestRef.current) return;
        setMyLocationError(error?.message || "Gagal mengambil analisis ancaman di sekitar lokasi.");
        setMyLocationStatus("error");
      }
    };

    if (!navigator.geolocation) {
      setMyLocationError("Browser ini tidak mendukung deteksi GPS.");
      setMyLocationStatus("error");
      return () => { cancelled = true; };
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        analyzePosition(
          position.coords.latitude,
          position.coords.longitude,
          Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        );
      },
      (error) => {
        if (cancelled || requestId !== myLocationRequestRef.current) return;
        const messages: Record<number, string> = {
          1: "Izin lokasi ditolak. Aktifkan izin lokasi untuk situs SIMITI, lalu tekan Coba Lagi.",
          2: "Posisi tidak dapat ditentukan. Periksa GPS atau koneksi perangkat.",
          3: "Permintaan lokasi melewati batas waktu. Silakan coba lagi.",
        };
        setMyLocationError(messages[error.code] || "Tidak dapat mendeteksi lokasi perangkat.");
        setMyLocationStatus("error");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 },
    );

    return () => { cancelled = true; };
  }, [mapReady]);

  const retryMyLocation = () => {
    // Memicu ulang proses geolocation tanpa mengubah route atau layer lain.
    setMyLocationStatus("idle");
    setMyLocationError("");
    setMapReady(false);
    window.setTimeout(() => setMapReady(true), 0);
  };

  // Sinkronkan ukuran Leaflet setiap kali layout panel/sidebar berubah.
  // Ini mencegah area abu-abu/tiles kosong setelah panel kanan atau bawah disembunyikan.
  useEffect(() => {
    const map = mapInstanceRef.current as any;
    if (!map) return;

    const resizeTimer = window.setTimeout(() => {
      map.invalidateSize({ pan: false, animate: false });
    }, 180);

    return () => window.clearTimeout(resizeTimer);
  }, [isLayerPanelOpen, isBottomPanelOpen, sidebarCollapsed, mapReady]);

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
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null);
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
    const chartRef = useRef(null);
    const chartInstance = useRef(null);

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
    const chartRef = useRef(null);
    const chartInstance = useRef(null);

    useEffect(() => {
      if (chartRef.current && window.Chart) {
        const ctx = chartRef.current.getContext("2d");

        if (chartInstance.current) {
          chartInstance.current.destroy();
        }

        chartInstance.current = new window.Chart(ctx, {
          type: "doughnut",
          data: {
            labels: [
              "Hutan",
              "Pertanian",
              "Pemukiman",
              "Perkebunan",
              "Lainnya",
            ],
            datasets: [
              {
                data: [35, 25, 20, 15, 5],
                backgroundColor: [
                  "rgba(34, 197, 94, 0.7)",
                  "rgba(251, 191, 36, 0.7)",
                  "rgba(239, 68, 68, 0.7)",
                  "rgba(168, 85, 247, 0.7)",
                  "rgba(156, 163, 175, 0.7)",
                ],
                borderColor: [
                  "rgba(34, 197, 94, 1)",
                  "rgba(251, 191, 36, 1)",
                  "rgba(239, 68, 68, 1)",
                  "rgba(168, 85, 247, 1)",
                  "rgba(156, 163, 175, 1)",
                ],
                borderWidth: 2,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: "right",
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

  // const bottomTabs = [
  //   { id: 'curahHujan', label: 'Curah Hujan 30 Hari', icon: '🌧️' },
  //   { id: 'kemiringan', label: 'Kemiringan Lereng', icon: '⛰️' },
  //   { id: 'topografi', label: 'Topografi', icon: '🗺️' },
  //   { id: 'geologi', label: 'Geologi', icon: '🪨' },
  //   { id: 'jenisTanah', label: 'Jenis Tanah', icon: '🌱' },
  //   { id: 'patahan', label: 'Patahan', icon: '⚡' },
  //   { id: 'tutupanLahan', label: 'Tutupan Lahan', icon: '🌳' },
  //   { id: 'infrastruktur', label: 'Infrastruktur', icon: '🏗️' },
  //   { id: 'kepadatan', label: 'Kepadatan Pemukiman', icon: '🏘️' },
  // ];

  const bottomTabs = React.useMemo(() => {
    const tabs: Array<{ id: string; label: string; icon: string }> = [];

    const hasAutoKejadian = Array.from(activeLayers).some(
      (layer) =>
        layer.startsWith("kejadian_") && activeKejadianLayers.has(layer),
    );

    if (hasAutoKejadian) {
      tabs.push({ id: "listings", label: "Listings", icon: "📋" });
    }

    // Hanya tambahkan tab untuk layer-layer yang punya data bottom tabs
    if (activeLayers.has("tutupan_lahan")) {
      tabs.push({
        id: "tutupanLahan",
        label: "Tutupan Lahan",
        icon: "🌳",
      });
    }

    if (activeLayers.has("jenis_tanah")) {
      tabs.push({ id: "jenisTanah", label: "Jenis Tanah", icon: "🌱" });
    }

    if (activeLayers.has("geologi")) {
      tabs.push({ id: "geologi", label: "Geologi", icon: "🪨" });
    }

    if (activeLayers.has("lahan_kritis")) {
      tabs.push({
        id: "lahan_kritis",
        label: "Lahan Kritis",
        icon: "⚠️",
      });
    }

    // Semua layer pada kategori Kerawanan mendapat tab di panel bawah.
    // Gunakan katalog + daftar layer untuk mendukung layer dinamis seperti rawan_banjir.
    const kerawananCatalog = [...(layerData.kerawanan || []), ...(availableLayers.kerawanan || [])];
    const uniqueKerawanan = new Map<string, { id: string; name: string }>();
    kerawananCatalog.forEach((layer) => {
      if (layer?.name && activeLayers.has(layer.name)) {
        uniqueKerawanan.set(layer.name, layer);
      }
    });

    uniqueKerawanan.forEach((layer) => {
      tabs.push({
        id: layer.name,
        label: formatTableName(layer.name),
        icon: "🗺️",
      });
    });

    return tabs;
  }, [activeLayers, activeKejadianLayers, layerData.kerawanan, availableLayers.kerawanan]);

  // Pastikan panel bawah selalu memilih tab yang benar-benar tersedia.
  // Tab dibuat dinamis mengikuti layer yang sedang diaktifkan.
  useEffect(() => {
    if (bottomTabs.length === 0) {
      if (activeBottomTab !== "") setActiveBottomTab("");
      return;
    }

    const activeTabExists = bottomTabs.some(
      (tab) => tab.id === activeBottomTab,
    );

    if (!activeTabExists) {
      setActiveBottomTab(bottomTabs[0].id);
    }
  }, [bottomTabs, activeBottomTab]);

  // const renderBottomContent = () => {
  //   switch(activeBottomTab) {
  //     case 'curahHujan':
  //       return (
  //         <div style={{ height: '180px' }} className="p-3">
  //           <CurahHujanChart />
  //         </div>
  //       );
  //     case 'kemiringan':
  //       return (
  //         <div className="p-3">
  //           <DataTable
  //             columns={['No', 'Kelas Lereng', 'Luas (Ha)', 'Persentase (%)', 'Tingkat Bahaya']}
  //             data={[
  //               ['1', '0-8%', '1,250', '25%', 'Rendah'],
  //               ['2', '8-15%', '1,500', '30%', 'Sedang'],
  //               ['3', '15-25%', '1,000', '20%', 'Tinggi'],
  //               ['4', '25-40%', '750', '15%', 'Sangat Tinggi'],
  //               ['5', '>40%', '500', '10%', 'Ekstrim'],
  //             ]}
  //           />
  //         </div>
  //       );
  //     case 'topografi':
  //       return (
  //         <div className="p-3">
  //           <DataTable
  //             columns={['No', 'Kelas Elevasi', 'Luas (Ha)', 'Persentase (%)', 'Kategori']}
  //             data={[
  //               ['1', '0-100 mdpl', '2,000', '40%', 'Dataran Rendah'],
  //               ['2', '100-500 mdpl', '1,500', '30%', 'Dataran Tinggi'],
  //               ['3', '500-1000 mdpl', '1,000', '20%', 'Perbukitan'],
  //               ['4', '1000-2000 mdpl', '400', '8%', 'Pegunungan'],
  //               ['5', '>2000 mdpl', '100', '2%', 'Pegunungan Tinggi'],
  //             ]}
  //           />
  //         </div>
  //       );
  //     case 'geologi':
  //       return (
  //         <div className="p-3">
  //           <DataTable
  //             columns={['No', 'Formasi Batuan', 'Luas (Ha)', 'Persentase (%)']}
  //             data={[
  //               ['1', 'Aluvium', '1,800', '36%'],
  //               ['2', 'Batuan Vulkanik', '1,500', '30%'],
  //               ['3', 'Batuan Sedimen', '1,200', '24%'],
  //               ['4', 'Batuan Metamorf', '500', '10%'],
  //             ]}
  //           />
  //         </div>
  //       );
  //     case 'jenisTanah':
  //       return (
  //         <div style={{ height: '180px' }} className="p-3">
  //           <JenisTanahChart />
  //         </div>
  //       );
  //     case 'patahan':
  //       return (
  //         <div className="p-3">
  //           <DataTable
  //             columns={['No', 'Nama Patahan', 'Panjang (km)', 'Status', 'Tingkat Bahaya']}
  //             data={[
  //               ['1', 'Patahan Sumatra', '120', 'Aktif', 'Tinggi'],
  //               ['2', 'Patahan Lembang', '45', 'Aktif', 'Sedang'],
  //               ['3', 'Patahan Cimandiri', '80', 'Semi-Aktif', 'Sedang'],
  //               ['4', 'Patahan Palu-Koro', '200', 'Aktif', 'Sangat Tinggi'],
  //               ['5', 'Patahan Sorong', '150', 'Aktif', 'Tinggi'],
  //             ]}
  //           />
  //         </div>
  //       );
  //     case 'tutupanLahan':
  //       if (activeLayers.has('tutupan_lahan') && tutupanLahanData.length > 0) {
  //         return (
  //           <div className="p-3">
  //             <DataTable
  //               columns={['No', 'Kode Domain', 'Deskripsi Tutupan Lahan', 'Jumlah']}
  //               data={tutupanLahanData.map((item, idx) => [
  //                 (idx + 1).toString(),
  //                 item.pl2024_id?.toString() || '-',
  //                 item.deskripsi_domain || '-',
  //                 item.count?.toString() || '0'
  //               ])}
  //             />
  //           </div>
  //         );
  //       } else if (activeLayers.has('tutupan_lahan')) {
  //         return (
  //           <div className="p-3 flex items-center justify-center h-full">
  //             <div className="text-center text-gray-500">
  //               <p className="text-sm">Tidak ada data tutupan lahan di area yang dipilih</p>
  //             </div>
  //           </div>
  //         );
  //       } else {
  //         return (
  //           <div className="p-3 flex items-center justify-center h-full">
  //             <div className="text-center text-gray-500">
  //               <p className="text-sm">Aktifkan layer Tutupan Lahan untuk melihat data</p>
  //             </div>
  //           </div>
  //         );
  //       }
  //     case 'infrastruktur':
  //       return (
  //         <div className="p-3">
  //           <DataTable
  //             columns={['No', 'Jenis Infrastruktur', 'Jumlah', 'Kondisi', 'Tahun Pembangunan']}
  //             data={[
  //               ['1', 'Jalan Aspal', '150 km', 'Baik', '2020'],
  //               ['2', 'Jembatan', '25 unit', 'Baik', '2019'],
  //               ['3', 'Bendungan', '3 unit', 'Sangat Baik', '2021'],
  //               ['4', 'Irigasi', '80 km', 'Sedang', '2018'],
  //               ['5', 'Drainase', '120 km', 'Baik', '2020'],
  //             ]}
  //           />
  //         </div>
  //       );
  //     case 'kepadatan':
  //       return (
  //         <div className="p-3">
  //           <DataTable
  //             columns={['No', 'Kecamatan', 'Jumlah Penduduk', 'Luas (km²)', 'Kepadatan (jiwa/km²)']}
  //             data={[
  //               ['1', 'Kecamatan A', '50,000', '25', '2,000'],
  //               ['2', 'Kecamatan B', '35,000', '30', '1,167'],
  //               ['3', 'Kecamatan C', '60,000', '20', '3,000'],
  //               ['4', 'Kecamatan D', '25,000', '40', '625'],
  //               ['5', 'Kecamatan E', '45,000', '35', '1,286'],
  //             ]}
  //           />
  //         </div>
  //       );
  //     default:
  //       return null;
  //   }
  // };

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
                      // Zoom to location on map
                      if (
                        mapInstanceRef.current &&
                        kejadian.latitude &&
                        kejadian.longitude
                      ) {
                        mapInstanceRef.current.setView(
                          [kejadian.latitude, kejadian.longitude],
                          15,
                        );
                      }
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
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-[10px] font-medium">
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
                        </div>
                      </div>
                    </div>

                    {/* Description preview */}
                    {/* {kejadian.description && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <p className="text-xs text-gray-500 line-clamp-2">
                        {kejadian.description}
                      </p>
                    </div>
                  )} */}
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
            <div className="p-3">
              {/* TAMBAH max-height dan overflow-y-auto */}
              <div
                className="overflow-x-auto overflow-y-auto"
                style={{ maxHeight: "400px" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        No
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Deskripsi Tutupan Lahan
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Luas (Ha)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tutupanLahanData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.deskripsi_domain || "-"}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.luas_total
                            ? parseFloat(item.luas_total.toString()).toFixed(2)
                            : "0"}
                        </td>
                      </tr>
                    ))}
                    {/* Tambahkan row kosong untuk padding bawah */}
                    <tr>
                      <td colSpan={4} className="py-4"></td>
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

      case "jenisTanah":
        if (activeLayers.has("jenis_tanah") && jenisTanahData.length > 0) {
          return (
            <div className="p-3">
              <div
                className="overflow-x-auto overflow-y-auto"
                style={{ maxHeight: "400px" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        No
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
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
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.jntnh1 || "-"}
                        </td>
                      </tr>
                    ))}
                    {/* Padding bawah */}
                    <tr>
                      <td colSpan={3} className="py-4"></td>
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
            <div className="p-3">
              {/* TAMBAH max-height dan overflow-y-auto */}
              <div
                className="overflow-x-auto overflow-y-auto"
                style={{ maxHeight: "400px" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        No
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Jenis Batuan
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Umur Batuan
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Keliling (m)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {geologiData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.namobj || "-"}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
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
                    {/* Tambahkan row kosong untuk padding bawah */}
                    <tr>
                      <td colSpan={5} className="py-4"></td>
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
            <div className="p-3">
              <div
                className="overflow-x-auto overflow-y-auto"
                style={{ maxHeight: "400px" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        No
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Tingkat Kritis
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Luas (Ha)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lahanKritisData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.kritis}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.luas_ha.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} className="py-4"></td>
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
            <div className="p-3">
              <div
                className="overflow-x-auto overflow-y-auto"
                style={{ maxHeight: "400px" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        No
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Tingkat Kerawanan
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Luas (Ha)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rawanErosiData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.tingkat}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.luas_ha.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} className="py-4"></td>
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
            <div className="p-3">
              <div
                className="overflow-x-auto overflow-y-auto"
                style={{ maxHeight: "400px" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        No
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Tingkat Kerawanan
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Luas Wilayah
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rawanLongsorData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.tingkat}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.luas_ha.toFixed(6)}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} className="py-4"></td>
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
            <div className="p-3">
              <div
                className="overflow-x-auto overflow-y-auto"
                style={{ maxHeight: "400px" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        No
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Tingkat Limpasan
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Luas (Ha)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rawanLimpasanData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.tingkat}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.luas_ha.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} className="py-4"></td>
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

      case "rawan_karhutla":
        if (
          activeLayers.has("rawan_karhutla") &&
          rawanKarhutlaData.length > 0
        ) {
          return (
            <div className="p-3">
              <div
                className="overflow-x-auto overflow-y-auto"
                style={{ maxHeight: "400px" }}
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        No
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Warna Layer
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Tingkat Kerawanan
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 bg-white">
                        Luas (Ha)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rawanKarhutlaData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="py-2 px-2 text-gray-700">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div
                            className="w-8 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: item.color }}
                          ></div>
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.tingkat}
                        </td>
                        <td className="py-2 px-2 text-gray-700">
                          {item.luas_ha.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} className="py-4"></td>
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

      default: {
        // Layer Kerawanan lain (termasuk Rawan Banjir) tetap menampilkan legenda
        // di panel bawah. Warna mengikuti warna yang dipakai style layer pada peta.
        const kerawananLayer = [...(layerData.kerawanan || []), ...(availableLayers.kerawanan || [])]
          .find((layer) => layer?.name === activeBottomTab);

        if (kerawananLayer && activeLayers.has(kerawananLayer.name)) {
          const layerColor = getColorForTable(kerawananLayer.name);
          return (
            <div className="h-full overflow-y-auto p-3">
              <div className="text-xs font-semibold text-gray-700 mb-3">
                Legenda {formatTableName(kerawananLayer.name)}
              </div>
              <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 max-w-sm">
                <span
                  className="inline-block w-8 h-4 rounded-sm border border-gray-300 flex-shrink-0"
                  style={{ backgroundColor: layerColor }}
                />
                <span className="text-xs text-gray-700">
                  {formatTableName(kerawananLayer.name)}
                </span>
              </div>
              <p className="text-[10px] text-gray-400 mt-2">
                Warna mengikuti simbolisasi layer pada peta.
              </p>
            </div>
          );
        }

        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-400">
              <p className="text-sm">Pilih tab untuk melihat data</p>
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-100">
      {!isMyLocationPopupOpen && (
        <button
          type="button"
          onClick={() => setIsMyLocationPopupOpen(true)}
          className="fixed z-[1200] bottom-5 right-5 flex items-center gap-2 rounded-full bg-blue-700 px-4 py-3 text-sm font-bold text-white shadow-xl hover:bg-blue-800"
          title="Buka analisis lokasi saya"
        >
          <span aria-hidden="true">◎</span> MY LOKASI
        </button>
      )}

      {isMyLocationPopupOpen && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/25 p-2 sm:p-3">
          <section className="w-full max-w-[360px] max-h-[82vh] overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.24)]">
            <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
                      <circle cx="12" cy="10" r="2.5" />
                    </svg>
                  </span>
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">MY LOKASI • SIMITI</div>
                </div>
                <h2 className="mt-1.5 truncate text-lg font-extrabold tracking-tight text-slate-900">
                  {myLocationData?.administrative?.desa_kelurahan || myLocationData?.administrative?.kelurahan || "Lokasi Saya"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsMyLocationPopupOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-2xl leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-800"
                aria-label="Tutup popup lokasi"
                title="Tutup"
              >×</button>
            </header>

            <div className="max-h-[calc(82vh-64px)] space-y-3 overflow-y-auto px-4 py-3">
              {myLocationStatus === "loading" && !myLocationData && (
                <div className="flex items-center gap-3 rounded-xl bg-blue-50 px-3 py-3 text-sm text-blue-900">
                  <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />
                  <div><strong>Mendeteksi posisi GPS...</strong><p className="mt-0.5 text-xs text-blue-700">Izinkan akses lokasi pada browser.</p></div>
                </div>
              )}

              {myLocationData && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Latitude</div>
                      <div className="mt-1 font-mono text-sm font-bold tabular-nums text-slate-900">{myLocationData.latitude.toFixed(6)}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Longitude</div>
                      <div className="mt-1 font-mono text-sm font-bold tabular-nums text-slate-900">{myLocationData.longitude.toFixed(6)}</div>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-xl border border-slate-100 px-3 py-3">
                    <div className="flex items-start justify-between gap-3 text-sm">
                      <span className="text-slate-500">Desa/Kelurahan:</span>
                      <strong className="text-right text-slate-900">{myLocationData.administrative?.desa_kelurahan || myLocationData.administrative?.kelurahan || "—"}</strong>
                    </div>
                    <div className="flex items-start justify-between gap-3 text-sm">
                      <span className="text-slate-500">Kab/Kota:</span>
                      <strong className="text-right text-slate-900">{myLocationData.administrative?.kabupaten_kota || myLocationData.administrative?.kabupaten || "—"}</strong>
                    </div>
                    <div className="flex items-start justify-between gap-3 text-sm">
                      <span className="text-slate-500">Provinsi:</span>
                      <strong className="text-right text-slate-900">{myLocationData.administrative?.provinsi || "—"}</strong>
                    </div>
                    <div className="flex items-start justify-between gap-3 border-t border-slate-100 pt-2 text-sm">
                      <span className="text-slate-500">Akurasi GPS:</span>
                      <strong className="text-right text-slate-900">{myLocationData.accuracy != null ? `± ${Math.round(myLocationData.accuracy).toLocaleString("id-ID")} meter` : "Tidak tersedia"}</strong>
                    </div>
                  </div>
                </div>
              )}

              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-600" />
                  <h3 className="text-sm font-extrabold text-slate-900">Ancaman Bencana di Lokasi</h3>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Berdasarkan data Kerawanan SIMITI/PostGIS</p>

                {myLocationStatus === "loading" && !myLocationData && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-3 text-xs font-medium text-blue-800">
                    <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />
                    Mendapatkan koordinat GPS perangkat...
                  </div>
                )}

                {myLocationStatus === "loading" && myLocationData && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-3 text-xs font-medium text-blue-800">
                    <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />
                    Koordinat ditemukan. Memeriksa layer kerawanan SIMITI...
                  </div>
                )}

                {myLocationStatus === "error" && (
                  <div className="mt-3 rounded-lg bg-amber-50 px-3 py-3 text-xs leading-relaxed text-amber-900">
                    {myLocationError}
                  </div>
                )}

                {myLocationAnalysis && myLocationStatus === "success" && (
                  <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100">
                    {myLocationAnalysis.parameters.map((item: any) => (
                      <div key={item.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-800">{item.label}</div>
                          <div className="mt-0.5 text-[10px] text-slate-500">
                            {item.distanceMeters == null ? "Tidak ada data dalam radius 5 km" : item.inside ? "Titik GPS berada di dalam area ancaman" : `Area terdekat ${Math.round(item.distanceMeters).toLocaleString("id-ID")} meter`}
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-bold ${item.status ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-700"}`}>
                          {item.status || "Tidak tersedia"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {myLocationAnalysis?.incidents?.length > 0 && myLocationStatus === "success" && (
                  <div className="mt-3">
                    <div className="mb-2 text-xs font-bold text-slate-800">Kejadian bencana di sekitar</div>
                    <div className="space-y-2">
                      {myLocationAnalysis.incidents.slice(0, 5).map((incident: any, index: number) => (
                        <div key={incident.id || index} className="rounded-lg bg-slate-50 px-3 py-2">
                          <div className="text-xs font-semibold text-slate-800">{incident.title || incident.category || "Kejadian bencana"}</div>
                          <div className="mt-0.5 text-[10px] text-slate-500">{incident.location || "Lokasi tidak dicantumkan"}{incident.distanceMeters != null ? ` • ${Math.round(incident.distanceMeters).toLocaleString("id-ID")} m` : ""}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={retryMyLocation}
                disabled={myLocationStatus === "loading"}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-700/15 transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3" />
                </svg>
                {myLocationStatus === "loading" ? "Memperbarui Lokasi..." : "Perbarui Lokasi GPS"}
              </button>
            </div>
          </section>
        </div>
      )}

      <Sidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onToggle={() => setSidebarCollapsed((prev) => !prev)}
      />
      <style>
        {`
        .custom-kejadian-marker {
          background: none;
          border: none;
        }
        
        .marker-container:hover .marker-bg {
          fill: #ef4444 !important;
        }
        
        .custom-kejadian-popup .leaflet-popup-content-wrapper {
          border-radius: 12px;
          padding: 0;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        }
        
        .custom-kejadian-popup .leaflet-popup-content {
          margin: 0;
          width: 280px !important;
        }
        
        .custom-kejadian-popup .leaflet-popup-tip {
          display: none;
        }

        .custom-area-popup .leaflet-popup-content-wrapper {
          padding: 0;
          overflow: hidden;
          border-radius: 10px;
          box-shadow: 0 12px 34px rgba(15, 23, 42, 0.24);
        }

        .custom-area-popup .leaflet-popup-content {
          width: auto !important;
          margin: 0;
        }

        .custom-area-popup .leaflet-popup-tip-container {
          display: none;
        }

        .custom-area-popup {
          cursor: default;
        }
      `}
      </style>

      {/* Main Content Area */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Tombol menu untuk membuka sidebar pada layar mobile */}
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(true)}
          aria-label="Buka menu navigasi"
          title="Buka menu navigasi"
          className="fixed left-3 top-3 z-[2200] flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white/95 text-slate-700 shadow-lg backdrop-blur transition hover:bg-slate-50 md:hidden"
        >
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        {isAuthenticated && (
          <div className="absolute top-0 left-0 right-0 bg-green-50 border-b border-green-200 px-6 py-2 z-[2100] shadow-md">
            <div className="max-w-full flex justify-between items-center">
              <div className="flex items-center gap-2">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#16a34a"
                  strokeWidth="2"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <span className="text-green-800 text-sm font-medium">
                  Logged in as Admin
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="px-4 py-1.5 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition"
              >
                Logout
              </button>
            </div>
          </div>
        )}
        {/* Top Section: Map with Layer Panel - 65% height */}
        <div className="relative flex min-h-0" style={{ height: isBottomPanelOpen ? "65vh" : "100vh" }}>
          {/* Map Container */}
          <div className="flex-1 relative min-w-0" style={{ marginRight: isLayerPanelOpen ? "320px" : "0" }}>
            <div ref={mapRef} className="w-full h-full"></div>
            {/* Coordinates Display */}
            {/* <div className="absolute top-4 left-20 z-[1000] bg-white px-3 py-1.5 rounded shadow-lg">
              <span className="font-mono text-xs">128.11, -11.78</span>
            </div> */}
          </div>

          {/* Layer Services Panel - Smaller width */}
          {isLayerPanelOpen && (
            <div
              className="absolute right-0 top-0 z-[1050] w-80 bg-white text-slate-800 shadow-2xl flex flex-col border-l border-emerald-200"
              style={{ height: "100vh" }}
            >
              {/* Header - Smaller */}
              <div className="bg-gradient-to-r from-white via-emerald-50 to-slate-50 text-slate-900 px-4 py-4 flex items-center gap-3 flex-shrink-0 border-b border-emerald-200 shadow-sm">
                <div className="h-10 w-10 rounded-xl bg-emerald-100 border border-emerald-200 text-emerald-800 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20V6.5Z" />
                    <path d="M9 4v13.5M15 6.5V20" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-extrabold tracking-[0.04em] leading-tight text-slate-950">
                    SIMITIGASI
                  </h2>
                  <p className="text-xs font-semibold tracking-wide text-slate-600 mt-1">Layer Services</p>
                </div>
              </div>

              {/* Loading Indicator */}
              {isLoadingLayer && (
                <div className="bg-blue-50 border-b-2 border-blue-500 p-2 flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
                  <span className="text-xs text-blue-700 font-medium">
                    Memuat {loadingLayerNames.size} layer:{" "}
                    {Array.from(loadingLayerNames)
                      .map((name) => formatTableName(name))
                      .join(", ")}
                    ...
                  </span>
                </div>
              )}

              {/* Error/Warning/Info Message */}
              {layerError && (
                <div
                  className={`border-b-2 p-2 ${
                    layerError.includes("❌") ||
                    layerError.includes("🔌")
                      ? "bg-red-50 border-red-500"
                      : layerError.includes("⚠️")
                        ? "bg-yellow-50 border-yellow-500"
                        : "bg-blue-50 border-blue-500"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`text-xs flex-1 ${
                        layerError.includes("❌") ||
                        layerError.includes("🔌")
                          ? "text-red-700"
                          : layerError.includes("⚠️")
                            ? "text-yellow-700"
                            : "text-blue-700"
                      }`}
                    >
                      {layerError}
                    </span>
                    <button
                      onClick={() => setLayerError("")}
                      className="text-gray-500 hover:text-gray-700 font-bold text-sm"
                    >
                      ×
                    </button>
                  </div>
                </div>
              )}

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto bg-gradient-to-b from-slate-50 to-emerald-50/60 text-slate-800">
                <div className="p-3">
                  {/* Tabs - Smaller */}
                  <div className="flex gap-3 mb-4">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="mainTab"
                        checked={activeTab === "administrasi"}
                        onChange={() => setActiveTab("administrasi")}
                        className="w-3.5 h-3.5"
                      />
                      <span className="text-sm font-medium text-slate-800">Administrasi</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="mainTab"
                        checked={activeTab === "das"}
                        onChange={() => setActiveTab("das")}
                        className="w-3.5 h-3.5"
                      />
                      <span className="text-sm font-medium text-slate-800">DAS</span>
                    </label>
                  </div>

                  {/* Area Search Section - Only show when Administrasi tab is active */}
                  {activeTab === "administrasi" && (
                    <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-800">
                      <h3 className="text-sm font-semibold text-slate-900 mb-2">
                        Pilih Area
                      </h3>

                      {/* Info jika ada DAS terpilih */}
                      {selectedDas.length > 0 && (
                        <div className="mb-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                          <p className="text-xs text-yellow-700">
                            ⚠️ Filter DAS aktif. Hapus filter DAS untuk
                            menggunakan filter administrasi.
                          </p>
                        </div>
                      )}

                      {/* Level Selection - Diperkecil dan 2 baris */}
                      <div className="mb-2 grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() => setAdminLevel("provinsi")}
                          className={`px-1.5 py-1 text-[10px] rounded ${
                            adminLevel === "provinsi"
                              ? "bg-blue-500 text-white"
                              : "bg-white text-gray-700 border border-gray-300"
                          }`}
                          disabled={selectedDas.length > 0}
                        >
                          Provinsi
                        </button>
                        <button
                          onClick={() => setAdminLevel("kabupaten")}
                          className={`px-1.5 py-1 text-[10px] rounded ${
                            adminLevel === "kabupaten"
                              ? "bg-blue-500 text-white"
                              : "bg-white text-gray-700 border border-gray-300"
                          }`}
                          disabled={selectedDas.length > 0}
                        >
                          Kabupaten
                        </button>
                        <button
                          onClick={() => setAdminLevel("kecamatan")}
                          className={`px-1.5 py-1 text-[10px] rounded ${
                            adminLevel === "kecamatan"
                              ? "bg-blue-500 text-white"
                              : "bg-white text-gray-700 border border-gray-300"
                          }`}
                          disabled={selectedDas.length > 0}
                        >
                          Kecamatan
                        </button>
                        <button
                          onClick={() => setAdminLevel("kelurahan")}
                          className={`px-1.5 py-1 text-[10px] rounded ${
                            adminLevel === "kelurahan"
                              ? "bg-blue-500 text-white"
                              : "bg-white text-gray-700 border border-gray-300"
                          }`}
                          disabled={selectedDas.length > 0}
                        >
                          Kelurahan
                        </button>
                      </div>

                      {/* Selected Areas */}
                      {selectedAreas.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1">
                          {selectedAreas.map((area, index) => (
                            <div
                              key={index}
                              className="bg-white px-2 py-1 rounded text-xs border border-blue-300 flex items-center gap-1"
                            >
                              <span className="text-[10px] bg-blue-100 px-1 rounded">
                                {area.level}
                              </span>
                              <span
                                className="truncate max-w-[150px]"
                                title={area.label}
                              >
                                {area.label}
                              </span>
                              <button
                                onClick={() => handleRemoveArea(index)}
                                className="text-red-500 hover:text-red-700 font-bold"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Search Input */}
                      <div className="relative">
                        <input
                          type="text"
                          value={areaSearchQuery}
                          onChange={(e) =>
                            handleAreaSearchChange(e.target.value)
                          }
                          onFocus={() => setShowAreaSearchDropdown(true)}
                          placeholder={`Cari ${adminLevel}...`}
                          className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                          disabled={selectedDas.length > 0}
                        />

                        {/* Search Results Dropdown */}
                        {showAreaSearchDropdown &&
                          areaSearchResults.length > 0 &&
                          selectedDas.length === 0 && (
                            <>
                              <div
                                className="fixed inset-0 z-40"
                                onClick={() => setShowAreaSearchDropdown(false)}
                              />
                              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-48 overflow-y-auto z-50">
                                {areaSearchResults.map((result, index) => (
                                  <div
                                    key={index}
                                    onClick={() => handleAreaSelect(result)}
                                    className="px-2 py-1.5 text-xs hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                  >
                                    <span className="text-[10px] bg-gray-100 px-1 rounded mr-1">
                                      {result.level}
                                    </span>
                                    {result.label}
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                      </div>

                      <div className="text-[10px] text-slate-600 mt-1">
                        * Pilih level lalu cari area untuk membatasi tampilan
                        layer
                      </div>
                    </div>
                  )}

                  {/* DAS Search Section - Only show when DAS tab is active */}
                  {activeTab === "das" && (
                    <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-800">
                      <h3 className="text-sm font-semibold text-slate-900 mb-2">
                        Pilih DAS
                      </h3>

                      {/* Info jika ada Area terpilih */}
                      {selectedAreas.length > 0 && (
                        <div className="mb-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                          <p className="text-xs text-yellow-700">
                            ⚠️ Filter administrasi aktif. Hapus filter
                            administrasi untuk menggunakan filter DAS.
                          </p>
                        </div>
                      )}

                      {/* Selected DAS */}
                      {selectedDas.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1">
                          {selectedDas.map((das, index) => (
                            <div
                              key={index}
                              className="bg-white px-2 py-1 rounded text-xs border border-green-300 flex items-center gap-1"
                            >
                              <span
                                className="truncate max-w-[200px]"
                                title={das.label}
                              >
                                {das.label}
                              </span>
                              <button
                                onClick={() => handleRemoveDas(index)}
                                className="text-red-500 hover:text-red-700 font-bold"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Search Input */}
                      <div className="relative">
                        <input
                          type="text"
                          value={dasSearchQuery}
                          onChange={(e) =>
                            handleDasSearchChange(e.target.value)
                          }
                          onFocus={() => setShowDasSearchDropdown(true)}
                          placeholder="Cari DAS..."
                          className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-green-500"
                          disabled={selectedAreas.length > 0}
                        />

                        {/* Search Results Dropdown */}
                        {showDasSearchDropdown &&
                          dasSearchResults.length > 0 &&
                          selectedAreas.length === 0 && (
                            <>
                              <div
                                className="fixed inset-0 z-40"
                                onClick={() => setShowDasSearchDropdown(false)}
                              />
                              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-48 overflow-y-auto z-50">
                                {dasSearchResults.map((result, index) => (
                                  <div
                                    key={index}
                                    onClick={() => handleDasSelect(result)}
                                    className="px-2 py-1.5 text-xs hover:bg-green-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                  >
                                    {result.label}
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                      </div>

                      <div className="text-[10px] text-slate-600 mt-1">
                        * Cari dan pilih DAS untuk membatasi tampilan layer
                      </div>
                    </div>
                  )}

                  {/* Kerawanan Section */}
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-slate-900 mb-2 pb-1.5 border-b-2 border-green-600">
                      Kerawanan
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {(currentBounds &&
                      (selectedAreas.length > 0 || selectedDas.length > 0)
                        ? availableLayers.kerawanan
                        : layerData.kerawanan
                      ).map((layer) => (
                        <div
                          key={layer.id}
                          className={`flex items-center gap-1.5 bg-white text-slate-800 px-2 py-1.5 rounded-md border border-slate-200 shadow-sm ${loadingLayerNames.has(layer.name) ? "opacity-60 cursor-not-allowed" : ""}`}
                        >
                          <input
                            type="checkbox"
                            className="w-3 h-3 flex-shrink-0 accent-green-600"
                            checked={activeLayers.has(layer.name)}
                            onChange={(e) =>
                              handleLayerToggle(layer.name, e.target.checked)
                            }
                            disabled={loadingLayerNames.has(layer.name)}
                          />
                          <span
                            className="text-xs font-medium text-slate-800 flex-1 truncate cursor-help flex items-center gap-1"
                            title={formatTableName(layer.name)}
                          >
                            {loadingLayerNames.has(layer.name) && (
                              <span className="inline-block animate-spin">
                                ⏳
                              </span>
                            )}
                            {formatTableName(layer.name)}
                          </span>
                          {isAuthenticated && (
                            <button
                              onClick={() =>
                                handleDeleteClick(
                                  "kerawanan",
                                  layer.id,
                                  layer.name,
                                )
                              }
                              className="text-red-500 hover:text-red-700 font-bold text-base flex-shrink-0"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}

                      {/* Tambah Data Button */}
                      {isAuthenticated && (
                        <button
                          onClick={() => handleAddClick("kerawanan")}
                          className="flex items-center gap-1 px-2 py-1 border-2 border-dashed border-blue-400 text-blue-500 rounded hover:bg-blue-50 transition-colors justify-center"
                        >
                          <span className="text-base font-bold">+</span>
                          <span className="text-xs">Tambah Data</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mitigasi dan Adaptasi Section */}
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-slate-900 mb-2 pb-1.5 border-b-2 border-green-600">
                      Mitigasi dan Adaptasi
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {(currentBounds &&
                      (selectedAreas.length > 0 || selectedDas.length > 0)
                        ? availableLayers.mitigasiAdaptasi
                        : layerData.mitigasiAdaptasi
                      ).map((layer) => (
                        <div
                          key={layer.id}
                          className={`flex items-center gap-1.5 bg-white text-slate-800 px-2 py-1.5 rounded-md border border-slate-200 shadow-sm ${loadingLayerNames.has(layer.name) ? "opacity-60 cursor-not-allowed" : ""}`}
                        >
                          <input
                            type="checkbox"
                            className="w-3 h-3 flex-shrink-0 accent-green-600"
                            checked={activeLayers.has(layer.name)}
                            onChange={(e) =>
                              handleLayerToggle(layer.name, e.target.checked)
                            }
                            disabled={loadingLayerNames.has(layer.name)}
                          />
                          <span
                            className="text-xs font-medium text-slate-800 flex-1 truncate cursor-help"
                            title={formatTableName(layer.name)}
                          >
                            {formatTableName(layer.name)}
                          </span>
                          {isAuthenticated && (
                            <button
                              onClick={() =>
                                handleDeleteClick(
                                  "kerawanan",
                                  layer.id,
                                  layer.name,
                                )
                              }
                              className="text-red-500 hover:text-red-700 font-bold text-base flex-shrink-0"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}

                      {/* Tambah Data Button */}
                      {isAuthenticated && (
                        <button
                          onClick={() => handleAddClick("mitigasiAdaptasi")}
                          className="flex items-center gap-1 px-2 py-1 border-2 border-dashed border-blue-400 text-blue-500 rounded hover:bg-blue-50 transition-colors justify-center"
                        >
                          <span className="text-base font-bold">+</span>
                          <span className="text-xs">Tambah Data</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Lain lain Section */}
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-slate-900 mb-2 pb-1.5 border-b-2 border-green-600">
                      Lain lain
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {(currentBounds &&
                      (selectedAreas.length > 0 || selectedDas.length > 0)
                        ? availableLayers.lainnya
                        : layerData.lainnya
                      ).map((layer) => (
                        <div
                          key={layer.id}
                          className={`flex items-center gap-1.5 bg-white text-slate-800 px-2 py-1.5 rounded-md border border-slate-200 shadow-sm ${loadingLayerNames.has(layer.name) ? "opacity-60 cursor-not-allowed" : ""}`}
                        >
                          <input
                            type="checkbox"
                            className="w-3 h-3 flex-shrink-0 accent-green-600"
                            checked={activeLayers.has(layer.name)}
                            onChange={(e) =>
                              handleLayerToggle(layer.name, e.target.checked)
                            }
                            disabled={loadingLayerNames.has(layer.name)}
                          />
                          <span
                            className="text-xs font-medium text-slate-800 flex-1 truncate cursor-help"
                            title={formatTableName(layer.name)}
                          >
                            {formatTableName(layer.name)}
                          </span>
                          {isAuthenticated && (
                            <button
                              onClick={() =>
                                handleDeleteClick(
                                  "kerawanan",
                                  layer.id,
                                  layer.name,
                                )
                              }
                              className="text-red-500 hover:text-red-700 font-bold text-base flex-shrink-0"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}

                      {/* Tambah Data Button */}
                      {isAuthenticated && (
                        <button
                          onClick={() => handleAddClick("lainnya")}
                          className="flex items-center gap-1 px-2 py-1 border-2 border-dashed border-blue-400 text-blue-500 rounded hover:bg-blue-50 transition-colors justify-center"
                        >
                          <span className="text-base font-bold">+</span>
                          <span className="text-xs">Tambah Data</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Kejadian Section */}
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-slate-900 mb-2 pb-1.5 border-b-2 border-green-600">
                      Kejadian
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {(() => {
                        // Checkbox kejadian harus tetap tersedia setelah daerah dipilih.
                        // `availableLayers.kejadian` hanya dipakai sebagai informasi availability,
                        // bukan untuk menghilangkan katalog checkbox. Data aktual tetap difilter
                        // saat `loadKejadianLayer()` dipanggil menggunakan currentBounds/adminFilter.
                        const catalog = layerData.kejadian || [];
                        const available = availableLayers.kejadian || [];
                        const byId = new Map(
                          available.map((item: any) => [item.id, item]),
                        );
                        const merged = catalog.map((item: any) => ({
                          ...item,
                          ...(byId.get(item.id) || {}),
                        }));
                        const catalogIds = new Set(
                          merged.map((item: any) => item.id),
                        );
                        available.forEach((item: any) => {
                          if (!catalogIds.has(item.id)) merged.push(item);
                        });
                        return merged;
                      })().map((layer: any) => (
                        <div
                          key={layer.id}
                          className={`flex items-center gap-1.5 bg-white text-slate-800 px-2 py-1.5 rounded-md border border-slate-200 shadow-sm ${loadingLayerNames.has(layer.name) ? "opacity-60 cursor-not-allowed" : ""}`}
                        >
                          <input
                            type="checkbox"
                            className="w-3 h-3 flex-shrink-0 accent-green-600"
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
                          <span
                            className="text-xs font-medium text-slate-800 flex-1 truncate cursor-help"
                            title={formatTableName(layer.name)}
                          >
                            {formatTableName(layer.name)}
                          </span>
                          {/* {layer.count && (
          <span className="text-[10px] text-gray-400 flex-shrink-0">
            ({layer.count})
          </span>
        )} */}
                          {/* Tombol delete hanya untuk layer manual upload */}
                          {layer.isManual && isAuthenticated && (
                            <button
                              onClick={() => {
                                setLayerToDelete({
                                  section: "kejadian",
                                  id: layer.id,
                                  name: layer.name,
                                });
                                setShowDeleteModal(true);
                              }}
                              className="text-red-500 hover:text-red-700 font-bold text-base flex-shrink-0"
                              title="Hapus layer"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}

                      {/* Tambah Data Button */}
                      {isAuthenticated && (
                        <button
                          onClick={() => handleAddClick("kejadian")}
                          className="flex items-center gap-1 px-2 py-1 border-2 border-dashed border-blue-400 text-blue-500 rounded hover:bg-blue-50 transition-colors justify-center"
                        >
                          <span className="text-base font-bold">+</span>
                          <span className="text-xs">Tambah Data</span>
                        </button>
                      )}
                    </div>
                    {(layerData.kejadian?.length === 0 ||
                      !layerData.kejadian) && (
                      <div className="text-xs text-gray-500 italic mt-2">
                        Belum ada data kejadian
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Toggle Panel Button */}
          <button
            onClick={() => setIsLayerPanelOpen(!isLayerPanelOpen)}
            className="absolute top-1/3 transform -translate-y-1/2 bg-green-600 text-white p-1.5 rounded-l-lg shadow-lg z-[1100] hover:bg-green-700"
            style={{ right: isLayerPanelOpen ? "320px" : "0" }}
          >
            <span className="text-lg">
              {isLayerPanelOpen ? "»" : "«"}
            </span>
          </button>
        </div>

        {/* Bottom Section: Charts / Tables - dapat disembunyikan */}
        {isBottomPanelOpen && (
          <div
            className="absolute bottom-0 left-0 z-[900] flex border-t border-slate-200 bg-white shadow-lg overflow-hidden"
            style={{
              height: "35vh",
              right: isLayerPanelOpen ? "320px" : "0",
            }}
          >
            <div className="flex-1 min-w-0 bg-white flex flex-col overflow-hidden">
              {/* Bottom Tabs */}
              <div className="bg-slate-50 border-b border-slate-200 px-3 py-1.5 flex gap-1.5 overflow-x-auto flex-shrink-0">
                {bottomTabs.map((tab) => {
                  const getLayerNameFromTabId = (tabId: string): string => {
                    const mapping: Record<string, string> = {
                      tutupanLahan: "tutupan_lahan",
                      jenisTanah: "jenis_tanah",
                      geologi: "geologi",
                      lahan_kritis: "lahan_kritis",
                      rawan_erosi: "rawan_erosi",
                      rawan_longsor: "rawan_longsor",
                      rawan_limpasan: "rawan_limpasan",
                      rawan_karhutla: "rawan_karhutla",
                    };
                    return mapping[tabId] || "";
                  };
                  const layerName = getLayerNameFromTabId(tab.id);
                  const isTabLoading = loadingLayerNames.has(layerName);
                  return (
                    <button
                      key={tab.id}
                      onClick={() => !isTabLoading && setActiveBottomTab(tab.id)}
                      disabled={isTabLoading}
                      className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                        activeBottomTab === tab.id
                          ? "border-b-2 border-blue-500 text-blue-600"
                          : isTabLoading
                            ? "text-gray-400 cursor-not-allowed"
                            : "text-gray-600 hover:text-gray-800 cursor-pointer"
                      }`}
                    >
                      {isTabLoading && <span className="inline-block animate-spin mr-1">⏳</span>}
                      {tab.icon} {tab.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex-1 min-h-0 overflow-hidden p-3">
                {renderBottomContent()}
              </div>
            </div>
          </div>
        )}

        {/* Toggle panel bawah — selalu tersedia */}
        <button
          type="button"
          onClick={() => setIsBottomPanelOpen((open) => !open)}
          aria-label={isBottomPanelOpen ? "Sembunyikan panel bawah" : "Tampilkan panel bawah"}
          title={isBottomPanelOpen ? "Sembunyikan panel bawah" : "Tampilkan panel bawah"}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1200] rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white shadow-lg hover:bg-slate-700 transition"
          style={{ left: isLayerPanelOpen ? "calc((100% - 320px) / 2)" : "50%" }}
        >
          {isBottomPanelOpen ? "⌄ Sembunyikan panel bawah" : "⌃ Tampilkan panel bawah"}
        </button>
      </div>

      {/* Modal Tambah Data */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000]"
          onClick={() => !isUploading && setShowAddModal(false)}
        >
          <div
            className="bg-white rounded-lg w-full max-w-md shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-base font-semibold">
                Tambah Data {getSectionTitle(currentSection)}
              </h3>
              <button
                onClick={() => !isUploading && setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                disabled={isUploading}
              >
                ×
              </button>
            </div>
            <div className="p-4">
              <input
                type="text"
                placeholder="Masukan nama tabel"
                value={newLayerName}
                onChange={(e) => setNewLayerName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded mb-3 focus:outline-none focus:border-blue-500"
                disabled={isUploading}
              />
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center bg-gray-50">
                <input
                  type="file"
                  id="shapefileInput"
                  multiple
                  accept=".shp,.shx,.dbf,.prj,.cpg,.sbn,.sbx"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={isUploading}
                />
                <label
                  htmlFor="shapefileInput"
                  className={`cursor-pointer block ${isUploading ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className="text-3xl text-gray-400 mb-1">☁️</div>
                  <div className="text-gray-500 text-xs mb-2">
                    {uploadedFiles.length > 0
                      ? `${uploadedFiles.length} file dipilih`
                      : "Upload file shapefile (.shp, .shx, .dbf, dll)"}
                  </div>
                  {uploadedFiles.length > 0 && (
                    <div className="text-[10px] text-gray-400 mt-2">
                      {uploadedFiles.map((f, idx) => (
                        <div key={idx}>{f.name}</div>
                      ))}
                    </div>
                  )}
                </label>
              </div>
              <div className="text-[10px] text-gray-500 mt-2">
                * Wajib upload minimal file .shp, disarankan juga upload .shx,
                .dbf, .prj
              </div>

              {/* Progress Bars */}
              {isUploading && (
                <div className="mt-4 space-y-3">
                  {/* Upload Progress */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-medium text-gray-700">
                        Upload Files
                      </span>
                      <span className="text-xs text-gray-600">
                        {uploadProgress}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div
                        className="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Insert Progress */}
                  {uploadProgress === 100 && (
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium text-gray-700">
                          Inserting Features
                          {insertStatus && (
                            <span className="ml-2 text-gray-500">
                              ({insertStatus})
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-gray-600">
                          {insertProgress}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div
                          className="bg-green-500 h-2.5 rounded-full transition-all duration-300"
                          style={{ width: `${insertProgress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isUploading}
              >
                Batal
              </button>
              <button
                onClick={handleCreateLayer}
                className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                disabled={isUploading}
              >
                {isUploading
                  ? uploadProgress < 100
                    ? "Mengupload..."
                    : "Memproses..."
                  : "Buat"}
              </button>
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
                        ? "3px solid #16a34a"
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
    </div>
  );
};

export default Kerawanan;
