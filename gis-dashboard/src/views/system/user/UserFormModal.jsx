import React, { useEffect, useState } from "react";

import {
  CModal,
  CModalHeader,
  CModalTitle,
  CModalBody,
  CModalFooter,
  CButton,
  CSpinner,
} from "@coreui/react";

import CIcon from "@coreui/icons-react";

import {
  cilUserPlus,
  cilUser,
  cilEnvelopeClosed,
  cilLockLocked,
  cilShieldAlt,
  cilSitemap,
  cilInfo,
  cilX,
  cilSave,
} from "@coreui/icons";

const API_URL =
  import.meta.env.VITE_API_URL || "https://demo.datasolusindo.com";

const initialForm = {
  username: "",
  email: "",
  password: "",
  full_name: "",
  phone: "",
  role_id: "",
  organization_id: "",
  unit_id: "",
  status: "active",
};

const UserFormModal = ({ show, onClose, onSuccess }) => {
  const [form, setForm] = useState(initialForm);

  const [loading, setLoading] = useState(false);

  const [showPassword, setShowPassword] = useState(false);

  const [errors, setErrors] = useState({});

  const [apiError, setApiError] = useState("");

  /*
   * ============================================================
   * MASTER ROLE
   * ============================================================
   */

  const [roles, setRoles] = useState([]);

  const [rolesLoading, setRolesLoading] = useState(false);

  const [rolesError, setRolesError] = useState("");

  /*
   * ============================================================
   * LOAD MASTER ROLE
   * ============================================================
   */

  const loadRoles = async () => {
    try {
      setRolesLoading(true);

      setRolesError("");

      const response = await fetch(
        `${API_URL}/api/roles?status=active&limit=1000`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Gagal mengambil data role.");
      }

      /*
       * Endpoint /api/roles mengembalikan:
       *
       * {
       *   success: true,
       *   data: [...]
       * }
       */

      const roleData = Array.isArray(result.data) ? result.data : [];

      /*
       * Pastikan hanya role ACTIVE
       *
       * Ini sebagai proteksi tambahan di frontend.
       */

      const activeRoles = roleData.filter(
        (role) => String(role.status || "").toLowerCase() === "active",
      );

      setRoles(activeRoles);
    } catch (error) {
      console.error("LOAD MASTER ROLE ERROR:", error);

      setRoles([]);

      setRolesError(error?.message || "Gagal mengambil data role.");
    } finally {
      setRolesLoading(false);
    }
  };

  /*
   * ============================================================
   * MODAL OPEN
   * ============================================================
   */

  useEffect(() => {
    console.log("USER FORM MODAL SHOW:", show);

    if (show) {
      setForm(initialForm);

      setErrors({});

      setApiError("");

      setShowPassword(false);

      /*
       * Load role dari master_role
       */

      loadRoles();
    }
  }, [show]);

  /*
   * ============================================================
   * HANDLE CHANGE
   * ============================================================
   */

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));

    setErrors((prev) => ({
      ...prev,
      [name]: "",
    }));

    setApiError("");
  };

  /*
   * ============================================================
   * VALIDATION
   * ============================================================
   */

  const validate = () => {
    const newErrors = {};

    if (!form.full_name.trim()) {
      newErrors.full_name = "Nama lengkap wajib diisi";
    }

    if (!form.username.trim()) {
      newErrors.username = "Username wajib diisi";
    } else if (form.username.trim().length < 3) {
      newErrors.username = "Username minimal 3 karakter";
    }

    if (!form.email.trim()) {
      newErrors.email = "Email wajib diisi";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = "Format email tidak valid";
    }

    if (!form.password) {
      newErrors.password = "Password wajib diisi";
    } else if (form.password.length < 8) {
      newErrors.password = "Password minimal 8 karakter";
    }

    if (!form.status) {
      newErrors.status = "Status wajib dipilih";
    }

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  };

  /*
   * ============================================================
   * CREATE USER
   * ============================================================
   */

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    try {
      setLoading(true);

      setApiError("");

      /*
       * ========================================================
       * CREATE USER
       *
       * Logic lama dipertahankan.
       * ========================================================
       */

      const response = await fetch(`${API_URL}/api/users`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          username: form.username.trim(),

          email: form.email.trim().toLowerCase(),

          password: form.password,

          full_name: form.full_name.trim(),

          phone: form.phone.trim() || null,

          /*
           * ROLE DARI master_role
           */

          role_id: form.role_id ? Number(form.role_id) : null,

          organization_id: form.organization_id
            ? Number(form.organization_id)
            : null,

          unit_id: form.unit_id ? Number(form.unit_id) : null,

          status: form.status,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Gagal menambahkan user");
      }

      if (typeof onSuccess === "function") {
        await onSuccess(result.data);
      }

      onClose();
    } catch (error) {
      console.error("CREATE USER ERROR:", error);

      setApiError(error?.message || "Terjadi kesalahan saat menyimpan user");
    } finally {
      setLoading(false);
    }
  };

  /*
   * ============================================================
   * RENDER
   * ============================================================
   */

  return (
    <CModal
      alignment="center"
      visible={show}
      onClose={loading ? undefined : onClose}
      backdrop="static"
      size="xl"
      scrollable
      portal
      className="user-form-modal"
    >
      <CModalHeader>
        <CModalTitle>
          <div className="d-flex align-items-center gap-3">
            <div
              className="d-flex align-items-center justify-content-center rounded-3"
              style={{
                width: "48px",
                height: "48px",
                background: "#e9e7ff",
                color: "#4f46e5",
              }}
            >
              <CIcon icon={cilUserPlus} size="xl" />
            </div>

            <div>
              <div className="fw-bold">Tambah User</div>

              <div className="text-muted small fw-normal">
                Buat akun pengguna baru untuk sistem SIMITI
              </div>
            </div>
          </div>
        </CModalTitle>
      </CModalHeader>

      <form onSubmit={handleSubmit}>
        <CModalBody>
          {apiError && (
            <div className="alert alert-danger border-0 rounded-3">
              <div className="d-flex gap-2">
                <CIcon icon={cilInfo} className="mt-1" />

                <div>{apiError}</div>
              </div>
            </div>
          )}

          {/* ==================================================
              IDENTITAS USER
          ================================================== */}

          <div>
            <div className="d-flex align-items-center gap-2 mb-3">
              <div className="text-primary">
                <CIcon icon={cilUser} />
              </div>

              <div>
                <div className="fw-bold">Informasi Pengguna</div>

                <div className="text-muted small">Data utama akun pengguna</div>
              </div>
            </div>

            <div className="row g-3">
              {/* NAMA LENGKAP */}

              <div className="col-md-6">
                <label className="form-label fw-semibold">
                  Nama Lengkap
                  <span className="text-danger"> *</span>
                </label>

                <input
                  type="text"
                  name="full_name"
                  className={`form-control ${
                    errors.full_name ? "is-invalid" : ""
                  }`}
                  value={form.full_name}
                  onChange={handleChange}
                  disabled={loading}
                  placeholder="Masukkan nama lengkap"
                />

                {errors.full_name && (
                  <div className="invalid-feedback">{errors.full_name}</div>
                )}
              </div>

              {/* USERNAME */}

              <div className="col-md-6">
                <label className="form-label fw-semibold">
                  Username
                  <span className="text-danger"> *</span>
                </label>

                <div className="input-group">
                  <span className="input-group-text">
                    <CIcon icon={cilUser} />
                  </span>

                  <input
                    type="text"
                    name="username"
                    className={`form-control ${
                      errors.username ? "is-invalid" : ""
                    }`}
                    value={form.username}
                    onChange={handleChange}
                    disabled={loading}
                    placeholder="Masukkan username"
                    autoComplete="username"
                  />
                </div>

                {errors.username && (
                  <div className="text-danger small mt-1">
                    {errors.username}
                  </div>
                )}
              </div>

              {/* EMAIL */}

              <div className="col-md-6">
                <label className="form-label fw-semibold">
                  Email
                  <span className="text-danger"> *</span>
                </label>

                <div className="input-group">
                  <span className="input-group-text">
                    <CIcon icon={cilEnvelopeClosed} />
                  </span>

                  <input
                    type="email"
                    name="email"
                    className={`form-control ${
                      errors.email ? "is-invalid" : ""
                    }`}
                    value={form.email}
                    onChange={handleChange}
                    disabled={loading}
                    placeholder="nama@email.com"
                    autoComplete="email"
                  />
                </div>

                {errors.email && (
                  <div className="text-danger small mt-1">{errors.email}</div>
                )}
              </div>

              {/* PHONE */}

              <div className="col-md-6">
                <label className="form-label fw-semibold">Nomor Telepon</label>

                <input
                  type="text"
                  name="phone"
                  className="form-control"
                  value={form.phone}
                  onChange={handleChange}
                  disabled={loading}
                  placeholder="08xxxxxxxxxx"
                  autoComplete="tel"
                />
              </div>

              {/* PASSWORD */}

              <div className="col-md-8">
                <label className="form-label fw-semibold">
                  Password
                  <span className="text-danger"> *</span>
                </label>

                <div className="input-group">
                  <span className="input-group-text">
                    <CIcon icon={cilLockLocked} />
                  </span>

                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    className={`form-control ${
                      errors.password ? "is-invalid" : ""
                    }`}
                    value={form.password}
                    onChange={handleChange}
                    disabled={loading}
                    placeholder="Minimal 8 karakter"
                    autoComplete="new-password"
                  />

                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setShowPassword((value) => !value)}
                    disabled={loading}
                  >
                    {showPassword ? "Sembunyikan" : "Lihat"}
                  </button>
                </div>

                {errors.password && (
                  <div className="text-danger small mt-1">
                    {errors.password}
                  </div>
                )}
              </div>

              {/* STATUS */}

              <div className="col-md-4">
                <label className="form-label fw-semibold">
                  Status
                  <span className="text-danger"> *</span>
                </label>

                <select
                  name="status"
                  className="form-select"
                  value={form.status}
                  onChange={handleChange}
                  disabled={loading}
                >
                  <option value="active">Active</option>

                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>

          <hr />

          {/* ==================================================
              HAK AKSES & ORGANISASI
          ================================================== */}

          <div>
            <div className="d-flex align-items-center gap-2 mb-3">
              <div className="text-primary">
                <CIcon icon={cilSitemap} />
              </div>

              <div>
                <div className="fw-bold">Hak Akses & Organisasi</div>

                <div className="text-muted small">
                  Pengaturan struktur dan akses pengguna
                </div>
              </div>
            </div>

            <div className="row g-3">
              {/* ==================================================
                  ROLE
              ================================================== */}

              <div className="col-md-4">
                <label className="form-label fw-semibold">Role</label>

                <select
                  name="role_id"
                  className="form-select"
                  value={form.role_id}
                  onChange={handleChange}
                  disabled={loading || rolesLoading}
                >
                  <option value="">
                    {rolesLoading ? "Memuat role..." : "Pilih Role"}
                  </option>

                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>

                {/* ROLE LOADING */}

                {rolesLoading && (
                  <div className="d-flex align-items-center gap-2 mt-2 text-muted small">
                    <CSpinner size="sm" />

                    <span>Memuat data role...</span>
                  </div>
                )}

                {/* ROLE ERROR */}

                {!rolesLoading && rolesError && (
                  <div className="text-danger small mt-2">
                    <div>{rolesError}</div>

                    <button
                      type="button"
                      className="btn btn-link btn-sm p-0"
                      onClick={loadRoles}
                      disabled={loading}
                    >
                      Coba lagi
                    </button>
                  </div>
                )}

                {/* NO ROLE */}

                {!rolesLoading && !rolesError && roles.length === 0 && (
                  <div className="text-muted small mt-2">
                    Belum ada role aktif pada master_role.
                  </div>
                )}
              </div>

              {/* ORGANISASI */}

              <div className="col-md-4">
                <label className="form-label fw-semibold">Organisasi</label>

                <select
                  name="organization_id"
                  className="form-select"
                  value={form.organization_id}
                  onChange={handleChange}
                  disabled={loading}
                >
                  <option value="">Pilih Organisasi</option>

                  <option value="1">SIMITI</option>
                </select>
              </div>

              {/* UNIT KERJA */}

              <div className="col-md-4">
                <label className="form-label fw-semibold">Unit Kerja</label>

                <select
                  name="unit_id"
                  className="form-select"
                  value={form.unit_id}
                  onChange={handleChange}
                  disabled={loading}
                >
                  <option value="">Pilih Unit Kerja</option>

                  <option value="1">Administrator</option>
                </select>
              </div>
            </div>
          </div>

          {/* ==================================================
              INFORMATION
          ================================================== */}

          <div className="alert alert-info border-0 rounded-3 mt-4 mb-0">
            <div className="d-flex gap-2">
              <CIcon icon={cilInfo} className="mt-1" />

              <div className="small">
                <strong>Informasi:</strong> User baru akan dibuat dalam status{" "}
                <strong>
                  {form.status === "active" ? "Active" : "Inactive"}
                </strong>
                . Password akan diproses di backend.
              </div>
            </div>
          </div>
        </CModalBody>

        {/* ====================================================
            FOOTER
        ==================================================== */}

        <CModalFooter>
          <CButton
            color="light"
            className="border"
            onClick={onClose}
            disabled={loading}
            type="button"
          >
            <CIcon icon={cilX} className="me-2" />
            Batal
          </CButton>

          <CButton
            color="primary"
            type="submit"
            disabled={loading || rolesLoading}
          >
            {loading ? (
              <>
                <CSpinner size="sm" className="me-2" />
                Menyimpan...
              </>
            ) : (
              <>
                <CIcon icon={cilSave} className="me-2" />
                Simpan User
              </>
            )}
          </CButton>
        </CModalFooter>
      </form>
    </CModal>
  );
};

export default UserFormModal;
