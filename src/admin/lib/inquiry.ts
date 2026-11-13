// apps/medusa/src/admin/lib/inquiry.ts
// Shared types + pure helpers for the Intentsky Shopping inquiries admin UI.
//
// Kept JSX-free on purpose so both the list page and the detail drawer can
// import it without pulling in React.
//
// The types here mirror `InquiryRecord` from the shopping-inquiry module
// service. They are re-declared rather than imported because admin code is
// bundled for the browser by Vite — importing server modules would drag the
// whole Medusa runtime into the dashboard bundle. Timestamps arrive as ISO
// strings over the wire, not `Date` instances.
//
// Reference: ai/todo.md Phase 5

import { tenant } from "./tenant";

// ---------------------------------------------------------------------------
// Enums (mirrors modules/shopping-inquiry/models/inquiry.ts)
// ---------------------------------------------------------------------------

export type InquiryStatus = "new" | "reviewed" | "quoted" | "closed" | "spam";

export type ContactMethod = "email" | "whatsapp";

export type QuantityUnit = "pcs" | "kg" | "sets";

export type SupportedLocale = "en" | "de" | "es" | "it" | "zh";

/** Every status, in lifecycle order. Drives the filter row and the Select. */
export const INQUIRY_STATUSES: readonly InquiryStatus[] = [
	"new",
	"reviewed",
	"quoted",
	"closed",
	"spam",
];

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

/** One inquiry as returned by GET/PATCH /admin/shopping/inquiries. */
export interface AdminInquiry {
	id: string;
	ref: string;
	status: InquiryStatus;
	customer_name: string;
	customer_email: string | null;
	whatsapp: string | null;
	contact_method: ContactMethod;
	product_desc: string;
	material: string | null;
	quantity: string | null;
	quantity_unit: QuantityUnit;
	country: string | null;
	special: string | null;
	product_slug: string | null;
	locale: SupportedLocale;
	ip_hash: string | null;
	admin_notes: string | null;
	created_at: string;
	updated_at: string;
}

/** GET /admin/shopping/inquiries */
export interface AdminInquiryListResponse {
	inquiries: AdminInquiry[];
	count: number;
	total: number;
	limit: number;
	offset: number;
}

/** GET /admin/shopping/inquiries/stats */
export interface AdminInquiryStatsResponse {
	counts: Record<InquiryStatus, number>;
	active_total: number;
	spam_count: number;
}

/** PATCH /admin/shopping/inquiries/:id */
export interface AdminInquiryUpdateResponse {
	inquiry: AdminInquiry;
}

// ---------------------------------------------------------------------------
// Status presentation
// ---------------------------------------------------------------------------

export type StatusBadgeColor =
	| "grey"
	| "green"
	| "blue"
	| "orange"
	| "red"
	| "purple";

/** Label + `<StatusBadge>` / `<Badge>` colour for every lifecycle status. */
export const STATUS_BADGE: Record<
	InquiryStatus,
	{ label: string; color: StatusBadgeColor }
> = {
	new: { label: "New", color: "orange" },
	reviewed: { label: "Reviewed", color: "blue" },
	quoted: { label: "Quoted", color: "purple" },
	closed: { label: "Closed", color: "green" },
	spam: { label: "Spam", color: "red" },
};

/**
 * Safe lookup — falls back to a neutral grey badge if the backend ever grows a
 * status the dashboard bundle does not know about yet.
 */
export function statusBadge(status: string): {
	label: string;
	color: StatusBadgeColor;
} {
	return (
		STATUS_BADGE[status as InquiryStatus] ?? { label: status, color: "grey" }
	);
}

// ---------------------------------------------------------------------------
// List filters
// ---------------------------------------------------------------------------

/** The list page's filter states — every status, plus the unfiltered view. */
export type StatusFilter = InquiryStatus | "all";

/**
 * Validates a `?status=` URL param. Anything unrecognised (or absent) falls
 * back to the unfiltered view rather than rendering a permanently empty table.
 */
export function parseStatusFilter(value: string | null): StatusFilter {
	return value !== null && INQUIRY_STATUSES.includes(value as InquiryStatus)
		? (value as InquiryStatus)
		: "all";
}

/**
 * Router-relative path to the inquiries list, optionally pre-filtered.
 *
 * The dashboard router is mounted with basename "/app", so this is deliberately
 * *not* prefixed with it — the resulting browser URL is /app/a/shopping-inquiries.
 */
