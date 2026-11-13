// apps/medusa/src/modules/shopping-inquiry/service/inquiry-module.service.ts
// InquiryModuleService — CRUD service for the Inquiry entity.
//
// Part of Intentsky Shopping. Tenant-neutral: the only tenant-specific value
// here is the ref prefix, read from SHOPPING_REF_PREFIX.
//
// Extends MedusaService (auto-generates list, retrieve, create, update, delete
// methods from the Inquiry model via the Medusa v2 module system).
//
// Custom methods added on top:
//   - createWithRef()     — create + auto-generate human-readable ref
//   - listByStatus()      — filter by lifecycle status
//   - markAsReviewed()    — transition new → reviewed
//   - markAsQuoted()      — transition reviewed → quoted
//   - markAsSpam()        — mark as spam (hides from default list)
//   - countByIpHash()     — rate-limit check: how many from this IP in 24h?
//   - countByStatus()     — SQL COUNT(*) for a set of statuses (no row hydration)
//   - countRecent()       — SQL COUNT(*) of non-spam inquiries
//
// Reference: ai/todo.md Phase 3 §3.9 / Phase 5

import { MedusaService } from "@medusajs/framework/utils";
import Inquiry, {
	type ContactMethodValue,
	InquiryStatus,
	type InquiryStatusValue,
	type QuantityUnitValue,
	type SupportedLocaleValue,
} from "../models/inquiry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateInquiryInput {
	/**
	 * Lifecycle status to create the record with. Defaults to `new`.
	 *
	 * Set explicitly by the create workflow when a submission tripped the
	 * honeypot, so a spam row is written as spam in a single insert rather than
	 * being created as `new` and immediately updated.
	 */
	status?: InquiryStatusValue;
	customer_name: string;
	customer_email?: string | null;
	whatsapp?: string | null;
	contact_method: ContactMethodValue;
	product_desc: string;
	material?: string | null;
	quantity?: string | null;
	quantity_unit?: QuantityUnitValue;
	country?: string | null;
	special?: string | null;
	product_slug?: string | null;
	locale?: SupportedLocaleValue;
	ip_hash?: string | null;
}

export interface UpdateInquiryInput {
	status?: InquiryStatusValue;
	admin_notes?: string | null;
}

export interface InquiryRecord {
	id: string;
	ref: string;
	status: InquiryStatusValue;
	customer_name: string;
	customer_email: string | null;
	whatsapp: string | null;
	contact_method: ContactMethodValue;
	product_desc: string;
	material: string | null;
	quantity: string | null;
	quantity_unit: QuantityUnitValue;
	country: string | null;
	special: string | null;
	product_slug: string | null;
	locale: SupportedLocaleValue;
	ip_hash: string | null;
	admin_notes: string | null;
	created_at: Date;
	updated_at: Date;
}

// ---------------------------------------------------------------------------
// Ref generator
// ---------------------------------------------------------------------------

// Refs are customer-facing (confirmation emails, the admin list, the Intentsky
// shopping console), so the prefix is the store's, not the service's: set
// SHOPPING_REF_PREFIX (a store that issued refs under another prefix keeps it
// — changing the prefix never rewrites refs already issued).
const REF_PREFIX = (process.env.SHOPPING_REF_PREFIX ?? "INQ")
	.toUpperCase()
	.replace(/[^A-Z0-9]/g, "");

/**
 * Generates a human-readable inquiry reference.
 * Format: {PREFIX}-{unix_seconds}-{4_random_uppercase_chars}
 * Example: ZLF-1705312345-AB3X
 *
 * The three-segment shape is load-bearing: the storefront's offline fallback
 * ref (see apps/zlfasteners.com/src/lib/quote-intake.ts) is deliberately a
 * different shape, so a ref that never reached this service is recognisable
 * on sight rather than only by a failed lookup.
 *
 * Not guaranteed globally unique (collision probability in a 24h window is
 * ~1 in 1.7M), but unique enough for B2B inquiry volumes.
 */
