// apps/medusa/src/api/admin/shopping/inquiries/stats/route.ts
// GET /admin/shopping/inquiries/stats — Count breakdown by status.
//
// Requires Medusa admin authentication (session cookie or JWT Bearer token).
//
// Used by the admin dashboard widget. Medusa's file router matches the
// literal "stats" segment before the [id] wildcard sibling, so this route
// never shadows POST /admin/shopping/inquiries/:id.
//
// Reference: ai/todo.md Phase 3 §3.9 / Phase 5

import type {
	AuthenticatedMedusaRequest,
	MedusaResponse,
} from "@medusajs/framework";
import { SHOPPING_INQUIRY_MODULE } from "../../../../../modules/shopping-inquiry";
import { InquiryStatus } from "../../../../../modules/shopping-inquiry/models/inquiry";
import type InquiryModuleService from "../../../../../modules/shopping-inquiry/service/inquiry-module.service";

// ---------------------------------------------------------------------------
// GET /admin/shopping/inquiries/stats
// Returns count breakdown by status for the admin dashboard widget.
// ---------------------------------------------------------------------------

export async function GET(
	req: AuthenticatedMedusaRequest,
	res: MedusaResponse,
): Promise<void> {
	const inquiryService = req.scope.resolve<InquiryModuleService>(
		SHOPPING_INQUIRY_MODULE,
	);

	const counts = await inquiryService.getStatusCounts();

	// Total excludes spam (spam is a separate concern for the owner)
	const activeTotal =
		(counts[InquiryStatus.NEW] ?? 0) +
		(counts[InquiryStatus.REVIEWED] ?? 0) +
		(counts[InquiryStatus.QUOTED] ?? 0) +
		(counts[InquiryStatus.CLOSED] ?? 0);

	res.status(200).json({
		counts,
		active_total: activeTotal,
		spam_count: counts[InquiryStatus.SPAM] ?? 0,
	});
}
