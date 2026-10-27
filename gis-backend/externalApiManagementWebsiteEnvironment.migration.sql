-- SIMITI External API: website organisasi dan environment integrasi.
-- Pastikan koneksi mengarah ke database yang benar sebelum menjalankan file ini.
BEGIN;

ALTER TABLE external_api_applications
  ADD COLUMN IF NOT EXISTS website TEXT;

ALTER TABLE external_api_applications
  ADD COLUMN IF NOT EXISTS environment VARCHAR(20) NOT NULL DEFAULT 'development';

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'external_api_applications'::regclass
       AND conname = 'external_api_applications_environment_check'
  ) THEN
    ALTER TABLE external_api_applications
      ADD CONSTRAINT external_api_applications_environment_check
      CHECK (environment IN ('development', 'staging', 'production'));
  END IF;
END
$migration$;

COMMIT;