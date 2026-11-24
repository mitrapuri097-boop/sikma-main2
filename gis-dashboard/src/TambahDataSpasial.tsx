import React, { useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { API_URL } from "./api";

type Section =
  | "kerawanan"
  | "mitigasiAdaptasi"
  | "lainnya"
  | "kejadian";

const SECTION_TITLES: Record<Section, string> = {
  kerawanan: "Kerawanan",
  mitigasiAdaptasi: "Mitigasi dan Adaptasi",
  lainnya: "Lainnya",
  kejadian: "Kejadian",
};

const SECTION_OPTIONS: Array<{
  value: Section;
  title: string;
  description: string;
  icon: string;
}> = [
  {
    value: "kerawanan",
    title: "Kerawanan",
    description: "Data ancaman, bahaya, dan risiko bencana",
    icon: "◈",
  },
  {
    value: "mitigasiAdaptasi",
    title: "Mitigasi dan Adaptasi",
    description: "Data upaya pengurangan risiko dan penyesuaian terhadap dampak bencana",
    icon: "✳",
  },
  {
    value: "lainnya",
    title: "Lainnya",
    description: "Data spasial pendukung dan referensi",
    icon: "▦",
  },
  {
    value: "kejadian",
    title: "Kejadian",
    description: "Data lokasi dan sebaran kejadian bencana",
    icon: "⌖",
  },
];

const ALLOWED_EXTENSIONS = ["shp", "shx", "dbf", "prj", "cpg", "sbn", "sbx"];

const CORE_EXTENSIONS = ["shp", "shx", "dbf"];

const VALIDATION_EXTENSIONS = ["shp", "shx", "dbf", "prj"];

const getSectionTitle = (section: string) =>
  SECTION_TITLES[section as Section] || SECTION_TITLES.kerawanan;

const getExtension = (name: string) =>
  name.split(".").pop()?.toLowerCase() || "";

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const sanitizeTableName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

const TambahDataSpasial = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const inputRef = useRef<HTMLInputElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  /*
   * ============================================================
   * SECTION
   * ============================================================
   */

  const routeState = (location.state || {}) as {
    section?: Section;
  };

  const searchSection = new URLSearchParams(location.search).get(
    "section",
  ) as Section | null;

  const initialSection: Section =
    routeState.section && SECTION_TITLES[routeState.section]
      ? routeState.section
      : searchSection && SECTION_TITLES[searchSection]
        ? searchSection
        : "kerawanan";

  /*
   * ============================================================
   * STATE
   * ============================================================
   */

  const [currentSection, setCurrentSection] = useState<Section>(initialSection);

  const [newLayerName, setNewLayerName] = useState("");

  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  const [isUploading, setIsUploading] = useState(false);

  const [uploadProgress, setUploadProgress] = useState(0);

  const [insertProgress, setInsertProgress] = useState(0);

  const [insertStatus, setInsertStatus] = useState("");

  const [errorMessage, setErrorMessage] = useState("");

  const [successMessage, setSuccessMessage] = useState("");

  /*
   * ============================================================
   * DATASET VALIDATION
   * ============================================================
   */

  const hasShp = useMemo(
    () => uploadedFiles.some((file) => getExtension(file.name) === "shp"),
    [uploadedFiles],
  );

  const hasShx = useMemo(
    () => uploadedFiles.some((file) => getExtension(file.name) === "shx"),
    [uploadedFiles],
  );

  const hasDbf = useMemo(
    () => uploadedFiles.some((file) => getExtension(file.name) === "dbf"),
    [uploadedFiles],
  );

  const hasPrj = useMemo(
    () => uploadedFiles.some((file) => getExtension(file.name) === "prj"),
    [uploadedFiles],
  );

  const validation = useMemo(
    () =>
      VALIDATION_EXTENSIONS.map((extension) => ({
        extension,
        exists: uploadedFiles.some(
          (file) => getExtension(file.name) === extension,
        ),
      })),
    [uploadedFiles],
  );

  const canPublish =
    !isUploading && Boolean(newLayerName.trim()) && hasShp && hasDbf;

  /*
   * ============================================================
   * CLEANUP SSE
   * ============================================================
   */

  const closeEventSource = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  /*
   * ============================================================
   * BACK
   * ============================================================
   */

  const goBack = () => {
    if (isUploading) return;

    navigate("/kerawanan");
  };

  /*
   * ============================================================
   * FILE INPUT
   * ============================================================
   */

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).filter((file) =>
      ALLOWED_EXTENSIONS.includes(getExtension(file.name)),
    );

    setErrorMessage("");
    setSuccessMessage("");
    setUploadedFiles(files);
  };

  /*
   * ============================================================
   * DRAG & DROP
   * ============================================================
   */

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();

    if (isUploading) return;

    const files = Array.from(event.dataTransfer.files).filter((file) =>
      ALLOWED_EXTENSIONS.includes(getExtension(file.name)),
    );

    setErrorMessage("");
    setSuccessMessage("");
    setUploadedFiles(files);
  };

  /*
   * ============================================================
   * CREATE / PUBLISH LAYER
   * ============================================================
   */

  const handleCreateLayer = async () => {
    setErrorMessage("");
    setSuccessMessage("");

    const tableName = sanitizeTableName(newLayerName.trim());

    /*
     * VALIDASI NAMA
     */

    if (!tableName) {
      setErrorMessage("Nama layer/tabel wajib diisi.");
      return;
    }

    /*
     * VALIDASI FILE
     */

    if (uploadedFiles.length === 0) {
      setErrorMessage("Dataset Shapefile wajib diupload.");
      return;
    }

    if (!hasShp) {
      setErrorMessage("File .SHP wajib tersedia sebelum publikasi.");
      return;
    }

    if (!hasDbf) {
      setErrorMessage("File .DBF wajib tersedia sebelum publikasi.");
      return;
    }

    /*
     * UPDATE STATE
     */

    setNewLayerName(tableName);

    setIsUploading(true);

    setUploadProgress(0);

    setInsertProgress(0);

    setInsertStatus("Menyiapkan dataset...");

    /*
     * ==========================================================
     * FORMDATA
     * ==========================================================
     */

    const formData = new FormData();

    formData.append("tableName", tableName);

    formData.append("section", currentSection);

    uploadedFiles.forEach((file) => {
      formData.append("files", file);
    });

    /*
     * ==========================================================
     * SSE PROGRESS
     * ==========================================================
     */

    closeEventSource();

    const eventSource = new EventSource(
      `${API_URL}/api/layers/progress/${encodeURIComponent(tableName)}`,
    );

    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (typeof data.progress === "number") {
          setInsertProgress(
            Math.max(0, Math.min(100, Math.round(data.progress))),
          );
        }

        if (data.status) {
          setInsertStatus(String(data.status));
        }

        if (data.done) {
          eventSource.close();
        }
      } catch (error) {
        console.error("Error parsing SSE data:", error);
      }
    };

    eventSource.onerror = () => {
      /*
       * SSE boleh tertutup lebih dulu
       * setelah proses server selesai.
       */
      eventSource.close();
    };

    /*
     * ==========================================================
     * UPLOAD XHR
     * ==========================================================
     */

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        /*
         * UPLOAD PROGRESS
         */

        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);

            setUploadProgress(progress);
          }
        });

        /*
         * RESPONSE
         */

        xhr.addEventListener("load", () => {
          let result: any = null;

          try {
            result = xhr.responseText ? JSON.parse(xhr.responseText) : null;
          } catch {
            result = null;
          }

          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
            return;
          }

          reject(
            new Error(
              result?.error || `Gagal membuat layer (HTTP ${xhr.status})`,
            ),
          );
        });

        /*
         * NETWORK ERROR
         */

        xhr.addEventListener("error", () => {
          reject(new Error("Network error saat upload dataset."));
        });

        /*
         * ABORT
         */

        xhr.addEventListener("abort", () => {
          reject(new Error("Upload dibatalkan."));
        });

        /*
         * SEND REQUEST
         */

        const token =
          localStorage.getItem("smiti_token") ||
          sessionStorage.getItem("smiti_token") ||
          localStorage.getItem("adminToken") ||
          sessionStorage.getItem("adminToken") ||
          localStorage.getItem("token") ||
          sessionStorage.getItem("token") ||
          localStorage.getItem("access_token") ||
          sessionStorage.getItem("access_token") ||
          localStorage.getItem("authToken") ||
          sessionStorage.getItem("authToken");

        if (!token) {
          reject(new Error("Sesi login tidak ditemukan. Silakan login ulang."));
          return;
        }

        xhr.open("POST", `${API_URL}/api/layers`);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);

        xhr.send(formData);
      });

      /*
       * ========================================================
       * SUCCESS
       * ========================================================
       */

      setUploadProgress(100);

      setInsertProgress(100);

      setInsertStatus("Selesai");

      setSuccessMessage(
        `Layer "${tableName}" berhasil dipublikasikan ke modul ${getSectionTitle(currentSection)}.`,
      );

      closeEventSource();

      /*
       * Kembali ke WebGIS. Halaman Kerawanan akan memuat ulang
       * katalog /api/layers sehingga layer masuk ke kelompok section
       * yang dikirim saat publikasi.
       */
      window.setTimeout(() => {
        navigate("/kerawanan", {
          replace: true,
          state: {
            refreshLayers: true,
            publishedLayer: tableName,
            publishedSection: currentSection,
          },
        });
      }, 900);
    } catch (error: any) {
      console.error("Error creating layer:", error);

      closeEventSource();

      setErrorMessage(error?.message || "Gagal membuat layer.");

      setInsertStatus("Gagal");

      setIsUploading(false);
    }
  };

  /*
   * ============================================================
   * RENDER
   * ============================================================
   */

  return (
    <div className="w-full bg-[#f4f7fb] px-3 py-4 text-slate-900 sm:px-5 sm:py-5 lg:px-6">

      {/* ======================================================
          MAIN
      ====================================================== */}

      <main className="mx-auto w-full max-w-none">
        {/* ====================================================
            PAGE TITLE
        ==================================================== */}

        <div className="mb-5 flex flex-col gap-5 border-b border-slate-200/80 pb-5 2xl:flex-row 2xl:items-start 2xl:justify-between">
          <div>
            <button
              onClick={goBack}
              disabled={isUploading}
              className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-900 disabled:opacity-40"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 18l-6-6 6-6"
                />
              </svg>
              Kembali ke Kawasan Rawan
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-[28px]">
                Tambah Data Spasial
              </h1>

              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-700">
                GIS Publisher
              </span>
            </div>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Publikasikan dataset Shapefile menjadi layer GIS baru tanpa
              menggunakan modal.
            </p>
          </div>


        </div>

        {/* ====================================================
            GRID
        ==================================================== */}

        <div className="grid grid-cols-1 items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_330px]">
          {/* ==================================================
              LEFT
          ================================================== */}

          <div className="space-y-6">
            {/* =================================================
                LAYER DEFINITION
            ================================================= */}

            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.045)]">
              <div className="border-b border-slate-800 bg-gradient-to-r from-[#101c2e] via-[#142b3b] to-[#123c3a] px-6 py-6 text-white sm:px-7">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
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

                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                      01 · Layer Definition
                    </div>

                    <h2 className="mt-1 text-lg font-bold tracking-tight sm:text-xl">
                      Identitas layer
                    </h2>

                    <p className="mt-1 text-[11px] text-slate-300">
                      Nama ini akan dikirim sebagai{" "}
                      <code className="rounded bg-white/10 px-1">
                        tableName
                      </code>{" "}
                      ke endpoint publikasi.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-6 p-6 sm:p-7">
                {/* MODULE DESTINATION */}
          <section className="w-full rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)] w-full 2xl:max-w-[390px] 2xl:shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  Modul tujuan
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-slate-500">
                  Pilih lokasi publikasi layer
                </div>
              </div>

              <div
                className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2"
                aria-live="polite"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <svg className="h-3 w-3" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="m5 10 3.2 3.2L15.5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="leading-tight">
                  <span className="block text-[8px] font-bold uppercase tracking-wider text-emerald-700/75">
                    Tujuan aktif
                  </span>
                  <span className="block text-[11px] font-extrabold text-emerald-800">
                    {getSectionTitle(currentSection)}
                  </span>
                </span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2">
              {SECTION_OPTIONS.map((option) => {
                const selected = currentSection === option.value;
                const isMitigationOption = option.value === "mitigasiAdaptasi";
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setCurrentSection(option.value);
                      setErrorMessage("");
                      setSuccessMessage("");
                    }}
                    disabled={isUploading}
                    aria-pressed={selected}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      isMitigationOption
                        ? "ml-5 w-[calc(100%-1.25rem)] border-l-4 border-l-emerald-300 bg-emerald-50/40"
                        : ""
                    } ${
                      selected
                        ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-500/10"
                        : "border-slate-200 bg-slate-50 hover:border-emerald-300 hover:bg-emerald-50/60"
                    }`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg font-bold ${
                      selected
                        ? "bg-emerald-600 text-white"
                        : "bg-white text-slate-500 ring-1 ring-slate-200"
                    }`}>
                      {option.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-bold text-slate-800">
                        {option.title}
                      </span>
                      <span className="mt-0.5 block text-[9px] leading-4 text-slate-500">
                        {option.description}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[8px] font-black ${
                      selected
                        ? "bg-emerald-600 text-white"
                        : "bg-white text-slate-500 ring-1 ring-slate-200"
                    }`}>
                      {selected ? "DIPILIH" : "PILIH"}
                    </span>
                  </button>
                );
              })}
            </div>
                </section>

                {/* NAME */}

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label className="text-sm font-semibold text-slate-800">
                      Nama Layer / Tabel{" "}
                      <span className="text-rose-500">*</span>
                    </label>

                    <span className="hidden text-[9px] text-slate-400 sm:block">
                      Gunakan huruf kecil, angka, dan underscore
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      value={newLayerName}
                      onChange={(event) => setNewLayerName(event.target.value)}
                      onBlur={() =>
                        setNewLayerName(sanitizeTableName(newLayerName))
                      }
                      disabled={isUploading}
                      placeholder="contoh: bahaya_banjir_kabupaten_bogor"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3.5 pr-10 text-sm font-medium outline-none transition placeholder:text-slate-300 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 disabled:cursor-not-allowed disabled:bg-slate-100"
                    />

                    {newLayerName.trim() && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500">
                        ✓
                      </span>
                    )}
                  </div>
                </div>


              </div>
            </section>

            {/* =================================================
                DATASET
            ================================================= */}

            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.045)]">
              <div className="relative flex flex-col gap-4 border-b border-slate-100 px-6 py-5 sm:px-7 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">
                    02 · Spatial Dataset
                  </div>

                  <h2 className="mt-1 text-sm font-bold text-slate-800">
                    Upload paket Shapefile
                  </h2>
                </div>
                <div className="flex w-full flex-col items-start gap-3 lg:absolute lg:right-6 lg:top-5 lg:w-[360px] lg:items-start">
<section className="w-full max-w-[360px] shrink-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.045)]">
              <div className="border-b border-slate-100 px-6 py-5">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                  03 · Publication Pipeline
                </div>

                <h2 className="mt-1 text-sm font-bold text-slate-800">
                  Status publikasi
                </h2>
              </div>

              <div className="p-5">
                <div className="space-y-3">
                  {[
                    ["01", "Validasi", hasShp],
                    ["02", "Upload", uploadProgress >= 100],
                    ["03", "Import GIS", insertProgress >= 100],
                    ["04", "Publish", insertProgress >= 100],
                  ].map(([number, title, done]) => (
                    <div
                      key={String(number)}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${
                        done
                          ? "border-emerald-100 bg-emerald-50/60"
                          : "border-slate-100 bg-slate-50"
                      }`}
                    >
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg text-[9px] font-black ${
                          done
                            ? "bg-emerald-500 text-white"
                            : "bg-white text-slate-400 ring-1 ring-slate-200"
                        }`}
                      >
                        {done ? "✓" : number}
                      </div>

                      <div
                        className={`text-[10px] font-bold ${
                          done ? "text-emerald-700" : "text-slate-500"
                        }`}
                      >
                        {title}
                      </div>
                    </div>
                  ))}
                </div>

                {/* PROGRESS */}

                {isUploading && (
                  <div className="mt-5 space-y-6 border-t border-slate-100 pt-5">
                    {/* UPLOAD */}

                    <div>
                      <div className="mb-1.5 flex justify-between">
                        <span className="text-[10px] font-semibold text-slate-700">
                          Upload Dataset
                        </span>

                        <b className="text-[10px] text-slate-600">
                          {uploadProgress}%
                        </b>
                      </div>

                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-300"
                          style={{
                            width: `${uploadProgress}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* IMPORT */}

                    <div>
                      <div className="mb-1.5 flex justify-between">
                        <span className="text-[10px] font-semibold text-slate-700">
                          Import Features
                        </span>

                        <b className="text-[10px] text-slate-600">
                          {insertProgress}%
                        </b>
                      </div>

                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                          style={{
                            width: `${insertProgress}%`,
                          }}
                        />
                      </div>

                      {insertStatus && (
                        <div className="mt-1 text-[9px] text-slate-400">
                          {insertStatus}
                        </div>
                      )}
                    </div>

                    {/* WARNING */}

                    <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-[9px] leading-relaxed text-amber-700">
                      <b className="text-amber-800">Jangan tutup halaman.</b>{" "}
                      Dataset sedang dikirim dan diproses ke database GIS.
                    </div>
                  </div>
                )}
              </div>
            </section>
{uploadedFiles.length > 0 && (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black text-emerald-700">
                    {uploadedFiles.length} FILE
                  </span>
                )}
                </div>

                
              </div>

              <div className="px-6 pb-6 pt-3 sm:px-7 sm:pb-7 sm:pt-3 lg:mr-[380px]">
                <input
                  ref={inputRef}
                  id="shapefileInput"
                  type="file"
                  multiple
                  accept=".shp,.shx,.dbf,.prj,.cpg,.sbn,.sbx"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={isUploading}
                />

                {/* EMPTY */}

                {uploadedFiles.length === 0 ? (
                  <label
                    htmlFor="shapefileInput"
                    onDrop={handleDrop}
                    onDragOver={(event) => event.preventDefault()}
                    className="group flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-gradient-to-b from-slate-50 to-white px-6 py-10 text-center transition hover:border-emerald-400 hover:bg-emerald-50/30"
                  >
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 group-hover:ring-emerald-200">
                      <svg
                        className="h-8 w-8 text-slate-400 group-hover:text-emerald-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 16V4m0 0L7 9m5-5l5 5"
                        />

                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 20h14a2 2 0 002-2v-4a2 2 0 00-2-2h-1M7 12H5a2 2 0 00-2 2v4a2 2 0 002 2h1"
                        />
                      </svg>
                    </div>

                    <div className="text-sm font-bold text-slate-700">
                      Pilih atau tarik dataset ke sini
                    </div>

                    <div className="mt-1 text-[11px] text-slate-400">
                      Paket Shapefile multi-file didukung
                    </div>

                    <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                      {["SHP", "SHX", "DBF", "PRJ", "CPG"].map((extension) => (
                        <span
                          key={extension}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[8px] font-black tracking-wider text-slate-500"
                        >
                          .{extension}
                        </span>
                      ))}
                    </div>

                    <div className="mt-3 text-[9px] text-slate-400">
                      <b className="text-slate-600">.SHP wajib.</b> File
                      pendukung lain akan ikut dikirim ke server.
                    </div>
                  </label>
                ) : (
                  <div className="space-y-3">
                    {/* DATASET DETECTED */}

                    <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white">
                          ✓
                        </div>

                        <div>
                          <div className="text-[11px] font-bold text-emerald-800">
                            Dataset terdeteksi
                          </div>

                          <div className="text-[9px] text-emerald-600">
                            {uploadedFiles.length} file siap diproses
                          </div>
                        </div>
                      </div>

                      {!isUploading && (
                        <button
                          type="button"
                          onClick={() => inputRef.current?.click()}
                          className="rounded-lg bg-white px-3 py-2 text-[9px] font-bold text-emerald-700 shadow-sm ring-1 ring-emerald-100 hover:bg-emerald-50"
                        >
                          Ganti File
                        </button>
                      )}
                    </div>

                    {/* FILE LIST */}

                    <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                      {uploadedFiles.map((file, index) => {
                        const extension =
                          getExtension(file.name).toUpperCase() || "FILE";

                        const isCore = CORE_EXTENSIONS.includes(
                          extension.toLowerCase(),
                        );

                        const isShp = extension === "SHP";

                        return (
                          <div
                            key={`${file.name}-${index}`}
                            className="flex items-center gap-3 px-4 py-3"
                          >
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[8px] font-black ${
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
                                {formatBytes(file.size)}
                              </div>
                            </div>

                            {isCore && (
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[7px] font-black text-slate-500">
                                CORE
                              </span>
                            )}

                            <span className="text-emerald-500">✓</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* VALIDATION */}

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                          Dataset validation
                        </span>

                        <span
                          className={`text-[9px] font-black ${
                            hasShp ? "text-emerald-600" : "text-rose-500"
                          }`}
                        >
                          {hasShp ? "VALID" : "INCOMPLETE"}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {validation.map(({ extension, exists }) => (
                          <div
                            key={extension}
                            className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
                              exists
                                ? "border-emerald-100 bg-white"
                                : "border-slate-200 bg-white"
                            }`}
                          >
                            <span
                              className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${
                                exists
                                  ? "bg-emerald-100 text-emerald-600"
                                  : "bg-slate-100 text-slate-400"
                              }`}
                            >
                              {exists ? "✓" : "•"}
                            </span>

                            <span
                              className={`text-[8px] font-bold uppercase ${
                                exists ? "text-slate-600" : "text-slate-400"
                              }`}
                            >
                              .{extension}
                            </span>
                          </div>
                        ))}
                      </div>

                      {!hasShp && (
                        <div className="mt-3 text-[9px] font-semibold text-rose-500">
                          ⚠ File .shp wajib tersedia sebelum publikasi.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* ==================================================
              RIGHT
          ================================================== */}

          <aside className="space-y-6 self-start">


            {/* MESSAGE */}

            {(errorMessage || successMessage) && (
              <section
                className={`rounded-2xl border p-4 shadow-sm ${
                  errorMessage
                    ? "border-rose-100 bg-rose-50"
                    : "border-emerald-100 bg-emerald-50"
                }`}
              >
                <div
                  className={`text-xs font-bold ${
                    errorMessage ? "text-rose-800" : "text-emerald-800"
                  }`}
                >
                  {errorMessage ? "Publikasi gagal" : "Publikasi berhasil"}
                </div>

                <div
                  className={`mt-1 text-[10px] leading-relaxed ${
                    errorMessage ? "text-rose-700" : "text-emerald-700"
                  }`}
                >
                  {errorMessage || successMessage}
                </div>
              </section>
            )}

            {/* INFO */}

            <section className="rounded-2xl border border-slate-800 bg-gradient-to-br from-[#101c2e] to-[#173b3b] p-6 text-white shadow-[0_12px_30px_rgba(15,23,42,0.12)]">
              <div className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-300">
                GIS Publisher
              </div>

              <div className="mt-2 text-sm font-bold">
                Ready for GIS publication
              </div>

              <div className="mt-1 text-[10px] leading-relaxed text-slate-400">
                Publikasi akan menggunakan endpoint backend yang sama dengan
                halaman Kawasan Rawan.
              </div>
            </section>
          </aside>
        </div>

        {/* ====================================================
            BOTTOM ACTION
        ==================================================== */}

        <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.045)] sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              i
            </div>

            <div>
              <div className="text-[10px] font-bold text-slate-700">
                Pipeline publikasi aman
              </div>

              <div className="mt-0.5 text-[9px] text-slate-400">
                Validasi → Upload → Import GIS → Publish
              </div>
            </div>
          </div>

          <div className="flex w-full gap-2 sm:w-auto">
            <button
              type="button"
              onClick={goBack}
              disabled={isUploading}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
            >
              Batal
            </button>

            <button
              type="button"
              onClick={handleCreateLayer}
              disabled={!canPublish}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#142b3b] px-6 py-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 sm:flex-none"
            >
              {isUploading ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />

                  {uploadProgress < 100 ? "Mengupload..." : "Memproses..."}
                </>
              ) : (
                <>＋ Publikasikan Layer</>
              )}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default TambahDataSpasial;
