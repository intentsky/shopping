// apps/medusa/src/workflows/steps/validate-inquiry-submission.ts
// Business validation for a public inquiry submission.
//
// Everything here needs either cross-field reasoning or a database read, so it
// belongs in a workflow step rather than in the API route (see the
// building-with-medusa skill, `logic-workflow-validation`).
//
// Read-only — no compensation function, nothing to roll back.
//
// Reference: ai/todo.md Phase 5 §5.3

import { MedusaError } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { SHOPPING_INQUIRY_MODULE } from "../../modules/shopping-inquiry";
import {
	ContactMethod,
	type ContactMethodValue,
} from "../../modules/shopping-inquiry/models/inquiry";
import type InquiryModuleService from "../../modules/shopping-inquiry/service/inquiry-module.service";

// ---------------------------------------------------------------------------
// Rate limit
// ---------------------------------------------------------------------------

/** Max submissions accepted per IP hash per rolling 24h window. */
export const RATE_LIMIT_MAX = 3;

const RATE_LIMIT_WINDOW_LABEL = "24 hours";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ValidateInquirySubmissionInput = {
	contact_method: ContactMethodValue;
	email?: string | null;
	whatsapp?: string | null;
	/** SHA-256 hash of the submitter's IP — the rate-limit bucket key. */
	ip_hash: string;
	/** Honeypot field. Populated only by bots; absent in real submissions. */
	website?: string | null;
};

export type ValidateInquirySubmissionOutput = {
	is_spam: boolean;
};

// ---------------------------------------------------------------------------
// Step
// ---------------------------------------------------------------------------

export const validateInquirySubmissionStep = createStep(
	"validate-inquiry-submission",
	async (input: ValidateInquirySubmissionInput, { container }) => {
		// ── Contact method must carry a usable address ───────────────────────
		if (input.contact_method === ContactMethod.EMAIL && !input.email) {
			throw new MedusaError(
				MedusaError.Types.INVALID_DATA,
				"Email address is required when contact method is 'email'",
			);
		}

		if (input.contact_method === ContactMethod.WHATSAPP && !input.whatsapp) {
			throw new MedusaError(
				MedusaError.Types.INVALID_DATA,
				"WhatsApp number is required when contact method is 'whatsapp'",
			);
		}

		if (!input.email && !input.whatsapp) {
			throw new MedusaError(
				MedusaError.Types.INVALID_DATA,
				"At least one contact method (email or WhatsApp) is required",
			);
		}

		// ── Honeypot ─────────────────────────────────────────────────────────
		// A bot that fills in every field populates `website`. Such submissions
		// are accepted with a normal 201 (never tell a bot it was detected) but
		// are stored as spam and skip the notification emails.
		const isSpam =
			typeof input.website === "string" && input.website.trim().length > 0;

		// ── Rate limit ───────────────────────────────────────────────────────
		// Only enforced for non-honeypot submissions: a bot that has already
		// been classified must not be able to consume a real visitor's quota.
		if (!isSpam) {
			const inquiryService = container.resolve<InquiryModuleService>(
				SHOPPING_INQUIRY_MODULE,
			);

			const recentCount = await inquiryService.countByIpHash(input.ip_hash);

			if (recentCount >= RATE_LIMIT_MAX) {
				throw new MedusaError(
					MedusaError.Types.NOT_ALLOWED,
					`Rate limit exceeded. Maximum ${RATE_LIMIT_MAX} inquiries per ${RATE_LIMIT_WINDOW_LABEL} per IP address. Please contact us directly via WhatsApp or email if you need to submit more inquiries.`,
				);
			}
		}

		const output: ValidateInquirySubmissionOutput = { is_spam: isSpam };
		return new StepResponse(output);
	},
);
