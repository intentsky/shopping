// apps/medusa/src/workflows/steps/update-inquiry.ts
// Applies an admin status / notes change to one inquiry.
//
// The step reads the current row first — both to fail with a proper 404 for an
// unknown id and to capture the previous values, so compensation can put the
// record back exactly as it was.
//
// Reference: ai/todo.md Phase 3 §3.9 / Phase 5

import { MedusaError } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { SHOPPING_INQUIRY_MODULE } from "../../modules/shopping-inquiry";
import {
	InquiryStatus,
	type InquiryStatusValue,
} from "../../modules/shopping-inquiry/models/inquiry";
import type InquiryModuleService from "../../modules/shopping-inquiry/service/inquiry-module.service";
import type { InquiryRecord } from "../../modules/shopping-inquiry/service/inquiry-module.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UpdateInquiryStepInput = {
	id: string;
	status?: InquiryStatusValue;
	admin_notes?: string | null;
};

type UpdateInquiryCompensation = {
	id: string;
	status: InquiryStatusValue;
	admin_notes: string | null;
};

// ---------------------------------------------------------------------------
// Step
// ---------------------------------------------------------------------------

export const updateInquiryStep = createStep(
	"update-shopping-inquiry-record",
	async (input: UpdateInquiryStepInput, { container }) => {
		const { id, status, admin_notes } = input;

		// A no-op update would silently report success and bump updated_at.
		if (!status && admin_notes === undefined) {
			throw new MedusaError(
				MedusaError.Types.INVALID_DATA,
				"At least one of 'status' or 'admin_notes' must be provided",
			);
		}

		const inquiryService = container.resolve<InquiryModuleService>(
			SHOPPING_INQUIRY_MODULE,
		);

		let existing: InquiryRecord;
		try {
			existing = (await inquiryService.retrieveInquiry(id)) as InquiryRecord;
		} catch {
			throw new MedusaError(
				MedusaError.Types.NOT_FOUND,
				`Inquiry with id "${id}" not found`,
			);
		}

		// Status transitions go through the service's lifecycle helpers so the
		// rules for each transition live in one place.
		let updated: InquiryRecord;

		if (status === InquiryStatus.REVIEWED) {
			updated = await inquiryService.markAsReviewed(
				id,
				admin_notes ?? undefined,
			);
		} else if (status === InquiryStatus.QUOTED) {
			updated = await inquiryService.markAsQuoted(id, admin_notes ?? undefined);
		} else if (status === InquiryStatus.CLOSED) {
			updated = await inquiryService.markAsClosed(id, admin_notes ?? undefined);
		} else if (status === InquiryStatus.SPAM) {
			updated = await inquiryService.markAsSpam(id);
		} else {
			// status = new, or only admin_notes changed.
			updated = await inquiryService.updateOne(id, {
				...(status ? { status } : {}),
				...(admin_notes !== undefined ? { admin_notes } : {}),
			});
		}

		const compensation: UpdateInquiryCompensation = {
			id: existing.id,
			status: existing.status,
			admin_notes: existing.admin_notes,
		};

		return new StepResponse(updated, compensation);
	},
	async (previous: UpdateInquiryCompensation | undefined, { container }) => {
		if (!previous) {
			return;
		}

		const inquiryService = container.resolve<InquiryModuleService>(
			SHOPPING_INQUIRY_MODULE,
		);

		await inquiryService.updateOne(previous.id, {
			status: previous.status,
			admin_notes: previous.admin_notes,
		});
	},
);
