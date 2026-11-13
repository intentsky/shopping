// apps/medusa/src/modules/shopping-inquiry/migrations/Migration20260804000000.ts
// Initial schema for the shopping-inquiry module.
//
// Hand-written to match what `medusa db:generate shoppingInquiryModuleService`
// emits for the Inquiry model (models/inquiry.ts) on Medusa 2.8 / MikroORM 6.4:
//   - text columns for all fields (quantity is intentionally a raw string)
//   - check constraints for the enum fields (status, contact_method,
//     quantity_unit, locale)
//   - created_at / updated_at / deleted_at + the partial deleted_at index
//     that model.define() adds to every entity
//
// All statements are idempotent (IF NOT EXISTS) so re-running is safe.

import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260804000000 extends Migration {
	override async up(): Promise<void> {
		this.addSql(
			`create table if not exists "inquiry" ("id" text not null, "ref" text not null, "status" text check ("status" in ('new', 'reviewed', 'quoted', 'closed', 'spam')) not null default 'new', "customer_name" text not null, "customer_email" text null, "whatsapp" text null, "contact_method" text check ("contact_method" in ('email', 'whatsapp')) not null default 'email', "product_desc" text not null, "material" text null, "quantity" text null, "quantity_unit" text check ("quantity_unit" in ('pcs', 'kg', 'sets')) not null default 'pcs', "country" text null, "special" text null, "product_slug" text null, "locale" text check ("locale" in ('en', 'de', 'es', 'it', 'zh')) not null default 'en', "ip_hash" text null, "admin_notes" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "inquiry_pkey" primary key ("id"));`,
		);

		this.addSql(
			`CREATE INDEX IF NOT EXISTS "IDX_inquiry_deleted_at" ON "inquiry" (deleted_at) WHERE deleted_at IS NULL;`,
		);
	}

	override async down(): Promise<void> {
		this.addSql(`drop index if exists "IDX_inquiry_deleted_at";`);

		this.addSql(`drop table if exists "inquiry" cascade;`);
	}
}
