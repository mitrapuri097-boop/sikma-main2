import React, {
  useEffect,
  useMemo,
  useState,
} from 'react'

import UserFormModal from './UserFormModal'
import UserEditModal from './UserEditModal'

import {
  CAlert,
  CButton,
  CCard,
  CCardBody,
  CSpinner,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react'

import CIcon from '@coreui/icons-react'

import {
  cilCheckCircle,
  cilCloudDownload,
  cilFilter,
  cilPencil,
  cilPeople,
  cilPlus,
  cilReload,
  cilShieldAlt,
  cilTrash,
  cilUser,
  cilWarning,
} from '@coreui/icons'

import './user.css'

interface User {
  id?: string | number
  username?: string
  email?: string
  full_name?: string
  phone?: string
  role_id?: string | number
  role_name?: string
  role?: string
  status?: string
  avatar?: string | null
  last_login?: string | null
  [key: string]: unknown
}

type ApiResponse =
  | User[]
  | {
      data?: User[]
      users?: User[]
      rows?: User[]
    }

const API_URL =
  import.meta.env.VITE_API_URL || 'https://demo.datasolusindo.com'

const Index = () => {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showUserForm, setShowUserForm] = useState(false)
  const [showEditUser, setShowEditUser] =
  useState(false)

const [selectedUser, setSelectedUser] =
  useState(null)

  // =====================================================
  // LOAD USERS
  // =====================================================

  const loadUsers = async () => {
    try {
      setLoading(true)
      setError('')

      const response = await fetch(`${API_URL}/api/users`)

      if (!response.ok) {
        throw new Error('Gagal mengambil data user dari server.')
      }

      const result = (await response.json()) as ApiResponse

      const data = Array.isArray(result)
        ? result
        : result.data || result.users || result.rows || []

      setUsers(data)
    } catch (err: unknown) {
      console.error('LOAD USERS ERROR:', err)

      setError(
        err instanceof Error
          ? err.message
          : 'Terjadi kesalahan saat mengambil data user.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  // =====================================================
  // FILTER
  // =====================================================

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    if (!keyword) {
      return users
    }

    return users.filter((user: User) => {
      return (
        String(user?.username || '')
          .toLowerCase()
          .includes(keyword) ||
        String(user?.email || '')
          .toLowerCase()
          .includes(keyword) ||
        String(user?.full_name || '')
          .toLowerCase()
          .includes(keyword) ||
        String(user?.role_name || '')
          .toLowerCase()
          .includes(keyword) ||
        String(user?.role || '')
          .toLowerCase()
          .includes(keyword)
      )
    })
  }, [users, search])

  // =====================================================
  // STATISTICS
  // =====================================================

  const totalUsers = users.length

  const activeUsers = users.filter(
    (user) => user?.status === 'active',
  ).length

  const inactiveUsers = users.filter(
    (user) => user?.status === 'inactive',
  ).length

  const blockedUsers = users.filter(
    (user) => user?.status === 'blocked',
  ).length

  // =====================================================
  // ROLE
  // =====================================================

  const getRoleName = (user: User) => {
    return (
      user?.role_name ||
      user?.role ||
      (user?.role_id
        ? `Role #${user.role_id}`
        : '-')
    )
  }

  // =====================================================
  // DATE
  // =====================================================

  const formatDate = (date: string | null | undefined) => {
    if (!date) {
      return 'Belum pernah login'
    }

    const parsedDate = new Date(date)

    if (Number.isNaN(parsedDate.getTime())) {
      return '-'
    }

    return parsedDate.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  // =====================================================
  // AVATAR
  // =====================================================

  const getInitial = (user: User) => {
    const name =
      user?.full_name ||
      user?.username ||
      'U'

    return name.charAt(0).toUpperCase()
  }

  // =====================================================
  // STATUS
  // =====================================================

  const getStatusBadge = (status: string | undefined) => {
    switch (status) {
      case 'active':
        return (
          <span className="status-badge status-active">
            <span className="status-dot" />
            Active
          </span>
        )

      case 'inactive':
        return (
          <span className="status-badge status-inactive">
            <span className="status-dot" />
            Inactive
          </span>
        )

      case 'blocked':
        return (
          <span className="status-badge status-blocked">
            <span className="status-dot" />
            Blocked
          </span>
        )

      default:
        return (
          <span className="status-badge status-inactive">
            <span className="status-dot" />
            {status || 'Unknown'}
          </span>
        )
    }
  }

  // =====================================================
  // OPEN ADD USER MODAL
  // =====================================================

  const handleOpenUserForm = () => {
    console.log('OPEN USER MODAL')
    setShowUserForm(true)
  }
// =====================================================
// OPEN EDIT USER
// =====================================================

const handleOpenEditUser = (user: User) => {

  console.log(
    'OPEN EDIT USER:',
    user,
  )

  setSelectedUser(user)
  setShowEditUser(true)
}
// =====================================================
// CLOSE EDIT USER
// =====================================================

const handleCloseEditUser = () => {

  if (loading) {
    return
  }

  setShowEditUser(false)
  setSelectedUser(null)
}
  // =====================================================
  // CLOSE ADD USER MODAL
  // =====================================================

  const handleCloseUserForm = () => {
    if (!loading) {
      setShowUserForm(false)
    }
  }

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div className="user-management-page">

      {/* =====================================================
          PAGE HEADER
      ===================================================== */}

      <div className="enterprise-page-header">

        <div className="page-header-left">

          <div className="page-header-icon">
            <CIcon icon={cilPeople} />
          </div>

          <div>
            <div className="page-eyebrow">
              SYSTEM ADMINISTRATION
            </div>

            <h2 className="page-title">
              User Management
            </h2>

            <p className="page-description">
              Kelola pengguna, role, hak akses,
              dan status akun SIMITI.
            </p>
          </div>

        </div>

        <div className="page-header-actions">

          <CButton
            color="light"
            className="enterprise-btn-secondary"
            onClick={loadUsers}
            disabled={loading}
            type="button"
          >
            {loading ? (
              <CSpinner size="sm" />
            ) : (
              <CIcon icon={cilReload} />
            )}

            <span>Refresh</span>
          </CButton>

          <CButton
            color="primary"
            className="enterprise-btn-primary"
            onClick={handleOpenUserForm}
            type="button"
          >
            <CIcon icon={cilPlus} />

            <span>
              Tambah User
            </span>
          </CButton>

        </div>

      </div>

      {/* =====================================================
          ERROR
      ===================================================== */}

      {error && (
        <CAlert
          color="danger"
          className="enterprise-alert"
        >
          <div className="d-flex align-items-start gap-3">

            <CIcon
              icon={cilWarning}
              size="xl"
            />

            <div>
              <div className="fw-semibold">
                Gagal memuat data user
              </div>

              <div className="small mt-1">
                {error}
              </div>
            </div>

          </div>
        </CAlert>
      )}

      {/* =====================================================
          KPI CARDS
      ===================================================== */}

      <div className="enterprise-kpi-grid">

        <CCard className="enterprise-kpi-card">
          <CCardBody>
            <div className="kpi-content">

              <div>
                <div className="kpi-label">
                  TOTAL USER
                </div>

                <div className="kpi-value">
                  {totalUsers}
                </div>

                <div className="kpi-meta">
                  Seluruh akun terdaftar
                </div>
              </div>

              <div className="kpi-icon kpi-blue">
                <CIcon icon={cilPeople} />
              </div>

            </div>
          </CCardBody>
        </CCard>

        <CCard className="enterprise-kpi-card">
          <CCardBody>
            <div className="kpi-content">

              <div>
                <div className="kpi-label">
                  ACTIVE USER
                </div>

                <div className="kpi-value">
                  {activeUsers}
                </div>

                <div className="kpi-meta kpi-success-text">
                  Akun aktif
                </div>
              </div>

              <div className="kpi-icon kpi-green">
                <CIcon icon={cilCheckCircle} />
              </div>

            </div>
          </CCardBody>
        </CCard>

        <CCard className="enterprise-kpi-card">
          <CCardBody>
            <div className="kpi-content">

              <div>
                <div className="kpi-label">
                  INACTIVE USER
                </div>

                <div className="kpi-value">
                  {inactiveUsers}
                </div>

                <div className="kpi-meta">
                  Akun tidak aktif
                </div>
              </div>

              <div className="kpi-icon kpi-orange">
                <CIcon icon={cilShieldAlt} />
              </div>

            </div>
          </CCardBody>
        </CCard>

        <CCard className="enterprise-kpi-card">
          <CCardBody>
            <div className="kpi-content">

              <div>
                <div className="kpi-label">
                  BLOCKED USER
                </div>

                <div className="kpi-value">
                  {blockedUsers}
                </div>

                <div className="kpi-meta kpi-danger-text">
                  Akun diblokir
                </div>
              </div>

              <div className="kpi-icon kpi-red">
                <CIcon icon={cilWarning} />
              </div>

            </div>
          </CCardBody>
        </CCard>

      </div>

      {/* =====================================================
          USER TABLE
      ===================================================== */}

      <CCard className="enterprise-table-card">

        <div className="enterprise-table-header">

          <div>
            <div className="table-title-row">

              <h5 className="table-title">
                Daftar Pengguna
              </h5>

              <span className="table-count">
                {filteredUsers.length}
              </span>

            </div>

            <p className="table-subtitle">
              Daftar pengguna dan status akses
              aplikasi SIMITI.
            </p>
          </div>

          <div className="table-toolbar">

            <div className="table-search">
              <div className="input-group">

                <span className="input-group-text">
                  <CIcon icon={cilUser} />
                </span>

                <input
                  type="text"
                  className="form-control"
                  placeholder="Cari user..."
                  value={search}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setSearch(e.target.value)
                  }
                />

              </div>
            </div>

            <CButton
              color="light"
              className="toolbar-icon-btn"
              title="Filter"
              type="button"
            >
              <CIcon icon={cilFilter} />
            </CButton>

            <CButton
              color="light"
              className="toolbar-icon-btn"
              title="Export"
              type="button"
            >
              <CIcon icon={cilCloudDownload} />
            </CButton>

          </div>

        </div>

        <CCardBody className="p-0">

          <div className="table-responsive">

            <CTable
              hover
              align="middle"
              className="enterprise-user-table mb-0"
            >

              <CTableHead>
                <CTableRow>

                  <CTableHeaderCell className="col-no">
                    #
                  </CTableHeaderCell>

                  <CTableHeaderCell>
                    Pengguna
                  </CTableHeaderCell>

                  <CTableHeaderCell>
                    Username
                  </CTableHeaderCell>

                  <CTableHeaderCell>
                    Email
                  </CTableHeaderCell>

                  <CTableHeaderCell>
                    Role 
                  </CTableHeaderCell>

                  <CTableHeaderCell>
                    Status
                  </CTableHeaderCell>

                  <CTableHeaderCell>
                    Last Login
                  </CTableHeaderCell>

                  <CTableHeaderCell className="text-end">
                    Aksi
                  </CTableHeaderCell>

                </CTableRow>
              </CTableHead>

              <CTableBody>

                {loading && (
                  <CTableRow>
                    <CTableDataCell
                      colSpan={8}
                      className="enterprise-empty-cell"
                    >
                      <CSpinner />

                      <div className="mt-3 fw-semibold">
                        Memuat data pengguna...
                      </div>

                      <div className="text-body-secondary small mt-1">
                        Menghubungkan ke server SIMITI
                      </div>
                    </CTableDataCell>
                  </CTableRow>
                )}

                {!loading &&
                  filteredUsers.length === 0 && (
                    <CTableRow>

                      <CTableDataCell
                        colSpan={8}
                        className="enterprise-empty-cell"
                      >

                        <div className="empty-icon">
                          <CIcon icon={cilUser} />
                        </div>

                        <div className="empty-title">
                          Data pengguna tidak ditemukan
                        </div>

                        <div className="empty-description">
                          {search
                            ? 'Tidak ada pengguna yang sesuai dengan pencarian.'
                            : 'Belum terdapat pengguna yang terdaftar.'}
                        </div>

                        {!search && (
                          <CButton
                            color="primary"
                            className="mt-3"
                            onClick={handleOpenUserForm}
                            type="button"
                          >
                            <CIcon
                              icon={cilPlus}
                              className="me-2"
                            />

                            Tambah User
                          </CButton>
                        )}

                      </CTableDataCell>

                    </CTableRow>
                  )}

                {!loading &&
                  filteredUsers.map((user, index) => (

                    <CTableRow
                      key={user.id || index}
                    >

                      <CTableDataCell>
                        <span className="row-number">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                      </CTableDataCell>

                      <CTableDataCell>

                        <div className="enterprise-user-profile">

                          <div className="enterprise-avatar">

                            {user.avatar ? (
                              <img
                                src={user.avatar}
                                alt={
                                  user.full_name ||
                                  user.username ||
                                  'User'
                                }
                              />
                            ) : (
                              getInitial(user)
                            )}

                          </div>

                          <div className="user-info">

                            <div className="enterprise-user-name">
                              {user.full_name ||
                                user.username ||
                                '-'}
                            </div>

                            <div className="enterprise-user-phone">
                              {user.phone ||
                                'Nomor telepon belum diisi'}
                            </div>

                          </div>

                        </div>

                      </CTableDataCell>

                      <CTableDataCell>
                        <span className="enterprise-username">
                          @{user.username || '-'}
                        </span>
                      </CTableDataCell>

                      <CTableDataCell>
                        <span className="enterprise-email">
                          {user.email || '-'}
                        </span>
                      </CTableDataCell>

                      <CTableDataCell>
                        <span className="enterprise-role-badge">
                          {getRoleName(user)}
                        </span>
                      </CTableDataCell>

                      <CTableDataCell>
                        {getStatusBadge(user.status)}
                      </CTableDataCell>

                      <CTableDataCell>
                        <span className="enterprise-last-login">
                          {formatDate(user.last_login)}
                        </span>
                      </CTableDataCell>

                      <CTableDataCell>

                        <div className="enterprise-actions">

<CButton
  color="light"
  size="sm"
  className="enterprise-action edit"
  title="Edit User"
  type="button"
  onClick={() =>
    handleOpenEditUser(user)
  }
>
  <CIcon icon={cilPencil} />
</CButton>

                          <CButton
                            color="light"
                            size="sm"
                            className="enterprise-action delete"
                            title="Hapus User"
                            type="button"
                          >
                            <CIcon icon={cilTrash} />
                          </CButton>

                        </div>

                      </CTableDataCell>

                    </CTableRow>

                  ))}

              </CTableBody>

            </CTable>

          </div>

        </CCardBody>

      </CCard>

      {/* =====================================================
          USER FORM MODAL
      ===================================================== */}

<UserFormModal
  show={showUserForm}
  onClose={handleCloseUserForm}
  onSuccess={async () => {
    await loadUsers()
    setShowUserForm(false)
  }}
/>

<UserEditModal
  show={showEditUser}
  user={selectedUser}
  onClose={handleCloseEditUser}
  onSuccess={async () => {
    await loadUsers()
    handleCloseEditUser()
  }}
/>

    </div>
  )
}

export default Index