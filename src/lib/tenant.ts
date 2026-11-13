// src/lib/tenant.ts
// Store identity for the Intentsky Shopping inquiry service.
//
// The service itself is generic: `src/modules/shopping-inquiry`, the
// `/store/shopping/*` and `/admin/shopping/*` routes and the admin UI under
// /app/a/shopping-inquiries carry no store's branding. Everything that says
// *which* store runs it lives here, from environment variables (the Railway
// template asks for them at deploy). Unset values fall back to neutral text
// derived from the storefront URL, so nothing ever shows another brand.
//
// Server-side only. The admin dashboard is a browser bundle and cannot read
// process.env; its equivalent lives in src/admin/lib/tenant.ts.

function env(name: string, fallback: string): string {
	const value = process.env[name]?.trim();
	return value && value.length > 0 ? value : fallback;
}

/** Storefront origin without a trailing slash (empty when not configured). */
const storefrontUrl = env("SHOPPING_STOREFRONT_URL", "").replace(/\/+$/, "");

/** "shop.example.com" → "shop.example.com"; "" → "our shop". */
const storefrontHost = storefrontUrl.replace(/^https?:\/\//, "");
const defaultBrand = storefrontHost || "Shop";
const defaultHost = storefrontHost || "localhost";

export const tenant = {
	/** Full display name, used in customer-facing email copy. */
	brand: env("SHOPPING_BRAND_NAME", defaultBrand),

	/** Compact form, used in internal subject lines and the sender name. */
	brandShort: env("SHOPPING_BRAND_SHORT", env("SHOPPING_BRAND_NAME", defaultBrand)),

	/** Public storefront origin, e.g. "https://shop.example.com". */
	storefrontUrl,

	/** Bare host, e.g. "shop.example.com" — for inline copy inside emails. */
	storefrontHost: defaultHost,

	/** From address for transactional mail (must be a verified Resend domain). */
	fromEmail: env("EMAIL_FROM", `noreply@${defaultHost}`),

	/** Recipient of new-inquiry notifications; also used as reply-to. */
	ownerEmail: env("OWNER_EMAIL", ""),

	/** Registered entity name, shown in the email footer (optional). */
	legalName: env("SHOPPING_LEGAL_NAME", env("SHOPPING_BRAND_NAME", defaultBrand)),

	/** Postal address line, shown in the email footer (optional). */
	postalAddress: env("SHOPPING_POSTAL_ADDRESS", ""),
} as const;

/**
 * Some brands trade under a different name in a given language: set
 * SHOPPING_BRAND_NAME_<LOCALE>, e.g. SHOPPING_BRAND_NAME_ZH. Locales without
 * an entry fall back to `tenant.brand`.
 */
export function brandFor(locale: string): string {
	return env(`SHOPPING_BRAND_NAME_${locale.toUpperCase()}`, tenant.brand);
}

/** Absolute URL of the admin inquiries list, used in notification emails. */
export function adminInquiriesUrl(): string {
	const base = (
		process.env.MEDUSA_BACKEND_URL ??
		(process.env.RAILWAY_PUBLIC_DOMAIN
			? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
			: "http://localhost:9000")
	).replace(/\/+$/, "");
	return `${base}/app/a/shopping-inquiries`;
}
