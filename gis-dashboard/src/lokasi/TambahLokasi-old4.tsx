import React, {
  ChangeEvent,
  DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { NavLink, useNavigate } from "react-router-dom";

import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  ClipboardCheck,
  CloudUpload,
  Crosshair,
  Database,
  FileImage,
  FileText,
  Info,
  Layers3,
  Map,
  MapPinned,
  Navigation,
  PencilLine,
  Save,
  ShieldCheck,
  Target,
  Upload,
  X,
} from "lucide-react";

import {
  CircleMarker,
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:3001"
).replace(/\/$/, "");

const API_ENDPOINTS = {
  locations: `${API_URL}/api/lokasi`,
  create: `${API_URL}/api/lokasi-kegiatan`,
  provinsi: `${API_URL}/api/master/provinsi`,
  kabKota: `${API_URL}/api/master/kab-kota`,
  kecamatan: `${API_URL}/api/master/kecamatan`,
  kelDesa: `${API_URL}/api/master/kel-desa`,
  das: `${API_URL}/api/master/das`,
};

type CoordinateSource = "MAP" | "MANUAL" | "GPS" | "";

type StepId =
  | "activity"
  | "spatial"
  | "administration"
  | "documentation"
  | "review";

type DocumentationCategory =
  | "before"
  | "progress"
  | "after"
  | "supporting_document";

interface ActivityForm {
  nama_kegiatan: string;
  jenis_kegiatan: string;
  tahun_pelaksanaan: string;
  sumber_pendanaan: string;
  instansi_pelaksana: string;
  provinsi: string;
  kabupaten_kota: string;
  kecamatan: string;
  desa_kelurahan: string;
  das: string;
  luas_area: string;
  status_pelaksanaan: string;
  keterangan: string;
  latitude: string;
  longitude: string;
}

interface DocumentationFile {
  id: string;
  file: File;
  category: DocumentationCategory;
  previewUrl: string | null;
}

interface MasterItem {
  code: string;
  name: string;
  parentCode?: string;
}

interface DasItem {
  code: string;
  name: string;
  province?: string;
  district?: string;
  subdistrict?: string;
  village?: string;
}

interface MasterOptions {
  provinces: MasterItem[];
  districts: MasterItem[];
  subdistricts: MasterItem[];
  villages: MasterItem[];
  das: DasItem[];
}

const ACTIVITY_TYPES = [
  "Mitigasi banjir",
  "Mitigasi tanah longsor",
  "Mitigasi kekeringan",
  "Mitigasi kebakaran hutan dan lahan",
  "Rehabilitasi hutan dan lahan",
  "Pengembangan hutan mangrove",
  "Konservasi daerah tangkapan air",
  "Pembangunan sarana konservasi tanah dan air",
  "Adaptasi perubahan iklim pada kawasan hutan",
  "Kegiatan perhutanan sosial yang mendukung ketahanan bencana",
];

const ACTIVITY_STATUSES = [
  "Draft",
  "Direncanakan",
  "Berjalan",
  "Selesai",
  "Ditunda",
  "Menunggu Verifikasi",
];

const INITIAL_FORM: ActivityForm = {
  nama_kegiatan: "",
  jenis_kegiatan: "",
  tahun_pelaksanaan: "",
  sumber_pendanaan: "",
  instansi_pelaksana: "",
  provinsi: "",
  kabupaten_kota: "",
  kecamatan: "",
  desa_kelurahan: "",
  das: "",
  luas_area: "",
  status_pelaksanaan: "Draft",
  keterangan: "",
  latitude: "",
  longitude: "",
};

const EMPTY_MASTER: MasterOptions = {
  provinces: [],
  districts: [],
  subdistricts: [],
  villages: [],
  das: [],
};

const STEPS: Array<{
  id: StepId;
  number: string;
  title: string;
  description: string;
  icon: React.ElementType;
}> = [
  {
    id: "activity",
    number: "01",
    title: "Informasi Kegiatan",
    description: "Identitas dan klasifikasi kegiatan",
    icon: ClipboardCheck,
  },
  {
    id: "spatial",
    number: "02",
    title: "Lokasi Spasial",
    description: "Titik koordinat kegiatan",
    icon: MapPinned,
  },
  {
    id: "administration",
    number: "03",
    title: "Administrasi & DAS",
    description: "Wilayah administratif dan hidrologi",
    icon: Layers3,
  },
  {
    id: "documentation",
    number: "04",
    title: "Dokumentasi",
    description: "Foto dan dokumen pendukung",
    icon: FileImage,
  },
  {
    id: "review",
    number: "05",
    title: "Review & Validasi",
    description: "Pemeriksaan sebelum pengajuan",
    icon: ShieldCheck,
  },
];

const DEFAULT_MAP_CENTER: [number, number] = [-2.5489, 118.0149];

function validLat(v: string) {
  const n = Number(v);
  return !!v.trim() && Number.isFinite(n) && n >= -90 && n <= 90;
}

function validLng(v: string) {
  const n = Number(v);
  return !!v.trim() && Number.isFinite(n) && n >= -180 && n <= 180;
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";

  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);

  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

function catLabel(c: DocumentationCategory) {
  return c === "before"
    ? "Sebelum"
    : c === "progress"
      ? "Pelaksanaan"
      : c === "after"
        ? "Setelah"
        : "Dokumen Pendukung";
}

function catIcon(c: DocumentationCategory) {
  return c === "supporting_document" ? FileText : FileImage;
}

function makeDoc(
  file: File,
  category: DocumentationCategory,
): DocumentationFile {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    file,
    category,
    previewUrl: file.type.startsWith("image/")
      ? URL.createObjectURL(file)
      : null,
  };
}

function MapClickHandler({
  onChange,
}: {
  onChange: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onChange(
        Number(e.latlng.lat.toFixed(7)),
        Number(e.latlng.lng.toFixed(7)),
      );
    },
  });

  return null;
}

function MapController({
  latitude,
  longitude,
}: {
  latitude: number | null;
  longitude: number | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (
      latitude == null ||
      longitude == null ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return;
    }

    map.flyTo([latitude, longitude], Math.max(map.getZoom(), 15), {
      duration: 0.6,
    });
  }, [latitude, longitude, map]);

  return null;
}

