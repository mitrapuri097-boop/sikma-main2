import { FormEvent, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || "";
const LOGIN_TIMEOUT_MS = 15000;

declare global {
  interface Window {
    grecaptcha?: {
      ready: (callback: () => void) => void;

      render: (
        container: HTMLElement,
        parameters: {
          sitekey: string;
          theme?: "light" | "dark";
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        },
      ) => number;

      reset: (widgetId?: number) => void;
    };

    smitiRecaptchaOnLoad?: () => void;
  }
}

interface LoginResponse {
  success?: boolean;
  message?: string;
  token?: string;
  access_token?: string;

  data?: {
    token?: string;
    access_token?: string;

    user?: {
      id?: string | number;
      username?: string;
      email?: string;
      full_name?: string;
      role?: string;
      role_name?: string;
    };
  };

  user?: {
    id?: string | number;
    username?: string;
    email?: string;
    full_name?: string;
    phone?: string;
    role?: string;
    role_name?: string;
    role_id?: string | number;
    organization_id?: string | number;
    unit_id?: string | number;
    status?: string;
    avatar?: string | null;
  };
}

export default function Login() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /*
   * GOOGLE reCAPTCHA
   */
  const recaptchaRef = useRef<HTMLDivElement | null>(null);

  const recaptchaWidgetId = useRef<number | null>(null);

  const [recaptchaToken, setRecaptchaToken] = useState("");

  /*
   * LOAD GOOGLE reCAPTCHA V2
   */
  useEffect(() => {
    if (!RECAPTCHA_SITE_KEY) {
      setError(
        "Google reCAPTCHA belum dikonfigurasi. Tambahkan VITE_RECAPTCHA_SITE_KEY pada .env frontend.",
      );

      return;
    }

    const SCRIPT_ID = "google-recaptcha-v2-script";

    /*
     * Render CAPTCHA
     */
    const renderCaptcha = () => {
      if (!recaptchaRef.current) {
        return;
      }

      if (!window.grecaptcha) {
        return;
      }

      /*
       * Pastikan API yang digunakan benar-benar v2
       */
      if (typeof window.grecaptcha.render !== "function") {
        console.warn(
          "Google reCAPTCHA render() belum tersedia. Menunggu API...",
        );

        window.setTimeout(renderCaptcha, 200);

        return;
      }

      /*
       * Jangan render dua kali
       */
      if (recaptchaWidgetId.current !== null) {
        return;
      }

      try {
        recaptchaWidgetId.current = window.grecaptcha.render(
          recaptchaRef.current,
          {
            sitekey: RECAPTCHA_SITE_KEY,

            theme: "light",

            callback: (token: string) => {
              console.log("reCAPTCHA berhasil:", token);

              setRecaptchaToken(token);

              setError("");
            },

            "expired-callback": () => {
              console.log("reCAPTCHA expired");

              setRecaptchaToken("");
            },

            "error-callback": () => {
              console.error("reCAPTCHA error");

              setRecaptchaToken("");

              setError("Verifikasi reCAPTCHA gagal. Silakan centang kembali.");
            },
          },
        );

        console.log(
          "Google reCAPTCHA berhasil dirender. Widget ID:",
          recaptchaWidgetId.current,
        );
      } catch (captchaError) {
        console.error("Gagal render Google reCAPTCHA:", captchaError);

        setError(
          "Google reCAPTCHA gagal ditampilkan. Refresh halaman lalu coba lagi.",
        );
      }
    };

    /*
     * Tunggu sampai Google API benar-benar siap
     */
    const waitForGoogleCaptcha = () => {
      if (window.grecaptcha && typeof window.grecaptcha.render === "function") {
        window.grecaptcha.ready(() => {
          renderCaptcha();
        });

        return;
      }

      window.setTimeout(waitForGoogleCaptcha, 100);
    };

    /*
     * Bersihkan script CAPTCHA lama
     *
     * Ini penting untuk menghindari:
     *
     * window.grecaptcha.render is not a function
     */
    document
      .querySelectorAll('script[src*="google.com/recaptcha/api.js"]')
      .forEach((element) => {
        element.remove();
      });

    document.getElementById(SCRIPT_ID)?.remove();

    recaptchaWidgetId.current = null;

    setRecaptchaToken("");

    /*
     * Buat script Google reCAPTCHA V2
     */
    const script = document.createElement("script");

    script.id = SCRIPT_ID;

    script.src =
      "https://www.google.com/recaptcha/api.js?onload=smitiRecaptchaOnLoad&render=explicit";

    script.async = true;

    script.defer = true;

    /*
     * Callback dari Google
     */
    window.smitiRecaptchaOnLoad = () => {
      console.log("Google reCAPTCHA API loaded");

      waitForGoogleCaptcha();
    };

    /*
     * Kalau gagal load Google
     */
    script.onerror = () => {
      console.error("Google reCAPTCHA script gagal dimuat.");

      setError(
        "Gagal memuat Google reCAPTCHA. Periksa koneksi internet dan Site Key.",
      );
    };

    document.head.appendChild(script);

    /*
     * Cleanup
     */
    return () => {
      script.onerror = null;

      delete window.smitiRecaptchaOnLoad;
    };
  }, []);

  /*
   * LOGIN
   */
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    /*
     * Username / password
     */
    if (!username.trim() || !password) {
      setError("Username dan password wajib diisi.");

      return;
    }

    /*
     * Site key
     */
    if (!RECAPTCHA_SITE_KEY) {
      setError("Google reCAPTCHA belum dikonfigurasi.");

      return;
    }

    /*
     * CAPTCHA
     */
    if (!recaptchaToken) {
      setError("Silakan centang verifikasi reCAPTCHA terlebih dahulu.");

      return;
    }

    try {
      setLoading(true);
      setError("");

      /*
       * LOGIN API
       *
       * Jangan biarkan tombol "Memverifikasi..." menggantung
       * kalau backend tidak merespons.
       */
      const controller = new AbortController();
      const timeoutId = window.setTimeout(
        () => controller.abort(),
        LOGIN_TIMEOUT_MS,
      );

      let response: Response;

      try {
        response = await fetch(`${API_URL}/api/login`, {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },

          body: JSON.stringify({
            username: username.trim(),
            password,
            recaptchaToken,
          }),

          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }

      const contentType = response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        throw new Error(
          `Server login mengembalikan response bukan JSON (${response.status}). Periksa API: ${API_URL}/api/login`,
        );
      }

      const result: LoginResponse = await response.json();

      /*
       * LOGIN GAGAL
       */
      if (!response.ok || result.success === false) {
        throw new Error(
          result.message || "Username atau password tidak valid.",
        );
      }

      /*
       * Ambil token
       */
      const token =
        result.token ||
        result.access_token ||
        result.data?.token ||
        result.data?.access_token;

      /*
       * Ambil user
       */
      const user = result.user || result.data?.user;

      /*
       * Token tidak ada
       */
      if (!token) {
        throw new Error(
          "Login berhasil tetapi token autentikasi tidak ditemukan.",
        );
      }

      /*
       * Remember Me
       */
      const storage = remember ? localStorage : sessionStorage;

      storage.setItem("smiti_token", token);

      /*
       * Simpan user
       */
      if (user) {
        storage.setItem("smiti_user", JSON.stringify(user));
      }

      /*
       * Dashboard
       */
      navigate("/dashboard", {
        replace: true,
      });
    } catch (err) {
      console.error("LOGIN ERROR:", err);

      /*
       * Reset CAPTCHA
       */
      setRecaptchaToken("");

      if (window.grecaptcha && recaptchaWidgetId.current !== null) {
        window.grecaptcha.reset(recaptchaWidgetId.current);
      }

      /*
       * Error
       */
      if (err instanceof DOMException && err.name === "AbortError") {
        setError(
          `Server login tidak merespons dalam ${LOGIN_TIMEOUT_MS / 1000} detik. Periksa backend ${API_URL}.`,
        );
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Terjadi kesalahan saat proses login.",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07141c]">
      {/* BACKGROUND */}

      <div className="absolute inset-0">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl" />

        <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-cyan-500/10 blur-3xl" />

        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)
            `,
            backgroundSize: "50px 50px",
          }}
        />
      </div>

      {/* CONTENT */}

      <div className="relative z-10 grid min-h-screen lg:grid-cols-[1.1fr_.9fr]">
        {/* LEFT BRANDING */}

        <section className="hidden flex-col justify-between p-10 lg:flex xl:p-16">
          <div>
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500 text-2xl font-bold text-white shadow-lg shadow-emerald-500/20">
                S
              </div>

              <div>
                <div className="text-2xl font-bold tracking-tight text-white">
                  SIMITI
                </div>

                <div className="text-[11px] font-medium uppercase tracking-[0.25em] text-emerald-400">
                  Sistem Informasi Mitigasi dan Adaptasi
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-xs font-medium text-emerald-300">
              <ShieldCheck size={15} />
              Secure Access
            </div>

            <h1 className="text-4xl font-bold leading-tight text-white xl:text-6xl">
              Sistem Informasi
              <br />
              <span className="text-emerald-400">Kebencanaan</span>
            </h1>

            <p className="mt-6 max-w-lg text-base leading-7 text-slate-400">
              Platform untuk pengelolaan informasi kebencanaan, mitigasi,
              adaptasi, analisis spasial, dan pengambilan keputusan berbasis
              data.
            </p>

            <div className="mt-10 grid grid-cols-3 gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-xl font-bold text-white">GIS</div>

                <div className="mt-1 text-xs text-slate-500">
                  Spatial Intelligence
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-xl font-bold text-white">AI</div>

                <div className="mt-1 text-xs text-slate-500">
                  Smart Analysis
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-xl font-bold text-white">Data</div>

                <div className="mt-1 text-xs text-slate-500">Integrated</div>
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-600">
            © 2026 SIMITI Enterprise GIS
          </div>
        </section>

        {/* LOGIN */}

        <section className="flex items-center justify-center p-5 sm:p-8 lg:p-10">
          <div className="w-full max-w-md">
            {/* MOBILE BRAND */}

            <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500 text-xl font-bold text-white">
                S
              </div>

              <div>
                <div className="text-xl font-bold text-white">SIMITI</div>

                <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-400">
                  Enterprise GIS
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white p-6 shadow-2xl shadow-black/30 sm:p-8">
              <div className="mb-8">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <LockKeyhole size={21} />
                </div>

                <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                  Selamat Datang
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Masuk ke SIMITI Enterprise GIS untuk mengakses sistem.
                </p>
              </div>

              {error && (
                <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* USERNAME */}

                <div>
                  <label
                    htmlFor="username"
                    className="mb-2 block text-sm font-semibold text-slate-700"
                  >
                    Username atau Email
                  </label>

                  <div className="relative">
                    <Mail
                      size={18}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    />

                    <input
                      id="username"
                      name="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Masukkan username"
                      autoComplete="username"
                      className="
                        h-12
                        w-full
                        rounded-xl
                        border
                        border-slate-200
                        bg-slate-50
                        pl-11
                        pr-4
                        text-sm
                        text-slate-900
                        outline-none
                        transition
                        placeholder:text-slate-400
                        focus:border-emerald-500
                        focus:bg-white
                        focus:ring-4
                        focus:ring-emerald-500/10
                      "
                    />
                  </div>
                </div>

                {/* PASSWORD */}

                <div>
                  <label
                    htmlFor="password"
                    className="mb-2 block text-sm font-semibold text-slate-700"
                  >
                    Password
                  </label>

                  <div className="relative">
                    <LockKeyhole
                      size={18}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    />

                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Masukkan password"
                      autoComplete="current-password"
                      className="
                        h-12
                        w-full
                        rounded-xl
                        border
                        border-slate-200
                        bg-slate-50
                        pl-11
                        pr-12
                        text-sm
                        text-slate-900
                        outline-none
                        transition
                        placeholder:text-slate-400
                        focus:border-emerald-500
                        focus:bg-white
                        focus:ring-4
                        focus:ring-emerald-500/10
                      "
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      aria-label={
                        showPassword
                          ? "Sembunyikan password"
                          : "Tampilkan password"
                      }
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* GOOGLE reCAPTCHA V2 */}

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div
                    ref={recaptchaRef}
                    className="flex min-h-[78px] items-center justify-center overflow-hidden"
                  />
                </div>

                {/* OPTIONS */}

                <div className="flex items-center justify-between gap-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                    <input
                      id="remember"
                      name="remember"
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    Ingat saya
                  </label>

                  <button
                    type="button"
                    className="text-sm font-semibold text-emerald-600 hover:text-emerald-700"
                  >
                    Lupa password?
                  </button>
                </div>

                {/* LOGIN BUTTON */}

                <button
                  type="submit"
                  disabled={loading}
                  className="
                    flex
                    h-12
                    w-full
                    items-center
                    justify-center
                    rounded-xl
                    bg-emerald-600
                    text-sm
                    font-bold
                    text-white
                    shadow-lg
                    shadow-emerald-600/20
                    transition
                    hover:bg-emerald-700
                    hover:shadow-emerald-600/30
                    disabled:cursor-not-allowed
                    disabled:opacity-60
                  "
                >
                  {loading
                      ? "Memverifikasi..."
                      : recaptchaToken
                        ? "Masuk ke SIMITI"
                        : "Centang reCAPTCHA"}
                </button>
              </form>

              <div className="mt-8 border-t border-slate-100 pt-6 text-center">
                <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
                  <ShieldCheck size={14} />
                  Secure Enterprise Authentication
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
