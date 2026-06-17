CREATE TABLE "business_types" (
	"code" varchar(50) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
INSERT INTO "business_types" ("code", "name", "description", "is_active") VALUES
	('CAFE_RESTAURANT', 'Café & Restaurant', 'Food & beverage service business', true),
	('RETAIL_MINIMARKET', 'Retail & Minimarket', 'Retail and convenience store', true),
	('LAUNDRY', 'Laundry Service', 'Laundry and dry cleaning service', true),
	('SERVICE_APPOINTMENT', 'Service & Appointment', 'Appointment-based service business', true),
	('DIGITAL_PPOB', 'Digital & PPOB', 'Digital products and bill payment', true);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "business_type" varchar(50) DEFAULT 'CAFE_RESTAURANT' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_business_type_business_types_code_fk" FOREIGN KEY ("business_type") REFERENCES "public"."business_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "settings" json;--> statement-breakpoint
CREATE TABLE "tenant_module_configs" (
	"tenant_id" varchar PRIMARY KEY NOT NULL,
	"enable_table_management" boolean DEFAULT false NOT NULL,
	"enable_kitchen_ticket" boolean DEFAULT false NOT NULL,
	"enable_loyalty" boolean DEFAULT false NOT NULL,
	"enable_delivery" boolean DEFAULT false NOT NULL,
	"enable_inventory" boolean DEFAULT false NOT NULL,
	"enable_appointments" boolean DEFAULT false NOT NULL,
	"enable_multi_location" boolean DEFAULT false NOT NULL,
	"config" json,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_module_configs" ADD CONSTRAINT "tenant_module_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
