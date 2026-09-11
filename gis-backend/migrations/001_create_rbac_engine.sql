-- SIMITI RBAC ENGINE
-- PostgreSQL / simiti_local
-- Non-destructive: existing master_role rows are NOT deleted or renamed.

BEGIN;

-- 1) Upgrade master_role without touching existing rows.
ALTER TABLE master_role
  ADD COLUMN IF NOT EXISTS code VARCHAR(100),
  ADD COLUMN IF NOT EXISTS level INTEGER,
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;

-- Keep existing names usable, but only generate codes when missing.
UPDATE master_role
SET code = UPPER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(COALESCE(name, 'ROLE_' || id::text), '[^A-Za-z0-9]+', '_', 'g'),
    '^_+|_+$', '', 'g'
  )
)
WHERE code IS NULL OR BTRIM(code) = '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_master_role_code
  ON master_role(code);

-- 2) Permissions.
CREATE TABLE IF NOT EXISTS permissions (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(180) NOT NULL UNIQUE,
  module VARCHAR(100) NOT NULL,
  resource VARCHAR(100),
  action VARCHAR(100) NOT NULL,
  name VARCHAR(180) NOT NULL,
  description TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3) role_permissions.
-- role_id type is derived from master_role.id so this migration works
-- whether the existing PK is INTEGER, BIGINT, UUID, etc.
DO $$
DECLARE
  role_id_type TEXT;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod)
    INTO role_id_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = current_schema()
    AND c.relname = 'master_role'
    AND a.attname = 'id'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF role_id_type IS NULL THEN
    RAISE EXCEPTION 'master_role.id tidak ditemukan';
  END IF;

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS role_permissions (
      id BIGSERIAL PRIMARY KEY,
      role_id %s NOT NULL,
      permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      effect VARCHAR(10) NOT NULL DEFAULT 'allow'
        CHECK (effect IN ('allow', 'deny')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(role_id, permission_id)
    )
  $sql$, role_id_type);

  EXECUTE $sql$
    DO $inner$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_role_permissions_role'
      ) THEN
        ALTER TABLE role_permissions
          ADD CONSTRAINT fk_role_permissions_role
          FOREIGN KEY (role_id) REFERENCES master_role(id) ON DELETE CASCADE;
      END IF;
    END
    $inner$
  $sql$;
END $$;

CREATE INDEX IF NOT EXISTS idx_permissions_module
  ON permissions(module);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role
  ON role_permissions(role_id);

CREATE INDEX IF NOT EXISTS idx_role_permissions_permission
  ON role_permissions(permission_id);

-- 4) Permission seed.
INSERT INTO permissions(code,module,resource,action,name,description)
VALUES
('dashboard.view','dashboard','dashboard','view','Lihat Dashboard','Akses dashboard utama'),

('webgis.layer.view','webgis','layer','view','Lihat Layer','Melihat layer pada WebGIS'),
('webgis.layer.download','webgis','layer','download','Download Layer','Mengunduh data layer'),
('webgis.layer.create','webgis','layer','create','Tambah Layer','Membuat layer baru'),
('webgis.layer.update','webgis','layer','update','Ubah Layer','Mengubah metadata/data layer'),
('webgis.layer.delete','webgis','layer','delete','Hapus Layer','Menghapus layer'),
('webgis.layer.publish','webgis','layer','publish','Publish Layer','Mempublikasikan layer'),

('kerawanan.map.view','kerawanan','map','view','Lihat Peta Kerawanan','Melihat peta kerawanan'),
('kerawanan.analysis.view','kerawanan','analysis','view','Lihat Analisis Kerawanan','Melihat hasil analisis'),
('kerawanan.analysis.run','kerawanan','analysis','run','Jalankan Analisis Kerawanan','Menjalankan analisis'),
('kerawanan.layer.download','kerawanan','layer','download','Download Layer Kerawanan','Mengunduh layer kerawanan'),

('mitigasi.map.view','mitigasi','map','view','Lihat Peta Mitigasi','Melihat peta mitigasi'),
('mitigasi.recommendation.view','mitigasi','recommendation','view','Lihat Rekomendasi Mitigasi','Melihat rekomendasi'),
('mitigasi.recommendation.create','mitigasi','recommendation','create','Buat Rekomendasi Mitigasi','Membuat rekomendasi'),
('mitigasi.recommendation.approve','mitigasi','recommendation','approve','Setujui Rekomendasi Mitigasi','Menyetujui rekomendasi'),
('mitigasi.layer.download','mitigasi','layer','download','Download Layer Mitigasi','Mengunduh layer mitigasi'),

