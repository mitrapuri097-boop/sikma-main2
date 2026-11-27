import React, { useState, useRef, useEffect } from 'react';
import { MapPin, Heart } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {API_URL} from './api';

export default function DetailKejadianDummy() {
  const location = useLocation();
  const navigate = useNavigate();
  const { id: incidentId } = useParams<{ id: string }>();
  const [incidentData, setIncidentData] = useState<any>(location.state?.incident || null);
  const [incidentLoading, setIncidentLoading] = useState(true);
  const [incidentError, setIncidentError] = useState('');

  // Sumber utama detail adalah tabel public.kejadian melalui API list.
  // Dengan demikian URL detail tetap dapat dibuka langsung / di-refresh.
  useEffect(() => {
    const controller = new AbortController();
    const loadIncident = async () => {
      if (!incidentId) {
        setIncidentError('ID kejadian tidak ditemukan pada URL.');
        setIncidentLoading(false);
        return;
      }

      setIncidentLoading(true);
      setIncidentError('');
      try {
        const response = await fetch(`${API_URL}/api/kejadian/list`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Gagal mengambil data kejadian (HTTP ${response.status}).`);

        const payload = await response.json();
        const rows = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.data)
            ? payload.data
            : Array.isArray(payload?.incidents)
              ? payload.incidents
              : [];
        const raw = rows.find((row: any) => String(row?.id) === String(incidentId));
        if (!raw) throw new Error(`Data kejadian dengan ID ${incidentId} tidak ditemukan pada database.`);

        const parseArray = (value: any): string[] => {
          if (Array.isArray(value)) return value.filter(Boolean).map(String);
          if (typeof value !== 'string' || !value.trim()) return [];
          try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
          } catch { /* format string biasa ditangani di bawah */ }
          return value.split(',').map((item: string) => item.trim()).filter(Boolean);
        };
        const lat = Number(raw.latitude);
        const lng = Number(raw.longitude);
        const thumbnail = raw.thumbnail_path || '';
        const image = thumbnail
          ? (/^https?:\/\//i.test(String(thumbnail)) ? String(thumbnail) : `${API_URL}${String(thumbnail).startsWith('/') ? '' : '/'}${thumbnail}`)
          : '';

        setIncidentData({
          ...raw,
          id: raw.id,
          title: raw.title || 'Kejadian tanpa judul',
          category: raw.category || 'Bencana',
          date: raw.date || '-',
          location: raw.location || 'Lokasi belum tersedia',
          das: raw.das || '',
          latitude: Number.isFinite(lat) ? lat : null,
          longitude: Number.isFinite(lng) ? lng : null,
          coordinates: Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : [-2.5, 118],
          curah_hujan: raw.curah_hujan ?? null,
          featured: Boolean(raw.featured),
          thumbnail_path: thumbnail,
          images_paths: parseArray(raw.images_paths),
          image,
          type: String(raw.category || '').toLowerCase().includes('banjir') ? 'banjir'
            : String(raw.category || '').toLowerCase().includes('longsor') ? 'longsor'
            : String(raw.category || '').toLowerCase().includes('kebakaran') ? 'kebakaran'
            : String(raw.category || '').toLowerCase().includes('kering') ? 'kekeringan'
            : String(raw.category || '').toLowerCase().includes('abrasi') ? 'abrasi' : 'lainnya',
        });
      } catch (error: any) {
        if (error?.name !== 'AbortError') {
          console.error('Gagal memuat detail kejadian:', error);
          setIncidentData(null);
          setIncidentError(error?.message || 'Terjadi kesalahan saat mengambil data kejadian.');
        }
      } finally {
        if (!controller.signal.aborted) setIncidentLoading(false);
      }
    };

    void loadIncident();
    return () => controller.abort();
  }, [incidentId]);
  
  const [activeTab, setActiveTab] = useState('overview');
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null);
  const [tutupanLahanData, setTutupanLahanData] = useState([]);
  const [dasGeometry, setDasGeometry] = useState(null);
  const [kerawananData, setKerawananData] = useState([]);
  const [kerawananLayers, setKerawananLayers] = useState({});
  const [visibleLayers, setVisibleLayers] = useState({});
  const [isLoadingLayers, setIsLoadingLayers] = useState(false);
  const [loadingSpecificLayers, setLoadingSpecificLayers] = useState<Set<string>>(new Set());
  const [layerColors, setLayerColors] = useState({});
  const [tutupanLahanLayer, setTutupanLahanLayer] = useState(null);
  const [tutupanLahanVisible, setTutupanLahanVisible] = useState(false);
  const [tutupanLahanColors, setTutupanLahanColors] = useState({});
  const [kerawananDataColors, setKerawananDataColors] = useState({});
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  
  const overviewRef = useRef(null);
  const galleryRef = useRef(null);
  const locationRef = useRef(null);

  const formatDasName = (dasName: string): string => {
    if (!dasName) return '';
    
    // Split by space untuk handle multi-word
    return dasName
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };


  // Extract province from location (after comma)
  const getProvince = (locationStr) => {
    if (!locationStr) return '';
    const parts = locationStr.split(',');
    return parts.length > 1 ? parts[1].trim() : locationStr;
  };

  // Extract city from location (before comma)
  const getCity = (locationStr) => {
    if (!locationStr) return '';
    const parts = locationStr.split(',');
    return parts[0].trim();
  };
  // Function untuk fetch data kerawanan berdasarkan kategori
  const fetchKerawananData = async () => {
    if (!incidentData?.das || !incidentData?.category) return;
    
    try {
      const response = await fetch(
        `${API_URL}/api/kerawanan/by-das?das=${encodeURIComponent(incidentData.das)}&category=${encodeURIComponent(incidentData.category)}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch kerawanan data');
      }
      
      const data = await response.json();
      
      if (data.success) {
        console.log('Kerawanan data:', data.data);
        setKerawananData(data.data);
      }
    } catch (error) {
      console.error('Error fetching kerawanan data:', error);
      setKerawananData([]);
    }
  };

  // Function untuk fetch tutupan lahan data
  const fetchTutupanLahanData = async () => {
    if (!incidentData?.das) return;
    
    try {
      // Gunakan DAS untuk agregasi (bukan koordinat)
      const response = await fetch(
        `${API_URL}/api/tutupan-lahan/by-das?das=${encodeURIComponent(incidentData.das)}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch tutupan lahan data');
      }
      
      const data = await response.json();
      
      if (data.success && data.data) {
        console.log('📊 Chart data pl2024_ids:', data.data.map(d => d.pl2024_id));
        console.log('📊 Chart data:', data.data);
        
        setTutupanLahanData(data.data);
      }
    } catch (error) {
      console.error('Error fetching tutupan lahan data:', error);
      setTutupanLahanData([]);
    }
  };

  // Function untuk fetch DAS geometry
const fetchDasGeometry = async () => {
    if (!incidentData?.das) return;
    
    try {
      // Gunakan nama DAS dari incidentData, bukan koordinat
      const response = await fetch(
        `${API_URL}/api/das/geometry-by-name?dasName=${encodeURIComponent(incidentData.das)}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch DAS geometry');
      }
      
      const data = await response.json();
      
      if (data.success && data.geom) {
        setDasGeometry(data.geom);
        console.log('DAS geometry loaded:', incidentData.das);
      }
    } catch (error) {
      console.error('Error fetching DAS geometry:', error);
      setDasGeometry(null);
    }
  };

  const fetchTutupanLahanLayer = async () => {
    if (!incidentData?.das) return;
    
    setIsLoadingLayers(true);
    
    try {
      const dasFilter = JSON.stringify([incidentData.das]);
      const bounds = '-11,95,6,141';
      const zoom = 13;
      
      const url = `${API_URL}/api/layers/tutupan_lahan/geojson?bounds=${bounds}&zoom=${zoom}&dasFilter=${encodeURIComponent(dasFilter)}`;
      
      console.log('Fetching tutupan_lahan layer with DAS filter:', incidentData.das);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to fetch tutupan_lahan layer');
      }
      
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        // Generate colors untuk setiap unique pl2024_id, gunakan index yang konsisten
        const uniquePl2024Ids = Array.from(new Set(
          data.features.map(f => f.properties.pl2024_id)
        )).sort((a, b) => a - b); // Sort numerically
        
        console.log('🎨 Unique pl2024_ids from layer:', uniquePl2024Ids);
        
        const colors = {};
        uniquePl2024Ids.forEach((pl2024_id, idx) => {
          const color = getBarColor(idx);
          colors[pl2024_id] = color;
          console.log(`  pl2024_id ${pl2024_id} → ${color} (index ${idx})`);
        });
        
        console.log('Generated colors:', colors);
        
        // SET COLORS DULU sebelum set layer dan fetch data
        setTutupanLahanColors(colors);
        
        // Tunggu sebentar agar state colors ter-update
        setTimeout(() => {
          setTutupanLahanLayer(data);
          console.log('Tutupan lahan layer loaded:', data.features.length, 'features');
          
          // SETELAH colors dan layer di-set, fetch data untuk chart
          fetchTutupanLahanData();
        }, 0);
      }
    } catch (error) {
      console.error('Error fetching tutupan lahan layer:', error);
      setTutupanLahanLayer(null);
    } finally {
      setIsLoadingLayers(false);
    }
  };

  // Helper function untuk menentukan warna dan label curah hujan
  const getRainfallColorAndLabel = (rainfall) => {
    if (rainfall === 0) {
      return { color: '#9CA3AF', label: 'Berawan', bg: '#F3F4F6' };
    } else if (rainfall > 0 && rainfall <= 20) {
      return { color: '#10B981', label: 'Hujan ringan', bg: '#D1FAE5' };
    } else if (rainfall > 20 && rainfall <= 50) {
      return { color: '#F59E0B', label: 'Hujan sedang', bg: '#FEF3C7' };
    } else if (rainfall > 50 && rainfall <= 100) {
      return { color: '#F97316', label: 'Hujan lebat', bg: '#FFEDD5' };
    } else if (rainfall > 100 && rainfall <= 150) {
      return { color: '#EF4444', label: 'Hujan sangat lebat', bg: '#FEE2E2' };
    } else {
      return { color: '#A855F7', label: 'Hujan ekstrem', bg: '#F3E8FF' };
    }
  };

  // Generate random colors for tutupan lahan bars
  const getBarColor = (index: number) => {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
      '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788',
      '#E63946', '#A8DADC', '#457B9D', '#F1FAEE', '#E76F51'
    ];
    return colors[index % colors.length];
  };

  const scrollToSection = (ref, tabName) => {
    setActiveTab(tabName);
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Helper function untuk mendapatkan judul tabel berdasarkan kategori
  const getKerawananTableTitle = () => {
    if (incidentData?.category === 'Banjir') {
      return 'Data Rawan Limpasan';
    } else if (incidentData?.category === 'Kebakaran Hutan dan Kekeringan') {
      return 'Data Rawan Karhutla';
    } else if (incidentData?.category === 'Tanah Longsor dan Erosi') {
      return 'Data Rawan Erosi';
    }
    return 'Data Lahan Kritis';
  };

  // Helper function untuk mendapatkan header kolom
  const getKerawananTableHeaders = () => {
    if (incidentData?.category === 'Banjir') {
      return ['Tingkat Limpasan', 'Luas Limpasan (Ha)'];
    } else if (incidentData?.category === 'Kebakaran Hutan dan Kekeringan') {
      return ['Tingkat Kerawanan', 'Luas Wilayah (Ha)'];
    } else if (incidentData?.category === 'Tanah Longsor dan Erosi') {
      return ['Tingkat Kerawanan', 'Luas Wilayah (Ton/Ha)'];
    }
    return ['Kelas', 'Luas'];
  };

  // Warna untuk layer kerawanan (mirip dengan geologi)
  const kerawananColors = {
    'Sangat Tinggi': '#FF0000',
    'Tinggi': '#FF4500',
    'Sedang': '#FFA500',
    'Menengah': '#FFA500',
    'Rendah': '#FFFF00',
    'Sangat Rendah': '#90EE90',
    'Normal': '#00FF00',
    'Ekstrim': '#8B0000'
  };

const fetchKerawananLayers = async () => {
    if (!incidentData?.category || !incidentData?.das) return;
    
    setIsLoadingLayers(true);
    
    try {
      console.log('=== DEBUG fetchKerawananLayers ===');
      console.log('incidentData.das:', incidentData.das);
      
      // Tentukan table names berdasarkan category
      let tableNames: string[] = [];
      
      if (incidentData.category === 'Banjir') {
        tableNames = ['rawan_limpasan'];
      } else if (incidentData.category === 'Kebakaran Hutan dan Kekeringan') {
        tableNames = ['rawan_karhutla'];
      } else if (incidentData.category === 'Tanah Longsor dan Erosi') {
        tableNames = ['rawan_erosi', 'rawan_longsor'];
      }
      
      // Set loading untuk semua layers
      setLoadingSpecificLayers(new Set(tableNames));
      
      const results: any = {};
      const allTingkatValues = new Set<string>();
      
      // Fetch setiap layer
      for (const tableName of tableNames) {
        const dasFilter = JSON.stringify([incidentData.das]);
        const bounds = '-11,95,6,141';
        const zoom = 13;
        
        const url = `${API_URL}/api/layers/${tableName}/geojson?bounds=${bounds}&zoom=${zoom}&dasFilter=${encodeURIComponent(dasFilter)}`;
        
        console.log(`Fetching ${tableName}`);
        
        const response = await fetch(url);
        
        if (!response.ok) {
          console.error(`Failed to fetch ${tableName}:`, response.status, response.statusText);
          // Remove dari loading set meskipun gagal
          setLoadingSpecificLayers(prev => {
            const next = new Set(prev);
            next.delete(tableName);
            return next;
          });
          continue;
        }
        
        const data = await response.json();
        results[tableName] = data;
        
        // Remove dari loading set setelah berhasil
        setLoadingSpecificLayers(prev => {
          const next = new Set(prev);
          next.delete(tableName);
          return next;
        });
        
        // Collect semua unique tingkat values
        data.features?.forEach((feature: any) => {
          const tingkat = feature.properties.tingkat || 
                         feature.properties.limpasan || 
                         feature.properties.kelas || 
                         feature.properties.unsur;
          
          if (tingkat) {
            allTingkatValues.add(tingkat);
          }
          
          // Handle rawan_erosi yang punya kls_a
          if (!tingkat && feature.properties.kls_a) {
            const kls_a = feature.properties.kls_a;
            let convertedTingkat = '';
            if (kls_a === '>480') {
              convertedTingkat = 'Sangat Tinggi';
            } else if (/^[0-9]+\.?[0-9]*$/.test(kls_a)) {
              const nilai = parseFloat(kls_a);
              if (nilai <= 15) convertedTingkat = 'Sangat Rendah';
              else if (nilai <= 60) convertedTingkat = 'Rendah';
              else if (nilai <= 180) convertedTingkat = 'Sedang';
              else if (nilai <= 480) convertedTingkat = 'Tinggi';
              else convertedTingkat = 'Sangat Tinggi';
            }
            if (convertedTingkat) {
              allTingkatValues.add(convertedTingkat);
            }
          }
        });
        
        console.log(`${tableName}: ${data.features?.length || 0} features (clipped)`);
      }
      
      // Generate colors untuk kerawanan data
      const dataColors = {};
      Array.from(allTingkatValues).forEach(tingkat => {
        dataColors[tingkat] = kerawananColors[tingkat] || '#808080';
      });
      
      setKerawananDataColors(dataColors);
      console.log('🎨 Kerawanan data colors:', dataColors);
      
      setKerawananLayers(results);
      
      // Set default visible state
      const defaultVisible: any = {};
      Object.keys(results).forEach(layerName => {
        defaultVisible[layerName] = true;
      });
      setVisibleLayers(defaultVisible);
      
      console.log('Kerawanan layers loaded:', results);
      
      // SETELAH layers loaded dan colors generated, fetch data agregat untuk tabel
      fetchKerawananData();
      
    } catch (error) {
      console.error('Error fetching kerawanan layers:', error);
      setKerawananLayers({});
      setLoadingSpecificLayers(new Set());
    } finally {
      setIsLoadingLayers(false);
    }
  };

  // Function untuk toggle layer visibility
  const toggleLayerVisibility = (layerName) => {
    // Jika layer belum di-load, jangan toggle
    if (!kerawananLayers[layerName]) {
      console.warn(`Layer ${layerName} belum loaded, tidak bisa toggle`);
      return;
    }
    
    setVisibleLayers(prev => ({
      ...prev,
      [layerName]: !prev[layerName]
    }));
  };

  // Function untuk get layer label
  const getLayerLabel = (layerName) => {
    const labels = {
      'rawan_limpasan': 'Rawan Limpasan (Banjir)',
      'rawan_karhutla': 'Rawan Karhutla',
      'rawan_erosi': 'Rawan Erosi',
      'rawan_longsor': 'Rawan Longsor'
    };
    return labels[layerName] || layerName;
  };

  // Initialize Leaflet map and fetch data
useEffect(() => {
  if (!incidentData) return;

  // Fetch tutupan lahan and DAS data HANYA SEKALI
  fetchTutupanLahanData();
  fetchDasGeometry();
  fetchKerawananData();

  const leafletCSS = document.createElement('link');
  leafletCSS.rel = 'stylesheet';
  leafletCSS.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(leafletCSS);

  const leafletScript = document.createElement('script');
  leafletScript.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  leafletScript.onload = () => {
    if (mapRef.current && window.L && !mapInstanceRef.current) {
      const map = window.L.map(mapRef.current).setView(incidentData.coordinates, 13);
      
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);
      
      // Create custom icon based on incident type
      const createCustomIcon = (type) => {
        let iconSVG = '';
        
        if (type === 'banjir') {
          iconSVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
          </svg>`;
        } else if (type === 'longsor') {
          iconSVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
          </svg>`;
        } else if (type === 'kebakaran') {
          iconSVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
            <path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/>
          </svg>`;
        }
        
        return window.L.divIcon({
          className: 'custom-detail-marker',
          html: `
            <div class="marker-container" style="position: relative; width: 44px; height: 44px;">
              <svg class="marker-circle" width="44" height="44" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">
                <circle class="marker-bg" cx="22" cy="22" r="20" fill="#3b82f6" stroke="white" stroke-width="3" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));"/>
              </svg>
              <div style="position: absolute; top: 12px; left: 12px; pointer-events: none;">
                ${iconSVG}
              </div>
            </div>
          `,
          iconSize: [44, 44],
          iconAnchor: [22, 22]
        });
      };

      window.L.marker(incidentData.coordinates, {
        icon: createCustomIcon(incidentData.type)
      }).addTo(map);
      
      mapInstanceRef.current = map;
    }
  };
  document.head.appendChild(leafletScript);

  return () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
    leafletCSS.remove();
    leafletScript.remove();
  };
}, [incidentData]); // HAPUS dasGeometry dari dependency!

useEffect(() => {
    if (incidentData && incidentData.coordinates) {
      fetchDasGeometry();
      fetchKerawananLayers();
      fetchTutupanLahanLayer();
      // fetchKerawananData();
      // fetchTutupanLahanData();
    }
  }, [incidentData]);

// Separate useEffect untuk render DAS layer dan kerawanan layers
useEffect(() => {
  if (!mapInstanceRef.current || !window.L) return;
  
  // Render DAS layer
  if (dasGeometry) {
    console.log('Adding DAS layer to map');
    
    if (mapInstanceRef.current._dasLayer) {
      mapInstanceRef.current.removeLayer(mapInstanceRef.current._dasLayer);
    }
    
    const dasLayer = window.L.geoJSON(dasGeometry, {
      style: {
        color: '#3b82f6',
        weight: 2,
        opacity: 0.8,
        fillColor: '#dbeafe',
        fillOpacity: 0.2
      }
    }).addTo(mapInstanceRef.current);
    
    mapInstanceRef.current._dasLayer = dasLayer;
  }
  
  // Render tutupan lahan layer
  if (mapInstanceRef.current._tutupanLahanLayer) {
    mapInstanceRef.current.removeLayer(mapInstanceRef.current._tutupanLahanLayer);
  }
  
  if (tutupanLahanVisible && tutupanLahanLayer && tutupanLahanLayer.features) {
    const layer = window.L.geoJSON(tutupanLahanLayer, {
      // SKIP Point geometry - hanya render Polygon
      filter: function(feature) {
        return feature.geometry && (
          feature.geometry.type === 'Polygon' || 
          feature.geometry.type === 'MultiPolygon'
        );
      },
      style: (feature) => {
        const pl2024_id = feature.properties.pl2024_id;
        const color = tutupanLahanColors[pl2024_id] || '#808080';
        
        return {
          color: color,
          weight: 1,
          opacity: 0.8,
          fillColor: color,
          fillOpacity: 0.4
        };
      }
    }).addTo(mapInstanceRef.current);
    
    mapInstanceRef.current._tutupanLahanLayer = layer;
  }
  
  // Render kerawanan layers
  Object.keys(kerawananLayers).forEach(layerName => {
    if (mapInstanceRef.current[`_${layerName}_layer`]) {
      mapInstanceRef.current.removeLayer(mapInstanceRef.current[`_${layerName}_layer`]);
    }
    
    if (visibleLayers[layerName] && kerawananLayers[layerName]) {
      const layer = window.L.geoJSON(kerawananLayers[layerName], {
        // SKIP Point geometry - hanya render Polygon
        filter: function(feature) {
          return feature.geometry && (
            feature.geometry.type === 'Polygon' || 
            feature.geometry.type === 'MultiPolygon'
          );
        },
        style: (feature) => {
          let tingkat = feature.properties.tingkat || 
                       feature.properties.limpasan || 
                       feature.properties.kelas || 
                       feature.properties.unsur;
          
          // Special handling untuk rawan_erosi yang masih punya kls_a
          if (!tingkat && feature.properties.kls_a) {
            const kls_a = feature.properties.kls_a;
            if (kls_a === '>480') {
              tingkat = 'Sangat Tinggi';
            } else if (/^[0-9]+\.?[0-9]*$/.test(kls_a)) {
              const nilai = parseFloat(kls_a);
              if (nilai <= 15) tingkat = 'Sangat Rendah';
              else if (nilai <= 60) tingkat = 'Rendah';
              else if (nilai <= 180) tingkat = 'Sedang';
              else if (nilai <= 480) tingkat = 'Tinggi';
              else tingkat = 'Sangat Tinggi';
            } else {
              tingkat = 'Sangat Tinggi';
            }
          }
          
          const color = kerawananColors[tingkat] || '#808080';
          
          return {
            color: color,
            weight: 1,
            opacity: 0.8,
            fillColor: color,
            fillOpacity: 0.3
          };
        }
      }).addTo(mapInstanceRef.current);
      
      mapInstanceRef.current[`_${layerName}_layer`] = layer;
    }
  });
}, [dasGeometry, kerawananLayers, visibleLayers, tutupanLahanLayer, tutupanLahanVisible, tutupanLahanColors]);

// Tambahkan di awal component untuk debug
useEffect(() => {
  if (incidentData) {
    console.log('=== INCIDENT DATA DEBUG ===');
    console.log('Full incidentData:', incidentData);
    console.log('curah_hujan value:', incidentData.curah_hujan);
    console.log('curah_hujan type:', typeof incidentData.curah_hujan);
    console.log('Has curah_hujan property:', 'curah_hujan' in incidentData);
  }
}, [incidentData]);

  // Loading state saat mengambil record dari database.
  if (incidentLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-emerald-600" />
          <p className="text-sm font-medium text-gray-600">Memuat detail kejadian...</p>
          <p className="mt-1 text-xs text-gray-400">ID: {incidentId || '-'}</p>
        </div>
      </div>
    );
  }

  // If no incident data, show error
  if (!incidentData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Data tidak ditemukan</h1>
          <p className="text-gray-600 mb-4">{incidentError || 'Silakan kembali ke halaman kejadian'}</p>
          <button
            onClick={() => navigate('/kebencanaan')}
            className="bg-red-500 text-white px-6 py-2 rounded hover:bg-red-600 transition"
          >
            Kembali ke Halaman Kejadian
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>
        {`
          .custom-detail-marker {
            background: none;
            border: none;
          }
        `}
      </style>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {/* Back Button */}
          <button
            onClick={() => navigate('/kebencanaan')}
            className="flex items-center gap-2 mb-4 text-gray-600 hover:text-gray-800 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            <span className="text-sm font-medium">Kembali ke Halaman Kejadian</span>
          </button>
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            {/* Identitas kejadian diselaraskan dengan kolom tabel utama: ID, Judul, Tanggal, Lokasi */}
            <div className="flex justify-between items-start mb-4">
              <div className="min-w-0 w-full">
                <h1 className="text-2xl font-semibold text-gray-800 mb-3 break-words">
                  {incidentData.title || 'Tanpa Judul'}
                </h1>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-gray-600 text-sm">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="font-medium text-gray-500">ID:</span>
                    <span className="font-semibold text-gray-800">
                      {incidentData.id ?? incidentData.kejadian_id ?? incidentData.incident_id ?? '-'}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="font-medium text-gray-500">Tanggal:</span>
                    <span className="text-gray-800">
                      {incidentData.date || incidentData.tanggal || '-'}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <MapPin className="w-4 h-4 shrink-0" />
                    <span className="font-medium text-gray-500">Lokasi:</span>
                    <span className="text-gray-800 break-words">{incidentData.location || '-'}</span>
                  </span>
                </div>
              </div>
              {/* <button
                onClick={() => setIsBookmarked(!isBookmarked)}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
              >
                <Heart className={`w-4 h-4 ${isBookmarked ? 'fill-red-500 text-red-500' : 'text-gray-600'}`} />
                <span className="text-sm text-gray-700">Bookmark this listing</span>
              </button> */}
            </div>

            <div className="relative rounded-lg overflow-hidden mb-6">
              <img
                src={incidentData.image || (incidentData.thumbnail_path ? `${API_URL}${String(incidentData.thumbnail_path).startsWith('/') ? '' : '/'}${incidentData.thumbnail_path}` : '')}
                alt={incidentData.title}
                className="w-full h-96 object-cover"
              />
            </div>

            <div className="flex gap-8 border-b border-gray-200 mb-6">
              <button
                onClick={() => scrollToSection(overviewRef, 'overview')}
                className={`pb-3 text-sm font-medium transition-colors ${
                  activeTab === 'overview' ? 'text-red-500 border-b-2 border-red-500' : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => scrollToSection(galleryRef, 'gallery')}
                className={`pb-3 text-sm font-medium transition-colors ${
                  activeTab === 'gallery' ? 'text-red-500 border-b-2 border-red-500' : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                Gallery
              </button>
              <button
                onClick={() => scrollToSection(locationRef, 'location')}
                className={`pb-3 text-sm font-medium transition-colors ${
                  activeTab === 'location' ? 'text-red-500 border-b-2 border-red-500' : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                Location
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <div ref={overviewRef} className="mb-8 scroll-mt-4">
                  <p className="text-gray-700 leading-relaxed mb-6 text-justify">
                   {incidentData?.description || 'Tidak ada deskripsi'}
                  </p>

                </div>

                {/* Gallery Section */}
                <div ref={galleryRef} className="mb-8 scroll-mt-4">
                  <h3 className="text-lg font-medium text-gray-800 mb-4">Gallery</h3>
                  <div className="grid grid-cols-5 gap-2">
                    {incidentData?.images_paths && incidentData.images_paths.length > 0 ? (
                      incidentData.images_paths.slice(0, 10).map((photo, idx) => (
                        <div key={idx} className="relative aspect-square">
                          <img
                            src={/^https?:\/\//i.test(String(photo)) ? String(photo) : `${API_URL}${String(photo).startsWith('/') ? '' : '/'}${photo}`}
                            alt={`Photo ${idx + 1}`}
                            className="w-full h-full object-cover rounded cursor-pointer hover:opacity-80 transition"
                            onClick={() => setSelectedPhotoIndex(idx)}
                          />
                          {idx === 9 && incidentData.images_paths.length > 10 && (
                            <div 
                              className="absolute inset-0 bg-black/50 bg-opacity-70 flex items-center justify-center rounded cursor-pointer hover:bg-opacity-60 transition"
                              onClick={() => setSelectedPhotoIndex(idx)}
                            >
                              <span className="text-white text-3xl font-bold">+{incidentData.images_paths.length - 10}</span>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="col-span-5 text-center py-8 text-gray-400 text-sm">
                        Tidak ada foto
                      </div>
                    )}
                  </div>
                </div>

                {/* Location Section with Leaflet Map */}
                <div ref={locationRef} className="scroll-mt-4">
                  <h3 className="text-lg font-medium text-gray-800 mb-4">Location</h3>
                  <div className="bg-gray-100 rounded-lg overflow-hidden h-96 relative">
                    <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
                    <button className="absolute top-4 left-4 bg-white px-4 py-2 rounded shadow-md text-sm flex items-center gap-2 hover:bg-gray-50 transition-colors z-[1000]">
                      <MapPin className="w-4 h-4" />
                      Get Directions
                    </button>
                    <div className="absolute bottom-4 right-4 bg-white px-3 py-1 rounded shadow-md text-xs text-gray-600 z-[1000]">
                      Leaflet | © OpenStreetMap contributors
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-1">
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h3 className="text-lg font-medium text-gray-800 mb-4">Informasi Kondisi Lokasi</h3>
                  
                  {/* Layer Toggle Controls */}
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Layer Kerawanan</h4>
                    <div>

                      {/* Tutupan Lahan Toggle */}
                      <div className="flex items-center justify-between py-1 mb-2">
                        <span className="text-xs text-gray-700 flex items-center gap-1">
                          {isLoadingLayers && (
                            <span className="inline-block animate-spin">⏳</span>
                          )}
                          Tutupan Lahan
                        </span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={tutupanLahanVisible}
                            onChange={() => setTutupanLahanVisible(!tutupanLahanVisible)}
                            disabled={isLoadingLayers || !tutupanLahanLayer}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
                        </label>
                      </div>
                      
                      {/* Kerawanan Layers - Selalu tampilkan berdasarkan category */}
{(() => {
  let layerNames: string[] = [];
  
  if (incidentData.category === 'Banjir') {
    layerNames = ['rawan_limpasan'];
  } else if (incidentData.category === 'Kebakaran Hutan dan Kekeringan') {
    layerNames = ['rawan_karhutla'];
  } else if (incidentData.category === 'Tanah Longsor dan Erosi') {
    layerNames = ['rawan_erosi', 'rawan_longsor'];
  }
  
  return (
    <div className="space-y-2">
      {layerNames.map(layerName => {
        const isLayerLoading = loadingSpecificLayers.has(layerName);
        const isLayerLoaded = !!kerawananLayers[layerName];
        
        return (
          <div key={layerName} className="flex items-center justify-between py-1">
            <span className="text-xs text-gray-700 flex items-center gap-1">
              {isLayerLoading && (
                <span className="inline-block animate-spin">⏳</span>
              )}
              {getLayerLabel(layerName)}
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={visibleLayers[layerName] || false}
                onChange={() => toggleLayerVisibility(layerName)}
                disabled={isLayerLoading || !isLayerLoaded}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
            </label>
          </div>
        );
      })}
    </div>
  );
})()}
                    </div>
                  </div>

                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Data Curah Hujan</h4>
                    {incidentData?.curah_hujan !== undefined && incidentData?.curah_hujan !== null ? (
                      <div>
                        <div 
                          className="rounded-lg p-6 flex flex-col items-center justify-center"
                          style={{ 
                            backgroundColor: getRainfallColorAndLabel(incidentData.curah_hujan).bg 
                          }}
                        >
                          <div 
                            className="text-3xl font-black mb-2"
                            style={{ 
                              color: getRainfallColorAndLabel(incidentData.curah_hujan).color 
                            }}
                          >
                            {incidentData.curah_hujan} mm/hari
                          </div>
                          <div 
                            className="text-sm font-semibold uppercase tracking-wide"
                            style={{ 
                              color: getRainfallColorAndLabel(incidentData.curah_hujan).color 
                            }}
                          >
                            {getRainfallColorAndLabel(incidentData.curah_hujan).label}
                          </div>
                        </div>
                        
                      </div>
                    ) : (
                      <div className="text-center text-gray-400 py-8">
                        <p className="text-sm">Data curah hujan tidak tersedia</p>
                      </div>
                    )}
                  </div>

                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Data Tutupan Lahan</h4>
                    {tutupanLahanData.length > 0 ? (
    <div>
      <div className="flex gap-2 h-32 items-end">
        {tutupanLahanData.map((item, index) => {
  const maxLuas = Math.max(...tutupanLahanData.map(d => parseFloat(d.total_luas_ha || 0)));
  const luasValue = parseFloat(item.total_luas_ha || 0);
  const height = maxLuas > 0 ? (luasValue / maxLuas) * 100 : 0;
  
  // Get color from tutupanLahanColors
  const barColor = tutupanLahanColors[item.pl2024_id] || getBarColor(index);
  
  console.log(`📊 Bar ${index}: pl2024_id=${item.pl2024_id}, color=${barColor}, deskripsi=${item.deskripsi_domain}`);
  
  return (
    <div 
      key={index}
      className="flex-1 rounded-t relative group cursor-pointer"
      style={{
        height: `${height}%`,
        backgroundColor: barColor,
        minHeight: '20%'
      }}
    >
      {/* Tooltip on hover */}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
        <div className="font-semibold">{item.deskripsi_domain || `Kode: ${item.pl2024_id}` || 'Unknown'}</div>
        <div className="text-xs">Luas: {luasValue.toFixed(2)} Ha</div>
      </div>
    </div>
  );
})}
      </div>
      <p className="text-xs text-gray-500 mt-3 text-center">
        Hover untuk melihat detail tutupan lahan
      </p>
    </div>
  ) : (
    <div className="text-center text-gray-400 py-8">
      <p className="text-sm">Tidak ada data tutupan lahan</p>
    </div>
  )}
                  </div>

                  {/* Tabel Rawan Longsor */}
                    {incidentData.category === 'Tanah Longsor dan Erosi' && kerawananData.filter(item => item.type === 'longsor').length > 0 && (
                      <div className="mt-6">
                        <h4 className="text-sm font-medium text-gray-700 mb-3">Data Rawan Longsor</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-gray-200">
                                <th className="text-left py-2 px-2 font-medium text-gray-600">
                                  Warna
                                </th>
                                <th className="text-left py-2 px-2 font-medium text-gray-600">
                                  Tingkat Kerawanan
                                </th>
                                <th className="text-left py-2 px-2 font-medium text-gray-600">
                                  Luas Wilayah (Ton/Ha)
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {kerawananData.filter(item => item.type === 'longsor').map((item, idx) => (
                                <tr key={idx} className="border-b border-gray-100">
                                  <td className="py-2 px-2">
                                    <div 
                                      className="w-8 h-4 rounded border border-gray-300"
                                      style={{ backgroundColor: kerawananDataColors[item.tingkat] || kerawananColors[item.tingkat] || '#808080' }}
                                    ></div>
                                  </td>
                                  <td className="py-2 px-2 text-gray-700">{item.tingkat}</td>
                                  <td className="py-2 px-2 text-gray-700">{parseFloat(item.luas_total).toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

      {/* Tabel Kerawanan - Universal untuk semua kategori */}
      <div className="mt-6">
        <h4 className="text-sm font-medium text-gray-700 mb-3">{getKerawananTableTitle()}</h4>
        {(() => {
          // Filter berdasarkan category
          let filteredData = [];
          
          if (incidentData.category === 'Banjir') {
            filteredData = kerawananData.filter(item => item.type === 'limpasan' || !item.type);
          } else if (incidentData.category === 'Kebakaran Hutan dan Kekeringan') {
            filteredData = kerawananData.filter(item => item.type === 'karhutla' || !item.type);
          } else if (incidentData.category === 'Tanah Longsor dan Erosi') {
            filteredData = kerawananData.filter(item => item.type === 'erosi' || !item.type);
          } else {
            filteredData = kerawananData;
          }
          
          return filteredData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 font-medium text-gray-600">
                      Warna
                    </th>
                    {getKerawananTableHeaders().map((header, idx) => (
                      <th key={idx} className="text-left py-2 px-2 font-medium text-gray-600">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="py-2 px-2">
                        <div 
                          className="w-6 h-4 rounded border border-gray-300"
                          style={{ backgroundColor: kerawananDataColors[item.tingkat] || kerawananColors[item.tingkat] || '#808080' }}
                        ></div>
                      </td>
                      <td className="py-2 px-2 text-gray-700">{item.tingkat}</td>
                      <td className="py-2 px-2 text-gray-700">
                        {parseFloat(item.luas_total).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center text-gray-400 py-4">
              <p className="text-xs">Tidak ada data kerawanan</p>
            </div>
          );
        })()}
      </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Photo Modal - Full Screen Viewer */}
    {selectedPhotoIndex !== null && incidentData?.images_paths && (
      <div 
        className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center"
        style={{ zIndex: 9999 }}
        onClick={() => setSelectedPhotoIndex(null)}
      >
        <button 
          onClick={() => setSelectedPhotoIndex(null)}
          className="absolute top-4 right-4 text-white hover:text-gray-300"
          style={{ zIndex: 10000 }}
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Previous Button */}
        {selectedPhotoIndex > 0 && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setSelectedPhotoIndex(prev => prev - 1);
            }}
            className="absolute left-4 text-white hover:text-gray-300"
            style={{ zIndex: 10000 }}
          >
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Photo */}
        <div 
          className="max-w-7xl max-h-screen p-4" 
          onClick={(e) => e.stopPropagation()}
          style={{ zIndex: 10000 }}
        >
          <img 
            src={/^https?:\/\//i.test(String(incidentData.images_paths[selectedPhotoIndex])) ? String(incidentData.images_paths[selectedPhotoIndex]) : `${API_URL}${String(incidentData.images_paths[selectedPhotoIndex]).startsWith('/') ? '' : '/'}${incidentData.images_paths[selectedPhotoIndex]}`}
            alt={`Photo ${selectedPhotoIndex + 1}`}
            className="max-w-full max-h-[90vh] object-contain mx-auto"
          />
          <p className="text-white text-center mt-4">
            {selectedPhotoIndex + 1} / {incidentData.images_paths.length}
          </p>
        </div>

        {/* Next Button */}
        {selectedPhotoIndex < incidentData.images_paths.length - 1 && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setSelectedPhotoIndex(prev => prev + 1);
            }}
            className="absolute right-4 text-white hover:text-gray-300"
            style={{ zIndex: 10000 }}
          >
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    )}
      </div>
    </>
  );
}