# Dev Baseline Drift Patch Report

## Problem

Replit log showed:

```txt
DB migrations done — applied: 0, skipped: 13, errors: 0
relation "cfd_devices" does not exist
```

This means the new clean baseline migration filenames were already recorded in `drizzle.__drizzle_migrations`, but physical runtime tables were missing. This is migration tracking drift on a development database.

## Patch Summary

No new migration file was added.

Patched files:

```txt
migrations/0009_kitchen_kds.sql
migrations/0010_cfd_sync.sql
apps/api/src/migrations/migrationRunner.ts
```

## Details

### Device ID type alignment

Runtime code creates KDS/CFD device ids with `nanoid()`, not UUID values. Therefore the baseline device table primary keys must be string-compatible.

Changed:

```txt
kds_devices.id: uuid -> varchar DEFAULT gen_random_uuid()::text
cfd_devices.id: uuid -> varchar DEFAULT gen_random_uuid()::text
```

This keeps DB-generated ids possible while allowing runtime-provided nanoid ids.

### Rerunnable device domain baseline

`0009_kitchen_kds.sql` and `0010_cfd_sync.sql` are now idempotent for drift recovery:

```txt
CREATE TABLE IF NOT EXISTS
CREATE INDEX IF NOT EXISTS
```

This is not a new `ensure_*` migration. It makes the owning domain baseline file rerunnable if its marker is removed.

### Migration runner drift recovery

`migrationRunner.ts` now checks specific device-domain baseline migrations:

```txt
0009_kitchen_kds.sql -> kitchen_tickets, kds_devices
0010_cfd_sync.sql    -> terminals, sync_batches, sync_events, server_sync_conflicts, cfd_devices
```

If the migration hash is marked applied but one of its required tables is missing, the runner deletes only that migration marker from `drizzle.__drizzle_migrations`. Then the idempotent owning baseline file runs again and creates the missing tables.

No database schema is dropped. No production reset logic is added.

## Expected next Replit restart log

If `cfd_devices` is missing while `0010_cfd_sync.sql` is marked applied:

```txt
Detected baseline drift for 0010_cfd_sync.sql; missing tables: cfd_devices. Migration marker removed so the idempotent baseline file can run again.
✓ Applied migration: 0010_cfd_sync.sql
DB migrations done — applied: 1, skipped: 12, errors: 0
```

If `kds_devices` is missing too:

```txt
Detected baseline drift for 0009_kitchen_kds.sql; missing tables: kds_devices. Migration marker removed so the idempotent baseline file can run again.
✓ Applied migration: 0009_kitchen_kds.sql
```

## Validation Needed

After pulling this patch and restarting Replit, verify these logs are gone:

```txt
relation "cfd_devices" does not exist
relation "kds_devices" does not exist
```

Then smoke:

```txt
POST /api/cfd/session-token
GET /api/kds/devices
POST /api/kds/generate-code
```