function generateRef(): string {
	const ts = Math.floor(Date.now() / 1000);
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1 (ambiguous)
	let rand = "";
	for (let i = 0; i < 4; i++) {
		rand += chars[Math.floor(Math.random() * chars.length)];
	}
	return `${REF_PREFIX}-${ts}-${rand}`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class InquiryModuleService extends MedusaService({
	Inquiry,
}) {
	// -------------------------------------------------------------------------
	// createWithRef
	// -------------------------------------------------------------------------

	/**
	 * Creates a new Inquiry with an auto-generated ref.
	 *
	 * This is the primary create method — use this instead of the auto-generated
	 * `createInquiry()` to ensure every inquiry has a ref.
	 */
	async createWithRef(input: CreateInquiryInput): Promise<InquiryRecord> {
		const ref = generateRef();

		const inquiry = await this.createInquiries({
			...input,
			ref,
			status: input.status ?? InquiryStatus.NEW,
		});

		// MedusaService returns an array from bulk creates, single from single create
		return (Array.isArray(inquiry) ? inquiry[0] : inquiry) as InquiryRecord;
	}

	// -------------------------------------------------------------------------
	// listByStatus
	// -------------------------------------------------------------------------

	/**
	 * Returns inquiries filtered by status, newest first.
	 * Excludes spam by default unless explicitly requested.
	 */
	async listByStatus(
		status: InquiryStatusValue | InquiryStatusValue[],
		options: { limit?: number; offset?: number } = {},
	): Promise<InquiryRecord[]> {
		const statuses = Array.isArray(status) ? status : [status];
		const { limit = 50, offset = 0 } = options;

		const result = await this.listInquiries(
			{ status: statuses },
			{
				take: limit,
				skip: offset,
				order: { created_at: "DESC" },
			},
		);

		return result as InquiryRecord[];
	}

	// -------------------------------------------------------------------------
	// listRecent
	// -------------------------------------------------------------------------

	/**
	 * Returns recent non-spam inquiries, newest first.
	 * Used by the admin panel default view.
	 */
	async listRecent(
		options: { limit?: number; offset?: number } = {},
	): Promise<InquiryRecord[]> {
		const { limit = 50, offset = 0 } = options;

		const result = await this.listInquiries(
			{
				// Exclude spam from default listing
				status: [
					InquiryStatus.NEW,
					InquiryStatus.REVIEWED,
					InquiryStatus.QUOTED,
					InquiryStatus.CLOSED,
				],
			},
			{
				take: limit,
				skip: offset,
				order: { created_at: "DESC" },
			},
		);

		return result as InquiryRecord[];
	}

	// -------------------------------------------------------------------------
	// Status transition helpers
	// -------------------------------------------------------------------------

	/**
	 * Marks an inquiry as reviewed (new → reviewed).
	 */
	async markAsReviewed(
		id: string,
		adminNotes?: string,
	): Promise<InquiryRecord> {
		return this.applyUpdate(id, {
			status: InquiryStatus.REVIEWED,
			...(adminNotes !== undefined ? { admin_notes: adminNotes } : {}),
		});
	}

	/**
	 * Marks an inquiry as quoted (reviewed → quoted).
	 * Called after the owner has sent a price quotation to the customer.
	 */
	async markAsQuoted(id: string, adminNotes?: string): Promise<InquiryRecord> {
		return this.applyUpdate(id, {
			status: InquiryStatus.QUOTED,
			...(adminNotes !== undefined ? { admin_notes: adminNotes } : {}),
		});
	}

	/**
	 * Marks an inquiry as closed (any status → closed).
	 */
	async markAsClosed(id: string, adminNotes?: string): Promise<InquiryRecord> {
		return this.applyUpdate(id, {
			status: InquiryStatus.CLOSED,
			...(adminNotes !== undefined ? { admin_notes: adminNotes } : {}),
		});
	}

	/**
	 * Marks an inquiry as spam.
	 * Spam inquiries are excluded from default admin listings but not deleted
	 * (preserved for pattern analysis and potential unspam).
	 */
	async markAsSpam(id: string): Promise<InquiryRecord> {
		return this.applyUpdate(id, { status: InquiryStatus.SPAM });
	}

	/**
	 * Updates one inquiry by id.
	 *
	 * MedusaService generates `updateInquiries(data, sharedContext)` — a SINGLE
	 * data argument carrying the primary key, not the `(selector, data)` pair
	 * that reads naturally. Calling it with two arguments silently updates
	 * nothing (the second is taken as the shared context) and still returns the
	 * untouched row, so the caller sees a success. Every write goes through
	 * here so that trap exists in exactly one place.
	 */
	private async applyUpdate(
		id: string,
		changes: UpdateInquiryInput,
	): Promise<InquiryRecord> {
		const updated = await this.updateInquiries({ id, ...changes });
		return (Array.isArray(updated) ? updated[0] : updated) as InquiryRecord;
	}

	/**
	 * Applies an arbitrary status / notes change to one inquiry.
	 * Public counterpart of `applyUpdate` for callers that already hold a
	 * validated partial (the admin update workflow step).
	 */
	async updateOne(
		id: string,
		changes: UpdateInquiryInput,
	): Promise<InquiryRecord> {
		return this.applyUpdate(id, changes);
	}

	// -------------------------------------------------------------------------
	// Rate limiting
	// -------------------------------------------------------------------------

	/**
	 * Counts the number of inquiry submissions from a given IP hash
	 * within the last 24 hours.
	 *
	 * Used by the POST /store/shopping/inquiry endpoint to enforce the
	 * rate limit of 3 inquiries per IP per 24h.
	 *
	 * @param ipHash  SHA-256 hash of the submitter's IP address.
	 * @returns       Number of submissions in the last 24 hours.
	 */
	async countByIpHash(ipHash: string): Promise<number> {
		const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

		// MedusaService list with a date filter
		const result = await this.listInquiries(
			{
				ip_hash: ipHash,
				// Filter: created_at >= since
				// Medusa v2 supports $gte operators in filters
				created_at: { $gte: since },
			},
			{
				// We only need the count — fetch minimally
				take: 10,
				select: ["id"],
			},
		);

		return result.length;
	}

	// -------------------------------------------------------------------------
	// Counting
	// -------------------------------------------------------------------------

	/**
	 * Counts inquiries matching the given status value(s).
	 *
	 * Uses the auto-generated `listAndCountInquiries` with `take: 0` so the
	 * database performs a real `COUNT(*)` and no rows are hydrated. Never
	 * re-list the table just to measure it.
	 */
	async countByStatus(
		status: InquiryStatusValue | InquiryStatusValue[],
	): Promise<number> {
		const statuses = Array.isArray(status) ? status : [status];

		const [, count] = await this.listAndCountInquiries(
			{ status: statuses },
			{ take: 0 },
		);

		return count;
	}

	/**
	 * Counts non-spam inquiries — the total that pairs with `listRecent()`.
	 */
	async countRecent(): Promise<number> {
		return this.countByStatus([
			InquiryStatus.NEW,
			InquiryStatus.REVIEWED,
			InquiryStatus.QUOTED,
			InquiryStatus.CLOSED,
		]);
	}

	// -------------------------------------------------------------------------
	// Retrieve by ref
	// -------------------------------------------------------------------------

	/**
	 * Retrieves an inquiry by its human-readable ref (e.g. "ZLF-1705312345-AB3X").
	 * Returns null if not found.
	 */
	async retrieveByRef(ref: string): Promise<InquiryRecord | null> {
		const result = await this.listInquiries({ ref }, { take: 1 });
		return result.length > 0 ? (result[0] as InquiryRecord) : null;
	}

	// -------------------------------------------------------------------------
	// Stats (for admin dashboard)
	// -------------------------------------------------------------------------

	/**
	 * Returns a count breakdown by status.
	 */
	async getStatusCounts(): Promise<Record<InquiryStatusValue, number>> {
		const statuses = Object.values(InquiryStatus) as InquiryStatusValue[];
		const counts = {} as Record<InquiryStatusValue, number>;

		await Promise.all(
			statuses.map(async (status) => {
				counts[status] = await this.countByStatus(status);
			}),
		);

		return counts;
	}
}

export default InquiryModuleService;
