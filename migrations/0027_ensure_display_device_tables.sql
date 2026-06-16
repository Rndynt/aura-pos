-- Ensure runtime device tables exist for drifted development databases.
-- Some dev DBs have migration hashes marked as applied while the physical
-- CFD/KDS device tables are missing. Keep this migration idempotent.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS cfd_devices (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_name text,
  api_key text,
  status varchar(50) NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz
);

ALTER TABLE cfd_devices
  ADD COLUMN IF NOT EXISTS device_name text,
  ADD COLUMN IF NOT EXISTS api_key text,
  ADD COLUMN IF NOT EXISTS status varchar(50) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

CREATE INDEX IF NOT EXISTS cfd_devices_tenant_status_idx
  ON cfd_devices (tenant_id, status);

CREATE INDEX IF NOT EXISTS cfd_devices_active_api_key_idx
  ON cfd_devices (api_key)
  WHERE status = 'active' AND api_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS kds_devices (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  outlet_id varchar REFERENCES outlets(id) ON DELETE SET NULL,
  device_name text,
  api_key text,
  activation_code varchar(6),
  activation_expires_at timestamptz,
  activation_attempts integer NOT NULL DEFAULT 0,
  activation_locked_until timestamptz,
  status varchar(30) NOT NULL DEFAULT 'pending',
  activated_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE kds_devices
  ADD COLUMN IF NOT EXISTS outlet_id varchar REFERENCES outlets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS device_name text,
  ADD COLUMN IF NOT EXISTS api_key text,
  ADD COLUMN IF NOT EXISTS activation_code varchar(6),
  ADD COLUMN IF NOT EXISTS activation_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS activation_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS activation_locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS status varchar(30) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS kds_devices_tenant_idx
  ON kds_devices (tenant_id);

CREATE INDEX IF NOT EXISTS kds_devices_outlet_idx
  ON kds_devices (outlet_id);

CREATE INDEX IF NOT EXISTS kds_devices_active_api_key_idx
  ON kds_devices (api_key)
  WHERE status = 'active' AND api_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS kds_devices_pending_activation_code_idx
  ON kds_devices (activation_code)
  WHERE status = 'pending' AND activation_code IS NOT NULL;
