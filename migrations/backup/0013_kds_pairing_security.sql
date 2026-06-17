-- Harden KDS pairing credentials and brute-force controls.
-- Existing kds_devices is managed outside the Drizzle schema in this repo.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE kds_devices
  ADD COLUMN IF NOT EXISTS activation_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS activation_locked_until timestamptz;

-- api_key stores only a SHA-256 hash of the raw KDS key. The raw key is only
-- returned once from /api/kds/verify-code and is never persisted in plaintext.
UPDATE kds_devices
SET api_key = encode(digest(api_key, 'sha256'), 'hex')
WHERE api_key IS NOT NULL
  AND length(api_key) <> 64;

CREATE INDEX IF NOT EXISTS kds_devices_active_api_key_idx
  ON kds_devices (api_key)
  WHERE status = 'active' AND api_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS kds_devices_pending_activation_code_idx
  ON kds_devices (activation_code)
  WHERE status = 'pending' AND activation_code IS NOT NULL;
