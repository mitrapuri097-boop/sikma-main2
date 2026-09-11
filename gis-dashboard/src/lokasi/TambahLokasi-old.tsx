import React, {
  ChangeEvent,
  DragEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { NavLink, useNavigate } from "react-router-dom";

import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  ClipboardCheck,
  CloudUpload,
  Crosshair,
  Database,
  FileCheck2,
  FileImage,
  FileText,
  Info,
  Layers3,
  Map,
  MapPinned,
  Navigation,
  PencilLine,
  Plus,
  Save,
  ShieldCheck,
  Target,
  Trees,
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
import L from "leaflet";

import "leaflet/dist/leaflet.css";

/* ============================================================
   CONFIG
============================================================ */

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:3001"
).replace(/\/+$/, "");

/*
 * Endpoint belum digunakan untuk submit.
 * Disiapkan agar integrasi server.js nanti tidak perlu
 * mengubah struktur workspace.
 */
const API_ENDPOINTS = {
  locations: `${API_URL}/api/lokasi`,
  filters: `${API_URL}/api/lokasi/filters`,
};

/* ============================================================
   TYPES
============================================================ */

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

interface MasterOptions {
  activityTypes: string[];
  provinces: string[];
  districts: string[];
  subdistricts: string[];
  villages: string[];
  das: string[];
}

/* ============================================================
   MASTER UI
   ============================================================ */

/*
 * Klasifikasi ini mengikuti requirement workspace.
 * Struktur dibuat terpisah supaya nanti sumbernya bisa
 * diganti ke master API dari server.js tanpa mengubah UI.
 */
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

