// apps/medusa/src/modules/shopping-inquiry/events.ts
// Events published by Intentsky Shopping's inquiry module.
//
// The name and the payload live here — next to the model they describe —
// rather than in the API route that happens to emit them, so the emitter
// (src/workflows/steps/emit-inquiry-created-event.ts) and the consumer
// (src/subscribers/inquiry-created.ts) share one definition and cannot drift.

import type {
	ContactMethodValue,
	QuantityUnitValue,
	SupportedLocaleValue,
} from "./models/inquiry";

// ---------------------------------------------------------------------------
// shopping.inquiry.created
// ---------------------------------------------------------------------------

export const INQUIRY_CREATED_EVENT = "shopping.inquiry.created" as const;

/**
 * Payload of the `shopping.inquiry.created` event.
 *
 * Deliberately a subset of the stored record: enough to render both
 * notification emails without a second database read, and nothing an event
 * consumer has no business seeing (no ip_hash, no admin_notes).
 */
export interface InquiryCreatedPayload {
	id: string;
	ref: string;
	customer_name: string;
	customer_email: string | null;
	whatsapp: string | null;
	contact_method: ContactMethodValue;
	product_desc: string;
	quantity: string | null;
	quantity_unit: QuantityUnitValue;
	country: string | null;
	locale: SupportedLocaleValue;
	product_slug: string | null;
}
