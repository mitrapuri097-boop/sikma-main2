import React, { useEffect, useState } from 'react'

import {
  CModal,
  CModalHeader,
  CModalTitle,
  CModalBody,
  CModalFooter,
  CButton,
  CSpinner,
} from '@coreui/react'

import CIcon from '@coreui/icons-react'

import {
  cilCheckCircle,
  cilEnvelopeClosed,
  cilInfo,
  cilLockLocked,
  cilShieldAlt,
  cilSitemap,
  cilUser,
  cilX,
} from '@coreui/icons'


const API_URL =
import.meta.env.VITE_API_URL || 'https://demo.datasolusindo.com'


const UserEditModal = ({
  show,
  user,
  onClose,
  onSuccess,
}) => {

  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    full_name: '',
    phone: '',
    role_id: '',
    organization_id: '',
    unit_id: '',
    status: 'active',
  })

  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const [apiError, setApiError] = useState('')


  // =====================================================
  // LOAD DATA USER KE FORM
  // =====================================================

  useEffect(() => {

    if (!show || !user) {
      return
    }

    setForm({
      username: user.username || '',
      email: user.email || '',
      password: '',
      full_name: user.full_name || '',
      phone: user.phone || '',
      role_id:
        user.role_id !== null &&
        user.role_id !== undefined
          ? String(user.role_id)
          : '',
      organization_id:
        user.organization_id !== null &&
        user.organization_id !== undefined
          ? String(user.organization_id)
          : '',
      unit_id:
        user.unit_id !== null &&
        user.unit_id !== undefined
          ? String(user.unit_id)
          : '',
      status: user.status || 'active',
    })

    setErrors({})
    setApiError('')
    setShowPassword(false)

  }, [show, user])


  // =====================================================
  // CHANGE
  // =====================================================

  const handleChange = (e) => {

    const {
      name,
      value,
    } = e.target

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }))

    setErrors((prev) => ({
      ...prev,
      [name]: '',
    }))

    setApiError('')
  }


  // =====================================================
  // VALIDATION
  // =====================================================

  const validate = () => {

    const newErrors = {}

    if (!form.full_name.trim()) {
      newErrors.full_name =
        'Nama lengkap wajib diisi'
    }

    if (!form.username.trim()) {
      newErrors.username =
        'Username wajib diisi'
    } else if (
      form.username.trim().length < 3
    ) {
      newErrors.username =
        'Username minimal 3 karakter'
    }

    if (!form.email.trim()) {
      newErrors.email =
        'Email wajib diisi'
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        form.email,
      )
    ) {
      newErrors.email =
        'Format email tidak valid'
    }

    /*
     * Password EDIT bersifat OPSIONAL.
     *
     * Kalau kosong:
     * password lama tetap digunakan.
     *
     * Kalau diisi:
     * password akan diganti.
     */
    if (
      form.password &&
      form.password.length < 8
    ) {
      newErrors.password =
        'Password minimal 8 karakter'
    }

    if (!form.status) {
      newErrors.status =
        'Status wajib dipilih'
    }

    setErrors(newErrors)

    return Object.keys(newErrors).length === 0
  }


  // =====================================================
  // SUBMIT
  // =====================================================

  const handleSubmit = async (e) => {

    e.preventDefault()

    if (!user?.id) {
      setApiError(
        'ID user tidak ditemukan.',
      )
      return
    }

    if (!validate()) {
      return
    }

    try {

      setLoading(true)
      setApiError('')

      const payload = {
        username:
          form.username.trim(),

        email:
          form.email.trim().toLowerCase(),

        full_name:
          form.full_name.trim(),

        phone:
          form.phone.trim() || null,

        role_id:
          form.role_id
            ? Number(form.role_id)
            : null,

        organization_id:
          form.organization_id
            ? Number(form.organization_id)
            : null,

        unit_id:
          form.unit_id
            ? Number(form.unit_id)
            : null,

        status:
          form.status,
      }


      /*
       * Password hanya dikirim
       * apabila user mengisinya.
       */
      if (form.password) {
        payload.password =
          form.password
      }


      const response = await fetch(
        `${API_URL}/api/users/${user.id}`,
        {
          method: 'PUT',

          headers: {
            'Content-Type':
              'application/json',
          },

          body:
            JSON.stringify(payload),
        },
      )


      const result =
        await response.json()


      if (
        !response.ok ||
        !result.success
      ) {

        throw new Error(
          result.message ||
          'Gagal memperbarui user',
        )
      }


      if (
        typeof onSuccess ===
        'function'
      ) {
        await onSuccess(
          result.data,
        )
      }

      onClose()

    } catch (error) {

      console.error(
        'UPDATE USER ERROR:',
        error,
      )

      setApiError(
        error?.message ||
        'Terjadi kesalahan saat memperbarui user.',
      )

    } finally {

      setLoading(false)
    }
  }


  // =====================================================
  // RENDER
  // =====================================================

  return (
    <CModal
      alignment="center"
      visible={show}
      onClose={
        loading
          ? undefined
          : onClose
      }
      backdrop="static"
      size="xl"
      scrollable
      portal
      className="user-form-modal"
    >

      {/* =================================================
          HEADER
      ================================================= */}

      <CModalHeader>

        <CModalTitle>

          <div className="d-flex align-items-center gap-3">

            <div
              className="d-flex align-items-center justify-content-center rounded-3"
              style={{
                width: '48px',
                height: '48px',
                background: '#e9e7ff',
                color: '#4f46e5',
              }}
            >

              <CIcon
                icon={cilUser}
                size="xl"
              />

            </div>


            <div>

              <div className="fw-bold">
                Edit User
              </div>

              <div className="text-muted small fw-normal">
                Perbarui informasi dan hak akses pengguna SIMITI
              </div>

            </div>

          </div>

        </CModalTitle>

      </CModalHeader>


      {/* =================================================
          FORM
      ================================================= */}

      <form onSubmit={handleSubmit}>

        <CModalBody>

          {/* =================================================
              ERROR
          ================================================= */}

          {apiError && (

            <div className="alert alert-danger border-0 rounded-3">

              <div className="d-flex align-items-start gap-2">

                <CIcon
                  icon={cilInfo}
                  className="mt-1"
                />

                <div>

                  <div className="fw-semibold">
                    Gagal memperbarui user
                  </div>

                  <div className="small">
                    {apiError}
                  </div>

                </div>

              </div>

            </div>

          )}


          {/* =================================================
              USER INFORMATION
          ================================================= */}

          <div className="mb-4">

            <div className="d-flex align-items-center gap-2 mb-3">

              <div className="text-primary">
                <CIcon
                  icon={cilUser}
                />
              </div>

              <div>

                <div className="fw-bold">
                  Informasi Pengguna
                </div>

                <div className="text-muted small">
                  Identitas dasar pengguna sistem
                </div>

              </div>

            </div>


            <div className="row g-3">

              <div className="col-md-6">

                <label className="form-label fw-semibold">
                  Nama Lengkap
                  <span className="text-danger">
                    {' '}*
                  </span>
                </label>

                <input
                  type="text"
                  name="full_name"
                  className={`form-control ${
                    errors.full_name
                      ? 'is-invalid'
                      : ''
                  }`}
                  placeholder="Contoh: Administrator SIMITI"
                  value={form.full_name}
                  onChange={handleChange}
                  disabled={loading}
                />

                {errors.full_name && (
                  <div className="invalid-feedback">
                    {errors.full_name}
                  </div>
                )}

              </div>


              <div className="col-md-6">

                <label className="form-label fw-semibold">
                  Nomor Telepon
                </label>

                <input
                  type="tel"
                  name="phone"
                  className="form-control"
                  placeholder="08xxxxxxxxxx"
                  value={form.phone}
                  onChange={handleChange}
                  disabled={loading}
                />

              </div>

            </div>

          </div>


          <hr />


          {/* =================================================
              CREDENTIAL
          ================================================= */}

          <div className="mb-4">

            <div className="d-flex align-items-center gap-2 mb-3">

              <div className="text-primary">

                <CIcon
                  icon={cilShieldAlt}
                />

              </div>

              <div>

                <div className="fw-bold">
                  Kredensial Akun
                </div>

                <div className="text-muted small">
                  Informasi autentikasi pengguna
                </div>

              </div>

            </div>


            <div className="row g-3">

              {/* USERNAME */}

              <div className="col-md-6">

                <label className="form-label fw-semibold">
                  Username
                  <span className="text-danger">
                    {' '}*
                  </span>
                </label>

                <div className="input-group">

                  <span className="input-group-text">
                    <CIcon
                      icon={cilUser}
                    />
                  </span>

                  <input
                    type="text"
                    name="username"
                    className={`form-control ${
                      errors.username
                        ? 'is-invalid'
                        : ''
                    }`}
                    placeholder="username"
                    value={form.username}
                    onChange={handleChange}
                    autoComplete="off"
                    disabled={loading}
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
                  <span className="text-danger">
                    {' '}*
                  </span>
                </label>

                <div className="input-group">

                  <span className="input-group-text">

                    <CIcon
                      icon={
                        cilEnvelopeClosed
                      }
                    />

                  </span>

                  <input
                    type="email"
                    name="email"
                    className={`form-control ${
                      errors.email
                        ? 'is-invalid'
                        : ''
                    }`}
                    placeholder="nama@domain.go.id"
                    value={form.email}
                    onChange={handleChange}
                    autoComplete="off"
                    disabled={loading}
                  />

                </div>

                {errors.email && (
                  <div className="text-danger small mt-1">
                    {errors.email}
                  </div>
                )}

              </div>


              {/* PASSWORD */}

              <div className="col-md-8">

                <label className="form-label fw-semibold">

                  Password Baru

                  <span className="text-muted fw-normal ms-2">
                    (opsional)
                  </span>

                </label>

                <div className="input-group">

                  <span className="input-group-text">

                    <CIcon
                      icon={
                        cilLockLocked
                      }
                    />

                  </span>

                  <input
                    type={
                      showPassword
                        ? 'text'
                        : 'password'
                    }
                    name="password"
                    className={`form-control ${
                      errors.password
                        ? 'is-invalid'
                        : ''
                    }`}
                    placeholder="Kosongkan jika tidak ingin mengubah password"
                    value={form.password}
                    onChange={handleChange}
                    autoComplete="new-password"
                    disabled={loading}
                  />

                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() =>
                      setShowPassword(
                        (prev) =>
                          !prev,
                      )
                    }
                    disabled={loading}
                  >
                    {showPassword
                      ? 'Sembunyikan'
                      : 'Lihat'}
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

                  <span className="text-danger">
                    {' '}*
                  </span>

                </label>

                <select
                  name="status"
                  className="form-select"
                  value={form.status}
                  onChange={handleChange}
                  disabled={loading}
                >

                  <option value="active">
                    Active
                  </option>

                  <option value="inactive">
                    Inactive
                  </option>

                  <option value="blocked">
                    Blocked
                  </option>

                </select>

              </div>

            </div>

          </div>


          <hr />


          {/* =================================================
              ACCESS
          ================================================= */}

          <div>

            <div className="d-flex align-items-center gap-2 mb-3">

              <div className="text-primary">

                <CIcon
                  icon={cilSitemap}
                />

              </div>

              <div>

                <div className="fw-bold">
                  Hak Akses & Organisasi
                </div>

                <div className="text-muted small">
                  Pengaturan struktur dan akses pengguna
                </div>

              </div>

            </div>


            <div className="row g-3">

              {/* ROLE */}

              <div className="col-md-4">

                <label className="form-label fw-semibold">
                  Role
                </label>

                <select
                  name="role_id"
                  className="form-select"
                  value={form.role_id}
                  onChange={handleChange}
                  disabled={loading}
                >

                  <option value="">
                    Pilih Role
                  </option>

                  <option value="1">
                    Administrator
                  </option>

                  <option value="2">
                    Operator
                  </option>

                  <option value="3">
                    Viewer
                  </option>

                </select>

              </div>


              {/* ORGANIZATION */}

              <div className="col-md-4">

                <label className="form-label fw-semibold">
                  Organisasi
                </label>

                <select
                  name="organization_id"
                  className="form-select"
                  value={
                    form.organization_id
                  }
                  onChange={handleChange}
                  disabled={loading}
                >

                  <option value="">
                    Pilih Organisasi
                  </option>

                  <option value="1">
                    SIMITI
                  </option>

                </select>

              </div>


              {/* UNIT */}

              <div className="col-md-4">

                <label className="form-label fw-semibold">
                  Unit Kerja
                </label>

                <select
                  name="unit_id"
                  className="form-select"
                  value={form.unit_id}
                  onChange={handleChange}
                  disabled={loading}
                >

                  <option value="">
                    Pilih Unit Kerja
                  </option>

                  <option value="1">
                    Administrator
                  </option>

                </select>

              </div>

            </div>

          </div>


          {/* =================================================
              INFO
          ================================================= */}

          <div className="alert alert-primary border-0 rounded-3 mt-4 mb-0">

            <div className="d-flex gap-2">

              <CIcon
                icon={cilInfo}
                className="mt-1"
              />

              <div className="small">

                <strong>Informasi:</strong>{' '}

                Perubahan data user akan
                langsung diterapkan setelah
                tombol{' '}

                <strong>
                  Simpan Perubahan
                </strong>{' '}

                diproses.

              </div>

            </div>

          </div>

        </CModalBody>


        {/* =================================================
            FOOTER
        ================================================= */}

        <CModalFooter>

          <CButton
            color="light"
            className="border"
            onClick={onClose}
            disabled={loading}
            type="button"
          >

            <CIcon
              icon={cilX}
              className="me-2"
            />

            Batal

          </CButton>


          <CButton
            color="primary"
            type="submit"
            disabled={loading}
          >

            {loading ? (

              <>
                <CSpinner
                  size="sm"
                  className="me-2"
                />

                Menyimpan...

              </>

            ) : (

              <>
                <CIcon
                  icon={
                    cilCheckCircle
                  }
                  className="me-2"
                />

                Simpan Perubahan

              </>

            )}

          </CButton>

        </CModalFooter>

      </form>

    </CModal>
  )
}


export default UserEditModal