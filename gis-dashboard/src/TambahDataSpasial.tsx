import React, { useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { API_URL } from "./api";
import Header from "./header";

type Section = "kerawanan" | "mitigasiAdaptasi" | "lainnya" | "kejadian";

const SECTION_TITLES: Record<Section, string> = {
  kerawanan: "Kerawanan",
  mitigasiAdaptasi: "Mitigasi dan Adaptasi",
  lainnya: "Lainnya",
  kejadian: "Kejadian",
};

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

        xhr.open("POST", `${API_URL}/api/layers`);

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
        `Layer "${tableName}" berhasil dipublikasikan ke SIMITI GIS.`,
      );

      closeEventSource();

      /*
       * Kembali ke Kawasan Rawan
       */

      window.setTimeout(() => {
        navigate("/kerawanan", {
          state: {
            refreshLayers: true,
            createdLayer: tableName,
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
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* ======================================================
          HEADER
      ====================================================== */}

      <div className="shrink-0 border-b border-slate-200 bg-white">
        <Header currentPage="kerawanan" />

        <div className="flex items-center gap-2 border-t border-emerald-100 bg-emerald-50 px-4 py-1.5 sm:px-6">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />

          <span className="text-[10px] font-semibold text-emerald-800">
            GIS Publisher
          </span>
        </div>
      </div>

      {/* ======================================================
          MAIN
      ====================================================== */}

      <main className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-7">
        {/* ====================================================
            PAGE TITLE
        ==================================================== */}

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
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
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                Tambah Data Spasial
              </h1>

              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-700">
                GIS Publisher
              </span>
            </div>

            <p className="mt-1 text-xs text-slate-500 sm:text-sm">
              Publikasikan dataset Shapefile menjadi layer GIS baru tanpa
              menggunakan modal.
            </p>
          </div>

          {/* MODULE */}

          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />

            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Modul tujuan
              </div>

              <div className="text-xs font-bold text-slate-700">
                {getSectionTitle(currentSection)}
              </div>
            </div>
          </div>
        </div>

        {/* ====================================================
            GRID
        ==================================================== */}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* ==================================================
              LEFT
          ================================================== */}

          <div className="space-y-4">
            {/* =================================================
                LAYER DEFINITION
            ================================================= */}

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-gradient-to-r from-slate-950 to-emerald-950 px-5 py-5 text-white sm:px-6">
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

                    <h2 className="mt-1 text-base font-bold sm:text-lg">
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

              <div className="space-y-5 p-5 sm:p-6">
                {/* NAME */}

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label className="text-xs font-bold text-slate-700">
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
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-10 text-sm font-medium outline-none transition placeholder:text-slate-300 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 disabled:cursor-not-allowed disabled:bg-slate-100"
                    />

                    {newLayerName.trim() && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500">
                        ✓
                      </span>
                    )}
                  </div>
                </div>

                {/* MODULE INFO */}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                      Modul tujuan
                    </div>

                    <div className="mt-1 text-sm font-bold text-slate-700">
                      {getSectionTitle(currentSection)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                      Publisher
                    </div>

                    <div className="mt-1 flex items-center gap-2 text-sm font-bold text-slate-700">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      GIS Publisher
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* =================================================
                DATASET
            ================================================= */}

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">
                    02 · Spatial Dataset
                  </div>

                  <h2 className="mt-1 text-sm font-bold text-slate-800">
                    Upload paket Shapefile
                  </h2>
                </div>

                {uploadedFiles.length > 0 && (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black text-emerald-700">
                    {uploadedFiles.length} FILE
                  </span>
                )}
              </div>

              <div className="p-5 sm:p-6">
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
                    className="group flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center transition hover:border-emerald-400 hover:bg-emerald-50/30"
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

          <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            {/* PIPELINE */}

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
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
                  <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
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

            <section className="rounded-2xl border border-slate-200 bg-slate-900 p-5 text-white shadow-sm">
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

        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
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
              className="flex-1 rounded-xl border border-slate-200 bg-white px-5 py-3 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
            >
              Batal
            </button>

            <button
              type="button"
              onClick={handleCreateLayer}
              disabled={!canPublish}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-[10px] font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 sm:flex-none"
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