export default function TambahLokasi() {
  const navigate = useNavigate();

  const [form, setForm] = useState<ActivityForm>(INITIAL_FORM);

  const [master, setMaster] = useState<MasterOptions>({
    ...EMPTY_MASTER,
  });

  const [loadingMaster, setLoadingMaster] = useState({
    provinces: false,
    districts: false,
    subdistricts: false,
    villages: false,
    das: false,
  });

  const [dasSearch, setDasSearch] = useState("");
  const [selectedDasCode, setSelectedDasCode] = useState("");
  const [activeStep, setActiveStep] = useState<StepId>("activity");
  const [coordinateSource, setCoordinateSource] =
    useState<CoordinateSource>("");
  const [coordinateValidated, setCoordinateValidated] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const [files, setFiles] = useState<DocumentationFile[]>([]);
  const [draggingCategory, setDraggingCategory] =
    useState<DocumentationCategory | null>(null);

  const [notification, setNotification] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const [savingAction, setSavingAction] = useState<"draft" | "submit" | null>(
    null,
  );

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const fileInputRefs = {
    before: useRef<HTMLInputElement>(null),
    progress: useRef<HTMLInputElement>(null),
    after: useRef<HTMLInputElement>(null),
    supporting_document: useRef<HTMLInputElement>(null),
  };

  const update = <K extends keyof ActivityForm>(
    field: K,
    value: ActivityForm[K],
  ) => {
    setForm((p) => ({ ...p, [field]: value }));

    if (field === "latitude" || field === "longitude") {
      setCoordinateSource("MANUAL");
      setCoordinateValidated(false);
    }

    setNotification(null);
  };

  const fetchJson = async <T,>(url: string): Promise<T> => {
    const r = await fetch(url);

    if (!r.ok) {
      throw new Error(`Server ${r.status}`);
    }

    const j = await r.json();

    return (j.data ?? j) as T;
  };

  useEffect(() => {
    let cancelled = false;

    setLoadingMaster((p) => ({
      ...p,
      provinces: true,
    }));

    fetchJson<any[]>(API_ENDPOINTS.provinsi)
      .then((rows) => {
        if (!cancelled) {
          setMaster((m) => ({
            ...m,
            provinces: rows.map((x) => ({
              code: String(x.kode_prov),
              name: String(x.provinsi),
            })),
          }));
        }
      })
      .catch((e) => console.error("Gagal memuat provinsi:", e))
      .finally(() => {
        if (!cancelled) {
          setLoadingMaster((p) => ({
            ...p,
            provinces: false,
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const query = dasSearch.trim();

    if (query.length < 2) {
      setMaster((m) => ({
        ...m,
        das: [],
      }));

      setLoadingMaster((p) => ({
        ...p,
        das: false,
      }));

      return;
    }

    let cancelled = false;

    const timer = window.setTimeout(() => {
      setLoadingMaster((p) => ({
        ...p,
        das: true,
      }));

      fetchJson<any[]>(
        `${API_ENDPOINTS.das}?search=${encodeURIComponent(query)}&limit=20`,
      )
        .then((rows) => {
          if (!cancelled) {
            setMaster((m) => ({
              ...m,
              das: rows
                .map((x) => ({
                  code: String(x.kode_das ?? ""),
                  name: String(x.nama_das ?? ""),
                  province: x.provinsi ? String(x.provinsi) : undefined,
                  district: x.kabupaten_kota
                    ? String(x.kabupaten_kota)
                    : undefined,
                  subdistrict: x.kecamatan ? String(x.kecamatan) : undefined,
                  village: x.desa_kelurahan
                    ? String(x.desa_kelurahan)
                    : undefined,
                }))
                .filter((x) => x.name),
            }));
          }
        })
        .catch((e) => {
          if (!cancelled) {
            console.error("Gagal mencari DAS:", e);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoadingMaster((p) => ({
              ...p,
              das: false,
            }));
          }
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [dasSearch]);

  useEffect(() => {
    if (!form.provinsi) {
      setMaster((m) => ({
        ...m,
        districts: [],
        subdistricts: [],
        villages: [],
      }));

      return;
    }

    const code = master.provinces.find((x) => x.name === form.provinsi)?.code;

    if (!code) return;

    let cancelled = false;

    setLoadingMaster((p) => ({
      ...p,
      districts: true,
    }));

    fetchJson<any[]>(
      `${API_ENDPOINTS.kabKota}?kode_prov=${encodeURIComponent(code)}`,
    )
      .then((rows) => {
        if (!cancelled) {
          setMaster((m) => ({
            ...m,
            districts: rows.map((x) => ({
              code: String(x.kode_kk),
              name: String(x.kab_kota),
              parentCode: String(x.kode_prov),
            })),
            subdistricts: [],
            villages: [],
          }));
        }
      })
      .catch((e) => console.error(e))
      .finally(() => {
        if (!cancelled) {
          setLoadingMaster((p) => ({
            ...p,
            districts: false,
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [form.provinsi, master.provinces]);

  useEffect(() => {
    if (!form.kabupaten_kota) {
      setMaster((m) => ({
        ...m,
        subdistricts: [],
        villages: [],
      }));

      return;
    }

    const code = master.districts.find(
      (x) => x.name === form.kabupaten_kota,
    )?.code;

    if (!code) return;

    let cancelled = false;

    setLoadingMaster((p) => ({
      ...p,
      subdistricts: true,
    }));

    fetchJson<any[]>(
      `${API_ENDPOINTS.kecamatan}?kode_kk=${encodeURIComponent(code)}`,
    )
      .then((rows) => {
        if (!cancelled) {
          setMaster((m) => ({
            ...m,
            subdistricts: rows.map((x) => ({
              code: String(x.kode_kec),
              name: String(x.kecamatan),
              parentCode: String(x.kode_kk),
            })),
            villages: [],
          }));
        }
      })
      .catch((e) => console.error(e))
      .finally(() => {
        if (!cancelled) {
          setLoadingMaster((p) => ({
            ...p,
            subdistricts: false,
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [form.kabupaten_kota, master.districts]);

  useEffect(() => {
    if (!form.kecamatan) {
      setMaster((m) => ({
        ...m,
        villages: [],
      }));

      return;
    }

    const code = master.subdistricts.find(
      (x) => x.name === form.kecamatan,
    )?.code;

    if (!code) return;

    let cancelled = false;

    setLoadingMaster((p) => ({
      ...p,
      villages: true,
    }));

    fetchJson<any[]>(
      `${API_ENDPOINTS.kelDesa}?kode_kec=${encodeURIComponent(code)}`,
    )
      .then((rows) => {
        if (!cancelled) {
          setMaster((m) => ({
            ...m,
            villages: rows.map((x) => ({
              code: String(x.kode_kd),
              name: String(x.kel_desa),
              parentCode: String(x.kode_kec),
            })),
          }));
        }
      })
      .catch((e) => console.error(e))
      .finally(() => {
        if (!cancelled) {
          setLoadingMaster((p) => ({
            ...p,
            villages: false,
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [form.kecamatan, master.subdistricts]);

  const setProvince = (name: string) => {
    setForm((p) => ({
      ...p,
      provinsi: name,
      kabupaten_kota: "",
      kecamatan: "",
      desa_kelurahan: "",
    }));
  };

  const setDistrict = (name: string) => {
    setForm((p) => ({
      ...p,
      kabupaten_kota: name,
      kecamatan: "",
      desa_kelurahan: "",
    }));
  };

  const setSubdistrict = (name: string) => {
    setForm((p) => ({
      ...p,
      kecamatan: name,
      desa_kelurahan: "",
    }));
  };

  const selectDas = (item: DasItem) => {
    setSelectedDasCode(item.code);

    setForm((p) => ({
      ...p,
      das: item.name,
    }));

    setDasSearch(item.name);
  };

  const lat = form.latitude.trim() ? Number(form.latitude) : null;

  const lng = form.longitude.trim() ? Number(form.longitude) : null;

  const validCoordinates = validLat(form.latitude) && validLng(form.longitude);

  const setMapCoordinate = (a: number, o: number) => {
    setForm((p) => ({
      ...p,
      latitude: a.toFixed(7),
      longitude: o.toFixed(7),
    }));

    setCoordinateSource("MAP");
    setCoordinateValidated(false);
  };

  const useGps = () => {
    setGpsError("");

    if (!navigator.geolocation) {
      setGpsError("Browser tidak mendukung geolocation perangkat.");

      return;
    }

    setGpsLoading(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMapCoordinate(
          Number(pos.coords.latitude.toFixed(7)),
          Number(pos.coords.longitude.toFixed(7)),
        );

        setCoordinateSource("GPS");
        setGpsLoading(false);
      },
      (e) => {
        setGpsError(
          e.code === e.PERMISSION_DENIED
            ? "Akses lokasi ditolak. Izinkan browser menggunakan lokasi perangkat."
            : e.code === e.POSITION_UNAVAILABLE
              ? "Informasi lokasi perangkat tidak tersedia."
              : "Permintaan lokasi perangkat mengalami timeout.",
        );

        setGpsLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  };

  const validateCoordinates = () => {
    if (!validCoordinates) {
      return setNotification({
        type: "error",
        message:
          "Koordinat belum valid. Latitude -90 sampai 90 dan longitude -180 sampai 180.",
      });
    }

    setCoordinateValidated(true);

    setNotification({
      type: "success",
      message: "Koordinat valid sebagai WGS84 / EPSG:4326.",
    });
  };

  const addFiles = (
    selected: FileList | File[],
    category: DocumentationCategory,
  ) => {
    const incoming = Array.from(selected);

    const valid = incoming.filter((f) =>
      category === "supporting_document"
        ? f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
        : f.type === "image/jpeg" || /\.(jpg|jpeg)$/i.test(f.name),
    );

    if (valid.length !== incoming.length) {
      setNotification({
        type: "error",
        message:
          category === "supporting_document"
            ? "Dokumen pendukung hanya menerima PDF."
            : "Foto kegiatan hanya menerima JPG/JPEG.",
      });
    }

    if (valid.length) {
      setFiles((p) => [...p, ...valid.map((f) => makeDoc(f, category))]);
    }
  };

  const removeFile = (id: string) =>
    setFiles((p) => {
      const t = p.find((x) => x.id === id);

      if (t?.previewUrl) {
        URL.revokeObjectURL(t.previewUrl);
      }

      return p.filter((x) => x.id !== id);
    });

  const docs = useMemo(
    () => ({
      before: files.filter((x) => x.category === "before").length,
      progress: files.filter((x) => x.category === "progress").length,
      after: files.filter((x) => x.category === "after").length,
      supporting: files.filter((x) => x.category === "supporting_document")
        .length,
      total: files.length,
    }),
    [files],
  );

  const completion = useMemo(() => {
    const c = [
      !!form.nama_kegiatan.trim(),
      !!form.jenis_kegiatan,
      !!form.tahun_pelaksanaan,
      !!form.sumber_pendanaan.trim(),
      !!form.instansi_pelaksana.trim(),
      validCoordinates,
      !!form.provinsi,
      !!form.kabupaten_kota,
      !!form.kecamatan,
      !!form.desa_kelurahan,
      !!form.das,
      !!form.luas_area,
      !!form.status_pelaksanaan,
      docs.total > 0,
    ];

    return Math.round((c.filter(Boolean).length / c.length) * 100);
  }, [form, validCoordinates, docs.total]);

  const stepCompletion = {
    activity:
      !!form.nama_kegiatan.trim() &&
      !!form.jenis_kegiatan &&
      !!form.tahun_pelaksanaan &&
      !!form.sumber_pendanaan.trim() &&
      !!form.instansi_pelaksana.trim(),

    spatial: validCoordinates,

    administration:
      !!form.provinsi &&
      !!form.kabupaten_kota &&
      !!form.kecamatan &&
      !!form.desa_kelurahan &&
      !!form.das,

    documentation: docs.total > 0,

    review: completion === 100,
  };

  const errors = useMemo(() => {
    const e: string[] = [];

    if (!form.nama_kegiatan.trim()) e.push("Nama kegiatan belum diisi.");

    if (!form.jenis_kegiatan) e.push("Jenis kegiatan belum dipilih.");

    if (!form.tahun_pelaksanaan) e.push("Tahun pelaksanaan belum dipilih.");

    if (!form.sumber_pendanaan.trim()) e.push("Sumber pendanaan belum diisi.");

    if (!form.instansi_pelaksana.trim())
      e.push("Instansi pelaksana belum diisi.");

    if (!validCoordinates) e.push("Koordinat lokasi belum valid.");

    if (!form.provinsi) e.push("Provinsi belum dipilih.");

    if (!form.kabupaten_kota) e.push("Kabupaten/Kota belum dipilih.");

    if (!form.kecamatan) e.push("Kecamatan belum dipilih.");

    if (!form.desa_kelurahan) e.push("Desa/Kelurahan belum dipilih.");

    if (!form.das) e.push("DAS belum dipilih.");

    if (!form.luas_area) e.push("Luas area belum diisi.");

    return e;
  }, [form, validCoordinates]);

  const go = (s: StepId) => {
    setActiveStep(s);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const idx = STEPS.findIndex((x) => x.id === activeStep);

  const buildPayload = () => ({
    ...form,

    kode_prov:
      master.provinces.find((x) => x.name === form.provinsi)?.code || null,

    kode_kk:
      master.districts.find((x) => x.name === form.kabupaten_kota)?.code ||
      null,

    kode_kec:
      master.subdistricts.find((x) => x.name === form.kecamatan)?.code || null,

    kode_kd:
      master.villages.find((x) => x.name === form.desa_kelurahan)?.code || null,

    kode_das: selectedDasCode || null,

    tahun_pelaksanaan: form.tahun_pelaksanaan
      ? Number(form.tahun_pelaksanaan)
      : null,

    luas_area: form.luas_area ? Number(form.luas_area) : null,

    latitude: Number(form.latitude),
    longitude: Number(form.longitude),

    coordinate_source: coordinateSource,
    coordinate_validated: coordinateValidated,
    spatial_reference: "EPSG:4326",

    dokumentasi: files.map((f) => ({
      category: f.category,
      filename: f.file.name,
      mime_type: f.file.type,
      size: f.file.size,
    })),
  });

  const save = async (submit: boolean) => {
    if (submit && errors.length) {
      setNotification({
        type: "error",
        message: `Data belum lengkap. Masih ada ${errors.length} item yang perlu diperiksa.`,
      });

      go(
        !stepCompletion.activity
          ? "activity"
          : !stepCompletion.spatial
            ? "spatial"
            : !stepCompletion.administration
              ? "administration"
              : !stepCompletion.documentation
                ? "documentation"
                : "review",
      );

      return;
    }

    setSavingAction(submit ? "submit" : "draft");
    setNotification(null);

    try {
      const payload = {
        ...buildPayload(),
        status_pelaksanaan: submit
          ? "Menunggu Verifikasi"
          : form.status_pelaksanaan,
      };

      const response = await fetch(API_ENDPOINTS.create, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || `Server ${response.status}`);
      }

      setNotification({
        type: "success",
        message: submit
          ? "Data berhasil disimpan dan diajukan untuk verifikasi."
          : "Data berhasil disimpan sebagai draft.",
      });

      if (submit) {
        setTimeout(() => navigate("/lokasi"), 700);
      }
    } catch (e) {
      console.error(e);

      setNotification({
        type: "error",
        message: e instanceof Error ? e.message : "Gagal menyimpan data.",
      });
    } finally {
      setSavingAction(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F5F8] text-[#1E293B]">
      {/* HEADER */}
      <header className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-[1800px] px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="mb-2 flex gap-2 text-[9px] font-bold uppercase tracking-[0.18em] text-[#94A3B8]">
                <NavLink
                  to="/lokasi"
                  className="text-[#94A3B8] no-underline transition hover:text-blue-600"
                >
                  Inventarisasi & Pemetaan
                </NavLink>

                <span>/</span>

                <span className="text-blue-600">
                  Activity Registration Workspace
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-xl font-extrabold tracking-tight text-[#1E293B] sm:text-2xl">
                  Input Data Lokasi Kegiatan
                </h1>

                <span className="inline-flex items-center gap-1.5 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-1 text-[8px] font-extrabold uppercase text-[#64748B]">
                  <Circle size={6} fill="currentColor" />
                  Draft
                </span>
              </div>

              <p className="mt-1 max-w-3xl text-[10px] leading-relaxed text-[#64748B]">
                Workspace terintegrasi untuk registrasi atribut kegiatan,
                koordinat spasial, administrasi, dokumentasi, dan validasi data
                SIMITI.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <div className="text-[8px] font-bold uppercase tracking-[0.15em] text-[#94A3B8]">
                  Data Completion
                </div>

                <div className="mt-1 text-lg font-extrabold text-[#1E293B]">
                  {completion}%
                </div>
              </div>

              <div className="h-10 w-10 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] p-1">
                <div
                  className="h-full rounded-full"
                  style={{
                    background: `conic-gradient(#2563EB ${
                      completion * 3.6
                    }deg,#E8EDF3 0deg)`,
                  }}
                >
                  <div className="flex h-full items-center justify-center rounded-full bg-white text-[8px] font-extrabold text-blue-600">
                    {completion}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* NOTIFICATION */}
      {notification && (
        <div className="mx-auto max-w-[1800px] px-4 pt-4 sm:px-6 lg:px-8">
          <Notification
            {...notification}
            onClose={() => setNotification(null)}
          />
        </div>
      )}

      <main className="mx-auto max-w-[1800px] px-4 py-5 sm:px-6 lg:px-8">
        <div className="grid gap-5 xl:grid-cols-[250px_minmax(0,1fr)]">
          {/* SIDEBAR */}
          <aside className="h-fit xl:sticky xl:top-5">
            <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
              <div className="border-b border-[#E2E8F0] p-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600">
                    <PencilLine size={15} />
                  </div>

                  <div>
                    <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#334155]">
                      Registration Flow
                    </div>

                    <div className="mt-0.5 text-[8px] text-[#94A3B8]">
                      5 tahap registrasi
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-2">
                {STEPS.map((s, i) => {
                  const Icon = s.icon;
                  const active = activeStep === s.id;
                  const complete = stepCompletion[s.id];

                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => go(s.id)}
                      className={`relative flex w-full items-start gap-3 rounded-xl p-3 text-left transition ${
                        active
                          ? "bg-blue-50 text-[#1E293B]"
                          : "text-[#64748B] hover:bg-[#F8FAFC]"
                      }`}
                    >
                      {i < 4 && (
                        <span className="absolute left-[25px] top-[39px] h-8 w-px bg-[#E2E8F0]" />
                      )}

                      <div
                        className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                          complete
                            ? "border-blue-200 bg-blue-50 text-blue-600"
                            : active
                              ? "border-blue-200 bg-blue-600 text-white"
                              : "border-[#E2E8F0] bg-[#F8FAFC] text-[#94A3B8]"
                        }`}
                      >
                        {complete ? <Check size={13} /> : <Icon size={13} />}
                      </div>

                      <div className="pt-0.5">
                        <div className="flex gap-2">
                          <span className="text-[8px] font-extrabold text-[#94A3B8]">
                            {s.number}
                          </span>

                          <span className="text-[10px] font-bold">
                            {s.title}
                          </span>
                        </div>

                        <div className="mt-1 text-[8px] text-[#94A3B8]">
                          {s.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="border-t border-[#E2E8F0] p-3">
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                  <div className="flex justify-between text-[8px] font-bold uppercase text-[#94A3B8]">
                    <span>Completion</span>
                    <span className="text-blue-600">{completion}%</span>
                  </div>

                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E2E8F0]">
                    <div
                      className="h-full rounded-full bg-blue-600"
                      style={{
                        width: `${completion}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* CONTENT */}
          <div className="min-w-0">
            {/* STEP 01 */}
            {activeStep === "activity" && (
              <WorkspaceSection
                number="01"
                title="Informasi Kegiatan"
                description="Identitas utama dan klasifikasi kegiatan yang akan diregistrasikan."
                icon={ClipboardCheck}
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  <Field
                    label="Nama Kegiatan"
                    required
                    className="lg:col-span-2"
                  >
                    <Input
                      value={form.nama_kegiatan}
                      onChange={(v) => update("nama_kegiatan", v)}
                      placeholder="Contoh: Rehabilitasi DAS dan Penguatan Infrastruktur Konservasi"
                    />
                  </Field>

                  <Field label="Klasifikasi Kegiatan" required>
                    <Select
                      value={form.jenis_kegiatan}
                      onChange={(v) => update("jenis_kegiatan", v)}
                      placeholder="Pilih jenis kegiatan"
                      options={ACTIVITY_TYPES}
                    />
                  </Field>

                  <Field label="Tahun Pelaksanaan" required>
                    <YearSelect
                      value={form.tahun_pelaksanaan}
                      onChange={(v) => update("tahun_pelaksanaan", v)}
                    />
                  </Field>

                  <Field label="Sumber Pendanaan" required>
                    <Input
                      value={form.sumber_pendanaan}
                      onChange={(v) => update("sumber_pendanaan", v)}
                      placeholder="APBN / APBD / Hibah / DAK"
                    />
                  </Field>

                  <Field label="Instansi Pelaksana" required>
                    <Input
                      value={form.instansi_pelaksana}
                      onChange={(v) => update("instansi_pelaksana", v)}
                      placeholder="Nama instansi / unit pelaksana"
                    />
                  </Field>

                  <Field label="Luas Area Kegiatan" required>
                    <div className="relative">
                      <Input
                        value={form.luas_area}
                        onChange={(v) => update("luas_area", v)}
                        placeholder="0.00"
                        type="number"
                        min="0"
                        step="0.01"
                        className="pr-12"
                      />

                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-[#94A3B8]">
                        ha
                      </span>
                    </div>
                  </Field>

                  <Field label="Status Pelaksanaan" required>
                    <Select
                      value={form.status_pelaksanaan}
                      onChange={(v) => update("status_pelaksanaan", v)}
                      options={ACTIVITY_STATUSES}
                    />
                  </Field>

                  <Field
                    label="Keterangan Tambahan"
                    description="Opsional"
                    className="lg:col-span-2"
                  >
                    <textarea
                      value={form.keterangan}
                      onChange={(e) => update("keterangan", e.target.value)}
                      rows={5}
                      className="w-full rounded-xl border border-[#D9E1EA] bg-[#F8FAFC] px-3 py-3 text-[10px] text-[#1E293B] outline-none placeholder:text-[#94A3B8] focus:border-blue-400/60 focus:bg-white"
                      placeholder="Tambahkan informasi teknis atau catatan lain yang relevan..."
                    />
                  </Field>
                </div>

                <SectionInfo
                  icon={Info}
                  title="Klasifikasi otomatis"
                  text={
                    form.jenis_kegiatan
                      ? `Kegiatan akan diregistrasikan pada kelompok "${form.jenis_kegiatan}".`
                      : "Pilih jenis kegiatan untuk menentukan klasifikasi registry spasial."
                  }
                />
              </WorkspaceSection>
            )}

            {/* STEP 02 */}
            {activeStep === "spatial" && (
              <WorkspaceSection
                number="02"
                title="Lokasi Spasial"
                description="Tentukan titik kegiatan melalui peta, koordinat manual, atau GPS perangkat."
                icon={MapPinned}
              >
                <div className="overflow-hidden rounded-2xl border border-[#D9E1EA] bg-[#F8FAFC]">
                  <div className="relative h-[430px]">
                    <MapContainer
                      center={
                        lat != null && lng != null
                          ? [lat, lng]
                          : DEFAULT_MAP_CENTER
                      }
                      zoom={validCoordinates ? 15 : 5}
                      scrollWheelZoom
                      className="h-full w-full"
                    >
                      <TileLayer
                        attribution="&copy; OpenStreetMap contributors"
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />

                      <MapClickHandler onChange={setMapCoordinate} />

                      <MapController latitude={lat} longitude={lng} />

                      {validCoordinates && (
                        <CircleMarker
                          center={[lat as number, lng as number]}
                          radius={10}
                          pathOptions={{
                            color: "#2563EB",
                            fillColor: "#2563EB",
                            fillOpacity: 0.75,
                            weight: 3,
                          }}
                        />
                      )}
                    </MapContainer>

                    <div className="absolute left-3 top-3 z-[1000] rounded-xl border border-[#D9E1EA] bg-white/95 px-3 py-2 shadow-sm">
                      <div className="flex items-center gap-2">
                        <Map size={13} className="text-blue-600" />

                        <span className="text-[9px] font-bold text-[#334155]">
                          Klik peta untuk menentukan titik
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-[#E2E8F0] bg-white p-4">
                    <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
                      <Field label="Latitude" required>
                        <Input
                          value={form.latitude}
                          onChange={(v) => update("latitude", v)}
                          placeholder="-6.2088000"
                          type="number"
                          step="any"
                          className="font-mono"
                        />
                      </Field>

                      <Field label="Longitude" required>
                        <Input
                          value={form.longitude}
                          onChange={(v) => update("longitude", v)}
                          placeholder="106.8456000"
                          type="number"
                          step="any"
                          className="font-mono"
                        />
                      </Field>

                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={validateCoordinates}
                          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-[9px] font-extrabold text-blue-600 transition hover:bg-blue-100 lg:w-auto"
                        >
                          <CheckCircle2 size={14} />
                          Validasi
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 sm:flex-row sm:justify-between">
                      <div className="flex gap-2.5">
                        <Navigation size={13} className="mt-1 text-[#64748B]" />

                        <div>
                          <div className="text-[9px] font-bold text-[#334155]">
                            Referensi Spasial
                          </div>

                          <div className="text-[8px] text-[#94A3B8]">
                            WGS84 / EPSG:4326{" "}
                            {coordinateSource && (
                              <>• Source: {coordinateSource}</>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={useGps}
                        disabled={gpsLoading}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#D9E1EA] bg-white px-3 text-[9px] font-bold text-[#475569] shadow-sm transition hover:bg-[#F8FAFC] disabled:opacity-50"
                      >
                        <Crosshair size={13} />
                        {gpsLoading
                          ? "Mencari lokasi..."
                          : "Gunakan GPS Perangkat"}
                      </button>
                    </div>

                    {gpsError && (
                      <div className="mt-3 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-[9px] text-red-600">
                        <AlertCircle size={13} />
                        {gpsError}
                      </div>
                    )}
                  </div>
                </div>

                <SectionInfo
                  icon={Database}
                  title="Spatial Data Governance"
                  text="Koordinat disimpan sebagai point geometry berbasis WGS84. Validasi PostGIS dan point-in-polygon dapat dilanjutkan pada backend."
                />
              </WorkspaceSection>
            )}

            {/* STEP 03 */}
            {activeStep === "administration" && (
              <WorkspaceSection
                number="03"
                title="Administrasi & DAS"
                description="Pilih wilayah secara hirarkis: Provinsi → Kabupaten/Kota → Kecamatan → Desa/Kelurahan."
                icon={Layers3}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Provinsi" required>
                    <Select
                      value={form.provinsi}
                      onChange={setProvince}
                      placeholder={
                        loadingMaster.provinces
                          ? "Memuat provinsi..."
                          : "Pilih provinsi"
                      }
                      options={master.provinces.map((x) => x.name)}
                      disabled={loadingMaster.provinces}
                    />
                  </Field>

                  <Field label="Kabupaten / Kota" required>
                    <Select
                      value={form.kabupaten_kota}
                      onChange={setDistrict}
                      placeholder={
                        !form.provinsi
                          ? "Pilih provinsi dulu"
                          : loadingMaster.districts
                            ? "Memuat kabupaten..."
                            : "Pilih kabupaten / kota"
                      }
                      options={master.districts.map((x) => x.name)}
                      disabled={!form.provinsi || loadingMaster.districts}
                    />
                  </Field>

                  <Field label="Kecamatan" required>
                    <Select
                      value={form.kecamatan}
                      onChange={setSubdistrict}
                      placeholder={
                        !form.kabupaten_kota
                          ? "Pilih kabupaten dulu"
                          : loadingMaster.subdistricts
                            ? "Memuat kecamatan..."
                            : "Pilih kecamatan"
                      }
                      options={master.subdistricts.map((x) => x.name)}
                      disabled={
                        !form.kabupaten_kota || loadingMaster.subdistricts
                      }
                    />
                  </Field>

                  <Field label="Desa / Kelurahan" required>
                    <Select
                      value={form.desa_kelurahan}
                      onChange={(v) => update("desa_kelurahan", v)}
                      placeholder={
                        !form.kecamatan
                          ? "Pilih kecamatan dulu"
                          : loadingMaster.villages
                            ? "Memuat desa..."
                            : "Pilih desa / kelurahan"
                      }
                      options={master.villages.map((x) => x.name)}
                      disabled={!form.kecamatan || loadingMaster.villages}
                    />
                  </Field>

                  <Field
                    label="Daerah Aliran Sungai (DAS)"
                    required
                    description="Ketik minimal 2 karakter; server hanya mengirim maksimal 20 hasil."
                  >
                    <div className="relative">
                      <input
                        value={dasSearch}
                        onChange={(e) => {
                          setDasSearch(e.target.value);

                          if (!e.target.value.trim()) {
                            setSelectedDasCode("");
                            update("das", "");
                          }
                        }}
                        placeholder="Cari nama DAS / kode DAS..."
                        className="h-10 w-full rounded-xl border border-[#D9E1EA] bg-[#F8FAFC] px-3 pr-10 text-[10px] text-[#1E293B] outline-none placeholder:text-[#94A3B8] focus:border-blue-400/60 focus:bg-white"
                      />

                      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8]">
                        {loadingMaster.das ? "…" : "⌄"}
                      </div>

                      {dasSearch.trim().length >= 2 &&
                        (loadingMaster.das || master.das.length > 0) && (
                          <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[1200] max-h-72 overflow-auto rounded-xl border border-[#D9E1EA] bg-white shadow-xl">
                            {loadingMaster.das && (
                              <div className="px-3 py-3 text-[9px] text-[#64748B]">
                                Mencari DAS...
                              </div>
                            )}

                            {!loadingMaster.das &&
                              master.das.map((item) => (
                                <button
                                  key={`${item.code}-${item.name}`}
                                  type="button"
                                  onClick={() => selectDas(item)}
                                  className="block w-full border-b border-[#E2E8F0] px-3 py-2.5 text-left transition hover:bg-blue-50"
                                >
                                  <div className="text-[9px] font-bold text-[#334155]">
                                    {item.name}
                                  </div>

                                  <div className="mt-0.5 text-[7px] text-[#94A3B8]">
                                    {item.code || "Tanpa kode"}

                                    {item.province ? ` • ${item.province}` : ""}

                                    {item.district ? ` • ${item.district}` : ""}
                                  </div>
                                </button>
                              ))}

                            {!loadingMaster.das && master.das.length === 0 && (
                              <div className="px-3 py-3 text-[9px] text-[#64748B]">
                                DAS tidak ditemukan.
                              </div>
                            )}
                          </div>
                        )}
                    </div>

                    {form.das && (
                      <div className="mt-1.5 text-[8px] text-blue-600">
                        Terpilih: {form.das}
                        {selectedDasCode ? ` • ${selectedDasCode}` : ""}
                      </div>
                    )}
                  </Field>

                  <Field label="Ringkasan Lokasi">
                    <div className="flex min-h-10 items-center rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-[9px] text-[#64748B]">
                      <Navigation size={12} className="mr-2 text-blue-600" />

                      {[
                        form.desa_kelurahan,
                        form.kecamatan,
                        form.kabupaten_kota,
                        form.provinsi,
                      ]
                        .filter(Boolean)
                        .join(", ") || "Belum ditentukan"}
                    </div>
                  </Field>
                </div>

                <SectionInfo
                  icon={Target}
                  title="Administrative Hierarchy"
                  text="Kabupaten/Kota hanya dimuat dari kode_prov yang dipilih. Kecamatan hanya dimuat dari kode_kk terpilih, dan Desa/Kelurahan hanya dimuat dari kode_kec terpilih."
                />
              </WorkspaceSection>
            )}

            {/* STEP 04 */}
            {activeStep === "documentation" && (
              <WorkspaceSection
                number="04"
                title="Dokumentasi Kegiatan"
                description="Kelola bukti visual dan dokumen pendukung secara terstruktur."
                icon={FileImage}
              >
                <div className="grid gap-4 xl:grid-cols-2">
                  {(
                    [
                      "before",
                      "progress",
                      "after",
                      "supporting_document",
                    ] as DocumentationCategory[]
                  ).map((c) => (
                    <DocumentationUploader
                      key={c}
                      category={c}
                      title={
                        c === "before"
                          ? "Foto Sebelum"
                          : c === "progress"
                            ? "Foto Pelaksanaan"
                            : c === "after"
                              ? "Foto Setelah"
                              : "Dokumen Pendukung"
                      }
                      description={
                        c === "before"
                          ? "Kondisi awal sebelum kegiatan"
                          : c === "progress"
                            ? "Dokumentasi proses pelaksanaan"
                            : c === "after"
                              ? "Kondisi setelah kegiatan selesai"
                              : "Laporan, BA, peta, atau dokumen teknis"
                      }
                      files={files}
                      count={
                        docs[c === "supporting_document" ? "supporting" : c]
                      }
                      inputRef={fileInputRefs[c]}
                      dragging={draggingCategory === c}
                      onInput={(e, cat) => addFiles(e.target.files || [], cat)}
                      onDragOver={(e, cat) => {
                        e.preventDefault();
                        setDraggingCategory(cat);
                      }}
                      onDragLeave={() => setDraggingCategory(null)}
                      onDrop={(e, cat) => {
                        e.preventDefault();
                        setDraggingCategory(null);
                        addFiles(e.dataTransfer.files, cat);
                      }}
                      onRemove={removeFile}
                    />
                  ))}
                </div>
              </WorkspaceSection>
            )}

            {/* STEP 05 */}
            {activeStep === "review" && (
              <WorkspaceSection
                number="05"
                title="Review & Validasi"
                description="Periksa seluruh metadata sebelum data disimpan atau diajukan."
                icon={ShieldCheck}
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  <ReviewCard
                    title="Informasi Kegiatan"
                    icon={ClipboardCheck}
                    complete={stepCompletion.activity}
                  >
                    <ReviewRow
                      label="Nama"
                      value={form.nama_kegiatan || "Belum diisi"}
                    />

                    <ReviewRow
                      label="Jenis"
                      value={form.jenis_kegiatan || "Belum dipilih"}
                    />

                    <ReviewRow
                      label="Tahun"
                      value={form.tahun_pelaksanaan || "Belum dipilih"}
                    />

                    <ReviewRow
                      label="Pendanaan"
                      value={form.sumber_pendanaan || "Belum diisi"}
                    />

                    <ReviewRow
                      label="Pelaksana"
                      value={form.instansi_pelaksana || "Belum diisi"}
                    />
                  </ReviewCard>

                  <ReviewCard
                    title="Lokasi Spasial"
                    icon={MapPinned}
                    complete={stepCompletion.spatial}
                  >
                    <ReviewRow
                      label="Latitude"
                      value={form.latitude || "Belum diisi"}
                    />

                    <ReviewRow
                      label="Longitude"
                      value={form.longitude || "Belum diisi"}
                    />

                    <ReviewRow
                      label="Source"
                      value={coordinateSource || "Belum ditentukan"}
                    />

                    <ReviewRow label="Reference" value="WGS84 / EPSG:4326" />

                    <ReviewRow
                      label="Validasi"
                      value={
                        coordinateValidated
                          ? "Terverifikasi"
                          : "Belum divalidasi"
                      }
                    />
                  </ReviewCard>

                  <ReviewCard
                    title="Administrasi & DAS"
                    icon={Layers3}
                    complete={stepCompletion.administration}
                  >
                    <ReviewRow
                      label="Provinsi"
                      value={form.provinsi || "Belum dipilih"}
                    />

                    <ReviewRow
                      label="Kab/Kota"
                      value={form.kabupaten_kota || "Belum dipilih"}
                    />

                    <ReviewRow
                      label="Kecamatan"
                      value={form.kecamatan || "Belum dipilih"}
                    />

                    <ReviewRow
                      label="Desa/Kel."
                      value={form.desa_kelurahan || "Belum dipilih"}
                    />

                    <ReviewRow
                      label="DAS"
                      value={form.das || "Belum dipilih"}
                    />
                  </ReviewCard>

                  <ReviewCard
                    title="Dokumentasi"
                    icon={FileImage}
                    complete={stepCompletion.documentation}
                  >
                    <ReviewRow label="Before" value={`${docs.before} file`} />

                    <ReviewRow
                      label="Progress"
                      value={`${docs.progress} file`}
                    />

                    <ReviewRow label="After" value={`${docs.after} file`} />

                    <ReviewRow
                      label="Supporting"
                      value={`${docs.supporting} file`}
                    />

                    <ReviewRow label="Total" value={`${docs.total} file`} />
                  </ReviewCard>
                </div>

                <div
                  className={`mt-5 rounded-2xl border p-4 ${
                    errors.length
                      ? "border-amber-200 bg-amber-50"
                      : "border-blue-200 bg-blue-50"
                  }`}
                >
                  <div className="flex gap-3">
                    <div
                      className={
                        errors.length ? "text-amber-600" : "text-blue-600"
                      }
                    >
                      {errors.length ? (
                        <AlertCircle size={18} />
                      ) : (
                        <CheckCircle2 size={18} />
                      )}
                    </div>

                    <div>
                      <div className="text-[10px] font-bold text-[#334155]">
                        {errors.length
                          ? "Masih ada data yang perlu diperiksa"
                          : "Data siap diajukan"}
                      </div>

                      {errors.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {errors.map((x) => (
                            <div key={x} className="text-[8px] text-amber-700">
                              • {x}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </WorkspaceSection>
            )}

            {/* STEP NAVIGATION */}
            <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                disabled={idx <= 0}
                onClick={() => go(STEPS[idx - 1].id)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#D9E1EA] bg-white px-4 text-[10px] font-bold text-[#475569] transition hover:bg-[#F8FAFC] disabled:opacity-30"
              >
                <ArrowLeft size={14} />
                Sebelumnya
              </button>

              <div className="flex justify-center gap-1">
                {STEPS.map((s) => (
                  <button
                    key={s.id}
                    title={s.title}
                    type="button"
                    onClick={() => go(s.id)}
                    className={`h-1.5 rounded-full transition ${
                      activeStep === s.id
                        ? "w-8 bg-blue-600"
                        : "w-5 bg-[#E2E8F0]"
                    }`}
                  />
                ))}
              </div>

              <button
                type="button"
                disabled={idx >= 4}
                onClick={() => go(STEPS[idx + 1].id)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-[10px] font-extrabold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-30"
              >
                Lanjut
                <ChevronDown size={14} className="-rotate-90" />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* ACTION BAR */}
      <div className="sticky bottom-0 z-[1100] border-t border-[#E2E8F0] bg-white/95 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setShowCancelConfirm(true)}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#D9E1EA] bg-white px-3 text-[9px] font-bold text-[#64748B] transition hover:bg-[#F8FAFC]"
          >
            <X size={13} />
            Batal
          </button>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => save(false)}
              disabled={!!savingAction}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#D9E1EA] bg-white px-4 text-[10px] font-bold text-[#475569] shadow-sm transition hover:bg-[#F8FAFC] disabled:opacity-50"
            >
              <Save size={14} />

              {savingAction === "draft" ? "Menyimpan..." : "Simpan Draft"}
            </button>

            <button
              type="button"
              onClick={() => save(true)}
              disabled={!!savingAction}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-[10px] font-extrabold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
            >
              <CloudUpload size={14} />

              {savingAction === "submit"
                ? "Menyimpan..."
                : "Simpan & Ajukan Verifikasi"}
            </button>
          </div>
        </div>
      </div>

      {/* CANCEL CONFIRMATION */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xl">
            <div className="flex gap-3">
              <AlertCircle className="text-amber-500" />

              <div>
                <div className="text-[12px] font-extrabold text-[#1E293B]">
                  Batalkan registrasi?
                </div>

                <div className="mt-1 text-[9px] text-[#64748B]">
                  Perubahan yang belum disimpan akan hilang.
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCancelConfirm(false)}
                className="h-9 rounded-lg border border-[#D9E1EA] bg-white px-3 text-[9px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]"
              >
                Tetap di halaman
              </button>

              <button
                type="button"
                onClick={() => navigate("/lokasi")}
                className="h-9 rounded-lg bg-red-600 px-3 text-[9px] font-bold text-white transition hover:bg-red-700"
              >
                Ya, Batalkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkspaceSection({
  number,
  title,
  description,
  icon: Icon,
  children,
}: {
  number: string;
  title: string;
  description: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
      <div className="border-b border-[#E2E8F0] p-4 sm:p-5">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600">
            <Icon size={17} />
          </div>

          <div>
            <div className="flex gap-2">
              <span className="text-[8px] font-extrabold text-blue-600">
                {number}
              </span>

              <h2 className="text-[13px] font-extrabold text-[#1E293B]">
                {title}
              </h2>
            </div>

            <p className="mt-1 text-[9px] text-[#64748B]">{description}</p>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  description,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[#64748B]">
        {label}

        {required && <b className="text-blue-600">*</b>}

        {description && (
          <small className="text-[#94A3B8]">• {description}</small>
        )}
      </span>

      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  min,
  step,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  min?: string;
  step?: string;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      min={min}
      step={step}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`h-10 w-full rounded-xl border border-[#D9E1EA] bg-[#F8FAFC] px-3 text-[10px] text-[#1E293B] outline-none placeholder:text-[#94A3B8] transition focus:border-blue-400/60 focus:bg-white ${className}`}
    />
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder = "Pilih...",
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full appearance-none rounded-xl border border-[#D9E1EA] bg-[#F8FAFC] px-3 pr-9 text-[10px] font-semibold text-[#475569] outline-none transition focus:border-blue-400/60 focus:bg-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="">{placeholder}</option>

        {options.filter(Boolean).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>

      <ChevronDown
        size={13}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"
      />
    </div>
  );
}

function YearSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const y = new Date().getFullYear();

  return (
    <Select
      value={value}
      onChange={onChange}
      placeholder="Pilih tahun"
      options={Array.from({ length: 16 }, (_, i) => String(y + 1 - i))}
    />
  );
}

function SectionInfo({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ElementType;
  title: string;
  text: string;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
      <div className="flex gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#64748B]">
          <Icon size={14} />
        </div>

        <div>
          <div className="text-[9px] font-bold text-[#334155]">{title}</div>

          <div className="mt-1 text-[8px] leading-relaxed text-[#64748B]">
            {text}
          </div>
        </div>
      </div>
    </div>
  );
}

function DocumentationUploader({
  title,
  description,
  category,
  files,
  count,
  inputRef,
  dragging,
  onInput,
  onDragOver,
  onDragLeave,
  onDrop,
  onRemove,
}: {
  title: string;
  description: string;
  category: DocumentationCategory;
  files: DocumentationFile[];
  count: number;
  inputRef: React.RefObject<HTMLInputElement | null>;
  dragging: boolean;
  onInput: (e: ChangeEvent<HTMLInputElement>, c: DocumentationCategory) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>, c: DocumentationCategory) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>, c: DocumentationCategory) => void;
  onRemove: (id: string) => void;
}) {
  const fs = files.filter((x) => x.category === category);

  const Icon = catIcon(category);

  const accept =
    category === "supporting_document"
      ? ".pdf,application/pdf"
      : ".jpg,.jpeg,image/jpeg";

  return (
    <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC]">
      <div className="flex justify-between border-b border-[#E2E8F0] bg-white p-4">
        <div className="flex gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]">
            <Icon size={16} />
          </div>

          <div>
            <div className="text-[10px] font-bold text-[#334155]">{title}</div>

            <div className="mt-1 text-[8px] text-[#94A3B8]">{description}</div>
          </div>
        </div>

        <span className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-1 text-[8px] text-[#64748B]">
          {count}
        </span>
      </div>

      <div className="p-4">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={(e) => onInput(e, category)}
        />

        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => onDragOver(e, category)}
          onDragLeave={onDragLeave}
          onDrop={(e) => onDrop(e, category)}
          className={`cursor-pointer rounded-xl border border-dashed p-5 text-center transition ${
            dragging
              ? "border-blue-400 bg-blue-50"
              : "border-[#CBD5E1] bg-white hover:border-blue-300 hover:bg-blue-50/40"
          }`}
        >
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]">
            <Upload size={16} />
          </div>

          <div className="mt-2 text-[9px] font-bold text-[#475569]">
            Upload atau drag & drop
          </div>

          <div className="mt-1 text-[8px] text-[#94A3B8]">
            {category === "supporting_document"
              ? "Format PDF"
              : "Format JPG / JPEG"}
          </div>
        </div>

        {fs.length > 0 && (
          <div className="mt-3 space-y-2">
            {fs.map((x) => (
              <div
                key={x.id}
                className="flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white p-2"
              >
                {x.previewUrl ? (
                  <img
                    src={x.previewUrl}
                    alt={x.file.name}
                    className="h-10 w-10 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F8FAFC] text-[#64748B]">
                    <Icon size={15} />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="truncate text-[9px] font-bold text-[#334155]">
                    {x.file.name}
                  </div>

                  <div className="text-[7px] text-[#94A3B8]">
                    {catLabel(x.category)} • {formatBytes(x.file.size)}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onRemove(x.id)}
                  className="h-7 w-7 text-[#94A3B8] transition hover:text-red-500"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewCard({
  title,
  icon: Icon,
  complete,
  children,
}: {
  title: string;
  icon: React.ElementType;
  complete: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white">
      <div className="flex items-center justify-between border-b border-[#E2E8F0] p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]">
            <Icon size={14} />
          </div>

          <span className="text-[10px] font-bold text-[#334155]">{title}</span>
        </div>

        <span
          className={`rounded-md px-2 py-1 text-[7px] font-extrabold ${
            complete ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"
          }`}
        >
          {complete ? "COMPLETE" : "REVIEW"}
        </span>
      </div>

      <div className="p-1">{children}</div>
    </div>
  );
}

function ReviewRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-[#E2E8F0] px-3 py-2.5 last:border-0">
      <span className="text-[8px] font-bold uppercase text-[#94A3B8]">
        {label}
      </span>

      <span className="max-w-[65%] text-right text-[9px] font-semibold text-[#475569]">
        {value}
      </span>
    </div>
  );
}

function Notification({
  type,
  message,
  onClose,
}: {
  type: "success" | "error" | "info";
  message: string;
  onClose: () => void;
}) {
  const Icon =
    type === "success" ? CheckCircle2 : type === "error" ? AlertCircle : Info;

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${
        type === "success"
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : type === "error"
            ? "border-red-200 bg-red-50 text-red-600"
            : "border-sky-200 bg-sky-50 text-sky-700"
      }`}
    >
      <Icon size={14} />

      <div className="flex-1 text-[9px] font-semibold">{message}</div>

      <button type="button" onClick={onClose}>
        <X size={13} />
      </button>
    </div>
  );
}