export function inquiriesPath(status: StatusFilter = "all"): string {
	return status === "all"
		? "/a/shopping-inquiries"
		: `/a/shopping-inquiries?status=${status}`;
}

// ---------------------------------------------------------------------------
// Reply links
// ---------------------------------------------------------------------------

/** Minimum digits for a plausible international number (country code + line). */
const MIN_WA_DIGITS = 8;

/**
 * Builds a free `wa.me` deep link — no WhatsApp Business account required.
 *
 * Everything that is not a digit is stripped (leading "+", spaces, dashes,
 * parentheses, dots). Returns `null` when too few digits remain to be a real
 * phone number, so callers can hide the action instead of opening a dead link.
 */
export function waLink(number: string, text: string): string | null {
	const digits = number.replace(/\D/g, "");

	if (digits.length < MIN_WA_DIGITS) {
		return null;
	}

	return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Builds a `mailto:` link with a prefilled subject and body. */
export function mailtoLink(
	email: string,
	subject: string,
	body: string,
): string {
	const params = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
	return `mailto:${email.trim()}?${params}`;
}

// ---------------------------------------------------------------------------
// Reply template
// ---------------------------------------------------------------------------

// Reply openers are written per locale but stay brand-neutral in code — the
// tenant's display name is injected so a second store needs no new templates.
const REPLY_TEMPLATES: Record<
	SupportedLocale,
	(name: string, ref: string, brand: string) => string
> = {
	en: (name, ref, brand) =>
		`Hello ${name}, this is ${brand} about your inquiry ${ref}. I have a quotation for you — happy to go through the details here.`,
	de: (name, ref, brand) =>
		`Hallo ${name}, hier ist ${brand} zu Ihrer Anfrage ${ref}. Ich habe ein Angebot für Sie — gerne gehen wir die Details hier durch.`,
	es: (name, ref, brand) =>
		`Hola ${name}, le escribe ${brand} en relación con su consulta ${ref}. Tengo una cotización para usted — con gusto revisamos los detalles por aquí.`,
	it: (name, ref, brand) =>
		`Salve ${name}, le scrive ${brand} in merito alla sua richiesta ${ref}. Ho un preventivo per lei — volentieri vediamo insieme i dettagli qui.`,
	zh: (name, ref, brand) =>
		`${name} 您好，这里是 ${brand}，关于您的询价 ${ref}。我已为您准备好报价，欢迎在这里直接沟通细节。`,
};

/**
 * A short reply opener in the language the visitor used when submitting.
 * Falls back to English for unknown locales.
 */
export function replyTemplate(inq: AdminInquiry): string {
	const build = REPLY_TEMPLATES[inq.locale] ?? REPLY_TEMPLATES.en;
	return build(inq.customer_name, inq.ref, tenant.brand);
}

/** Subject line used for every email reply. */
export function replySubject(inq: AdminInquiry): string {
	return `Your inquiry ${inq.ref} — ${tenant.brand}`;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

// Fixed locale so the admin table reads the same regardless of the browser's
// language settings.
const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
	dateStyle: "medium",
	timeStyle: "short",
});

/** "4 Aug 2026, 14:32" — compact and locale-independent. */
export function formatDate(iso: string): string {
	const date = new Date(iso);

	if (Number.isNaN(date.getTime())) {
		return "—";
	}

	return DATE_FORMATTER.format(date);
}

/** Truncates to `max` characters, appending an ellipsis when cut. */
export function truncate(value: string, max: number): string {
	const trimmed = value.trim();
	return trimmed.length > max ? `${trimmed.slice(0, max).trimEnd()}…` : trimmed;
}

/** Quantity + unit, or an em dash when the customer left it blank. */
export function formatQuantity(inq: AdminInquiry): string {
	if (!inq.quantity) {
		return "—";
	}
	return `${inq.quantity} ${inq.quantity_unit}`;
}

/** Public storefront URL for the product an inquiry originated from. */
export function productUrl(slug: string): string {
	return `${tenant.storefrontUrl}/product/${slug}`;
}

/** Opens a reply link in a new tab, without handing it a window opener. */
export function openExternal(href: string): void {
	window.open(href, "_blank", "noopener,noreferrer");
}
