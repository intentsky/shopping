// apps/medusa/src/workflows/update-inquiry.ts
// updateShoppingInquiryWorkflow — admin status / notes change for one inquiry.
//
// A single-step workflow today. It exists as a workflow rather than a direct
// service call from the route so the change is compensatable and so any other
// caller (a bulk action, a scheduled auto-close job) gets the same behaviour.
//
// Reference: ai/todo.md Phase 3 §3.9 / Phase 5

import {
	createWorkflow,
	WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
	type UpdateInquiryStepInput,
	updateInquiryStep,
} from "./steps/update-inquiry";

export type UpdateShoppingInquiryWorkflowInput = UpdateInquiryStepInput;

export const updateShoppingInquiryWorkflow = createWorkflow(
	"update-shopping-inquiry",
	(input: UpdateShoppingInquiryWorkflowInput) => {
		const inquiry = updateInquiryStep(input);

		return new WorkflowResponse(inquiry);
	},
);

export default updateShoppingInquiryWorkflow;
