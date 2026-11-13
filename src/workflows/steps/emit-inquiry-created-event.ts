// apps/medusa/src/workflows/steps/emit-inquiry-created-event.ts
// Publishes `shopping.inquiry.created` after an inquiry has been persisted.
//
// Deliberately NOT core-flows' `emitEventStep`: that step throws, which would
// roll the create step back and delete a quote the customer has already been
// told we received. Notifying ourselves is best-effort by design — the inquiry
// row is the source of truth and is visible in the admin either way.
//
// The failure mode this replaces was real: the previous implementation resolved
// the event bus as "eventBusModuleService", a Medusa v2.0-era registration name.
// In 2.8 modules are registered under Modules.EVENT_BUS, so every emit threw
// and was swallowed by a catch — no inquiry ever produced an email. Resolving
// through the `Modules` constant means a future rename is a compile error.
//
// Reference: ai/todo.md Phase 5 §5.3

import type { IEventBusModuleService } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import {
	INQUIRY_CREATED_EVENT,
	type InquiryCreatedPayload,
} from "../../modules/shopping-inquiry/events";

export type EmitInquiryCreatedEventInput = InquiryCreatedPayload;

export const emitInquiryCreatedEventStep = createStep(
	"emit-shopping-inquiry-created-event",
	async (input: EmitInquiryCreatedEventInput, { container }) => {
		try {
			const eventBus = container.resolve<IEventBusModuleService>(
				Modules.EVENT_BUS,
			);

			await eventBus.emit<InquiryCreatedPayload>({
				name: INQUIRY_CREATED_EVENT,
				data: input,
			});
		} catch (error) {
			console.error(
				`[shopping/inquiry] Failed to emit ${INQUIRY_CREATED_EVENT} for ${input.ref} — the inquiry is saved, notifications were not sent:`,
				error,
			);
		}

		return new StepResponse(undefined);
	},
);
