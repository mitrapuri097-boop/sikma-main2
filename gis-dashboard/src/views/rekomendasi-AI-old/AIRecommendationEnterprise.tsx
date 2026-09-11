import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { API_URL } from "../../api";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Crosshair,
  Download,
  Droplets,
  Flame,
  Layers3,
  MapPinned,
  Mountain,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Wind,
  X,
  ChevronRight,
  ChevronLeft,
  Navigation,
} from "lucide-react";
import "leaflet/dist/leaflet.css";
import "./AIRecommendationEnterprise.css";

type Hazard = "Banjir" | "Longsor" | "Karhutla" | "Kekeringan";

const hazardMeta: Record<
  Hazard,
  { icon: typeof Droplets; markerClass: string; label: string }
> = {
  Banjir: { icon: Droplets, markerClass: "hazard-flood", label: "Banjir" },
  Longsor: { icon: Mountain, markerClass: "hazard-landslide", label: "Longsor" },
  Karhutla: { icon: Flame, markerClass: "hazard-fire", label: "Karhutla" },
  Kekeringan: { icon: Wind, markerClass: "hazard-drought", label: "Kekeringan" },
};

type Incident = {
  id: number | string;
  title?: string;
  category?: string;
  date?: string;
  location?: string;
  das?: string;
  longitude?: number | string;
  latitude?: number | string;
  curah_hujan?: number | string | null;
  description?: string;
};

type Candidate = Incident & {
  hazard: Hazard;
  lat: number;
  lng: number;
  area: string;
};

type AiRecommendation = {
  diagnosis?: string;
  risk_level?: string;
  primary_drivers?: string[];
  confidence?: number;
  verification_needed?: boolean;
  verification_reason?: string;
  recommendations?: Array<{
    rank: number;
    intervention_id: string;
    intervention: string;
    priority_score: number;
    urgency: string;
    expected_effect: string;
    why: string;
    evidence: string[];
    implementation_notes: string;
  }>;
  meta?: { model?: string; source?: string; generated_at?: string };
};

const normalizeHazard = (category = ""): Hazard | null => {
  const value = category.toLowerCase();
  if (value.includes("banjir")) return "Banjir";
  if (value.includes("longsor") || value.includes("erosi")) return "Longsor";
  if (value.includes("kebakaran") || value.includes("karhutla")) return "Karhutla";
  if (value.includes("kekeringan")) return "Kekeringan";
  return null;
};

const toNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const riskClass = (value = "") => {
  const v = value.toLowerCase();
  if (v.includes("tinggi") || v.includes("high")) return "risk-high";
  if (v.includes("sedang") || v.includes("medium")) return "risk-medium";
  return "risk-low";
};

function Brand() {
  return (
    <div className="simiti-map-brand">
      <div className="simiti-brand-logo">
        <ShieldCheck size={22} />
      </div>
      <div>
        <strong>Sistem Informasi Mitigasi dan Adaptasi</strong>
        <span>Bencana Hidrometeorologi</span>
      </div>
    </div>
  );
}