('adaptasi.map.view','adaptasi','map','view','Lihat Peta Adaptasi','Melihat peta adaptasi'),
('adaptasi.recommendation.view','adaptasi','recommendation','view','Lihat Rekomendasi Adaptasi','Melihat rekomendasi'),
('adaptasi.recommendation.create','adaptasi','recommendation','create','Buat Rekomendasi Adaptasi','Membuat rekomendasi'),
('adaptasi.recommendation.approve','adaptasi','recommendation','approve','Setujui Rekomendasi Adaptasi','Menyetujui rekomendasi'),
('adaptasi.layer.download','adaptasi','layer','download','Download Layer Adaptasi','Mengunduh layer adaptasi'),

('kejadian.view','kejadian','event','view','Lihat Kejadian','Melihat kejadian bencana'),
('kejadian.create','kejadian','event','create','Tambah Kejadian','Membuat kejadian'),
('kejadian.update','kejadian','event','update','Ubah Kejadian','Mengubah kejadian'),
('kejadian.delete','kejadian','event','delete','Hapus Kejadian','Menghapus kejadian'),
('kejadian.verify','kejadian','event','verify','Verifikasi Kejadian','Memverifikasi kejadian'),
('kejadian.publish','kejadian','event','publish','Publish Kejadian','Mempublikasikan kejadian'),
('kejadian.download','kejadian','event','download','Download Kejadian','Mengunduh data kejadian'),

('inventarisasi.view','inventarisasi','inventory','view','Lihat Inventarisasi','Melihat inventarisasi'),
('inventarisasi.create','inventarisasi','inventory','create','Tambah Inventarisasi','Membuat data inventarisasi'),
('inventarisasi.update','inventarisasi','inventory','update','Ubah Inventarisasi','Mengubah inventarisasi'),
('inventarisasi.delete','inventarisasi','inventory','delete','Hapus Inventarisasi','Menghapus inventarisasi'),
('inventarisasi.verify','inventarisasi','inventory','verify','Verifikasi Inventarisasi','Memverifikasi inventarisasi'),
('inventarisasi.publish','inventarisasi','inventory','publish','Publish Inventarisasi','Mempublikasikan inventarisasi'),
('inventarisasi.download','inventarisasi','inventory','download','Download Inventarisasi','Mengunduh inventarisasi'),

('ai.recommendation.view','ai','recommendation','view','Lihat AI Recommendation','Melihat rekomendasi AI'),
('ai.recommendation.create','ai','recommendation','create','Buat AI Recommendation','Membuat rekomendasi AI'),
('ai.recommendation.update','ai','recommendation','update','Ubah AI Recommendation','Mengubah rekomendasi AI'),

('data.publisher.view','data_publisher','publisher','view','Lihat Data Publisher','Melihat data publisher'),
('data.publisher.create','data_publisher','publisher','create','Tambah Data Publisher','Membuat data publisher'),
('data.publisher.update','data_publisher','publisher','update','Ubah Data Publisher','Mengubah data publisher'),
('data.publisher.delete','data_publisher','publisher','delete','Hapus Data Publisher','Menghapus data publisher'),
('data.publisher.verify','data_publisher','publisher','verify','Verifikasi Data Publisher','Memverifikasi data publisher'),
('data.publisher.approve','data_publisher','publisher','approve','Approve Data Publisher','Menyetujui data publisher'),
('data.publisher.publish','data_publisher','publisher','publish','Publish Data Publisher','Mempublikasikan data'),
('data.publisher.download','data_publisher','publisher','download','Download Data Publisher','Mengunduh data publisher'),

('monitoring.view','monitoring','monitoring','view','Lihat Monitoring','Melihat monitoring'),
('monitoring.download','monitoring','monitoring','download','Download Monitoring','Mengunduh data monitoring'),

('laporan.view','laporan','report','view','Lihat Laporan','Melihat laporan'),
('laporan.create','laporan','report','create','Buat Laporan','Membuat laporan'),
('laporan.update','laporan','report','update','Ubah Laporan','Mengubah laporan'),
('laporan.download','laporan','report','download','Download Laporan','Mengunduh laporan'),

('users.view','users','user','view','Lihat User','Melihat daftar user'),
('users.create','users','user','create','Tambah User','Membuat user'),
('users.update','users','user','update','Ubah User','Mengubah user'),
('users.suspend','users','user','suspend','Suspend User','Menangguhkan user'),
('users.deactivate','users','user','deactivate','Nonaktifkan User','Menonaktifkan user'),
('users.password.update','users','user','password_update','Ubah Password User','Mengubah password user'),

