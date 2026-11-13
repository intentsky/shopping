// src/scripts/bootstrap.ts
// Runs at every start, after the migrations and before `medusa start`
// (start.sh):  npx medusa exec ./src/scripts/bootstrap.js
//
//   1. a Region exists (carts, prices and checkout need one)
//   2. a storefront (publishable) API key exists, linked to the default
//      sales channel
//   3. the engine is registered with its Intentsky Project, when
//      INTENTSKY_PROJECT_ID / INTENTSKY_CONNECT_TOKEN are set
//
// Idempotent and never fatal: a failure is logged and the shop still starts
// (the heartbeat job retries the registration). The admin user is created by
// start.sh with Medusa's own CLI (`medusa user`), from MEDUSA_ADMIN_EMAIL /
// MEDUSA_ADMIN_PASSWORD, only when no such user exists.

import type { ExecArgs } from "@medusajs/framework/types";
import { ensureRegion, logger, syncIntentsky } from "../lib/intentsky-sync";

export default async function bootstrap({ container }: ExecArgs): Promise<void> {
	const log = logger(container);
	try {
		const regionId = await ensureRegion(container);
		log.info(`[bootstrap] region ${regionId ?? "unavailable"}`);
	} catch (err) {
		log.error(`[bootstrap] region: ${err instanceof Error ? err.message : String(err)}`);
	}
	await syncIntentsky(container);
}