export default function AIRecommendationEnterprise() {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const boundaryLayerRef = useRef<L.LayerGroup | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedId, setSelectedId] = useState<number | string | null>(null);
  const [hazards, setHazards] = useState<Set<Hazard>>(
    new Set(["Banjir", "Longsor", "Karhutla", "Kekeringan"])
  );
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showLayers, setShowLayers] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [layersCount, setLayersCount] = useState<number | null>(null);
  const [aiResult, setAiResult] = useState<AiRecommendation | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [areaSearchQuery, setAreaSearchQuery] = useState("");
  const [areaSearchResults, setAreaSearchResults] = useState<any[]>([]);
  const [showAreaResults, setShowAreaResults] = useState(false);
  const [areaSearchLoading, setAreaSearchLoading] = useState(false);

  const candidates = useMemo<Candidate[]>(
    () =>
      incidents
        .map((item) => {
          const lat = toNumber(item.latitude);
          const lng = toNumber(item.longitude);
          const hazard = normalizeHazard(item.category);
          if (lat === null || lng === null || !hazard) return null;
          return {
            ...item,
            lat,
            lng,
            hazard,
            area: item.location || item.das || "Lokasi kejadian",
          };
        })
        .filter(Boolean) as Candidate[],
    [incidents]
  );

  const filteredCandidates = useMemo(
    () =>
      candidates.filter((item) => {
        const text = `${item.title || ""} ${item.area} ${item.category || ""} ${
          item.das || ""
        }`.toLowerCase();
        return hazards.has(item.hazard) && text.includes(query.toLowerCase());
      }),
    [candidates, hazards, query]
  );

  const selected =
    candidates.find((item) => String(item.id) === String(selectedId)) ||
    filteredCandidates[0] ||
    null;

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/kejadian/list`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const rows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : [];
      setIncidents(rows);
      const first = rows.find(
        (row: Incident) =>
          normalizeHazard(row.category) &&
          toNumber(row.latitude) !== null &&
          toNumber(row.longitude) !== null
      );
      if (first) setSelectedId(first.id);
    } catch (error) {
      console.error("Gagal mengambil data kejadian:", error);
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLayerCount = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/layers`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return;
      const data = await response.json();
      const groups = ["kerawanan", "mitigasiAdaptasi", "lainnya", "kejadian"];
      setLayersCount(
        groups.reduce(
          (total, key) =>
            total + (Array.isArray(data?.[key]) ? data[key].length : 0),
          0
        )
      );
    } catch {
      setLayersCount(null);
    }
  }, []);

  const requestAi = useCallback(async (candidate: Candidate | null) => {
    if (!candidate) {
      setAiResult(null);
      return;
    }
    setAiLoading(true);
    setAiError("");
    try {
      const response = await fetch(
        `${API_URL}/api/ai/mitigation-recommendation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            context: {
              selected_region: candidate.area,
              hazard: candidate.hazard.toLowerCase(),
              incident_id: candidate.id,
              incident_title: candidate.title,
              category_source: candidate.category,
              event_date: candidate.date,
              das: candidate.das,
              latitude: candidate.lat,
              longitude: candidate.lng,
              curah_hujan: candidate.curah_hujan,
              description: candidate.description,
              source: "SIMITI /api/kejadian/list",
            },
          }),
        }
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || `HTTP ${response.status}`);
      }
      setAiResult(data);
    } catch (error: any) {
      setAiResult(null);
      setAiError(error?.message || "AI recommendation gagal.");
    } finally {
      setAiLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchIncidents();
    void fetchLayerCount();
  }, [fetchIncidents, fetchLayerCount]);

  useEffect(() => {
    if (!selected) return;
    void requestAi(selected);
    setDrawerOpen(true);
  }, [selectedId, requestAi]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
    }).setView([-2.5, 118], 5);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      minZoom: 3,
    }).addTo(map);

    L.control.zoom({ position: "topright" }).addTo(map);

    markerLayerRef.current = L.layerGroup().addTo(map);
    boundaryLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    const resize = () => map.invalidateSize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      map.remove();
      mapInstanceRef.current = null;
      markerLayerRef.current = null;
      boundaryLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markerLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    filteredCandidates.forEach((item) => {
      const isSelected = String(item.id) === String(selectedId);
      const meta = hazardMeta[item.hazard];

      const icon = L.divIcon({
        className: "simiti-incident-marker-wrap",
        html: `
          <div class="simiti-incident-marker ${meta.markerClass} ${
            isSelected ? "selected" : ""
          }">
            <span>${isSelected ? "◆" : "•"}</span>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const marker = L.marker([item.lat, item.lng], { icon });

      marker.bindTooltip(
        `<strong>${escapeHtml(item.title || item.area)}</strong><br/>
         ${escapeHtml(item.category || item.hazard)}<br/>
         ${escapeHtml(item.date || "")}`,
        { direction: "top", offset: [0, -10], className: "simiti-tooltip" }
      );

      marker.on("click", () => {
        setSelectedId(item.id);
        setDrawerOpen(true);
        map.flyTo([item.lat, item.lng], Math.max(map.getZoom(), 9), {
          duration: 0.8,
        });
      });

      marker.addTo(layer);
    });
  }, [filteredCandidates, selectedId]);

  const searchAreas = async (value: string) => {
    const q = value.trim();
    if (q.length < 2) {
      setAreaSearchResults([]);
      setShowAreaResults(false);
      return;
    }

    setAreaSearchLoading(true);
    try {
      const levels = ["provinsi", "kabupaten", "kecamatan", "kelurahan"];
      const responses = await Promise.all(
        levels.map((level) =>
          fetch(
            `${API_URL}/api/areas/search?query=${encodeURIComponent(
              q
            )}&level=${level}`,
            { headers: { Accept: "application/json" } }
          )
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => [])
        )
      );

      const seen = new Set<string>();
      const merged = responses
        .flat()
        .filter((area: any) => {
          const key = `${area?.level || ""}:${
            area?.label ||
            area?.kab_kota ||
            area?.kecamatan ||
            area?.kelurahan ||
            ""
          }`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 12);

      setAreaSearchResults(merged);
      setShowAreaResults(true);
    } finally {
      setAreaSearchLoading(false);
    }
  };

  const handleAreaSearch = (value: string) => {
    setAreaSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => void searchAreas(value), 280);
  };

  const selectArea = (area: any) => {
    const map = mapInstanceRef.current;
    setShowAreaResults(false);
    setAreaSearchQuery(
      area?.label ||
        area?.kelurahan ||
        area?.kecamatan ||
        area?.kab_kota ||
        area?.provinsi ||
        ""
    );

    if (!map) return;

    boundaryLayerRef.current?.clearLayers();

    if (area?.geom) {
      const boundary = L.geoJSON(
        { type: "Feature", geometry: area.geom, properties: area },
        {
          style: {
            color: "#0f766e",
            weight: 3,
            opacity: 0.9,
            fillColor: "#14b8a6",
            fillOpacity: 0.1,
          },
        }
      ).addTo(boundaryLayerRef.current || map);

      map.fitBounds(boundary.getBounds(), {
        padding: [70, 70],
        maxZoom: 13,
      });
    } else {
      const lat = toNumber(area?.latitude ?? area?.lat);
      const lng = toNumber(area?.longitude ?? area?.lng ?? area?.lon);
      if (lat !== null && lng !== null) {
        map.flyTo([lat, lng], 11, { duration: 0.9 });
      }
    }
  };

  const fallbackGeocode = async () => {
    const q = areaSearchQuery.trim();
    const map = mapInstanceRef.current;
    if (!map || q.length < 3) return;

    try {
      const response = await fetch(
        `${API_URL}/api/geocode/search?q=${encodeURIComponent(q)}`,
        { headers: { Accept: "application/json" } }
      );
      const results = await response.json().catch(() => []);
      const result = Array.isArray(results) ? results[0] : null;
      const lat = toNumber(result?.lat);
      const lng = toNumber(result?.lon);

      if (lat !== null && lng !== null) {
        map.flyTo([lat, lng], 12, { duration: 1 });
        L.marker([lat, lng])
          .addTo(map)
          .bindPopup(escapeHtml(result?.display_name || q))
          .openPopup();
      }
    } catch (error) {
      console.warn("Fallback geocoder gagal:", error);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchIncidents(), fetchLayerCount()]);
    setRefreshing(false);
  };

  const exportGeoJson = () => {
    const data = {
      type: "FeatureCollection",
      features: filteredCandidates.map((item) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [item.lng, item.lat] },
        properties: {
          id: item.id,
          title: item.title,
          category: item.category,
          date: item.date,
          location: item.location,
          das: item.das,
          curah_hujan: item.curah_hujan,
          description: item.description,
        },
      })),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/geo+json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "simiti-rekomendasi-lokasi.geojson";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const toggleHazard = (hazard: Hazard) => {
    setHazards((current) => {
      const next = new Set(current);
      if (next.has(hazard)) next.delete(hazard);
      else next.add(hazard);
      return next;
    });
  };

  const focusSelected = () => {
    if (!selected || !mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo([selected.lat, selected.lng], 12, {
      duration: 0.8,
    });
    setDrawerOpen(true);
  };

  const risk = aiResult?.risk_level || "Belum dianalisis";
  const topRecommendation = aiResult?.recommendations?.[0];
  const SelectedIcon = selected
    ? hazardMeta[selected.hazard].icon
    : MapPinned;

  return (
    <div className="simiti-map-page">
      <header className="simiti-map-header">
        <Brand />

        <nav className="simiti-map-nav">
          <button type="button">Tentang Kami</button>
          <button type="button" className="active">
            Rekomendasi Mitigasi &amp; Adaptasi
          </button>
          <button type="button">Info Bencana</button>
        </nav>

        <div className="simiti-header-actions">
          <span className="simiti-live-status">
            <i /> LIVE
          </span>
          <button
            type="button"
            className="simiti-header-icon"
            title="Refresh"
            onClick={() => void refresh()}
          >
            <RefreshCw size={17} className={refreshing ? "spin" : ""} />
          </button>
        </div>
      </header>

      <main className="simiti-map-shell">
        <div className="simiti-map-search">
          <Search size={17} />
          <input
            value={areaSearchQuery}
            onChange={(e) => handleAreaSearch(e.target.value)}
            onFocus={() => areaSearchResults.length && setShowAreaResults(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void fallbackGeocode();
              if (e.key === "Escape") setShowAreaResults(false);
            }}
            placeholder="Cari provinsi / kabupaten / kecamatan..."
          />
          {areaSearchLoading && <RefreshCw size={15} className="spin" />}
          {areaSearchQuery && (
            <button
              type="button"
              onClick={() => {
                setAreaSearchQuery("");
                setAreaSearchResults([]);
                setShowAreaResults(false);
              }}
            >
              <X size={14} />
            </button>
          )}

          {showAreaResults && areaSearchResults.length > 0 && (
            <div className="simiti-area-results">
              {areaSearchResults.map((area, index) => (
                <button
                  type="button"
                  key={`${area?.id || area?.label || "area"}-${index}`}
                  onClick={() => selectArea(area)}
                >
                  <MapPinned size={15} />
                  <span>
                    <strong>
                      {area?.label ||
                        area?.kelurahan ||
                        area?.kecamatan ||
                        area?.kab_kota ||
                        area?.provinsi ||
                        "Wilayah"}
                    </strong>
                    <small>
                      {area?.level || "wilayah"}
                      {area?.provinsi ? ` · ${area.provinsi}` : ""}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="simiti-map-status">
          <span>
            <Activity size={13} /> {loading ? "Memuat data..." : `${filteredCandidates.length} lokasi`}
          </span>
          <span>
            <Layers3 size={13} /> {layersCount == null ? "—" : layersCount} layer
          </span>
        </div>

        <div ref={mapRef} className="simiti-map" />

        <div className="simiti-map-controls">
          <button
            type="button"
            onClick={() => mapInstanceRef.current?.setView([-2.5, 118], 5)}
            title="Kembali ke Indonesia"
          >
            <Navigation size={17} />
          </button>
          <button
            type="button"
            className={showLayers ? "active" : ""}
            onClick={() => setShowLayers((value) => !value)}
            title="Tampilkan legend"
          >
            <Layers3 size={17} />
          </button>
        </div>

        {showLayers && (
          <div className="simiti-map-legend">
            <div className="simiti-legend-title">LAYER &amp; LOKASI</div>
            {(Object.keys(hazardMeta) as Hazard[]).map((hazard) => {
              const Icon = hazardMeta[hazard].icon;
              const active = hazards.has(hazard);
              return (
                <button
                  type="button"
                  key={hazard}
                  className={active ? "active" : ""}
                  onClick={() => toggleHazard(hazard)}
                >
                  <span className={`legend-dot ${hazardMeta[hazard].markerClass}`}>
                    <Icon size={12} />
                  </span>
                  <span>{hazard}</span>
                  <i>{active ? "✓" : ""}</i>
                </button>
              );
            })}
            <div className="simiti-legend-divider" />
            <div className="simiti-legend-note">
              <span className="legend-ai-dot"><Target size={11} /></span>
              Lokasi terpilih / analisis AI
            </div>
          </div>
        )}

        <div className="simiti-map-footer-left">
          <span>© SIMITI Spatial Engine</span>
          <span>© OpenStreetMap</span>
        </div>

        <div className="simiti-map-footer-right">
          <Crosshair size={12} /> EPSG:4326
        </div>

        <button
          type="button"
          className={`simiti-drawer-tab ${drawerOpen ? "open" : ""}`}
          onClick={() => setDrawerOpen((value) => !value)}
          title={drawerOpen ? "Tutup panel" : "Buka rekomendasi"}
        >
          {drawerOpen ? <ChevronRight size={21} /> : <ChevronLeft size={21} />}
        </button>

        <aside className={`simiti-ai-drawer ${drawerOpen ? "open" : ""}`}>
          <div className="simiti-drawer-head">
            <div>
              <span>AI DECISION SUPPORT</span>
              <h2>Rekomendasi Mitigasi</h2>
            </div>
            <button type="button" onClick={() => setDrawerOpen(false)}>
              <X size={18} />
            </button>
          </div>

          {!selected ? (
            <div className="simiti-empty">
              <MapPinned size={30} />
              <strong>Belum ada lokasi</strong>
              <p>
                Pilih titik kejadian pada peta untuk menjalankan analisis AI.
              </p>
            </div>
          ) : (
            <>
              <div className="simiti-selected-card">
                <div className="simiti-selected-top">
                  <div className="simiti-selected-icon">
                    <SelectedIcon size={19} />
                  </div>
                  <div className="simiti-selected-title">
                    <small>LOKASI KEJADIAN #{selected.id}</small>
                    <h3>{selected.title || selected.area}</h3>
                    <p>{selected.area}</p>
                  </div>
                </div>

                <div className="simiti-selected-meta">
                  <span>{selected.category || selected.hazard}</span>
                  <span>{selected.date || "Tanggal tidak tersedia"}</span>
                </div>

                <button type="button" className="simiti-focus-btn" onClick={focusSelected}>
                  <MapPinned size={14} /> Tampilkan di peta
                </button>
              </div>

              <div className="simiti-risk-box">
                <div>
                  <span>TINGKAT RISIKO AI</span>
                  <strong className={riskClass(risk)}>{risk}</strong>
                </div>
                <div className="simiti-confidence">
                  <span>CONFIDENCE</span>
                  <strong>
                    {aiResult?.confidence == null
                      ? "—"
                      : `${Math.round(aiResult.confidence)}%`}
                  </strong>
                </div>
              </div>

              {aiLoading && (
                <div className="simiti-ai-loading">
                  <RefreshCw size={16} className="spin" />
                  <span>AI sedang menganalisis evidence SIMITI...</span>
                </div>
              )}

              {!aiLoading && aiResult && (
                <>
                  {aiResult.diagnosis && (
                    <div className="simiti-diagnosis">
                      <div className="simiti-mini-title">
                        <BrainCircuit size={14} /> DIAGNOSIS
                      </div>
                      <p>{aiResult.diagnosis}</p>
                    </div>
                  )}

                  <div className="simiti-drawer-section">
                    <div className="simiti-section-title">
                      <span>REKOMENDASI UTAMA</span>
                      <Sparkles size={14} />
                    </div>

                    {topRecommendation && (
                      <div className="simiti-main-recommendation">
                        <div className="simiti-rec-rank">01</div>
                        <div>
                          <strong>{topRecommendation.intervention}</strong>
                          <p>{topRecommendation.why}</p>
                        </div>
                        <b>{Math.round(topRecommendation.priority_score)}</b>
                      </div>
                    )}

                    {aiResult.recommendations?.slice(1).map((rec) => (
                      <div className="simiti-rec-row" key={`${rec.intervention_id}-${rec.rank}`}>
                        <span>{String(rec.rank).padStart(2, "0")}</span>
                        <div>
                          <strong>{rec.intervention}</strong>
                          <small>{rec.urgency || "Prioritas AI"}</small>
                        </div>
                        <b>{Math.round(rec.priority_score)}</b>
                      </div>
                    ))}
                  </div>

                  <div className="simiti-drawer-section">
                    <div className="simiti-section-title">
                      <span>EVIDENCE DATA</span>
                      <ShieldCheck size={14} />
                    </div>

                    <div className="simiti-evidence-list">
                      <div>
                        <span>Tanggal kejadian</span>
                        <strong>{selected.date || "—"}</strong>
                      </div>
                      <div>
                        <span>Curah hujan</span>
                        <strong>
                          {selected.curah_hujan == null
                            ? "—"
                            : String(selected.curah_hujan)}
                        </strong>
                      </div>
                      <div>
                        <span>DAS</span>
                        <strong>{selected.das || "—"}</strong>
                      </div>
                      <div>
                        <span>Koordinat</span>
                        <strong>
                          {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {aiResult.primary_drivers?.length ? (
                    <div className="simiti-driver-box">
                      <Sparkles size={14} />
                      <div>
                        <span>DRIVER UTAMA</span>
                        <p>{aiResult.primary_drivers.join(" · ")}</p>
                      </div>
                    </div>
                  ) : null}

                  {aiResult.verification_needed && (
                    <div className="simiti-verification">
                      <AlertTriangle size={14} />
                      <span>
                        {aiResult.verification_reason ||
                          "Output AI perlu diverifikasi dengan data lapangan."}
                      </span>
                    </div>
                  )}
                </>
              )}

              {!aiLoading && !aiResult && (
                <div className="simiti-ai-error">
                  <AlertTriangle size={15} />
                  <span>{aiError || "Analisis AI belum tersedia."}</span>
                </div>
              )}
            </>
          )}

          <div className="simiti-drawer-bottom">
            <button type="button" onClick={exportGeoJson}>
              <Download size={14} /> Export GeoJSON
            </button>
            <span>
              <Activity size={12} /> Live backend data
            </span>
          </div>
        </aside>

        <div className="simiti-mobile-hint">
          <span><MapPinned size={13} /> Klik titik untuk analisis AI</span>
        </div>
      </main>
    </div>
  );
}
