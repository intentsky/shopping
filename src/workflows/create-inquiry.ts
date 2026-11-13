// apps/medusa/src/workflows/create-inquiry.ts
// createShoppingInquiryWorkflow — the whole lifecycle of a pre-sale inquiry
// submission, from business validation to the notification event.
//
// The API route above it only does transport work: parse the body and derive
// the IP hash. Everything that decides whether a submission is acceptable, what
// gets stored, and who gets told about it lives here, so the flow is identical
// for every caller (the /store/shopping/inquiry route, its deprecated
// /store/zlf/inquiry alias, and any future importer or replay tool).
//
// Reference: ai/todo.md Phase 5 §5.3

import {
	createWorkflow,
	transform,
	WorkflowResponse,
	when,
} from "@medusajs/framework/workflows-sdk";
import {
	type ContactMethodValue,
	InquiryStatus,
	type QuantityUnitValue,
	type SupportedLocaleValue,
} from "../modules/shopping-inquiry/models/inquiry";
import type { CreateInquiryInput } from "../modules/shopping-inquiry/service/inquiry-module.service";
import { createInquiryStep } from "./steps/create-inquiry";
import { emitInquiryCreatedEventStep } from "./steps/emit-inquiry-created-event";
import { validateInquirySubmissionStep } from "./steps/validate-inquiry-submission";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type CreateShoppingInquiryWorkflowInput = {
	name: string;
	description: string;
	contact_method: ContactMethodValue;
	email?: string | null;
	whatsapp?: string | null;
	material?: string | null;
	quantity?: string | null;
	quantity_unit: QuantityUnitValue;
	country?: string | null;
	special?: string | null;
	product_slug?: string | null;
	locale: SupportedLocaleValue;
	/** Honeypot field — see validateInquirySubmissionStep. */
	website?: string | null;
	/** SHA-256 hash of the submitter's IP, derived by the API route. */
	ip_hash: string;
};

// ---------------------------------------------------------------------------
// Strip HTML
// ---------------------------------------------------------------------------

/**
 * Removes HTML tags from a string.
 *
 * Not a full sanitiser — a safety net so stored text is inert wherever it is
 * later rendered (admin drawer, notification emails, the Intentsky console).
 */
function stripHtml(input: string): string {
	return input.replace(/<[^>]*>/g, "").replace(/&[a-z]+;/gi, " ");
}

function stripOptional(input: string | null | undefined): string | null {
	return input ? stripHtml(input) : null;
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export const createShoppingInquiryWorkflow = createWorkflow(
	"create-shopping-inquiry",
	(input: CreateShoppingInquiryWorkflowInput) => {
		const validation = validateInquirySubmissionStep(
			transform({ input }, (data) => ({
				contact_method: data.input.contact_method,
				email: data.input.email,
				whatsapp: data.input.whatsapp,
				ip_hash: data.input.ip_hash,
				website: data.input.website,
			})),
		);

		// Sanitise and pick the initial status in one place, so a honeypot hit
		// is written as spam by the same single insert as a real submission
		// rather than created and then updated.
		const createInput = transform(
			{ input, validation },
			(data): CreateInquiryInput => ({
				status: data.validation.is_spam
					? InquiryStatus.SPAM
					: InquiryStatus.NEW,
				customer_name: stripHtml(data.input.name),
				customer_email: stripOptional(data.input.email),
				whatsapp: stripOptional(data.input.whatsapp),
				contact_method: data.input.contact_method,
				product_desc: stripHtml(data.input.description),
				material: stripOptional(data.input.material),
				quantity: stripOptional(data.input.quantity),
				quantity_unit: data.input.quantity_unit,
				country: data.input.country ?? null,
				special: stripOptional(data.input.special),
				product_slug: data.input.product_slug ?? null,
				locale: data.input.locale,
				ip_hash: data.input.ip_hash,
			}),
		);

		const inquiry = createInquiryStep(createInput);

		// Spam is stored but never announced — no confirmation to the bot, no
		// notification to the owner.
		when({ validation }, (data) => !data.validation.is_spam).then(() => {
			emitInquiryCreatedEventStep(
				transform({ inquiry }, (data) => ({
					id: data.inquiry.id,
					ref: data.inquiry.ref,
					customer_name: data.inquiry.customer_name,
					customer_email: data.inquiry.customer_email,
					whatsapp: data.inquiry.whatsapp,
					contact_method: data.inquiry.contact_method,
					product_desc: data.inquiry.product_desc,
					quantity: data.inquiry.quantity,
					quantity_unit: data.inquiry.quantity_unit,
					country: data.inquiry.country,
					locale: data.inquiry.locale,
					product_slug: data.inquiry.product_slug,
				})),
			);
		});

		return new WorkflowResponse(inquiry);
	},
);

export default createShoppingInquiryWorkflow;
