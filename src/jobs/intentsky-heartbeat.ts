// src/jobs/intentsky-heartbeat.ts
// Re-registers this engine with its Intentsky Project a few times a day, so
// the console's "last seen" stays current and a changed public domain is
// picked up. No-op when the deployment is not bound to a Project.

import type { MedusaContainer } from "@medusajs/framework/types";
import { intentskyConfig } from "../lib/intentsky";
import { syncIntentsky } from "../lib/intentsky-sync";

export default async function intentskyHeartbeat(container: MedusaContainer): Promise<void> {
	if (!intentskyConfig()) return;
	await syncIntentsky(container);
}

export const config = {
	name: "intentsky-heartbeat",
	// Minute 17 of every 6th hour, plus the boot-time run in scripts/bootstrap.ts.
	schedule: "17 */6 * * *",
};
