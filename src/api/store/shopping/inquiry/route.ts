// apps/medusa/src/api/store/shopping/inquiry/route.ts
// POST /store/shopping/inquiry — Pre-sale inquiry submission endpoint.
//
// Part of Intentsky Shopping. Tenant-neutral: nothing here is specific to any
// one storefront (see src/lib/tenant.ts for the branding that is).
//
// This endpoint is intentionally unauthenticated — it is the primary
// lead-capture mechanism for visitors who have NOT yet signed up.
//
// The route only does transport work:
//   1. Parse + shape-validate the request body (Zod)
//   2. Derive the IP hash from the proxy headers
//   3. Run createShoppingInquiryWorkflow
//   4. Return { ref, status: "created" }
//
// Validation that needs a database read, spam classification, the write itself
// and the notification event all live in the workflow — see
// src/workflows/create-inquiry.ts.
//
// Security:
//   - IP address is hashed (SHA-256) before storage — raw IPs never persisted
//   - Honeypot field: any submission with `website` populated is silently
//     accepted (HTTP 201) but stored with status "spam"
//   - Rate limit: 3 per IP per 24h
//   - All string inputs are trimmed and length-capped before storage
//   - No HTML in inputs — stripped before storage
//
// Why the body is parsed here instead of via validateAndTransformBody:
// Medusa's zodValidator calls .strict() on plain object schemas, so an unknown
// field becomes a 400. The storefront's submit helper never throws on a non-2xx
// (apps/zlfasteners.com/src/lib/quote-intake.ts) — it logs and returns a local
// ref — so a strict 400 here would turn any future storefront-side field
// addition into silently lost sales. This path stays deliberately tolerant.
// The admin routes, whose only caller is our own dashboard, do use the
// middleware (see src/api/middlewares.ts).
//
// A deprecated alias of this route is served at /store/zlf/inquiry for
// storefronts that have not yet been redeployed.
//
// Reference: ai/todo.md Phase 5 §5.3

import { createHash } from "node:crypto";
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { MedusaError } from "@medusajs/framework/utils";
import { z } from "zod";
import {
	ContactMethod,
	QuantityUnit,
	SupportedLocale,
} from "../../../../modules/shopping-inquiry/models/inquiry";
import { createShoppingInquiryWorkflow } from "../../../../workflows/create-inquiry";

// ---------------------------------------------------------------------------
// Zod validation schema
// ---------------------------------------------------------------------------
//
// Shape only. Cross-field rules (contact_method must carry an address) are
// business validation and live in the workflow.

const InquirySchema = z.object({
	// ── Required fields ──────────────────────────────────────────────────────
	name: z
		.string()
		.min(1, "Name is required")
		.max(120, "Name too long")
		.transform((s) => s.trim()),

	description: z
		.string()
		.min(10, "Product description must be at least 10 characters")
		.max(5000, "Description too long (max 5000 chars)")
		.transform((s) => s.trim()),

	contact_method: z.enum([ContactMethod.EMAIL, ContactMethod.WHATSAPP]),

	// ── Conditional contact fields ────────────────────────────────────────────
	// At least one of email or whatsapp must be present — enforced by
	// validateInquirySubmissionStep.
	email: z
		.string()
		.email("Invalid email address")
		.max(254, "Email too long")
		.transform((s) => s.trim().toLowerCase())
		.optional()
		.nullable(),

	whatsapp: z
		.string()
		.min(7, "WhatsApp number too short")
		.max(20, "WhatsApp number too long")
		.regex(/^\+?[\d\s\-().]+$/, "Invalid WhatsApp number format")
		.transform((s) => s.trim())
		.optional()
		.nullable(),

	// ── Optional fields ───────────────────────────────────────────────────────
	material: z
		.string()
		.max(500, "Material description too long")
		.transform((s) => s.trim())
		.optional()
		.nullable(),

	quantity: z
		.string()
		.max(100, "Quantity value too long")
		.transform((s) => s.trim())
		.optional()
		.nullable(),

	quantity_unit: z
		.enum([QuantityUnit.PCS, QuantityUnit.KG, QuantityUnit.SETS])
		.optional()
		.default(QuantityUnit.PCS),

	country: z
		.string()
		.min(2)
		.max(2)
		.regex(/^[A-Z]{2}$/, "Must be an ISO 3166-1 alpha-2 country code")
		.optional()
		.nullable(),

	special: z
		.string()
		.max(2000, "Special requirements too long")
		.transform((s) => s.trim())
		.optional()
		.nullable(),

	product_slug: z
		.string()
		.max(200, "Product slug too long")
		.transform((s) => s.trim())
		.optional()
		.nullable(),

	locale: z
		.enum([
			SupportedLocale.EN,
			SupportedLocale.DE,
			SupportedLocale.ES,
			SupportedLocale.IT,
			SupportedLocale.ZH,
		])
		.optional()
		.default(SupportedLocale.EN),

	// ── Honeypot field ────────────────────────────────────────────────────────
	// This field MUST be absent or empty in legitimate submissions.
	// Bots that fill in all form fields will populate this and be silently marked
	// as spam.
	website: z.string().max(500).optional().nullable(),
});

