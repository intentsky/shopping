// apps/medusa/src/api/admin/shopping/inquiries/[id]/route.ts
// POST /admin/shopping/inquiries/:id — Update status or admin_notes for one
// inquiry.
//
// POST rather than PATCH: Medusa's API convention is GET / POST / DELETE only.
//
// Requires Medusa admin authentication (session cookie or JWT Bearer token).
//
// Body:
//   status      — Optional: new | reviewed | quoted | closed | spam
//   admin_notes — Optional: internal notes (max 5000 chars, null to clear)
//
// At least one of the two must be provided — enforced by updateInquiryStep,
// which also resolves the record and owns the rollback.
//
// Why the body is parsed here rather than with validateAndTransformBody:
// this app and @medusajs/framework resolve separate zod installs (3.25.x here,
// 3.22.4 nested under the framework). Medusa's zodValidator recognises a
// validation failure with `err instanceof ZodError` against *its* copy of the
// class, which never matches an error thrown by ours — so a rejected body
// escapes as an unhandled error and the client gets a 500 instead of a 400.
// Parsing in the route keeps the status codes honest. Revisit if the two
// installs are ever deduplicated.
//
// Reference: ai/todo.md Phase 3 §3.9 / Phase 5

import type {
	AuthenticatedMedusaRequest,
	MedusaResponse,
} from "@medusajs/framework";
import { MedusaError } from "@medusajs/framework/utils";
import { z } from "zod";
import { InquiryStatus } from "../../../../../modules/shopping-inquiry/models/inquiry";
import { updateShoppingInquiryWorkflow } from "../../../../../workflows/update-inquiry";

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const UpdateBodySchema = z
	.object({
		status: z
			.enum([
				InquiryStatus.NEW,
				InquiryStatus.REVIEWED,
				InquiryStatus.QUOTED,
				InquiryStatus.CLOSED,
				InquiryStatus.SPAM,
			])
			.optional(),

		admin_notes: z.string().max(5000).optional().nullable(),
	})
	// The only caller is our own admin drawer, so an unexpected field is a bug
	// worth surfacing rather than ignoring.
	.strict();

// ---------------------------------------------------------------------------
// POST /admin/shopping/inquiries/:id
// ---------------------------------------------------------------------------

export async function POST(
	req: AuthenticatedMedusaRequest,
	res: MedusaResponse,
): Promise<void> {
	const { id } = req.params as { id?: string };

	if (!id) {
		throw new MedusaError(
			MedusaError.Types.INVALID_DATA,
			"Inquiry ID is required",
		);
	}

	const bodyParse = UpdateBodySchema.safeParse(req.body);

	if (!bodyParse.success) {
		const firstError = bodyParse.error.errors[0];
		throw new MedusaError(
			MedusaError.Types.INVALID_DATA,
			firstError?.message ?? "Invalid update data",
		);
	}

	const { status, admin_notes } = bodyParse.data;

	const { result: inquiry } = await updateShoppingInquiryWorkflow(
		req.scope,
	).run({
		input: { id, status, admin_notes },
	});

	res.status(200).json({ inquiry });
}
