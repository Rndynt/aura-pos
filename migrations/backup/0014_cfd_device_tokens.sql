-- Add CFD read/write device/session tokens.
-- CFD tokens are hashed API keys scoped only to customer-facing display sync.

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

CREATE INDEX IF NOT EXISTS cfd_devices_tenant_status_idx
  ON cfd_devices (tenant_id, status);

CREATE INDEX IF NOT EXISTS cfd_devices_active_api_key_idx
  ON cfd_devices (api_key)
  WHERE status = 'active' AND api_key IS NOT NULL;