// ---------------------------------------------------------------------------
// IP hash helper
// ---------------------------------------------------------------------------

/**
 * Returns a SHA-256 hash of the client IP address for rate limiting.
 * The hash is one-way — the raw IP is never stored.
 *
 * Falls back to "unknown" if no IP can be determined (e.g. no proxy headers
 * and no direct connection IP). This is intentional — we don't want to
 * accidentally block all users when IP detection fails.
 */
function hashIp(req: MedusaRequest): string {
	// Try the standard proxy headers in order of reliability
	const candidates = [
		(req.headers["cf-connecting-ip"] as string) ?? null, // Cloudflare
		(req.headers["x-real-ip"] as string) ?? null, // Nginx
		(req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? null,
		req.socket?.remoteAddress ?? null,
	];

	const ip = candidates.find((c) => c && c.length > 0) ?? "unknown";

	// Hash with a static salt to prevent rainbow table lookups
	// The salt means the hash can't be reversed even if someone knows the IP.
	const salt =
		process.env["IP_HASH_SALT"] ?? "shopping-inquiry-salt-change-in-prod";
	return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

// ---------------------------------------------------------------------------
// POST /store/shopping/inquiry
// ---------------------------------------------------------------------------

export async function POST(
	req: MedusaRequest,
	res: MedusaResponse,
): Promise<void> {
	const parseResult = InquirySchema.safeParse(req.body);

	if (!parseResult.success) {
		const firstError = parseResult.error.errors[0];
		throw new MedusaError(
			MedusaError.Types.INVALID_DATA,
			firstError?.message ?? "Invalid inquiry data",
		);
	}

	const data = parseResult.data;

	const { result: inquiry } = await createShoppingInquiryWorkflow(
		req.scope,
	).run({
		input: {
			name: data.name,
			description: data.description,
			contact_method: data.contact_method,
			email: data.email,
			whatsapp: data.whatsapp,
			material: data.material,
			quantity: data.quantity,
			quantity_unit: data.quantity_unit,
			country: data.country,
			special: data.special,
			product_slug: data.product_slug,
			locale: data.locale,
			website: data.website,
			ip_hash: hashIp(req),
		},
	});

	// Identical response for real and honeypot submissions — a bot must not be
	// able to tell that it was detected.
	res.status(201).json({
		ref: inquiry.ref,
		status: "created",
		message:
			"Thank you for your inquiry. Our team will contact you within 1 business day.",
	});
}

// ---------------------------------------------------------------------------
// OPTIONS — CORS preflight support
// ---------------------------------------------------------------------------

export async function OPTIONS(
	_req: MedusaRequest,
	res: MedusaResponse,
): Promise<void> {
	res.status(200).end();
}