const EMPTY_MASTER_OPTIONS: MasterOptions = {
  activityTypes: [],
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

/* ============================================================
   HELPERS
============================================================ */

function isValidLatitude(value: string) {
  if (!value.trim()) return false;

  const number = Number(value);

  return Number.isFinite(number) && number >= -90 && number <= 90;
}

function isValidLongitude(value: string) {
  if (!value.trim()) return false;

  const number = Number(value);

  return Number.isFinite(number) && number >= -180 && number <= 180;
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));

  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${
    units[index] || "GB"
  }`;
}

function getCategoryLabel(category: DocumentationCategory) {
  switch (category) {
    case "before":
      return "Sebelum";

    case "progress":
      return "Pelaksanaan";

    case "after":
      return "Setelah";

    case "supporting_document":
      return "Dokumen Pendukung";

    default:
      return category;
  }
}

function getCategoryIcon(category: DocumentationCategory) {
  return category === "supporting_document" ? FileText : FileImage;
}

function createDocumentationFile(
  file: File,
  category: DocumentationCategory,
): DocumentationFile {
  const isImage = file.type.startsWith("image/");

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    file,
    category,
    previewUrl: isImage ? URL.createObjectURL(file) : null,
  };
}

/* ============================================================
   MAP HELPERS
============================================================ */

const DEFAULT_MAP_CENTER: [number, number] = [-2.5489, 118.0149];

function MapClickHandler({
  onCoordinateChange,
}: {
  onCoordinateChange: (latitude: number, longitude: number) => void;
}) {
  useMapEvents({
    click(event) {
      onCoordinateChange(
        Number(event.latlng.lat.toFixed(7)),
        Number(event.latlng.lng.toFixed(7)),
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

  React.useEffect(() => {
    if (
      latitude === null ||
      longitude === null ||
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

/* ============================================================
   MAIN PAGE
============================================================ */

export default function TambahLokasi() {
  const navigate = useNavigate();

  const [form, setForm] = useState<ActivityForm>(INITIAL_FORM);

  const [masterOptions] = useState<MasterOptions>({
    ...EMPTY_MASTER_OPTIONS,
    activityTypes: ACTIVITY_TYPES,
  });

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

  /* ==========================================================
     FORM STATE
  ========================================================== */

  const updateField = <K extends keyof ActivityForm>(
    field: K,
    value: ActivityForm[K],
  ) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));

    if (field === "latitude" || field === "longitude") {
      setCoordinateSource("MANUAL");
      setCoordinateValidated(false);
    }

    setNotification(null);
  };

  /* ==========================================================
     COORDINATE
  ========================================================== */

  const numericLatitude = form.latitude.trim() ? Number(form.latitude) : null;

  const numericLongitude = form.longitude.trim()
    ? Number(form.longitude)
    : null;

  const hasCoordinates =
    numericLatitude !== null &&
    numericLongitude !== null &&
    Number.isFinite(numericLatitude) &&
    Number.isFinite(numericLongitude);

  const validCoordinates =
    hasCoordinates &&
    isValidLatitude(form.latitude) &&
    isValidLongitude(form.longitude);

  const handleMapCoordinateChange = (latitude: number, longitude: number) => {
    setForm((previous) => ({
      ...previous,
      latitude: latitude.toFixed(7),
      longitude: longitude.toFixed(7),
    }));

    setCoordinateSource("MAP");
    setCoordinateValidated(false);
    setNotification(null);
  };

  const handleUseGps = () => {
    setGpsError("");

    if (!navigator.geolocation) {
      setGpsError("Browser tidak mendukung geolocation perangkat.");
      return;
    }

    setGpsLoading(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude.toFixed(7));
        const longitude = Number(position.coords.longitude.toFixed(7));

        setForm((previous) => ({
          ...previous,
          latitude: String(latitude),
          longitude: String(longitude),
        }));

        setCoordinateSource("GPS");
        setCoordinateValidated(false);
        setGpsLoading(false);
      },
      (error) => {
        let message = "Lokasi perangkat tidak dapat diperoleh.";

        if (error.code === error.PERMISSION_DENIED) {
          message =
            "Akses lokasi ditolak. Izinkan browser menggunakan lokasi perangkat.";
        }

        if (error.code === error.POSITION_UNAVAILABLE) {
          message = "Informasi lokasi perangkat tidak tersedia.";
        }

        if (error.code === error.TIMEOUT) {
          message = "Permintaan lokasi perangkat mengalami timeout.";
        }

        setGpsError(message);
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
      setCoordinateValidated(false);

      setNotification({
        type: "error",
        message:
          "Koordinat belum valid. Latitude harus -90 sampai 90 dan longitude -180 sampai 180.",
      });

      return;
    }

    setCoordinateValidated(true);

    setNotification({
      type: "success",
      message: "Koordinat valid sebagai WGS84 / EPSG:4326.",
    });
  };

  /* ==========================================================
     DOCUMENTATION
  ========================================================== */

  const documentationSummary = useMemo(() => {
    return {
      before: files.filter((item) => item.category === "before").length,
      progress: files.filter((item) => item.category === "progress").length,
      after: files.filter((item) => item.category === "after").length,
      supporting: files.filter(
        (item) => item.category === "supporting_document",
      ).length,
      total: files.length,
    };
  }, [files]);

  const addFiles = (
    selectedFiles: FileList | File[],
    category: DocumentationCategory,
  ) => {
    const incoming = Array.from(selectedFiles);

    const validFiles = incoming.filter((file) => {
      const extension = file.name.split(".").pop()?.toLowerCase();

      if (category === "supporting_document") {
        return extension === "pdf" || file.type === "application/pdf";
      }

      return (
        extension === "jpg" ||
        extension === "jpeg" ||
        file.type === "image/jpeg"
      );
    });

    const invalidCount = incoming.length - validFiles.length;

    if (invalidCount > 0) {
      setNotification({
        type: "error",
        message:
          category === "supporting_document"
            ? "Dokumen pendukung hanya menerima file PDF."
            : "Foto kegiatan hanya menerima JPG/JPEG.",
      });
    }

    if (!validFiles.length) return;

    const created = validFiles.map((file) =>
      createDocumentationFile(file, category),
    );

    setFiles((previous) => [...previous, ...created]);
  };

  const handleFileInput = (
    event: ChangeEvent<HTMLInputElement>,
    category: DocumentationCategory,
  ) => {
    if (!event.target.files) return;

    addFiles(event.target.files, category);

    event.target.value = "";
  };

  const handleDragOver = (
    event: DragEvent<HTMLDivElement>,
    category: DocumentationCategory,
  ) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDraggingCategory(category);
  };

  const handleDragLeave = () => {
    setDraggingCategory(null);
  };

  const handleDrop = (
    event: DragEvent<HTMLDivElement>,
    category: DocumentationCategory,
  ) => {
    event.preventDefault();

    setDraggingCategory(null);

    if (event.dataTransfer.files.length) {
      addFiles(event.dataTransfer.files, category);
    }
  };

  const removeFile = (id: string) => {
    setFiles((previous) => {
      const target = previous.find((item) => item.id === id);

      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }

      return previous.filter((item) => item.id !== id);
    });
  };

  /* ==========================================================
     COMPLETION
  ========================================================== */

  const completion = useMemo(() => {
    const checks = [
      Boolean(form.nama_kegiatan.trim()),
      Boolean(form.jenis_kegiatan),
      Boolean(form.tahun_pelaksanaan),
      Boolean(form.sumber_pendanaan.trim()),
      Boolean(form.instansi_pelaksana.trim()),
      validCoordinates,
      Boolean(form.provinsi),
      Boolean(form.kabupaten_kota),
      Boolean(form.kecamatan),
      Boolean(form.desa_kelurahan),
      Boolean(form.das),
      Boolean(form.luas_area),
      Boolean(form.status_pelaksanaan),
      documentationSummary.total > 0,
    ];

    const completed = checks.filter(Boolean).length;

    return Math.round((completed / checks.length) * 100);
  }, [documentationSummary.total, form, validCoordinates]);

  const stepCompletion = useMemo(() => {
    return {
      activity:
        Boolean(form.nama_kegiatan.trim()) &&
        Boolean(form.jenis_kegiatan) &&
        Boolean(form.tahun_pelaksanaan) &&
        Boolean(form.sumber_pendanaan.trim()) &&
        Boolean(form.instansi_pelaksana.trim()),

      spatial: validCoordinates,

      administration:
        Boolean(form.provinsi) &&
        Boolean(form.kabupaten_kota) &&
        Boolean(form.kecamatan) &&
        Boolean(form.desa_kelurahan) &&
        Boolean(form.das),

      documentation: documentationSummary.total > 0,

      review: completion === 100,
    };
  }, [completion, documentationSummary.total, form, validCoordinates]);

  /* ==========================================================
     VALIDATION
  ========================================================== */

  const validationErrors = useMemo(() => {
    const errors: string[] = [];

    if (!form.nama_kegiatan.trim()) {
      errors.push("Nama kegiatan belum diisi.");
    }

    if (!form.jenis_kegiatan) {
      errors.push("Jenis kegiatan belum dipilih.");
    }

    if (!form.tahun_pelaksanaan) {
      errors.push("Tahun pelaksanaan belum dipilih.");
    }

    if (!form.sumber_pendanaan.trim()) {
      errors.push("Sumber pendanaan belum diisi.");
    }

    if (!form.instansi_pelaksana.trim()) {
      errors.push("Instansi pelaksana belum diisi.");
    }

    if (!validCoordinates) {
      errors.push("Koordinat lokasi belum valid.");
    }

    if (!form.provinsi) {
      errors.push("Provinsi belum dipilih.");
    }

    if (!form.kabupaten_kota) {
      errors.push("Kabupaten/Kota belum dipilih.");
    }

    if (!form.kecamatan) {
      errors.push("Kecamatan belum dipilih.");
    }

    if (!form.desa_kelurahan) {
      errors.push("Desa/Kelurahan belum dipilih.");
    }

    if (!form.das) {
      errors.push("DAS belum dipilih.");
    }

    if (!form.luas_area) {
      errors.push("Luas area belum diisi.");
    }

    return errors;
  }, [form, validCoordinates]);

  /* ==========================================================
     NAVIGATION
  ========================================================== */

  const currentStepIndex = STEPS.findIndex((step) => step.id === activeStep);

  const goToStep = (step: StepId) => {
    setActiveStep(step);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const goNext = () => {
    const next = STEPS[currentStepIndex + 1];

    if (next) {
      goToStep(next.id);
    }
  };

  const goPrevious = () => {
    const previous = STEPS[currentStepIndex - 1];

    if (previous) {
      goToStep(previous.id);
    }
  };

  /* ==========================================================
     SAVE
  ========================================================== */

  const buildDraftPayload = () => {
    return {
      ...form,

      /*
       * Payload ini belum dikirim.
       * Ketika server.js diberikan, struktur ini akan dipetakan
       * ke endpoint dan multipart/form-data backend.
       */
      dokumentasi: files.map((item) => ({
        category: item.category,
        filename: item.file.name,
        mime_type: item.file.type,
        size: item.file.size,
      })),

      coordinate_source: coordinateSource,
      coordinate_validated: coordinateValidated,
      spatial_reference: "EPSG:4326",
    };
  };

  const handleSaveDraft = async () => {
    setSavingAction("draft");
    setNotification(null);

    /*
     * Frontend-only sementara.
     * Tidak ada request POST sampai server.js tersedia.
     */
    const payload = buildDraftPayload();

    console.debug("Draft payload:", payload);

    await new Promise((resolve) => setTimeout(resolve, 350));

    setSavingAction(null);

    setNotification({
      type: "info",
      message:
        "Workspace siap disimpan sebagai Draft. Integrasi POST akan dilakukan setelah server.js tersedia.",
    });
  };

  const handleSubmit = async () => {
    if (validationErrors.length > 0) {
      setNotification({
        type: "error",
        message: `Data belum lengkap. Masih ada ${validationErrors.length} item yang perlu diperiksa.`,
      });

      goToStep(
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

    setSavingAction("submit");
    setNotification(null);

    const payload = {
      ...buildDraftPayload(),
      status_pelaksanaan: "Menunggu Verifikasi",
    };

    console.debug("Submission payload:", payload);

    await new Promise((resolve) => setTimeout(resolve, 500));

    setSavingAction(null);

    setNotification({
      type: "info",
      message:
        "Data sudah siap diajukan. Endpoint POST + upload akan dihubungkan setelah server.js diberikan.",
    });
  };

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <div className="min-h-screen bg-[#07101C] text-white">
      {/* ======================================================
          HEADER
      ====================================================== */}

      <header className="border-b border-slate-800/80 bg-[#0A1422]">
        <div className="mx-auto max-w-[1800px] px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">
                <NavLink
                  to="/lokasi"
                  className="text-slate-600 no-underline transition hover:text-emerald-300"
                >
                  Inventarisasi & Pemetaan
                </NavLink>

                <span>/</span>

                <span className="text-emerald-400">
                  Activity Registration Workspace
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">
                  Registrasi Lokasi Kegiatan
                </h1>

                <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[8px] font-extrabold uppercase tracking-wide text-slate-400">
                  <Circle size={6} fill="currentColor" />
                  Draft
                </span>
              </div>

              <p className="mt-1 max-w-3xl text-[10px] font-medium leading-relaxed text-slate-500">
                Workspace terintegrasi untuk registrasi atribut kegiatan,
                koordinat spasial, administrasi, dokumentasi, dan validasi data
                SIMITI.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <div className="text-[8px] font-bold uppercase tracking-[0.15em] text-slate-600">
                  Data Completion
                </div>

                <div className="mt-1 text-lg font-extrabold text-white">
                  {completion}%
                </div>
              </div>

              <div className="h-10 w-10 rounded-full border border-slate-800 bg-slate-950 p-1">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{
                    background: `conic-gradient(#10b981 ${completion * 3.6}deg, #172033 0deg)`,
                  }}
                >
                  <div className="flex h-full items-center justify-center rounded-full bg-[#0A1422] text-[8px] font-extrabold text-emerald-300">
                    {completion}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ======================================================
          NOTIFICATION
      ====================================================== */}

      {notification && (
        <div className="mx-auto max-w-[1800px] px-4 pt-4 sm:px-6 lg:px-8">
          <Notification
            type={notification.type}
            message={notification.message}
            onClose={() => setNotification(null)}
          />
        </div>
      )}

      {/* ======================================================
          WORKSPACE
      ====================================================== */}

      <main className="mx-auto max-w-[1800px] px-4 py-5 sm:px-6 lg:px-8">
        <div className="grid gap-5 xl:grid-cols-[250px_minmax(0,1fr)]">
          {/* ==================================================
              STEP RAIL
          ================================================== */}

          <aside className="h-fit xl:sticky xl:top-5">
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0B1524]">
              <div className="border-b border-slate-800 p-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-400/10 bg-emerald-500/10 text-emerald-300">
                    <PencilLine size={15} />
                  </div>

                  <div>
                    <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-300">
                      Registration Flow
                    </div>

                    <div className="mt-0.5 text-[8px] font-medium text-slate-600">
                      {STEPS.length} tahap registrasi
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-2">
                {STEPS.map((step, index) => {
                  const Icon = step.icon;
                  const active = activeStep === step.id;
                  const completed =
                    stepCompletion[step.id as keyof typeof stepCompletion];

                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => goToStep(step.id)}
                      className={`
                        relative
                        flex
                        w-full
                        items-start
                        gap-3
                        rounded-xl
                        p-3
                        text-left
                        transition
                        ${
                          active
                            ? "bg-emerald-500/10 text-white"
                            : "text-slate-500 hover:bg-slate-900/70 hover:text-slate-300"
                        }
                      `}
                    >
                      {index < STEPS.length - 1 && (
                        <span className="absolute left-[25px] top-[39px] h-8 w-px bg-slate-800" />
                      )}

                      <div
                        className={`
                          relative
                          z-10
                          flex
                          h-7
                          w-7
                          shrink-0
                          items-center
                          justify-center
                          rounded-lg
                          border
                          ${
                            completed
                              ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
                              : active
                                ? "border-emerald-400/30 bg-emerald-500 text-slate-950"
                                : "border-slate-800 bg-slate-950 text-slate-600"
                          }
                        `}
                      >
                        {completed ? (
                          <Check size={13} strokeWidth={3} />
                        ) : (
                          <Icon size={13} />
                        )}
                      </div>

                      <div className="min-w-0 pt-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[8px] font-extrabold tracking-[0.12em] text-slate-600">
                            {step.number}
                          </span>

                          <span
                            className={`text-[10px] font-bold ${
                              active ? "text-white" : "text-slate-400"
                            }`}
                          >
                            {step.title}
                          </span>
                        </div>

                        <div className="mt-1 text-[8px] leading-relaxed text-slate-600">
                          {step.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="border-t border-slate-800 p-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-slate-600">
                      Completion
                    </span>

                    <span className="text-[9px] font-extrabold text-emerald-300">
                      {completion}%
                    </span>
                  </div>

                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${completion}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* ==================================================
              CONTENT
          ================================================== */}

          <div className="min-w-0">
            {/* =================================================
                STEP 01
            ================================================= */}

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
                      onChange={(value) => updateField("nama_kegiatan", value)}
                      placeholder="Contoh: Rehabilitasi DAS dan Penguatan Infrastruktur Konservasi"
                    />
                  </Field>

                  <Field label="Jenis Kegiatan" required>
                    <Select
                      value={form.jenis_kegiatan}
                      onChange={(value) => updateField("jenis_kegiatan", value)}
                      placeholder="Pilih jenis kegiatan"
                      options={masterOptions.activityTypes}
                    />
                  </Field>

                  <Field label="Tahun Pelaksanaan" required>
                    <YearSelect
                      value={form.tahun_pelaksanaan}
                      onChange={(value) =>
                        updateField("tahun_pelaksanaan", value)
                      }
                    />
                  </Field>

                  <Field label="Sumber Pendanaan" required>
                    <Input
                      value={form.sumber_pendanaan}
                      onChange={(value) =>
                        updateField("sumber_pendanaan", value)
                      }
                      placeholder="Contoh: APBN / APBD / Hibah / DAK"
                    />
                  </Field>

                  <Field label="Instansi Pelaksana" required>
                    <Input
                      value={form.instansi_pelaksana}
                      onChange={(value) =>
                        updateField("instansi_pelaksana", value)
                      }
                      placeholder="Nama instansi / unit pelaksana"
                    />
                  </Field>

                  <Field label="Luas Area Kegiatan" required>
                    <div className="relative">
                      <Input
                        value={form.luas_area}
                        onChange={(value) => updateField("luas_area", value)}
                        placeholder="0.00"
                        type="number"
                        min="0"
                        step="0.01"
                        className="pr-12"
                      />

                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-600">
                        ha
                      </span>
                    </div>
                  </Field>

                  <Field label="Status Pelaksanaan" required>
                    <Select
                      value={form.status_pelaksanaan}
                      onChange={(value) =>
                        updateField("status_pelaksanaan", value)
                      }
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
                      onChange={(event) =>
                        updateField("keterangan", event.target.value)
                      }
                      rows={5}
                      placeholder="Tambahkan informasi teknis atau catatan lain yang relevan..."
                      className="
                        w-full
                        resize-y
                        rounded-xl
                        border
                        border-slate-800
                        bg-slate-950/70
                        px-3
                        py-3
                        text-[10px]
                        font-medium
                        leading-relaxed
                        text-white
                        outline-none
                        placeholder:text-slate-700
                        focus:border-emerald-500/40
                        focus:ring-2
                        focus:ring-emerald-500/10
                      "
                    />
                  </Field>
                </div>

                <SectionInfo
                  icon={Info}
                  title="Klasifikasi otomatis"
                  text={
                    form.jenis_kegiatan
                      ? `Kegiatan akan diregistrasikan pada kelompok "${form.jenis_kegiatan}". Filter pada registry lokasi nantinya menggunakan nilai jenis kegiatan ini.`
                      : "Pilih jenis kegiatan untuk menentukan klasifikasi registry spasial."
                  }
                />
              </WorkspaceSection>
            )}

            {/* =================================================
                STEP 02
            ================================================= */}

            {activeStep === "spatial" && (
              <WorkspaceSection
                number="02"
                title="Lokasi Spasial"
                description="Tentukan titik kegiatan melalui peta, koordinat manual, atau GPS perangkat."
                icon={MapPinned}
              >
                <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
                  <div className="relative h-[430px]">
                    <MapContainer
                      center={
                        hasCoordinates
                          ? [
                              numericLatitude as number,
                              numericLongitude as number,
                            ]
                          : DEFAULT_MAP_CENTER
                      }
                      zoom={hasCoordinates ? 15 : 5}
                      scrollWheelZoom
                      className="h-full w-full"
                    >
                      <TileLayer
                        attribution="&copy; OpenStreetMap contributors"
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />

                      <MapClickHandler
                        onCoordinateChange={handleMapCoordinateChange}
                      />

                      <MapController
                        latitude={numericLatitude}
                        longitude={numericLongitude}
                      />

                      {validCoordinates && (
                        <CircleMarker
                          center={[
                            numericLatitude as number,
                            numericLongitude as number,
                          ]}
                          radius={10}
                          pathOptions={{
                            color: "#10b981",
                            fillColor: "#10b981",
                            fillOpacity: 0.75,
                            weight: 3,
                          }}
                        />
                      )}
                    </MapContainer>

                    <div className="absolute left-3 top-3 z-[1000] rounded-xl border border-slate-700 bg-slate-950/90 px-3 py-2 shadow-xl backdrop-blur">
                      <div className="flex items-center gap-2">
                        <Map size={13} className="text-emerald-400" />

                        <span className="text-[9px] font-bold text-white">
                          Klik peta untuk menentukan titik
                        </span>
                      </div>
                    </div>

                    {validCoordinates && (
                      <div className="absolute bottom-3 left-3 z-[1000] rounded-xl border border-emerald-400/20 bg-slate-950/90 px-3 py-2 shadow-xl backdrop-blur">
                        <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-slate-600">
                          Selected Coordinate
                        </div>

                        <div className="mt-1 font-mono text-[10px] font-bold text-emerald-300">
                          {Number(form.latitude).toFixed(7)},{" "}
                          {Number(form.longitude).toFixed(7)}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-800 p-4">
                    <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
                      <Field label="Latitude" required>
                        <Input
                          value={form.latitude}
                          onChange={(value) => updateField("latitude", value)}
                          placeholder="-6.2088000"
                          type="number"
                          step="any"
                          className="font-mono"
                        />
                      </Field>

                      <Field label="Longitude" required>
                        <Input
                          value={form.longitude}
                          onChange={(value) => updateField("longitude", value)}
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
                          className="
                            inline-flex
                            h-10
                            w-full
                            items-center
                            justify-center
                            gap-2
                            rounded-xl
                            border
                            border-emerald-500/20
                            bg-emerald-500/10
                            px-4
                            text-[9px]
                            font-extrabold
                            text-emerald-300
                            transition
                            hover:bg-emerald-500/15
                            lg:w-auto
                          "
                        >
                          <CheckCircle2 size={14} />
                          Validasi
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-slate-800 bg-[#0B1524] p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-slate-500">
                          <Navigation size={13} />
                        </div>

                        <div>
                          <div className="text-[9px] font-bold text-slate-300">
                            Referensi Spasial
                          </div>

                          <div className="mt-0.5 text-[8px] text-slate-600">
                            WGS84 / EPSG:4326
                            {coordinateSource && (
                              <>
                                {" "}
                                • Source:{" "}
                                <span className="font-bold text-slate-500">
                                  {coordinateSource}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleUseGps}
                        disabled={gpsLoading}
                        className="
                          inline-flex
                          h-9
                          items-center
                          justify-center
                          gap-2
                          rounded-lg
                          border
                          border-slate-700
                          bg-slate-900
                          px-3
                          text-[9px]
                          font-bold
                          text-slate-300
                          transition
                          hover:border-emerald-500/30
                          hover:bg-emerald-500/10
                          hover:text-emerald-300
                          disabled:cursor-not-allowed
                          disabled:opacity-50
                        "
                      >
                        <Crosshair
                          size={13}
                          className={gpsLoading ? "animate-pulse" : ""}
                        />

                        {gpsLoading
                          ? "Mencari lokasi..."
                          : "Gunakan GPS Perangkat"}
                      </button>
                    </div>

                    {gpsError && (
                      <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-[9px] text-red-300">
                        <AlertCircle size={13} className="mt-0.5 shrink-0" />
                        {gpsError}
                      </div>
                    )}
                  </div>
                </div>

                <SectionInfo
                  icon={Database}
                  title="Spatial Data Governance"
                  text="Koordinat akan disimpan sebagai point geometry berbasis WGS84. Validasi PostGIS dan point-in-polygon akan diintegrasikan setelah backend tersedia."
                />
              </WorkspaceSection>
            )}

            {/* =================================================
                STEP 03
            ================================================= */}

            {activeStep === "administration" && (
              <WorkspaceSection
                number="03"
                title="Administrasi & DAS"
                description="Hubungkan lokasi kegiatan dengan wilayah administrasi dan daerah aliran sungai."
                icon={Layers3}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Provinsi" required>
                    <Select
                      value={form.provinsi}
                      onChange={(value) => updateField("provinsi", value)}
                      placeholder="Pilih provinsi"
                      options={masterOptions.provinces}
                      emptyMessage="Master provinsi akan dimuat dari backend."
                    />
                  </Field>

                  <Field label="Kabupaten / Kota" required>
                    <Select
                      value={form.kabupaten_kota}
                      onChange={(value) => updateField("kabupaten_kota", value)}
                      placeholder="Pilih kabupaten / kota"
                      options={masterOptions.districts}
                      emptyMessage="Master kabupaten/kota akan dimuat dari backend."
                    />
                  </Field>

                  <Field label="Kecamatan" required>
                    <Select
                      value={form.kecamatan}
                      onChange={(value) => updateField("kecamatan", value)}
                      placeholder="Pilih kecamatan"
                      options={masterOptions.subdistricts}
                      emptyMessage="Master kecamatan akan dimuat dari backend."
                    />
                  </Field>

                  <Field label="Desa / Kelurahan" required>
                    <Select
                      value={form.desa_kelurahan}
                      onChange={(value) => updateField("desa_kelurahan", value)}
                      placeholder="Pilih desa / kelurahan"
                      options={masterOptions.villages}
                      emptyMessage="Master desa/kelurahan akan dimuat dari backend."
                    />
                  </Field>

                  <Field label="Daerah Aliran Sungai (DAS)" required>
                    <Select
                      value={form.das}
                      onChange={(value) => updateField("das", value)}
                      placeholder="Pilih DAS"
                      options={masterOptions.das}
                      emptyMessage="Master DAS akan dimuat dari backend."
                    />
                  </Field>

                  <Field label="Ringkasan Lokasi">
                    <div className="flex h-10 items-center rounded-xl border border-slate-800 bg-slate-950/50 px-3 text-[9px] font-semibold text-slate-500">
                      <Navigation size={12} className="mr-2 text-emerald-400" />

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

                <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-400/10 bg-emerald-500/10 text-emerald-300">
                      <Target size={16} />
                    </div>

                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-slate-300">
                        Spatial Administration Linkage
                      </div>

                      <p className="mt-1 text-[9px] leading-relaxed text-slate-600">
                        Setelah server terhubung, koordinat dapat digunakan
                        untuk menentukan administrasi dan DAS secara otomatis
                        menggunakan PostGIS point-in-polygon.
                      </p>
                    </div>
                  </div>
                </div>
              </WorkspaceSection>
            )}

            {/* =================================================
                STEP 04
            ================================================= */}

            {activeStep === "documentation" && (
              <WorkspaceSection
                number="04"
                title="Dokumentasi Kegiatan"
                description="Kelola bukti visual dan dokumen pendukung secara terstruktur."
                icon={FileImage}
              >
                <div className="grid gap-4 xl:grid-cols-2">
                  <DocumentationUploader
                    title="Foto Sebelum"
                    description="Kondisi awal sebelum kegiatan"
                    category="before"
                    files={files}
                    count={documentationSummary.before}
                    inputRef={fileInputRefs.before}
                    dragging={draggingCategory === "before"}
                    onInput={handleFileInput}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onRemove={removeFile}
                  />

                  <DocumentationUploader
                    title="Foto Pelaksanaan"
                    description="Dokumentasi proses pelaksanaan"
                    category="progress"
                    files={files}
                    count={documentationSummary.progress}
                    inputRef={fileInputRefs.progress}
                    dragging={draggingCategory === "progress"}
                    onInput={handleFileInput}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onRemove={removeFile}
                  />

                  <DocumentationUploader
                    title="Foto Setelah"
                    description="Kondisi setelah kegiatan selesai"
                    category="after"
                    files={files}
                    count={documentationSummary.after}
                    inputRef={fileInputRefs.after}
                    dragging={draggingCategory === "after"}
                    onInput={handleFileInput}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onRemove={removeFile}
                  />

                  <DocumentationUploader
                    title="Dokumen Pendukung"
                    description="Laporan, BA, peta, atau dokumen teknis"
                    category="supporting_document"
                    files={files}
                    count={documentationSummary.supporting}
                    inputRef={fileInputRefs.supporting_document}
                    dragging={draggingCategory === "supporting_document"}
                    onInput={handleFileInput}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onRemove={removeFile}
                  />
                </div>

                <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-[10px] font-bold text-slate-300">
                        Documentation Registry
                      </div>

                      <div className="mt-1 text-[8px] text-slate-600">
                        Metadata file disiapkan untuk penyimpanan terstruktur.
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <DocumentationStat
                        label="Before"
                        value={documentationSummary.before}
                      />

                      <DocumentationStat
                        label="Progress"
                        value={documentationSummary.progress}
                      />

                      <DocumentationStat
                        label="After"
                        value={documentationSummary.after}
                      />

                      <DocumentationStat
                        label="Docs"
                        value={documentationSummary.supporting}
                      />
                    </div>
                  </div>
                </div>
              </WorkspaceSection>
            )}

            {/* =================================================
                STEP 05
            ================================================= */}

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
                    <ReviewRow
                      label="Before"
                      value={`${documentationSummary.before} file`}
                    />

                    <ReviewRow
                      label="Progress"
                      value={`${documentationSummary.progress} file`}
                    />

                    <ReviewRow
                      label="After"
                      value={`${documentationSummary.after} file`}
                    />

                    <ReviewRow
                      label="Supporting"
                      value={`${documentationSummary.supporting} file`}
                    />

                    <ReviewRow
                      label="Total"
                      value={`${documentationSummary.total} file`}
                    />
                  </ReviewCard>
                </div>

                <div
                  className={`
                    mt-5
                    rounded-2xl
                    border
                    p-4
                    ${
                      validationErrors.length === 0
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : "border-amber-500/20 bg-amber-500/5"
                    }
                  `}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`
                        flex
                        h-9
                        w-9
                        shrink-0
                        items-center
                        justify-center
                        rounded-xl
                        ${
                          validationErrors.length === 0
                            ? "bg-emerald-500/10 text-emerald-300"
                            : "bg-amber-500/10 text-amber-300"
                        }
                      `}
                    >
                      {validationErrors.length === 0 ? (
                        <CheckCircle2 size={17} />
                      ) : (
                        <AlertCircle size={17} />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-slate-200">
                        {validationErrors.length === 0
                          ? "Data siap diajukan"
                          : "Masih ada data yang perlu diperiksa"}
                      </div>

                      {validationErrors.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {validationErrors.map((error) => (
                            <div
                              key={error}
                              className="flex items-start gap-1.5 text-[8px] text-amber-300/70"
                            >
                              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                              {error}
                            </div>
                          ))}
                        </div>
                      )}

                      {validationErrors.length === 0 && (
                        <div className="mt-1 text-[8px] leading-relaxed text-emerald-300/60">
                          Seluruh field wajib sudah terisi dan koordinat telah
                          memenuhi validasi dasar frontend.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </WorkspaceSection>
            )}

            {/* =================================================
                STEP NAVIGATION
            ================================================= */}

            <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-slate-800 bg-[#0B1524] p-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={goPrevious}
                disabled={currentStepIndex <= 0}
                className="
                  inline-flex
                  h-10
                  items-center
                  justify-center
                  gap-2
                  rounded-xl
                  border
                  border-slate-700
                  bg-slate-900
                  px-4
                  text-[10px]
                  font-bold
                  text-slate-300
                  transition
                  hover:bg-slate-800
                  disabled:cursor-not-allowed
                  disabled:opacity-30
                "
              >
                <ArrowLeft size={14} />
                Sebelumnya
              </button>

              <div className="order-first flex items-center justify-center gap-1 sm:order-none">
                {STEPS.map((step) => (
                  <button
                    key={step.id}
                    type="button"
                    title={step.title}
                    onClick={() => goToStep(step.id)}
                    className={`
                      h-1.5
                      rounded-full
                      transition-all
                      ${
                        activeStep === step.id
                          ? "w-8 bg-emerald-400"
                          : stepCompletion[
                                step.id as keyof typeof stepCompletion
                              ]
                            ? "w-5 bg-emerald-500/50"
                            : "w-5 bg-slate-800"
                      }
                    `}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={goNext}
                disabled={currentStepIndex >= STEPS.length - 1}
                className="
                  inline-flex
                  h-10
                  items-center
                  justify-center
                  gap-2
                  rounded-xl
                  bg-emerald-500
                  px-4
                  text-[10px]
                  font-extrabold
                  text-slate-950
                  shadow-lg
                  shadow-emerald-950/20
                  transition
                  hover:bg-emerald-400
                  disabled:cursor-not-allowed
                  disabled:opacity-30
                "
              >
                Lanjut
                <ChevronDown size={14} className="-rotate-90" />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* ======================================================
          STICKY ACTION BAR
      ====================================================== */}

      <div className="sticky bottom-0 z-[1100] border-t border-slate-800 bg-[#08111E]/95 shadow-2xl shadow-black/30 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCancelConfirm(true)}
              className="
                inline-flex
                h-9
                items-center
                gap-2
                rounded-lg
                border
                border-slate-700
                bg-slate-900
                px-3
                text-[9px]
                font-bold
                text-slate-400
                transition
                hover:bg-slate-800
                hover:text-white
              "
            >
              <X size={13} />
              Batal
            </button>

            <div className="hidden h-5 w-px bg-slate-800 sm:block" />

            <div className="hidden items-center gap-2 text-[8px] text-slate-600 sm:flex">
              <ShieldCheck size={11} className="text-emerald-500/60" />
              Enterprise Data Workspace
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={savingAction !== null}
              className="
                inline-flex
                h-10
                items-center
                justify-center
                gap-2
                rounded-xl
                border
                border-slate-700
                bg-slate-900
                px-4
                text-[10px]
                font-bold
                text-slate-200
                transition
                hover:border-slate-600
                hover:bg-slate-800
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              <Save size={14} />

              {savingAction === "draft" ? "Menyimpan..." : "Simpan Draft"}
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={savingAction !== null}
              className="
                inline-flex
                h-10
                items-center
                justify-center
                gap-2
                rounded-xl
                bg-emerald-500
                px-5
                text-[10px]
                font-extrabold
                text-slate-950
                shadow-lg
                shadow-emerald-950/20
                transition
                hover:bg-emerald-400
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              <CloudUpload size={14} />

              {savingAction === "submit"
                ? "Mempersiapkan..."
                : "Simpan & Ajukan Verifikasi"}
            </button>
          </div>
        </div>
      </div>

      {/* ======================================================
          CANCEL CONFIRMATION
      ====================================================== */}

      {showCancelConfirm && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#0B1524] p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300">
                <AlertCircle size={18} />
              </div>

              <div>
                <div className="text-[12px] font-extrabold text-white">
                  Batalkan registrasi?
                </div>

                <div className="mt-1 text-[9px] leading-relaxed text-slate-500">
                  Perubahan yang belum disimpan akan hilang dari workspace ini.
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCancelConfirm(false)}
                className="
                  h-9
                  rounded-lg
                  border
                  border-slate-700
                  bg-slate-900
                  px-3
                  text-[9px]
                  font-bold
                  text-slate-300
                "
              >
                Tetap di halaman
              </button>

              <button
                type="button"
                onClick={() => navigate("/lokasi")}
                className="
                  h-9
                  rounded-lg
                  bg-red-500
                  px-3
                  text-[9px]
                  font-extrabold
                  text-white
                "
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

/* ============================================================
   WORKSPACE SECTION
============================================================ */

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
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0B1524] shadow-2xl shadow-black/10">
      <div className="border-b border-slate-800 bg-slate-950/20 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/10 bg-emerald-500/10 text-emerald-300">
            <Icon size={17} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[8px] font-extrabold tracking-[0.18em] text-emerald-400">
                {number}
              </span>

              <h2 className="text-[13px] font-extrabold text-white">{title}</h2>
            </div>

            <p className="mt-1 max-w-3xl text-[9px] leading-relaxed text-slate-500">
              {description}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

/* ============================================================
   FIELD
============================================================ */

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
      <span className="mb-1.5 flex items-center gap-1.5">
        <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500">
          {label}
        </span>

        {required && (
          <span className="text-[10px] font-bold text-emerald-400">*</span>
        )}

        {description && (
          <span className="text-[8px] font-medium text-slate-700">
            • {description}
          </span>
        )}
      </span>

      {children}
    </label>
  );
}

/* ============================================================
   INPUT
============================================================ */

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
  onChange: (value: string) => void;
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
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={`
        h-10
        w-full
        rounded-xl
        border
        border-slate-800
        bg-slate-950/70
        px-3
        text-[10px]
        font-medium
        text-white
        outline-none
        placeholder:text-slate-700
        focus:border-emerald-500/40
        focus:ring-2
        focus:ring-emerald-500/10
        ${className}
      `}
    />
  );
}

/* ============================================================
   SELECT
============================================================ */

function Select({
  value,
  onChange,
  options,
  placeholder = "Pilih...",
  emptyMessage,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  emptyMessage?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="
          h-10
          w-full
          appearance-none
          rounded-xl
          border
          border-slate-800
          bg-slate-950/70
          px-3
          pr-9
          text-[10px]
          font-semibold
          text-slate-300
          outline-none
          focus:border-emerald-500/40
          focus:ring-2
          focus:ring-emerald-500/10
        "
      >
        <option value="">{placeholder}</option>

        {options.filter(Boolean).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <ChevronDown
        size={13}
        className="
          pointer-events-none
          absolute
          right-3
          top-1/2
          -translate-y-1/2
          text-slate-600
        "
      />

      {!options.length && emptyMessage && (
        <div className="mt-1 text-[8px] text-slate-700">{emptyMessage}</div>
      )}
    </div>
  );
}

/* ============================================================
   YEAR SELECT
============================================================ */

function YearSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const currentYear = new Date().getFullYear();

  const years = Array.from({ length: 16 }, (_, index) =>
    String(currentYear + 1 - index),
  );

  return (
    <Select
      value={value}
      onChange={onChange}
      placeholder="Pilih tahun"
      options={years}
    />
  );
}

/* ============================================================
   SECTION INFO
============================================================ */

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
    <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-slate-500">
          <Icon size={14} />
        </div>

        <div>
          <div className="text-[9px] font-bold text-slate-300">{title}</div>

          <div className="mt-1 text-[8px] leading-relaxed text-slate-600">
            {text}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   DOCUMENTATION UPLOADER
============================================================ */

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
  inputRef: React.RefObject<HTMLInputElement>;
  dragging: boolean;
  onInput: (
    event: ChangeEvent<HTMLInputElement>,
    category: DocumentationCategory,
  ) => void;
  onDragOver: (
    event: DragEvent<HTMLDivElement>,
    category: DocumentationCategory,
  ) => void;
  onDragLeave: () => void;
  onDrop: (
    event: DragEvent<HTMLDivElement>,
    category: DocumentationCategory,
  ) => void;
  onRemove: (id: string) => void;
}) {
  const categoryFiles = files.filter((item) => item.category === category);

  const Icon = getCategoryIcon(category);

  const accept =
    category === "supporting_document"
      ? ".pdf,application/pdf"
      : ".jpg,.jpeg,image/jpeg";

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/30">
      <div className="flex items-start justify-between gap-3 border-b border-slate-800 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-slate-500">
            <Icon size={16} />
          </div>

          <div>
            <div className="text-[10px] font-bold text-slate-200">{title}</div>

            <div className="mt-1 text-[8px] text-slate-600">{description}</div>
          </div>
        </div>

        <span className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-[8px] font-extrabold text-slate-500">
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
          onChange={(event) => onInput(event, category)}
        />

        <div
          onDragOver={(event) => onDragOver(event, category)}
          onDragLeave={onDragLeave}
          onDrop={(event) => onDrop(event, category)}
          onClick={() => inputRef.current?.click()}
          className={`
            group
            cursor-pointer
            rounded-xl
            border
            border-dashed
            p-5
            text-center
            transition
            ${
              dragging
                ? "border-emerald-400/50 bg-emerald-500/10"
                : "border-slate-800 bg-slate-950/30 hover:border-emerald-500/30 hover:bg-emerald-500/5"
            }
          `}
        >
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-slate-600 transition group-hover:bg-emerald-500/10 group-hover:text-emerald-300">
            <Upload size={16} />
          </div>

          <div className="mt-2 text-[9px] font-bold text-slate-400">
            Upload atau drag & drop
          </div>

          <div className="mt-1 text-[8px] text-slate-700">
            {category === "supporting_document"
              ? "Format PDF"
              : "Format JPG / JPEG"}
          </div>
        </div>

        {categoryFiles.length > 0 && (
          <div className="mt-3 space-y-2">
            {categoryFiles.map((item) => (
              <DocumentationFileRow
                key={item.id}
                item={item}
                onRemove={onRemove}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   DOCUMENTATION FILE ROW
============================================================ */

function DocumentationFileRow({
  item,
  onRemove,
}: {
  item: DocumentationFile;
  onRemove: (id: string) => void;
}) {
  const Icon = getCategoryIcon(item.category);

  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-2">
      {item.previewUrl ? (
        <img
          src={item.previewUrl}
          alt={item.file.name}
          className="h-10 w-10 rounded-lg object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-slate-500">
          <Icon size={15} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="truncate text-[9px] font-bold text-slate-300">
          {item.file.name}
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[7px] font-medium text-slate-600">
          <span>{getCategoryLabel(item.category)}</span>

          <span>•</span>

          <span>{formatBytes(item.file.size)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onRemove(item.id)}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:bg-red-500/10 hover:text-red-300"
      >
        <X size={13} />
      </button>
    </div>
  );
}

/* ============================================================
   DOCUMENTATION STAT
============================================================ */

function DocumentationStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5">
      <span className="text-[7px] font-bold uppercase tracking-wide text-slate-600">
        {label}
      </span>

      <span className="ml-1.5 text-[9px] font-extrabold text-slate-300">
        {value}
      </span>
    </div>
  );
}

/* ============================================================
   REVIEW CARD
============================================================ */

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
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/30">
      <div className="flex items-center justify-between border-b border-slate-800 p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-slate-500">
            <Icon size={14} />
          </div>

          <span className="text-[10px] font-bold text-slate-300">{title}</span>
        </div>

        {complete ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[7px] font-extrabold uppercase text-emerald-300">
            <Check size={10} />
            Complete
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-[7px] font-extrabold uppercase text-amber-300">
            <Circle size={6} fill="currentColor" />
            Review
          </span>
        )}
      </div>

      <div className="divide-y divide-slate-800/70 p-1">{children}</div>
    </div>
  );
}

/* ============================================================
   REVIEW ROW
============================================================ */

function ReviewRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2.5">
      <span className="shrink-0 text-[8px] font-bold uppercase tracking-wide text-slate-600">
        {label}
      </span>

      <span className="max-w-[65%] text-right text-[9px] font-semibold text-slate-400">
        {value}
      </span>
    </div>
  );
}

/* ============================================================
   NOTIFICATION
============================================================ */

function Notification({
  type,
  message,
  onClose,
}: {
  type: "success" | "error" | "info";
  message: string;
  onClose: () => void;
}) {
  const styles = {
    success: "border-emerald-500/20 bg-emerald-500/5 text-emerald-300",
    error: "border-red-500/20 bg-red-500/5 text-red-300",
    info: "border-sky-500/20 bg-sky-500/5 text-sky-300",
  };

  const Icon =
    type === "success" ? CheckCircle2 : type === "error" ? AlertCircle : Info;

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${styles[type]}`}
    >
      <Icon size={14} className="mt-0.5 shrink-0" />

      <div className="min-w-0 flex-1 text-[9px] font-semibold leading-relaxed">
        {message}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="shrink-0 text-current opacity-50 transition hover:opacity-100"
      >
        <X size={13} />
      </button>
    </div>
  );
}
