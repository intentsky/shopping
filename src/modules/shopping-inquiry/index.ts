// apps/medusa/src/modules/shopping-inquiry/index.ts
// Intentsky Shopping — inquiry (RFQ) module. Entry point for the Medusa v2
// module system.
//
// This module is tenant-neutral. ZLFasteners is its first consumer, but nothing
// here is specific to it — tenant branding lives in src/lib/tenant.ts.
//
// Registers the Inquiry entity and InquiryModuleService with the
// Medusa framework so they are available via:
//
//   container.resolve(SHOPPING_INQUIRY_MODULE)
//
// Usage in API routes:
//   import { SHOPPING_INQUIRY_MODULE } from "../modules/shopping-inquiry";
//   import type InquiryModuleService from "../modules/shopping-inquiry/service/inquiry-module.service";
//
//   const inquiryService = req.scope.resolve<InquiryModuleService>(SHOPPING_INQUIRY_MODULE);
//
// Reference: ai/todo.md Phase 3 §3.9 / Phase 5

import { Module } from "@medusajs/framework/utils";
import InquiryModuleService from "./service/inquiry-module.service";

// ---------------------------------------------------------------------------
// Module identifier — used as the DI container key
// ---------------------------------------------------------------------------

export const SHOPPING_INQUIRY_MODULE = "shoppingInquiryModuleService";

// ---------------------------------------------------------------------------
// Module definition
// ---------------------------------------------------------------------------

export default Module(SHOPPING_INQUIRY_MODULE, {
	service: InquiryModuleService,
});
