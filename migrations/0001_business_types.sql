-- Global business type catalog.
-- Referenced by tenants.business_type (FK).
CREATE TABLE "business_types" (
  "code"        varchar(50)  PRIMARY KEY NOT NULL,
  "name"        text         NOT NULL,
  "description" text,
  "is_active"   boolean      NOT NULL DEFAULT true
);
