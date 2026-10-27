-- SIMITI External API Management - initial schema
-- Run only against the DEMO database after verifying DB_HOST / DB_PORT / DB_NAME.
-- This script creates new, namespaced tables and does not alter existing SIMITI tables.

BEGIN;

CREATE TABLE IF NOT EXISTS external_api_applications (
  id BIGSERIAL PRIMARY KEY,
  application_name VARCHAR(150) NOT NULL,
  organization_name VARCHAR(200) NOT NULL,
  contact_name VARCHAR(150) NOT NULL,
  email VARCHAR(254) NOT NULL,
  purpose TEXT NOT NULL,
  website TEXT,
  environment VARCHAR(20) NOT NULL DEFAULT 'development'
    CONSTRAINT external_api_applications_environment_check
    CHECK (environment IN ('development', 'staging', 'production')),
  callback_url TEXT,
  requested_scopes TEXT[] NOT NULL,
  approved_scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by VARCHAR(254),
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_api_applications_status_requested
  ON external_api_applications (status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_api_applications_email
  ON external_api_applications (lower(email));

CREATE TABLE IF NOT EXISTS external_api_credentials (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES external_api_applications(id) ON DELETE RESTRICT,
  key_prefix VARCHAR(32) NOT NULL,
  key_hash CHAR(64) NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_by VARCHAR(254),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_external_api_credentials_application
  ON external_api_credentials (application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_api_credentials_active_expiry
  ON external_api_credentials (status, expires_at);

CREATE TABLE IF NOT EXISTS external_api_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('admin', 'partner', 'system')),
  actor_id VARCHAR(254),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(80) NOT NULL,
  resource_id VARCHAR(100),
  ip_address VARCHAR(100),
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_api_audit_created
  ON external_api_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_api_audit_resource
  ON external_api_audit_logs (resource_type, resource_id, created_at DESC);

COMMIT;
