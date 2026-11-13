// apps/medusa/src/workflows/steps/create-inquiry.ts
// Writes one inquiry row. The only mutation in the create workflow.
//
// Compensation deletes the row again, so a failure in a later step cannot
// leave an orphaned inquiry behind.
//
// Reference: ai/todo.md Phase 5 §5.3

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { SHOPPING_INQUIRY_MODULE } from "../../modules/shopping-inquiry";
import type InquiryModuleService from "../../modules/shopping-inquiry/service/inquiry-module.service";
import type {
	CreateInquiryInput,
	InquiryRecord,
} from "../../modules/shopping-inquiry/service/inquiry-module.service";

export type CreateInquiryStepInput = CreateInquiryInput;

export const createInquiryStep = createStep(
	"create-shopping-inquiry",
	async (input: CreateInquiryStepInput, { container }) => {
		const inquiryService = container.resolve<InquiryModuleService>(
			SHOPPING_INQUIRY_MODULE,
		);

		const inquiry: InquiryRecord = await inquiryService.createWithRef(input);

		return new StepResponse(inquiry, inquiry.id);
	},
	async (id: string | undefined, { container }) => {
		if (!id) {
			return;
		}

		const inquiryService = container.resolve<InquiryModuleService>(
			SHOPPING_INQUIRY_MODULE,
		);

		await inquiryService.deleteInquiries(id);
	},
);
