// apps/medusa/src/api/admin/shopping/inquiries/route.ts
// GET /admin/shopping/inquiries — Admin endpoint to list and manage inquiry submissions.
//
// Requires Medusa admin authentication (session cookie or JWT Bearer token).
//
// Query parameters:
//   status     — Filter by status: new | reviewed | quoted | closed | spam
//                Can be repeated for multiple values: ?status=new&status=reviewed
//   limit      — Max results per page (default 50, max 200)
//   offset     — Pagination offset (default 0)
//   q          — Search query (matches customer_name, customer_email, ref, product_desc,
//                whatsapp). Applied over a bounded window (see SEARCH_WINDOW) *before*
//                pagination, so results are stable across pages.
//
// Sibling routes:
//   POST /admin/shopping/inquiries/:id  — [id]/route.ts — update status/admin_notes
//   GET  /admin/shopping/inquiries/stats — stats/route.ts — count breakdown by status
//
// Reference: ai/todo.md Phase 3 §3.9 / Phase 5

import type {
	AuthenticatedMedusaRequest,
	MedusaResponse,
} from "@medusajs/framework";
import { MedusaError } from "@medusajs/framework/utils";
import { z } from "zod";
import { SHOPPING_INQUIRY_MODULE } from "../../../../modules/shopping-inquiry";
import {
	InquiryStatus,
	type InquiryStatusValue,
} from "../../../../modules/shopping-inquiry/models/inquiry";
import type InquiryModuleService from "../../../../modules/shopping-inquiry/service/inquiry-module.service";

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const ListQuerySchema = z.object({
	status: z
		.union([z.string(), z.array(z.string())])
		.transform((v) => (Array.isArray(v) ? v : [v]))
		.pipe(
			z.array(
				z.enum([
					InquiryStatus.NEW,
					InquiryStatus.REVIEWED,
					InquiryStatus.QUOTED,
					InquiryStatus.CLOSED,
					InquiryStatus.SPAM,
				]),
			),
		)
		.optional(),

	limit: z
		.string()
		.transform(Number)
		.pipe(z.number().min(1).max(200))
		.optional()
		.default("50"),

	offset: z
		.string()
		.transform(Number)
		.pipe(z.number().min(0))
		.optional()
		.default("0"),

	q: z.string().max(200).optional(),
});

// ---------------------------------------------------------------------------
// Search window
// ---------------------------------------------------------------------------

// `q` has no database-level index yet, so it is matched in memory. We pull a
// bounded window of the most recent matching rows, filter it, and paginate the
// filtered result — never the whole table. At MVP inquiry volumes this covers
// covers every realistic search; beyond that this should become a Postgres
// full-text index.
const SEARCH_WINDOW = 500;

/**
 * Case-insensitive match over the customer-facing fields of an inquiry.
 */
function matchesQuery(
	inquiry: {
		customer_name: string;
		customer_email: string | null;
		ref: string;
		product_desc: string;
		whatsapp: string | null;
	},
	query: string,
): boolean {
	return (
		inquiry.customer_name.toLowerCase().includes(query) ||
		(inquiry.customer_email?.toLowerCase().includes(query) ?? false) ||
		inquiry.ref.toLowerCase().includes(query) ||
		inquiry.product_desc.toLowerCase().includes(query) ||
		(inquiry.whatsapp?.includes(query) ?? false)
	);
}

// ---------------------------------------------------------------------------
// GET /admin/shopping/inquiries
// Lists inquiries with optional filtering and pagination.
// ---------------------------------------------------------------------------

export async function GET(
	req: AuthenticatedMedusaRequest,
	res: MedusaResponse,
): Promise<void> {
	// Parse + validate query params
	const queryParse = ListQuerySchema.safeParse(req.query);

	if (!queryParse.success) {
		const firstError = queryParse.error.errors[0];
		throw new MedusaError(
			MedusaError.Types.INVALID_DATA,
			firstError?.message ?? "Invalid query parameters",
		);
	}

	const { status, limit, offset, q } = queryParse.data;

	const inquiryService = req.scope.resolve<InquiryModuleService>(
		SHOPPING_INQUIRY_MODULE,
	);

	const statuses = status as InquiryStatusValue[] | undefined;

	let inquiries: Awaited<ReturnType<typeof inquiryService.listRecent>>;
	let total: number;

	if (q && q.length > 0) {
		// Search: pull a bounded window, filter it, then paginate the matches.
		const query = q.toLowerCase();

		const candidates =
			statuses && statuses.length > 0
				? await inquiryService.listByStatus(statuses, {
						limit: SEARCH_WINDOW,
						offset: 0,
					})
				: await inquiryService.listRecent({
						limit: SEARCH_WINDOW,
						offset: 0,
					});

		const filtered = candidates.filter((i) => matchesQuery(i, query));

		total = filtered.length;
		inquiries = filtered.slice(offset, offset + limit);
	} else if (statuses && statuses.length > 0) {
		// Filter by specific status values
		inquiries = await inquiryService.listByStatus(statuses, { limit, offset });
		total = await inquiryService.countByStatus(statuses);
	} else {
		// Default: all non-spam, newest first
		inquiries = await inquiryService.listRecent({ limit, offset });
		total = await inquiryService.countRecent();
	}

	res.status(200).json({
		inquiries,
		count: inquiries.length,
		total,
		limit,
		offset,
	});
}