('roles.view','roles','role','view','Lihat Role','Melihat role'),
('roles.create','roles','role','create','Tambah Role','Membuat role'),
('roles.update','roles','role','update','Ubah Role','Mengubah role'),
('roles.assign','roles','role','assign','Assign Role','Menetapkan role ke user'),

('audit.view','audit','log','view','Lihat Audit Log','Melihat audit log'),

('security.view','security','security','view','Lihat Security','Melihat informasi security')
ON CONFLICT (code) DO UPDATE SET
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  status = 'active',
  updated_at = NOW();

-- 5) Add SIMITI system roles only when code does not already exist.
INSERT INTO master_role(code,name,description,level,is_system,status)
VALUES
('SIM_PUBLIC','Public / Guest','Akses publik terbatas',0,TRUE,'active'),
('SIM_DOWNLOADER','Public Registered / Downloader','Pengguna terdaftar untuk akses download yang diizinkan',1,TRUE,'active'),
('SIM_DATA_ADMIN','Admin Data','Pengelola data tanpa hak administrasi sistem penuh',2,TRUE,'active'),
('SIM_INSTANSI','User Instansi','Pengguna instansi dengan scope data tertentu',3,TRUE,'active'),
('SIM_INTERNAL','User Internal','Pengguna internal SIMITI',4,TRUE,'active'),
('SIM_ADMIN','Administrator','Administrator sistem SIMITI',5,TRUE,'active')
ON CONFLICT (code) DO NOTHING;

-- 6) Safe role-permission seed.
-- Existing roles are untouched. New system roles receive baseline permissions.
WITH role_map AS (
  SELECT id, code FROM master_role
  WHERE code IN ('SIM_PUBLIC','SIM_DOWNLOADER','SIM_DATA_ADMIN','SIM_INSTANSI','SIM_INTERNAL','SIM_ADMIN')
),
perm_map AS (
  SELECT id, code FROM permissions
),
seed AS (
  SELECT r.id AS role_id, p.id AS permission_id, 'allow'::varchar AS effect
  FROM role_map r
  CROSS JOIN perm_map p
  WHERE
    (r.code = 'SIM_PUBLIC' AND p.code IN (
      'dashboard.view',
      'webgis.layer.view',
      'kerawanan.map.view',
      'kerawanan.analysis.view',
      'mitigasi.map.view',
      'mitigasi.recommendation.view',
      'adaptasi.map.view',
      'adaptasi.recommendation.view',
      'kejadian.view',
      'inventarisasi.view',
      'monitoring.view',
      'laporan.view'
    ))
    OR
    (r.code = 'SIM_DOWNLOADER' AND (
      p.code IN ('dashboard.view','webgis.layer.view','webgis.layer.download',
                 'kerawanan.map.view','kerawanan.analysis.view','kerawanan.layer.download',
                 'mitigasi.map.view','mitigasi.recommendation.view','mitigasi.layer.download',
                 'adaptasi.map.view','adaptasi.recommendation.view','adaptasi.layer.download',
                 'kejadian.view','kejadian.download',
                 'inventarisasi.view','inventarisasi.download',
                 'monitoring.view','monitoring.download',
                 'laporan.view','laporan.download')
    ))
    OR
    (r.code = 'SIM_DATA_ADMIN' AND (
      p.module IN ('dashboard','webgis','data_publisher','kejadian','inventarisasi','monitoring','laporan')
      OR p.code IN ('kerawanan.map.view','kerawanan.analysis.view','mitigasi.map.view',
                    'mitigasi.recommendation.view','adaptasi.map.view','adaptasi.recommendation.view')
    ))
    OR
    (r.code = 'SIM_INSTANSI' AND (
      p.code IN ('dashboard.view','webgis.layer.view','webgis.layer.download',
                 'kejadian.view','kejadian.create','kejadian.update',
                 'inventarisasi.view','inventarisasi.create','inventarisasi.update',
                 'monitoring.view','monitoring.download','laporan.view','laporan.create',
                 'kerawanan.map.view','kerawanan.analysis.view',
                 'mitigasi.map.view','mitigasi.recommendation.view',
                 'adaptasi.map.view','adaptasi.recommendation.view')
    ))
    OR
    (r.code = 'SIM_INTERNAL' AND p.code NOT IN ('roles.create','roles.update'))
    OR
    (r.code = 'SIM_ADMIN')
)
INSERT INTO role_permissions(role_id, permission_id, effect)
SELECT role_id, permission_id, effect FROM seed
ON CONFLICT (role_id, permission_id) DO UPDATE SET effect = EXCLUDED.effect;

COMMIT;
